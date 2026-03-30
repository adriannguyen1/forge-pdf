import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { UploadedFile, QueueItem, Snippet, CanvasPage, CanvasElement, CanvasElementUpdate, SnippetElement } from '../types';
import { removeFileBytes } from './fileStore';

interface UndoSnapshot {
  queue: QueueItem[];
  canvasPages: CanvasPage[];
  snippets: Snippet[];
}

interface AppState {
  files: UploadedFile[];
  selectedFileId: string | null;
  queue: QueueItem[];
  isGenerating: boolean;
  snippets: Snippet[];
  canvasPages: CanvasPage[];

  // Export format
  exportFormat: 'pdf' | 'png' | 'jpg' | 'webp';
  setExportFormat: (format: 'pdf' | 'png' | 'jpg' | 'webp') => void;

  // Sidebar tab
  sidebarTab: 'files' | 'snippets';
  setSidebarTab: (tab: 'files' | 'snippets') => void;

  // Modal state
  snippetCropperPage: { fileId: string; fileName: string; pageIndex: number } | null;
  openSnippetCropper: (fileId: string, fileName: string, pageIndex: number) => void;
  closeSnippetCropper: () => void;

  canvasEditorPageId: string | null;
  openCanvasEditor: (canvasPageId: string) => void;
  closeCanvasEditor: () => void;

  // Tracks a page→canvas conversion so we can revert if no edits were made
  _pendingCanvasConversion: {
    queueItemId: string;
    canvasPageId: string;
    backgroundElementId: string;
    backgroundSnippetId: string;
    originalFileId: string;
    originalFileName: string;
    originalPageIndex: number;
  } | null;

  // File actions
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
  setSelectedFile: (fileId: string | null) => void;
  updateFileName: (fileId: string, name: string) => void;

  // Queue actions
  addToQueue: (item: QueueItem) => void;
  removeFromQueue: (itemId: string) => void;
  reorderQueue: (oldIndex: number, newIndex: number) => void;
  clearQueue: () => void;
  isPageInQueue: (fileId: string, pageIndex: number) => boolean;
  setIsGenerating: (v: boolean) => void;
  updateQueueItemName: (itemId: string, name: string) => void;
  duplicateQueueItem: (itemId: string) => void;

  // Queue selection
  selectedQueueItemIds: string[];
  selectQueueItem: (id: string) => void;
  toggleQueueItemSelection: (id: string) => void;
  rangeSelectQueueItems: (id: string) => void;
  selectAllQueueItems: () => void;
  clearQueueSelection: () => void;

  // Clipboard (internal)
  clipboardItems: QueueItem[];
  clipboardCanvasPages: CanvasPage[];
  copySelectedToClipboard: () => void;
  pasteFromClipboard: () => void;

  // Multi-item actions
  duplicateSelectedItems: () => void;
  removeSelectedItems: () => void;

  // Rename trigger (transient, consumed by BuildQueueItem)
  _renamingQueueItemId: string | null;

  // Undo / Redo
  _undoStack: UndoSnapshot[];
  _redoStack: UndoSnapshot[];
  _pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  // Snippet actions
  addSnippet: (snippet: Snippet) => void;
  addSnippets: (snippets: Snippet[]) => void;
  removeSnippet: (snippetId: string) => void;
  updateSnippetLabel: (snippetId: string, label: string) => void;

  // Canvas page actions
  addCanvasPage: (page: CanvasPage) => void;
  removeCanvasPage: (pageId: string) => void;
  updateCanvasPageSize: (pageId: string, size: 'letter' | 'a4') => void;
  updateCanvasPageLabel: (pageId: string, label: string) => void;
  setCanvasElements: (pageId: string, elements: CanvasElement[]) => void;
  addElementToCanvas: (pageId: string, element: CanvasElement) => void;
  updateElement: (pageId: string, elementId: string, updates: CanvasElementUpdate) => void;
  removeElement: (pageId: string, elementId: string) => void;

