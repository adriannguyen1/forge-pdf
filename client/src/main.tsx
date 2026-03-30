import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { pdfjs } from 'react-pdf'
import './index.css'
import App from './App.tsx'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

async function init() {
  // In Tauri, fetch the dynamic server port before rendering
  if ((window as any).__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core');
    (window as any).__SERVER_PORT__ = await invoke('get_server_port');
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

init();
