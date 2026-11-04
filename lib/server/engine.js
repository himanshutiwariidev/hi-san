// Decides whether the extension should buy a scraped IndiaMART lead, and records the outcome.
import { findCountry } from "@/lib/countries";
import { db, newId, now, transaction } from "./db";
import { parseFilterSettings } from "./serializers";
import { dispatchLeadEvent } from "./webhooks";

const PENDING_TIMEOUT_MINUTES = 15;

export function normalize(text) {
  return ` ${String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

export function parseQuantity(text) {
  const match = String(text ?? "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function log(leadId, message) {
  db.prepare("INSERT INTO lead_logs (lead_id, at, message) VALUES (?, ?, ?)").run(leadId, now(), message);
}

function matchKeyword(rules, title, countryCode) {
  const haystack = normalize(title);
  for (const rule of rules) {
    const needle = normalize(rule.keyword);
    const hit = rule.match === "exact" ? haystack === needle : haystack.includes(needle);
    if (!hit) continue;
    const countries = JSON.parse(rule.countries);
    if (countries.length && !countries.includes(countryCode)) continue;
    return rule;
  }
  return null;
}

// Returns { status: "pending" | "filtered", reason, keyword }.
export function decide(business, lead) {
  const settings = parseFilterSettings(business.filter_settings);
  const rules = db.prepare("SELECT * FROM keyword_rules WHERE business_id = ? AND enabled = 1").all(business.id);

  const rule = matchKeyword(rules, lead.title, lead.country_code);
  if (!rule) return { status: "filtered", reason: rules.length ? "No keyword matched" : "No keyword rules configured" };
  const keyword = rule.keyword;

  if (settings.allowed_countries.length && !settings.allowed_countries.includes(lead.country_code)) {
    return { status: "filtered", reason: `Country not allowed: ${lead.country_name || "unknown"}`, keyword };
  }
  const title = normalize(lead.title);
  const blocked = settings.blocked_words.find((w) => w && title.includes(normalize(w)));
  if (blocked) return { status: "filtered", reason: `Blocked word: ${blocked}`, keyword };

  if (settings.min_quantity > 0 && (lead.quantity_value ?? 0) < settings.min_quantity) {
    return { status: "filtered", reason: `Quantity below minimum (${settings.min_quantity})`, keyword };
  }
  if (settings.require_email_verified && !lead.email_verified) return { status: "filtered", reason: "Email not verified", keyword };
  if (settings.require_phone_verified && !lead.phone_verified) return { status: "filtered", reason: "Mobile not verified", keyword };
  if (settings.max_age_minutes > 0 && lead.age_minutes != null && lead.age_minutes > settings.max_age_minutes) {
    return { status: "filtered", reason: `Older than ${settings.max_age_minutes} minutes`, keyword };
  }
  if (!settings.auto_buy) return { status: "filtered", reason: "Auto-buy is paused", keyword };

  const boughtToday = db
    .prepare("SELECT COUNT(*) n FROM leads WHERE business_id = ? AND status IN ('pending','retrieved') AND decided_at >= ?")
    .get(business.id, startOfToday()).n;
  if (settings.daily_limit > 0 && boughtToday >= settings.daily_limit) {
    return { status: "filtered", reason: `Daily limit reached (${settings.daily_limit})`, keyword };
  }
  return { status: "pending", reason: null, keyword };
}

function cleanLead(input) {
  const country = findCountry(input.country) ?? (input.is_foreign === false ? findCountry("India") : null);
  const title = String(input.title ?? "").trim().slice(0, 300);
  const externalId = String(input.external_id ?? "").trim().slice(0, 200);
  if (!title || !externalId) return null;
  return {
    external_id: externalId,
    title,
    category: input.category ? String(input.category).slice(0, 200) : null,
    quantity: input.quantity ? String(input.quantity).slice(0, 100) : null,
    quantity_value: parseQuantity(input.quantity),
    country_code: country?.code ?? null,
    country_name: country?.name ?? (input.country ? String(input.country).slice(0, 100) : null),
    city: input.city ? String(input.city).slice(0, 100) : null,
    email_verified: input.email_verified ? 1 : 0,
    phone_verified: input.phone_verified ? 1 : 0,
    has_whatsapp: input.has_whatsapp ? 1 : 0,
    age_minutes: Number.isFinite(input.age_minutes) ? input.age_minutes : null,
    posted_text: input.posted_text ? String(input.posted_text).slice(0, 100) : null,
    source_url: input.source_url ? String(input.source_url).slice(0, 500) : null,
    raw: JSON.stringify(input).slice(0, 5000),
  };
}

export function expireStalePending(businessId) {
  const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MINUTES * 60000).toISOString();
  const stale = db.prepare("SELECT id FROM leads WHERE business_id = ? AND status = 'pending' AND decided_at < ?").all(businessId, cutoff);
  for (const { id } of stale) {
    db.prepare("UPDATE leads SET status = 'not_retrieved', filter_reason = ? WHERE id = ?").run("Extension did not report a result", id);
    log(id, "Marked not retrieved: no result from the extension within 15 minutes");
  }
}

// Evaluates a batch of scraped leads. Returns one decision per lead for the extension.
// With dryRun, the same work runs inside a transaction that is rolled back, so the decisions
// (including the daily limit across the batch) match a live run exactly but nothing is saved.
export function evaluateBatch(business, inputs, { dryRun = false } = {}) {
  if (dryRun) {
    db.exec("BEGIN");
    try {
      expireStalePending(business.id);
      return processBatch(business, inputs).decisions;
    } finally {
      db.exec("ROLLBACK");
    }
  }
  expireStalePending(business.id);
  const { decisions, events } = transaction(() => processBatch(business, inputs));
  for (const id of events) dispatchLeadEvent(business, db.prepare("SELECT * FROM leads WHERE id = ?").get(id));
  return decisions;
}

function processBatch(business, inputs) {
  const decisions = [];
  const events = [];
  for (const input of inputs.slice(0, 100)) {
    const lead = cleanLead(input);
    if (!lead) continue;
    const existing = db.prepare("SELECT * FROM leads WHERE business_id = ? AND external_id = ?").get(business.id, lead.external_id);

    // Already bought or attempted: never buy twice.
    if (existing && existing.status !== "filtered") {
      decisions.push({ external_id: lead.external_id, action: "skip", status: existing.status, reason: "Already processed" });
      continue;
    }

    const decision = decide(business, lead);
    const action = decision.status === "pending" ? "buy" : "skip";
    decisions.push({ external_id: lead.external_id, action, status: decision.status, reason: decision.reason, keyword: decision.keyword ?? null });

    if (existing) {
      // Previously filtered lead: only write when the decision changed (e.g. rules were edited).
      if (decision.status === existing.status && decision.reason === existing.filter_reason) continue;
      db.prepare("UPDATE leads SET status = ?, filter_reason = ?, matched_keyword = ?, decided_at = ? WHERE id = ?").run(
        decision.status, decision.reason, decision.keyword ?? null, now(), existing.id
      );
      log(existing.id, action === "buy" ? `Re-evaluated: matched "${decision.keyword}", buying` : `Re-evaluated: ${decision.reason}`);
      continue;
    }

    const id = newId("lead");
    const ts = now();
    db.prepare(
      `INSERT INTO leads (id, business_id, external_id, title, category, quantity, quantity_value, country_code, country_name, city,
        email_verified, phone_verified, has_whatsapp, status, filter_reason, matched_keyword, source_url, posted_text, raw, received_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, business.id, lead.external_id, lead.title, lead.category, lead.quantity, lead.quantity_value, lead.country_code, lead.country_name,
      lead.city, lead.email_verified, lead.phone_verified, lead.has_whatsapp, decision.status, decision.reason, decision.keyword ?? null,
      lead.source_url, lead.posted_text, lead.raw, ts, ts
    );
    log(id, "Captured from IndiaMART BuyLeads");
    log(id, action === "buy" ? `Matched keyword "${decision.keyword}": sent to extension to buy` : `Filtered: ${decision.reason}`);
    if (decision.status === "filtered") events.push(id);
  }
  return { decisions, events };
}

