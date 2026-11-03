'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Position of each screen in the bottom-nav order. Moving to a higher number
// slides the new screen in from the right; lower slides it in from the left.
const ROUTE_ORDER: [string, number][] = [
  ['/dashboard',         0],
  ['/saude',             1],
  ['/diary',             1.1],
  ['/history',           1.2],
  ['/marmitas',          1.3],
  ['/coach',             1.4],
  ['/body-metrics',      2],
  ['/body-measurements', 2.1],
  ['/treinos',           2.2],
  ['/profile',           3],
  ['/notifications',     3.1],
  ['/admin',             3.2],
];

function routeIndex(pathname: string): number | null {
  const hit = ROUTE_ORDER.find(([p]) => pathname === p || pathname.startsWith(p + '/'));
  return hit ? hit[1] : null;
}

// Survives template remounts (module scope), reset on full page loads.
let lastIndex: number | null = null;

type Direction = 'initial' | 'forward' | 'back' | 'fade';

function directionFor(pathname: string): Direction {
  const next = routeIndex(pathname);
  if (lastIndex === null) return 'initial';
  if (next === null || next === lastIndex) return 'fade';
  return next > lastIndex ? 'forward' : 'back';
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [direction] = useState<Direction>(() => directionFor(pathname));

  useEffect(() => {
    lastIndex = routeIndex(pathname);
  }, [pathname]);

  return (
    <div className={`page-transition page-enter-${direction}`}>
      {children}
    </div>
  );
}
