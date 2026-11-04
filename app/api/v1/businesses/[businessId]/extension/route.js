import { db } from "@/lib/server/db";
import { requireAdmin, requireBusiness, requireUser } from "@/lib/server/auth";
import { newApiKey } from "@/lib/server/businesses";
import { route } from "@/lib/server/http";

function out(business) {
  return { api_key: business.api_key, last_heartbeat: business.last_heartbeat, extension_version: business.extension_version };
}

export const GET = route(async (_request, { businessId }) => {
  return Response.json(out(requireBusiness(await requireUser(), businessId)));
});

// Rotates the API key; the old key stops working immediately.
export const POST = route(async (_request, { businessId }) => {
  const user = await requireUser();
  requireAdmin(user);
  const business = requireBusiness(user, businessId);
  const apiKey = newApiKey();
  db.prepare("UPDATE businesses SET api_key = ? WHERE id = ?").run(apiKey, business.id);
  return Response.json(out({ ...business, api_key: apiKey }));
});
