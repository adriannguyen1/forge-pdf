/**
 * In-memory store for PDF file bytes, kept outside Zustand to avoid
 * bloating undo/redo snapshots with large binary data.
 */

const fileStore = new Map<string, ArrayBuffer>();
const blobUrlCache = new Map<string, string>();

export function storeFileBytes(fileId: string, bytes: ArrayBuffer): void {
  // Revoke any stale blob URL for this ID before overwriting
  revokeBlobUrl(fileId);
  fileStore.set(fileId, bytes);
}

export function getFileBytes(fileId: string): ArrayBuffer | undefined {
  return fileStore.get(fileId);
}

export function hasFileBytes(fileId: string): boolean {
  return fileStore.has(fileId);
}

export function removeFileBytes(fileId: string): void {
  revokeBlobUrl(fileId);
  fileStore.delete(fileId);
}

export function getOrCreateBlobUrl(fileId: string): string | null {
  const existing = blobUrlCache.get(fileId);
  if (existing) return existing;

  const bytes = fileStore.get(fileId);
  if (!bytes) return null;

  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(fileId, url);
  return url;
}

export function revokeBlobUrl(fileId: string): void {
  const url = blobUrlCache.get(fileId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(fileId);
  }
}
