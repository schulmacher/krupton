use pyo3::prelude::*;

use crate::core::{CoreSegmentedLog, CoreRocksDb};

#[pyclass]
pub struct SegmentedLog {
    inner: CoreSegmentedLog,
}

#[pymethods]
impl SegmentedLog {
    #[new]
    pub fn new(path: String, enable_compression: Option<bool>) -> PyResult<Self> {
        let inner = CoreSegmentedLog::new(path, enable_compression)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(Self { inner })
    }

    #[staticmethod]
    pub fn open_read_only(path: String, enable_compression: Option<bool>) -> PyResult<Self> {
        let inner = CoreSegmentedLog::open_read_only(path, enable_compression)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(Self { inner })
    }

    #[staticmethod]
    pub fn open_as_secondary(
        primary_path: String,
        secondary_path: String,
        enable_compression: Option<bool>,
    ) -> PyResult<Self> {
        let inner = CoreSegmentedLog::open_as_secondary(primary_path, secondary_path, enable_compression)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(Self { inner })
    }

    pub fn try_catch_up_with_primary(&self) -> PyResult<()> {
        self.inner
            .try_catch_up_with_primary()
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn close(&mut self) -> PyResult<()> {
        self.inner
            .close()
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn append(&self, message: &[u8]) -> PyResult<Vec<u8>> {
        self.inner
            .append(message)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn append_batch(&self, messages: Vec<Vec<u8>>) -> PyResult<Vec<Vec<u8>>> {
        let msgs: Vec<&[u8]> = messages.iter().map(|m| m.as_slice()).collect();
        self.inner
            .append_batch(&msgs)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn put(&self, key: &[u8], value: &[u8]) -> PyResult<()> {
        self.inner
            .put(key, value)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn iterate_from(&self, start_key: Option<&[u8]>, batch_size: Option<u32>) -> PyResult<SegmentedLogIterator> {
        let inner = self
            .inner
            .iterate_from(start_key, batch_size.map(|v| v as usize))
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(SegmentedLogIterator { inner })
    }

    pub fn truncate_before(&self, before_key: &[u8]) -> PyResult<()> {
        self.inner
            .truncate_before(before_key)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn read_last(&self, count: Option<u32>) -> PyResult<Vec<(Vec<u8>, Vec<u8>)>> {
        self.inner
            .read_last(count)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn get_last_key(&self) -> PyResult<Option<Vec<u8>>> {
        self.inner
            .get_last_key()
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }
}

#[pyclass]
pub struct SegmentedLogIterator {
    inner: crate::core::CoreSegmentedLogIterator,
}

#[pymethods]
impl SegmentedLogIterator {
    pub fn next(&mut self) -> Option<(Vec<u8>, Vec<u8>)> {
        self.inner.next().map(|(key, value)| (key.to_vec(), value.to_vec()))
    }

    pub fn next_batch(&mut self) -> Vec<(Vec<u8>, Vec<u8>)> {
        self.inner.next_batch()
    }

    pub fn has_next(&self) -> bool {
        self.inner.has_next()
    }

    pub fn close(&mut self) {
        self.inner.close();
    }
}

#[pyclass]
pub struct RocksDb {
    inner: CoreRocksDb,
}

#[pymethods]
impl RocksDb {
    #[new]
    pub fn new(path: String, enable_compression: Option<bool>) -> PyResult<Self> {
        let inner = CoreRocksDb::new(path, enable_compression)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(Self { inner })
    }

    #[staticmethod]
    pub fn open_as_secondary(
        primary_path: String,
        secondary_path: String,
        enable_compression: Option<bool>,
    ) -> PyResult<Self> {
        let inner = CoreRocksDb::open_as_secondary(primary_path, secondary_path, enable_compression)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(Self { inner })
    }

    pub fn try_catch_up_with_primary(&self) -> PyResult<()> {
        self.inner
            .try_catch_up_with_primary()
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn close(&mut self) -> PyResult<()> {
        self.inner
            .close()
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn put(&self, key: &[u8], value: &[u8]) -> PyResult<()> {
        self.inner
            .put(key, value)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn iterate_from(&self, start_key: Option<&[u8]>, batch_size: Option<u32>) -> PyResult<SegmentedLogIterator> {
        let inner = self
            .inner
            .iterate_from(start_key, batch_size.map(|v| v as usize))
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(SegmentedLogIterator { inner })
    }

    pub fn iterate_from_end(&self, start_key: Option<&[u8]>, batch_size: Option<u32>) -> PyResult<SegmentedLogIterator> {
        let inner = self
            .inner
            .iterate_from_end(start_key, batch_size.map(|v| v as usize))
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(SegmentedLogIterator { inner })
    }
}

#[pymodule]
fn rocksdb_binding(_py: Python, m: &Bound<PyModule>) -> PyResult<()> {
    m.add_class::<SegmentedLog>()?;
    m.add_class::<SegmentedLogIterator>()?;
    m.add_class::<RocksDb>()?;
    Ok(())
}


