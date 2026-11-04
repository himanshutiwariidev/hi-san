export function DangerButton({ className = "", ...props }) {
  return (
    <button
      className={`rounded-[10px] border border-danger-border bg-transparent px-2.5 py-2 font-bold text-danger disabled:cursor-not-allowed disabled:opacity-65 ${className}`}
      {...props}
    />
  );
}

const iconButtonTones = {
  default: "border-border text-text hover:bg-surface-muted",
  danger: "border-danger-border text-danger hover:bg-danger-bg",
  accent: "border-accent-border text-accent-dark hover:bg-accent-soft",
};

export function IconButton({ tone = "default", className = "", ...props }) {
  return (
    <button
      className={`rounded-[10px] border bg-transparent px-3 py-[7px] text-[13px] font-semibold ${iconButtonTones[tone]} ${className}`}
      {...props}
    />
  );
}

export function TextButton({ className = "", ...props }) {
  return <button className={`border-0 bg-transparent p-0 font-bold text-accent-dark ${className}`} {...props} />;
}
