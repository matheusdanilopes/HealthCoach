// Fallback skeleton for routes without their own loading.tsx. Because it is
// prefetched with the route, it appears instantly when a tab is tapped.
function Skel({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} />;
}

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4 pt-7 pb-8" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-col gap-2 px-1">
        <Skel className="h-7 w-40 rounded-xl" />
        <Skel className="h-3 w-56 rounded-full" />
      </div>
      <Skel className="h-[150px] rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skel className="h-[96px] rounded-2xl" />
        <Skel className="h-[96px] rounded-2xl" />
      </div>
      <Skel className="h-[220px] rounded-3xl" />
    </div>
  );
}
