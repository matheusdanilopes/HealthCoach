function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800 ${className ?? ''}`} />
  );
}

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-4 pt-6 pb-4">
      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-2">
        <Skeleton className="h-14 w-14 rounded-2xl flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[104px] rounded-2xl" />
        <Skeleton className="h-[104px] rounded-2xl" />
      </div>

      {/* Form card */}
      <Skeleton className="h-[460px] rounded-2xl" />

      {/* Account card */}
      <Skeleton className="h-[120px] rounded-2xl" />
    </div>
  );
}
