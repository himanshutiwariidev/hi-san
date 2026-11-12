"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import PrimaryButton from "@/components/ui/PrimaryButton";
import StatusPill from "@/components/ui/StatusPill";
import { IconButton } from "@/components/ui/buttons";
import { inputClass, LabeledField } from "@/components/ui/fields";
import { Table, Th, Td } from "@/components/ui/Table";
import { SkeletonRows } from "@/components/ui/Skeleton";
import CountrySelect from "@/components/CountrySelect";
import { useApp } from "@/components/AppContext";
import { apiClient, errorMessage } from "@/lib/api";
import { countries, countryName, findCountry } from "@/lib/countries";
import { useResource } from "@/lib/useResource";

const emptyDraft = {
  keyword: "",
  type: "positive",
  match: "contains",
  minimumQuantity: "",
  maxLeadsPerDay: "",
  country: "",
};

function parseKeywordCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")))
    .filter(([keyword]) => keyword && keyword.toLowerCase() !== "keyword")
    .map(([keyword, match, countryCell]) => ({
      keyword,
      type: "positive",
      match: match?.toLowerCase() === "exact" ? "exact" : "contains",
      countries: (countryCell ?? "")
        .split(/[;|]/)
        .map((c) => findCountry(c)?.code)
        .filter(Boolean),
    }));
}

