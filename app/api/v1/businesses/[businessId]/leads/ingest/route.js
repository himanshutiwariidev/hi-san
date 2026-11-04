import { db, newId, now, transaction } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { badRequest, readJson, route } from "@/lib/server/http";
import { dispatchLeadEvent } from "@/lib/server/webhooks";

export const POST = route(async (request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);

  const leads = body.leads;
  if (!Array.isArray(leads)) throw badRequest("leads must be an array.");

  const results = [];
  const events = [];

  transaction(() => {
    for (const item of leads) {
      const clientEventId = item.client_event_id ? String(item.client_event_id).trim() : null;
      const externalId = item.external_id || (clientEventId ? clientEventId.replace(/^im-ofr:/, "") : newId("ext"));
      const title = String(item.title ?? "").trim().slice(0, 300);
      if (!title) continue;

      const decision = item.decision === "captured" ? "captured" : "skipped";
      const status = decision === "captured" ? "retrieved" : "filtered";
      const filterReason = item.skip_reason ?? item.reason ?? (decision === "captured" ? null : "Filtered by rules");

      const existing = db
        .prepare("SELECT * FROM leads WHERE business_id = ? AND (external_id = ? OR client_event_id = ?)")
        .get(business.id, externalId, clientEventId);

      if (existing) {
        db.prepare(
          `UPDATE leads SET
            title = COALESCE(?, title),
            decision = ?,
            status = CASE WHEN status = 'retrieved' THEN 'retrieved' ELSE ? END,
            filter_reason = COALESCE(?, filter_reason)
           WHERE id = ?`
        ).run(title, decision, status, filterReason, existing.id);

        results.push({
          client_event_id: clientEventId || `im-ofr:${externalId}`,
          lead_id: existing.id,
          decision,
          reason: filterReason,
        });
        continue;
      }

      const id = newId("lead");
      const ts = now();
      const raw = JSON.stringify(item.raw_fields ?? item).slice(0, 10000);

      db.prepare(
        `INSERT INTO leads (
          id, business_id, external_id, client_event_id, title, category, quantity, unit,
          country_code, country_name, city, state, address,
          email_verified, phone_verified, gst_verified, has_whatsapp, buyer_member_months, is_retail,
          status, decision, filter_reason, matched_keyword, source_url, raw, received_at, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        business.id,
        externalId,
        clientEventId,
        title,
        item.category ? String(item.category).slice(0, 200) : null,
        item.quantity ? String(item.quantity).slice(0, 100) : null,
        item.unit ? String(item.unit).slice(0, 50) : null,
        item.country_iso ? String(item.country_iso).slice(0, 10) : null,
        item.country ? String(item.country).slice(0, 100) : null,
        item.city ? String(item.city).slice(0, 100) : null,
        item.state ? String(item.state).slice(0, 100) : null,
        item.address ? String(item.address).slice(0, 500) : null,
        item.email_verified ? 1 : 0,
        item.phone_verified ? 1 : 0,
        item.gst_verified ? 1 : 0,
        item.has_whatsapp ? 1 : 0,
        item.buyer_member_months ?? null,
        item.is_retail_flagged ? 1 : 0,
        status,
        decision,
        filterReason,
        item.matched_keyword ?? (item.matched_positive_rule_ids?.[0] ?? null),
        item.source_url ? String(item.source_url).slice(0, 500) : null,
        raw,
        ts,
        ts
      );

      db.prepare("INSERT INTO lead_logs (lead_id, at, message) VALUES (?, ?, ?)").run(
        id,
        ts,
        decision === "captured" ? "Auto-bought via fast network hook" : `Filtered: ${filterReason}`
      );

      results.push({
        client_event_id: clientEventId || `im-ofr:${externalId}`,
        lead_id: id,
        decision,
        reason: filterReason,
      });

      events.push(id);
    }
  });

  for (const id of events) {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
    if (lead) dispatchLeadEvent(business, lead);
  }

  return Response.json({ items: results });
});

