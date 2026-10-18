function Skel({ className }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className ?? ''}`} />;
}

export default function HistoryLoading() {
  return (
    <div className="flex flex-col gap-4 pt-7 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <Skel className="h-7 w-28 rounded-xl" />
          <Skel className="h-3 w-36 rounded-full" />
        </div>
        <Skel className="h-9 w-28 rounded-xl" />
      </div>

      {/* Evolution Score */}
      <Skel className="h-[176px]" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4].map((i) => <Skel key={i} className="h-[100px]" />)}
      </div>

      {/* Weight chart */}
      <Skel className="h-[260px]" />

      {/* Nutrition chart */}
      <Skel className="h-[290px]" />

      {/* Workouts */}
      <Skel className="h-[140px]" />

      {/* Milestones */}
      <Skel className="h-[220px]" />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Skel className="h-[76px]" />
        <Skel className="h-[76px]" />
      </div>
    </div>
  );
}
