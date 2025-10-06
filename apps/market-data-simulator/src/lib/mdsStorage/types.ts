export interface DirectoryStats {
  directory: string;
  fileCount: number;
  sizeBytes: number;
  lastUpdated: number;
}
export interface FileInfo {
  path: string;
  size: number;
  mtime: number;
}