// Called by the extension after it tried to buy a lead.
export function recordResult(business, externalId, result) {
  const lead = db.prepare("SELECT * FROM leads WHERE business_id = ? AND external_id = ?").get(business.id, String(externalId));
  if (!lead) return null;
  if (lead.status === "retrieved") return lead;

  const str = (v, max = 200) => (v ? String(v).trim().slice(0, max) : null);
  if (result.success) {
    db.prepare(
      `UPDATE leads SET status = 'retrieved', filter_reason = NULL, buyer_name = COALESCE(?, buyer_name), company = COALESCE(?, company),
        email = COALESCE(?, email), phone = COALESCE(?, phone), has_whatsapp = MAX(has_whatsapp, ?), city = COALESCE(?, city), retrieved_at = ?
       WHERE id = ?`
    ).run(str(result.buyer_name), str(result.company), str(result.email), str(result.phone, 50), result.has_whatsapp ? 1 : 0, str(result.city, 100), now(), lead.id);
    log(lead.id, "Bought successfully" + (result.email || result.phone ? " and buyer contacts saved" : " (contacts not found on page)"));
  } else {
    const reason = str(result.error, 300) ?? "Purchase failed";
    db.prepare("UPDATE leads SET status = 'not_retrieved', filter_reason = ? WHERE id = ?").run(reason, lead.id);
    log(lead.id, `Not retrieved: ${reason}`);
  }
  const updated = db.prepare("SELECT * FROM leads WHERE id = ?").get(lead.id);
  dispatchLeadEvent(business, updated);
  return updated;
}
