function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-5 pt-7 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-7 w-48 rounded-xl" />
          <Skeleton className="h-9 rounded-xl" />
        </div>
        <Skeleton className="h-9 w-20 rounded-xl mt-[38px]" />
      </div>

      {/* Calorie card */}
      <Skeleton className="h-[148px] rounded-2xl" />

      {/* AI insight */}
      <Skeleton className="h-[100px] rounded-2xl" />

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
      </div>

      {/* Macros + Water */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="flex-1 h-[180px] rounded-2xl" />
        <Skeleton className="sm:w-56 h-[280px] rounded-2xl" />
      </div>
    </div>
  );
}
