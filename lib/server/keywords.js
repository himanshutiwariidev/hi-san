import { countries } from "@/lib/countries";
import { badRequest } from "./http";

const validCodes = new Set(countries.map((c) => c.code));

export function cleanRule(body) {
  const keyword = String(body.keyword ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!keyword) throw badRequest("Keyword is required.");
  if (keyword.length > 120) throw badRequest("Keyword is too long.");
  const type = body.type === "negative" ? "negative" : "positive";
  const match = body.match === "exact" || body.match_type === "exact" ? "exact" : "contains";
  const matchType = body.match_type ?? match;
  const unit = body.unit ? String(body.unit).trim().toLowerCase() : null;
  const minimumQuantity = body.minimumQuantity != null || body.minimum_quantity != null ? Number(body.minimumQuantity ?? body.minimum_quantity) : null;
  const maxLeadsPerDay = body.maxLeadsPerDay != null || body.max_leads_per_day != null ? Number(body.maxLeadsPerDay ?? body.max_leads_per_day) : null;
  const ruleCountries = [...new Set((body.countries ?? body.allowedCountries ?? []).filter((c) => validCodes.has(c)))];
  const ruleStates = [...new Set(body.states ?? body.allowedStates ?? [])];

  return {
    keyword,
    type,
    match,
    match_type: matchType,
    unit,
    minimum_quantity: Number.isFinite(minimumQuantity) ? minimumQuantity : null,
    max_leads_per_day: Number.isFinite(maxLeadsPerDay) ? maxLeadsPerDay : null,
    countries: ruleCountries,
    states: ruleStates,
  };
}
