import { db } from "@/lib/server/db";
import { publicUser, requireUser } from "@/lib/server/auth";
import { readJson, requireString, route } from "@/lib/server/http";

export const GET = route(async () => {
  const user = await requireUser();
  const tenant = db.prepare("SELECT name FROM tenants WHERE id = ?").get(user.tenant_id);
  return Response.json({ ...publicUser(user), tenant_name: tenant?.name });
});

export const PATCH = route(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  const displayName = requireString(body.display_name, "Full name", { max: 120 });
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, user.id);
  return Response.json(publicUser({ ...user, display_name: displayName }));
});
