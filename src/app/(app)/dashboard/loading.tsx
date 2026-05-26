function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800 ${className ?? ''}`} />
  );
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 pt-8 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-44" />
        </div>
        <Skeleton className="h-9 w-20 rounded-xl" />
      </div>

      {/* 2-column layout */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Left */}
        <div className="flex flex-col gap-3 flex-1 w-full">
          <Skeleton className="h-[180px] rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        </div>
        {/* Right */}
        <div className="flex flex-col gap-3 w-full sm:w-56 flex-shrink-0">
          <Skeleton className="h-[148px] rounded-2xl" />
          <Skeleton className="h-[148px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
