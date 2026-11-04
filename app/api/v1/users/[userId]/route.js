import { db, transaction } from "@/lib/server/db";
import { requireAdmin, requireUser } from "@/lib/server/auth";
import { forbidden, readJson, route } from "@/lib/server/http";
import { cleanRole, findTenantUser, setUserBusinesses, userOut } from "@/lib/server/users";

export const PATCH = route(async (request, { userId }) => {
  const actor = await requireUser();
  requireAdmin(actor);
  const user = findTenantUser(actor, userId);
  if (user.role === "owner") throw forbidden("The owner account cannot be changed here.");
  const body = await readJson(request);
  transaction(() => {
    if (body.role) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(cleanRole(body.role), user.id);
    if (body.business_ids) setUserBusinesses(actor, user.id, body.business_ids);
  });
  return Response.json(userOut(findTenantUser(actor, userId)));
});

export const DELETE = route(async (_request, { userId }) => {
  const actor = await requireUser();
  requireAdmin(actor);
  const user = findTenantUser(actor, userId);
  if (user.role === "owner") throw forbidden("The owner account cannot be removed.");
  if (user.id === actor.id) throw forbidden("You cannot remove yourself.");
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  return new Response(null, { status: 204 });
});
