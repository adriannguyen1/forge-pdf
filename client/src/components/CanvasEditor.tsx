import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { useAppStore } from '../stores/useAppStore';
import type { CanvasElement, CanvasElementBase, Snippet, SnippetElement, TextElement, ShapeElement, DrawingElement, HyperlinkElement, HighlightElement, TextHighlightElement, CropInset } from '../types';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { storeFileBytes, getOrCreateBlobUrl } from '../stores/fileStore';
import { API_BASE } from '../utils/api';
import { convertImageToPdfTight } from '../services/imageConverter';


const PAGE_SIZES = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

const CANVAS_SCALE = 0.85;
const DEFAULT_CROP: CropInset = { top: 0, right: 0, bottom: 0, left: 0 };

type CanvasMode = 'select' | 'text' | 'shape' | 'draw' | 'highlight' | 'textHighlight' | 'eraser';
type ShapeTool = 'rectangle' | 'ellipse' | 'line';

const PRESET_COLORS = [
  '#000000', '#ffffff', '#6b7280', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#a855f7',
];

export default function CanvasEditor() {
  const canvasEditorPageId = useAppStore((s) => s.canvasEditorPageId);
  const canvasPages = useAppStore((s) => s.canvasPages);
  const closeCanvasEditor = useAppStore((s) => s.closeCanvasEditor);
  const snippets = useAppStore((s) => s.snippets);
  const addElementToCanvas = useAppStore((s) => s.addElementToCanvas);
  const updateElement = useAppStore((s) => s.updateElement);
  const removeElement = useAppStore((s) => s.removeElement);
  const updateCanvasPageSize = useAppStore((s) => s.updateCanvasPageSize);
  const updateCanvasPageLabel = useAppStore((s) => s.updateCanvasPageLabel);
  const addSnippetToStore = useAppStore((s) => s.addSnippet);
  const addFileToStore = useAppStore((s) => s.addFile);

  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);

  // Box/Lasso select sub-tool
  type SelectTool = 'pointer' | 'box' | 'lasso';
  const [selectTool, setSelectTool] = useState<SelectTool>('pointer');
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<Array<{ x: number; y: number }> | null>(null);
  const [cropModeId, setCropModeId] = useState<string | null>(null);
  const [cropOriginalInset, setCropOriginalInset] = useState<CropInset | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('select');
  const [shapeTool, setShapeTool] = useState<ShapeTool>('rectangle');
  const [shapeDropdown, setShapeDropdown] = useState(false);

  // Shape pre-creation colors
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#000000');
  const [shapeFillColor, setShapeFillColor] = useState('#3b82f6');

  // Drawing state
  const [drawColor, setDrawColor] = useState('#000000');
  const [drawWidth, setDrawWidth] = useState(2);
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Box highlight state
  const [textHlColor, setTextHlColor] = useState('#eab308');
  const [textHlCreating, setTextHlCreating] = useState<{ startX: number; startY: number } | null>(null);
  const [textHlPreview, setTextHlPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Highlight brush (freehand highlight) state
  const [highlightColor, setHighlightColor] = useState('#eab308');
  const [highlightWidth, setHighlightWidth] = useState(20);
  const [highlightPoints, setHighlightPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isHighlighting, setIsHighlighting] = useState(false);

  // Signature modal state
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signaturePoints, setSignaturePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isSignDrawing, setIsSignDrawing] = useState(false);
  const signaturePadRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Shape creation drag state
  const [shapeCreating, setShapeCreating] = useState<{ startX: number; startY: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Line-specific creation (click=start, drag, release=tip)
  const [lineCreating, setLineCreating] = useState<{ startX: number; startY: number } | null>(null);
  const [linePreview, setLinePreview] = useState<{ endX: number; endY: number } | null>(null);

  // Line endpoint dragging (Word-style editing)
  const [draggingEndpoint, setDraggingEndpoint] = useState<{ id: string; which: 'start' | 'end' } | null>(null);

  // Interaction state
  const [draggingEl, setDraggingEl] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizingEl, setResizingEl] = useState<{ id: string; corner: string; startX: number; startY: number; orig: CanvasElementBase } | null>(null);
  const [croppingEdge, setCroppingEdge] = useState<{ id: string; edge: string; startPos: number; origInset: CropInset; elWidth: number; elHeight: number } | null>(null);
  const [rotating, setRotating] = useState<{ id: string; centerX: number; centerY: number; startAngle: number; origRotation: number } | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Color picker state
  const [colorPickerTarget, setColorPickerTarget] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const canvasPage = canvasPages.find((p) => p.id === canvasEditorPageId);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editingTextId) {
        if (e.key === 'Escape') setEditingTextId(null);
        return;
      }
      if (e.key === 'Escape') {
        if (canvasMode === 'draw' || canvasMode === 'highlight' || canvasMode === 'textHighlight' || canvasMode === 'eraser') { setCanvasMode('select'); return; }
        if (showSignatureModal) { setShowSignatureModal(false); setSignaturePoints([]); return; }
        if (cropModeId) { revertCrop(); return; }
        closeCanvasEditor();
      }
      if (e.key === 'Enter' && cropModeId) {
        saveCrop();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0 && canvasEditorPageId && !cropModeId) {
        const toDelete = canvasPage?.elements.filter((el) => selectedElementIds.includes(el.id) && !el.locked) || [];
        if (toDelete.length > 0) {
          if (toDelete.length === 1) {
            removeElement(canvasEditorPageId, toDelete[0].id);
          } else {
            // setCanvasElements pushes undo internally
            const remaining = canvasPage!.elements.filter((el) => !toDelete.some((d) => d.id === el.id));
            useAppStore.getState().setCanvasElements(canvasEditorPageId, remaining);
          }
          setSelectedElementIds([]);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeCanvasEditor, selectedElementIds, canvasEditorPageId, removeElement, cropModeId, editingTextId, canvasMode, cropOriginalInset]);

  // Close color picker on click outside
  useEffect(() => {
    if (!colorPickerTarget) return;
    const handler = () => setColorPickerTarget(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [colorPickerTarget]);

  if (!canvasPage || !canvasEditorPageId) return null;

  const pdfSize = canvasPage.pageSize === 'custom' && canvasPage.customWidth && canvasPage.customHeight
    ? { width: canvasPage.customWidth, height: canvasPage.customHeight }
    : PAGE_SIZES[canvasPage.pageSize] || PAGE_SIZES.letter;
  const displayWidth = pdfSize.width * CANVAS_SCALE;
  const displayHeight = pdfSize.height * CANVAS_SCALE;
  const scale = displayWidth / pdfSize.width;

  const getMouseInPdfPts = (e: React.MouseEvent | React.DragEvent | React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  // For property panel: only show controls when exactly one element is selected
  const selectedEl = selectedElementIds.length === 1 ? canvasPage.elements.find((el) => el.id === selectedElementIds[0]) : null;

  // --- Snippet drop ---
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const snippetId = e.dataTransfer.getData('application/snippet-id');
    if (!snippetId) return;
    const snippet = snippets.find((s) => s.id === snippetId);
    if (!snippet) return;
    const pos = getMouseInPdfPts(e);
    addElementToCanvas(canvasEditorPageId, {
      type: 'snippet',
      id: uuidv4(),
      snippetId: snippet.id,
      x: Math.max(0, pos.x - snippet.cropBox.width / 2),
      y: Math.max(0, pos.y - snippet.cropBox.height / 2),
      width: snippet.cropBox.width,
      height: snippet.cropBox.height,
      cropInset: { ...DEFAULT_CROP },
      rotation: 0,
    });
  };

  // --- Canvas pointer handlers ---
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    const onElement = (e.target as HTMLElement).closest('[data-canvas-element]');
    const pos = getMouseInPdfPts(e);

    if (canvasMode === 'text') {
      // Allow text creation on locked elements (e.g. background snippet of a converted page)
      const clickedEl = onElement ? canvasPage?.elements.find(
        (el) => el.id === (onElement as HTMLElement).getAttribute('data-element-id')
      ) : null;
      if (onElement && clickedEl && !clickedEl.locked) return;
      const newId = uuidv4();
      const textEl: TextElement = {
        type: 'text', id: newId,
        x: pos.x - 75, y: pos.y - 20,
        width: 150, height: 40, rotation: 0,
        text: '', fontSize: 16,
        fontFamily: 'Helvetica', bold: false, italic: false,
        textColor: '#000000', textAlign: 'left',
        backgroundColor: '#ffffff00',
      };
      addElementToCanvas(canvasEditorPageId, textEl);
      setSelectedElementIds([newId]);
      setCanvasMode('select');
      return;
    }

    if (canvasMode === 'highlight') {
      setIsHighlighting(true);
      setHighlightPoints([pos]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (canvasMode === 'textHighlight') {
      setTextHlCreating({ startX: pos.x, startY: pos.y });
      setTextHlPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (canvasMode === 'shape' && shapeTool === 'line') {
      setLineCreating({ startX: pos.x, startY: pos.y });
      setLinePreview({ endX: pos.x, endY: pos.y });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (canvasMode === 'shape') {
      setShapeCreating({ startX: pos.x, startY: pos.y });
      setShapePreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (canvasMode === 'draw') {
      setIsDrawing(true);
      setDrawingPoints([pos]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (onElement) return;
    setSelectedElementIds([]);
    if (cropModeId) revertCrop();
    setEditingTextId(null);

    // Start box/lasso select on empty canvas in select mode
    if (canvasMode === 'select' && selectTool !== 'pointer') {
      if (selectTool === 'box') {
        setBoxSelectStart(pos);
        setBoxSelectEnd(pos);
      } else {
        setLassoPoints([pos]);
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handleElementPointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    e.stopPropagation();
    if (el.locked && canvasMode === 'select') return; // locked elements cannot be dragged
    if (canvasMode === 'eraser') {
      if (el.type === 'drawing' || el.type === 'highlight' || el.type === 'textHighlight') {
        removeElement(canvasEditorPageId, el.id);
      }
      return;
    }
    // For creation modes, delegate to the canvas background handler
    if (canvasMode !== 'select') {
      handleCanvasPointerDown(e);
      return;
    }
    if (cropModeId && cropModeId !== el.id) revertCrop();
    if (editingTextId && editingTextId !== el.id) setEditingTextId(null);

    // Ctrl/Cmd+Click: toggle element in/out of selection
    if (e.ctrlKey || e.metaKey) {
      setSelectedElementIds((prev) =>
        prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
      );
      return;
    }

    // If element is already in multi-selection, keep the selection and start drag
    const alreadyInSelection = selectedElementIds.includes(el.id);
    if (!alreadyInSelection) {
      setSelectedElementIds([el.id]);
    }

    if (cropModeId === el.id) return;
    if (editingTextId === el.id) return;
    useAppStore.getState()._pushUndo();
    const pos = getMouseInPdfPts(e);
    setDraggingEl({ id: el.id, offsetX: pos.x - el.x, offsetY: pos.y - el.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleElementDoubleClick = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();
    if (el.locked) return;
    if (el.type === 'snippet') {
      enterCropMode(el.id);
      setSelectedElementIds([el.id]);
    } else if (el.type === 'text' || el.type === 'hyperlink') {
      setEditingTextId(el.id);
      setSelectedElementIds([el.id]);
    }
  };

  const handleRotateStart = (e: React.PointerEvent, el: CanvasElement) => {
    e.stopPropagation();
    useAppStore.getState()._pushUndo();
    const centerX = (el.x + el.width / 2) * scale;
    const centerY = (el.y + el.height / 2) * scale;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;
    const startAngle = Math.atan2(my - centerY, mx - centerX) * (180 / Math.PI);
    setRotating({ id: el.id, centerX, centerY, startAngle, origRotation: el.rotation || 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getMouseInPdfPts(e);

    // Box select drag
    if (boxSelectStart) {
      setBoxSelectEnd(pos);
      return;
    }

    // Lasso select drag
    if (lassoPoints) {
      const last = lassoPoints[lassoPoints.length - 1];
      if (last && Math.hypot(pos.x - last.x, pos.y - last.y) >= 3) {
        setLassoPoints((prev) => prev ? [...prev, pos] : [pos]);
      }
      return;
    }

    // Freehand drawing
    if (isDrawing && canvasMode === 'draw') {
      const last = drawingPoints[drawingPoints.length - 1];
      if (last && Math.hypot(pos.x - last.x, pos.y - last.y) >= 2) {
        setDrawingPoints((prev) => [...prev, pos]);
      }
      return;
    }

    // Highlight drawing
    if (isHighlighting && canvasMode === 'highlight') {
      const last = highlightPoints[highlightPoints.length - 1];
      if (last && Math.hypot(pos.x - last.x, pos.y - last.y) >= 2) {
        setHighlightPoints((prev) => [...prev, pos]);
      }
      return;
    }

    // Text highlight creation drag
    if (textHlCreating) {
      const x = Math.min(textHlCreating.startX, pos.x);
      const y = Math.min(textHlCreating.startY, pos.y);
      const w = Math.abs(pos.x - textHlCreating.startX);
      const h = Math.abs(pos.y - textHlCreating.startY);
      setTextHlPreview({ x, y, w, h });
      return;
    }

    // Line creation drag
    if (lineCreating) {
      setLinePreview({ endX: pos.x, endY: pos.y });
      return;
    }

    // Endpoint drag
    if (draggingEndpoint) {
      const el = canvasPage?.elements.find((e) => e.id === draggingEndpoint.id) as import('../types').ShapeElement | undefined;
      if (el && el.startPoint && el.endPoint) {
        const newStart = draggingEndpoint.which === 'start' ? { x: pos.x, y: pos.y } : el.startPoint;
        const newEnd = draggingEndpoint.which === 'end' ? { x: pos.x, y: pos.y } : el.endPoint;
        const pad = Math.max(10, (el.strokeWidth || 2) * 3);
        const minX = Math.min(newStart.x, newEnd.x) - pad;
        const minY = Math.min(newStart.y, newEnd.y) - pad;
        const maxX = Math.max(newStart.x, newEnd.x) + pad;
        const maxY = Math.max(newStart.y, newEnd.y) + pad;
        updateElement(canvasEditorPageId, el.id, {
          startPoint: newStart, endPoint: newEnd,
          x: minX, y: minY, width: maxX - minX, height: maxY - minY,
        });
      }
      return;
    }

    // Shape creation drag
    if (shapeCreating) {
      const x = Math.min(shapeCreating.startX, pos.x);
      const y = Math.min(shapeCreating.startY, pos.y);
      const w = Math.abs(pos.x - shapeCreating.startX);
      const h = Math.abs(pos.y - shapeCreating.startY);
      setShapePreview({ x, y, w, h });
      return;
    }

    if (rotating) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const mx = e.clientX - canvasRect.left;
      const my = e.clientY - canvasRect.top;
      const currentAngle = Math.atan2(my - rotating.centerY, mx - rotating.centerX) * (180 / Math.PI);
      let newRotation = rotating.origRotation + (currentAngle - rotating.startAngle);
      const snapAngles = [0, 90, 180, 270, -90, -180, -270, 360];
      for (const snap of snapAngles) {
        if (Math.abs(newRotation - snap) < 5) { newRotation = snap; break; }
      }
      newRotation = ((newRotation % 360) + 360) % 360;
      updateElement(canvasEditorPageId, rotating.id, { rotation: newRotation });
    } else if (croppingEdge) {
      const c = croppingEdge;
      const el = canvasPage.elements.find((el) => el.id === c.id);
      if (!el || el.type !== 'snippet') return;
      const newInset = { ...c.origInset };
      if (c.edge === 'top') newInset.top = Math.max(0, Math.min(0.9, c.origInset.top + (pos.y - c.startPos) / c.elHeight));
      else if (c.edge === 'bottom') newInset.bottom = Math.max(0, Math.min(0.9, c.origInset.bottom - (pos.y - c.startPos) / c.elHeight));
      else if (c.edge === 'left') newInset.left = Math.max(0, Math.min(0.9, c.origInset.left + (pos.x - c.startPos) / c.elWidth));
      else if (c.edge === 'right') newInset.right = Math.max(0, Math.min(0.9, c.origInset.right - (pos.x - c.startPos) / c.elWidth));
      if (newInset.top + newInset.bottom >= 0.95 || newInset.left + newInset.right >= 0.95) return;
      updateElement(canvasEditorPageId, c.id, { cropInset: newInset });
    } else if (draggingEl) {
      const newX = Math.max(0, pos.x - draggingEl.offsetX);
      const newY = Math.max(0, pos.y - draggingEl.offsetY);
      const dragEl = canvasPage?.elements.find((e) => e.id === draggingEl.id);
      if (!dragEl) return;
      const dx = newX - dragEl.x;
      const dy = newY - dragEl.y;

      // Move all selected elements together
      const idsToMove = selectedElementIds.includes(draggingEl.id) && selectedElementIds.length > 1
        ? selectedElementIds : [draggingEl.id];

      for (const moveId of idsToMove) {
        const moveEl = canvasPage?.elements.find((e) => e.id === moveId);
        if (!moveEl || moveEl.locked) continue;
        const mNewX = Math.max(0, moveEl.x + dx);
        const mNewY = Math.max(0, moveEl.y + dy);
        if (moveEl.type === 'shape' && moveEl.shapeKind === 'line' && moveEl.startPoint && moveEl.endPoint) {
          updateElement(canvasEditorPageId, moveId, {
            x: mNewX, y: mNewY,
            startPoint: { x: moveEl.startPoint.x + dx, y: moveEl.startPoint.y + dy },
            endPoint: { x: moveEl.endPoint.x + dx, y: moveEl.endPoint.y + dy },
          });
        } else {
          updateElement(canvasEditorPageId, moveId, { x: mNewX, y: mNewY });
        }
      }
    } else if (resizingEl) {
      const rawDx = pos.x - resizingEl.startX;
      const rawDy = pos.y - resizingEl.startY;
      const o = resizingEl.orig;
      const handle = resizingEl.corner;

      // Rotate the world-space mouse delta into the element's local coordinate
      // system so that resize handles work correctly when the element is rotated.
      const rot = o.rotation || 0;
      const rad = (-rot * Math.PI) / 180;
      const dx = rawDx * Math.cos(rad) - rawDy * Math.sin(rad);
      const dy = rawDx * Math.sin(rad) + rawDy * Math.cos(rad);
      let nw = o.width, nh = o.height;
      const isCorner = handle.includes('-'); // e.g. 'top-left'
      const aspect = o.width / o.height;

      // Which edges are anchored (opposite the handle being dragged)
      let anchorRight = false, anchorLeft = false, anchorTop = false, anchorBottom = false;

      if (isCorner) {
        // Corner handles: maintain aspect ratio
        if (handle.includes('right') || handle.includes('left')) {
          const delta = handle.includes('left') ? -dx : dx;
          nw = Math.max(20, o.width + delta);
          nh = Math.max(20, nw / aspect);
          nw = nh * aspect;
        }
        if (handle.includes('left'))  anchorRight = true;
        else                          anchorLeft = true;
        if (handle.includes('top'))   anchorBottom = true;
        else                          anchorTop = true;
      } else {
        // Side handles: change only one dimension
        switch (handle) {
          case 'right':  nw = Math.max(20, o.width + dx);  anchorLeft = true; break;
          case 'left':   nw = Math.max(20, o.width - dx);  anchorRight = true; break;
          case 'bottom': nh = Math.max(20, o.height + dy); anchorTop = true; break;
          case 'top':    nh = Math.max(20, o.height - dy); anchorBottom = true; break;
        }
      }

      // Compute the anchor point in local space (fraction of original bbox).
      // The anchor is the edge/corner opposite the handle: it should stay fixed in world space.
      const anchorLocalX = anchorLeft ? 0 : anchorRight ? 1 : 0.5;
      const anchorLocalY = anchorTop ? 0 : anchorBottom ? 1 : 0.5;

      // World-space position of the anchor on the ORIGINAL element (rotation around center)
      const rotRad = (rot * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      const oCx = o.x + o.width / 2;
      const oCy = o.y + o.height / 2;
      const oAx = (anchorLocalX - 0.5) * o.width;
      const oAy = (anchorLocalY - 0.5) * o.height;
      const oldAnchorWorldX = oCx + oAx * cosR - oAy * sinR;
      const oldAnchorWorldY = oCy + oAx * sinR + oAy * cosR;

      // After resize, the new center would naively be at (o.x + nw/2, o.y + nh/2).
      // Compute where the anchor point would end up with that naive center.
      const naiveCx = o.x + nw / 2;
      const naiveCy = o.y + nh / 2;
      const nAx = (anchorLocalX - 0.5) * nw;
      const nAy = (anchorLocalY - 0.5) * nh;
      const naiveAnchorX = naiveCx + nAx * cosR - nAy * sinR;
      const naiveAnchorY = naiveCy + nAx * sinR + nAy * cosR;

      // Shift position so the anchor stays in its original world-space location
      const nx = o.x + (oldAnchorWorldX - naiveAnchorX);
      const ny = o.y + (oldAnchorWorldY - naiveAnchorY);

      updateElement(canvasEditorPageId, resizingEl.id, { x: nx, y: ny, width: nw, height: nh });
    }
  };

  // Point-in-polygon test using ray casting algorithm
  const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handlePointerUp = () => {
    // Finalize box select
    if (boxSelectStart && boxSelectEnd) {
      const minX = Math.min(boxSelectStart.x, boxSelectEnd.x);
      const minY = Math.min(boxSelectStart.y, boxSelectEnd.y);
      const maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
      const maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
      // Only select if the marquee has some size (not just a click)
      if (maxX - minX > 3 || maxY - minY > 3) {
        const hits = canvasPage.elements.filter((el) => {
          if (el.locked) return false;
          // Rectangle intersection test
          return !(el.x + el.width < minX || el.x > maxX || el.y + el.height < minY || el.y > maxY);
        });
        setSelectedElementIds(hits.map((el) => el.id));
      }
      setBoxSelectStart(null);
      setBoxSelectEnd(null);
      return;
    }

    // Finalize lasso select
    if (lassoPoints && lassoPoints.length >= 3) {
      const hits = canvasPage.elements.filter((el) => {
        if (el.locked) return false;
        const center = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
        return pointInPolygon(center, lassoPoints);
      });
      setSelectedElementIds(hits.map((el) => el.id));
    }
    setLassoPoints(null);

    // Finalize freehand drawing
    if (isDrawing && drawingPoints.length >= 2) {
      const xs = drawingPoints.map((p) => p.x);
      const ys = drawingPoints.map((p) => p.y);
      const pad = drawWidth + 2;
      const minX = Math.min(...xs) - pad;
      const minY = Math.min(...ys) - pad;
      const bw = Math.max(20, Math.max(...xs) - minX + pad);
      const bh = Math.max(20, Math.max(...ys) - minY + pad);
      const relPoints = drawingPoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));
      const drawEl: DrawingElement = {
        type: 'drawing', id: uuidv4(),
        x: minX, y: minY, width: bw, height: bh, rotation: 0,
        points: relPoints, strokeColor: drawColor, strokeWidth: drawWidth,
      };
      addElementToCanvas(canvasEditorPageId, drawEl);
    }
    setIsDrawing(false);
    setDrawingPoints([]);

    // Finalize highlight stroke
    if (isHighlighting && highlightPoints.length >= 2) {
      const xs = highlightPoints.map((p) => p.x);
      const ys = highlightPoints.map((p) => p.y);
      const pad = highlightWidth + 2;
      const minX = Math.min(...xs) - pad;
      const minY = Math.min(...ys) - pad;
      const bw = Math.max(20, Math.max(...xs) - minX + pad);
      const bh = Math.max(20, Math.max(...ys) - minY + pad);
      const relPoints = highlightPoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));
      const hlEl: HighlightElement = {
        type: 'highlight', id: uuidv4(),
        x: minX, y: minY, width: bw, height: bh, rotation: 0,
        points: relPoints, color: highlightColor, opacity: 0.35, strokeWidth: highlightWidth,
      };
      addElementToCanvas(canvasEditorPageId, hlEl);
    }
    setIsHighlighting(false);
    setHighlightPoints([]);

    // Finalize shape creation
    // Finalize text highlight rectangle
    if (textHlCreating && textHlPreview) {
      const { x, y, w, h } = textHlPreview;
      if (w >= 5 && h >= 5) {
        const hlEl: TextHighlightElement = {
          type: 'textHighlight', id: uuidv4(),
          x, y, width: w, height: h, rotation: 0,
          color: textHlColor, opacity: 0.35,
        };
        addElementToCanvas(canvasEditorPageId, hlEl);
        setSelectedElementIds([hlEl.id]);
      }
    }
    setTextHlCreating(null);
    setTextHlPreview(null);

    // Finalize line creation
    if (lineCreating && linePreview) {
      const sp = { x: lineCreating.startX, y: lineCreating.startY };
      const ep = { x: linePreview.endX, y: linePreview.endY };
      const dist = Math.hypot(ep.x - sp.x, ep.y - sp.y);
      if (dist >= 5) {
        const pad = 10;
        const minX = Math.min(sp.x, ep.x) - pad;
        const minY = Math.min(sp.y, ep.y) - pad;
        const maxX = Math.max(sp.x, ep.x) + pad;
        const maxY = Math.max(sp.y, ep.y) + pad;
        const lineEl: ShapeElement = {
          type: 'shape', id: uuidv4(),
          x: minX, y: minY, width: maxX - minX, height: maxY - minY, rotation: 0,
          shapeKind: 'line', fillColor: '#ffffff00',
          strokeColor: shapeStrokeColor, strokeWidth: 2, arrowHead: 'none',
          startPoint: sp, endPoint: ep,
        };
        addElementToCanvas(canvasEditorPageId, lineEl);
        setSelectedElementIds([lineEl.id]);
        setCanvasMode('select');
      }
    }
    setLineCreating(null);
    setLinePreview(null);

    if (shapeCreating && shapePreview) {
      const { x, y, w, h } = shapePreview;
      const finalW = w < 10 ? 100 : w;
      const finalH = h < 10 ? 100 : h;
      const finalX = w < 10 ? shapeCreating.startX - 50 : x;
      const finalY = h < 10 ? shapeCreating.startY - 50 : y;
      const shapeEl: ShapeElement = {
        type: 'shape', id: uuidv4(),
        x: finalX, y: finalY, width: finalW, height: finalH, rotation: 0,
        shapeKind: shapeTool, fillColor: shapeFillColor,
        strokeColor: shapeStrokeColor, strokeWidth: 2, arrowHead: 'none',
      };
      addElementToCanvas(canvasEditorPageId, shapeEl);
      setSelectedElementIds([shapeEl.id]);
      setCanvasMode('select');
    }
    setShapeCreating(null);
    setShapePreview(null);

    setDraggingEl(null);
    setResizingEl(null);
    setCroppingEdge(null);
    setRotating(null);
    setDraggingEndpoint(null);
  };

  const handleResizeStart = (e: React.PointerEvent, el: CanvasElement, corner: string) => {
    e.stopPropagation();
    useAppStore.getState()._pushUndo();
    const pos = getMouseInPdfPts(e);
    setResizingEl({ id: el.id, corner, startX: pos.x, startY: pos.y, orig: { ...el } });
  };

  const handleCropEdgeStart = (e: React.PointerEvent, el: SnippetElement, edge: string) => {
    e.stopPropagation();
    const pos = getMouseInPdfPts(e);
    const startPos = (edge === 'top' || edge === 'bottom') ? pos.y : pos.x;
    setCroppingEdge({
      id: el.id, edge, startPos,
      origInset: { ...(el.cropInset || DEFAULT_CROP) },
      elWidth: el.width, elHeight: el.height,
    });
  };

  const enterCropMode = (elId: string) => {
    const el = canvasPage.elements.find((e) => e.id === elId);
    if (!el || el.type !== 'snippet') return;
    setCropModeId(elId);
    setCropOriginalInset({ ...(el.cropInset || DEFAULT_CROP) });
  };

  const saveCrop = () => {
    if (cropModeId && canvasEditorPageId) {
      const el = canvasPage.elements.find((e) => e.id === cropModeId);
      if (el && el.type === 'snippet') {
        const ci = el.cropInset || DEFAULT_CROP;
        const hasInset = ci.top > 0 || ci.right > 0 || ci.bottom > 0 || ci.left > 0;

        if (hasInset) {
          const snippet = getSnippet(el.snippetId);
          if (snippet) {
            // Use existing overrides if present (from previous crops), else snippet originals
            const basePx = el.pixelCropOverride || snippet.pixelCrop;
            const baseCb = el.cropBoxOverride || snippet.cropBox;

            // Bake cropInset into new pixel crop
            const newPixelCrop = {
              x: basePx.x + basePx.width * ci.left,
              y: basePx.y + basePx.height * ci.top,
              width: basePx.width * (1 - ci.left - ci.right),
              height: basePx.height * (1 - ci.top - ci.bottom),
            };

            // Bake cropInset into new cropBox (PDF coords — y from bottom, so bottom inset shifts y up)
            const newCropBox = {
              x: baseCb.x + baseCb.width * ci.left,
              y: baseCb.y + baseCb.height * ci.bottom,
              width: baseCb.width * (1 - ci.left - ci.right),
              height: baseCb.height * (1 - ci.top - ci.bottom),
            };

            // Resize element to match cropped region
            const newWidth = el.width * (1 - ci.left - ci.right);
            const newHeight = el.height * (1 - ci.top - ci.bottom);
            const newX = el.x + el.width * ci.left;
            const newY = el.y + el.height * ci.top;

            updateElement(canvasEditorPageId, cropModeId, {
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
              cropInset: { ...DEFAULT_CROP },
              pixelCropOverride: newPixelCrop,
              cropBoxOverride: newCropBox,
            });
          }
        }
      }
    }
    setCropModeId(null);
    setCropOriginalInset(null);
  };

  const revertCrop = () => {
    if (cropModeId && cropOriginalInset) {
      updateElement(canvasEditorPageId, cropModeId, { cropInset: { ...cropOriginalInset } });
    }
    setCropModeId(null);
    setCropOriginalInset(null);
  };

  const getSnippet = (snippetId: string): Snippet | undefined =>
    snippets.find((s) => s.id === snippetId);

  const handleImageAsSnippet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsUploadingImage(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { pdfBytes, pageWidth, pageHeight } = await convertImageToPdfTight(arrayBuffer, file.type);
      const fileId = uuidv4();
      storeFileBytes(fileId, pdfBytes);
      const fileName = file.name;
      const pageCount = 1;

      addFileToStore({ id: fileId, fileName, pageCount });

      const RENDER_W = 700;
      const pixelH = RENDER_W * (pageHeight / pageWidth);

      const snippetId = uuidv4();
      const snippet = {
        id: snippetId,
        fileId,
        fileName,
        pageIndex: 0,
        cropBox: { x: 0, y: 0, width: pageWidth, height: pageHeight },
        pixelCrop: { x: 0, y: 0, width: RENDER_W, height: pixelH },
        label: fileName.replace(/\.[^.]+$/, ''),
        createdAt: Date.now(),
      };
      addSnippetToStore(snippet);

      // Place on canvas — scale to fit within the page if the image is larger
      const fitScale = Math.min(1, pdfSize.width / pageWidth, pdfSize.height / pageHeight);
      const elW = pageWidth * fitScale;
      const elH = pageHeight * fitScale;
      addElementToCanvas(canvasEditorPageId, {
        type: 'snippet',
        id: uuidv4(),
        snippetId,
        x: pdfSize.width / 2 - elW / 2,
        y: pdfSize.height / 2 - elH / 2,
        width: elW,
        height: elH,
        cropInset: { top: 0, right: 0, bottom: 0, left: 0 },
        rotation: 0,
      });

      toast.success('Image added as snippet');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image');
      console.error(err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const resizeCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const resizeSides = ['top', 'right', 'bottom', 'left'];
  const cropEdges = ['top', 'right', 'bottom', 'left'];

  // --- Toolbar mode button ---
  const ModeBtn = ({ mode, label, children }: { mode: CanvasMode; label: string; children: React.ReactNode }) => (
    <button
      onClick={() => { setCanvasMode(mode); setShapeDropdown(false); }}
      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors ${canvasMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
      title={label}
    >
      {children}
    </button>
  );

  // --- Color picker popover ---
  const ColorPicker = ({ value, onChange, id }: { value: string; onChange: (c: string) => void; id: string }) => (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        className="w-5 h-5 rounded border border-gray-600 shrink-0"
        style={{ backgroundColor: value.endsWith('00') ? 'transparent' : value }}
        onClick={() => setColorPickerTarget(colorPickerTarget === id ? null : id)}
      />
      {colorPickerTarget === id && (
        <div className="absolute top-7 left-0 z-50 bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-xl">
          <div className="grid grid-cols-4 gap-1 mb-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`w-5 h-5 rounded border ${value === c ? 'border-white' : 'border-gray-600'}`}
                style={{ backgroundColor: c }}
                onClick={() => { onChange(c); setColorPickerTarget(null); }}
              />
            ))}
          </div>
          <button
            className="w-full text-xs text-gray-400 hover:text-white py-0.5"
            onClick={() => { onChange('#ffffff00'); setColorPickerTarget(null); }}
          >
            Transparent
          </button>
          <input
            type="text"
            className="w-full mt-1 bg-gray-900 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setColorPickerTarget(null); }}
            placeholder="#000000"
          />
        </div>
      )}
    </div>
  );

  // --- Render element content by type ---
  const renderElementContent = (el: CanvasElement) => {
    const w = el.width * scale;
    const h = el.height * scale;

    switch (el.type) {
      case 'snippet': {
        const snippet = getSnippet(el.snippetId);
        if (!snippet) return <div className="w-full h-full bg-gray-200" />;
        return <SnippetPreview snippet={snippet} targetWidth={w} targetHeight={h} cropInset={el.cropInset} isCropping={cropModeId === el.id} cropBoxOverride={el.cropBoxOverride} />;
      }
      case 'text': {
        const isEditing = editingTextId === el.id;
        return (
          <div style={{
            width: w, height: h, padding: 4 * scale,
            backgroundColor: el.backgroundColor.endsWith('00') ? 'transparent' : el.backgroundColor,
            overflow: 'hidden',
          }}>
            {isEditing ? (
              <textarea
                autoFocus
                value={el.text}
                onChange={(e) => updateElement(canvasEditorPageId, el.id, { text: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={() => setEditingTextId(null)}
                style={{
                  width: '100%', height: '100%',
                  fontSize: el.fontSize * scale, fontFamily: el.fontFamily,
                  fontWeight: el.bold ? 'bold' : 'normal',
                  fontStyle: el.italic ? 'italic' : 'normal',
                  color: el.textColor, textAlign: el.textAlign,
                  background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                fontSize: el.fontSize * scale, fontFamily: el.fontFamily,
                fontWeight: el.bold ? 'bold' : 'normal',
                fontStyle: el.italic ? 'italic' : 'normal',
                color: el.textColor, textAlign: el.textAlign,
                wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflow: 'hidden',
              }}>
                {el.text || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Double-click to edit</span>}
              </div>
            )}
          </div>
        );
      }
      case 'shape': {
        const sw = el.strokeWidth * scale;
        return (
          <svg width={w} height={h} style={{ overflow: 'visible' }}>
            {el.shapeKind === 'rectangle' && (
              <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)}
                fill={el.fillColor.endsWith('00') ? 'none' : el.fillColor}
                stroke={el.strokeColor} strokeWidth={sw} />
            )}
            {el.shapeKind === 'ellipse' && (
              <ellipse cx={w / 2} cy={h / 2}
                rx={Math.max(0, (w - sw) / 2)} ry={Math.max(0, (h - sw) / 2)}
                fill={el.fillColor.endsWith('00') ? 'none' : el.fillColor}
                stroke={el.strokeColor} strokeWidth={sw} />
            )}
            {el.shapeKind === 'line' && (() => {
              // New endpoint model: convert absolute coords to local SVG coords
              const sx = el.startPoint ? (el.startPoint.x - el.x) * scale : 0;
              const sy = el.startPoint ? (el.startPoint.y - el.y) * scale : h;
              const ex = el.endPoint ? (el.endPoint.x - el.x) * scale : w;
              const ey = el.endPoint ? (el.endPoint.y - el.y) * scale : 0;
              const angle = Math.atan2(ey - sy, ex - sx);
              return (
                <>
                  <line x1={sx} y1={sy} x2={ex} y2={ey}
                    stroke={el.strokeColor} strokeWidth={sw} strokeLinecap="round" />
                  {el.arrowHead && el.arrowHead !== 'none' && (() => {
                    const ahStyle = el.arrowHead === true ? 'open' : el.arrowHead;
                    const aLen = Math.max(16, (el.strokeWidth || 2) * 5) * scale;
                    const aAng = Math.PI / 6;
                    const lx = ex - aLen * Math.cos(angle - aAng);
                    const ly = ey - aLen * Math.sin(angle - aAng);
                    const rx = ex - aLen * Math.cos(angle + aAng);
                    const ry = ey - aLen * Math.sin(angle + aAng);

                    if (ahStyle === 'open') {
                      return (
                        <>
                          <line x1={ex} y1={ey} x2={lx} y2={ly}
                            stroke={el.strokeColor} strokeWidth={sw} strokeLinecap="round" />
                          <line x1={ex} y1={ey} x2={rx} y2={ry}
                            stroke={el.strokeColor} strokeWidth={sw} strokeLinecap="round" />
                        </>
                      );
                    }
                    if (ahStyle === 'filled') {
                      return (
                        <polygon points={`${ex},${ey} ${lx},${ly} ${rx},${ry}`}
                          fill={el.strokeColor} stroke="none" />
                      );
                    }
                    if (ahStyle === 'diamond') {
                      const mx = (lx + rx) / 2, my = (ly + ry) / 2;
                      const bx = mx + (mx - ex), by = my + (my - ey);
                      return (
                        <polygon points={`${ex},${ey} ${lx},${ly} ${bx},${by} ${rx},${ry}`}
                          fill={el.strokeColor} stroke="none" />
                      );
                    }
                    return null;
                  })()}
                </>
              );
            })()}
          </svg>
        );
      }
      case 'drawing': {
        if (el.points.length < 2) return null;
        const pathData = `M ${el.points.map((p) => `${p.x * scale} ${p.y * scale}`).join(' L ')}`;
        return (
          <svg width={w} height={h} style={{ overflow: 'visible' }}>
            <path d={pathData} fill="none"
              stroke={el.strokeColor} strokeWidth={el.strokeWidth * scale}
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      }
      case 'highlight': {
        if (el.points.length < 2) return null;
        const pathData = `M ${el.points.map((p) => `${p.x * scale} ${p.y * scale}`).join(' L ')}`;
        return (
          <svg width={w} height={h} style={{ overflow: 'visible', opacity: el.opacity }}>
            <path d={pathData} fill="none"
              stroke={el.color} strokeWidth={el.strokeWidth * scale}
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      }
      case 'textHighlight': {
        return (
          <div style={{
            width: w, height: h,
            backgroundColor: el.color,
            opacity: el.opacity,
            borderRadius: 2 * scale,
          }} />
        );
      }
      case 'hyperlink': {
        const isEditing = editingTextId === el.id;
        return (
          <div style={{
            width: w, height: h, padding: 4 * scale,
            overflow: 'hidden',
          }}>
            {isEditing ? (
              <textarea
                autoFocus
                value={el.text}
                onChange={(e) => updateElement(canvasEditorPageId, el.id, { text: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={() => setEditingTextId(null)}
                style={{
                  width: '100%', height: '100%',
                  fontSize: el.fontSize * scale, fontFamily: el.fontFamily,
                  color: '#2563eb', textDecoration: 'underline',
                  background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                fontSize: el.fontSize * scale, fontFamily: el.fontFamily,
                color: '#2563eb', textDecoration: 'underline',
                wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflow: 'hidden',
                cursor: 'pointer',
              }}>
                {el.text || <span style={{ color: '#93c5fd', fontStyle: 'italic' }}>Double-click to edit</span>}
              </div>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex" onClick={() => { if (cropModeId) { revertCrop(); } setEditingTextId(null); closeCanvasEditor(); }}>
      <div className="flex flex-1 m-4 gap-0 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Left sidebar: Snippets + Add Elements */}
        <div className="w-56 bg-gray-900 border-r border-gray-700 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-700">
            <h3 className="text-xs font-semibold text-gray-400">Snippet Library</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {snippets.length === 0 ? (
              <p className="text-xs text-gray-600 text-center mt-4">No snippets yet.</p>
            ) : (
              snippets.map((snippet) => (
                <div key={snippet.id} draggable
                  onDragStart={(e) => { e.dataTransfer.setData('application/snippet-id', snippet.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded bg-gray-800 border border-gray-700 cursor-grab active:cursor-grabbing hover:border-purple-500/50"
                >
                  <div className="w-8 h-8 rounded bg-purple-600/30 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-300 truncate">{snippet.label}</p>
                    <p className="text-xs text-gray-600 truncate">{snippet.fileName}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Quick add buttons */}
          <div className="px-2 py-2 border-t border-gray-700 space-y-1">
            <button onClick={() => { setCanvasMode('select'); setSelectTool('pointer'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'select' && selectTool === 'pointer' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg> Selection Tool
            </button>
            <button onClick={() => { setCanvasMode('select'); setSelectTool('box'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'select' && selectTool === 'box' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="3 2"><rect x="3" y="3" width="18" height="18" rx="1" /></svg> Box Select
            </button>
            <button onClick={() => { setCanvasMode('select'); setSelectTool('lasso'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'select' && selectTool === 'lasso' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3C7 3 3 7 3 11c0 3 2 5.5 5 6.5M17 18c-1.5 1-3 1.5-5 1.5" strokeLinecap="round" /><path d="M21 11c0-4-3.5-8-9-8" strokeLinecap="round" /><circle cx="17" cy="18" r="2.5" fill="currentColor" /></svg> Lasso Select
            </button>
            <p className="text-xs text-gray-500 px-1 mt-2 mb-1">Add Elements</p>
            <button onClick={() => setCanvasMode('text')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <span className="font-bold text-sm w-4 text-center">T</span> Text Box
            </button>
            <button onClick={() => { setCanvasMode('shape'); setShapeTool('rectangle'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'shape' && shapeTool === 'rectangle' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /></svg> Rectangle
            </button>
            <button onClick={() => { setCanvasMode('shape'); setShapeTool('ellipse'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'shape' && shapeTool === 'ellipse' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="12" rx="9" ry="7" /></svg> Ellipse
            </button>
            <button onClick={() => { setCanvasMode('shape'); setShapeTool('line'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'shape' && shapeTool === 'line' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><line x1="5" y1="19" x2="19" y2="5" /></svg> Line / Arrow
            </button>
            <button onClick={() => setCanvasMode('draw')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Freehand
            </button>
            <button onClick={() => setCanvasMode('textHighlight')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'textHighlight' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Box Highlight
            </button>
            <button onClick={() => setCanvasMode('highlight')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'highlight' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Highlight Brush
            </button>
            <button onClick={() => setCanvasMode('eraser')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${canvasMode === 'eraser' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 20H9l-5.5-5.5a2 2 0 010-2.83l8.17-8.17a2 2 0 012.83 0L20 9" /><path strokeLinecap="round" d="M18 13l-1.5-1.5" /></svg> Eraser
            </button>
            <button onClick={() => {
                const newId = uuidv4();
                const hlEl: HyperlinkElement = {
                  type: 'hyperlink', id: newId,
                  x: pdfSize.width / 2 - 75, y: pdfSize.height / 2 - 15,
                  width: 150, height: 30, rotation: 0,
                  text: '', url: '', fontSize: 14, fontFamily: 'Helvetica',
                };
                addElementToCanvas(canvasEditorPageId, hlEl);
                setSelectedElementIds([newId]);
                setCanvasMode('select');
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> Hyperlink
            </button>
            <button onClick={() => setShowSignatureModal(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 113.004 2.938L7.5 18.79l-4 1 1-4L16.862 3.487z" /><path strokeLinecap="round" d="M3 21h18" /></svg> Signature
            </button>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageAsSnippet} />
            <button onClick={() => imageInputRef.current?.click()} disabled={isUploadingImage}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg> {isUploadingImage ? 'Uploading...' : 'Image as Snippet'}
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 bg-gray-950 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {editingLabel ? (
                <input autoFocus className="bg-gray-800 text-sm text-white px-2 py-0.5 rounded border border-blue-500 outline-none w-32"
                  value={canvasPage.label} onChange={(e) => updateCanvasPageLabel(canvasEditorPageId, e.target.value)}
                  onBlur={() => setEditingLabel(false)} onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }} />
              ) : (
                <h2 className="text-sm font-medium text-white cursor-text" onDoubleClick={() => setEditingLabel(true)} title="Double-click to rename">
                  {canvasPage.label}
                </h2>
              )}
              {canvasPage.pageSize === 'custom' ? (
                <span className="text-xs text-gray-400 px-2 py-1 bg-gray-800 border border-gray-700 rounded">
                  {Math.round(pdfSize.width)} x {Math.round(pdfSize.height)} pt
                </span>
              ) : (
                <select value={canvasPage.pageSize} onChange={(e) => updateCanvasPageSize(canvasEditorPageId, e.target.value as 'letter' | 'a4')}
                  className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded border border-gray-700">
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </select>
              )}

              <div className="w-px h-5 bg-gray-700 mx-1" />

              {/* Tool mode buttons */}
              <ModeBtn mode="select" label="Select (V)">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                </svg>
              </ModeBtn>
              <ModeBtn mode="text" label="Text (T)">
                <span className="font-bold text-xs">T</span>
              </ModeBtn>
              <ModeBtn mode="draw" label="Draw">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </ModeBtn>
            </div>

            {/* Context-sensitive property controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {canvasMode === 'draw' && (
                <>
                  <span className="text-xs text-gray-500">Stroke:</span>
                  <ColorPicker value={drawColor} onChange={setDrawColor} id="draw-color" />
                  <input type="number" min={1} max={20} value={drawWidth} onChange={(e) => setDrawWidth(Number(e.target.value))}
                    className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                  <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">Drawing mode active</span>
                </>
              )}

              {canvasMode === 'highlight' && (
                <>
                  <span className="text-xs text-gray-500">Color:</span>
                  <ColorPicker value={highlightColor} onChange={setHighlightColor} id="hl-draw-color" />
                  <span className="text-xs text-gray-500">Width:</span>
                  <input type="number" min={5} max={60} value={highlightWidth} onChange={(e) => setHighlightWidth(Number(e.target.value))}
                    className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                  <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">Highlight Brush mode active</span>
                </>
              )}

              {canvasMode === 'textHighlight' && (
                <>
                  <span className="text-xs text-gray-500">Color:</span>
                  <ColorPicker value={textHlColor} onChange={setTextHlColor} id="text-hl-color" />
                  <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">Box Highlight — drag to highlight</span>
                </>
              )}

              {canvasMode === 'shape' && (
                <>
                  <span className="text-xs text-gray-500">Stroke:</span>
                  <ColorPicker value={shapeStrokeColor} onChange={setShapeStrokeColor} id="shape-pre-stroke" />
                  {shapeTool !== 'line' && (
                    <>
                      <span className="text-xs text-gray-500">Fill:</span>
                      <ColorPicker value={shapeFillColor} onChange={setShapeFillColor} id="shape-pre-fill" />
                    </>
                  )}
                  <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {shapeTool === 'line' ? 'Line / Arrow' : shapeTool === 'ellipse' ? 'Ellipse' : 'Rectangle'} — drag to create
                  </span>
                </>
              )}

              {canvasMode === 'eraser' && (
                <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">Eraser — click drawings or highlights to remove</span>
              )}

              {cropModeId && (
                <>
                  <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded">
                    Crop Mode — drag edges to adjust
                  </span>
                  <button onClick={() => updateElement(canvasEditorPageId, cropModeId, { cropInset: { ...DEFAULT_CROP } })}
                    className="text-xs px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded">Reset Crop</button>
                  <button onClick={revertCrop}
                    className="text-xs px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded">Revert</button>
                  <button onClick={saveCrop}
                    className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded font-medium">Save Crop</button>
                </>
              )}

              {selectedElementIds.length > 1 && !cropModeId && canvasMode === 'select' && (
                <>
                  <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {selectedElementIds.length} elements selected
                  </span>
                  <button onClick={() => {
                    const remaining = canvasPage.elements.filter((el) => !selectedElementIds.includes(el.id) || el.locked);
                    useAppStore.getState().setCanvasElements(canvasEditorPageId, remaining);
                    setSelectedElementIds([]);
                  }}
                    className="text-xs px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded">Delete All</button>
                </>
              )}

              {selectedEl && !cropModeId && canvasMode === 'select' && (
                <>
                  {/* Text properties */}
                  {selectedEl.type === 'text' && (
                    <>
                      <input type="number" min={8} max={200} value={selectedEl.fontSize}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { fontSize: Number(e.target.value) })}
                        className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" title="Font size" />
                      <select value={selectedEl.fontFamily}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { fontFamily: e.target.value as any })}
                        className="bg-gray-800 text-xs text-gray-300 px-1.5 py-0.5 rounded border border-gray-700">
                        <option value="Helvetica">Helvetica</option>
                        <option value="Courier">Courier</option>
                        <option value="TimesRoman">Times</option>
                      </select>
                      <button onClick={() => updateElement(canvasEditorPageId, selectedEl.id, { bold: !selectedEl.bold })}
                        className={`text-xs px-2 py-1 rounded font-bold ${selectedEl.bold ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>B</button>
                      <button onClick={() => updateElement(canvasEditorPageId, selectedEl.id, { italic: !selectedEl.italic })}
                        className={`text-xs px-2 py-1 rounded italic ${selectedEl.italic ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>I</button>
                      <ColorPicker value={selectedEl.textColor} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { textColor: c })} id="text-color" />
                      <div className="flex border border-gray-700 rounded overflow-hidden">
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button key={a} onClick={() => updateElement(canvasEditorPageId, selectedEl.id, { textAlign: a })}
                            className={`text-xs px-1.5 py-1 ${selectedEl.textAlign === a ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                            {a === 'left' ? '<<' : a === 'center' ? '><' : '>>'}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">Bg:</span>
                      <ColorPicker value={selectedEl.backgroundColor} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { backgroundColor: c })} id="text-bg" />
                    </>
                  )}

                  {/* Shape properties */}
                  {selectedEl.type === 'shape' && (
                    <>
                      <span className="text-xs text-gray-500">Fill:</span>
                      <ColorPicker value={selectedEl.fillColor} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { fillColor: c })} id="shape-fill" />
                      <span className="text-xs text-gray-500">Stroke:</span>
                      <ColorPicker value={selectedEl.strokeColor} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { strokeColor: c })} id="shape-stroke" />
                      <input type="number" min={0} max={20} value={selectedEl.strokeWidth}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { strokeWidth: Number(e.target.value) })}
                        className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" title="Stroke width" />
                      {selectedEl.shapeKind === 'line' && (
                        <div className="flex items-center gap-1">
                          {(['none', 'open', 'filled', 'diamond'] as const).map((style) => (
                            <button key={style}
                              onClick={() => updateElement(canvasEditorPageId, selectedEl.id, { arrowHead: style })}
                              className={`text-xs px-1.5 py-1 rounded ${selectedEl.arrowHead === style ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                              title={style === 'none' ? 'No arrow' : `${style.charAt(0).toUpperCase() + style.slice(1)} arrow`}>
                              {style === 'none' ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="4" y1="20" x2="20" y2="4" strokeLinecap="round" /></svg>
                              ) : style === 'open' ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="4" y1="20" x2="20" y2="4" strokeLinecap="round" /><polyline points="12,4 20,4 20,12" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              ) : style === 'filled' ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="4" y1="20" x2="18" y2="6" strokeLinecap="round" /><polygon points="20,3 13,5 18,10" fill="currentColor" stroke="none" /></svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="4" y1="20" x2="15" y2="9" strokeLinecap="round" /><polygon points="20,4 16,10 20,16 24,10" fill="currentColor" stroke="none" transform="translate(-4,-4) scale(0.85)" /></svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Drawing properties */}
                  {selectedEl.type === 'drawing' && (
                    <>
                      <span className="text-xs text-gray-500">Stroke:</span>
                      <ColorPicker value={selectedEl.strokeColor} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { strokeColor: c })} id="drw-stroke" />
                      <input type="number" min={1} max={20} value={selectedEl.strokeWidth}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { strokeWidth: Number(e.target.value) })}
                        className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                    </>
                  )}

                  {/* Highlight Brush properties */}
                  {selectedEl.type === 'highlight' && (
                    <>
                      <span className="text-xs text-gray-500">Color:</span>
                      <ColorPicker value={selectedEl.color} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { color: c })} id="hl-color" />
                      <span className="text-xs text-gray-500">Width:</span>
                      <input type="number" min={5} max={60} value={selectedEl.strokeWidth}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { strokeWidth: Number(e.target.value) })}
                        className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                      <span className="text-xs text-gray-500">Opacity:</span>
                      <input type="number" min={0.1} max={1} step={0.05} value={selectedEl.opacity}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { opacity: Number(e.target.value) })}
                        className="w-14 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                    </>
                  )}

                  {/* Box Highlight properties */}
                  {selectedEl.type === 'textHighlight' && (
                    <>
                      <span className="text-xs text-gray-500">Color:</span>
                      <ColorPicker value={selectedEl.color} onChange={(c) => updateElement(canvasEditorPageId, selectedEl.id, { color: c })} id="text-hl-sel-color" />
                      <span className="text-xs text-gray-500">Opacity:</span>
                      <input type="number" min={0.1} max={1} step={0.05} value={selectedEl.opacity}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { opacity: Number(e.target.value) })}
                        className="w-14 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                    </>
                  )}

                  {/* Hyperlink properties */}
                  {selectedEl.type === 'hyperlink' && (
                    <>
                      <input type="number" min={8} max={200} value={selectedEl.fontSize}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { fontSize: Number(e.target.value) })}
                        className="w-12 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" title="Font size" />
                      <select value={selectedEl.fontFamily}
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { fontFamily: e.target.value as any })}
                        className="bg-gray-800 text-xs text-gray-300 px-1.5 py-0.5 rounded border border-gray-700">
                        <option value="Helvetica">Helvetica</option>
                        <option value="Courier">Courier</option>
                        <option value="TimesRoman">Times</option>
                      </select>
                      <span className="text-xs text-gray-500">URL:</span>
                      <input type="text" value={selectedEl.url} placeholder="https://..."
                        onChange={(e) => updateElement(canvasEditorPageId, selectedEl.id, { url: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="w-40 bg-gray-800 text-xs text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none" />
                    </>
                  )}

                  {/* Common: Rotate + Crop (snippet only) + Delete */}
                  <div className="w-px h-5 bg-gray-700 mx-1" />
                  <button onClick={() => updateElement(canvasEditorPageId, selectedEl.id, { rotation: ((selectedEl.rotation || 0) - 90 + 360) % 360 })}
                    className="text-xs px-1.5 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded" title="Rotate left 90°">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 2v6h6M2.5 8A9.96 9.96 0 0112 4c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 19.523 2 14" />
                    </svg>
                  </button>
                  <button onClick={() => updateElement(canvasEditorPageId, selectedEl.id, { rotation: ((selectedEl.rotation || 0) + 90) % 360 })}
                    className="text-xs px-1.5 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded" title="Rotate right 90°">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.5 2v6h-6M21.5 8A9.96 9.96 0 0012 4C6.477 4 2 8.477 2 14s4.477 10 10 10 10-4.477 10-10" />
                    </svg>
                  </button>
                  {selectedEl.rotation !== 0 && <span className="text-xs text-gray-500">{Math.round(selectedEl.rotation)}°</span>}
                  {selectedEl.type === 'snippet' && (
                    <button onClick={() => enterCropMode(selectedEl.id)}
                      className="text-xs px-2 py-1 bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 border border-orange-500/20 rounded">Crop</button>
                  )}
                  <button onClick={() => {
                    if (selectedElementIds.length === 1) {
                      removeElement(canvasEditorPageId, selectedEl.id);
                    } else {
                      const remaining = canvasPage.elements.filter((el) => !selectedElementIds.includes(el.id) || el.locked);
                      useAppStore.getState().setCanvasElements(canvasEditorPageId, remaining);
                    }
                    setSelectedElementIds([]);
                  }}
                    className="text-xs px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded">Delete</button>
                </>
              )}

              <button onClick={() => {
                  if (cropModeId) { saveCrop(); return; }
                  setEditingTextId(null); closeCanvasEditor();
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg ml-2">
                Done
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-8">
            <p className="text-gray-500 text-xs mb-3">Drop snippets or use tools to add content. Drag snippets from the left, or use Text / Shape / Draw tools.</p>
            <div
              ref={canvasRef}
              className={`relative bg-white shadow-2xl ${isDragOver ? 'ring-2 ring-blue-500' : ''}`}
              style={{
                width: displayWidth, height: displayHeight,
                cursor: canvasMode === 'text' ? 'text' : canvasMode === 'shape' ? 'crosshair' : canvasMode === 'draw' ? 'crosshair' : canvasMode === 'highlight' ? 'crosshair' : canvasMode === 'textHighlight' ? 'crosshair' : canvasMode === 'eraser' ? 'not-allowed' : 'default',
              }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="absolute inset-4 border-2 border-dashed border-blue-400 rounded-lg bg-blue-400/5 flex items-center justify-center pointer-events-none">
                  <p className="text-blue-400 text-sm">Drop to place snippet</p>
                </div>
              )}

              {/* Rendered elements */}
              {canvasPage.elements.map((el) => {
                const isSelected = selectedElementIds.includes(el.id);
                const isCropping = cropModeId === el.id && el.type === 'snippet';
                const rotation = el.rotation || 0;

                return (
                  <div key={el.id}>
                    {/* Element bounding box */}
                    <div
                      data-canvas-element
                      data-element-id={el.id}
                      className={`absolute overflow-hidden ${
                        el.locked ? ''
                          : isCropping ? 'ring-2 ring-orange-500'
                          : isSelected ? 'ring-2 ring-blue-500 shadow-lg'
                          : 'shadow-md hover:shadow-lg'
                      }`}
                      style={{
                        left: el.x * scale, top: el.y * scale,
                        width: el.width * scale, height: el.height * scale,
                        transform: rotation ? `rotate(${rotation}deg)` : undefined,
                        transformOrigin: 'center center',
                        cursor: el.locked ? 'default' : canvasMode === 'eraser' ? ((el.type === 'drawing' || el.type === 'highlight' || el.type === 'textHighlight') ? 'pointer' : 'not-allowed') : canvasMode !== 'select' ? 'default' : (isCropping ? 'default' : editingTextId === el.id ? 'text' : draggingEl?.id === el.id ? 'grabbing' : 'grab'),
                      }}
                      onPointerDown={(e) => handleElementPointerDown(e, el)}
                      onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                    >
                      {renderElementContent(el)}

                      {/* Crop mode dimming (snippet only) */}
                      {isCropping && el.type === 'snippet' && (() => {
                        const ci = el.cropInset || DEFAULT_CROP;
                        return (
                          <>
                            {ci.top > 0 && <div className="absolute left-0 right-0 top-0 bg-black/50 pointer-events-none" style={{ height: `${ci.top * 100}%` }} />}
                            {ci.bottom > 0 && <div className="absolute left-0 right-0 bottom-0 bg-black/50 pointer-events-none" style={{ height: `${ci.bottom * 100}%` }} />}
                            {ci.left > 0 && <div className="absolute left-0 bg-black/50 pointer-events-none" style={{ top: `${ci.top * 100}%`, width: `${ci.left * 100}%`, height: `${(1 - ci.top - ci.bottom) * 100}%` }} />}
                            {ci.right > 0 && <div className="absolute right-0 bg-black/50 pointer-events-none" style={{ top: `${ci.top * 100}%`, width: `${ci.right * 100}%`, height: `${(1 - ci.top - ci.bottom) * 100}%` }} />}
                            <div className="absolute border-2 border-dashed border-orange-400 pointer-events-none" style={{
                              left: `${ci.left * 100}%`, top: `${ci.top * 100}%`,
                              width: `${(1 - ci.left - ci.right) * 100}%`, height: `${(1 - ci.top - ci.bottom) * 100}%`,
                            }} />
                          </>
                        );
                      })()}

                      {/* Label overlay */}
                      {isSelected && !isCropping && !el.locked && el.type === 'snippet' && (() => {
                        const snippet = getSnippet(el.snippetId);
                        return snippet ? (
                          <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 text-white text-xs px-1.5 py-0.5 truncate">
                            {snippet.label}
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* Resize handles + rotation handle (single-select only) */}
                    {isSelected && selectedElementIds.length === 1 && !isCropping && !el.locked && canvasMode === 'select' && (() => {
                      // Line elements with endpoints: show endpoint handles instead of bounding box
                      const isLine = el.type === 'shape' && el.shapeKind === 'line' && el.startPoint && el.endPoint;
                      if (isLine) {
                        const sp = el.startPoint!;
                        const ep = el.endPoint!;
                        return (
                          <>
                            {/* Start endpoint handle */}
                            <div data-canvas-element
                              className="absolute w-3 h-3 rounded-full bg-white border-2 border-blue-500 z-10 pointer-events-auto"
                              style={{ left: sp.x * scale - 6, top: sp.y * scale - 6, cursor: 'crosshair' }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                useAppStore.getState()._pushUndo();
                                setDraggingEndpoint({ id: el.id, which: 'start' });
                                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                              }} />
                            {/* End endpoint handle */}
                            <div data-canvas-element
                              className="absolute w-3 h-3 rounded-full bg-white border-2 border-blue-500 z-10 pointer-events-auto"
                              style={{ left: ep.x * scale - 6, top: ep.y * scale - 6, cursor: 'crosshair' }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                useAppStore.getState()._pushUndo();
                                setDraggingEndpoint({ id: el.id, which: 'end' });
                                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                              }} />
                          </>
                        );
                      }

                      return (
                        <div className="absolute pointer-events-none" style={{
                          left: el.x * scale, top: el.y * scale,
                          width: el.width * scale, height: el.height * scale,
                          transform: rotation ? `rotate(${rotation}deg)` : undefined,
                          transformOrigin: 'center center',
                        }}>
                          {/* Corner handles (aspect-ratio locked) */}
                          {resizeCorners.map((corner) => {
                            const left = corner.includes('left') ? -4 : el.width * scale - 4;
                            const top = corner.includes('top') ? -4 : el.height * scale - 4;
                            const cursor = (corner === 'top-left' || corner === 'bottom-right') ? 'nwse-resize' : 'nesw-resize';
                            return (
                              <div key={corner} data-canvas-element
                                className="absolute w-2 h-2 bg-white border-2 border-blue-500 z-10 pointer-events-auto"
                                style={{ left, top, cursor }}
                                onPointerDown={(e) => handleResizeStart(e, el, corner)} />
                            );
                          })}
                          {/* Side handles (stretch width or height) */}
                          {resizeSides.map((side) => {
                            const ew = el.width * scale;
                            const eh = el.height * scale;
                            let style: React.CSSProperties = {};
                            switch (side) {
                              case 'top':    style = { left: ew / 2 - 5, top: -3, width: 10, height: 6, cursor: 'ns-resize' }; break;
                              case 'bottom': style = { left: ew / 2 - 5, top: eh - 3, width: 10, height: 6, cursor: 'ns-resize' }; break;
                              case 'left':   style = { left: -3, top: eh / 2 - 5, width: 6, height: 10, cursor: 'ew-resize' }; break;
                              case 'right':  style = { left: ew - 3, top: eh / 2 - 5, width: 6, height: 10, cursor: 'ew-resize' }; break;
                            }
                            return (
                              <div key={side} data-canvas-element
                                className="absolute bg-white border-2 border-blue-500 z-10 pointer-events-auto rounded-sm"
                                style={style}
                                onPointerDown={(e) => handleResizeStart(e, el, side)} />
                            );
                          })}
                          <div className="absolute pointer-events-none" style={{ left: el.width * scale / 2 - 0.5, top: -30, width: 1, height: 26, background: '#3b82f6' }} />
                          <div data-canvas-element
                            className="absolute w-4 h-4 rounded-full bg-white border-2 border-blue-500 z-10 pointer-events-auto hover:bg-blue-100"
                            style={{ left: el.width * scale / 2 - 8, top: -38, cursor: 'grab' }}
                            title="Drag to rotate" onPointerDown={(e) => handleRotateStart(e, el)}>
                            <svg className="w-2.5 h-2.5 m-auto mt-[1px] text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Crop edge handles (snippet only) */}
                    {isCropping && el.type === 'snippet' && (
                      <div className="absolute pointer-events-none" style={{
                        left: el.x * scale, top: el.y * scale,
                        width: el.width * scale, height: el.height * scale,
                        transform: rotation ? `rotate(${rotation}deg)` : undefined,
                        transformOrigin: 'center center',
                      }}>
                        {cropEdges.map((edge) => {
                          const ci = el.cropInset || DEFAULT_CROP;
                          const ew = el.width * scale;
                          const eh = el.height * scale;
                          const hs = 6;
                          let style: React.CSSProperties = {};
                          switch (edge) {
                            case 'top': style = { left: ew * ci.left, top: eh * ci.top - hs / 2, width: ew * (1 - ci.left - ci.right), height: hs, cursor: 'ns-resize' }; break;
                            case 'bottom': style = { left: ew * ci.left, top: eh * (1 - ci.bottom) - hs / 2, width: ew * (1 - ci.left - ci.right), height: hs, cursor: 'ns-resize' }; break;
                            case 'left': style = { left: ew * ci.left - hs / 2, top: eh * ci.top, width: hs, height: eh * (1 - ci.top - ci.bottom), cursor: 'ew-resize' }; break;
                            case 'right': style = { left: ew * (1 - ci.right) - hs / 2, top: eh * ci.top, width: hs, height: eh * (1 - ci.top - ci.bottom), cursor: 'ew-resize' }; break;
                          }
                          return (
                            <div key={edge} data-canvas-element
                              className="absolute z-20 bg-orange-500/60 hover:bg-orange-400/80 pointer-events-auto"
                              style={{ ...style, borderRadius: 2, position: 'absolute' }}
                              onPointerDown={(e) => handleCropEdgeStart(e, el, edge)} />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Text highlight creation preview */}
              {textHlPreview && textHlCreating && (
                <div className="absolute pointer-events-none" style={{
                  left: textHlPreview.x * scale, top: textHlPreview.y * scale,
                  width: textHlPreview.w * scale, height: textHlPreview.h * scale,
                  backgroundColor: textHlColor, opacity: 0.35, borderRadius: 2,
                }} />
              )}

              {/* Shape creation preview (rectangle/ellipse only) */}
              {shapePreview && shapeCreating && (
                <div className="absolute pointer-events-none" style={{
                  left: shapePreview.x * scale, top: shapePreview.y * scale,
                  width: shapePreview.w * scale, height: shapePreview.h * scale,
                }}>
                  <svg width={shapePreview.w * scale} height={shapePreview.h * scale} style={{ overflow: 'visible' }}>
                    {shapeTool === 'rectangle' && <rect x={1} y={1} width={Math.max(0, shapePreview.w * scale - 2)} height={Math.max(0, shapePreview.h * scale - 2)} fill={shapeFillColor.endsWith('00') ? 'none' : shapeFillColor + '40'} stroke={shapeStrokeColor} strokeWidth={2} strokeDasharray="4 4" />}
                    {shapeTool === 'ellipse' && <ellipse cx={shapePreview.w * scale / 2} cy={shapePreview.h * scale / 2} rx={Math.max(0, shapePreview.w * scale / 2 - 1)} ry={Math.max(0, shapePreview.h * scale / 2 - 1)} fill={shapeFillColor.endsWith('00') ? 'none' : shapeFillColor + '40'} stroke={shapeStrokeColor} strokeWidth={2} strokeDasharray="4 4" />}
                  </svg>
                </div>
              )}

              {/* Line creation preview */}
              {lineCreating && linePreview && (
                <svg className="absolute inset-0 pointer-events-none" width={displayWidth} height={displayHeight} style={{ overflow: 'visible' }}>
                  <line
                    x1={lineCreating.startX * scale} y1={lineCreating.startY * scale}
                    x2={linePreview.endX * scale} y2={linePreview.endY * scale}
                    stroke={shapeStrokeColor} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round"
                  />
                </svg>
              )}

              {/* Freehand drawing in-progress stroke */}
              {isDrawing && drawingPoints.length > 1 && (
                <svg className="absolute inset-0 pointer-events-none" width={displayWidth} height={displayHeight}>
                  <path
                    d={`M ${drawingPoints.map((p) => `${p.x * scale} ${p.y * scale}`).join(' L ')}`}
                    fill="none" stroke={drawColor} strokeWidth={drawWidth * scale}
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}

              {/* Highlight in-progress stroke */}
              {isHighlighting && highlightPoints.length > 1 && (
                <svg className="absolute inset-0 pointer-events-none" width={displayWidth} height={displayHeight} style={{ opacity: 0.35 }}>
                  <path
                    d={`M ${highlightPoints.map((p) => `${p.x * scale} ${p.y * scale}`).join(' L ')}`}
                    fill="none" stroke={highlightColor} strokeWidth={highlightWidth * scale}
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}

              {/* Box select marquee */}
              {boxSelectStart && boxSelectEnd && (
                <div className="absolute pointer-events-none" style={{
                  left: Math.min(boxSelectStart.x, boxSelectEnd.x) * scale,
                  top: Math.min(boxSelectStart.y, boxSelectEnd.y) * scale,
                  width: Math.abs(boxSelectEnd.x - boxSelectStart.x) * scale,
                  height: Math.abs(boxSelectEnd.y - boxSelectStart.y) * scale,
                  border: '1px solid #3b82f6',
                  background: 'rgba(59, 130, 246, 0.1)',
                }} />
              )}

              {/* Lasso select path */}
              {lassoPoints && lassoPoints.length > 1 && (
                <svg className="absolute inset-0 pointer-events-none" width={displayWidth} height={displayHeight}>
                  <polygon
                    points={lassoPoints.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
                    fill="rgba(59, 130, 246, 0.08)" stroke="#3b82f6" strokeWidth={1.5}
                    strokeDasharray="4 4" strokeLinejoin="round" />
                </svg>
              )}

              {/* Multi-select group bounding box */}
              {selectedElementIds.length > 1 && (() => {
                const selEls = canvasPage.elements.filter((el) => selectedElementIds.includes(el.id));
                if (selEls.length < 2) return null;
                const minX = Math.min(...selEls.map((el) => el.x));
                const minY = Math.min(...selEls.map((el) => el.y));
                const maxX = Math.max(...selEls.map((el) => el.x + el.width));
                const maxY = Math.max(...selEls.map((el) => el.y + el.height));
                const pad = 4;
                return (
                  <div className="absolute pointer-events-none" style={{
                    left: (minX - pad) * scale, top: (minY - pad) * scale,
                    width: (maxX - minX + pad * 2) * scale, height: (maxY - minY + pad * 2) * scale,
                    border: '1.5px dashed #3b82f6',
                    borderRadius: 3,
                  }} />
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Signature modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center" onClick={() => { setShowSignatureModal(false); setSignaturePoints([]); }}>
          <div className="bg-gray-900 rounded-xl w-full max-w-lg mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-white">Draw Signature</h2>
              <button onClick={() => { setShowSignatureModal(false); setSignaturePoints([]); }} className="text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <div
                ref={signaturePadRef}
                className="bg-white rounded-lg border-2 border-gray-300 cursor-crosshair touch-none"
                style={{ width: '100%', height: 160, position: 'relative' }}
                onPointerDown={(e) => {
                  const rect = signaturePadRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setIsSignDrawing(true);
                  setSignaturePoints([{ x: e.clientX - rect.left, y: e.clientY - rect.top }]);
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!isSignDrawing) return;
                  const rect = signaturePadRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                  const last = signaturePoints[signaturePoints.length - 1];
                  if (last && Math.hypot(pos.x - last.x, pos.y - last.y) >= 2) {
                    setSignaturePoints((prev) => [...prev, pos]);
                  }
                }}
                onPointerUp={() => setIsSignDrawing(false)}
              >
                {signaturePoints.length > 1 && (
                  <svg className="absolute inset-0" width="100%" height="100%">
                    <path
                      d={`M ${signaturePoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
                      fill="none" stroke="#000000" strokeWidth={2}
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {signaturePoints.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-gray-400 text-sm">Sign here</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
              <button onClick={() => setSignaturePoints([])} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
              <div className="flex gap-2">
                <button onClick={() => { setShowSignatureModal(false); setSignaturePoints([]); }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button
                  disabled={signaturePoints.length < 2}
                  onClick={() => {
                    if (signaturePoints.length < 2) return;
                    // Compute bounding box and create DrawingElement
                    const xs = signaturePoints.map((p) => p.x);
                    const ys = signaturePoints.map((p) => p.y);
                    const pad = 4;
                    const minX = Math.min(...xs) - pad;
                    const minY = Math.min(...ys) - pad;
                    const bw = Math.max(20, Math.max(...xs) - minX + pad);
                    const bh = Math.max(20, Math.max(...ys) - minY + pad);
                    const relPoints = signaturePoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));
                    // Scale to a reasonable size on the canvas (signature pad is ~450x160 px, map to ~200x70 PDF pts)
                    const sigScale = 200 / bw;
                    const scaledW = bw * sigScale;
                    const scaledH = bh * sigScale;
                    const scaledPts = relPoints.map((p) => ({ x: p.x * sigScale, y: p.y * sigScale }));
                    const newId = uuidv4();
                    const drawEl: DrawingElement = {
                      type: 'drawing', id: newId,
                      x: pdfSize.width / 2 - scaledW / 2,
                      y: pdfSize.height / 2 - scaledH / 2,
                      width: scaledW, height: scaledH, rotation: 0,
                      points: scaledPts, strokeColor: '#000000', strokeWidth: 2,
                    };
                    addElementToCanvas(canvasEditorPageId, drawEl);
                    setSelectedElementIds([newId]);
                    setShowSignatureModal(false);
                    setSignaturePoints([]);
                    setCanvasMode('select');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg"
                >Place Signature</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SnippetPreview sub-component ---
// Renders the PDF page via react-pdf and clips to the snippet region using CSS.
// Uses cropBox (PDF-point coordinates) — the same coordinate system the server uses
// with pdf-lib embedPage — so the preview matches the final output exactly.
//
// Key insight: we derive the PDF page dimensions mathematically from the snippet's
// existing pixelCrop (captured at RENDER_WIDTH=700) and cropBox (PDF points).
// This avoids any async page-loading step and renders in a single pass.
const SNIPPET_RENDER_WIDTH = 700;

function SnippetPreview({ snippet, targetWidth, targetHeight, cropInset, isCropping, cropBoxOverride }: {
  snippet: Snippet;
  targetWidth: number;
  targetHeight: number;
  cropInset?: CropInset;
  isCropping?: boolean;
  cropBoxOverride?: { x: number; y: number; width: number; height: number };
}) {
  const pdfUrl = getOrCreateBlobUrl(snippet.fileId) || `${API_BASE}/api/files/${snippet.fileId}/pdf`;

  // Use baked override from previous crops if present, otherwise snippet original
  const cropBox = cropBoxOverride || snippet.cropBox;

  // Derive the scale between pixel space (700px render) and PDF points.
  // pixelCrop was captured at RENDER_WIDTH, cropBox is the same region in PDF points.
  // This ratio is constant for the entire page.
  const ptPerPx = snippet.cropBox.width / snippet.pixelCrop.width;

  // Derive full PDF page height (points) from the original snippet data:
  //   snippet.cropBox.y = pdfPageHeight - (pixelCrop.y + pixelCrop.height) * ptPerPx
  //   → pdfPageHeight = snippet.cropBox.y + (pixelCrop.y + pixelCrop.height) * ptPerPx
  const pdfPageHeight = snippet.cropBox.y + (snippet.pixelCrop.y + snippet.pixelCrop.height) * ptPerPx;

  // Apply cropInset the same way the server does (only when not actively cropping)
  const inset = (cropInset && !isCropping) ? cropInset : { top: 0, right: 0, bottom: 0, left: 0 };
  const hasInset = inset.top > 0 || inset.right > 0 || inset.bottom > 0 || inset.left > 0;

  // Adjusted cropBox in PDF points (mirrors server's renderSnippet exactly)
  const adjCb = hasInset ? {
    x: cropBox.x + cropBox.width * inset.left,
    y: cropBox.y + cropBox.height * inset.bottom,
    width: cropBox.width * (1 - inset.left - inset.right),
    height: cropBox.height * (1 - inset.top - inset.bottom),
  } : cropBox;

  // Convert adjusted cropBox from PDF coords (y from bottom) to pixel coords
  // at SNIPPET_RENDER_WIDTH (y from top)
  const pxPerPt = 1 / ptPerPx;
  const screenX = adjCb.x * pxPerPt;
  const screenY = (pdfPageHeight - adjCb.y - adjCb.height) * pxPerPt;
  const screenW = adjCb.width * pxPerPt;
  const screenH = adjCb.height * pxPerPt;

  // Scale from the crop region in pixel space to the target display size
  const scaleX = targetWidth / screenW;
  const scaleY = targetHeight / screenH;

  return (
    <div style={{
      width: targetWidth,
      height: targetHeight,
      overflow: 'hidden',
      position: 'relative',
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        transform: `scale(${scaleX}, ${scaleY})`,
        transformOrigin: '0 0',
        position: 'absolute',
        left: -screenX * scaleX,
        top: -screenY * scaleY,
      }}>
        <Document file={pdfUrl} loading={null}>
          <Page
            pageNumber={snippet.pageIndex + 1}
            width={SNIPPET_RENDER_WIDTH}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