  // Convert a normal page queue item to a canvas page for editing
  convertPageToCanvas: (queueItemId: string, pageDims: {
    width: number;
    height: number;
    cropBox?: { x: number; y: number; width: number; height: number };
    rotation?: number;
  }) => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  files: [],
  selectedFileId: null,
  queue: [],
  isGenerating: false,
  snippets: [],
  canvasPages: [],
  exportFormat: 'pdf',
  setExportFormat: (format) => set({ exportFormat: format }),

  sidebarTab: 'files',
  snippetCropperPage: null,
  canvasEditorPageId: null,
  _pendingCanvasConversion: null,

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  openSnippetCropper: (fileId, fileName, pageIndex) =>
    set({ snippetCropperPage: { fileId, fileName, pageIndex } }),
  closeSnippetCropper: () => set({ snippetCropperPage: null }),

  openCanvasEditor: (canvasPageId) => set({ canvasEditorPageId: canvasPageId }),
  closeCanvasEditor: () => {
    const state = get();
    const pending = state._pendingCanvasConversion;

    if (pending && pending.canvasPageId === state.canvasEditorPageId) {
      // Check if the user made any edits beyond the initial background snippet
      const canvasPage = state.canvasPages.find((p) => p.id === pending.canvasPageId);
      const hasEdits = canvasPage && (
        canvasPage.elements.length !== 1 ||
        canvasPage.elements[0].id !== pending.backgroundElementId
      );

      if (!hasEdits) {
        // No edits — revert back to a normal page and clean up
        set({
          canvasEditorPageId: null,
          _pendingCanvasConversion: null,
          queue: state.queue.map((q) =>
            q.canvasPageId === pending.canvasPageId
              ? { ...q, type: 'page' as const, fileId: pending.originalFileId, fileName: pending.originalFileName, pageIndex: pending.originalPageIndex, canvasPageId: undefined }
              : q
          ),
          canvasPages: state.canvasPages.filter((p) => p.id !== pending.canvasPageId),
          snippets: state.snippets.filter((s) => s.id !== pending.backgroundSnippetId),
        });
        return;
      }
    }

    // Select the queue item that was just edited so the user sees it in the build queue
    const editedQueueItem = state.queue.find((q) => q.canvasPageId === state.canvasEditorPageId);
    set({
      canvasEditorPageId: null,
      _pendingCanvasConversion: null,
      selectedQueueItemIds: editedQueueItem ? [editedQueueItem.id] : state.selectedQueueItemIds,
    });
  },

  // --- Undo / Redo ---
  _undoStack: [],
  _redoStack: [],

  _pushUndo: () => {
    const { queue, canvasPages, snippets, _undoStack } = get();
    const snapshot: UndoSnapshot = {
      queue: structuredClone(queue),
      canvasPages: structuredClone(canvasPages),
      snippets: structuredClone(snippets),
    };
    const newStack = [..._undoStack, snapshot];
    if (newStack.length > 30) newStack.shift();
    set({ _undoStack: newStack, _redoStack: [] });
  },

  undo: () => {
    const { _undoStack, _redoStack, queue, canvasPages, snippets } = get();
    if (_undoStack.length === 0) return;
    const newUndoStack = [..._undoStack];
    const prev = newUndoStack.pop()!;
    const currentSnapshot: UndoSnapshot = {
      queue: structuredClone(queue),
      canvasPages: structuredClone(canvasPages),
      snippets: structuredClone(snippets),
    };
    set({
      queue: prev.queue,
      canvasPages: prev.canvasPages,
      snippets: prev.snippets,
      _undoStack: newUndoStack,
      _redoStack: [..._redoStack, currentSnapshot],
      selectedQueueItemIds: [],
    });
  },

  redo: () => {
    const { _undoStack, _redoStack, queue, canvasPages, snippets } = get();
    if (_redoStack.length === 0) return;
    const newRedoStack = [..._redoStack];
    const next = newRedoStack.pop()!;
    const currentSnapshot: UndoSnapshot = {
      queue: structuredClone(queue),
      canvasPages: structuredClone(canvasPages),
      snippets: structuredClone(snippets),
    };
    set({
      queue: next.queue,
      canvasPages: next.canvasPages,
      snippets: next.snippets,
      _undoStack: [..._undoStack, currentSnapshot],
      _redoStack: newRedoStack,
      selectedQueueItemIds: [],
    });
  },

