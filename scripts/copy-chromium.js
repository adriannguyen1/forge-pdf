/**
 * Copy Chromium from Puppeteer's cache into src-tauri/resources/chromium/
 * so it gets bundled into the Tauri app.
 *
 * Usage: node scripts/copy-chromium.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
const destDir = path.join('src-tauri', 'resources', 'chromium');

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function findChromeBinary() {
  if (!fs.existsSync(cacheDir)) {
    throw new Error(
      `Puppeteer cache not found at ${cacheDir}.\n` +
      'Run "cd server && npx puppeteer browsers install chrome" first.'
    );
  }

  const versions = fs.readdirSync(cacheDir);
  if (versions.length === 0) {
    throw new Error('No Chrome versions found in Puppeteer cache.');
  }

  const platform = os.platform();
  for (const version of versions) {
    let chromeSubdir;
    if (platform === 'darwin') {
      chromeSubdir = 'chrome-mac-arm64';
      if (!fs.existsSync(path.join(cacheDir, version, chromeSubdir))) {
        chromeSubdir = 'chrome-mac-x64';
      }
    } else if (platform === 'linux') {
      chromeSubdir = 'chrome-linux64';
    } else if (platform === 'win32') {
      chromeSubdir = 'chrome-win64';
    }

    const srcPath = path.join(cacheDir, version, chromeSubdir);
    if (fs.existsSync(srcPath)) {
      return { srcPath, chromeSubdir };
    }
  }

  throw new Error('Could not find a Chrome binary in the Puppeteer cache.');
}

const { srcPath, chromeSubdir } = findChromeBinary();
const destPath = path.join(destDir, chromeSubdir);

// Clean previous copy
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true });
}
fs.mkdirSync(destDir, { recursive: true });

console.log(`Copying Chromium from ${srcPath} to ${destPath}...`);
copyDirRecursive(srcPath, destPath);

// Also copy the LICENSE file if it exists alongside the Chrome dir
const licenseSrc = path.join(path.dirname(srcPath), 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(destDir, 'LICENSE'));
}

console.log('Chromium copied successfully.');
