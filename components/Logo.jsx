// Hi-San Bot logo: robot-head mark plus wordmark, drawn inline so it stays crisp at any size.
export function LogoMark({ className = "size-10" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hisan-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#hisan-mark)" />
      <line x1="32" y1="10" x2="32" y2="17" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="9" r="3.5" fill="#fff" />
      <rect x="13" y="18" width="38" height="30" rx="10" fill="#fff" />
      <circle cx="25" cy="32" r="4.5" fill="#4f46e5" />
      <circle cx="39" cy="32" r="4.5" fill="#4f46e5" />
      <path d="M26 41h12" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
      <rect x="8" y="27" width="5" height="10" rx="2.5" fill="#fff" />
      <rect x="51" y="27" width="5" height="10" rx="2.5" fill="#fff" />
    </svg>
  );
}

export default function Logo({ className = "" }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <LogoMark className="size-12 shrink-0" />
      <span className="grid leading-none">
        <span className="text-[26px] font-bold tracking-tight text-text">
          Hi-San <span className="text-accent">Bot</span>
        </span>
        <span className="mt-1.5 text-[10px] font-bold tracking-[.22em] text-muted uppercase">Leads on autopilot</span>
      </span>
    </span>
  );
}
