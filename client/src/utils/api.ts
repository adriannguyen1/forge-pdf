/**
 * In Tauri (desktop app), the server runs on a dynamic port injected via IPC.
 * In dev (Vite), the proxy handles /api → localhost:3001, so API_BASE is empty.
 */
export const API_BASE = (window as any).__SERVER_PORT__
  ? `http://localhost:${(window as any).__SERVER_PORT__}`
  : '';
