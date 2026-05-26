'use client';

import { cn } from '@/lib/utils';
import { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 select-none';

  const variants = {
    primary:
      'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/25 hover:shadow-emerald-500/30',
    secondary:
      'bg-zinc-100 hover:bg-zinc-150 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 dark:text-zinc-200',
    ghost:
      'bg-transparent hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 dark:hover:bg-zinc-800/80 dark:text-zinc-400 dark:hover:text-zinc-100',
    danger:
      'bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 dark:text-red-400 dark:border-red-900/50',
  };

  const sizes = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-sm gap-2',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}
