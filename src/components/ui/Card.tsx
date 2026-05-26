import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export default function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl',
        'shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] dark:shadow-none',
        className
      )}
    >
      {children}
    </div>
  );
}
