import Link from "next/link";
import Logo from "@/components/Logo";
import { APP_VERSION } from "@/lib/version";

export default function AuthScreen({ titleId, title, subtitle, children, footer }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section
        className="grid w-full max-w-[460px] gap-5 rounded-[22px] border border-border bg-surface p-7 shadow-popup"
        aria-labelledby={titleId}
      >
        <div>
          <Logo className="mb-[22px]" />
          <h1 id={titleId} className="m-0 mb-2 text-[28px] font-bold">
            {title}
          </h1>
          <p className="m-0">{subtitle}</p>
        </div>
        {children}
        <p className="m-0 text-muted">
          {footer.text}{" "}
          <Link href={footer.href} className="font-bold text-accent-dark">
            {footer.link}
          </Link>
          .
        </p>
        <span className="text-center text-xs text-muted tabular-nums">v{APP_VERSION}</span>
      </section>
    </main>
  );
}
