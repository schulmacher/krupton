#!/usr/bin/env node

/**
 * Download Perses binary for the current platform
 */

import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { get } from 'node:https';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, '..', 'bin');

const VERSION = '0.52.0';
const VERSION_TAG = `v${VERSION}`;

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

  const persesPlatform = PLATFORM_MAP[osPlatform];
  const persesArch = ARCH_MAP[osArch];

  if (!persesPlatform || !persesArch) {
    throw new Error(`Unsupported platform: ${osPlatform}-${osArch}`);
  }

  return { platform: persesPlatform, arch: persesArch };
}

function getDownloadUrl(platform, arch) {
  const baseUrl = 'https://github.com/perses/perses/releases/download';
  const fileName = `perses_${VERSION}_${platform}_${arch}.tar.gz`;
  return `${baseUrl}/${VERSION_TAG}/${fileName}`;
}

function downloadAndExtract(url, destDir) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading Perses from: ${url}`);

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

async function copyPlugins() {
  const pluginsSource = join(binDir, 'plugins-archive');
  const pluginsDestination = join(__dirname, '..', 'plugins-archive');

  if (!existsSync(pluginsSource)) {
    console.warn('Warning: plugins-archive not found in binary directory');
    return;
  }

  if (existsSync(pluginsDestination)) {
    console.log('Plugins already copied');
    return;
  }

  console.log('Copying plugins to working directory...');

  // Copy plugins-archive directory
  const { cp } = await import('node:fs/promises');
  await cp(pluginsSource, pluginsDestination, { recursive: true });

  console.log('Plugins copied successfully');
}

async function main() {
  try {
    const { platform: persesPlatform, arch: persesArch } = getPlatformInfo();
    const url = getDownloadUrl(persesPlatform, persesArch);

    if (!existsSync(binDir)) {
      mkdirSync(binDir, { recursive: true });
    }

    const binaryPath = join(binDir, 'perses');

    if (existsSync(binaryPath)) {
      console.log('Perses binary already exists');
      await copyPlugins();
      return;
    }

    await downloadAndExtract(url, binDir);

    chmodSync(binaryPath, 0o755);

    console.log('Perses installed successfully');
    console.log(`Binary location: ${binaryPath}`);

    // Copy plugins after extraction
    await copyPlugins();
    process.exit(0);
  } catch (error) {
    console.error('Failed to download Perses:', error.message);
    process.exit(1);
  }
}

main();
