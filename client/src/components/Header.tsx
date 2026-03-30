import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { buildAllPages } from '../utils/buildPages';
import toast from 'react-hot-toast';
import MergeModal from './MergeModal';
import { generatePdf } from '../services/pdfGenerator';
import { exportPdfAsImages } from '../services/imageExporter';

export default function Header() {
  const queue = useAppStore((s) => s.queue);
  const canvasPages = useAppStore((s) => s.canvasPages);
  const snippets = useAppStore((s) => s.snippets);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setIsGenerating = useAppStore((s) => s.setIsGenerating);
  const exportFormat = useAppStore((s) => s.exportFormat);
  const setExportFormat = useAppStore((s) => s.setExportFormat);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Clean up blob URL when preview closes
  useEffect(() => {
    return () => { if (previewUrl) window.URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const buildPages = () => buildAllPages(queue, canvasPages, snippets);

  const handleGenerate = async () => {
    if (queue.length === 0) {
      toast.error('Add pages to the build queue first');
      return;
    }

    setIsGenerating(true);
    try {
      const pages = buildPages();
      const pdfBytes = await generatePdf(pages);

      if (exportFormat === 'pdf') {
        downloadBlob(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'merged.pdf');
      } else {
        const { blob, filename } = await exportPdfAsImages(pdfBytes, exportFormat as 'png' | 'jpg' | 'webp');
        downloadBlob(blob, filename);
      }

      toast.success(`${exportFormat.toUpperCase()} generated successfully!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate file');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async () => {
    if (queue.length === 0) {
      toast.error('Add pages to the build queue first');
      return;
    }

    setIsPreviewing(true);
    try {
      const pages = buildPages();
      const pdfBytes = await generatePdf(pages);

      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate preview');
      console.error(err);
    } finally {
      setIsPreviewing(false);
    }
  };

  function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  const isBusy = isGenerating || isPreviewing;

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ForgePDF" className="h-12 w-12" />
          <h1 className="text-xl font-semibold text-white tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>Forge PDF</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMergeModal(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Merge PDFs (and other files)
          </button>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'png' | 'jpg' | 'webp')}
            className="px-3 py-2 bg-gray-800 border border-gray-600 text-white text-sm rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="pdf">PDF</option>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
          <button
            onClick={handlePreview}
            disabled={isBusy || queue.length === 0}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isPreviewing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Previewing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </>
            )}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isBusy || queue.length === 0}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Downloading...
              </>
            ) : (
              <>Download {exportFormat.toUpperCase()} ({queue.length} pages)</>
            )}
          </button>
        </div>
      </header>

      {showMergeModal && <MergeModal onClose={() => setShowMergeModal(false)} />}

      {/* In-app preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={closePreview}>
          <div
            className="bg-gray-900 rounded-xl w-full max-w-5xl flex flex-col mx-4"
            style={{ height: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <h2 className="text-sm font-semibold text-white">Preview</h2>
              <button onClick={closePreview} className="text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* PDF iframe */}
            <div className="flex-1 min-h-0">
              <iframe
                src={previewUrl}
                className="w-full h-full rounded-b-xl"
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
