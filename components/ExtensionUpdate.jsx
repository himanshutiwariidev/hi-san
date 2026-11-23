"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Icon from "@/components/ui/Icon";
import { useApp } from "@/components/AppContext";
import { apiClient } from "@/lib/api";
import { extensionStatus, nextPopupDelay } from "@/lib/extensionUpdate";
import { useResource } from "@/lib/useResource";
import { EXTENSION_DOWNLOAD_URL, EXTENSION_VERSION } from "@/lib/version";

const DOWNLOAD_NAME = `hi-san-bot-extension-${EXTENSION_VERSION}.zip`;
const StatusContext = createContext({ state: "loading", version: null });

// Reads the selected business's latest lead once a minute to learn which extension version its bot runs.
export function ExtensionStatusProvider({ children }) {
  const { business } = useApp();
  const latest = useResource(
    () => (business ? apiClient.listLeads(business.id, { limit: 1 }) : Promise.resolve(null)),
    [business?.id],
    { refreshMs: 60000 }
  );
  let status;
  if (!business) status = { state: "none", version: null };
  else if (!Array.isArray(latest.data)) status = { state: latest.error ? "error" : "loading", version: null };
  else status = extensionStatus(latest.data[0] ?? null, EXTENSION_VERSION);
  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}

export const useExtensionStatus = () => useContext(StatusContext);
const needsUpdate = (status) => status.state === "outdated" || status.state === "unknown";

