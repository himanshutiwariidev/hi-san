import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { notFound, readJson, route } from "@/lib/server/http";

// IndiaMART can publish a lead's contact flags after the lead was first seen. The extension then sends them here.
export const PATCH = route(async (request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);

  const clientEventId = String(body.client_event_id ?? "").trim();
  const lead = clientEventId
    ? db.prepare("SELECT id FROM leads WHERE business_id = ? AND (client_event_id = ? OR external_id = ?)").get(business.id, clientEventId, clientEventId)
    : null;
  if (!lead) throw notFound("Lead not found.");

  const flag = (value) => (value ? 1 : 0);
  db.prepare(
    `UPDATE leads SET
      has_email = MAX(has_email, ?),
      has_phone = MAX(has_phone, ?),
      has_whatsapp = MAX(has_whatsapp, ?),
      email_verified = MAX(email_verified, ?),
      phone_verified = MAX(phone_verified, ?)
     WHERE id = ?`
  ).run(flag(body.has_email), flag(body.has_phone), flag(body.has_whatsapp), flag(body.email_verified), flag(body.phone_verified), lead.id);

  return Response.json({ ok: true });
});

