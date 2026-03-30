import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { QueueItem } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { getFileBytes } from '../stores/fileStore';
import { getPageDimensions } from '../services/pdfUtils';

interface Props {
  item: QueueItem;
  index: number;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}

export default function BuildQueueItem({ item, index, isSelected, onContextMenu }: Props) {
  const removeFromQueue = useAppStore((s) => s.removeFromQueue);
  const canvasPages = useAppStore((s) => s.canvasPages);
  const openCanvasEditor = useAppStore((s) => s.openCanvasEditor);
  const convertPageToCanvas = useAppStore((s) => s.convertPageToCanvas);
  const updateCanvasPageLabel = useAppStore((s) => s.updateCanvasPageLabel);
  const updateQueueItemName = useAppStore((s) => s.updateQueueItemName);
  const duplicateQueueItem = useAppStore((s) => s.duplicateQueueItem);
  const selectQueueItem = useAppStore((s) => s.selectQueueItem);
  const toggleQueueItemSelection = useAppStore((s) => s.toggleQueueItemSelection);
  const rangeSelectQueueItems = useAppStore((s) => s.rangeSelectQueueItems);
  const renamingId = useAppStore((s) => s._renamingQueueItemId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  // Scroll into view when this item becomes selected (e.g. after closing canvas editor)
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  // Trigger rename from context menu
  useEffect(() => {
    if (renamingId === item.id) {
      setIsEditingName(true);
      useAppStore.setState({ _renamingQueueItemId: null });
    }
  }, [renamingId, item.id]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canvasPage = item.type === 'canvas' ? canvasPages.find((p) => p.id === item.canvasPageId) : null;

  const handleEditPage = async () => {
    if (!item.fileId || item.pageIndex === undefined) return;
    setIsConverting(true);
    try {
      const bytes = getFileBytes(item.fileId!);
      if (!bytes) throw new Error('File not found in store');
      const { width, height, cropBox, rotation } = await getPageDimensions(bytes, item.pageIndex!);
      const canvasPageId = convertPageToCanvas(item.id, { width, height, cropBox, rotation });
      openCanvasEditor(canvasPageId);
    } catch (err) {
      console.error('Failed to convert page:', err);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDoubleClick = () => {
    if (item.type === 'canvas' && item.canvasPageId) {
      openCanvasEditor(item.canvasPageId);
    } else if (item.type === 'page' && item.fileId) {
      handleEditPage();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    if (e.shiftKey) {
      rangeSelectQueueItems(item.id);
    } else if (e.ctrlKey || e.metaKey) {
      toggleQueueItemSelection(item.id);
    } else {
      selectQueueItem(item.id);
    }
  };

  const getTypeColor = () => {
    if (item.type === 'canvas') return 'border-l-purple-500';
    if (item.type === 'blank') return 'border-l-gray-500';
    return 'border-l-blue-500';
  };

  const handleRemove = () => {
    if (item.type === 'canvas') {
      setConfirmingDelete(true);
    } else {
      removeFromQueue(item.id);
    }
  };

  if (confirmingDelete) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 px-2 py-1.5 bg-red-950/50 rounded-lg border border-red-500/40 border-l-2 border-l-red-500"
      >
        <p className="text-xs text-red-300 flex-1">Delete this canvas page?</p>
        <button
          onClick={() => { removeFromQueue(item.id); setConfirmingDelete(false); }}
          className="text-xs px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium"
        >
          Delete
        </button>
        <button
          onClick={() => setConfirmingDelete(false)}
          className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
        >
          Cancel
        </button>
      </div>
    );
  }

  const selectionClass = isSelected
    ? 'ring-2 ring-blue-500 bg-blue-900/20'
    : 'bg-gray-800';

  return (
    <div
      ref={(node) => { setNodeRef(node); (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
      style={style}
      data-queue-item
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-700 border-l-2 ${getTypeColor()} ${selectionClass} group`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 shrink-0"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Index */}
      <span className="text-xs text-gray-500 w-5 text-center shrink-0">{index + 1}</span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        {item.type === 'blank' ? (
          isEditingName ? (
            <input
              autoFocus
              className="bg-gray-900 text-sm text-gray-400 px-1 py-0 rounded border border-gray-500 outline-none w-full"
              value={item.fileName || 'Blank Page'}
              onChange={(e) => updateQueueItemName(item.id, e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false); }}
            />
          ) : (
            <p className="text-sm text-gray-400 truncate cursor-text" onClick={() => setIsEditingName(true)} title="Click to rename">
              {item.fileName || 'Blank Page'}
            </p>
          )
        ) : item.type === 'canvas' ? (
          <>
            {isEditingName ? (
              <input
                autoFocus
                className="bg-gray-900 text-sm text-purple-300 px-1 py-0 rounded border border-purple-500 outline-none w-full"
                value={canvasPage?.label || ''}
                onChange={(e) => item.canvasPageId && updateCanvasPageLabel(item.canvasPageId, e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false); }}
              />
            ) : (
              <p className="text-sm text-purple-300 truncate cursor-text" onClick={() => setIsEditingName(true)} title="Click to rename">
                {canvasPage?.label || 'Canvas Page'}
              </p>
            )}
            <p className="text-xs text-gray-500">
              {canvasPage?.elements.length || 0} element{(canvasPage?.elements.length || 0) !== 1 ? 's' : ''} — double-click to edit
            </p>
          </>
        ) : (
          <>
            {isEditingName ? (
              <input
                autoFocus
                className="bg-gray-900 text-sm text-gray-200 px-1 py-0 rounded border border-blue-500 outline-none w-full"
                value={item.fileName || ''}
                onChange={(e) => updateQueueItemName(item.id, e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false); }}
              />
            ) : (
              <p className="text-sm text-gray-200 truncate cursor-text" onClick={() => setIsEditingName(true)} title="Click to rename">
                {item.fileName}
              </p>
            )}
            <p className="text-xs text-gray-500">Page {(item.pageIndex ?? 0) + 1} — double-click to edit</p>
          </>
        )}
      </div>

      {/* Edit button for canvas */}
      {item.type === 'canvas' && item.canvasPageId && (
        <button
          onClick={() => openCanvasEditor(item.canvasPageId!)}
          className="text-purple-400 hover:text-purple-300 shrink-0"
          title="Edit canvas page"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}

      {/* Edit button for page items */}
      {item.type === 'page' && item.fileId && (
        <button
          onClick={handleEditPage}
          disabled={isConverting}
          className="text-blue-400 hover:text-blue-300 shrink-0 disabled:opacity-50"
          title="Edit page (add annotations)"
        >
          {isConverting ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
        </button>
      )}

      {/* Duplicate */}
      <button
        onClick={() => duplicateQueueItem(item.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 transition-opacity shrink-0"
        title="Duplicate page"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Remove */}
      <button
        onClick={handleRemove}
        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
