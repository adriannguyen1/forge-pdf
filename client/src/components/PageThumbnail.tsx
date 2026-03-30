import { Document, Page } from 'react-pdf';
import { useAppStore } from '../stores/useAppStore';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  fileId: string;
  fileName: string;
  pageIndex: number;
  pdfUrl: string;
}

export default function PageThumbnail({ fileId, fileName, pageIndex, pdfUrl }: Props) {
  const addToQueue = useAppStore((s) => s.addToQueue);
  const removeFromQueue = useAppStore((s) => s.removeFromQueue);
  const queue = useAppStore((s) => s.queue);
  const openSnippetCropper = useAppStore((s) => s.openSnippetCropper);

  const queueItem = queue.find(
    (q) => q.fileId === fileId && q.pageIndex === pageIndex && q.type === 'page'
  );
  const isInQueue = !!queueItem;

  const toggle = () => {
    if (isInQueue && queueItem) {
      removeFromQueue(queueItem.id);
    } else {
      addToQueue({
        id: uuidv4(),
        fileId,
        fileName,
        pageIndex,
        type: 'page',
      });
    }
  };

  const handleCropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openSnippetCropper(fileId, fileName, pageIndex);
  };

  return (
    <div
      onClick={toggle}
      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:shadow-lg group ${
        isInQueue
          ? 'border-blue-500 shadow-blue-500/20 shadow-lg'
          : 'border-gray-700 hover:border-gray-500'
      }`}
    >
      {/* Page number badge */}
      <div className="absolute top-1.5 left-1.5 z-10 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
        {pageIndex + 1}
      </div>

      {/* Selection indicator */}
      <div
        className={`absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isInQueue ? 'bg-blue-500 border-blue-500' : 'border-gray-400 bg-black/40'
        }`}
      >
        {isInQueue && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Snippet button */}
      <button
        onClick={handleCropClick}
        className="absolute bottom-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-500 text-white text-xs px-2.5 py-1.5 rounded flex items-center gap-1"
        title="Create snippets from this page"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
        </svg>
        Snippet
      </button>

      {/* PDF thumbnail */}
      <div className="bg-white flex items-center justify-center" style={{ minHeight: 200 }}>
        <Document file={pdfUrl} loading={<div className="w-full h-48 bg-gray-800 animate-pulse" />}>
          <Page
            pageNumber={pageIndex + 1}
            width={180}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
