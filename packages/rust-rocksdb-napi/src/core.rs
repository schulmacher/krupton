use rocksdb::{DBWithThreadMode, Direction, IteratorMode, MultiThreaded, Options, WriteBatch};
use std::sync::Arc;

pub type CoreResult<T> = Result<T, String>;

pub struct CoreKeyValue {
    pub key: Vec<u8>,
    pub value: Vec<u8>,
}

pub struct CoreSegmentedLog {
    db: Option<Arc<DBWithThreadMode<MultiThreaded>>>,
    sequence: std::sync::atomic::AtomicI64,
}

impl CoreSegmentedLog {
    pub fn new(path: String, enable_compression: Option<bool>) -> CoreResult<Self> {
        let mut opts = Options::default();
        opts.create_if_missing(true);

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

        opts.set_level_zero_file_num_compaction_trigger(4);
        opts.set_level_zero_slowdown_writes_trigger(20);
        opts.set_level_zero_stop_writes_trigger(30);
        opts.set_max_background_jobs(4);
        opts.set_max_subcompactions(2);

        let db = DBWithThreadMode::<MultiThreaded>::open(&opts, path)
            .map_err(|e| e.to_string())?;

        let next_sequence = {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                let key_bytes: [u8; 8] = key
                    .as_ref()
                    .try_into()
                    .map_err(|_| "Invalid key format".to_string())?;
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

    pub fn open_read_only(path: String, enable_compression: Option<bool>) -> CoreResult<Self> {
        let mut opts = Options::default();

        if enable_compression.unwrap_or(true) {
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
            opts.set_bottommost_compression_options(-1, -1, -1, 32 * 1024, true);
        } else {
            opts.set_compression_type(rocksdb::DBCompressionType::None);
        }

        let db = DBWithThreadMode::<MultiThreaded>::open_for_read_only(&opts, path, false)
            .map_err(|e| e.to_string())?;

        let next_sequence = {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                let key_bytes: [u8; 8] = key
                    .as_ref()
                    .try_into()
                    .map_err(|_| "Invalid key format".to_string())?;
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

    pub fn open_as_secondary(
        primary_path: String,
        secondary_path: String,
        enable_compression: Option<bool>,
    ) -> CoreResult<Self> {
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
            .map_err(|e| e.to_string())?;

        let next_sequence = {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                let key_bytes: [u8; 8] = key
                    .as_ref()
                    .try_into()
                    .map_err(|_| "Invalid key format".to_string())?;
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

    pub fn try_catch_up_with_primary(&self) -> CoreResult<()> {
        let db = self.get_db()?;
        db.try_catch_up_with_primary().map_err(|e| e.to_string())
    }

    pub fn close(&mut self) -> CoreResult<()> {
        if let Some(db) = self.db.take() {
            db.flush().map_err(|e| e.to_string())?;
            db.cancel_all_background_work(true);
            if let Ok(db_owned) = Arc::try_unwrap(db) {
                drop(db_owned);
            }
        }
        Ok(())
    }

    pub fn append(&self, message: &[u8]) -> CoreResult<Vec<u8>> {
        let db = self.get_db()?;
        let id = self
            .sequence
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let key = id.to_be_bytes();
        db.put(&key, message).map_err(|e| e.to_string())?;
        Ok(key.to_vec())
    }

    pub fn append_batch(&self, messages: Vec<Vec<u8>>) -> CoreResult<Vec<Vec<u8>>> {
        let db = self.get_db()?;
        let mut batch = WriteBatch::default();
        let mut keys = Vec::with_capacity(messages.len());

        let start_id = self
            .sequence
            .fetch_add(messages.len() as i64, std::sync::atomic::Ordering::SeqCst);

        for (index, message) in messages.iter().enumerate() {
            let id = start_id + index as i64;
            let key = id.to_be_bytes();
            batch.put(&key, message.as_slice());
            keys.push(key.to_vec());
        }

        db.write(batch).map_err(|e| e.to_string())?;
        Ok(keys)
    }

    pub fn put(&self, id: i64, value: &[u8]) -> CoreResult<()> {
        let db = self.get_db()?;
        db.put(&id.to_be_bytes(), value).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn iterate_from(
        &self,
        start_id: Option<i64>,
        batch_size: Option<usize>,
    ) -> CoreResult<CoreSegmentedLogIterator> {
        let db = self.get_db()?.clone();
        let start = start_id
            .map(|id| id.to_be_bytes().to_vec())
            .unwrap_or_else(|| i64::MIN.to_be_bytes().to_vec());
        Ok(CoreSegmentedLogIterator::new(db, start, batch_size))
    }

    pub fn truncate_before(&self, id: i64) -> CoreResult<()> {
        let db = self.get_db()?;
        let mut batch = WriteBatch::default();
        let start_key = i64::MIN.to_be_bytes();
        let end_key = id.to_be_bytes();
        batch.delete_range(start_key, end_key);
        db.write(batch).map_err(|e| e.to_string())
    }

    pub fn read_last(&self, count: Option<u32>) -> CoreResult<Vec<CoreKeyValue>> {
        let db = self.get_db()?;
        let limit = count.unwrap_or(1) as usize;
        let iter = db.iterator(IteratorMode::End);
        let mut results = Vec::new();
        for item in iter.take(limit) {
            if let Ok((key, value)) = item {
                results.push(CoreKeyValue {
                    key: key.to_vec(),
                    value: value.to_vec(),
                });
            }
        }
        results.reverse();
        Ok(results)
    }

    pub fn get_last_key(&self) -> CoreResult<Option<Vec<u8>>> {
        let db = self.get_db()?;
        let mut iter = db.iterator(IteratorMode::End);
        if let Some(Ok((key, _))) = iter.next() {
            return Ok(Some(key.to_vec()));
        }
        Ok(None)
    }

    fn get_db(&self) -> CoreResult<&Arc<DBWithThreadMode<MultiThreaded>>> {
        self.db
            .as_ref()
            .ok_or_else(|| "Database is closed".to_string())
    }
}

pub struct CoreSegmentedLogIterator {
    db: Option<Arc<DBWithThreadMode<MultiThreaded>>>,
    current_batch: Vec<(Vec<u8>, Vec<u8>)>,
    batch_index: usize,
    last_key: Option<Vec<u8>>,
    finished: bool,
    batch_size: usize,
}

impl CoreSegmentedLogIterator {
    fn new(
        db: Arc<DBWithThreadMode<MultiThreaded>>,
        start_key: Vec<u8>,
        batch_size: Option<usize>,
    ) -> Self {
        let mut iter = Self {
            db: Some(db),
            current_batch: Vec::new(),
            batch_index: 0,
            last_key: Some(start_key),
            finished: false,
            batch_size: batch_size.unwrap_or(1000),
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
        let iter = db.iterator(IteratorMode::From(&start, Direction::Forward));

        let mut count = 0;
        for item in iter {
            match item {
                Ok((key, value)) => {
                    if count >= self.batch_size {
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

    pub fn next(&mut self) -> Option<CoreKeyValue> {
        if self.batch_index >= self.current_batch.len() && !self.finished {
            self.load_next_batch();
        }
        if self.batch_index < self.current_batch.len() {
            let (key, value) = &self.current_batch[self.batch_index];
            self.batch_index += 1;
            Some(CoreKeyValue {
                key: key.clone(),
                value: value.clone(),
            })
        } else {
            None
        }
    }

    pub fn next_batch(&mut self) -> Vec<CoreKeyValue> {
        if self.batch_index >= self.current_batch.len() && !self.finished {
            self.load_next_batch();
        }
        let mut out = Vec::with_capacity(self.current_batch.len().saturating_sub(self.batch_index));
        while self.batch_index < self.current_batch.len() {
            let (key, value) = &self.current_batch[self.batch_index];
            self.batch_index += 1;
            out.push(CoreKeyValue { key: key.clone(), value: value.clone() });
        }
        out
    }

    pub fn has_next(&self) -> bool {
        self.batch_index < self.current_batch.len() || !self.finished
    }

    pub fn close(&mut self) {
        self.db = None;
        self.current_batch.clear();
        self.batch_index = 0;
        self.finished = true;
        self.last_key = None;
    }
}


