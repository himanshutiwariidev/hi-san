"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import PrimaryButton from "@/components/ui/PrimaryButton";
import StatusPill from "@/components/ui/StatusPill";
import { DangerButton } from "@/components/ui/buttons";
import { inputClass } from "@/components/ui/fields";
import { useApp } from "@/components/AppContext";
import { apiClient, errorMessage } from "@/lib/api";
import { isOnline } from "@/lib/dates";
import { formatDate } from "@/lib/format";

export default function BusinessesPage() {
  const { businesses, reloadBusinesses } = useApp();
  const [name, setName] = useState("");
  const [names, setNames] = useState({});
  const [message, setMessage] = useState(null);

  async function run(action, success) {
    setMessage(null);
    try {
      await action();
      await reloadBusinesses();
      if (success) setMessage({ ok: true, text: success });
      return true;
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
      return false;
    }
  }

  async function create(e) {
    e.preventDefault();
    if (await run(() => apiClient.createBusiness({ name }), `Business “${name}” created.`)) setName("");
  }

  function rename(biz) {
    const next = (names[biz.id] ?? biz.name).trim();
    if (!next || next === biz.name) return setNames((n) => ({ ...n, [biz.id]: undefined }));
    run(() => apiClient.updateBusiness(biz.id, { name: next }), "Business renamed.");
  }

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Businesses" description="Each business has its own keywords, filters, webhooks, and extension API key." />

      <Card>
        <form onSubmit={create} className="grid grid-cols-[minmax(240px,1fr)_repeat(2,max-content)] items-end gap-3 max-[760px]:grid-cols-1">
          <label className="grid gap-1.5">
            <span className="text-[13px] text-muted">New business name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <PrimaryButton type="submit">Create business</PrimaryButton>
        </form>
      </Card>

      <Card className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
          <h2 className="m-0 text-lg font-bold">Your businesses</h2>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-dark">{businesses.length} total</span>
        </div>
        {message ? <p className={`m-0 text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}
        {businesses.map((biz) => (
          <div
            key={biz.id}
            className="grid grid-cols-[minmax(220px,1fr)_minmax(110px,140px)_minmax(130px,max-content)_max-content] items-center gap-3.5 border-b border-border pb-3 last:border-b-0 last:pb-0 max-[760px]:grid-cols-1"
          >
            <input
              aria-label="Business name"
              value={names[biz.id] ?? biz.name}
              onChange={(e) => setNames((n) => ({ ...n, [biz.id]: e.target.value }))}
              onBlur={() => rename(biz)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-full rounded-[10px] border border-transparent bg-transparent px-2.5 py-2 text-[15px] font-semibold text-text transition-[border-color,background] duration-150 hover:bg-surface-muted focus:border-accent focus:bg-surface focus:shadow-[0_0_0_3px_var(--color-accent-ring)] focus:outline-0"
            />
            <div className="flex items-center gap-2">
              <StatusPill tone={isOnline(biz.last_heartbeat) ? "success" : "muted"}>{isOnline(biz.last_heartbeat) ? "Extension online" : "Extension offline"}</StatusPill>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
              <strong className="text-accent-dark">{biz.leads_this_month} bought this month</strong>
              <span>since {formatDate(biz.created_at)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <DangerButton
                type="button"
                disabled={businesses.length === 1}
                onClick={() =>
                  confirm(`Delete “${biz.name}” and all its leads, keywords and webhooks? This cannot be undone.`) &&
                  run(() => apiClient.deleteBusiness(biz.id), "Business deleted.")
                }
              >
                Delete
              </DangerButton>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
