import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// TODO automated install for VPS and guides in README
export async function ensureRcloneInstalled() {
  try {
    await execAsync('which rclone');
    return true;
  } catch {
    throw new Error(
      'rclone is not installed. Please install it: brew install rclone (macOS) or visit https://rclone.org/install/',
    );
  }
}

export async function executeRcloneCommand(command: string) {
  const { stdout, stderr } = await execAsync(command);
  if (stderr && !stderr.includes('Transferred:')) {
    throw new Error(`Rclone error: ${stderr}`);
  }
  return stdout;
}

export async function listRemoteFiles(
  remoteName: string,
  remotePath: string,
): Promise<Array<{ name: string; size: number }>> {
  const command = `rclone lsjson "${remoteName}:${remotePath}"`;

  try {
    const output = await executeRcloneCommand(command);
    const files = JSON.parse(output) as Array<{
      Name: string;
      Size: number;
      IsDir: boolean;
    }>;

    return files
      .filter((file) => !file.IsDir)
      .map((file) => ({
        name: file.Name,
        size: file.Size,
      }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('directory not found')) {
      return [];
    }
    throw error;
  }
}

export async function uploadFilesToRemote(localPath: string, remoteName: string, remotePath: string) {
  const command = `rclone copy "${localPath}" "${remoteName}:${remotePath}" --progress`;
  await executeRcloneCommand(command);
}

export async function downloadFileFromRemote(
  remoteName: string,
  remotePath: string,
  fileName: string,
  localDir: string,
) {
  const command = `rclone copy "${remoteName}:${remotePath}/${fileName}" "${localDir}" --progress`;
  await executeRcloneCommand(command);
}

export async function deleteFileFromRemote(
  remoteName: string,
  remotePath: string,
  fileName: string,
) {
  const command = `rclone deletefile "${remoteName}:${remotePath}/${fileName}"`;
  await executeRcloneCommand(command);
}