  // --- Queue Selection ---
  selectedQueueItemIds: [],
  _renamingQueueItemId: null,

  selectQueueItem: (id) => set({ selectedQueueItemIds: [id] }),

  toggleQueueItemSelection: (id) =>
    set((state) => ({
      selectedQueueItemIds: state.selectedQueueItemIds.includes(id)
        ? state.selectedQueueItemIds.filter((i) => i !== id)
        : [...state.selectedQueueItemIds, id],
    })),

  rangeSelectQueueItems: (id) =>
    set((state) => {
      const { queue, selectedQueueItemIds } = state;
      if (selectedQueueItemIds.length === 0) return { selectedQueueItemIds: [id] };
      const lastSelected = selectedQueueItemIds[selectedQueueItemIds.length - 1];
      const lastIdx = queue.findIndex((q) => q.id === lastSelected);
      const targetIdx = queue.findIndex((q) => q.id === id);
      if (lastIdx === -1 || targetIdx === -1) return { selectedQueueItemIds: [id] };
      const start = Math.min(lastIdx, targetIdx);
      const end = Math.max(lastIdx, targetIdx);
      const rangeIds = queue.slice(start, end + 1).map((q) => q.id);
      return { selectedQueueItemIds: [...new Set([...selectedQueueItemIds, ...rangeIds])] };
    }),

  selectAllQueueItems: () =>
    set((state) => ({ selectedQueueItemIds: state.queue.map((q) => q.id) })),

  clearQueueSelection: () => set({ selectedQueueItemIds: [] }),

  // --- Clipboard ---
  clipboardItems: [],
  clipboardCanvasPages: [],

  copySelectedToClipboard: () => {
    const state = get();
    const selected = state.queue.filter((q) => state.selectedQueueItemIds.includes(q.id));
    const relatedCanvasPages = selected
      .filter((q) => q.type === 'canvas' && q.canvasPageId)
      .map((q) => state.canvasPages.find((p) => p.id === q.canvasPageId))
      .filter(Boolean) as CanvasPage[];
    set({
      clipboardItems: structuredClone(selected),
      clipboardCanvasPages: structuredClone(relatedCanvasPages),
    });
  },

  pasteFromClipboard: () => {
    const state = get();
    const { clipboardItems, clipboardCanvasPages, queue, selectedQueueItemIds, canvasPages } = state;
    if (clipboardItems.length === 0) return;
    get()._pushUndo();

    let insertIdx = queue.length;
    if (selectedQueueItemIds.length > 0) {
      const lastSelectedId = selectedQueueItemIds[selectedQueueItemIds.length - 1];
      const idx = queue.findIndex((q) => q.id === lastSelectedId);
      if (idx !== -1) insertIdx = idx + 1;
    }

    const newCanvasPages: CanvasPage[] = [];
    const newItems = clipboardItems.map((item) => {
      const newId = uuidv4();
      if (item.type === 'canvas' && item.canvasPageId) {
        const srcPage = clipboardCanvasPages.find((p) => p.id === item.canvasPageId);
        if (srcPage) {
          const newPageId = uuidv4();
          newCanvasPages.push({
            ...structuredClone(srcPage),
            id: newPageId,
            label: `${srcPage.label} (copy)`,
            elements: srcPage.elements.map((el) => ({ ...el, id: uuidv4() })),
          });
          return { ...item, id: newId, canvasPageId: newPageId };
        }
      }
      return { ...item, id: newId, fileName: item.fileName ? `${item.fileName}` : undefined };
    });

    const newQueue = [...queue];
    newQueue.splice(insertIdx, 0, ...newItems);

    set({
      queue: newQueue,
      canvasPages: [...canvasPages, ...newCanvasPages],
      selectedQueueItemIds: newItems.map((q) => q.id),
    });
  },

