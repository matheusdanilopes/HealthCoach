'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Modal({ open, onClose, title, children, className }: ModalProps) {
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  const isClosing = !open && rendered;

  useEffect(() => {
    if (isClosing) {
      const t = setTimeout(() => setRendered(false), 220);
      return () => clearTimeout(t);
    }
  }, [isClosing]);

  useEffect(() => {
    document.body.style.overflow = rendered ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className={cn(
          'absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm',
          isClosing ? 'animate-fade-out' : 'animate-fade-in'
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-md',
          'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800',
          'rounded-t-3xl sm:rounded-2xl p-6',
          'shadow-xl dark:shadow-black/60',
          isClosing ? 'animate-slide-down' : 'animate-slide-up',
          className
        )}
      >
        <div className="flex items-center justify-between mb-5">
          {title && (
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          )}
          <button
            onClick={onClose}
            className={cn(
              'h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700',
              'flex items-center justify-center text-zinc-400 dark:text-zinc-500 transition-colors',
              !title && 'ml-auto'
            )}
          >
            <X size={13} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
