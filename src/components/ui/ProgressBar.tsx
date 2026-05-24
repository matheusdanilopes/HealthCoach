import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  sublabel?: string;
  color?: string;
  className?: string;
}

export default function ProgressBar({
  value,
  max,
  label,
  sublabel,
  color = 'bg-emerald-500',
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isOver = value > max && max > 0;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || sublabel) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-zinc-400">{label}</span>}
          {sublabel && (
            <span className={cn('font-medium', isOver ? 'text-red-400' : 'text-zinc-300')}>
              {sublabel}
            </span>
          )}
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', isOver ? 'bg-red-500' : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
