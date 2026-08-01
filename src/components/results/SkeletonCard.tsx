export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-card border border-neutral-200 bg-white">
      <div className="aspect-[4/3] w-full animate-pulse bg-neutral-100" />
      <div className="space-y-2 p-3.5">
        <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
      </div>
    </div>
  );
}
