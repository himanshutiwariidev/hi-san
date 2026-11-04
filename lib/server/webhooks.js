import { createHmac } from "node:crypto";
import { db, now } from "./db";
import { leadOut } from "./serializers";

async function deliver(hook, payload) {
  const body = JSON.stringify(payload);
  const headers = { "content-type": "application/json", "x-hisan-event": payload.event, ...JSON.parse(hook.headers) };
  if (hook.secret) headers["x-hisan-signature"] = `sha256=${createHmac("sha256", hook.secret).update(body).digest("hex")}`;

  let status = null;
  let error = null;
  try {
    const response = await fetch(hook.url, { method: hook.method, headers, body, signal: AbortSignal.timeout(10000) });
    status = response.status;
    if (!response.ok) error = `HTTP ${response.status}`;
  } catch (err) {
    error = err.name === "TimeoutError" ? "Timed out after 10s" : err.message;
  }
  db.prepare("UPDATE webhooks SET last_status = ?, last_error = ?, last_delivery_at = ? WHERE id = ?").run(status, error, now(), hook.id);
  return { status, error };
}

export function buildPayload(event, business, leadRow) {
  return { event, sent_at: now(), business: { id: business.id, name: business.name }, lead: leadOut(leadRow) };
}

// Fire-and-forget: webhook latency must not slow down the extension.
export function dispatchLeadEvent(business, leadRow) {
  const hooks = db.prepare("SELECT * FROM webhooks WHERE business_id = ? AND enabled = 1").all(business.id);
  const event = `lead.${leadRow.status}`;
  for (const hook of hooks) {
    if (!JSON.parse(hook.events).includes(leadRow.status)) continue;
    deliver(hook, buildPayload(event, business, leadRow)).catch(() => {});
  }
}

export function sendTestWebhook(hook, business) {
  const sample = {
    id: "lead_test",
    external_id: "test",
    title: "Test lead: Basmati Rice",
    category: "Rice",
    quantity: "10 Metric Ton",
    country_code: "ae",
    country_name: "United Arab Emirates",
    city: "Dubai",
    buyer_name: "Test Buyer",
    company: "Test Imports LLC",
    email: "buyer@example.com",
    phone: "+971 50 000 0000",
    email_verified: 1,
    phone_verified: 1,
    has_whatsapp: 1,
    status: "retrieved",
    received_at: now(),
    retrieved_at: now(),
  };
  return deliver(hook, buildPayload("lead.test", business, sample));
}
