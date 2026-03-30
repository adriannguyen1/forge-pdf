import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { getChromiumPath } from './chromiumPath.js';

export async function convertHtmlToPdf(htmlPath: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromiumPath(),
  });
  const page = await browser.newPage();

  // Use file:// URL so relative resources (images, CSS) resolve correctly
  const fileUrl = `file://${path.resolve(htmlPath)}`;
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
  });
  await browser.close();

  await fs.writeFile(outputPath, pdfBuffer);
}
