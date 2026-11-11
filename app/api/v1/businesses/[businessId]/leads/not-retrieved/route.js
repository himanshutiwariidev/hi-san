import { db, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { dispatchLeadEvent } from "@/lib/server/webhooks";

export const POST = route(async (request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);

  const clientEventId = String(body.client_event_id ?? "").trim();
  const rawEventId = clientEventId.includes(":") ? clientEventId.slice(clientEventId.indexOf(":") + 1) : clientEventId;
  const errorMsg = String(body.error ?? "Purchase failed").slice(0, 300);

  if (clientEventId) {
    const lead = db
      .prepare(
        "SELECT * FROM leads WHERE business_id = ? AND (client_event_id = ? OR client_event_id = ? OR external_id = ?)"
      )
      .get(business.id, clientEventId, rawEventId, rawEventId.replace(/^im-ofr:/, ""));

    // A confirmed purchase stays retrieved even if a failed attempt is reported after it.
    if (lead && lead.status !== "retrieved") {
      db.prepare("UPDATE leads SET status = 'not_retrieved', filter_reason = ?, reason_detail = NULL WHERE id = ?").run(errorMsg, lead.id);
      db.prepare("INSERT INTO lead_logs (lead_id, at, message) VALUES (?, ?, ?)").run(lead.id, now(), `Not retrieved: ${errorMsg}`);
      dispatchLeadEvent(business, db.prepare("SELECT * FROM leads WHERE id = ?").get(lead.id));
    }
  }

  return Response.json({ ok: true });
});
