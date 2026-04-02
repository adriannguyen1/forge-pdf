import { useState, useRef, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { useAppStore } from '../stores/useAppStore';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { getOrCreateBlobUrl } from '../stores/fileStore';
import { getApiBase } from '../utils/api';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export default function SnippetCropper() {
  const snippetCropperPage = useAppStore((s) => s.snippetCropperPage);
  const closeSnippetCropper = useAppStore((s) => s.closeSnippetCropper);
  const addSnippets = useAppStore((s) => s.addSnippets);
  const existingSnippetCount = useAppStore((s) => s.snippets.length);

  const [rects, setRects] = useState<Rect[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawCurrent, setDrawCurrent] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; corner: string; startX: number; startY: number; origRect: Rect } | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const RENDER_WIDTH = 700;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSnippetCropper();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeSnippetCropper]);

  // Reset state when page changes
  useEffect(() => {
    setRects([]);
    setPdfLoaded(false);
    setPdfError(null);
    setPageSize(null);
  }, [snippetCropperPage?.fileId, snippetCropperPage?.pageIndex]);

  if (!snippetCropperPage) return null;

  const { fileId, fileName, pageIndex } = snippetCropperPage;
  const pdfUrl = getOrCreateBlobUrl(fileId) || `${getApiBase()}/api/files/${fileId}/pdf`;

  const getRelativePos = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-rect-control]')) return;
    const pos = getRelativePos(e);
    setDrawing(true);
    setDrawStart(pos);
    setDrawCurrent(pos);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawing) {
      setDrawCurrent(getRelativePos(e));
    } else if (dragging) {
      const pos = getRelativePos(e);
      setRects((prev) =>
        prev.map((r) =>
          r.id === dragging.id
            ? { ...r, x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY }
            : r
        )
      );
    } else if (resizing) {
      const pos = getRelativePos(e);
      const dx = pos.x - resizing.startX;
      const dy = pos.y - resizing.startY;
      const o = resizing.origRect;

      setRects((prev) =>
        prev.map((r) => {
          if (r.id !== resizing.id) return r;
          let nx = o.x, ny = o.y, nw = o.width, nh = o.height;

          if (resizing.corner.includes('right')) nw = Math.max(20, o.width + dx);
          if (resizing.corner.includes('bottom')) nh = Math.max(20, o.height + dy);
          if (resizing.corner.includes('left')) {
            nw = Math.max(20, o.width - dx);
            nx = o.x + o.width - nw;
          }
          if (resizing.corner.includes('top')) {
            nh = Math.max(20, o.height - dy);
            ny = o.y + o.height - nh;
          }
          return { ...r, x: nx, y: ny, width: nw, height: nh };
        })
      );
    }
  };

  const handlePointerUp = () => {
    if (drawing) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const width = Math.abs(drawCurrent.x - drawStart.x);
      const height = Math.abs(drawCurrent.y - drawStart.y);

      if (width > 10 && height > 10) {
        setRects((prev) => [
          ...prev,
          {
            id: uuidv4(),
            x, y, width, height,
            label: `Snippet ${existingSnippetCount + prev.length + 1}`,
          },
        ]);
      }
      setDrawing(false);
    }
    setDragging(null);
    setResizing(null);
  };

  const handleRectPointerDown = (e: React.PointerEvent, rectId: string) => {
    e.stopPropagation();
    const pos = getRelativePos(e);
    const rect = rects.find((r) => r.id === rectId);
    if (!rect) return;
    setDragging({ id: rectId, offsetX: pos.x - rect.x, offsetY: pos.y - rect.y });
  };

  const handleResizeStart = (e: React.PointerEvent, rectId: string, corner: string) => {
    e.stopPropagation();
    const pos = getRelativePos(e);
    const rect = rects.find((r) => r.id === rectId);
    if (!rect) return;
    setResizing({ id: rectId, corner, startX: pos.x, startY: pos.y, origRect: { ...rect } });
  };

  const deleteRect = (id: string) => {
    setRects((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    if (rects.length === 0) {
      toast.error('Draw at least one snippet region');
      return;
    }
    if (!pageSize) return;

    const scale = pageSize.width / RENDER_WIDTH;
    const pdfHeight = pageSize.height;

    const snippets = rects.map((r) => ({
      id: uuidv4(),
      fileId,
      fileName,
      pageIndex,
      cropBox: {
        x: r.x * scale,
        y: pdfHeight - (r.y + r.height) * scale,
        width: r.width * scale,
        height: r.height * scale,
      },
      pixelCrop: { x: r.x, y: r.y, width: r.width, height: r.height },
      label: r.label,
      createdAt: Date.now(),
    }));

    addSnippets(snippets);
    toast.success(`Saved ${snippets.length} snippet${snippets.length > 1 ? 's' : ''}`);
    setRects([]);
    closeSnippetCropper();
  };

  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const getCornerPos = (rect: Rect, corner: string) => {
    const x = corner.includes('left') ? rect.x : rect.x + rect.width;
    const y = corner.includes('top') ? rect.y : rect.y + rect.height;
    return { x: x - 5, y: y - 5 };
  };
  const getCornerCursor = (corner: string) => {
    if (corner === 'top-left' || corner === 'bottom-right') return 'nwse-resize';
    return 'nesw-resize';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={closeSnippetCropper}>
      <div
        className="bg-gray-900 rounded-xl w-full max-w-[900px] flex flex-col mx-4"
        style={{ height: '95vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Snippet Cropper</h2>
            <p className="text-xs text-gray-500">{fileName} — Page {pageIndex + 1}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{rects.length} region{rects.length !== 1 ? 's' : ''} drawn</span>
            <button onClick={closeSnippetCropper} className="text-gray-500 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="px-5 py-2 bg-blue-500/10 border-b border-gray-700 shrink-0">
          <p className="text-xs text-blue-400">Click and drag on the page to draw snippet regions. Drag to move, use corner handles to resize.</p>
        </div>

        {/* Page + overlay */}
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="flex justify-center">
            <div
              ref={containerRef}
              className="relative inline-block cursor-crosshair select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <Document
                file={pdfUrl}
                onLoadSuccess={() => setPdfLoaded(true)}
                onLoadError={(err) => setPdfError(err?.message || 'Failed to load PDF')}
                loading={
                  <div className="flex items-center justify-center bg-gray-800 rounded" style={{ width: RENDER_WIDTH, height: RENDER_WIDTH * 1.3 }}>
                    <p className="text-gray-400 text-sm">Loading PDF...</p>
                  </div>
                }
                error={
                  <div className="flex items-center justify-center bg-gray-800 rounded" style={{ width: RENDER_WIDTH, height: 400 }}>
                    <p className="text-red-400 text-sm">Failed to load PDF</p>
                  </div>
                }
              >
                <Page
                  pageNumber={pageIndex + 1}
                  width={RENDER_WIDTH}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onRenderSuccess={() => {
                    // Get PDF page dimensions from the rendered canvas
                    const canvas = containerRef.current?.querySelector('canvas');
                    if (canvas) {
                      // react-pdf renders at devicePixelRatio, so we need the CSS dimensions
                      // and map back to PDF points using the known render width
                      const pdfPageEl = containerRef.current?.querySelector('.react-pdf__Page');
                      if (pdfPageEl) {
                        const dataW = pdfPageEl.getAttribute('data-page-number');
                        // Fallback: compute from canvas natural size vs display size
                      }
                    }
                    // Use a simpler approach: get page dimensions from the PDF.js page object
                    // The onRenderSuccess doesn't give us the page object directly in newer react-pdf,
                    // so we'll compute scale from the container
                  }}
                  onLoadSuccess={(page: any) => {
                    // Use original PDF-point dimensions (scale=1 viewport),
                    // not the scaled pixel dimensions from page.width/height
                    setPageSize({
                      width: page.originalWidth,
                      height: page.originalHeight,
                    });
                  }}
                />
              </Document>

              {/* Drawing preview */}
              {drawing && (
                <div
                  className="absolute border-2 border-dashed border-blue-400 bg-blue-400/15 pointer-events-none"
                  style={{
                    left: Math.min(drawStart.x, drawCurrent.x),
                    top: Math.min(drawStart.y, drawCurrent.y),
                    width: Math.abs(drawCurrent.x - drawStart.x),
                    height: Math.abs(drawCurrent.y - drawStart.y),
                  }}
                />
              )}

              {/* Existing rectangles */}
              {rects.map((rect) => (
                <div key={rect.id}>
                  {/* Rect body */}
                  <div
                    data-rect-control
                    className="absolute border-2 border-blue-500 bg-blue-500/15 cursor-move"
                    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                    onPointerDown={(e) => handleRectPointerDown(e, rect.id)}
                  >
                    {/* Label */}
                    <div className="absolute -top-6 left-0 flex items-center gap-1" data-rect-control>
                      {editingLabel === rect.id ? (
                        <input
                          autoFocus
                          className="bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-blue-500 outline-none w-28"
                          value={rect.label}
                          onChange={(e) => setRects((prev) => prev.map((r) => r.id === rect.id ? { ...r, label: e.target.value } : r))}
                          onBlur={() => setEditingLabel(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(null); }}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded cursor-text"
                          onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(rect.id); }}
                        >
                          {rect.label}
                        </span>
                      )}
                    </div>

                    {/* Delete button */}
                    <button
                      data-rect-control
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-white"
                      onPointerDown={(e) => { e.stopPropagation(); deleteRect(rect.id); }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Corner handles */}
                  {corners.map((corner) => {
                    const pos = getCornerPos(rect, corner);
                    return (
                      <div
                        key={corner}
                        data-rect-control
                        className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500"
                        style={{ left: pos.x, top: pos.y, cursor: getCornerCursor(corner) }}
                        onPointerDown={(e) => handleResizeStart(e, rect.id, corner)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700 shrink-0">
          <button
            onClick={() => setRects([])}
            disabled={rects.length === 0}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40"
          >
            Clear All Regions
          </button>
          <div className="flex gap-2">
            <button onClick={closeSnippetCropper} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={rects.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg"
            >
              Save {rects.length} Snippet{rects.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
