import { cn } from '@/lib/utils';
import { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
          {label}
        </label>
      )}
      <input
        className={cn(
          'h-11 w-full rounded-xl bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50',
          'px-3.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400/80 dark:focus:border-emerald-500/60',
          'transition-all duration-150',
          error && 'border-red-400/80 focus:ring-red-400/25',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
