function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 pt-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-32 rounded-lg" />
          <Skeleton className="h-7 w-48 rounded-xl" />
        </div>
        <Skeleton className="h-11 w-24 rounded-2xl" />
      </div>

      {/* Week strip */}
      <Skeleton className="h-[104px] rounded-2xl" />

      {/* Daily summary */}
      <Skeleton className="h-[330px] rounded-3xl" />

      {/* Primary action */}
      <Skeleton className="h-14 rounded-2xl" />

      {/* Water */}
      <Skeleton className="h-[136px] rounded-3xl" />

      {/* Meals */}
      <Skeleton className="h-[340px] rounded-3xl" />
    </div>
  );
}
