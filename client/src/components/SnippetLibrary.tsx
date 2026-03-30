import { useState, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from './ContextMenu';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { storeFileBytes } from '../stores/fileStore';
import { convertImageToPdfTight } from '../services/imageConverter';
import { renderSnippetAsPng } from '../services/snippetRenderer';

const RENDER_WIDTH = 700;

interface SnippetContextMenuState {
  x: number;
  y: number;
  snippetId: string;
}

export default function SnippetLibrary() {
  const snippets = useAppStore((s) => s.snippets);
  const removeSnippet = useAppStore((s) => s.removeSnippet);
  const updateSnippetLabel = useAppStore((s) => s.updateSnippetLabel);
  const addSnippet = useAppStore((s) => s.addSnippet);
  const addFile = useAppStore((s) => s.addFile);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<SnippetContextMenuState | null>(null);

  const downloadSnippet = async (snippet: typeof snippets[number]) => {
    try {
      const blob = await renderSnippetAsPng(
        snippet.fileId, snippet.pageIndex, snippet.pixelCrop
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${snippet.label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download snippet');
    }
  };

  const handleImageAsSnippet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { pdfBytes, pageWidth, pageHeight } = await convertImageToPdfTight(arrayBuffer, file.type);
      const fileId = uuidv4();
      storeFileBytes(fileId, pdfBytes);
      addFile({ id: fileId, fileName: file.name, pageCount: 1 });

      // PDF page is sized exactly to the image (tight mode — no margins).
      // Create a full-page snippet covering the entire image.
      const pixelH = RENDER_WIDTH * (pageHeight / pageWidth);
      addSnippet({
        id: uuidv4(),
        fileId,
        fileName: file.name,
        pageIndex: 0,
        cropBox: { x: 0, y: 0, width: pageWidth, height: pageHeight },
        pixelCrop: { x: 0, y: 0, width: RENDER_WIDTH, height: pixelH },
        label: file.name.replace(/\.[^.]+$/, ''),
        createdAt: Date.now(),
      });

      toast.success('Image added as snippet');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, snippetId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, snippetId });
  };

  const closeContextMenu = () => setContextMenu(null);

  const contextSnippet = contextMenu ? snippets.find((s) => s.id === contextMenu.snippetId) : null;

  const handleContextRename = () => {
    if (!contextSnippet) return;
    closeContextMenu();
    setEditingId(contextSnippet.id);
  };

  const handleContextDuplicate = () => {
    if (!contextSnippet) return;
    closeContextMenu();
    addSnippet({
      ...contextSnippet,
      id: uuidv4(),
      label: `${contextSnippet.label} (copy)`,
      createdAt: Date.now(),
    });
  };

  const handleContextDownload = () => {
    if (!contextSnippet) return;
    closeContextMenu();
    downloadSnippet(contextSnippet);
  };

  const handleContextDelete = () => {
    if (!contextSnippet) return;
    closeContextMenu();
    removeSnippet(contextSnippet.id);
  };

  const addImageBtn = (
    <>
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageAsSnippet} />
      <button
        onClick={() => imageInputRef.current?.click()}
        disabled={isUploading}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {isUploading ? 'Uploading...' : 'Add Image as Snippet'}
      </button>
    </>
  );

  if (snippets.length === 0) {
    return (
      <div className="flex-1 flex flex-col p-4">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 text-gray-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-gray-600">No snippets yet</p>
            <p className="text-xs text-gray-700 mt-1">Use the crop button on page thumbnails</p>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-700">
          {addImageBtn}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="group flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/snippet-id', snippet.id);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onContextMenu={(e) => handleContextMenu(e, snippet.id)}
        >
          {/* Color indicator */}
          <div className="w-8 h-8 rounded bg-purple-600/30 border border-purple-500/30 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            {editingId === snippet.id ? (
              <input
                autoFocus
                className="bg-gray-900 text-xs text-white px-1.5 py-0.5 rounded border border-purple-500 outline-none w-full"
                value={snippet.label}
                onChange={(e) => updateSnippetLabel(snippet.id, e.target.value)}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
              />
            ) : (
              <p
                className="text-xs text-gray-200 truncate cursor-text"
                onClick={() => setEditingId(snippet.id)}
                title="Click to rename"
              >
                {snippet.label}
              </p>
            )}
            <p className="text-xs text-gray-600 truncate">{snippet.fileName} — Pg {snippet.pageIndex + 1}</p>
          </div>

          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => downloadSnippet(snippet)}
              className="text-gray-500 hover:text-blue-400 transition-colors"
              title="Download as PNG"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={() => removeSnippet(snippet.id)}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-700 text-center pt-2">Drag snippets onto canvas pages</p>
      <div className="pt-2">
        {addImageBtn}
      </div>

      {/* Snippet context menu */}
      {contextMenu && contextSnippet && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
          <ContextMenuItem label="Rename" onClick={handleContextRename} />
          <ContextMenuItem label="Duplicate" onClick={handleContextDuplicate} />
          <ContextMenuItem label="Download as PNG" onClick={handleContextDownload} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Delete" onClick={handleContextDelete} danger />
        </ContextMenu>
      )}
    </div>
  );
}
