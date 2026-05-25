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
          'absolute inset-0 bg-black/40 backdrop-blur-sm',
          isClosing ? 'animate-fade-out' : 'animate-fade-in'
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-md bg-white border border-zinc-200 rounded-t-3xl sm:rounded-2xl p-5 shadow-xl',
          isClosing ? 'animate-slide-down' : 'animate-slide-up',
          className
        )}
      >
        <div className="flex items-center justify-between mb-5">
          {title && <h3 className="font-semibold text-zinc-900">{title}</h3>}
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
