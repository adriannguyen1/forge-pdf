import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAppStore } from '../stores/useAppStore';
import BuildQueueItem from './BuildQueueItem';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from './ContextMenu';
import { buildPagePayload } from '../utils/buildPages';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { getFileBytes } from '../stores/fileStore';
import { getPageDimensions } from '../services/pdfUtils';
import { generatePdf } from '../services/pdfGenerator';

interface QueueContextMenu {
  x: number;
  y: number;
  itemId: string;
}

export default function BuildQueue() {
  const queue = useAppStore((s) => s.queue);
  const canvasPages = useAppStore((s) => s.canvasPages);
  const snippets = useAppStore((s) => s.snippets);
  const reorderQueue = useAppStore((s) => s.reorderQueue);
  const addToQueue = useAppStore((s) => s.addToQueue);
  const addCanvasPage = useAppStore((s) => s.addCanvasPage);
  const openCanvasEditor = useAppStore((s) => s.openCanvasEditor);
  const clearQueue = useAppStore((s) => s.clearQueue);
  const removeFromQueue = useAppStore((s) => s.removeFromQueue);
  const duplicateQueueItem = useAppStore((s) => s.duplicateQueueItem);
  const selectedQueueItemIds = useAppStore((s) => s.selectedQueueItemIds);
  const selectQueueItem = useAppStore((s) => s.selectQueueItem);
  const clearQueueSelection = useAppStore((s) => s.clearQueueSelection);
  const copySelectedToClipboard = useAppStore((s) => s.copySelectedToClipboard);
  const pasteFromClipboard = useAppStore((s) => s.pasteFromClipboard);
  const clipboardItems = useAppStore((s) => s.clipboardItems);
  const convertPageToCanvas = useAppStore((s) => s.convertPageToCanvas);

  const [contextMenu, setContextMenu] = useState<QueueContextMenu | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((q) => q.id === active.id);
    const newIndex = queue.findIndex((q) => q.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderQueue(oldIndex, newIndex);
    }
  };

  const addNewCanvasPage = () => {
    const pageId = uuidv4();
    addCanvasPage({
      id: pageId,
      label: 'Canvas Page',
      pageSize: 'letter',
      elements: [],
    });
    addToQueue({
      id: uuidv4(),
      type: 'canvas',
      canvasPageId: pageId,
    });
    openCanvasEditor(pageId);
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('[data-queue-item]')) {
      clearQueueSelection();
    }
  };

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    // Select the item if not already selected
    if (!selectedQueueItemIds.includes(itemId)) {
      selectQueueItem(itemId);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, itemId });
  };

  const closeContextMenu = () => setContextMenu(null);

  const contextItem = contextMenu ? queue.find((q) => q.id === contextMenu.itemId) : null;
  const contextItemIndex = contextItem ? queue.indexOf(contextItem) : -1;

  const handleContextEdit = async () => {
    if (!contextItem) return;
    closeContextMenu();
    if (contextItem.type === 'canvas' && contextItem.canvasPageId) {
      openCanvasEditor(contextItem.canvasPageId);
    } else if (contextItem.type === 'page' && contextItem.fileId) {
      try {
        const bytes = getFileBytes(contextItem.fileId!);
        if (!bytes) throw new Error('File not found in store');
        const { width, height, cropBox, rotation } = await getPageDimensions(bytes, contextItem.pageIndex!);
        const canvasPageId = convertPageToCanvas(contextItem.id, { width, height, cropBox, rotation });
        openCanvasEditor(canvasPageId);
      } catch (err) {
        console.error('Failed to convert page:', err);
      }
    }
  };

  const handleContextDuplicate = () => {
    if (!contextItem) return;
    closeContextMenu();
    duplicateQueueItem(contextItem.id);
  };

  const handleContextRename = () => {
    if (!contextItem) return;
    closeContextMenu();
    useAppStore.setState({ _renamingQueueItemId: contextItem.id });
  };

  const handleContextMoveUp = () => {
    if (!contextItem || contextItemIndex <= 0) return;
    closeContextMenu();
    reorderQueue(contextItemIndex, contextItemIndex - 1);
  };

  const handleContextMoveDown = () => {
    if (!contextItem || contextItemIndex >= queue.length - 1) return;
    closeContextMenu();
    reorderQueue(contextItemIndex, contextItemIndex + 1);
  };

  const handleContextCopy = () => {
    closeContextMenu();
    copySelectedToClipboard();
  };

  const handleContextPaste = () => {
    closeContextMenu();
    pasteFromClipboard();
  };

  const handleContextDownload = async () => {
    if (!contextItem) return;
    closeContextMenu();
    try {
      const payload = buildPagePayload(contextItem, canvasPages, snippets);
      const pdfBytes = await generatePdf([payload]);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `page-${contextItemIndex + 1}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Page downloaded');
    } catch (err) {
      toast.error('Failed to download page');
      console.error(err);
    }
  };

  const handleContextDelete = () => {
    if (!contextItem) return;
    closeContextMenu();
    removeFromQueue(contextItem.id);
  };

  return (
    <aside className="w-80 min-w-80 bg-gray-900 border-l border-gray-700 flex flex-col">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">
          Page Order ({queue.length} {queue.length === 1 ? 'page' : 'pages'})
        </h2>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1" onClick={handleBackgroundClick}>
        {queue.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8">
            Click page thumbnails to add them here
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={queue.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              {queue.map((item, index) => (
                <BuildQueueItem
                  key={item.id}
                  item={item}
                  index={index}
                  isSelected={selectedQueueItemIds.includes(item.id)}
                  onContextMenu={(e) => handleContextMenu(e, item.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={addNewCanvasPage}
          className="w-full text-xs px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-lg transition-colors"
        >
          + New Canvas Page
        </button>
      </div>

      {/* Queue item context menu */}
      {contextMenu && contextItem && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
          {(contextItem.type === 'canvas' || contextItem.type === 'page') && (
            <>
              <ContextMenuItem label="Edit" onClick={handleContextEdit} />
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem label="Duplicate" onClick={handleContextDuplicate} shortcut="Ctrl+D" />
          <ContextMenuItem label="Rename" onClick={handleContextRename} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Move Up" onClick={handleContextMoveUp} disabled={contextItemIndex <= 0} />
          <ContextMenuItem label="Move Down" onClick={handleContextMoveDown} disabled={contextItemIndex >= queue.length - 1} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Copy" onClick={handleContextCopy} shortcut="Ctrl+C" />
          <ContextMenuItem label="Paste After" onClick={handleContextPaste} disabled={clipboardItems.length === 0} shortcut="Ctrl+V" />
          <ContextMenuSeparator />
          <ContextMenuItem label="Download as PDF" onClick={handleContextDownload} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Delete" onClick={handleContextDelete} danger shortcut="Del" />
        </ContextMenu>
      )}
    </aside>
  );
}
