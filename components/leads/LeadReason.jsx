import { REASON_GROUP_LABELS } from "@/lib/leadReasons";

const labelTone = {
  success: "text-success",
  pending: "text-muted",
  filter: "text-gold-text",
  indiamart: "text-accent-dark",
  technical: "text-danger",
  legacy: "text-muted",
};

// Why a lead ended where it did. The table shows a short version, the lead modal passes `full`.
export default function LeadReason({ reason, full = false }) {
  if (!reason) return <span className="text-muted">—</span>;
  const group = REASON_GROUP_LABELS[reason.group];
  return (
    <div className={`grid gap-0.5 ${full ? "" : "max-w-[280px]"}`}>
      <span className={`text-[13px] leading-tight font-bold ${labelTone[reason.group] ?? "text-text"}`}>{reason.label}</span>
      {group ? <span className="text-[11px] font-semibold text-muted">{group}</span> : null}
      {reason.detail ? (
        <span title={reason.detail} className={`text-xs leading-snug text-muted ${full ? "" : "line-clamp-2"}`}>
          {reason.detail}
        </span>
      ) : null}
      {reason.also?.length ? <span className="text-[11px] text-muted">Also: {reason.also.join(", ")}</span> : null}
    </div>
  );
}
