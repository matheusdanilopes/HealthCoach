function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} />;
}

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-4 pt-6 pb-8">
      {/* Avatar + name */}
      <div className="flex items-center gap-4 px-1">
        <Skeleton className="h-14 w-14 rounded-2xl flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-5 w-40 rounded-xl" />
          <Skeleton className="h-3.5 w-52 rounded-full" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[100px] rounded-2xl" />
        <Skeleton className="h-[100px] rounded-2xl" />
      </div>

      {/* Form sections */}
      <Skeleton className="h-[220px] rounded-2xl" />
      <Skeleton className="h-[240px] rounded-2xl" />
      <Skeleton className="h-[200px] rounded-2xl" />

      {/* Save button */}
      <Skeleton className="h-12 rounded-2xl" />

      {/* Account card */}
      <Skeleton className="h-[140px] rounded-2xl" />
    </div>
  );
}
