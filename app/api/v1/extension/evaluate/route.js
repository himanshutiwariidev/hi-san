import { evaluateBatch } from "@/lib/server/engine";
import { badRequest, readJson, route } from "@/lib/server/http";
import { requireExtensionBusiness } from "@/lib/server/extensionAuth";

// Body: { dry_run?: boolean, leads: [{ external_id, title, quantity, country, city, email_verified, phone_verified, ... }] }
export const POST = route(async (request) => {
  const business = requireExtensionBusiness(request);
  const { leads, dry_run } = await readJson(request);
  if (!Array.isArray(leads)) throw badRequest("leads must be an array.");
  return Response.json({ decisions: evaluateBatch(business, leads, { dryRun: Boolean(dry_run) }) });
});
