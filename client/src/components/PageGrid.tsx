import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import PageThumbnail from './PageThumbnail';
import { v4 as uuidv4 } from 'uuid';
import { getOrCreateBlobUrl } from '../stores/fileStore';
import { API_BASE } from '../utils/api';

export default function PageGrid() {
  const files = useAppStore((s) => s.files);
  const selectedFileId = useAppStore((s) => s.selectedFileId);
  const addToQueue = useAppStore((s) => s.addToQueue);
  const queue = useAppStore((s) => s.queue);

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId),
    [files, selectedFileId]
  );

  if (!selectedFile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500">Upload a file and select it to view pages</p>
        </div>
      </div>
    );
  }

  const pdfUrl = getOrCreateBlobUrl(selectedFile.id) || `${API_BASE}/api/files/${selectedFile.id}/pdf`;
  const pageIndices = Array.from({ length: selectedFile.pageCount }, (_, i) => i);

  const allSelected = pageIndices.every((i) =>
    queue.some((q) => q.fileId === selectedFile.id && q.pageIndex === i && q.type === 'page')
  );

  const handleSelectAll = () => {
    if (allSelected) return;
    for (const i of pageIndices) {
      const exists = queue.some(
        (q) => q.fileId === selectedFile.id && q.pageIndex === i && q.type === 'page'
      );
      if (!exists) {
        addToQueue({
          id: uuidv4(),
          fileId: selectedFile.id,
          fileName: selectedFile.fileName,
          pageIndex: i,
          type: 'page',
        });
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-medium text-white">{selectedFile.fileName}</h2>
          <p className="text-xs text-gray-500">{selectedFile.pageCount} pages</p>
        </div>
        <button
          onClick={handleSelectAll}
          disabled={allSelected}
          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded transition-colors"
        >
          Select All
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {pageIndices.map((i) => (
            <PageThumbnail
              key={`${selectedFile.id}-${i}`}
              fileId={selectedFile.id}
              fileName={selectedFile.fileName}
              pageIndex={i}
              pdfUrl={pdfUrl}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
