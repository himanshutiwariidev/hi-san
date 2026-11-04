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

  const activeSystems = db
    .prepare("SELECT * FROM bot_presence WHERE business_id = ? ORDER BY last_seen DESC")
    .all(business.id);

  const systems = activeSystems.map((s) => ({
    this_device: s.device_id === deviceId,
    device_id: s.device_id,
    state: "running",
    user_name: user.display_name || user.email || "You",
    browser: "Chrome",
    os: "Mac",
    last_seen_at: new Date(s.last_seen || ts).toISOString(),
  }));

  if (systems.length === 0) {
    systems.push({
      this_device: true,
      device_id: deviceId,
      state: "running",
      user_name: user.display_name || user.email || "You",
      browser: "Chrome",
      os: "Mac",
      last_seen_at: new Date(ts).toISOString(),
    });
  }

  return Response.json({
    business_id: business.id,
    systems,
  });
});
