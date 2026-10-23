import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ title, children, onClose, locked = false }: { title: string; children: ReactNode; onClose: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog className="counter-sheet" ref={ref} onCancel={e => { e.preventDefault(); if (!locked) onClose(); }} aria-label={title}>
    <div className="sheet-heading"><h2>{title}</h2><button className="sheet-close" disabled={locked} onClick={onClose} aria-label={`Close ${title}`}>×</button></div>
    {children}
  </dialog>;
}
