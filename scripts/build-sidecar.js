/**
 * Build the server sidecar binary for the current platform.
 * Called by CI and local builds.
 *
 * Usage: node scripts/build-sidecar.js
 */
import { execSync } from 'child_process';
import os from 'os';

const platform = os.platform();
const arch = os.arch();

// Map Node os.arch() → pkg target and Tauri triple
const targets = {
  'darwin-arm64':  { pkg: 'node20-macos-arm64',   triple: 'aarch64-apple-darwin' },
  'darwin-x64':   { pkg: 'node20-macos-x64',      triple: 'x86_64-apple-darwin' },
  'win32-x64':    { pkg: 'node20-win-x64',        triple: 'x86_64-pc-windows-msvc' },
  'linux-x64':    { pkg: 'node20-linux-x64',       triple: 'x86_64-unknown-linux-gnu' },
};

const key = `${platform}-${arch}`;
const target = targets[key];
if (!target) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const ext = platform === 'win32' ? '.exe' : '';
const output = `../src-tauri/binaries/server-${target.triple}${ext}`;

console.log(`Building sidecar for ${key} → ${output}`);

// Step 1: Bundle with tsup
execSync('npx tsup', { stdio: 'inherit', cwd: 'server' });

// Step 2: Package with pkg
execSync(
  `npx @yao-pkg/pkg cjs-dist/index.cjs --target ${target.pkg} --output ${output}`,
  { stdio: 'inherit', cwd: 'server' }
);

console.log('Sidecar built successfully.');
