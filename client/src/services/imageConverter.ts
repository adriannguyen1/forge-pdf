import { PDFDocument } from 'pdf-lib';

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 36;
const MAX_DIM = 2000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function imageToCanvasPng(img: HTMLImageElement, w: number, h: number): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Convert an image to a single-page PDF on a US Letter page with margins.
 */
export async function convertImageToPdf(
  imageBytes: ArrayBuffer,
  mimeType: string
): Promise<{ pdfBytes: ArrayBuffer; pageCount: number }> {
  const blob = new Blob([imageBytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);

  const maxW = LETTER_WIDTH - MARGIN * 2;
  const maxH = LETTER_HEIGHT - MARGIN * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const scaledW = Math.round(img.width * scale);
  const scaledH = Math.round(img.height * scale);

  const pngBytes = imageToCanvasPng(img, scaledW, scaledH);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  const embedded = await pdfDoc.embedPng(pngBytes);
  const x = (LETTER_WIDTH - scaledW) / 2;
  const y = (LETTER_HEIGHT - scaledH) / 2;
  page.drawImage(embedded, { x, y, width: scaledW, height: scaledH });

  const bytes = await pdfDoc.save();
  return { pdfBytes: bytes.buffer as ArrayBuffer, pageCount: 1 };
}

/**
 * Convert an image to a PDF where the page is sized exactly to the image.
 * No margins — used for "add image as snippet".
 */
export async function convertImageToPdfTight(
  imageBytes: ArrayBuffer,
  mimeType: string
): Promise<{ pdfBytes: ArrayBuffer; pageWidth: number; pageHeight: number }> {
  const blob = new Blob([imageBytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);

  const scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);
  const pageW = Math.round(img.width * scale);
  const pageH = Math.round(img.height * scale);

  const pngBytes = imageToCanvasPng(img, pageW, pageH);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageW, pageH]);
  const embedded = await pdfDoc.embedPng(pngBytes);
  page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });

  const bytes = await pdfDoc.save();
  return { pdfBytes: bytes.buffer as ArrayBuffer, pageWidth: pageW, pageHeight: pageH };
}
