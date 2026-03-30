import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';

type ImageFormat = 'png' | 'jpg' | 'webp';

interface ExportResult {
  blob: Blob;
  filename: string;
}

/**
 * Render each page of a PDF to images using pdfjs canvas rendering,
 * then package as a single image or ZIP archive.
 */
export async function exportPdfAsImages(
  pdfBytes: Uint8Array,
  format: ImageFormat,
  scale: number = 2
): Promise<ExportResult> {
  const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
  const pageCount = pdf.numPages;
  const blobs: Blob[] = [];

  const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
  const quality = format === 'png' ? undefined : 0.9;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create image blob'))),
        mimeType,
        quality
      );
    });
    blobs.push(blob);
  }

  if (blobs.length === 0) {
    throw new Error('PDF has no pages to export');
  }

  const ext = format === 'jpg' ? 'jpg' : format;

  // Single page: return image directly
  if (blobs.length === 1) {
    return { blob: blobs[0], filename: `page-1.${ext}` };
  }

  // Multiple pages: create ZIP
  const zip = new JSZip();
  for (let i = 0; i < blobs.length; i++) {
    zip.file(`page-${i + 1}.${ext}`, blobs[i]);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { blob: zipBlob, filename: 'pages.zip' };
}
