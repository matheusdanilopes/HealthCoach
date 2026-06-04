function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} />;
}

export default function DiaryLoading() {
  return (
    <div className="flex flex-col gap-5 pt-7 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-24 rounded-xl" />
        <Skeleton className="h-9 rounded-xl" />
      </div>

      {/* Summary card */}
      <Skeleton className="h-[130px] rounded-2xl" />

      {/* Meal sections */}
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-[60px] rounded-2xl" />
      ))}

      {/* Water section */}
      <Skeleton className="h-[100px] rounded-2xl" />

      {/* Add workout button */}
      <Skeleton className="h-12 rounded-2xl" />
    </div>
  );
}
