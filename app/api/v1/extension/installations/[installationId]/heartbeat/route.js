import { db, now } from "@/lib/server/db";
import { route } from "@/lib/server/http";

const handleHeartbeat = async (request, { installationId }) => {
  const ts = now();
  const inst = db
    .prepare("SELECT business_id FROM extension_installations WHERE id = ?")
    .get(installationId);

  if (inst) {
    db.prepare("UPDATE extension_installations SET last_heartbeat = ? WHERE id = ?").run(ts, installationId);
    db.prepare("UPDATE businesses SET last_heartbeat = ? WHERE id = ?").run(ts, inst.business_id);
  }

  return Response.json({ ok: true, timestamp: ts });
};

export const POST = route(handleHeartbeat);
export const PATCH = route(handleHeartbeat);
