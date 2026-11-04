export function Skeleton({ className = "" }) {
  return (
    <span
      className={`inline-block animate-shimmer rounded-[10px] bg-[linear-gradient(90deg,var(--color-surface-muted)_25%,var(--color-border)_37%,var(--color-surface-muted)_63%)] bg-size-[400%_100%] ${className}`}
    />
  );
}

export function SkeletonRows({ count = 4 }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-b border-border py-3.5 last:border-b-0">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="grid min-w-0 flex-1 gap-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-6 w-[70px] shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
