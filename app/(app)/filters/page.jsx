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
import { COMMON_UNITS, INDIAN_STATES } from "@/lib/geo";
import { useResource } from "@/lib/useResource";

const emptyDraft = {
  keyword: "",
  type: "positive",
  match: "contains",
  unit: "",
  minimumQuantity: "",
  maxLeadsPerDay: "",
  country: "",
  state: "",
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
        <LabeledField label="Daily purchase limit (0 = unlimited)">
          <input type="number" min={0} value={settings.daily_limit ?? 10} onChange={(e) => update({ daily_limit: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Minimum global quantity (0 = any)">
          <input type="number" min={0} step="any" value={settings.min_quantity ?? 0} onChange={(e) => update({ min_quantity: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Max lead age (minutes, 0 = any)">
          <input type="number" min={0} value={settings.max_age_minutes ?? 0} onChange={(e) => update({ max_age_minutes: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
      </div>

      <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">Allowed Indian States (empty = all India)</span>
            <button type="button" className="border-0 bg-transparent p-0 text-[12px] font-bold text-accent-dark cursor-pointer" onClick={() => update({ allowed_states: [] })}>
              Clear
            </button>
          </div>
          <select
            className={inputClass}
            onChange={(e) => {
              const val = e.target.value;
              if (val && !settings.allowed_states?.includes(val)) {
                update({ allowed_states: [...(settings.allowed_states ?? []), val] });
              }
              e.target.value = "";
            }}
          >
            <option value="">+ Add State</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(settings.allowed_states ?? []).map((st) => (
              <span key={st} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs">
                {st}
                <button
                  type="button"
                  onClick={() => update({ allowed_states: settings.allowed_states.filter((s) => s !== st) })}
                  className="border-0 bg-transparent text-muted hover:text-danger cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
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
      </div>

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
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={Boolean(settings.require_phone_verified)} onChange={(e) => update({ require_phone_verified: e.target.checked })} className="accent-accent" />
            Require Mobile Verified
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={Boolean(settings.require_email_verified)} onChange={(e) => update({ require_email_verified: e.target.checked })} className="accent-accent" />
            Require Email Verified
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
        unit: draft.unit || null,
        minimumQuantity: draft.minimumQuantity ? Number(draft.minimumQuantity) : null,
        maxLeadsPerDay: draft.maxLeadsPerDay ? Number(draft.maxLeadsPerDay) : null,
        countries: draft.country ? [draft.country] : [],
        states: draft.state ? [draft.state] : [],
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
          <>
            <LabeledField label="Unit (optional)">
              <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={inputClass}>
                <option value="">Any unit</option>
                {COMMON_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </LabeledField>

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

            <LabeledField label="Target State">
              <select value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} className={inputClass}>
                <option value="">All States</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </LabeledField>
          </>
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
              {tab === "positive" ? (
                <>
                  <Th>Unit</Th>
                  <Th>Min Qty</Th>
                  <Th>Target State</Th>
                </>
              ) : null}
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
                  <>
                    <Td className="text-muted">{rule.unit || "Any"}</Td>
                    <Td className="text-muted">{rule.minimum_quantity ?? "Any"}</Td>
                    <Td className="text-muted">{rule.states?.length ? rule.states.join(", ") : "All States"}</Td>
                  </>
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
      <PageHeader title="Filters & Keywords" description={`Granular targeting rules for ${business.name}.`} />
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
