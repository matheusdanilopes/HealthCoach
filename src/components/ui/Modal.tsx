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
      const t = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(t);
    }
  }, [isClosing]);

  useEffect(() => {
    document.body.style.overflow = rendered ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-14 sm:pb-0">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-[2px]',
          isClosing ? 'animate-fade-out' : 'animate-fade-in'
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-md',
          'bg-white dark:bg-zinc-900',
          'border border-zinc-100 dark:border-zinc-800/80',
          'rounded-t-[24px] sm:rounded-2xl',
          'shadow-2xl shadow-black/10 dark:shadow-black/60',
          'max-h-[calc(100dvh-8rem)] sm:max-h-[calc(100dvh-4rem)] flex flex-col',
          isClosing ? 'animate-slide-down' : 'animate-slide-up',
          className
        )}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </div>

        <div className={cn('flex items-center justify-between px-6', title ? 'pb-4 pt-4 sm:pt-5' : 'pb-2 pt-4 sm:pt-5')}>
          {title && (
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {title}
            </h3>
          )}
          <button
            onClick={onClose}
            className={cn(
              'h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
              'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700',
              'text-zinc-400 dark:text-zinc-500',
              !title && 'ml-auto'
            )}
          >
            <X size={13} />
          </button>
        </div>

        {title && (
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-6" />
        )}

        <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
