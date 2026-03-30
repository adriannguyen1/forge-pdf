import * as pdfjs from 'pdfjs-dist';
import { getFileBytes } from '../stores/fileStore';

/**
 * Render a cropped region of a PDF page as a PNG blob, entirely client-side.
 * Uses pdfjs to render the page to an offscreen canvas, then crops with drawImage.
 */
export async function renderSnippetAsPng(
  fileId: string,
  pageIndex: number,
  pixelCrop: { x: number; y: number; width: number; height: number },
  renderWidth: number = 700
): Promise<Blob> {
  const bytes = getFileBytes(fileId);
  if (!bytes) throw new Error('File not found');

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(pageIndex + 1); // pdfjs is 1-based

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = renderWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  // Render full page to offscreen canvas
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = viewport.width;
  fullCanvas.height = viewport.height;
  await page.render({ canvas: fullCanvas, viewport }).promise;

  // Crop
  const cropW = Math.round(pixelCrop.width);
  const cropH = Math.round(pixelCrop.height);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d')!;
  cropCtx.drawImage(
    fullCanvas,
    Math.round(pixelCrop.x), Math.round(pixelCrop.y),
    cropW, cropH,
    0, 0,
    cropW, cropH
  );

  return new Promise((resolve, reject) => {
    cropCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });
}
