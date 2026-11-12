"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { IconButton } from "@/components/ui/buttons";
import { inputClass } from "@/components/ui/fields";
import { Table, Th, Td } from "@/components/ui/Table";
import CountryFlag from "@/components/leads/CountryFlag";
import LeadModal from "@/components/leads/LeadModal";
import LeadReason from "@/components/leads/LeadReason";
import LeadStatus from "@/components/leads/LeadStatus";
import { ContactPills } from "@/components/leads/Contacts";
import { useApp } from "@/components/AppContext";
import { apiClient } from "@/lib/api";
import { businessDayStart } from "@/lib/businessDay";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/useResource";

const DAY = 24 * 3600 * 1000;

const ranges = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "all", label: "All time", days: null },
];

const statCards = [
  { key: "total", label: "Total leads", icon: "leads", iconBg: "bg-accent-soft", iconColor: "text-accent-dark" },
  { key: "retrieved", label: "Retrieved", icon: "check", iconBg: "bg-accent-soft", iconColor: "text-success" },
  { key: "filtered", label: "Filtered", icon: "filter", iconBg: "bg-surface-muted", iconColor: "text-gold-text" },
  { key: "not_retrieved", label: "Not retrieved", icon: "ban", iconBg: "bg-warning-bg", iconColor: "text-danger" },
];

