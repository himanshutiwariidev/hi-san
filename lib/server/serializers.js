import { countryName } from "@/lib/countries";

export const DEFAULT_FILTER_SETTINGS = {
  auto_buy: true,
  daily_limit: 10,
  allowed_countries: [],
  min_quantity: 0,
  blocked_words: [],
  require_email_verified: false,
  require_phone_verified: false,
  max_age_minutes: 0,
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
    title: row.title,
    category: row.category,
    quantity: row.quantity,
    country: { code: row.country_code ?? "", name: row.country_name ?? countryName(row.country_code) },
    city: row.city,
    buyer_name: row.buyer_name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    contacts: {
      email: contactState(row.email, row.email_verified),
      phone: contactState(row.phone, row.phone_verified),
      whatsapp: row.has_whatsapp ? "available" : "missing",
    },
    status: row.status,
    filter_reason: row.filter_reason,
    matched_keyword: row.matched_keyword,
    source_url: row.source_url,
    posted_text: row.posted_text,
    received_at: row.received_at,
    retrieved_at: row.retrieved_at,
  };
}

export function ruleOut(row) {
  return { id: row.id, keyword: row.keyword, match: row.match, countries: JSON.parse(row.countries), enabled: !!row.enabled, created_at: row.created_at };
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
