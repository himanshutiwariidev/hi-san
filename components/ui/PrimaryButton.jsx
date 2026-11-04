export default function PrimaryButton({ className = "", ...props }) {
  return (
    <button
      className={`rounded-xl border-0 bg-accent px-3.5 py-2.5 font-bold text-white hover:bg-accent-hover enabled:shadow-button disabled:cursor-not-allowed disabled:opacity-65 ${className}`}
      {...props}
    />
  );
}
