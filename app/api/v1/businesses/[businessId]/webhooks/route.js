import { db, newId, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { webhookOut } from "@/lib/server/serializers";
import { cleanWebhook } from "@/lib/server/webhookInput";

export const GET = route(async (_request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  return Response.json(db.prepare("SELECT * FROM webhooks WHERE business_id = ? ORDER BY created_at").all(business.id).map(webhookOut));
});

export const POST = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const hook = cleanWebhook(await readJson(request));
  const id = newId("wh");
  db.prepare(
    "INSERT INTO webhooks (id, business_id, name, url, method, secret, headers, events, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, business.id, hook.name, hook.url, hook.method, hook.secret, hook.headers, hook.events, hook.enabled, now());
  return Response.json(webhookOut(db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id)), { status: 201 });
});
