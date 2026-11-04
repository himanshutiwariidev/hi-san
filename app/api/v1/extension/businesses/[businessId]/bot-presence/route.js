import { db, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const GET = route(async (request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);
  const deviceId = new URL(request.url).searchParams.get("device_id") ?? "default";
  const ts = now();

  db.prepare(
    "INSERT OR REPLACE INTO bot_presence (business_id, device_id, status, last_seen) VALUES (?, ?, 'running', ?)"
  ).run(business.id, deviceId, ts);

  db.prepare("UPDATE businesses SET last_heartbeat = ? WHERE id = ?").run(ts, business.id);

  const activeCount = db
    .prepare("SELECT COUNT(*) n FROM bot_presence WHERE business_id = ?")
    .get(business.id).n;

  return Response.json({
    business_id: business.id,
    device_id: deviceId,
    status: "running",
    active_devices: Math.max(1, activeCount),
    last_seen: ts,
  });
});
