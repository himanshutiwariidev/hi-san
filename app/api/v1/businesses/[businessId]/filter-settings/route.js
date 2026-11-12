import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { MAX_DAILY_CAPTURE_LIMIT, parseFilterSettings } from "@/lib/server/serializers";

// The limit's range goes out with the settings, so the dashboard and the extension popup offer the same one.
const withLimitRange = (settings) => ({ ...settings, max_daily_capture_limit: MAX_DAILY_CAPTURE_LIMIT });

// The dashboard edits daily_limit and the extension edits daily_capture_limit, and each sends the other's old
// value along. The one that differs from what is stored is the one the person changed.
function requestedDailyLimit(body, current) {
  const stored = Number(current.daily_capture_limit ?? current.daily_limit) || 10;
  const changed = ["daily_capture_limit", "daily_limit"].find((key) => body[key] !== undefined && body[key] !== null && Number(body[key]) !== stored);
  const wanted = changed ? Math.round(Number(body[changed])) : stored;
  // Anything outside the range a person can pick (0, a negative, text) leaves the limit as it was.
  return Number.isFinite(wanted) && wanted >= 1 ? Math.min(MAX_DAILY_CAPTURE_LIMIT, wanted) : Math.min(MAX_DAILY_CAPTURE_LIMIT, stored);
}

export const GET = route(async (_request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  return Response.json(withLimitRange(parseFilterSettings(business.filter_settings)));
});

export const PUT = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const body = await readJson(request);
  const current = parseFilterSettings(business.filter_settings);
  const merged = { ...current, ...body };

  // Ensure sensible values
  merged.auto_buy = Boolean(merged.auto_buy);
  merged.daily_capture_limit = requestedDailyLimit(body, current);
  merged.daily_limit = merged.daily_capture_limit;
  delete merged.max_daily_capture_limit;
  merged.include_retail_leads = merged.include_retail_leads !== undefined ? Boolean(merged.include_retail_leads) : true;
  merged.trusted_buyer_bypass = merged.trusted_buyer_bypass !== undefined ? Boolean(merged.trusted_buyer_bypass) : true;

  db.prepare("UPDATE businesses SET filter_settings = ? WHERE id = ?").run(JSON.stringify(merged), business.id);
  return Response.json(withLimitRange(merged));
});
