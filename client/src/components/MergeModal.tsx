import { useState, useRef, useCallback } from 'react';
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PDFDocument } from 'pdf-lib';
import { useAppStore } from '../stores/useAppStore';
import { storeFileBytes } from '../stores/fileStore';
import { convertImageToPdf } from '../services/imageConverter';
import { API_BASE } from '../utils/api';

interface MergeFile {
  id: string;
  file: File;
}

interface Props {
  onClose: () => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.html,.htm';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTypeBadge(name: string): { label: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return { label: 'PDF', color: 'bg-red-500/20 text-red-400' };
    case 'docx': case 'doc': return { label: 'DOC', color: 'bg-blue-500/20 text-blue-400' };
    case 'pptx': case 'ppt': return { label: 'PPT', color: 'bg-orange-500/20 text-orange-400' };
    case 'jpg': case 'jpeg': case 'png': case 'webp': return { label: 'IMG', color: 'bg-green-500/20 text-green-400' };
    case 'html': case 'htm': return { label: 'HTML', color: 'bg-purple-500/20 text-purple-400' };
    default: return { label: ext.toUpperCase(), color: 'bg-gray-500/20 text-gray-400' };
  }
}

function SortableFileItem({ item, onRemove }: { item: MergeFile; onRemove: (id: string) => void }) {
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

  const badge = getTypeBadge(item.file.name);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700 group"
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

      {/* Type badge */}
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.color} shrink-0`}>
        {badge.label}
      </span>

      {/* File name + size */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-200 truncate">{item.file.name}</p>
        <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function MergeModal({ onClose }: Props) {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFile = useAppStore((s) => s.addFile);
  const addToQueue = useAppStore((s) => s.addToQueue);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const items: MergeFile[] = Array.from(newFiles).map((file) => ({
      id: uuidv4(),
      file,
    }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setFiles((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, removed);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleMerge = async () => {
    if (files.length === 0) return;

    setIsMerging(true);
    try {
      const pdfBytesList: ArrayBuffer[] = [];

      for (const item of files) {
        const ext = item.file.name.split('.').pop()?.toLowerCase() || '';
        const isPdf = ext === 'pdf';
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
        const needsServer = ['docx', 'doc', 'pptx', 'ppt', 'html', 'htm'].includes(ext);

        if (isPdf) {
          pdfBytesList.push(await item.file.arrayBuffer());
        } else if (isImage) {
          const ab = await item.file.arrayBuffer();
          const { pdfBytes } = await convertImageToPdf(ab, item.file.type);
          pdfBytesList.push(pdfBytes);
        } else if (needsServer) {
          // Send to server for conversion, get PDF bytes back
          const formData = new FormData();
          formData.append('file', item.file);
          const res = await axios.post(`${API_BASE}/api/upload`, formData, { responseType: 'json' });
          const pdfResp = await axios.get(`${API_BASE}/api/files/${res.data.fileId}/pdf`, { responseType: 'arraybuffer' });
          pdfBytesList.push(pdfResp.data);
        }
      }

      // Merge all PDFs locally with pdf-lib
      const mergedPdf = await PDFDocument.create();
      for (const bytes of pdfBytesList) {
        const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        for (const page of copiedPages) mergedPdf.addPage(page);
      }

      const mergedBytes = await mergedPdf.save();
      const mergedId = uuidv4();
      storeFileBytes(mergedId, mergedBytes.buffer as ArrayBuffer);
      const pageCount = mergedPdf.getPageCount();
      const fileName = `Merged (${files.length} files)`;

      addFile({ id: mergedId, fileName, pageCount });

      for (let i = 0; i < pageCount; i++) {
        addToQueue({
          id: uuidv4(),
          type: 'page',
          fileId: mergedId,
          fileName,
          pageIndex: i,
        });
      }

      toast.success(`Merged ${files.length} files (${pageCount} page${pageCount !== 1 ? 's' : ''} added)`);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Merge failed';
      toast.error(msg);
      console.error('Merge error:', err);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-xl w-full max-w-lg flex flex-col mx-4"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold text-white">Merge Files</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragOver
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
            }`}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <p className="text-sm text-gray-400">
              Drop files here or <span className="text-blue-400">browse</span>
            </p>
            <p className="text-xs text-gray-600 mt-1">
              PDF, DOCX, PPTX, Images, HTML
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500 font-medium">
                {files.length} file{files.length !== 1 ? 's' : ''} — drag to reorder
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={files.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {files.map((item) => (
                      <SortableFileItem key={item.id} item={item} onRemove={removeFile} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            disabled={isMerging}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={isMerging || files.length === 0}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isMerging ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Merging...
              </>
            ) : (
              <>Add to Queue ({files.length} file{files.length !== 1 ? 's' : ''})</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
