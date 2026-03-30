import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Resolve the Chromium executable path.
 * In production (Tauri sidecar), CHROMIUM_PATH is set by the Rust host.
 * In development, falls back to the Puppeteer cache directory.
 */
export function getChromiumPath(): string {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }

  // Dev fallback: scan Puppeteer cache for an installed Chrome
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  try {
    const versions = fs.readdirSync(cacheDir);
    for (const version of versions) {
      const platform = os.platform();
      let binary: string;
      if (platform === 'darwin') {
        binary = path.join(
          cacheDir, version, 'chrome-mac-arm64',
          'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'
        );
        if (fs.existsSync(binary)) return binary;
        // Also check x64
        binary = path.join(
          cacheDir, version, 'chrome-mac-x64',
          'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'
        );
        if (fs.existsSync(binary)) return binary;
      } else if (platform === 'linux') {
        binary = path.join(cacheDir, version, 'chrome-linux64', 'chrome');
        if (fs.existsSync(binary)) return binary;
      } else if (platform === 'win32') {
        binary = path.join(cacheDir, version, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(binary)) return binary;
      }
    }
  } catch {
    // Cache dir doesn't exist
  }

  throw new Error(
    'Chromium not found. Set CHROMIUM_PATH or install puppeteer (npm install puppeteer) to download it.'
  );
}
