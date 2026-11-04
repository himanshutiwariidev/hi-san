export function Table({ children, minWidth = "min-w-[760px]" }) {
  return (
    <div className="relative max-h-[560px] overflow-auto">
      <table className={`w-full border-collapse ${minWidth}`}>{children}</table>
    </div>
  );
}

export function Th({ className = "", ...props }) {
  return (
    <th
      className={`sticky top-0 border-b border-border bg-surface-muted px-2.5 py-[11px] text-left align-top text-[11px] tracking-[.06em] text-muted uppercase ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }) {
  return <td className={`border-b border-border px-2.5 py-[11px] text-left align-top ${className}`} {...props} />;
}
