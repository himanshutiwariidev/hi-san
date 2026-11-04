"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { usePathname, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { APP_VERSION } from "@/lib/version";

const navigation = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  {
    href: "/leads",
    label: "Leads",
    icon: "leads",
    children: [
      { href: "/leads", label: "All leads" },
      { href: "/leads?status=retrieved", label: "Retrieved" },
      { href: "/leads?status=filtered", label: "Filtered" },
      { href: "/leads?status=not_retrieved", label: "Not retrieved" },
    ],
  },
  { href: "/keywords", label: "Keywords", icon: "filter" },
  { href: "/extension", label: "Extension", icon: "puzzle" },
  { href: "/webhooks", label: "Webhooks", icon: "webhook" },
  { href: "/usage", label: "Usage", icon: "billing" },
  { href: "/businesses", label: "Businesses", icon: "building", adminOnly: true },
  { href: "/users", label: "Users", icon: "users", adminOnly: true },
  { href: "/profile", label: "Profile", icon: "user" },
];

const linkBase = "flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-surface-muted hover:text-accent-dark";

export default function Sidebar({ isAdmin }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = pathname + (searchParams.toString() ? `?${searchParams}` : "");

  return (
    <aside className="flex flex-col gap-[22px] border-r border-border bg-surface px-[18px] py-6 text-text max-[760px]:static max-[760px]:border-r-0 max-[760px]:border-b">
      <div className="flex flex-col gap-2">
        <Link href="/" aria-label="Hi-San Bot home">
          <Logo className="origin-left scale-[.85]" />
        </Link>
        <span className="text-xs text-muted tabular-nums">v{APP_VERSION}</span>
      </div>

      <span className="text-[13px] text-muted">Workspace</span>
      <nav className="grid gap-1.5">
        {navigation.filter((item) => isAdmin || !item.adminOnly).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={`${linkBase} ${active ? "bg-accent-soft font-semibold text-accent-dark" : "text-text"}`}
            >
              <Icon name={item.icon} className="size-[18px] shrink-0" />
              {item.label}
            </Link>
          );
          if (!item.children || !active) return link;
          return (
            <div key={item.href} className="grid gap-1">
              {link}
              <div className="ml-3 grid gap-0.5 border-l border-border pl-2.5">
                {item.children.map((child) => {
                  const childActive = current === child.href;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`rounded-xl px-2.5 py-[7px] text-[13px] hover:bg-surface-muted hover:text-accent-dark ${
                        childActive ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted"
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
