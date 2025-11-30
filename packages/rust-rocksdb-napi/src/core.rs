use rocksdb::{BlockBasedOptions, Cache, DBWithThreadMode, Direction, IteratorMode, MultiThreaded, Options, WriteBatch};
use std::sync::Arc;

pub type CoreResult<T> = Result<T, String>;

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

        // 🧠 memory + concurrency
        opts.set_write_buffer_size(8 * 1024 * 1024);          // 8 MB memtable
        opts.set_max_write_buffer_number(2);                 // ≤ 16 MB total
        opts.set_max_background_jobs(1);                     // 1 compaction thread
        opts.set_max_subcompactions(1);                      // no parallel compaction
        opts.set_allow_concurrent_memtable_write(false);     // serialize writes
        opts.set_enable_write_thread_adaptive_yield(true);

        // 🧱 level-0 management
        opts.set_level_zero_file_num_compaction_trigger(2);
        opts.set_level_zero_slowdown_writes_trigger(8);
        opts.set_level_zero_stop_writes_trigger(12);

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
        
        let lru = Cache::new_lru_cache(32 * 1024 * 1024);

        let mut bbo = BlockBasedOptions::default();
        bbo.set_block_cache(&lru);
        bbo.set_cache_index_and_filter_blocks(true);
        bbo.set_pin_top_level_index_and_filter(true);
        bbo.set_pin_l0_filter_and_index_blocks_in_cache(true);
        opts.set_block_based_table_factory(&bbo);

        // Compression settings only affect reads of existing data.
        if enable_compression.unwrap_or(true) {
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
            opts.set_bottommost_compression_options(-1, -1, -1, 32 * 1024, true);
        } else {
            opts.set_compression_type(rocksdb::DBCompressionType::None);
        }

        // Limit file handles; default “infinite” can increase RSS via table cache
        opts.set_max_open_files(512);

        // Linux-only (macOS ignores): bypass OS page cache to stabilize RSS
        opts.set_use_direct_reads(true);

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
            db: Some(std::sync::Arc::new(db)),
            sequence: std::sync::atomic::AtomicI64::new(next_sequence),
        })
    }

    pub fn open_as_secondary(
        primary_path: String,
        secondary_path: String,
        enable_compression: Option<bool>,
    ) -> CoreResult<Self> {
        let mut opts = Options::default();

        let lru = Cache::new_lru_cache(32 * 1024 * 1024);

        let mut bbo = BlockBasedOptions::default();
        bbo.set_block_cache(&lru);
        bbo.set_cache_index_and_filter_blocks(true);
        bbo.set_pin_top_level_index_and_filter(true);
        bbo.set_pin_l0_filter_and_index_blocks_in_cache(true);
        opts.set_block_based_table_factory(&bbo);

        // Compression settings only affect reads of existing data.
        if enable_compression.unwrap_or(true) {
            opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
            opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
            opts.set_bottommost_compression_options(-1, -1, -1, 32 * 1024, true);
        } else {
            opts.set_compression_type(rocksdb::DBCompressionType::None);
        }

        // Limit file handles; default “infinite” can increase RSS via table cache
        opts.set_max_open_files(512);

        // Linux-only (macOS ignores): bypass OS page cache to stabilize RSS
        opts.set_use_direct_reads(true);

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

    pub fn append_batch(&self, messages: &[&[u8]]) -> CoreResult<Vec<Vec<u8>>> {
        let db = self.get_db()?;
        let mut batch = WriteBatch::default();
        let mut keys = Vec::with_capacity(messages.len());

        let start_id = self
            .sequence
            .fetch_add(messages.len() as i64, std::sync::atomic::Ordering::SeqCst);

        for (index, message) in messages.iter().enumerate() {
            let id = start_id + index as i64;
            let key = id.to_be_bytes();
            batch.put(&key, message);
            keys.push(key.to_vec());
        }

        db.write(batch).map_err(|e| e.to_string())?;
        Ok(keys)
    }

    pub fn put(&self, key: &[u8], value: &[u8]) -> CoreResult<()> {
        let db = self.get_db()?;
        db.put(key, value).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn iterate_from(
        &self,
        start_key: Option<&[u8]>,
        batch_size: Option<usize>,
    ) -> CoreResult<CoreSegmentedLogIterator> {
        let db = self.get_db()?.clone();
        let start = start_key
            .map(|key| key.to_vec())
            .unwrap_or_else(|| vec![]);
        Ok(CoreSegmentedLogIterator::new(db, start, batch_size, Direction::Forward))
    }

    pub fn iterate_from_end(
        &self,
        start_key: Option<&[u8]>,
        batch_size: Option<usize>,
    ) -> CoreResult<CoreSegmentedLogIterator> {
        let db = self.get_db()?.clone();
        let start = if let Some(key) = start_key {
            key.to_vec()
        } else {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                key.to_vec()
            } else {
                vec![]
            }
        };
        Ok(CoreSegmentedLogIterator::new(db, start, batch_size, Direction::Reverse))
    }

    pub fn truncate_before(&self, before_key: &[u8]) -> CoreResult<()> {
        let db = self.get_db()?;
        let mut batch = WriteBatch::default();
        let start: &[u8] = &[];
        batch.delete_range(start, before_key);
        db.write(batch).map_err(|e| e.to_string())
    }

    pub fn read_last(&self, count: Option<u32>) -> CoreResult<Vec<(Vec<u8>, Vec<u8>)>> {
        let db = self.get_db()?;
        let limit = count.unwrap_or(1) as usize;
        let iter = db.iterator(IteratorMode::End);
        let mut results = Vec::new();
        for item in iter.take(limit) {
            if let Ok((key, value)) = item {
                results.push((key.to_vec(), value.to_vec()));
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

pub struct CoreRocksDb {
    db: Option<Arc<DBWithThreadMode<MultiThreaded>>>,
}

impl CoreRocksDb {
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

        opts.set_write_buffer_size(256 * 1024 * 1024);

        opts.set_level_zero_file_num_compaction_trigger(4);
        opts.set_level_zero_slowdown_writes_trigger(8);
        opts.set_level_zero_stop_writes_trigger(12);
        opts.set_max_background_jobs(2);

        let db = DBWithThreadMode::<MultiThreaded>::open(&opts, path)
            .map_err(|e| e.to_string())?;

        Ok(Self {
            db: Some(Arc::new(db)),
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

        Ok(Self {
            db: Some(Arc::new(db)),
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

    pub fn put(&self, key: &[u8], value: &[u8]) -> CoreResult<()> {
        let db = self.get_db()?;
        db.put(key, value).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn iterate_from(
        &self,
        start_key: Option<&[u8]>,
        batch_size: Option<usize>,
    ) -> CoreResult<CoreSegmentedLogIterator> {
        let db = self.get_db()?.clone();
        let start = start_key
            .map(|key| key.to_vec())
            .unwrap_or_else(|| vec![]);
        Ok(CoreSegmentedLogIterator::new(db, start, batch_size, Direction::Forward))
    }

    pub fn iterate_from_end(
        &self,
        start_key: Option<&[u8]>,
        batch_size: Option<usize>,
    ) -> CoreResult<CoreSegmentedLogIterator> {
        let db = self.get_db()?.clone();
        let start = if let Some(key) = start_key {
            key.to_vec()
        } else {
            let mut iter = db.iterator(IteratorMode::End);
            if let Some(Ok((key, _))) = iter.next() {
                key.to_vec()
            } else {
                vec![]
            }
        };
        Ok(CoreSegmentedLogIterator::new(db, start, batch_size, Direction::Reverse))
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
    direction: Direction,
}

impl CoreSegmentedLogIterator {
    fn new(
        db: Arc<DBWithThreadMode<MultiThreaded>>,
        start_key: Vec<u8>,
        batch_size: Option<usize>,
        direction: Direction,
    ) -> Self {
        let mut iter = Self {
            db: Some(db),
            current_batch: Vec::new(),
            batch_index: 0,
            last_key: Some(start_key),
            finished: false,
            batch_size: batch_size.unwrap_or(1000),
            direction,
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
        let iter = db.iterator(IteratorMode::From(&start, self.direction));

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

    pub fn next(&mut self) -> Option<(&[u8], &[u8])> {
        if self.batch_index >= self.current_batch.len() && !self.finished {
            self.load_next_batch();
        }
        if self.batch_index < self.current_batch.len() {
            let (key, value) = &self.current_batch[self.batch_index];
            self.batch_index += 1;
            Some((key.as_slice(), value.as_slice()))
        } else {
            None
        }
    }

    pub fn next_batch(&mut self) -> Vec<(Vec<u8>, Vec<u8>)> {
        if self.batch_index >= self.current_batch.len() && !self.finished {
            self.load_next_batch();
        }
        // Move (no clone) the un-read tail into `out`
        let out: Vec<(Vec<u8>, Vec<u8>)> =
            self.current_batch.drain(self.batch_index..).collect();

        // We've consumed the whole batch (prefix was already "read" by bumping batch_index),
        // so clear any leftover prefix (should be empty after drain, but safe):
        self.current_batch.clear();
        self.batch_index = 0;

        if self.current_batch.capacity() > self.batch_size * 4 { self.current_batch.shrink_to(self.batch_size); }

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


