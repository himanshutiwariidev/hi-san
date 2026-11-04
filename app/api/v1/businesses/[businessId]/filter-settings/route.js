import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { DEFAULT_FILTER_SETTINGS, parseFilterSettings } from "@/lib/server/serializers";
import { countries } from "@/lib/countries";

const validCodes = new Set(countries.map((c) => c.code));
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

export const GET = route(async (_request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  return Response.json(parseFilterSettings(business.filter_settings));
});

export const PUT = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const body = await readJson(request);
  const settings = {
    auto_buy: Boolean(body.auto_buy ?? DEFAULT_FILTER_SETTINGS.auto_buy),
    daily_limit: int(body.daily_limit, 10000),
    allowed_countries: [...new Set((body.allowed_countries ?? []).filter((c) => validCodes.has(c)))],
    min_quantity: Math.max(0, Number(body.min_quantity) || 0),
    blocked_words: [...new Set((body.blocked_words ?? []).map((w) => String(w).trim().toLowerCase()).filter(Boolean))].slice(0, 200),
    require_email_verified: Boolean(body.require_email_verified),
    require_phone_verified: Boolean(body.require_phone_verified),
    max_age_minutes: int(body.max_age_minutes, 100000),
  };
  db.prepare("UPDATE businesses SET filter_settings = ? WHERE id = ?").run(JSON.stringify(settings), business.id);
  return Response.json(settings);
});
