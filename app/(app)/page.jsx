"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import Segmented from "@/components/ui/Segmented";
import { Table, Th, Td } from "@/components/ui/Table";
import CountryFlag from "@/components/leads/CountryFlag";
import LeadModal from "@/components/leads/LeadModal";
import { ContactIcons } from "@/components/leads/Contacts";
import LeadStatus from "@/components/leads/LeadStatus";
import { useApp } from "@/components/AppContext";
import { tones } from "@/components/tones";
import { apiClient } from "@/lib/api";
import { daysAgo, endOfDayIso, isOnline, localDateString, startOfDayIso, timeAgo } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/useResource";

const PAGE_SIZE = 6;

function KpiCard({ tone, icon, label, value, trend, note }) {
  return (
    <div
      style={tones[tone]}
      className="flex items-center gap-3.5 rounded-[18px] border border-border bg-[linear-gradient(135deg,var(--color-surface)_55%,var(--tone-bg)_100%)] p-[18px]"
    >
      <span className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-full bg-(--tone-bg) text-(--tone)">
        <Icon name={icon} className="size-[26px] shrink-0" />
      </span>
      <div className="grid min-w-0 gap-1">
        <span className="text-sm font-bold">{label}</span>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[30px] leading-[1.1] font-bold tabular-nums">{value}</span>
          {trend ? <span className="text-[11px] font-semibold text-(--tone)">{trend}</span> : null}
        </div>
        <span className="text-xs text-muted">{note}</span>
      </div>
    </div>
  );
}

function Chip({ tone, icon, label, value }) {
  return (
    <div
      style={tones[tone]}
      className="flex items-center gap-3 rounded-[14px] border border-border bg-[linear-gradient(135deg,var(--color-surface)_60%,var(--tone-bg)_100%)] px-4 py-3"
    >
      <span className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full bg-(--tone-bg) text-(--tone)">
        <Icon name={icon} />
      </span>
      <div className="grid gap-0.5">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <strong className="text-lg tabular-nums">{value}</strong>
      </div>
    </div>
  );
}

function PanelHeader({ icon, title, href }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="m-0 flex items-center gap-2 text-base font-bold">
        <span className="text-accent-dark">
          <Icon name={icon} />
        </span>
        {title}
      </h2>
      {href ? (
        <Link href={href} className="text-xs font-bold text-accent-dark hover:text-accent-hover">
          View all
        </Link>
      ) : null}
    </div>
  );
}

function countBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export default function DashboardPage() {
  const { business } = useApp();
  const [from, setFrom] = useState(() => localDateString(daysAgo(29)));
  const [to, setTo] = useState(() => localDateString());
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const leadsRes = useResource(
    () => apiClient.listLeads(business.id, { since: startOfDayIso(from), until: endOfDayIso(to) }),
    [business.id, from, to],
    { refreshMs: 30000 }
  );
  const todayRes = useResource(() => apiClient.listLeads(business.id, { since: startOfDayIso(localDateString()) }), [business.id], { refreshMs: 30000 });
  const settingsRes = useResource(() => apiClient.getFilterSettings(business.id), [business.id]);
  const extensionRes = useResource(() => apiClient.getExtension(business.id), [business.id], { refreshMs: 30000 });

  const inRange = useMemo(() => leadsRes.data ?? [], [leadsRes.data]);

  const stats = useMemo(() => {
    const by = (status) => inRange.filter((l) => l.status === status).length;
    const retrieved = inRange.filter((l) => l.status === "retrieved");
    return {
      total: inRange.length,
      retrieved: retrieved.length,
      filtered: by("filtered"),
      notRetrieved: by("not_retrieved"),
      pending: by("pending"),
      emails: retrieved.filter((l) => l.email).length,
      phones: retrieved.filter((l) => l.phone).length,
      whatsapp: retrieved.filter((l) => l.contacts.whatsapp !== "missing").length,
    };
  }, [inRange]);

  const boughtToday = (todayRes.data ?? []).filter((l) => l.status === "retrieved" || l.status === "pending").length;
  const dailyLimit = settingsRes.data?.daily_limit ?? 0;

  const topKeywords = useMemo(
    () => countBy(inRange.filter((l) => l.matched_keyword), (l) => l.matched_keyword).slice(0, 6),
    [inRange]
  );
  const topCountries = useMemo(
    () =>
      countBy(inRange, (l) => l.country.code || l.country.name || "unknown")
        .slice(0, 6)
        .map(([key, count]) => [inRange.find((l) => (l.country.code || l.country.name || "unknown") === key).country, count]),
    [inRange]
  );
  const maxKeyword = topKeywords[0]?.[1] ?? 1;

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter(
      (l) =>
        (statusFilter === "all" || l.status === statusFilter) &&
        (!q || `${l.title} ${l.buyer_name ?? ""} ${l.company ?? ""} ${l.country.name ?? ""} ${l.email ?? ""}`.toLowerCase().includes(q))
    );
  }, [inRange, statusFilter, query]);
  const pageCount = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));
  const visible = recent.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pct = (n) => (stats.total ? `${Math.round((n / stats.total) * 100)}%` : "0%");
  const extension = extensionRes.data;
  const online = isOnline(extension?.last_heartbeat);

  const filterReasons = countBy(inRange.filter((l) => l.status === "filtered" && l.filter_reason), (l) => l.filter_reason.split(":")[0]);
  const insights = [
    !online && { tone: "danger", icon: "puzzle", text: <>The extension is <strong>offline</strong>. Open IndiaMART BuyLeads with the extension running.</>, href: "/extension" },
    topKeywords[0] && { tone: "accent", icon: "trend", text: <>Most leads matched <strong>{topKeywords[0][0]}</strong> ({topKeywords[0][1]}) in this period.</>, href: "/leads" },
    filterReasons[0] && { tone: "gold", icon: "filter", text: <><strong>{filterReasons[0][1]}</strong> {filterReasons[0][1] === 1 ? "lead was" : "leads were"} filtered for “{filterReasons[0][0]}”. Review your filters.</>, href: "/filters" },
    stats.notRetrieved > 0 && { tone: "danger", icon: "alert", text: <><strong>{stats.notRetrieved}</strong> {stats.notRetrieved === 1 ? "purchase" : "purchases"} failed. Open {stats.notRetrieved === 1 ? "it" : "them"} to see why.</>, href: "/leads?status=not_retrieved" },
    dailyLimit > 0 && boughtToday >= dailyLimit && { tone: "gold", icon: "ban", text: <>Today&apos;s limit of <strong>{dailyLimit}</strong> purchases is reached.</>, href: "/filters" },
    { tone: "success", icon: "webhook", text: <>Send retrieved leads straight to your CRM with a webhook.</>, href: "/webhooks" },
  ].filter(Boolean);

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Dashboard" titleClassName="text-[26px]" description={`IndiaMART leads on autopilot for ${business.name}.`}>
        <div className="flex flex-wrap items-end gap-2.5">
          {[
            ["From", from, setFrom],
            ["To", to, setTo],
          ].map(([label, value, setter]) => (
            <label key={label} className="grid w-[142px] gap-1.5">
              <span className="text-[13px] text-muted">{label}</span>
              <input
                type="date"
                value={value}
                onChange={(e) => {
                  setter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-[10px] border border-border bg-surface px-2.5 py-[9px]"
              />
            </label>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-[18px] max-[1280px]:grid-cols-[minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <div className="grid grid-cols-4 gap-3.5 max-[1280px]:grid-cols-2 max-[760px]:grid-cols-1">
            <KpiCard tone="accent" icon="leads" label="Total leads" value={stats.total} note={stats.pending ? `${stats.pending} being bought now` : "Seen by the extension"} />
            <KpiCard tone="success" icon="check" label="Retrieved" value={stats.retrieved} trend={pct(stats.retrieved)} note="Bought with contacts" />
            <KpiCard tone="gold" icon="filter" label="Filtered" value={stats.filtered} trend={pct(stats.filtered)} note="Blocked by your rules" />
            <KpiCard tone="danger" icon="ban" label="Not retrieved" value={stats.notRetrieved} trend={pct(stats.notRetrieved)} note="Purchase failed" />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
            <Chip tone="accent" icon="mail" label="Buyer emails" value={stats.emails} />
            <Chip tone="success" icon="phone" label="Phone numbers" value={stats.phones} />
            <Chip tone="success" icon="whatsapp" label="WhatsApp" value={stats.whatsapp} />
            <Chip tone="gold" icon="calendar" label="Bought today" value={dailyLimit ? `${boughtToday} / ${dailyLimit}` : boughtToday} />
          </div>

          <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
            <Card className="grid content-start gap-3.5">
              <PanelHeader icon="grid" title="Top keywords" href="/filters" />
              {topKeywords.length === 0 ? <p className="m-0 text-[13px] text-muted">No keyword matches yet.</p> : null}
              <ul className="m-0 grid list-none gap-1 p-0">
                {topKeywords.map(([name, count]) => (
                  <li key={name} className="grid grid-cols-[minmax(0,1.2fr)_minmax(60px,1fr)_32px] items-center gap-3 py-[7px] text-[13px]">
                    <span className="truncate">{name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full bg-[image:var(--brand-gradient)]" style={{ width: `${(count / maxKeyword) * 100}%` }} />
                    </span>
                    <strong className="text-right tabular-nums">{count}</strong>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="grid content-start gap-3.5">
              <PanelHeader icon="globe" title="Top countries" href="/leads" />
              {topCountries.length === 0 ? <p className="m-0 text-[13px] text-muted">No leads yet.</p> : null}
              <ul className="m-0 grid list-none gap-1 p-0">
                {topCountries.map(([country, count]) => (
                  <li key={country.code || country.name} className="grid grid-cols-[minmax(0,1fr)_40px_52px] items-center gap-3 border-b border-border py-2 text-[13px] last:border-b-0">
                    <CountryFlag country={country} />
                    <strong className="text-right tabular-nums">{count}</strong>
                    <span className="text-right text-muted tabular-nums">{pct(count)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="grid gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-2 text-base font-bold">
                <span className="text-accent-dark">
                  <Icon name="list" />
                </span>
                Recent leads
              </h2>
              <div className="flex items-center gap-2 max-[760px]:w-full">
                <input
                  type="search"
                  placeholder="Search leads"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-[280px] rounded-[10px] border border-border bg-surface px-3 py-[9px] max-[760px]:w-full"
                />
                <Link
                  href="/leads"
                  aria-label="Open leads"
                  className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-muted hover:border-accent-border hover:text-accent-dark"
                >
                  <Icon name="search" className="size-[18px]" />
                </Link>
              </div>
            </div>
            <Segmented
              className="w-fit"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "retrieved", label: "Retrieved" },
                { value: "filtered", label: "Filtered" },
                { value: "not_retrieved", label: "Not retrieved" },
              ]}
            />
            {leadsRes.error ? <p className="m-0 text-danger">{leadsRes.error}</p> : null}
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Buyer</Th>
                  <Th>Country</Th>
                  <Th>Contacts</Th>
                  <Th>Received</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {visible.map((lead) => (
                  <tr key={lead.id}>
                    <Td className="align-middle text-[13px]">
                      <span className="block max-w-[320px] font-semibold">{lead.title}</span>
                      {lead.quantity ? (
                        <span className="mt-[5px] inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-dark">
                          {lead.quantity}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="align-middle text-[13px]">
                      {lead.buyer_name ?? <LeadStatus status={lead.status} />}
                      {lead.company ? <span className="mt-1 block text-xs text-muted">{lead.company}</span> : null}
                    </Td>
                    <Td className="align-middle text-[13px]">
                      <CountryFlag country={lead.country} />
                    </Td>
                    <Td className="align-middle text-[13px]">
                      <ContactIcons contacts={lead.contacts} />
                    </Td>
                    <Td className="align-middle text-[13px] whitespace-nowrap">{formatDateTime(lead.received_at)}</Td>
                    <Td className="align-middle text-[13px]">
                      <button
                        type="button"
                        onClick={() => setSelected(lead)}
                        className="inline-flex rounded-lg border border-accent-border bg-transparent px-3.5 py-1.5 text-xs font-bold text-accent-dark hover:bg-accent-soft"
                      >
                        View
                      </button>
                    </Td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <Td colSpan={6} className="py-7 text-center text-muted">
                      {leadsRes.loading ? "Loading leads…" : inRange.length ? "No leads match these filters." : "No leads yet. Connect the extension to start catching IndiaMART leads."}
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">
                {recent.length} lead{recent.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-1.5">
                <PageButton disabled={page === 1} onClick={() => setPage(page - 1)} label="‹" />
                <span className="inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-lg border border-accent-dark bg-accent-dark text-[13px] font-bold text-surface">
                  {page}
                </span>
                <span className="text-[13px] text-muted">of {pageCount}</span>
                <PageButton disabled={page === pageCount} onClick={() => setPage(page + 1)} label="›" />
              </div>
            </div>
          </Card>
        </div>

        <aside className="grid min-w-0 gap-4">
          <Card className="grid content-start gap-3.5">
            <PanelHeader icon="sparkles" title="Insights" />
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {insights.map((insight, i) => (
                <li key={i}>
                  <Link
                    href={insight.href}
                    style={tones[insight.tone]}
                    className="grid grid-cols-[36px_minmax(0,1fr)_12px] items-center gap-3 rounded-xl border border-border p-3 text-[13px] leading-[1.45] hover:border-accent-border hover:bg-surface-soft"
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--tone-bg) text-(--tone)">
                      <Icon name={insight.icon} className="size-[18px]" />
                    </span>
                    <span>{insight.text}</span>
                    <span className="text-lg text-muted">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card as={Link} href="/filters" className="flex items-center gap-4 hover:border-accent hover:shadow-[0_8px_24px_#141b341a]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-muted text-accent-dark">
              <Icon name="filter" />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-base font-bold">Keywords &amp; filters</span>
              <span className="text-[13px] text-muted">Choose which IndiaMART leads get bought automatically.</span>
            </span>
            <span className="ml-auto shrink-0 text-lg text-accent-dark">›</span>
          </Card>

          <Card className="grid gap-3">
            <PanelHeader icon="puzzle" title="Extension" href="/extension" />
            <div className="flex items-center gap-2">
              {online ? (
                <span className="inline-flex rounded-full border border-success-border bg-[image:var(--success-gradient)] px-[7px] py-1 text-[11px] leading-none font-bold text-night">Online</span>
              ) : (
                <span className="inline-flex rounded-full border border-danger-border bg-danger-bg px-[7px] py-1 text-[11px] leading-none font-bold text-danger">Offline</span>
              )}
              <span className="text-[13px] text-muted">Last seen {timeAgo(extension?.last_heartbeat)}</span>
            </div>
            <p className="m-0 text-[13px] text-muted">
              {online ? `Catching IndiaMART leads for ${business.name}.` : "Keep IndiaMART BuyLeads open in Chrome with the extension turned on."}
            </p>
          </Card>
        </aside>
      </div>

      {selected ? <LeadModal lead={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function PageButton({ label, ...props }) {
  return (
    <button
      type="button"
      className="inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-lg border border-border bg-surface text-[13px] text-text disabled:cursor-not-allowed disabled:opacity-45"
      {...props}
    >
      {label}
    </button>
  );
}