function CopyText({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[12px] text-text">{text}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted hover:bg-surface-muted"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

export function DownloadButton({ className = "" }) {
  return (
    <a
      href={EXTENSION_DOWNLOAD_URL}
      download={DOWNLOAD_NAME}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-accent-hover ${className}`}
    >
      <Icon name="download" className="size-[18px] shrink-0" />
      Download extension v{EXTENSION_VERSION}
    </a>
  );
}

// How to replace the old extension with the new one. Shared by the popup.
export function InstallSteps() {
  const steps = [
    <>Click <strong>Download extension v{EXTENSION_VERSION}</strong> and save the zip file.</>,
    <>In the old extension, press <strong>Stop Bot</strong> and wait 1 minute, so every bought lead is sent to the dashboard.</>,
    <>Open <CopyText text="chrome://extensions" /> in Chrome. <strong>Remove every old Hi-San Bot</strong>, and any other IndiaMART lead bot on this account.</>,
    <>Extract (unzip) the downloaded file into a new folder, for example <strong>Documents › hi-san-bot-{EXTENSION_VERSION}</strong>. Keep this folder: do not delete or move it later.</>,
    <>On the extensions page, turn on <strong>Developer mode</strong> (top right), click <strong>Load unpacked</strong> and choose the extracted folder (the one that has <strong>manifest.json</strong> inside).</>,
    <>Pin the extension, open it, <strong>sign in</strong>, choose your business and press <strong>Start Bot</strong>. The popup shows <strong>v{EXTENSION_VERSION}</strong>.</>,
    <>Open the IndiaMART <strong>BuyLeads</strong> page and <strong>reload</strong> it once. Lead capture starts again.</>,
  ];
  return (
    <ol className="m-0 grid list-none gap-2.5 p-0">
      {steps.map((step, index) => (
        <li key={index} className="grid grid-cols-[26px_minmax(0,1fr)] gap-2.5">
          <span className="inline-flex size-[26px] items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-dark">{index + 1}</span>
          <span className="pt-0.5 text-[13px] leading-relaxed text-text">{step}</span>
        </li>
      ))}
    </ol>
  );
}

// "Dear user" reminder: 5 s after the dashboard opens, then 30 s after it is closed, then every 60 s, until the
// business's bot sends a lead from the newest extension.
export function ExtensionUpdatePopup() {
  const status = useExtensionStatus();
  const [open, setOpen] = useState(false);
  const [timesClosed, setTimesClosed] = useState(0);
  const due = needsUpdate(status);

  useEffect(() => {
    if (!due || open) return undefined;
    const timer = setTimeout(() => setOpen(true), nextPopupDelay(timesClosed));
    return () => clearTimeout(timer);
  }, [due, open, timesClosed]);

  if (!open || !due) return null;
  const close = () => {
    setOpen(false);
    setTimesClosed((n) => n + 1);
  };
  const current =
    status.state === "unknown"
      ? "We have not received a lead from your bot yet, so we cannot see which version it runs."
      : `Your bot is running ${status.version ? `v${status.version}` : "an old version (older than 1.0.17)"}.`;

  return (
    <Modal title="Please update your Hi-San extension" description={`A new version, v${EXTENSION_VERSION}, is ready.`} onClose={close}>
      <div className="grid gap-4">
        <div className="rounded-xl border border-warning-border bg-warning-bg p-3.5 text-[14px] leading-relaxed text-gold-text">
          <strong>Dear user,</strong> please download the latest version of the extension and remove the old one. {current} The new version
          buys faster and keeps running without stopping.
        </div>
        <DownloadButton className="justify-self-start" />
        <div className="grid gap-2.5">
          <h3 className="m-0 text-[15px] font-bold">How to install it</h3>
          <InstallSteps />
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={close} className="rounded-[10px] border border-border px-3 py-[7px] text-[13px] font-semibold text-muted hover:bg-surface-muted">
            Remind me later
          </button>
        </div>
      </div>
    </Modal>
  );
}

// The sidebar's download link, with a live "update" marker until the bot runs the newest extension.
export function SidebarDownload() {
  const status = useExtensionStatus();
  const due = needsUpdate(status);
  return (
    <a
      href={EXTENSION_DOWNLOAD_URL}
      download={DOWNLOAD_NAME}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
        due ? "border-danger-border bg-danger-bg text-danger hover:brightness-95" : "border-accent-border text-accent-dark hover:bg-accent-soft"
      }`}
    >
      <Icon name="download" className="size-[18px] shrink-0" />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="font-semibold">{due ? "Update extension" : "Download extension"}</span>
        <span className={`text-xs tabular-nums ${due ? "font-semibold" : "text-muted"}`}>
          {due ? `New v${EXTENSION_VERSION} · ${status.version ? `you have v${status.version}` : "please update"}` : status.state === "latest" ? `Up to date · v${EXTENSION_VERSION}` : `Latest: v${EXTENSION_VERSION}`}
        </span>
      </span>
      {due ? (
        <span className="relative flex size-3 shrink-0" aria-label="Update available">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-danger" />
        </span>
      ) : null}
    </a>
  );
}

const TIPS = [
  ["Use the latest extension", `Always run v${EXTENSION_VERSION}. Remove old copies from chrome://extensions.`],
  ["Only one bot per IndiaMART account", "One PC, one Chrome, one Hi-San extension. Two bots, or another lead plugin, double the requests and get leads lost."],
  ["Use Wi-Fi or a LAN cable", "Do not use a mobile hotspot. It is slower and drops, and the fastest bot wins the lead."],
  ["Keep the BuyLeads tab open", "Do not close it or minimise Chrome while capturing leads."],
  ["Do not open other IndiaMART tabs", "Keep only the BuyLeads tab open on IndiaMART while capturing."],
  ["Keep the PC awake", "Plug it in and turn off sleep and hibernate. A sleeping PC buys nothing."],
  ["Stay logged in to IndiaMART", "If IndiaMART asks for an OTP, enter it. Keep enough BuyLead credits."],
  ["Write keywords carefully", "For keywords with 2 or more words, use Exact match, so words like \"tablet\" or \"injection\" alone do not buy wrong leads."],
  ["Do not clear Chrome data", "Do not clear history or cookies, and do not use incognito, while the bot runs."],
  ["If leads stop coming", "Reload the BuyLeads tab, check the internet, and check that the bot says Running."],
];

// "How to use" button under the download link. Opens the tips in a full-screen popup.
export function SidebarHowToUse() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-soft px-3 py-2.5 text-left text-[13px] font-bold text-text hover:bg-surface-muted"
      >
        <Icon name="sparkles" className="size-[18px] shrink-0 text-accent-dark" />
        How to use · tips
      </button>
      {open ? (
        <Modal wide title="How to use Hi-San Bot" description="Follow these so your bot catches the most leads." onClose={() => setOpen(false)}>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-[760px]:grid-cols-1">
            {TIPS.map(([title, text]) => (
              <li key={title} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-xl border border-border bg-surface-soft p-3 text-[14px] leading-snug">
                <Icon name="check" className="mt-0.5 size-[18px] text-success" />
                <span>
                  <strong className="text-text">{title}.</strong> <span className="text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2.5">
            <h3 className="m-0 text-[15px] font-bold">How to install or update the extension</h3>
            <InstallSteps />
          </div>
          <DownloadButton className="justify-self-start" />
        </Modal>
      ) : null}
    </>
  );
}