function LeadsView() {
  const { business } = useApp();
  const params = useSearchParams();
  const statusParam = params.get("status") ?? "all";
  const [range, setRange] = useState("30d");
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState(null);

  const days = ranges.find((r) => r.value === range).days;
  // "Today" is the same day the daily limit counts in: from midnight Indian time, not the last 24 hours.
  const windowStart = () => (range === "today" ? businessDayStart() : Date.now() - days * DAY);
  // Fetch two windows so the trend can compare against the previous period.
  const leadsRes = useResource(
    () => apiClient.listLeads(business.id, { since: days ? new Date(windowStart() - days * DAY).toISOString() : undefined, limit: 5000 }),
    [business.id, range],
    { refreshMs: 30000 }
  );
  const leads = useMemo(() => leadsRes.data ?? [], [leadsRes.data]);

  const inRange = useMemo(
    () => (days ? leads.filter((l) => new Date(l.received_at).getTime() >= windowStart()) : leads),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, days, range]
  );

  const stats = useMemo(() => {
    const previous = days
      ? leads.filter((l) => {
          const at = new Date(l.received_at).getTime();
          return at < windowStart() && at >= windowStart() - days * DAY;
        })
      : [];
    const count = (list, key) => (key === "total" ? list.length : list.filter((l) => l.status === key).length);
    return Object.fromEntries(
      statCards.map(({ key }) => {
        const value = count(inRange, key);
        const prev = count(previous, key);
        const diff = days ? value - prev : 0;
        return [key, { value, diff }];
      })
    );
  }, [inRange, leads, days, range]);

  const keywordOptions = useMemo(() => [...new Set(inRange.map((l) => l.matched_keyword).filter(Boolean))].sort(), [inRange]);
  const countryOptions = useMemo(() => {
    const map = new Map(inRange.map((l) => [l.country.code || l.country.name, l.country]));
    return [...map.entries()].filter(([key]) => key).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [inRange]);

  const reasonOptions = useMemo(() => [...new Set(inRange.map((l) => l.reason?.label).filter(Boolean))].sort(), [inRange]);
  const pendingCount = useMemo(() => inRange.filter((l) => l.status === "pending").length, [inRange]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter(
      (l) =>
        (statusParam === "all" || l.status === statusParam) &&
        (!keyword || l.matched_keyword === keyword) &&
        (!country || (l.country.code || l.country.name) === country) &&
        (!contact || (contact === "whatsapp" ? l.contacts.whatsapp !== "missing" : Boolean(l[contact]))) &&
        (!reason || l.reason?.label === reason) &&
        (!q || `${l.title} ${l.buyer_name ?? ""} ${l.company ?? ""} ${l.email ?? ""} ${l.phone ?? ""}`.toLowerCase().includes(q))
    );
  }, [inRange, statusParam, keyword, country, contact, reason, query]);

  function exportCsv() {
    const header = ["indiamart_id", "title", "quantity", "unit", "keyword", "buyer", "company", "city", "state", "country", "email", "phone", "gst_verified", "status", "decision", "reason", "received_at", "reason_label", "reason_type", "reason_detail", "seen_via", "posted_to_seen_ms", "buy_seen_to_sent_ms", "buy_answer_ms"];
    const lines = rows.map((l) =>
      [l.external_id, l.title, l.quantity, l.unit, l.matched_keyword, l.buyer_name, l.company, l.city, l.state, l.country.name, l.email, l.phone, l.gst_verified ? "Yes" : "No", l.status, l.decision, l.filter_reason, l.received_at, l.reason?.label, l.reason?.group, l.reason?.detail, l.timing?.seen_via, l.timing?.posted_to_seen_ms, l.timing?.buy?.seen_to_sent_ms, l.timing?.buy?.answer_ms]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const title = { all: "Leads", retrieved: "Retrieved leads", filtered: "Filtered leads", not_retrieved: "Not retrieved leads" }[statusParam];

  return (
    <div className="grid gap-[22px]">
      <PageHeader title={title} description="Every IndiaMART BuyLead the extension saw, with buyer contacts and the reason for each decision.">
        <IconButton tone="accent" type="button" onClick={exportCsv} className="inline-flex items-center gap-2">
          <Icon name="download" className="size-4" /> Export CSV
        </IconButton>
      </PageHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {statCards.map((card) => {
          const { value, diff } = stats[card.key];
          const trendClass = diff > 0 ? "text-accent-dark" : diff < 0 ? "text-danger" : "text-muted";
          return (
            <div key={card.key} className="flex items-start gap-3 rounded-[10px] border border-border bg-surface px-[18px] py-4">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] text-lg ${card.iconBg} ${card.iconColor}`}>
                <Icon name={card.icon} />
              </span>
              <div className="grid min-w-0 gap-[3px]">
                <span className="text-xs font-semibold text-muted">{card.label}</span>
                <span className="text-2xl font-bold text-text tabular-nums">{value}</span>
                <span className={`text-[11px] font-semibold ${trendClass}`}>
                  {range === "all" ? "All time" : `${diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} ${Math.abs(diff)} vs previous period`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {pendingCount > 0 ? (
        <p className="m-0 text-[13px] text-muted">
          {pendingCount} {pendingCount === 1 ? "lead is" : "leads are"} still being bought, so {pendingCount === 1 ? "it is" : "they are"} in Total leads but not yet in Retrieved or Not retrieved.
        </p>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {ranges.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange(r.value)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap ${
              range === r.value
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted hover:border-accent-border"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card className="grid gap-3.5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-center gap-3">
          <input type="search" placeholder="Search buyer, product, email" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} />
          <select value={keyword} onChange={(e) => setKeyword(e.target.value)} className={inputClass}>
            <option value="">All keywords</option>
            {keywordOptions.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
            <option value="">All countries</option>
            {countryOptions.map(([key, c]) => (
              <option key={key} value={key}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass}>
            <option value="">Any contact</option>
            <option value="email">Has email</option>
            <option value="phone">Has phone</option>
            <option value="whatsapp">Has WhatsApp</option>
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            <option value="">All reasons</option>
            {reasonOptions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>

        <Table minWidth="min-w-[980px]">
          <thead>
            <tr>
              <Th>Buyer</Th>
              <Th>Requirement</Th>
              <Th>Contacts</Th>
              <Th>Status</Th>
              <Th>Reason</Th>
              <Th>Received</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead.id}>
                <Td>
                  <div className="grid max-w-[500px] items-start gap-1.5">
                    <div className="flex items-center gap-2">
                      <strong className="text-[15px] leading-tight text-text">{lead.buyer_name ?? { retrieved: "Buyer", pending: "Buying…" }[lead.status] ?? "Not bought"}</strong>
                      {lead.gst_verified ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">GST</span>
                      ) : null}
                    </div>
                    {lead.company ? <span className="text-[13px] text-muted">{lead.company}</span> : null}
                    <CountryFlag country={{ ...lead.country, name: [lead.city, lead.state, lead.country.name].filter(Boolean).join(", ") }} />
                    {lead.email || lead.phone ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] leading-[1.3] font-bold text-accent-dark">
                          {[lead.email, lead.phone].filter(Boolean).join(" · ")}
                        </span>
                        {lead.phone ? (
                          <a
                            href={`https://wa.me/${String(lead.phone).replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <span className="block font-semibold">{lead.title}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {[lead.quantity && `${lead.quantity} ${lead.unit ?? ""}`.trim(), lead.matched_keyword && `keyword: ${lead.matched_keyword}`].filter(Boolean).join(" · ")}
                  </span>
                  {lead.posted_text ? <span className="mt-1 block text-xs text-muted">Posted {lead.posted_text}</span> : null}
                </Td>
                <Td>
                  <ContactPills contacts={lead.contacts} />
                </Td>
                <Td>
                  <LeadStatus status={lead.status} />
                </Td>
                <Td>
                  <LeadReason reason={lead.reason} />
                </Td>
                <Td className="whitespace-nowrap text-[13px]">{formatDateTime(lead.received_at)}</Td>
                <Td>
                  <button
                    type="button"
                    aria-label="View lead"
                    onClick={() => setSelected(lead)}
                    className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-surface-muted text-muted hover:border-accent-border hover:text-accent-dark"
                  >
                    ›
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {leadsRes.error ? <p className="m-0 text-danger">{leadsRes.error}</p> : null}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-7 text-muted">
            {leadsRes.loading ? "Loading leads…" : inRange.length ? "No leads match these filters." : "No leads in this period yet."}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            Showing {rows.length} of {inRange.length} leads
          </span>
        </div>
      </Card>

      {selected ? <LeadModal lead={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsView />
    </Suspense>
  );
}
