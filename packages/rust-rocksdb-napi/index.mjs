import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const native = require('./index'); // or './index' depending on build output

export const { SegmentedLog, RocksDb, RocksDbIterator } = native;
export default native;
