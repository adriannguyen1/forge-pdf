import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execFileAsync = promisify(execFile);

function findLibreOfficePath(): string {
  // Allow override via environment variable
  if (process.env.LIBREOFFICE_PATH) {
    return process.env.LIBREOFFICE_PATH;
  }

  const platform = os.platform();
  if (platform === 'darwin') {
    return '/Applications/LibreOffice.app/Contents/MacOS/soffice';
  } else if (platform === 'win32') {
    return 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
  }
  // Linux
  return '/usr/bin/soffice';
}

const SOFFICE_PATH = findLibreOfficePath();

/**
 * Convert a .doc, .ppt, or .pptx file to PDF using LibreOffice headless mode.
 */
export async function convertWithLibreOffice(
  inputPath: string,
  outputDir: string
): Promise<string> {
  try {
    await fs.access(SOFFICE_PATH);
  } catch {
    throw new Error(
      'LibreOffice not found. Install LibreOffice to convert this file type. ' +
      'Download from https://www.libreoffice.org/download/'
    );
  }

  await execFileAsync(SOFFICE_PATH, [
    '--headless',
    '--convert-to', 'pdf',
    '--outdir', outputDir,
    inputPath,
  ], { timeout: 60_000 });

  // LibreOffice outputs <basename>.pdf in the outdir
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${baseName}.pdf`);

  try {
    await fs.access(outputPath);
  } catch {
    throw new Error('LibreOffice conversion failed: output file not created');
  }

  return outputPath;
}
