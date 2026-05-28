function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-shimmer rounded-xl ${className ?? ''}`} />
  );
}

export default function HistoryLoading() {
  return (
    <div className="flex flex-col gap-6 pt-8 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>

      {/* Weight chart */}
      <Skeleton className="h-[248px] rounded-2xl" />

      {/* Calorie chart */}
      <Skeleton className="h-[280px] rounded-2xl" />
    </div>
  );
}
