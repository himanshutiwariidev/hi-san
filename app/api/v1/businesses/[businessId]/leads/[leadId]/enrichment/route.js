import { db, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { notFound, readJson, route } from "@/lib/server/http";
import { leadOut } from "@/lib/server/serializers";
import { dispatchLeadEvent } from "@/lib/server/webhooks";

export const PATCH = route(async (request, { businessId, leadId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);

  // leadId can be our backend ID or a client_event_id
  const lead = db
    .prepare("SELECT * FROM leads WHERE business_id = ? AND (id = ? OR client_event_id = ? OR external_id = ?)")
    .get(business.id, leadId, leadId, leadId.replace(/^im-ofr:/, ""));

  if (!lead) throw notFound("Lead not found.");

  const str = (v, max = 250) => (v ? String(v).trim().slice(0, max) : null);

  db.prepare(
    `UPDATE leads SET
      buyer_name = COALESCE(?, buyer_name),
      company = COALESCE(?, company),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      state = COALESCE(?, state),
      country_name = COALESCE(?, country_name),
      purchase_id = COALESCE(?, purchase_id),
      credit_balance = COALESCE(?, credit_balance),
      has_whatsapp = CASE WHEN ? = 1 THEN 1 ELSE has_whatsapp END,
      status = 'retrieved',
      decision = 'captured',
      retrieved_at = COALESCE(retrieved_at, ?)
     WHERE id = ?`
  ).run(
    str(body.buyer_name ?? body.name),
    str(body.company),
    str(body.phone, 50),
    str(body.email),
    str(body.address, 500),
    str(body.city, 100),
    str(body.state, 100),
    str(body.country, 100),
    str(body.purchase_id ?? body.purchaseId, 100),
    str(body.credit_balance ?? body.creditBalance, 100),
    body.has_whatsapp ? 1 : 0,
    now(),
    lead.id
  );

  db.prepare("INSERT INTO lead_logs (lead_id, at, message) VALUES (?, ?, ?)").run(
    lead.id,
    now(),
    "Buyer contact details enriched from IndiaMART purchase response"
  );

  const updated = db.prepare("SELECT * FROM leads WHERE id = ?").get(lead.id);
  dispatchLeadEvent(business, updated);

  return Response.json(leadOut(updated));
});