function SettingsForm({ business }) {
  const settingsRes = useResource(() => apiClient.getFilterSettings(business.id), [business.id]);
  const [settings, setSettings] = useState(null);
  const [blockedText, setBlockedText] = useState("");
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settingsRes.data) return;
    setSettings(settingsRes.data);
    setBlockedText((settingsRes.data.blocked_words ?? []).join(", "));
  }, [settingsRes.data]);

  if (settingsRes.error) return <p className="m-0 text-danger">{settingsRes.error}</p>;
  if (!settings) return <SkeletonRows count={3} />;

  const update = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    setMessage(null);
  };

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await apiClient.updateFilterSettings(business.id, {
        ...settings,
        blocked_words: blockedText.split(",").map((w) => w.trim()).filter(Boolean),
      });
      setSettings(saved);
      setBlockedText((saved.blocked_words ?? []).join(", "));
      setMessage({ ok: true, text: "Filter settings saved. Synchronized to extension." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid max-w-[850px] gap-4" onSubmit={save}>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-soft p-3.5">
        <span className="grid gap-0.5">
          <strong>Auto-buy Automation</strong>
          <span className="text-[13px] text-muted">When off, leads are captured as skipped without spending any credit.</span>
        </span>
        <input type="checkbox" checked={Boolean(settings.auto_buy)} onChange={(e) => update({ auto_buy: e.target.checked })} className="size-5 accent-accent" />
      </label>

      <div className="grid grid-cols-3 gap-4 max-[760px]:grid-cols-1">
        <LabeledField label={`Daily purchase limit (1–${settings.max_daily_capture_limit ?? 50})`}>
          <input
            type="number"
            min={1}
            max={settings.max_daily_capture_limit ?? 50}
            value={settings.daily_capture_limit ?? settings.daily_limit ?? 10}
            onChange={(e) => update({ daily_limit: Number(e.target.value), daily_capture_limit: Number(e.target.value) })}
            className={inputClass}
          />
        </LabeledField>
        <LabeledField label="Minimum global quantity (0 = any)">
          <input type="number" min={0} step="any" value={settings.min_quantity ?? 0} onChange={(e) => update({ min_quantity: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Max lead age (minutes, 0 = any)">
          <input type="number" min={0} value={settings.max_age_minutes ?? 0} onChange={(e) => update({ max_age_minutes: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">Allowed Countries (empty = all countries)</span>
          <button type="button" className="border-0 bg-transparent p-0 text-[12px] font-bold text-accent-dark cursor-pointer" onClick={() => update({ allowed_countries: [] })}>
            Clear
          </button>
        </div>
        <CountrySelect value={settings.allowed_countries ?? []} onChange={(allowed_countries) => update({ allowed_countries })} />
      </div>

      {/* Contact Verification & Mode Filters */}
      <fieldset className="grid gap-3.5 rounded-xl border border-border p-4">
        <legend className="text-[13px] font-bold text-muted">Contact Filters</legend>
        <p className="m-0 text-[12px] text-muted">
          Every lead is checked against these rules. Control whether phone, email, or either one is required.
        </p>

        <div className="grid grid-cols-3 gap-4 max-[760px]:grid-cols-1">
          <LabeledField label="Email Mode">
            <select
              value={settings.email_mode ?? "off"}
              onChange={(e) => update({ email_mode: e.target.value })}
              className={inputClass}
              disabled={settings.any_contact_mode === "one_verified" || settings.any_contact_mode === "one_available_one_verified"}
            >
              <option value="off">Off (Not checked)</option>
              <option value="available">Available (Email shown)</option>
              <option value="verified">Verified (IndiaMART verified email)</option>
            </select>
            <span className="text-[11px] text-muted">
              {settings.email_mode === "verified"
                ? "Must have green tick verified email."
                : settings.email_mode === "available"
                ? "Must show an email address."
                : "Email presence is not checked."}
            </span>
          </LabeledField>

          <LabeledField label="Phone / WhatsApp Mode">
            <select
              value={settings.phone_mode ?? "off"}
              onChange={(e) => update({ phone_mode: e.target.value })}
              className={inputClass}
              disabled={settings.any_contact_mode === "one_verified" || settings.any_contact_mode === "one_available_one_verified"}
            >
              <option value="off">Off (Not checked)</option>
              <option value="available">Available (Phone or WhatsApp shown)</option>
              <option value="verified">Verified (IndiaMART verified mobile)</option>
            </select>
            <span className="text-[11px] text-muted">
              {settings.phone_mode === "verified"
                ? "Must have green tick OTP-verified mobile."
                : settings.phone_mode === "available"
                ? "Must show phone or active WhatsApp."
                : "Phone presence is not checked."}
            </span>
          </LabeledField>

          <LabeledField label="Any Contact Mode (Combination)">
            <select
              value={settings.any_contact_mode ?? "off"}
              onChange={(e) => update({ any_contact_mode: e.target.value })}
              className={inputClass}
            >
              <option value="off">Off (Email & Phone checked separately)</option>
              <option value="required">Either one (Email OR Phone must pass)</option>
              <option value="one_verified">Any Verified (Email OR Phone verified)</option>
              <option value="one_available_one_verified">One Available + One Verified</option>
            </select>
            <span className="text-[11px] text-muted">
              {settings.any_contact_mode === "required"
                ? "Passes if lead has Email OR Phone."
                : settings.any_contact_mode === "one_verified"
                ? "Passes if at least 1 contact is OTP-verified."
                : settings.any_contact_mode === "one_available_one_verified"
                ? "Must have 1 available + 1 verified contact."
                : "Both Email & Phone rules must pass."}
            </span>
          </LabeledField>
        </div>

        <label className="flex items-center gap-2 text-[13px] pt-1">
          <input
            type="checkbox"
            checked={Boolean(settings.trusted_buyer_bypass)}
            onChange={(e) => update({ trusted_buyer_bypass: e.target.checked })}
            className="accent-accent"
          />
          <span>Trusted buyers (1+ year on IndiaMART, any contact) skip contact filter</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-2.5 rounded-xl border border-border p-3.5">
        <legend className="text-[13px] font-bold text-muted">Quality &amp; Anti-Junk Filters</legend>
        <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={Boolean(settings.require_gst_verified)} onChange={(e) => update({ require_gst_verified: e.target.checked })} className="accent-accent" />
            Require GST Registered / Verified Buyer
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={Boolean(!settings.include_retail_leads)} onChange={(e) => update({ include_retail_leads: !e.target.checked })} className="accent-accent" />
            Block Retail Enquiries (1-piece / retail-flagged)
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2 max-[760px]:grid-cols-1">
          <LabeledField label="Skip retail leads below quantity">
            <input
              type="number"
              placeholder="e.g. 5"
              value={settings.retail_quantity_threshold ?? ""}
              onChange={(e) => update({ retail_quantity_threshold: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Min buyer member vintage (months on IndiaMART)">
            <input
              type="number"
              placeholder="e.g. 6"
              value={settings.min_buyer_member_months ?? ""}
              onChange={(e) => update({ min_buyer_member_months: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
            />
          </LabeledField>
        </div>
      </fieldset>

      <LabeledField label="Negative / Blocked words, comma separated (skips enquiry if any word matches)">
        <textarea rows={2} value={blockedText} onChange={(e) => setBlockedText(e.target.value)} className={inputClass} placeholder="sample, free, scrap, repair, second hand, used" />
      </LabeledField>

      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save filter settings"}
        </PrimaryButton>
        {message ? <span className={`text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span> : null}
      </div>
    </form>
  );
}

function KeywordRules({ business }) {
  const [tab, setTab] = useState("positive");
  const rulesRes = useResource(() => apiClient.listKeywordRules(business.id, { type: tab }), [business.id, tab]);
  const rules = rulesRes.data ?? [];
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState(null);
  const [importing, setImporting] = useState(false);

  async function run(action, success) {
    setMessage(null);
    try {
      await action();
      await rulesRes.reload({ silent: true });
      if (success) setMessage({ ok: true, text: success });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  function addRule(event) {
    event.preventDefault();
    run(async () => {
      await apiClient.createKeywordRule(business.id, {
        keyword: draft.keyword,
        type: tab,
        match: draft.match,
        minimumQuantity: draft.minimumQuantity ? Number(draft.minimumQuantity) : null,
        maxLeadsPerDay: draft.maxLeadsPerDay ? Number(draft.maxLeadsPerDay) : null,
        countries: draft.country ? [draft.country] : [],
      });
      setDraft(emptyDraft);
    }, `${tab === "positive" ? "Target" : "Excluded"} keyword added.`);
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    await run(async () => {
      const rows = parseKeywordCsv(await file.text());
      const result = await apiClient.importKeywordRules(business.id, rows);
      setMessage({
        ok: result.errors?.length === 0,
        text: `Imported ${result.imported_rows ?? 0} rows.`,
      });
    });
    setImporting(false);
  }

  return (
    <Card className="grid gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => setTab("positive")}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold cursor-pointer ${
                tab === "positive" ? "bg-accent text-white" : "bg-surface-muted text-muted hover:text-text"
              }`}
            >
              Positive Keywords (Auto-Buy)
            </button>
            <button
              type="button"
              onClick={() => setTab("negative")}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold cursor-pointer ${
                tab === "negative" ? "bg-danger text-white" : "bg-surface-muted text-muted hover:text-text"
              }`}
            >
              Negative Keywords (Auto-Skip)
            </button>
          </div>
          <p className="m-0 text-[13px] text-muted">
            {tab === "positive"
              ? "Enquiries are bought immediately if their title matches any positive rule."
              : "Enquiries containing these negative keywords are instantly skipped to save credit."}
          </p>
        </div>
        <label className={`rounded-[10px] border border-border bg-surface px-3 py-[9px] font-bold text-accent-dark ${importing ? "cursor-not-allowed opacity-65" : "cursor-pointer"}`}>
          {importing ? "Importing..." : "Import CSV"}
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" disabled={importing} onChange={importCsv} />
        </label>
      </div>

      {message ? <p className={`m-0 text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}

      <form onSubmit={addRule} className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))_max-content] items-end gap-2.5">
        <LabeledField label={tab === "positive" ? "Buy Keyword" : "Exclude Keyword"}>
          <input
            required
            placeholder={tab === "positive" ? "e.g. Paracetamol 500mg" : "e.g. scrap, used, sample"}
            value={draft.keyword}
            onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
            className={inputClass}
          />
        </LabeledField>

        <LabeledField label="Match type">
          <select value={draft.match} onChange={(e) => setDraft({ ...draft, match: e.target.value })} className={inputClass}>
            <option value="contains">Contains anywhere</option>
            <option value="exact">Exact match</option>
          </select>
        </LabeledField>

        {tab === "positive" ? (
          <LabeledField label="Min Quantity">
            <input
              type="number"
              min={0}
              placeholder="Any"
              value={draft.minimumQuantity}
              onChange={(e) => setDraft({ ...draft, minimumQuantity: e.target.value })}
              className={inputClass}
            />
          </LabeledField>
        ) : null}

        <PrimaryButton type="submit">{tab === "positive" ? "Add Target Rule" : "Add Exclude Rule"}</PrimaryButton>
      </form>

      {rulesRes.loading ? (
        <SkeletonRows count={3} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Keyword</Th>
              <Th>Match</Th>
              {tab === "positive" ? <Th>Min Qty</Th> : null}
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <Td className="font-semibold text-text">{rule.keyword}</Td>
                <Td className="capitalize">{rule.match}</Td>
                {tab === "positive" ? (
                  <Td className="text-muted">{rule.minimum_quantity ?? "Any"}</Td>
                ) : null}
                <Td>
                  <StatusPill tone={rule.enabled ? "success" : "muted"}>{rule.enabled ? "Active" : "Paused"}</StatusPill>
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton type="button" onClick={() => run(() => apiClient.updateKeywordRule(business.id, rule.id, { enabled: !rule.enabled }))}>
                      {rule.enabled ? "Pause" : "Resume"}
                    </IconButton>
                    <IconButton tone="danger" type="button" onClick={() => run(() => apiClient.deleteKeywordRule(business.id, rule.id))}>
                      Delete
                    </IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {!rulesRes.loading && rules.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-7 text-muted">
          {tab === "positive"
            ? "No positive keywords configured yet. Add keywords to start auto-buying matching leads."
            : "No excluded keywords. Add junk keywords to avoid wasting lead balance."}
        </div>
      ) : null}
    </Card>
  );
}

export default function FiltersPage() {
  const { business } = useApp();
  return (
    <div className="grid gap-[22px]">
      <PageHeader
        title="Keywords"
        description="Positive and negative keyword rules with quantity thresholds and daily lead limits."
      />
      <Card className="grid gap-4">
        <div>
          <h2 className="m-0 mb-2 text-lg font-bold">Bot Filter Settings</h2>
          <p className="m-0 text-muted">A matched lead is verified against these rules before auto-buying.</p>
        </div>
        <SettingsForm key={business.id} business={business} />
      </Card>
      <KeywordRules key={`rules-${business.id}`} business={business} />
    </div>
  );
}
