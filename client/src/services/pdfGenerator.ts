import { PDFDocument, PDFPage, PDFName, PDFArray, PDFString, PageSizes, degrees, rgb, StandardFonts, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, fill, setFillingColor } from 'pdf-lib';
import { getFileBytes } from '../stores/fileStore';

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ElementBase {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

interface SnippetElementItem extends ElementBase {
  type: 'snippet';
  fileId: string;
  pageIndex: number;
  cropBox: CropBox;
  cropInset?: CropInset;
}

interface TextElementItem extends ElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: 'Helvetica' | 'Courier' | 'TimesRoman';
  bold: boolean;
  italic: boolean;
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  backgroundColor: string;
}

interface ShapeElementItem extends ElementBase {
  type: 'shape';
  shapeKind: 'rectangle' | 'ellipse' | 'line';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  arrowHead: 'none' | 'open' | 'filled' | 'diamond' | boolean;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
}

interface DrawingElementItem extends ElementBase {
  type: 'drawing';
  points: Array<{ x: number; y: number }>;
  strokeColor: string;
  strokeWidth: number;
}

interface HyperlinkElementItem extends ElementBase {
  type: 'hyperlink';
  text: string;
  url: string;
  fontSize: number;
  fontFamily: 'Helvetica' | 'Courier' | 'TimesRoman';
}

interface HighlightElementItem extends ElementBase {
  type: 'highlight';
  points: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
  strokeWidth: number;
}

interface TextHighlightElementItem extends ElementBase {
  type: 'textHighlight';
  color: string;
  opacity: number;
}

type CanvasElementItem = SnippetElementItem | TextElementItem | ShapeElementItem | DrawingElementItem | HyperlinkElementItem | HighlightElementItem | TextHighlightElementItem;

interface CanvasPageData {
  pageSize: 'letter' | 'a4' | 'custom';
  customWidth?: number;
  customHeight?: number;
  elements: CanvasElementItem[];
}

interface PageItem {
  fileId?: string;
  pageIndex?: number;
  type?: 'page' | 'blank' | 'canvas';
  pageSize?: 'letter' | 'a4' | 'custom';
  canvasPage?: CanvasPageData;
}

