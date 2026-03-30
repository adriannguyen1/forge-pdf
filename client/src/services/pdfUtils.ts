import { PDFDocument } from 'pdf-lib';

export async function getPdfMetadata(bytes: ArrayBuffer): Promise<{
  pageCount: number;
}> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { pageCount: pdf.getPageCount() };
}

export async function getPageDimensions(
  bytes: ArrayBuffer,
  pageIndex: number
): Promise<{
  width: number;
  height: number;
  cropBox: { x: number; y: number; width: number; height: number };
  rotation: number;
}> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
    throw new Error('Page not found');
  }
  const page = pdfDoc.getPage(pageIndex);

  const cropBox = page.getCropBox();
  const mediaBox = page.getMediaBox();
  const box = cropBox || mediaBox;

  const rotation = page.getRotation().angle;
  let visibleWidth = box.width;
  let visibleHeight = box.height;
  if (rotation === 90 || rotation === 270) {
    [visibleWidth, visibleHeight] = [visibleHeight, visibleWidth];
  }

  return {
    width: visibleWidth,
    height: visibleHeight,
    cropBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    rotation,
  };
}
