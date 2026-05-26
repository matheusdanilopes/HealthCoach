import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export default function Card({ className, children }: CardProps) {
  return (
    <div className={cn(
      'bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-2xl',
      'shadow-[0_1px_3px_0_rgb(0,0,0,0.04)] dark:shadow-none',
      className
    )}>
      {children}
    </div>
  );
}
