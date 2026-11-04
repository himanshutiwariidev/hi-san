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

const emptyDraft = { keyword: "", match: "contains", country: "" };

// CSV columns: keyword[,match][,countries separated by ; or |]. A header row is optional.
function parseKeywordCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")))
    .filter(([keyword]) => keyword && keyword.toLowerCase() !== "keyword")
    .map(([keyword, match, countryCell]) => ({
      keyword,
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
    setBlockedText(settingsRes.data.blocked_words.join(", "));
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
      setBlockedText(saved.blocked_words.join(", "));
      setMessage({ ok: true, text: "Filter settings saved. The extension uses them on its next scan." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid max-w-[720px] gap-4" onSubmit={save}>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-soft p-3.5">
        <span className="grid gap-0.5">
          <strong>Auto-buy</strong>
          <span className="text-[13px] text-muted">When off, matching leads are recorded as filtered and nothing is bought.</span>
        </span>
        <input type="checkbox" checked={settings.auto_buy} onChange={(e) => update({ auto_buy: e.target.checked })} className="size-5 accent-accent" />
      </label>
      <div className="grid grid-cols-3 gap-4 max-[760px]:grid-cols-1">
        <LabeledField label="Max purchases per day (0 = no limit)">
          <input type="number" min={0} value={settings.daily_limit} onChange={(e) => update({ daily_limit: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Minimum quantity (0 = any)">
          <input type="number" min={0} step="any" value={settings.min_quantity} onChange={(e) => update({ min_quantity: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Max lead age in minutes (0 = any)">
          <input type="number" min={0} value={settings.max_age_minutes} onChange={(e) => update({ max_age_minutes: Number(e.target.value) })} className={inputClass} />
        </LabeledField>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">Allowed countries (empty = all countries)</span>
          <button type="button" className="border-0 bg-transparent p-0 text-[13px] font-bold text-accent-dark" onClick={() => update({ allowed_countries: [] })}>
            Clear
          </button>
        </div>
        <CountrySelect value={settings.allowed_countries} onChange={(allowed_countries) => update({ allowed_countries })} />
      </div>
      <LabeledField label="Blocked words, comma separated (leads whose title contains any of these are skipped)">
        <textarea rows={2} value={blockedText} onChange={(e) => setBlockedText(e.target.value)} className={inputClass} placeholder="sample, free, second hand" />
      </LabeledField>
      <fieldset className="m-0 flex flex-wrap gap-3 rounded-lg border border-border p-3">
        <legend className="text-[13px] text-muted">Only buy leads where IndiaMART shows</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.require_email_verified} onChange={(e) => update({ require_email_verified: e.target.checked })} className="accent-accent" />
          Email verified
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.require_phone_verified} onChange={(e) => update({ require_phone_verified: e.target.checked })} className="accent-accent" />
          Mobile verified
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save filters"}
        </PrimaryButton>
        {message ? <span className={`text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span> : null}
      </div>
    </form>
  );
}

function KeywordRules({ business }) {
  const rulesRes = useResource(() => apiClient.listKeywordRules(business.id), [business.id]);
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
      await apiClient.createKeywordRule(business.id, { keyword: draft.keyword, match: draft.match, countries: draft.country ? [draft.country] : [] });
      setDraft(emptyDraft);
    });
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
        ok: result.errors.length === 0,
        text: `Imported ${result.imported_rows} of ${result.total_rows} rows${result.skipped_rows ? `, ${result.skipped_rows} already existed` : ""}.${result.errors.length ? ` ${result.errors.join(" ")}` : ""}`,
      });
    });
    setImporting(false);
  }

  return (
    <Card className="grid gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div>
          <h2 className="m-0 mb-1 text-lg font-bold">Keyword rules</h2>
          <p className="m-0 text-[13px] text-muted">
            A lead is bought only if its title matches an enabled keyword. “Contains” matches anywhere in the title, “Exact” must be the whole title.
          </p>
        </div>
        <label className={`rounded-[10px] border border-border bg-surface px-3 py-[9px] font-bold text-accent-dark ${importing ? "cursor-not-allowed opacity-65" : "cursor-pointer"}`}>
          {importing ? "Importing..." : "Import CSV"}
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" disabled={importing} onChange={importCsv} />
        </label>
      </div>
      <p className="m-0 text-xs text-muted">CSV format: one keyword per line, optionally followed by match (contains/exact) and countries separated by “;”.</p>
      {message ? <p className={`m-0 text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}
      <form onSubmit={addRule} className="grid grid-cols-[minmax(180px,1fr)_minmax(140px,180px)_minmax(100px,140px)_max-content] items-center gap-3 max-[760px]:grid-cols-1">
        <input required placeholder="Keyword, e.g. basmati rice" value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} className={inputClass} />
        <select value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} className={inputClass}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={draft.match} onChange={(e) => setDraft({ ...draft, match: e.target.value })} className={inputClass}>
          <option value="contains">Contains</option>
          <option value="exact">Exact</option>
        </select>
        <PrimaryButton type="submit">Add keyword</PrimaryButton>
      </form>
      {rulesRes.loading ? (
        <SkeletonRows count={3} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Keyword</Th>
              <Th>Match</Th>
              <Th>Countries</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <Td className="font-semibold">{rule.keyword}</Td>
                <Td className="capitalize">{rule.match}</Td>
                <Td className="max-w-[260px] text-[13px] text-muted">{rule.countries.length ? rule.countries.map(countryName).join(", ") : "All countries"}</Td>
                <Td>
                  <StatusPill tone={rule.enabled ? "success" : "muted"}>{rule.enabled ? "Enabled" : "Disabled"}</StatusPill>
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton type="button" onClick={() => run(() => apiClient.updateKeywordRule(business.id, rule.id, { enabled: !rule.enabled }))}>
                      {rule.enabled ? "Disable" : "Enable"}
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
        <div className="rounded-lg border border-border bg-surface p-7 text-muted">No keywords yet. Nothing will be bought until you add at least one.</div>
      ) : null}
    </Card>
  );
}

export default function FiltersPage() {
  const { business } = useApp();
  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Filters & keywords" description={`Decide which IndiaMART leads ${business.name} buys automatically.`} />
      <Card className="grid gap-4">
        <div>
          <h2 className="m-0 mb-2 text-lg font-bold">Filter settings</h2>
          <p className="m-0 text-muted">A keyword-matched lead is still skipped if it fails any of these rules.</p>
        </div>
        <SettingsForm key={business.id} business={business} />
      </Card>
      <KeywordRules key={`rules-${business.id}`} business={business} />
    </div>
  );
}
