import { db, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";

export const POST = route(async (request, { businessId, leadId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);

  const cleanId = String(leadId).trim();
  const rawEventId = cleanId.includes(":") ? cleanId.slice(cleanId.indexOf(":") + 1) : cleanId;

  const lead = db
    .prepare(
      "SELECT * FROM leads WHERE business_id = ? AND (id = ? OR client_event_id = ? OR client_event_id = ? OR external_id = ?)"
    )
    .get(business.id, cleanId, cleanId, rawEventId, rawEventId.replace(/^im-ofr:/, ""));

  if (lead) {
    const error = String(body.error ?? "Enrichment failed").slice(0, 300);
    const attempt = Number(body.attempt) || 1;
    db.prepare("INSERT INTO lead_logs (lead_id, at, message) VALUES (?, ?, ?)").run(
      lead.id,
      now(),
      `Enrichment attempt ${attempt} failed: ${error}`
    );
  }

  return Response.json({ ok: true });
});

