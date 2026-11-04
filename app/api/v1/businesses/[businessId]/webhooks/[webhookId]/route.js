import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { notFound, readJson, route } from "@/lib/server/http";
import { webhookOut } from "@/lib/server/serializers";
import { cleanWebhook } from "@/lib/server/webhookInput";

function findWebhook(businessId, webhookId) {
  const hook = db.prepare("SELECT * FROM webhooks WHERE id = ? AND business_id = ?").get(webhookId, businessId);
  if (!hook) throw notFound("Webhook not found.");
  return hook;
}

export const PATCH = route(async (request, { businessId, webhookId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const existing = findWebhook(business.id, webhookId);
  const body = await readJson(request);
  const current = webhookOut(existing);
  const hook = cleanWebhook({ ...current, secret: existing.secret, ...body });
  db.prepare("UPDATE webhooks SET name = ?, url = ?, method = ?, secret = ?, headers = ?, events = ?, enabled = ? WHERE id = ?").run(
    hook.name, hook.url, hook.method, hook.secret, hook.headers, hook.events, hook.enabled, existing.id
  );
  return Response.json(webhookOut(findWebhook(business.id, webhookId)));
});

export const DELETE = route(async (_request, { businessId, webhookId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  findWebhook(business.id, webhookId);
  db.prepare("DELETE FROM webhooks WHERE id = ?").run(webhookId);
  return new Response(null, { status: 204 });
});
