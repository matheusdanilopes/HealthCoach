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
        <label className="text-sm font-medium text-zinc-300">{label}</label>
      )}
      <input
        className={cn(
          'h-11 w-full rounded-xl bg-zinc-800 border border-zinc-700 px-3 text-sm text-zinc-100 placeholder:text-zinc-500',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          'transition-all duration-150',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