// Convert hex color string to pdf-lib rgb
function hexToRgb(hex: string) {
  if (!hex || hex === 'transparent' || hex === '') return null;
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return null;
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

// Map font family + bold/italic to StandardFonts
function getStandardFont(family: string, bold: boolean, italic: boolean): string {
  switch (family) {
    case 'Courier':
      if (bold && italic) return StandardFonts.CourierBoldOblique;
      if (bold) return StandardFonts.CourierBold;
      if (italic) return StandardFonts.CourierOblique;
      return StandardFonts.Courier;
    case 'TimesRoman':
      if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
      if (bold) return StandardFonts.TimesRomanBold;
      if (italic) return StandardFonts.TimesRomanItalic;
      return StandardFonts.TimesRoman;
    case 'Helvetica':
    default:
      if (bold && italic) return StandardFonts.HelveticaBoldOblique;
      if (bold) return StandardFonts.HelveticaBold;
      if (italic) return StandardFonts.HelveticaOblique;
      return StandardFonts.Helvetica;
  }
}

// Compute rotation translation for center-based rotation
function getRotatedPosition(
  x: number, y: number, w: number, h: number, rot: number
): { drawX: number; drawY: number; pdfRot: number } {
  const pdfRot = -rot; // CSS clockwise → pdf-lib counter-clockwise
  const rad = (pdfRot * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const blX = (-w / 2) * Math.cos(rad) - (-h / 2) * Math.sin(rad);
  const blY = (-w / 2) * Math.sin(rad) + (-h / 2) * Math.cos(rad);
  return { drawX: cx + blX, drawY: cy + blY, pdfRot };
}

async function renderSnippet(
  page: PDFPage,
  el: SnippetElementItem,
  pageHeight: number,
  mergedPdf: PDFDocument,
  loadPdf: (fileId: string) => Promise<PDFDocument>
) {
  const sourcePdf = await loadPdf(el.fileId);
  const sourcePage = sourcePdf.getPages()[el.pageIndex];
  if (!sourcePage) return;

  const inset = el.cropInset || { top: 0, right: 0, bottom: 0, left: 0 };
  const origCrop = el.cropBox;

  const adjustedCropBox = {
    x: origCrop.x + origCrop.width * inset.left,
    y: origCrop.y + origCrop.height * inset.bottom,
    width: origCrop.width * (1 - inset.left - inset.right),
    height: origCrop.height * (1 - inset.top - inset.bottom),
  };

  const embedded = await mergedPdf.embedPage(sourcePage, {
    left: adjustedCropBox.x,
    bottom: adjustedCropBox.y,
    right: adjustedCropBox.x + adjustedCropBox.width,
    top: adjustedCropBox.y + adjustedCropBox.height,
  });

  const visibleX = el.x + el.width * inset.left;
  const visibleY = el.y + el.height * inset.top;
  const visibleW = el.width * (1 - inset.left - inset.right);
  const visibleH = el.height * (1 - inset.top - inset.bottom);
  const pdfY = pageHeight - visibleY - visibleH;

  const rot = el.rotation || 0;
  if (rot === 0) {
    page.drawPage(embedded, { x: visibleX, y: pdfY, width: visibleW, height: visibleH });
  } else {
    const { drawX, drawY, pdfRot } = getRotatedPosition(visibleX, pdfY, visibleW, visibleH, rot);
    page.drawPage(embedded, { x: drawX, y: drawY, width: visibleW, height: visibleH, rotate: degrees(pdfRot) });
  }
}

async function renderText(
  page: PDFPage,
  el: TextElementItem,
  pageHeight: number,
  mergedPdf: PDFDocument
) {
  if (!el.text) return;

  const fontName = getStandardFont(el.fontFamily, el.bold, el.italic);
  const font = await mergedPdf.embedFont(fontName);
  const color = hexToRgb(el.textColor) || rgb(0, 0, 0);
  const bgColor = hexToRgb(el.backgroundColor);

  const pdfY = pageHeight - el.y - el.height;
  const rot = el.rotation || 0;

  // Draw background if set
  if (bgColor) {
    if (rot === 0) {
      page.drawRectangle({ x: el.x, y: pdfY, width: el.width, height: el.height, color: bgColor });
    } else {
      const { drawX, drawY, pdfRot } = getRotatedPosition(el.x, pdfY, el.width, el.height, rot);
      page.drawRectangle({
        x: drawX, y: drawY, width: el.width, height: el.height,
        color: bgColor, rotate: degrees(pdfRot),
      });
    }
  }

  // Split text into lines that fit within the element width
  const padding = 4;
  const maxWidth = el.width - padding * 2;
  const words = el.text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    // Handle explicit newlines
    const parts = word.split('\n');
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) {
        lines.push(currentLine);
        currentLine = '';
      }
      const testLine = currentLine ? currentLine + ' ' + parts[pi] : parts[pi];
      const testWidth = font.widthOfTextAtSize(testLine, el.fontSize);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = parts[pi];
      } else {
        currentLine = testLine;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  // Draw each line
  const lineHeight = el.fontSize * 1.2;
  const textStartY = pdfY + el.height - padding - el.fontSize;

  for (let i = 0; i < lines.length; i++) {
    const lineY = textStartY - i * lineHeight;
    if (lineY < pdfY) break; // Don't draw outside element bounds

    let lineX = el.x + padding;
    if (el.textAlign === 'center') {
      const lw = font.widthOfTextAtSize(lines[i], el.fontSize);
      lineX = el.x + (el.width - lw) / 2;
    } else if (el.textAlign === 'right') {
      const lw = font.widthOfTextAtSize(lines[i], el.fontSize);
      lineX = el.x + el.width - padding - lw;
    }

    if (rot === 0) {
      page.drawText(lines[i], { x: lineX, y: lineY, size: el.fontSize, font, color });
    } else {
      // For rotated text, compute position relative to element center then rotate
      const cx = el.x + el.width / 2;
      const cy = pdfY + el.height / 2;
      const pdfRot = -rot;
      const rad = (pdfRot * Math.PI) / 180;
      const dx = lineX - cx;
      const dy = lineY - cy;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
      page.drawText(lines[i], { x: rx, y: ry, size: el.fontSize, font, color, rotate: degrees(pdfRot) });
    }
  }
}

function renderShape(page: PDFPage, el: ShapeElementItem, pageHeight: number) {
  const pdfY = pageHeight - el.y - el.height;
  const rot = el.rotation || 0;
  const fillColor = hexToRgb(el.fillColor) || undefined;
  const strokeColor = hexToRgb(el.strokeColor) || rgb(0, 0, 0);
  const borderWidth = el.strokeWidth || 1;

  switch (el.shapeKind) {
    case 'rectangle': {
      if (rot === 0) {
        page.drawRectangle({
          x: el.x, y: pdfY, width: el.width, height: el.height,
          color: fillColor, borderColor: strokeColor, borderWidth,
        });
      } else {
        const { drawX, drawY, pdfRot } = getRotatedPosition(el.x, pdfY, el.width, el.height, rot);
        page.drawRectangle({
          x: drawX, y: drawY, width: el.width, height: el.height,
          color: fillColor, borderColor: strokeColor, borderWidth, rotate: degrees(pdfRot),
        });
      }
      break;
    }
    case 'ellipse': {
      const cx = el.x + el.width / 2;
      const cy = pdfY + el.height / 2;
      page.drawEllipse({
        x: cx, y: cy, xScale: el.width / 2, yScale: el.height / 2,
        color: fillColor, borderColor: strokeColor, borderWidth,
        rotate: rot !== 0 ? degrees(-rot) : undefined,
      });
      break;
    }
    case 'line': {
      let x1: number, y1: number, x2: number, y2: number;

      if (el.startPoint && el.endPoint) {
        x1 = el.startPoint.x;
        y1 = pageHeight - el.startPoint.y;
        x2 = el.endPoint.x;
        y2 = pageHeight - el.endPoint.y;
      } else {
        x1 = el.x;
        y1 = pageHeight - el.y;
        x2 = el.x + el.width;
        y2 = pageHeight - el.y - el.height;
      }

      page.drawLine({
        start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
        color: strokeColor, thickness: borderWidth,
      });
      const ahStyle = el.arrowHead === true ? 'open' : el.arrowHead;
      if (ahStyle && ahStyle !== 'none') {
        drawArrowHead(page, x1, y1, x2, y2, strokeColor, borderWidth, ahStyle);
      }
      break;
    }
  }
}

function drawArrowHead(
  page: PDFPage, x1: number, y1: number, x2: number, y2: number,
  color: ReturnType<typeof rgb>, thickness: number,
  style: 'open' | 'filled' | 'diamond'
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(14, thickness * 5);
  const aAng = Math.PI / 6;

  const lx = x2 - headLen * Math.cos(angle - aAng);
  const ly = y2 - headLen * Math.sin(angle - aAng);
  const rx = x2 - headLen * Math.cos(angle + aAng);
  const ry = y2 - headLen * Math.sin(angle + aAng);

  if (style === 'open') {
    page.drawLine({ start: { x: x2, y: y2 }, end: { x: lx, y: ly }, color, thickness });
    page.drawLine({ start: { x: x2, y: y2 }, end: { x: rx, y: ry }, color, thickness });
  } else if (style === 'filled') {
    page.pushOperators(
      pushGraphicsState(),
      setFillingColor(color),
      moveTo(x2, y2),
      lineTo(lx, ly),
      lineTo(rx, ry),
      closePath(),
      fill(),
      popGraphicsState(),
    );
  } else if (style === 'diamond') {
    const mx = (lx + rx) / 2, my = (ly + ry) / 2;
    const bx = mx + (mx - x2), by = my + (my - y2);
    page.pushOperators(
      pushGraphicsState(),
      setFillingColor(color),
      moveTo(x2, y2),
      lineTo(lx, ly),
      lineTo(bx, by),
      lineTo(rx, ry),
      closePath(),
      fill(),
      popGraphicsState(),
    );
  }
}

function renderDrawing(page: PDFPage, el: DrawingElementItem, pageHeight: number) {
  if (!el.points || el.points.length < 2) return;

  const strokeColor = hexToRgb(el.strokeColor) || rgb(0, 0, 0);
  const thickness = el.strokeWidth || 2;
  const rot = el.rotation || 0;

  const pdfY = pageHeight - el.y - el.height;

  const toAbsolute = (pt: { x: number; y: number }) => ({
    x: el.x + pt.x,
    y: pdfY + el.height - pt.y,
  });

  const absPoints = el.points.map(toAbsolute);

  if (rot !== 0) {
    const cx = el.x + el.width / 2;
    const cy = pdfY + el.height / 2;
    const pdfRot = -rot;
    const rad = (pdfRot * Math.PI) / 180;
    const rotatePoint = (px: number, py: number) => ({
      x: (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad) + cx,
      y: (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad) + cy,
    });
    for (let i = 0; i < absPoints.length - 1; i++) {
      const p1 = rotatePoint(absPoints[i].x, absPoints[i].y);
      const p2 = rotatePoint(absPoints[i + 1].x, absPoints[i + 1].y);
      page.drawLine({ start: p1, end: p2, color: strokeColor, thickness });
    }
  } else {
    for (let i = 0; i < absPoints.length - 1; i++) {
      page.drawLine({
        start: absPoints[i], end: absPoints[i + 1],
        color: strokeColor, thickness,
      });
    }
  }
}

function renderHighlight(page: PDFPage, el: HighlightElementItem, pageHeight: number) {
  if (!el.points || el.points.length < 2) return;

  const strokeColor = hexToRgb(el.color) || rgb(1, 0.89, 0.03);
  const thickness = el.strokeWidth || 20;
  const opacity = el.opacity || 0.35;
  const rot = el.rotation || 0;

  const pdfY = pageHeight - el.y - el.height;

  const toAbsolute = (pt: { x: number; y: number }) => ({
    x: el.x + pt.x,
    y: pdfY + el.height - pt.y,
  });

  const absPoints = el.points.map(toAbsolute);

  if (rot !== 0) {
    const cx = el.x + el.width / 2;
    const cy = pdfY + el.height / 2;
    const pdfRot = -rot;
    const rad = (pdfRot * Math.PI) / 180;
    const rotatePoint = (px: number, py: number) => ({
      x: (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad) + cx,
      y: (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad) + cy,
    });
    for (let i = 0; i < absPoints.length - 1; i++) {
      const p1 = rotatePoint(absPoints[i].x, absPoints[i].y);
      const p2 = rotatePoint(absPoints[i + 1].x, absPoints[i + 1].y);
      page.drawLine({ start: p1, end: p2, color: strokeColor, thickness, opacity });
    }
  } else {
    for (let i = 0; i < absPoints.length - 1; i++) {
      page.drawLine({
        start: absPoints[i], end: absPoints[i + 1],
        color: strokeColor, thickness, opacity,
      });
    }
  }
}

function renderTextHighlight(page: PDFPage, el: TextHighlightElementItem, pageHeight: number) {
  const fillColor = hexToRgb(el.color) || rgb(1, 0.89, 0.03);
  const opacity = el.opacity || 0.35;
  const rot = el.rotation || 0;

  const pdfY = pageHeight - el.y - el.height;

  page.drawRectangle({
    x: el.x, y: pdfY, width: el.width, height: el.height,
    color: fillColor, opacity,
    ...(rot !== 0 ? { rotate: degrees(-rot) } : {}),
  });
}

async function renderHyperlink(
  page: PDFPage,
  el: HyperlinkElementItem,
  pageHeight: number,
  mergedPdf: PDFDocument
) {
  if (!el.text) return;

  const fontName = getStandardFont(el.fontFamily, false, false);
  const font = await mergedPdf.embedFont(fontName);
  const color = rgb(0.145, 0.388, 0.922); // blue #2563eb

  const pdfY = pageHeight - el.y - el.height;
  const padding = 4;
  const textY = pdfY + el.height - padding - el.fontSize;
  const textX = el.x + padding;

  // Draw text
  page.drawText(el.text, { x: textX, y: textY, size: el.fontSize, font, color });

  // Draw underline
  const textWidth = font.widthOfTextAtSize(el.text, el.fontSize);
  page.drawLine({
    start: { x: textX, y: textY - 2 },
    end: { x: textX + textWidth, y: textY - 2 },
    color,
    thickness: 0.8,
  });

  // Add link annotation if URL is provided
  if (el.url) {
    const context = mergedPdf.context;

    const actionDict = context.obj({});
    actionDict.set(PDFName.of('Type'), PDFName.of('Action'));
    actionDict.set(PDFName.of('S'), PDFName.of('URI'));
    actionDict.set(PDFName.of('URI'), PDFString.of(el.url));

    const annot = context.obj({});
    annot.set(PDFName.of('Type'), PDFName.of('Annot'));
    annot.set(PDFName.of('Subtype'), PDFName.of('Link'));
    annot.set(PDFName.of('Rect'), context.obj([el.x, pdfY, el.x + el.width, pdfY + el.height]));
    annot.set(PDFName.of('Border'), context.obj([0, 0, 0]));
    annot.set(PDFName.of('A'), actionDict);

    const annotsRef = context.register(annot);
    const existingAnnots = page.node.lookup(PDFName.of('Annots'));
    if (existingAnnots instanceof PDFArray) {
      existingAnnots.push(annotsRef);
    } else {
      page.node.set(PDFName.of('Annots'), context.obj([annotsRef]));
    }
  }
}

export async function generatePdf(
  pages: PageItem[]
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  // Cache loaded PDFs to avoid re-reading the same file
  const pdfCache = new Map<string, PDFDocument>();

  const loadPdf = async (fileId: string): Promise<PDFDocument> => {
    let pdf = pdfCache.get(fileId);
    if (!pdf) {
      const bytes = getFileBytes(fileId);
      if (!bytes) throw new Error(`File not found for ${fileId}`);
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pdfCache.set(fileId, pdf);
    }
    return pdf;
  };

  for (const item of pages) {
    // Blank page
    if (item.type === 'blank') {
      const size = item.pageSize === 'a4' ? PageSizes.A4 : PageSizes.Letter;
      mergedPdf.addPage(size);
      continue;
    }

    // Canvas page with composed elements
    if (item.type === 'canvas' && item.canvasPage) {
      const cp = item.canvasPage;
      let size: [number, number];
      if (cp.pageSize === 'a4') size = PageSizes.A4;
      else if (cp.pageSize === 'custom' && cp.customWidth && cp.customHeight) size = [cp.customWidth, cp.customHeight];
      else size = PageSizes.Letter;
      const page = mergedPdf.addPage(size);
      const pageHeight = page.getHeight();

      for (const el of cp.elements) {
        switch (el.type) {
          case 'snippet':
            await renderSnippet(page, el, pageHeight, mergedPdf, loadPdf);
            break;
          case 'text':
            await renderText(page, el, pageHeight, mergedPdf);
            break;
          case 'shape':
            renderShape(page, el, pageHeight);
            break;
          case 'drawing':
            renderDrawing(page, el, pageHeight);
            break;
          case 'highlight':
            renderHighlight(page, el, pageHeight);
            break;
          case 'hyperlink':
            await renderHyperlink(page, el, pageHeight, mergedPdf);
            break;
          case 'textHighlight':
            renderTextHighlight(page, el, pageHeight);
            break;
        }
      }
      continue;
    }

    // Full page
    if (item.fileId != null && item.pageIndex != null) {
      const sourcePdf = await loadPdf(item.fileId);
      const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [item.pageIndex]);
      mergedPdf.addPage(copiedPage);
    }
  }

  return mergedPdf.save();
}
