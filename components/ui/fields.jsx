// Shared input styling used by the original .form-grid / .toolbar / .webhook-form inputs.
export const inputClass = "w-full rounded-[10px] border border-border bg-surface px-2.5 py-[9px] text-text";

export function LabeledField({ label, children, className = "" }) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}