  // --- Multi-item actions ---
  duplicateSelectedItems: () => {
    const state = get();
    const { queue, selectedQueueItemIds, canvasPages } = state;
    if (selectedQueueItemIds.length === 0) return;
    get()._pushUndo();

    const newQueue = [...queue];
    const newCanvasPages = [...canvasPages];
    const newSelectedIds: string[] = [];

    // Process in forward order, tracking offset for correct insertion
    const selectedIndices = selectedQueueItemIds
      .map((id) => queue.findIndex((q) => q.id === id))
      .filter((idx) => idx !== -1)
      .sort((a, b) => a - b);

    let offset = 0;
    for (const origIdx of selectedIndices) {
      const insertAt = origIdx + offset + 1;
      const item = queue[origIdx];
      const newId = uuidv4();

      if (item.type === 'canvas' && item.canvasPageId) {
        const srcPage = canvasPages.find((p) => p.id === item.canvasPageId);
        if (srcPage) {
          const newPageId = uuidv4();
          newCanvasPages.push({
            ...srcPage,
            id: newPageId,
            label: `${srcPage.label} (copy)`,
            elements: srcPage.elements.map((el) => ({ ...el, id: uuidv4() })),
          });
          newQueue.splice(insertAt, 0, { ...item, id: newId, canvasPageId: newPageId });
          newSelectedIds.push(newId);
          offset++;
          continue;
        }
      }

      newQueue.splice(insertAt, 0, {
        ...item,
        id: newId,
        fileName: item.fileName ? `${item.fileName} (copy)` : undefined,
      });
      newSelectedIds.push(newId);
      offset++;
    }

    set({ queue: newQueue, canvasPages: newCanvasPages, selectedQueueItemIds: newSelectedIds });
  },

  removeSelectedItems: () => {
    const state = get();
    const { selectedQueueItemIds, queue, canvasPages } = state;
    if (selectedQueueItemIds.length === 0) return;
    get()._pushUndo();

    const toRemove = new Set(selectedQueueItemIds);
    const removedCanvasPageIds = queue
      .filter((q) => toRemove.has(q.id) && q.type === 'canvas' && q.canvasPageId)
      .map((q) => q.canvasPageId!);

    set({
      queue: queue.filter((q) => !toRemove.has(q.id)),
      canvasPages: canvasPages.filter((p) => !removedCanvasPageIds.includes(p.id)),
      selectedQueueItemIds: [],
    });
  },

  // --- File actions ---
  addFile: (file) =>
    set((state) => ({
      files: [...state.files, file],
      selectedFileId: file.id,
    })),

  removeFile: (fileId) => {
    get()._pushUndo();
    removeFileBytes(fileId);
    set((state) => ({
      files: state.files.filter((f) => f.id !== fileId),
      selectedFileId: state.selectedFileId === fileId ? null : state.selectedFileId,
      queue: state.queue.filter((q) => q.fileId !== fileId),
    }));
  },

  setSelectedFile: (fileId) => set({ selectedFileId: fileId }),

  updateFileName: (fileId, name) =>
    set((state) => ({
      files: state.files.map((f) => f.id === fileId ? { ...f, fileName: name } : f),
    })),

  // --- Queue actions ---
  addToQueue: (item) => {
    get()._pushUndo();
    set((state) => ({ queue: [...state.queue, item] }));
  },

  removeFromQueue: (itemId) => {
    get()._pushUndo();
    set((state) => {
      const item = state.queue.find((q) => q.id === itemId);
      const newState: Partial<AppState> = {
        queue: state.queue.filter((q) => q.id !== itemId),
      };
      if (item?.type === 'canvas' && item.canvasPageId) {
        newState.canvasPages = state.canvasPages.filter((p) => p.id !== item.canvasPageId);
      }
      return newState;
    });
  },

  reorderQueue: (oldIndex, newIndex) => {
    get()._pushUndo();
    set((state) => {
      const newQueue = [...state.queue];
      const [removed] = newQueue.splice(oldIndex, 1);
      newQueue.splice(newIndex, 0, removed);
      return { queue: newQueue };
    });
  },

