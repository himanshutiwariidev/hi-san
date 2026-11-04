"use client";

import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { Table, Th, Td } from "@/components/ui/Table";
import { useApp } from "@/components/AppContext";
import { apiClient } from "@/lib/api";
import { isOnline, localDateString, startOfDayIso } from "@/lib/dates";
import { useResource } from "@/lib/useResource";

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

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Business</Th>
              <Th>Bought this month</Th>
              <Th>Extension</Th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => (
              <tr key={b.id}>
                <Td className="font-semibold">{b.name}</Td>
                <Td className="tabular-nums">{b.leads_this_month}</Td>
                <Td>
                  <StatusPill tone={isOnline(b.last_heartbeat) ? "success" : "muted"}>{isOnline(b.last_heartbeat) ? "Online" : "Offline"}</StatusPill>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
