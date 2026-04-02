/**
 * In Tauri (desktop app), the server runs on a dynamic port injected via IPC.
 * In dev (Vite), the proxy handles /api → localhost:3001, so API_BASE is empty.
 *
 * This is a function (not a const) because the port is set asynchronously
 * in main.tsx before React renders, and we need to read it at call time.
 */
export function getApiBase(): string {
  const port = (window as any).__SERVER_PORT__;
  return port ? `http://localhost:${port}` : '';
}

// Keep backward compat for any direct references
export const API_BASE = '';