  clearQueue: () => {
    get()._pushUndo();
    set({ queue: [], canvasPages: [], selectedQueueItemIds: [] });
  },

  isPageInQueue: (fileId, pageIndex) =>
    get().queue.some((q) => q.fileId === fileId && q.pageIndex === pageIndex && q.type === 'page'),

  setIsGenerating: (v) => set({ isGenerating: v }),

  updateQueueItemName: (itemId, name) => {
    get()._pushUndo();
    set((state) => ({
      queue: state.queue.map((q) =>
        q.id === itemId ? { ...q, fileName: name } : q
      ),
    }));
  },

  duplicateQueueItem: (itemId) => {
    const state = get();
    const item = state.queue.find((q) => q.id === itemId);
    if (!item) return;
    get()._pushUndo();
    const itemIndex = state.queue.indexOf(item);

    if (item.type === 'canvas' && item.canvasPageId) {
      const srcPage = state.canvasPages.find((p) => p.id === item.canvasPageId);
      if (!srcPage) return;

      const newCanvasPageId = uuidv4();
      const newElements = srcPage.elements.map((el) => ({ ...el, id: uuidv4() }));
      const newCanvasPage = { ...srcPage, id: newCanvasPageId, label: `${srcPage.label} (copy)`, elements: newElements };
      const newQueueItem: QueueItem = { id: uuidv4(), type: 'canvas', canvasPageId: newCanvasPageId };

      set((state) => {
        const newQueue = [...state.queue];
        newQueue.splice(itemIndex + 1, 0, newQueueItem);
        return { queue: newQueue, canvasPages: [...state.canvasPages, newCanvasPage] };
      });
    } else {
      const newQueueItem: QueueItem = {
        ...item,
        id: uuidv4(),
        fileName: item.fileName ? `${item.fileName} (copy)` : undefined,
      };
      set((state) => {
        const newQueue = [...state.queue];
        newQueue.splice(itemIndex + 1, 0, newQueueItem);
        return { queue: newQueue };
      });
    }
  },

  // --- Snippets ---
  addSnippet: (snippet) => {
    get()._pushUndo();
    set((state) => ({ snippets: [...state.snippets, snippet] }));
  },

  addSnippets: (snippets) => {
    get()._pushUndo();
    set((state) => ({ snippets: [...state.snippets, ...snippets] }));
  },

  removeSnippet: (snippetId) => {
    get()._pushUndo();
    set((state) => ({
      snippets: state.snippets.filter((s) => s.id !== snippetId),
      canvasPages: state.canvasPages.map((page) => ({
        ...page,
        elements: page.elements.filter((el) => el.type !== 'snippet' || el.snippetId !== snippetId),
      })),
    }));
  },

  updateSnippetLabel: (snippetId, label) => {
    get()._pushUndo();
    set((state) => ({
      snippets: state.snippets.map((s) =>
        s.id === snippetId ? { ...s, label } : s
      ),
    }));
  },

  // --- Canvas pages ---
  addCanvasPage: (page) => {
    get()._pushUndo();
    set((state) => ({ canvasPages: [...state.canvasPages, page] }));
  },

  removeCanvasPage: (pageId) => {
    get()._pushUndo();
    set((state) => ({
      canvasPages: state.canvasPages.filter((p) => p.id !== pageId),
      queue: state.queue.filter((q) => q.canvasPageId !== pageId),
    }));
  },

  updateCanvasPageSize: (pageId, size) =>
    set((state) => ({
      canvasPages: state.canvasPages.map((p) =>
        p.id === pageId ? { ...p, pageSize: size } : p
      ),
    })),

  updateCanvasPageLabel: (pageId, label) =>
    set((state) => ({
      canvasPages: state.canvasPages.map((p) =>
        p.id === pageId ? { ...p, label } : p
      ),
    })),

  setCanvasElements: (pageId, elements) => {
    get()._pushUndo();
    set((state) => ({
      canvasPages: state.canvasPages.map((p) =>
        p.id === pageId ? { ...p, elements } : p
      ),
    }));
  },

