import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import FileUpload from './FileUpload';
import SnippetLibrary from './SnippetLibrary';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from './ContextMenu';
import { v4 as uuidv4 } from 'uuid';
import { getOrCreateBlobUrl } from '../stores/fileStore';

interface FileContextMenuState {
  x: number;
  y: number;
  fileId: string;
}

export default function Sidebar() {
  const files = useAppStore((s) => s.files);
  const selectedFileId = useAppStore((s) => s.selectedFileId);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const removeFile = useAppStore((s) => s.removeFile);
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const snippets = useAppStore((s) => s.snippets);
  const updateFileName = useAppStore((s) => s.updateFileName);
  const addToQueue = useAppStore((s) => s.addToQueue);
  const isPageInQueue = useAppStore((s) => s.isPageInQueue);

  const [contextMenu, setContextMenu] = useState<FileContextMenuState | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  };

  const closeContextMenu = () => setContextMenu(null);

  const contextFile = contextMenu ? files.find((f) => f.id === contextMenu.fileId) : null;

  const handleContextSelect = () => {
    if (!contextFile) return;
    closeContextMenu();
    setSelectedFile(contextFile.id);
  };

  const handleContextAddAllPages = () => {
    if (!contextFile) return;
    closeContextMenu();
    for (let i = 0; i < contextFile.pageCount; i++) {
      if (!isPageInQueue(contextFile.id, i)) {
        addToQueue({
          id: uuidv4(),
          type: 'page',
          fileId: contextFile.id,
          fileName: contextFile.fileName,
          pageIndex: i,
        });
      }
    }
  };

  const handleContextRename = () => {
    if (!contextFile) return;
    closeContextMenu();
    setEditingFileId(contextFile.id);
  };

  const handleContextDownload = () => {
    if (!contextFile) return;
    closeContextMenu();
    const url = getOrCreateBlobUrl(contextFile.id);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = contextFile.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleContextRemove = () => {
    if (!contextFile) return;
    closeContextMenu();
    removeFile(contextFile.id);
  };

  return (
    <aside className="w-72 min-w-72 bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setSidebarTab('files')}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            sidebarTab === 'files'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Files ({files.length})
        </button>
        <button
          onClick={() => setSidebarTab('snippets')}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            sidebarTab === 'snippets'
              ? 'text-white border-b-2 border-purple-500 bg-gray-800/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Snippets ({snippets.length})
        </button>
      </div>

      {sidebarTab === 'files' ? (
        <>
          <div className="p-3 border-b border-gray-700">
            <FileUpload />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {files.length === 0 && (
              <p className="text-xs text-gray-600 text-center mt-8">No files uploaded yet</p>
            )}
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file.id)}
                onContextMenu={(e) => handleContextMenu(e, file.id)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  selectedFileId === file.id
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'hover:bg-gray-800 text-gray-300 border border-transparent'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="min-w-0 flex-1">
                  {editingFileId === file.id ? (
                    <input
                      autoFocus
                      className="bg-gray-900 text-sm text-gray-200 px-1 py-0 rounded border border-blue-500 outline-none w-full"
                      value={file.fileName}
                      onChange={(e) => updateFileName(file.id, e.target.value)}
                      onBlur={() => setEditingFileId(null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setEditingFileId(null); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-sm truncate">{file.fileName}</p>
                  )}
                  <p className="text-xs text-gray-500">{file.pageCount} page{file.pageCount !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                  title="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* File context menu */}
          {contextMenu && contextFile && (
            <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
              <ContextMenuItem label="Select" onClick={handleContextSelect} />
              <ContextMenuItem label="Add All Pages to Queue" onClick={handleContextAddAllPages} />
              <ContextMenuItem label="Rename" onClick={handleContextRename} />
              <ContextMenuItem label="Download Original PDF" onClick={handleContextDownload} />
              <ContextMenuSeparator />
              <ContextMenuItem label="Remove" onClick={handleContextRemove} danger />
            </ContextMenu>
          )}
        </>
      ) : (
        <SnippetLibrary />
      )}
    </aside>
  );
}
