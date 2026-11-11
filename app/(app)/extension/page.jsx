"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { IconButton } from "@/components/ui/buttons";
import { inputClass } from "@/components/ui/fields";
import { useApp } from "@/components/AppContext";
import { apiClient, errorMessage } from "@/lib/api";
import { isOnline, timeAgo } from "@/lib/dates";
import { useResource } from "@/lib/useResource";

function Step({ n, title, children }) {
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-dark">{n}</span>
      <div className="grid gap-1.5 pt-1">
        <strong>{title}</strong>
        <div className="text-[13px] leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

function CopyField({ label, value, secret }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={shown ? value : "•".repeat(Math.min(48, value.length))} className={`${inputClass} font-mono text-[13px]`} onFocus={(e) => e.target.select()} />
        {secret ? (
          <IconButton type="button" onClick={() => setShown(!shown)}>
            {shown ? "Hide" : "Show"}
          </IconButton>
        ) : null}
        <IconButton
          type="button"
          tone="accent"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </IconButton>
      </div>
    </label>
  );
}

export default function ExtensionPage() {
  const { business, me } = useApp();
  const extensionRes = useResource(() => apiClient.getExtension(business.id), [business.id], { refreshMs: 15000 });
  const rulesRes = useResource(() => apiClient.listKeywordRules(business.id), [business.id]);
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const ext = extensionRes.data;
  const online = isOnline(ext?.last_heartbeat);
  const activeKeywords = (rulesRes.data ?? []).filter((r) => r.enabled).length;

  async function rotate() {
    if (!confirm("Generate a new API key? The extension stops working until you paste the new key into its settings.")) return;
    try {
      extensionRes.setData(await apiClient.rotateExtensionKey(business.id));
      setMessage({ ok: true, text: "New API key generated. Update it in the extension settings." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Extension" description={`Connect the Chrome extension that buys IndiaMART leads for ${business.name}.`}>
        <div className="flex items-center gap-2">
          <StatusPill tone={online ? "success" : "danger"}>{online ? "Online" : "Offline"}</StatusPill>
          <span className="text-[13px] text-muted">
            Last seen {timeAgo(ext?.last_heartbeat)}
            {ext?.extension_version ? ` · v${ext.extension_version}` : ""}
          </span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4 max-[1100px]:grid-cols-1">
        <Card className="grid gap-4">
          <h2 className="m-0 text-lg font-bold">Connection details</h2>
          {ext ? (
            <>
              <CopyField label="Dashboard URL" value={origin} />
              <CopyField label={`API key for ${business.name}`} value={ext.api_key} secret />
              {me.role !== "member" ? (
                <div className="flex items-center gap-3">
                  <IconButton tone="danger" type="button" onClick={rotate}>
                    Generate new key
                  </IconButton>
                  {message ? <span className={`text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span> : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="m-0 text-muted">{extensionRes.error ?? "Loading…"}</p>
          )}
          <div className={`rounded-xl border p-3.5 text-[13px] ${activeKeywords ? "border-success-border bg-success-bg text-success" : "border-warning-border bg-warning-bg text-gold-text"}`}>
            {activeKeywords ? (
              <>
                <strong>{activeKeywords}</strong> active keyword{activeKeywords === 1 ? "" : "s"}. <Link href="/filters" className="font-bold underline">Edit keywords &amp; filters</Link>
              </>
            ) : (
              <>
                No active keywords, so nothing will be bought. <Link href="/filters" className="font-bold underline">Add keywords first</Link>
              </>
            )}
          </div>
        </Card>

        <Card className="grid gap-4">
          <h2 className="m-0 text-lg font-bold">Setup</h2>
          <ol className="m-0 grid list-none gap-4 p-0">
            <Step n={1} title="Install the extension in Chrome">
              <div className="mb-2">
                <a
                  href="/hi-san-bot-extension.zip"
                  download="hi-san-bot-extension.zip"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-accent-hover transition-colors"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Download Extension (.zip)
                </a>
              </div>
              Extract the zip, open <code className="rounded bg-surface-muted px-1">chrome://extensions</code>, turn on <strong>Developer mode</strong>, click <strong>Load unpacked</strong>, and select the extracted folder.
              <span className="mt-2 block">
                <strong>Updating?</strong> Extract the new zip over the same folder, then press <strong>Reload</strong> on the extension. Do not remove it or load a different folder: buyer contacts waiting to sync are stored inside it.
              </span>
            </Step>
            <Step n={2} title="Connect it">
              In the extension&apos;s settings, paste the dashboard URL and API key from this page, then press <strong>Save and test connection</strong>.
            </Step>
            <Step n={3} title="Open IndiaMART BuyLeads">
              Log in to your IndiaMART seller account and open <strong>BuyLeads</strong> (seller.indiamart.com/bltxn). Keep this tab open.
              <span className="mt-2 block">
                <strong>One bot per IndiaMART login.</strong> Switch off any other lead-buying extension in <code className="rounded bg-surface-muted px-1">chrome://extensions</code> while this one runs. Two bots both try to buy the same lead, so one of them always shows a failed purchase.
              </span>
            </Step>
            <Step n={4} title="Test with Dry run first">
              Turn on <strong>Auto-buy running</strong> with <strong>Dry run</strong> on. The popup lists every lead it read and whether it would buy it. Nothing is spent.
            </Step>
            <Step n={5} title="Go live">
              When the leads look right, turn <strong>Dry run</strong> off. Matching leads are bought within your daily limit, and buyer contacts appear in{" "}
              <Link href="/leads" className="font-bold text-accent-dark">Leads</Link>.
            </Step>
          </ol>
        </Card>
      </div>
    </div>
  );
}
