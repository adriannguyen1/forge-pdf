import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PageGrid from './components/PageGrid';
import BuildQueue from './components/BuildQueue';
import SnippetCropper from './components/SnippetCropper';
import CanvasEditor from './components/CanvasEditor';
import { useAppStore } from './stores/useAppStore';

export default function App() {
  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = useAppStore.getState();

      // Don't interfere with canvas editor or snippet cropper
      if (state.canvasEditorPageId !== null) return;
      if (state.snippetCropperPage !== null) return;

      // Don't interfere with text inputs
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — Undo
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        state.undo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y — Redo
      if ((ctrl && e.shiftKey && e.key === 'z') || (ctrl && e.key === 'y')) {
        e.preventDefault();
        state.redo();
        return;
      }

      // Ctrl+C — Copy selected queue items
      if (ctrl && e.key === 'c') {
        if (state.selectedQueueItemIds.length > 0) {
          e.preventDefault();
          state.copySelectedToClipboard();
        }
        return;
      }

      // Ctrl+V — Paste from clipboard
      if (ctrl && e.key === 'v') {
        if (state.clipboardItems.length > 0) {
          e.preventDefault();
          state.pasteFromClipboard();
        }
        return;
      }

      // Ctrl+D — Duplicate selected items
      if (ctrl && e.key === 'd') {
        if (state.selectedQueueItemIds.length > 0) {
          e.preventDefault();
          state.duplicateSelectedItems();
        }
        return;
      }

      // Ctrl+A — Select all queue items
      if (ctrl && e.key === 'a') {
        if (state.queue.length > 0) {
          e.preventDefault();
          state.selectAllQueueItems();
        }
        return;
      }

      // Delete / Backspace — Remove selected items
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedQueueItemIds.length > 0) {
          e.preventDefault();
          state.removeSelectedItems();
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-200">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1f2937',
            color: '#e5e7eb',
            border: '1px solid #374151',
          },
        }}
      />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <PageGrid />
        <BuildQueue />
      </div>
      <SnippetCropper />
      <CanvasEditor />
    </div>
  );
}
