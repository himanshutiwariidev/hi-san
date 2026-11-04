import { countries } from "@/lib/countries";
import { badRequest } from "./http";

const validCodes = new Set(countries.map((c) => c.code));

export function cleanRule(body) {
  const keyword = String(body.keyword ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!keyword) throw badRequest("Keyword is required.");
  if (keyword.length > 120) throw badRequest("Keyword is too long.");
  const match = body.match === "exact" ? "exact" : "contains";
  const ruleCountries = [...new Set((body.countries ?? []).filter((c) => validCodes.has(c)))];
  return { keyword, match, countries: ruleCountries };
}
