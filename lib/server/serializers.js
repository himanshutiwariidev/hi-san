import { countryName } from "@/lib/countries";

export const DEFAULT_FILTER_SETTINGS = {
  auto_buy: true,
  daily_limit: 10,
  daily_capture_limit: 10,
  allowed_countries: [],
  allowed_states: [],
  allowed_categories: [],
  blocked_categories: [],
  min_quantity: 0,
  blocked_words: [],
  require_email_verified: false,
  require_phone_verified: false,
  require_gst_verified: false,
  min_buyer_member_months: null,
  trusted_buyer_bypass: true,
  any_contact_mode: "off",
  email_mode: "off",
  phone_mode: "off",
  include_retail_leads: true,
  retail_quantity_threshold: null,
  negative_keyword_full_text: true,
  negative_keyword_stemming: true,
  max_age_minutes: 0,
  max_lead_age_seconds: null,
};

export function parseFilterSettings(json) {
  try {
    return { ...DEFAULT_FILTER_SETTINGS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_FILTER_SETTINGS };
  }
}

function contactState(value, verified) {
  if (value) return verified ? "verified" : "available";
  return verified ? "verified" : "missing";
}

export function leadOut(row) {
  return {
    id: row.id,
    external_id: row.external_id,
    client_event_id: row.client_event_id ?? `im-ofr:${row.external_id}`,
    title: row.title,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit ?? "",
    country: { code: row.country_code ?? "", name: row.country_name ?? countryName(row.country_code) },
    city: row.city,
    state: row.state ?? "",
    address: row.address ?? "",
    buyer_name: row.buyer_name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    email_verified: Boolean(row.email_verified),
    phone_verified: Boolean(row.phone_verified),
    gst_verified: Boolean(row.gst_verified),
    buyer_member_months: row.buyer_member_months ?? null,
    is_retail: Boolean(row.is_retail),
    purchase_id: row.purchase_id ?? "",
    credit_balance: row.credit_balance ?? "",
    contacts: {
      email: contactState(row.email, row.email_verified),
      phone: contactState(row.phone, row.phone_verified),
      whatsapp: row.has_whatsapp ? "available" : "missing",
    },
    status: row.status,
    decision: row.decision ?? (row.status === "retrieved" ? "captured" : row.status),
    filter_reason: row.filter_reason,
    matched_keyword: row.matched_keyword,
    source_url: row.source_url,
    posted_text: row.posted_text,
    received_at: row.received_at,
    retrieved_at: row.retrieved_at,
  };
}

export function ruleOut(row) {
  const countries = typeof row.countries === "string" ? JSON.parse(row.countries || "[]") : (row.countries ?? []);
  const states = typeof row.states === "string" ? JSON.parse(row.states || "[]") : (row.states ?? []);
  return {
    id: row.id,
    type: row.type ?? "positive",
    keyword: row.keyword,
    match: row.match ?? row.match_type ?? "contains",
    match_type: row.match_type ?? row.match ?? "contains",
    unit: row.unit ?? null,
    minimum_quantity: row.minimum_quantity ?? null,
    max_leads_per_day: row.max_leads_per_day ?? null,
    countries,
    states,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
  };
}

export function webhookOut(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    method: row.method,
    has_secret: !!row.secret,
    headers: JSON.parse(row.headers),
    events: JSON.parse(row.events),
    enabled: !!row.enabled,
    last_status: row.last_status,
    last_delivery_at: row.last_delivery_at,
    last_error: row.last_error,
  };
}

export function businessOut(row, extra = {}) {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    last_heartbeat: row.last_heartbeat,
    extension_version: row.extension_version,
    ...extra,
  };
}
