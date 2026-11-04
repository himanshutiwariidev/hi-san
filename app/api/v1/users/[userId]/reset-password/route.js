import { db } from "@/lib/server/db";
import { hashPassword, requireAdmin, requireUser, validatePassword } from "@/lib/server/auth";
import { forbidden, readJson, route } from "@/lib/server/http";
import { findTenantUser } from "@/lib/server/users";

export const POST = route(async (request, { userId }) => {
  const actor = await requireUser();
  requireAdmin(actor);
  const user = findTenantUser(actor, userId);
  if (user.role === "owner" && actor.id !== user.id) throw forbidden("Only the owner can change the owner's password.");
  const { password } = await readJson(request);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(validatePassword(password)), user.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  return new Response(null, { status: 204 });
});
