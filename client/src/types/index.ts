export interface UploadedFile {
  id: string;
  fileName: string;
  pageCount: number;
}

export interface Snippet {
  id: string;
  fileId: string;
  fileName: string;
  pageIndex: number;
  cropBox: { x: number; y: number; width: number; height: number };
  pixelCrop: { x: number; y: number; width: number; height: number };
  label: string;
  createdAt: number;
}

export interface CropInset {
  top: number;    // 0-1, fraction trimmed from top
  right: number;  // 0-1, fraction trimmed from right
  bottom: number; // 0-1, fraction trimmed from bottom
  left: number;   // 0-1, fraction trimmed from left
}

// --- Canvas element discriminated union ---

export interface CanvasElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees, clockwise
  locked?: boolean; // prevents selection, drag, resize, delete
}

export interface SnippetElement extends CanvasElementBase {
  type: 'snippet';
  snippetId: string;
  cropInset: CropInset;
  pixelCropOverride?: { x: number; y: number; width: number; height: number };
  cropBoxOverride?: { x: number; y: number; width: number; height: number };
}

export interface TextElement extends CanvasElementBase {
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

export interface ShapeElement extends CanvasElementBase {
  type: 'shape';
  shapeKind: 'rectangle' | 'ellipse' | 'line';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  arrowHead: 'none' | 'open' | 'filled' | 'diamond' | boolean;
  // Line endpoints in absolute PDF-point coordinates (only for shapeKind === 'line')
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
}

export interface DrawingElement extends CanvasElementBase {
  type: 'drawing';
  points: Array<{ x: number; y: number }>;
  strokeColor: string;
  strokeWidth: number;
}

export interface HyperlinkElement extends CanvasElementBase {
  type: 'hyperlink';
  text: string;
  url: string;
  fontSize: number;
  fontFamily: 'Helvetica' | 'Courier' | 'TimesRoman';
}

export interface HighlightElement extends CanvasElementBase {
  type: 'highlight';
  points: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
  strokeWidth: number;
}

export interface TextHighlightElement extends CanvasElementBase {
  type: 'textHighlight';
  color: string;
  opacity: number;
}

export type CanvasElement = SnippetElement | TextElement | ShapeElement | DrawingElement | HyperlinkElement | HighlightElement | TextHighlightElement;

// Helper for partial updates across the union
export type CanvasElementUpdate = Partial<SnippetElement & TextElement & ShapeElement & DrawingElement & HyperlinkElement & HighlightElement & TextHighlightElement>;

export interface CanvasPage {
  id: string;
  label: string;
  pageSize: 'letter' | 'a4' | 'custom';
  customWidth?: number;   // PDF points, only when pageSize === 'custom'
  customHeight?: number;  // PDF points, only when pageSize === 'custom'
  elements: CanvasElement[];
}

export interface QueueItem {
  id: string;
  type: 'page' | 'blank' | 'canvas';
  fileId?: string;
  fileName?: string;
  pageIndex?: number;
  pageSize?: 'letter' | 'a4' | 'custom';
  canvasPageId?: string;
}
