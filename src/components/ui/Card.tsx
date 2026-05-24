import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export default function Card({ className, children }: CardProps) {
  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl p-4', className)}>
      {children}
    </div>
  );
}
