import { cn } from '@/lib/utils';

export function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Left pillar of H */}
      <rect x="4.9" y="5.8" width="3.4" height="12.4" rx="1.7" fill="white" fillOpacity="0.95" />
      {/* Right pillar of H */}
      <rect x="15.7" y="5.8" width="3.4" height="12.4" rx="1.7" fill="white" fillOpacity="0.95" />
      {/* ECG crossbar connecting the pillars */}
      <path
        d="M8.3,12 L10,12 L10.8,9.4 L12,14.8 L13,10.5 L14,12 L15.7,12"
        fill="none"
        stroke="white"
        strokeOpacity="0.95"
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
        'bg-gradient-to-br from-emerald-500 to-emerald-800',
        'flex items-center justify-center flex-shrink-0',
        'shadow-lg shadow-emerald-700/30',
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
