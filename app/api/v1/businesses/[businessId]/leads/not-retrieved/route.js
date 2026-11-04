import { db, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";

export const POST = route(async (request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);

  const clientEventId = String(body.client_event_id ?? "").trim();
  const errorMsg = String(body.error ?? "Purchase failed").slice(0, 300);

  if (clientEventId) {
    const lead = db
      .prepare("SELECT * FROM leads WHERE business_id = ? AND (client_event_id = ? OR external_id = ?)")
      .get(business.id, clientEventId, clientEventId.replace(/^im-ofr:/, ""));

    if (lead) {
      db.prepare("UPDATE leads SET status = 'not_retrieved', filter_reason = ? WHERE id = ?").run(errorMsg, lead.id);
      db.prepare("INSERT INTO lead_logs (lead_id, at, message) VALUES (?, ?, ?)").run(lead.id, now(), `Not retrieved: ${errorMsg}`);
    }
  }

  return Response.json({ ok: true });
});

