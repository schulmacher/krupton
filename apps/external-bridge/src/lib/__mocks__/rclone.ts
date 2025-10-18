import { vi } from 'vitest';

// In-memory cloud storage for testing
const mockCloudStorage = new Map<string, Map<string, Buffer>>();

function getRemoteStorage(remoteName: string, remotePath: string): Map<string, Buffer> {
  const key = `${remoteName}:${remotePath}`;
  if (!mockCloudStorage.has(key)) {
    mockCloudStorage.set(key, new Map());
  }
  return mockCloudStorage.get(key)!;
}

export function resetMockCloudStorage() {
  mockCloudStorage.clear();
}

export function setMockCloudFile(
  remoteName: string,
  remotePath: string,
  fileName: string,
  content: Buffer,
) {
  const storage = getRemoteStorage(remoteName, remotePath);
  storage.set(fileName, content);
}

export function getMockCloudFile(
  remoteName: string,
  remotePath: string,
  fileName: string,
): Buffer | undefined {
  const storage = getRemoteStorage(remoteName, remotePath);
  return storage.get(fileName);
}

export function deleteMockCloudFile(remoteName: string, remotePath: string, fileName: string) {
  const storage = getRemoteStorage(remoteName, remotePath);
  storage.delete(fileName);
}

export function listMockCloudFiles(remoteName: string, remotePath: string): string[] {
  const storage = getRemoteStorage(remoteName, remotePath);
  return Array.from(storage.keys());
}

export const ensureRcloneInstalled = vi.fn(async () => {
  return true;
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const executeRcloneCommand = vi.fn(async (command: string) => {
  return '';
});

export const listRemoteFiles = vi.fn(
  async (
    remoteName: string,
    remotePath: string,
  ): Promise<Array<{ name: string; size: number }>> => {
    const storage = getRemoteStorage(remoteName, remotePath);
    const files: Array<{ name: string; size: number }> = [];

    for (const [name, content] of storage.entries()) {
      files.push({
        name,
        size: content.length,
      });
    }

    return files;
  },
);

export const uploadFilesToRemote = vi.fn(
  async (localPath: string, remoteName: string, remotePath: string) => {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Check if localPath is a file or directory
    const stats = await fs.stat(localPath);

    if (stats.isFile()) {
      // Single file upload
      const fileName = path.basename(localPath);
      const content = await fs.readFile(localPath);
      setMockCloudFile(remoteName, remotePath, fileName, content);
    } else if (stats.isDirectory()) {
      // Directory upload - upload all files
      const files = await fs.readdir(localPath);

      for (const file of files) {
        const filePath = path.join(localPath, file);
        const fileStats = await fs.stat(filePath);

        if (fileStats.isFile()) {
          const content = await fs.readFile(filePath);
          setMockCloudFile(remoteName, remotePath, file, content);
        }
      }
    }
  },
);

export const downloadFileFromRemote = vi.fn(
  async (remoteName: string, remotePath: string, fileName: string, localDir: string) => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const storage = getRemoteStorage(remoteName, remotePath);
    const content = storage.get(fileName);

    if (!content) {
      throw new Error(`File not found: ${fileName}`);
    }

    const localPath = path.join(localDir, fileName);
    await fs.writeFile(localPath, content);
  },
);

export const deleteFileFromRemote = vi.fn(
  async (remoteName: string, remotePath: string, fileName: string) => {
    deleteMockCloudFile(remoteName, remotePath, fileName);
  },
);
