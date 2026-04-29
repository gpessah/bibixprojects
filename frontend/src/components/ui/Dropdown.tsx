import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export default function Dropdown({ trigger, children, align = 'left', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + window.scrollY + 4,
      left: align === 'right' ? r.right + window.scrollX : r.left + window.scrollX,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: pos.top,
        ...(align === 'right' ? { right: window.innerWidth - pos.left } : { left: pos.left }),
        zIndex: 9999,
      }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px]"
      onClick={() => setOpen(false)}
    >
      {children}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <div onClick={() => open ? setOpen(false) : openDropdown()}>{trigger}</div>
      {panel}
    </div>
  );
}

export function DropdownItem({ children, onClick, danger, disabled }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}
