import { db, newId, now } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const POST = route(async (request) => {
  await requireUser();
  const businessId = new URL(request.url).searchParams.get("business_id");
  const id = newId("inst");
  const ts = now();

  if (businessId) {
    db.prepare(
      "INSERT OR REPLACE INTO extension_installations (id, business_id, last_heartbeat, created_at) VALUES (?, ?, ?, ?)"
    ).run(id, businessId, ts, ts);
  }

  return Response.json({ id, business_id: businessId });
});
