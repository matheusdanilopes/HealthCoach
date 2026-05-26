function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800 ${className ?? ''}`} />
  );
}

export default function DiaryLoading() {
  return (
    <div className="flex flex-col gap-6 pt-8 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-6 w-20" />
      </div>

      {/* Summary card */}
      <Skeleton className="h-[140px] rounded-2xl" />

      {/* Meal sections */}
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-[60px] rounded-2xl" />
      ))}

      {/* Add workout button */}
      <Skeleton className="h-11 rounded-xl" />
    </div>
  );
}