  addElementToCanvas: (pageId, element) => {
    get()._pushUndo();
    set((state) => ({
      canvasPages: state.canvasPages.map((p) =>
        p.id === pageId ? { ...p, elements: [...p.elements, element] } : p
      ),
    }));
  },

  // NOTE: updateElement does NOT push undo — it fires every mouse-move during drag.
  // CanvasEditor calls _pushUndo() once on pointerdown before a drag begins.
  updateElement: (pageId, elementId, updates) =>
    set((state) => ({
      canvasPages: state.canvasPages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              elements: p.elements.map((el) =>
                el.id === elementId ? { ...el, ...updates } : el
              ),
            }
          : p
      ),
    })),

  removeElement: (pageId, elementId) => {
    get()._pushUndo();
    set((state) => ({
      canvasPages: state.canvasPages.map((p) =>
        p.id === pageId
          ? { ...p, elements: p.elements.filter((el) => el.id !== elementId) }
          : p
      ),
    }));
  },

  convertPageToCanvas: (queueItemId, pageDims) => {
    get()._pushUndo();
    const state = get();
    const queueItem = state.queue.find((q) => q.id === queueItemId);
    if (!queueItem || queueItem.type !== 'page' || !queueItem.fileId) {
      throw new Error('Invalid queue item for conversion');
    }

    // width/height = the visible (rotation-adjusted) dimensions
    // cropBox = the raw source-page coordinates for embedPage
    // rotation = the page's /Rotate value
    const { width, height } = pageDims;
    const sourceCropBox = pageDims.cropBox || { x: 0, y: 0, width, height };
    const fileId = queueItem.fileId;
    const fileName = queueItem.fileName || 'Page';
    const pageIndex = queueItem.pageIndex ?? 0;

    const TOLERANCE = 2;
    let pageSize: 'letter' | 'a4' | 'custom' = 'custom';
    let customWidth: number | undefined;
    let customHeight: number | undefined;

    if (Math.abs(width - 612) < TOLERANCE && Math.abs(height - 792) < TOLERANCE) {
      pageSize = 'letter';
    } else if (Math.abs(width - 595) < TOLERANCE && Math.abs(height - 842) < TOLERANCE) {
      pageSize = 'a4';
    } else {
      customWidth = width;
      customHeight = height;
    }

    const RENDER_WIDTH = 700;
    const pixelHeight = RENDER_WIDTH * (height / width);
    const snippetId = uuidv4();
    const snippet: Snippet = {
      id: snippetId,
      fileId,
      fileName,
      pageIndex,
      // Use the actual CropBox from the source page (may have non-zero origin)
      cropBox: sourceCropBox,
      pixelCrop: { x: 0, y: 0, width: RENDER_WIDTH, height: pixelHeight },
      label: `${fileName} p${pageIndex + 1} (background)`,
      createdAt: Date.now(),
    };

    const canvasPageId = uuidv4();
    const backgroundElement: SnippetElement = {
      type: 'snippet',
      id: uuidv4(),
      snippetId,
      x: 0,
      y: 0,
      width,
      height,
      cropInset: { top: 0, right: 0, bottom: 0, left: 0 },
      rotation: 0,
      locked: true,
    };

    const canvasPage: CanvasPage = {
      id: canvasPageId,
      label: `${fileName} p${pageIndex + 1}`,
      pageSize,
      ...(pageSize === 'custom' ? { customWidth, customHeight } : {}),
      elements: [backgroundElement],
    };

    set((state) => ({
      snippets: [...state.snippets, snippet],
      canvasPages: [...state.canvasPages, canvasPage],
      queue: state.queue.map((q) =>
        q.id === queueItemId
          ? { ...q, type: 'canvas' as const, canvasPageId, fileId: undefined, pageIndex: undefined, fileName: undefined }
          : q
      ),
      _pendingCanvasConversion: {
        queueItemId,
        canvasPageId,
        backgroundElementId: backgroundElement.id,
        backgroundSnippetId: snippetId,
        originalFileId: fileId,
        originalFileName: fileName,
        originalPageIndex: pageIndex,
      },
    }));

    return canvasPageId;
  },
}));
