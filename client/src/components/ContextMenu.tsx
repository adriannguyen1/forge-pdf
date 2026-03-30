import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const stableClose = useCallback(onClose, [onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        stableClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); stableClose(); }
    };
    const handleScroll = () => stableClose();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [stableClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body
  );
}

interface ContextMenuItemProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
}

export function ContextMenuItem({ label, onClick, disabled, danger, shortcut }: ContextMenuItemProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-4
        ${danger ? 'text-red-400 hover:bg-red-900/30' : 'text-gray-200 hover:bg-gray-700'}
        disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-xs text-gray-500">{shortcut}</span>}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <hr className="border-gray-700 my-1" />;
}
