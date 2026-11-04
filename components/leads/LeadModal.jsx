"use client";

import Modal from "@/components/ui/Modal";
import CountryFlag from "@/components/leads/CountryFlag";
import LeadStatus from "@/components/leads/LeadStatus";
import { ContactPills } from "@/components/leads/Contacts";
import { useApp } from "@/components/AppContext";
import { apiClient } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/useResource";

function DetailPanel({ title, rows, children }) {
  return (
    <div className="rounded-lg border border-border bg-surface-soft p-3.5">
      <h3 className="m-0 mb-3 text-xs font-bold text-muted uppercase">{title}</h3>
      {rows ? (
        <dl className="m-0 grid gap-2.5">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[108px_minmax(0,1fr)] gap-[3px]">
              <dt className="text-xs font-bold text-muted">{label}</dt>
              <dd className="m-0 text-[13px] font-bold [overflow-wrap:anywhere] text-text">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  );
}

export default function LeadModal({ lead, onClose }) {
  const { business } = useApp();
  const logs = useResource(() => apiClient.getLeadLogs(business.id, lead.id), [lead.id]);

  return (
    <Modal wide title={lead.title} description={`Received ${formatDateTime(lead.received_at)}`} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <LeadStatus status={lead.status} />
        {lead.quantity ? (
          <span className="inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-dark">{lead.quantity}</span>
        ) : null}
        {lead.filter_reason ? <span className="text-[13px] text-accent-dark">{lead.filter_reason}</span> : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(260px,.85fr)] gap-3.5 max-[760px]:grid-cols-1">
        <DetailPanel
          title="Requirement"
          rows={[
            ["Product", lead.title],
            ["Quantity", lead.quantity],
            ["Keyword", lead.matched_keyword],
            ["Posted", lead.posted_text],
            ["Lead ID", lead.external_id],
            ...(lead.source_url
              ? [["Source", <a key="s" href={lead.source_url} target="_blank" rel="noreferrer" className="text-accent-dark hover:underline">IndiaMART BuyLeads</a>]]
              : []),
          ]}
        />
        <DetailPanel
          title="Buyer"
          rows={[
            ["Name", lead.buyer_name],
            ["Company", lead.company],
            ["Location", <CountryFlag key="c" country={{ ...lead.country, name: [lead.city, lead.state, lead.country.name].filter(Boolean).join(", ") }} />],
            ["Address", lead.address],
            ["GST Verified", lead.gst_verified ? "Yes (GST Registered)" : "Not verified"],
            ["Email", lead.email ? <a key="e" href={`mailto:${lead.email}`} className="text-accent-dark">{lead.email}</a> : null],
            ["Phone", lead.phone ? <a key="p" href={`tel:${lead.phone}`} className="text-accent-dark">{lead.phone}</a> : null],
            ...(lead.purchase_id ? [["Purchase ID", lead.purchase_id]] : []),
            ...(lead.credit_balance ? [["Credit Balance", lead.credit_balance]] : []),
          ]}
        >
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <ContactPills contacts={lead.contacts} />
            {lead.phone ? (
              <a
                href={`https://wa.me/${String(lead.phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                💬 Chat on WhatsApp
              </a>
            ) : null}
          </div>
        </DetailPanel>
      </div>
      <DetailPanel title="Decision log">
        {logs.loading ? (
          <p className="m-0 text-[13px] text-muted">Loading…</p>
        ) : (
          <ol className="m-0 grid list-none gap-2 p-0">
            {(logs.data ?? []).map((entry, i) => (
              <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 text-[13px]">
                <span className="text-muted tabular-nums">{formatDateTime(entry.at)}</span>
                <span className="text-accent-dark">{entry.message}</span>
              </li>
            ))}
          </ol>
        )}
      </DetailPanel>
    </Modal>
  );
}
