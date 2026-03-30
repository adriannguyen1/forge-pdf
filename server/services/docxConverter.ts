import fs from 'fs/promises';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer-core';
import { getChromiumPath } from './chromiumPath.js';

export async function convertDocxToPdf(docxPath: string, outputPath: string): Promise<void> {
  // Convert DOCX to HTML using mammoth
  const docxBuffer = await fs.readFile(docxPath);
  const result = await mammoth.convertToHtml({ buffer: docxBuffer });
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.5;
          margin: 1in;
          color: #000;
        }
        img { max-width: 100%; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #ccc; padding: 6px; }
      </style>
    </head>
    <body>${result.value}</body>
    </html>
  `;

  // Convert HTML to PDF using puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromiumPath(),
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
  });
  await browser.close();

  await fs.writeFile(outputPath, pdfBuffer);
}
