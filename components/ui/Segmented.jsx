export default function Segmented({ options, value, onChange, className = "" }) {
  return (
    <div className={`flex flex-wrap gap-1 rounded-lg bg-surface-muted p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-[10px] border-0 px-3 py-2 font-bold ${
            value === option.value ? "bg-surface text-accent-dark shadow-segment" : "bg-transparent text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
