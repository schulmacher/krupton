use pyo3::prelude::*;

use crate::core::{CoreKeyValue, CoreSegmentedLog};

#[pyclass]
#[derive(Clone)]
pub struct KeyValue {
    #[pyo3(get)]
    pub key: Vec<u8>,
    #[pyo3(get)]
    pub value: Vec<u8>,
}

impl From<CoreKeyValue> for KeyValue {
    fn from(v: CoreKeyValue) -> Self {
        KeyValue { key: v.key, value: v.value }
    }
}

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
        self.inner
            .append_batch(messages)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn put(&self, id: i64, value: &[u8]) -> PyResult<()> {
        self.inner
            .put(id, value)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn iterate_from(&self, start_id: Option<i64>, batch_size: Option<u32>) -> PyResult<SegmentedLogIterator> {
        let inner = self
            .inner
            .iterate_from(start_id, batch_size.map(|v| v as usize))
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(SegmentedLogIterator { inner })
    }

    pub fn truncate_before(&self, id: i64) -> PyResult<()> {
        self.inner
            .truncate_before(id)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))
    }

    pub fn read_last(&self, count: Option<u32>) -> PyResult<Vec<KeyValue>> {
        let items = self
            .inner
            .read_last(count)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e))?;
        Ok(items.into_iter().map(KeyValue::from).collect())
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
    pub fn next(&mut self) -> Option<KeyValue> {
        self.inner.next().map(KeyValue::from)
    }

    pub fn next_batch(&mut self) -> Vec<KeyValue> {
        self.inner.next_batch().into_iter().map(KeyValue::from).collect()
    }

    pub fn has_next(&self) -> bool {
        self.inner.has_next()
    }

    pub fn close(&mut self) {
        self.inner.close();
    }
}

#[pymodule]
fn rocksdb_binding(_py: Python, m: &Bound<PyModule>) -> PyResult<()> {
    m.add_class::<SegmentedLog>()?;
    m.add_class::<SegmentedLogIterator>()?;
    m.add_class::<KeyValue>()?;
    Ok(())
}


