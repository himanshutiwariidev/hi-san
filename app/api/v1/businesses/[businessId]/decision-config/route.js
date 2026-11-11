import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { parseFilterSettings } from "@/lib/server/serializers";

export const GET = route(async (_request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const settings = parseFilterSettings(business.filter_settings);

  const utcToday = new Date().toISOString().slice(0, 10);
  const startOfUtcDay = `${utcToday}T00:00:00.000Z`;

  // A purchase in progress uses up the daily limit too. A failed one gives its slot back.
  const boughtToday = db
    .prepare("SELECT matched_keyword, matched_rule_ids FROM leads WHERE business_id = ? AND status IN ('pending', 'retrieved') AND received_at >= ?")
    .all(business.id, startOfUtcDay);
  const capturedToday = boughtToday.length;

  // The extension looks these counts up by rule id. The keyword text is kept for older clients.
  const keywordCapturedCounts = {};
  const countFor = (key) => {
    keywordCapturedCounts[key] = (keywordCapturedCounts[key] ?? 0) + 1;
  };
  for (const row of boughtToday) {
    if (row.matched_keyword) countFor(row.matched_keyword);
    try {
      for (const ruleId of JSON.parse(row.matched_rule_ids ?? "[]")) countFor(ruleId);
    } catch {
      // Unreadable ids only affect the per-keyword count.
    }
  }

  const rawRules = db
    .prepare("SELECT * FROM keyword_rules WHERE business_id = ? AND enabled = 1")
    .all(business.id);

  const keywordRules = rawRules.map((r) => {
    const countries = typeof r.countries === "string" ? JSON.parse(r.countries || "[]") : (r.countries ?? []);
    const states = typeof r.states === "string" ? JSON.parse(r.states || "[]") : (r.states ?? []);
    return {
      id: r.id,
      type: r.type ?? "positive",
      keyword: r.keyword,
      match_type: r.match_type ?? r.match ?? "contains",
      unit: r.unit ?? null,
      minimumQuantity: r.minimum_quantity ?? null,
      maxLeadsPerDay: r.max_leads_per_day ?? null,
      allowedCountries: countries,
      allowedStates: states,
      // The names the extension reads. Without them its per-keyword limits are silently ignored.
      minimum_quantity: r.minimum_quantity ?? null,
      max_leads_per_day: r.max_leads_per_day ?? null,
      allowed_countries: countries,
      allowed_states: states,
    };
  });

  return Response.json({
    business_id: business.id,
    version: 1,
    requested_at: Date.now(),
    // Tells the extension this server stores buyer_phone / buyer_email, so replaying saved contacts is safe.
    features: { buyer_contact_fields: true },
    today: {
      utc_date: utcToday,
      captured_count: capturedToday,
      keyword_captured_counts: keywordCapturedCounts,
    },
    settings: {
      daily_capture_limit: settings.daily_capture_limit ?? settings.daily_limit ?? 10,
      max_daily_capture_limit: 50,
      daily_limit: settings.daily_limit ?? 10,
      auto_buy: Boolean(settings.auto_buy),
      allowed_countries: settings.allowed_countries ?? [],
      allowed_states: settings.allowed_states ?? [],
      allowed_categories: settings.allowed_categories ?? [],
      blocked_categories: settings.blocked_categories ?? [],
      blocked_words: settings.blocked_words ?? [],
      min_quantity: settings.min_quantity ?? 0,
      require_email_verified: Boolean(settings.require_email_verified),
      require_phone_verified: Boolean(settings.require_phone_verified),
      require_gst_verified: Boolean(settings.require_gst_verified),
      min_buyer_member_months: settings.min_buyer_member_months ?? null,
      trusted_buyer_bypass: settings.trusted_buyer_bypass ?? true,
      any_contact_mode: settings.any_contact_mode ?? "off",
      email_mode: settings.email_mode ?? "off",
      phone_mode: settings.phone_mode ?? "off",
      include_retail_leads: settings.include_retail_leads ?? true,
      retail_quantity_threshold: settings.retail_quantity_threshold ?? null,
      negative_keyword_full_text: settings.negative_keyword_full_text ?? true,
      negative_keyword_stemming: settings.negative_keyword_stemming ?? true,
      max_lead_age_seconds: settings.max_lead_age_seconds ?? (settings.max_age_minutes ? settings.max_age_minutes * 60 : null),
    },
    keyword_rules: keywordRules,
  });
});
