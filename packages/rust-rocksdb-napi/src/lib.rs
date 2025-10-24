use napi::bindgen_prelude::*;
use napi_derive::napi;
use rocksdb::{Options, IteratorMode, DBWithThreadMode, MultiThreaded, WriteBatch};
use std::sync::Arc;

#[napi(object)]
pub struct KeyValue {
    pub key: Buffer,
    pub value: Buffer,
}

#[napi]
pub struct SegmentedLog {
    db: Option<Arc<DBWithThreadMode<MultiThreaded>>>,
    sequence: std::sync::atomic::AtomicI64,
}

#[napi]
impl SegmentedLog {
    #[napi(constructor)]
    pub fn new(path: String, enable_compression: Option<bool>) -> Result<Self> {
        let mut opts = Options::default();
        opts.create_if_missing(true);

        // Compression configuration
        if enable_compression.unwrap_or(true) {
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
            opts.set_bottommost_compression_options(-1, -1, -1, 32 * 1024, true);
        } else {
            opts.set_compression_type(rocksdb::DBCompressionType::None);
        }

        opts.set_write_buffer_size(64 * 1024 * 1024);
        opts.set_allow_concurrent_memtable_write(true);
        opts.set_enable_write_thread_adaptive_yield(true);
     
        // Optimizations for append-only workloads
        opts.set_level_zero_file_num_compaction_trigger(4);
        opts.set_level_zero_slowdown_writes_trigger(20);
        opts.set_level_zero_stop_writes_trigger(30);
        opts.set_max_background_jobs(4);
        opts.set_max_subcompactions(2);

        let db = DBWithThreadMode::<MultiThreaded>::open(&opts, path)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        let next_sequence = {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                let key_bytes: [u8; 8] = key.as_ref().try_into()
                    .map_err(|_| Error::from_reason("Invalid key format".to_string()))?;
                i64::from_be_bytes(key_bytes) + 1
            } else {
                1
            }
        };

