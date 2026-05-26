import { cn } from '@/lib/utils';

export function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C8.5 4.5 4 8.5 4 14C4 19.52 7.48 23 12 23C16.52 23 20 19.52 20 14C20 8.5 15.5 4.5 12 2Z"
        fill="white"
        fillOpacity="0.92"
      />
      <path
        d="M7.5 13.5H9.5L10.5 10.5L12.5 17.5L14 12.5L15.5 13.5L17 13.5"
        stroke="rgba(0,80,30,0.35)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export default function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const configs = {
    sm: { boxCls: 'h-7 w-7 rounded-[10px]',          iconSize: 14, textCls: 'text-[13px]', gap: 'gap-2.5' },
    md: { boxCls: 'h-10 w-10 rounded-[14px]',         iconSize: 20, textCls: 'text-[15px]', gap: 'gap-3'   },
    lg: { boxCls: 'h-[60px] w-[60px] rounded-[20px]', iconSize: 28, textCls: 'text-[22px]', gap: 'gap-3'   },
  };

  const { boxCls, iconSize, textCls, gap } = configs[size];

  return (
    <div className={cn('flex items-center', gap, className)}>
      <div className={cn(
        boxCls,
        'bg-gradient-to-br from-emerald-500 to-emerald-700',
        'flex items-center justify-center flex-shrink-0',
        'shadow-lg shadow-emerald-600/30',
      )}>
        <LogoIcon size={iconSize} />
      </div>
      {showText && (
        <span className={cn(textCls, 'font-bold text-zinc-900 dark:text-zinc-100 tracking-tight')}>
          HealthCoach
        </span>
      )}
    </div>
  );
}
