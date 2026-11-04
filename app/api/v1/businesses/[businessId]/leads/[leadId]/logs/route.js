import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { notFound, route } from "@/lib/server/http";

export const GET = route(async (_request, { businessId, leadId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  if (!db.prepare("SELECT 1 FROM leads WHERE id = ? AND business_id = ?").get(leadId, business.id)) throw notFound("Lead not found.");
  return Response.json(db.prepare("SELECT at, message FROM lead_logs WHERE lead_id = ? ORDER BY id").all(leadId));
});