        Ok(Self {
            db: Some(Arc::new(db)),
            sequence: std::sync::atomic::AtomicI64::new(next_sequence),
        })
    }

    #[napi(factory)]
    pub fn open_read_only(path: String, enable_compression: Option<bool>) -> Result<Self> {
        let mut opts = Options::default();

        if enable_compression.unwrap_or(true) {
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
            opts.set_bottommost_compression_options(-1, -1, -1, 32 * 1024, true);
        } else {
            opts.set_compression_type(rocksdb::DBCompressionType::None);
        }

        let db = DBWithThreadMode::<MultiThreaded>::open_for_read_only(&opts, path, false)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        let next_sequence = {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                let key_bytes: [u8; 8] = key.as_ref().try_into()
                    .map_err(|_| Error::from_reason("Invalid key format".to_string()))?;
                i64::from_be_bytes(key_bytes) + 1
            } else {
                1
            }
        };

        Ok(Self {
            db: Some(Arc::new(db)),
            sequence: std::sync::atomic::AtomicI64::new(next_sequence),
        })
    }

    #[napi(factory)]
    pub fn open_as_secondary(
        primary_path: String,
        secondary_path: String,
        enable_compression: Option<bool>,
    ) -> Result<Self> {
        let mut opts = Options::default();
        opts.set_max_open_files(-1);

        if enable_compression.unwrap_or(true) {
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
            opts.set_bottommost_compression_options(-1, -1, -1, 32 * 1024, true);
        } else {
            opts.set_compression_type(rocksdb::DBCompressionType::None);
        }

        let db = DBWithThreadMode::<MultiThreaded>::open_as_secondary(&opts, primary_path, secondary_path)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        let next_sequence = {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                let key_bytes: [u8; 8] = key.as_ref().try_into()
                    .map_err(|_| Error::from_reason("Invalid key format".to_string()))?;
                i64::from_be_bytes(key_bytes) + 1
            } else {
                1
            }
        };

        Ok(Self {
            db: Some(Arc::new(db)),
            sequence: std::sync::atomic::AtomicI64::new(next_sequence),
        })
    }

    #[napi]
    pub fn try_catch_up_with_primary(&self) -> Result<()> {
        let db = self.get_db()?;
        db.try_catch_up_with_primary()
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    fn get_db(&self) -> Result<&Arc<DBWithThreadMode<MultiThreaded>>> {
        self.db
            .as_ref()
            .ok_or_else(|| Error::from_reason("Database is closed".to_string()))
    }

    #[napi]
    pub fn close(&mut self) -> Result<()> {
        if let Some(db) = self.db.take() {
            db.flush()
                .map_err(|e| Error::from_reason(e.to_string()))?;
            db.cancel_all_background_work(true);
            
            if let Ok(db_owned) = Arc::try_unwrap(db) {
                drop(db_owned);
            }
        }
        Ok(())
    }

    #[napi]
    pub fn append(&self, message: Buffer) -> Result<Buffer> {
        let db = self.get_db()?;
        let id = self.sequence.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        let key = id.to_be_bytes();
        db.put(&key, message.as_ref())
            .map_err(|e| Error::from_reason(e.to_string()))?;

        Ok(key.to_vec().into())
    }

    #[napi]
    pub fn append_batch(&self, messages: Vec<Buffer>) -> Result<Vec<Buffer>> {
        let db = self.get_db()?;
        let mut batch = WriteBatch::default();
        let mut keys = Vec::with_capacity(messages.len());

        let start_id = self.sequence.fetch_add(messages.len() as i64, std::sync::atomic::Ordering::SeqCst);
        
        for (index, message) in messages.iter().enumerate() {
            let id = start_id + index as i64;
            let key = id.to_be_bytes();
            batch.put(&key, message.as_ref());
            keys.push(key.to_vec().into());
        }

        db.write(batch)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        Ok(keys)
    }

    #[napi]
    pub fn put(&self, id: i64, value: Buffer) -> Result<()> {
        let db = self.get_db()?;
        db.put(&id.to_be_bytes(), value.as_ref())
            .map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(())
    }

    #[napi]
    pub fn iterate_from(&self, start_id: Option<i64>) -> Result<SegmentedLogIterator> {
        let db = self.get_db()?;
        let start = start_id
            .map(|id| id.to_be_bytes().to_vec())
            .unwrap_or_else(|| i64::MIN.to_be_bytes().to_vec());
    
        Ok(SegmentedLogIterator::new(db.clone(), start))
    }

    #[napi]
    pub fn truncate_before(&self, id: i64) -> Result<()> {
        let db = self.get_db()?;
        let mut batch = WriteBatch::default();

        let start_key = i64::MIN.to_be_bytes();
        let end_key = id.to_be_bytes();

        batch.delete_range(start_key, end_key);
        db.write(batch)
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn read_last(&self, count: Option<u32>) -> Result<Vec<KeyValue>> {
        let db = self.get_db()?;
        let limit = count.unwrap_or(1) as usize;

        let iter = db.iterator(IteratorMode::End);
        let mut results = Vec::new();

        for item in iter.take(limit) {
            if let Ok((key, value)) = item {
                results.push(KeyValue {
                    key: key.to_vec().into(),
                    value: value.to_vec().into(),
                });
            }
        }

        results.reverse();
        Ok(results)
    }

    #[napi]
    pub fn get_last_key(&self) -> Result<Option<Buffer>> {
        let db = self.get_db()?;
        let mut iter = db.iterator(IteratorMode::End);
        if let Some(Ok((key, _))) = iter.next() {
            return Ok(Some(key.to_vec().into()));
        }
        Ok(None)
    }
}

#[napi]
pub struct SegmentedLogIterator {
    db: Option<Arc<DBWithThreadMode<MultiThreaded>>>,
    current_batch: Vec<(Vec<u8>, Vec<u8>)>,
    batch_index: usize,
    last_key: Option<Vec<u8>>,
    finished: bool,
}

#[napi]
impl SegmentedLogIterator {
    fn new(db: Arc<DBWithThreadMode<MultiThreaded>>, start_key: Vec<u8>) -> Self {
        let mut iter = Self {
            db: Some(db),
            current_batch: Vec::new(),
            batch_index: 0,
            last_key: Some(start_key),
            finished: false,
        };
        iter.load_next_batch();
        iter
    }

    fn load_next_batch(&mut self) {
        if self.finished {
            return;
        }

        let db = match &self.db {
            Some(db) => db,
            None => {
                self.finished = true;
                return;
            }
        };

        self.current_batch.clear();
        self.batch_index = 0;
        let start = self.last_key.clone().unwrap_or_else(|| vec![]);
        let iter = db.iterator(IteratorMode::From(&start, rocksdb::Direction::Forward));

        let mut count = 0;
        for item in iter {
            match item {
                Ok((key, value)) => {
                    if count >= 1000 { // batch size limit
                        self.last_key = Some(key.to_vec());
                        return;
                    }
                    self.current_batch.push((key.to_vec(), value.to_vec()));
                    count += 1;
                }
                Err(_) => continue,
            }
        }

        self.finished = true;
    }

    #[napi]
    pub fn next(&mut self) -> Option<KeyValue> {
        if self.batch_index >= self.current_batch.len() && !self.finished {
            self.load_next_batch();
        }

        if self.batch_index < self.current_batch.len() {
            let (key, value) = &self.current_batch[self.batch_index];
            self.batch_index += 1;
            Some(KeyValue {
                key: key.clone().into(),
                value: value.clone().into(),
            })
        } else {
            None
        }
    }

    #[napi]
    pub fn has_next(&self) -> bool {
        self.batch_index < self.current_batch.len() || !self.finished
    }

    #[napi]
    pub fn close(&mut self) {
        self.db = None;
        self.current_batch.clear();
        self.batch_index = 0;
        self.finished = true;
        self.last_key = None;
    }
}
