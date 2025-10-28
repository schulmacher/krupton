#!/usr/bin/env node

/**
 * Download VictoriaMetrics binary for the current platform
 * 
 * VictoriaMetrics is distributed as a single binary with no dependencies.
 * This script downloads the appropriate binary for the current OS and architecture.
 */

import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { platform, arch } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { get } from 'node:https';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, '..', 'bin');

const VERSION = 'v1.93.5';

const PLATFORM_MAP = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const ARCH_MAP = {
  x64: 'amd64',
  arm64: 'arm64',
  arm: 'arm',
};

function getPlatformInfo() {
  const osPlatform = platform();
  const osArch = arch();
  
  const vmPlatform = PLATFORM_MAP[osPlatform];
  const vmArch = ARCH_MAP[osArch];
  
  if (!vmPlatform || !vmArch) {
    throw new Error(`Unsupported platform: ${osPlatform}-${osArch}`);
  }
  
  return { platform: vmPlatform, arch: vmArch };
}

function getDownloadUrl(platform, arch) {
  const baseUrl = 'https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download';
  const fileName = `victoria-metrics-${platform}-${arch}-${VERSION}.tar.gz`;
  return `${baseUrl}/${VERSION}/${fileName}`;
}

function downloadAndExtract(url, destDir) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading VictoriaMetrics from: ${url}`);
    
    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadAndExtract(response.headers.location, destDir).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed with status: ${response.statusCode}`));
      }
      
      const gunzip = createGunzip();
      const extractor = extract(destDir);
      
      pipeline(response, gunzip, extractor)
        .then(() => {
          console.log('Download and extraction complete');
          resolve();
        })
        .catch(reject);
    }).on('error', reject);
  });
}

async function main() {
  try {
    const { platform: vmPlatform, arch: vmArch } = getPlatformInfo();
    const url = getDownloadUrl(vmPlatform, vmArch);
    
    if (!existsSync(binDir)) {
      mkdirSync(binDir, { recursive: true });
    }
    
    const binaryPath = join(binDir, 'victoria-metrics-prod');
    
    if (existsSync(binaryPath)) {
      console.log('VictoriaMetrics binary already exists');
      return;
    }
    
    await downloadAndExtract(url, binDir);
    
    chmodSync(binaryPath, 0o755);
    
    console.log('VictoriaMetrics installed successfully');
    console.log(`Binary location: ${binaryPath}`);
  } catch (error) {
    console.error('Failed to download VictoriaMetrics:', error.message);
    process.exit(1);
  }
}

main();
