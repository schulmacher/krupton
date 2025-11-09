use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::core::CoreSegmentedLog;

#[napi(object)]
pub struct KeyValue {
    pub key: Buffer,
    pub value: Buffer,
}

impl From<(Vec<u8>, Vec<u8>)> for KeyValue {
    fn from(v: (Vec<u8>, Vec<u8>)) -> Self {
        KeyValue {
            key: v.0.into(),
            value: v.1.into(),
        }
    }
}

#[napi]
pub struct SegmentedLog {
    inner: CoreSegmentedLog,
}

#[napi]
impl SegmentedLog {
    #[napi(constructor)]
    pub fn new(path: String, enable_compression: Option<bool>) -> Result<Self> {
        let inner = CoreSegmentedLog::new(path, enable_compression)
            .map_err(|e| Error::from_reason(e))?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn open_read_only(path: String, enable_compression: Option<bool>) -> Result<Self> {
        let inner = CoreSegmentedLog::open_read_only(path, enable_compression)
            .map_err(|e| Error::from_reason(e))?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn open_as_secondary(
        primary_path: String,
        secondary_path: String,
        enable_compression: Option<bool>,
    ) -> Result<Self> {
        let inner = CoreSegmentedLog::open_as_secondary(primary_path, secondary_path, enable_compression)
            .map_err(|e| Error::from_reason(e))?;
        Ok(Self { inner })
    }

    #[napi]
    pub fn try_catch_up_with_primary(&self) -> Result<()> {
        self.inner
            .try_catch_up_with_primary()
            .map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn close(&mut self) -> Result<()> {
        self.inner.close().map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn append(&self, message: Buffer) -> Result<Buffer> {
        let key = self
            .inner
            .append(message.as_ref())
            .map_err(|e| Error::from_reason(e))?;
        Ok(key.into())
    }

    #[napi]
    pub fn append_batch(&self, messages: Vec<Buffer>) -> Result<Vec<Buffer>> {
        let msgs: Vec<&[u8]> = messages.iter().map(|b| b.as_ref()).collect();
        let keys = self
            .inner
            .append_batch(&msgs)
            .map_err(|e| Error::from_reason(e))?;
        Ok(keys.into_iter().map(|k| k.into()).collect())
    }

    #[napi]
    pub fn put(&self, key: Buffer, value: Buffer) -> Result<()> {
        self.inner
            .put(key.as_ref(), value.as_ref())
            .map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn iterate_from(&self, start_key: Option<Buffer>, batch_size: Option<u32>) -> Result<SegmentedLogIterator> {
        let inner = self
            .inner
            .iterate_from(start_key.as_ref().map(|b| b.as_ref()), batch_size.map(|v| v as usize))
            .map_err(|e| Error::from_reason(e))?;
        Ok(SegmentedLogIterator { inner: inner })
    }

    #[napi]
    pub fn truncate_before(&self, before_key: Buffer) -> Result<()> {
        self.inner
            .truncate_before(before_key.as_ref())
            .map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn read_last(&self, count: Option<u32>) -> Result<Vec<KeyValue>> {
        let items = self
            .inner
            .read_last(count)
            .map_err(|e| Error::from_reason(e))?;
        Ok(items.into_iter().map(KeyValue::from).collect())
    }

    #[napi]
    pub fn get_last_key(&self) -> Result<Option<Buffer>> {
        let key = self
            .inner
            .get_last_key()
            .map_err(|e| Error::from_reason(e))?;
        Ok(key.map(Into::into))
    }
}

#[napi]
pub struct SegmentedLogIterator {
    inner: crate::core::CoreSegmentedLogIterator,
}

#[napi]
impl SegmentedLogIterator {
    #[napi]
    pub fn next(&mut self) -> Option<KeyValue> {
        self.inner.next().map(|(key, value)| KeyValue {
            key: key.to_vec().into(),
            value: value.to_vec().into(),
        })
    }

    #[napi]
    pub fn next_batch(&mut self) -> Vec<KeyValue> {
        self.inner
            .next_batch()
            .into_iter()
            .map(KeyValue::from)
            .collect()
    }

    #[napi]
    pub fn has_next(&self) -> bool {
        self.inner.has_next()
    }

    #[napi]
    pub fn close(&mut self) {
        self.inner.close();
    }
}


