import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { notFound, route } from "@/lib/server/http";
import { sendTestWebhook } from "@/lib/server/webhooks";

export const POST = route(async (_request, { businessId, webhookId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const hook = db.prepare("SELECT * FROM webhooks WHERE id = ? AND business_id = ?").get(webhookId, business.id);
  if (!hook) throw notFound("Webhook not found.");
  return Response.json(await sendTestWebhook(hook, business));
});
