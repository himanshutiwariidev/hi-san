"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import PrimaryButton from "@/components/ui/PrimaryButton";
import StatusPill from "@/components/ui/StatusPill";
import { IconButton } from "@/components/ui/buttons";
import { inputClass, LabeledField } from "@/components/ui/fields";
import { Table, Th, Td } from "@/components/ui/Table";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useApp } from "@/components/AppContext";
import { apiClient, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/dates";
import { useResource } from "@/lib/useResource";

const EVENTS = [
  ["retrieved", "Retrieved"],
  ["filtered", "Filtered"],
  ["not_retrieved", "Not retrieved"],
];
const emptyDraft = { name: "", url: "", method: "POST", secret: "", headers: "", events: ["retrieved"], enabled: true };

export default function WebhooksPage() {
  const { business } = useApp();
  const hooksRes = useResource(() => apiClient.listWebhooks(business.id), [business.id]);
  const hooks = hooksRes.data ?? [];
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  function toggleEvent(event) {
    setDraft((d) => ({ ...d, events: d.events.includes(event) ? d.events.filter((e) => e !== event) : [...d.events, event] }));
  }

  async function run(action, success) {
    setMessage(null);
    try {
      const result = await action();
      await hooksRes.reload({ silent: true });
      setMessage({ ok: true, text: typeof success === "function" ? success(result) : success });
      return true;
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
      return false;
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const ok = await run(() => apiClient.createWebhook(business.id, draft), "Webhook created.");
    if (ok) setDraft(emptyDraft);
    setSaving(false);
  }

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Webhooks" description="Push every new lead to your CRM, Google Sheets (via Zapier/Make), Slack, or any HTTPS endpoint." />

      <Card className="grid gap-4">
        <h2 className="m-0 text-lg font-bold">New webhook</h2>
        <form onSubmit={submit} className="grid grid-cols-[repeat(4,minmax(140px,1fr))] gap-4 max-[760px]:grid-cols-1">
          <LabeledField label="Name">
            <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Method">
            <select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} className={inputClass}>
              <option>POST</option>
              <option>PUT</option>
            </select>
          </LabeledField>
          <LabeledField label="Signing secret (optional, sent as X-HiSan-Signature)" className="col-span-2 max-[760px]:col-span-1">
            <input value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="URL" className="col-span-full">
            <input required type="url" placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Extra headers (JSON, optional)" className="col-span-full">
            <textarea
              placeholder='{"Authorization": "Bearer ..."}'
              value={draft.headers}
              onChange={(e) => setDraft({ ...draft, headers: e.target.value })}
              className={`${inputClass} min-h-[116px] resize-y font-mono text-[13px]`}
            />
          </LabeledField>
          <fieldset className="col-span-full m-0 flex flex-wrap gap-3 rounded-lg border border-border p-3">
            <legend className="text-[13px] text-muted">Send leads that are</legend>
            {EVENTS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="checkbox" checked={draft.events.includes(value)} onChange={() => toggleEvent(value)} className="accent-accent" />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="col-span-full flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="accent-accent" />
              Enabled
            </label>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving..." : "Create webhook"}
            </PrimaryButton>
            {message ? <span className={`text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span> : null}
          </div>
        </form>
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="m-0 text-lg font-bold">Configured webhooks</h2>
        {hooksRes.loading ? (
          <SkeletonRows count={2} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>URL</Th>
                <Th>Events</Th>
                <Th>Last delivery</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {hooks.map((hook) => (
                <tr key={hook.id}>
                  <Td className="font-semibold">{hook.name}</Td>
                  <Td>
                    <span className="block max-w-[320px] text-[13px] [overflow-wrap:anywhere]">
                      <strong className="text-accent-dark">{hook.method}</strong> {hook.url}
                    </span>
                  </Td>
                  <Td className="text-[13px] text-muted">{hook.events.map((e) => e.replace("_", " ")).join(", ")}</Td>
                  <Td>
                    {hook.last_delivery_at ? (
                      <>
                        <StatusPill tone={hook.last_error ? "danger" : "success"}>{hook.last_status ? `HTTP ${hook.last_status}` : "Failed"}</StatusPill>
                        <span className="mt-1 block text-xs text-muted">{hook.last_error ?? timeAgo(hook.last_delivery_at)}</span>
                      </>
                    ) : (
                      <span className="text-[13px] text-muted">Never</span>
                    )}
                  </Td>
                  <Td>
                    <StatusPill tone={hook.enabled ? "success" : "muted"}>{hook.enabled ? "Enabled" : "Paused"}</StatusPill>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton
                        tone="accent"
                        type="button"
                        onClick={() =>
                          run(() => apiClient.testWebhook(business.id, hook.id), (r) => (r.error ? `Test to ${hook.name} failed: ${r.error}` : `Test lead delivered to ${hook.name} (HTTP ${r.status}).`))
                        }
                      >
                        Test
                      </IconButton>
                      <IconButton type="button" onClick={() => run(() => apiClient.updateWebhook(business.id, hook.id, { enabled: !hook.enabled }), hook.enabled ? "Webhook paused." : "Webhook resumed.")}>
                        {hook.enabled ? "Pause" : "Resume"}
                      </IconButton>
                      <IconButton tone="danger" type="button" onClick={() => confirm(`Delete webhook “${hook.name}”?`) && run(() => apiClient.deleteWebhook(business.id, hook.id), "Webhook deleted.")}>
                        Delete
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!hooksRes.loading && hooks.length === 0 ? <div className="rounded-lg border border-border bg-surface p-7 text-muted">No webhooks yet.</div> : null}
      </Card>
    </div>
  );
}
