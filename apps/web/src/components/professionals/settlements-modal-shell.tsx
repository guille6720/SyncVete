'use client';

import { useEffect, type ReactNode } from 'react';

interface SettlementsModalShellProps {
  open: boolean;
  titleId: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
}

/** Accessible modal shell for settlements dialogs (Escape, backdrop, aria). */
export function SettlementsModalShell({
  open,
  titleId,
  title,
  description,
  onClose,
  children,
  maxWidthClassName = 'max-w-md',
}: SettlementsModalShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-lg border bg-background p-5 shadow-lg ${maxWidthClassName}`}
      >
        <h3 id={titleId} className="text-lg font-semibold">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
