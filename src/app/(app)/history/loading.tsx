function Skel({ className }: { className?: string }) {
  return <div className={`animate-shimmer rounded-2xl ${className ?? ''}`} />;
}

export default function HistoryLoading() {
  return (
    <div className="flex flex-col gap-5 pt-8 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <Skel className="h-6 w-24 rounded-xl" />
          <Skel className="h-3 w-32 rounded-full" />
        </div>
        <Skel className="h-9 w-28 rounded-xl" />
      </div>

      {/* Evolution Score */}
      <Skel className="h-[176px]" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <Skel className="h-[100px]" />
        <Skel className="h-[100px]" />
        <Skel className="h-[100px]" />
        <Skel className="h-[100px]" />
      </div>

      {/* Weight chart */}
      <Skel className="h-[272px]" />

      {/* Nutrition chart */}
      <Skel className="h-[304px]" />

      {/* Projection */}
      <Skel className="h-[156px]" />

      {/* Milestones */}
      <Skel className="h-[228px]" />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Skel className="h-[76px]" />
        <Skel className="h-[76px]" />
      </div>
    </div>
  );
}
