const tones = {
  warning: "border-warning-border bg-warning-bg text-gold-text",
  success: "border-success-border bg-[image:var(--success-gradient)] text-night",
  danger: "border-danger-border bg-danger-bg text-danger",
  muted: "border-border bg-surface-muted text-muted",
};

export default function StatusPill({ tone = "warning", children }) {
  return (
    <span className={`inline-flex rounded-full border px-[7px] py-1 text-[11px] leading-none font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}
