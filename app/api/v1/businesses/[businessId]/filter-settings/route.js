import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { DEFAULT_FILTER_SETTINGS, parseFilterSettings } from "@/lib/server/serializers";

export const GET = route(async (_request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  return Response.json(parseFilterSettings(business.filter_settings));
});

export const PUT = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const body = await readJson(request);
  const current = parseFilterSettings(business.filter_settings);
  const merged = { ...current, ...body };

  // Ensure sensible values
  merged.auto_buy = Boolean(merged.auto_buy);
  merged.daily_capture_limit = Math.max(1, Math.min(500, Number(merged.daily_capture_limit ?? merged.daily_limit) || 10));
  merged.daily_limit = merged.daily_capture_limit;
  merged.include_retail_leads = merged.include_retail_leads !== undefined ? Boolean(merged.include_retail_leads) : true;
  merged.trusted_buyer_bypass = merged.trusted_buyer_bypass !== undefined ? Boolean(merged.trusted_buyer_bypass) : true;

  db.prepare("UPDATE businesses SET filter_settings = ? WHERE id = ?").run(JSON.stringify(merged), business.id);
  return Response.json(merged);
});
