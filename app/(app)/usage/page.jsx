"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { Table, Th, Td } from "@/components/ui/Table";
import { inputClass } from "@/components/ui/fields";
import { useApp } from "@/components/AppContext";
import { apiClient } from "@/lib/api";
import { businessDate } from "@/lib/businessDay";
import { isOnline, localDateString, startOfDayIso } from "@/lib/dates";
import { useResource } from "@/lib/useResource";

const DAY_MS = 24 * 3600 * 1000;
const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const formatDay = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function UsagePage() {
  const { business, businesses } = useApp();
  const todayRes = useResource(() => apiClient.listLeads(business.id, { since: startOfDayIso(localDateString()) }), [business.id], { refreshMs: 30000 });
  const settingsRes = useResource(() => apiClient.getFilterSettings(business.id), [business.id]);

  const today = todayRes.data ?? [];
  const bought = today.filter((l) => l.status === "retrieved").length;
  const inProgress = today.filter((l) => l.status === "pending").length;
  const failed = today.filter((l) => l.status === "not_retrieved").length;
  const limit = settingsRes.data?.daily_limit ?? 0;
  const used = bought + inProgress;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  // Purchases per business on one day, midnight to midnight India time (the day the daily limit counts in).
  const todayDate = businessDate();
  const [day, setDay] = useState(todayDate);
  const usageRes = useResource(() => apiClient.getUsage(day), [day], { refreshMs: 30000 });
  const usageRows = useMemo(() => usageRes.data?.businesses ?? [], [usageRes.data]);
  const usageById = useMemo(() => new Map(usageRows.map((row) => [row.business_id, row])), [usageRows]);
  const totals = useMemo(
    () =>
      usageRows.reduce(
        (sum, row) => ({
          retrieved: sum.retrieved + row.retrieved,
          pending: sum.pending + row.pending,
          not_retrieved: sum.not_retrieved + row.not_retrieved,
          total: sum.total + row.total,
        }),
        { retrieved: 0, pending: 0, not_retrieved: 0, total: 0 }
      ),
    [usageRows]
  );
  const showingDay = usageRes.data?.date === day;
  const cell = (row, key) => (showingDay && row ? row[key] : "…");
  const dayButton = (label, value) => (
    <button
      type="button"
      onClick={() => setDay(value)}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap ${
        day === value ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:border-accent-border"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Usage" description="How many IndiaMART leads were bought, per business." />

      <Card className="grid gap-3.5">
        <h2 className="m-0 text-lg font-bold">Today · {business.name}</h2>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[30px] font-bold tabular-nums">{used}</span>
          <span className="text-muted">{limit ? `of ${limit} daily purchases used` : "purchases today (no daily limit)"}</span>
        </div>
        {limit ? (
          <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <span className="block h-full rounded-full bg-[image:var(--brand-gradient)]" style={{ width: `${pct}%` }} />
          </span>
        ) : null}
        <p className="m-0 text-[13px] text-muted">
          {bought} retrieved · {inProgress} in progress · {failed} failed. Failed purchases do not count towards the limit.
        </p>
      </Card>

      <Card className="grid gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 className="m-0 text-lg font-bold">Purchases on {formatDay(day)}</h2>
            <span className="text-[13px] text-muted">Midnight to midnight, India time. The same day the daily limit counts in.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dayButton("Yesterday", shiftDate(todayDate, -1))}
            {dayButton("Today", todayDate)}
            <label className="grid w-[160px] gap-1">
              <span className="sr-only">Date</span>
              <input
                id="usage-date"
                type="date"
                value={day}
                max={todayDate}
                onChange={(e) => {
                  if (e.target.value) setDay(e.target.value);
                }}
                className={inputClass}
              />
            </label>
          </div>
        </div>
        {usageRes.error ? <p className="m-0 text-danger">{usageRes.error}</p> : null}

        <Table>
          <thead>
            <tr>
              <Th>Business</Th>
              <Th>Bought</Th>
              <Th>Failed</Th>
              <Th>Leads seen</Th>
              <Th>Bought this month</Th>
              <Th>Extension</Th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => {
              const row = usageById.get(b.id);
              return (
                <tr key={b.id}>
                  <Td className="font-semibold">{b.name}</Td>
                  <Td className="tabular-nums">
                    <span className="font-semibold">{cell(row, "retrieved")}</span>
                    {showingDay && row?.pending ? <span className="ml-1.5 text-xs text-muted">+{row.pending} buying</span> : null}
                  </Td>
                  <Td className="tabular-nums">{cell(row, "not_retrieved")}</Td>
                  <Td className="tabular-nums">{cell(row, "total")}</Td>
                  <Td className="tabular-nums">{b.leads_this_month}</Td>
                  <Td>
                    <StatusPill tone={isOnline(b.last_heartbeat) ? "success" : "muted"}>{isOnline(b.last_heartbeat) ? "Online" : "Offline"}</StatusPill>
                  </Td>
                </tr>
              );
            })}
          </tbody>
          {businesses.length > 1 ? (
            <tfoot>
              <tr>
                <Td className="font-bold">All businesses</Td>
                <Td className="tabular-nums">
                  <span className="font-bold">{showingDay ? totals.retrieved : "…"}</span>
                  {showingDay && totals.pending ? <span className="ml-1.5 text-xs text-muted">+{totals.pending} buying</span> : null}
                </Td>
                <Td className="font-bold tabular-nums">{showingDay ? totals.not_retrieved : "…"}</Td>
                <Td className="font-bold tabular-nums">{showingDay ? totals.total : "…"}</Td>
                <Td />
                <Td />
              </tr>
            </tfoot>
          ) : null}
        </Table>
        <p className="m-0 text-[13px] text-muted">Bought = purchases confirmed with buyer contacts. Failed = purchases IndiaMART refused, which do not use the daily limit.</p>
      </Card>
    </div>
  );
}
