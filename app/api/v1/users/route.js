import { db, newId, now, transaction } from "@/lib/server/db";
import { hashPassword, requireAdmin, requireUser, validatePassword } from "@/lib/server/auth";
import { HttpError, readJson, requireString, route } from "@/lib/server/http";
import { cleanRole, setUserBusinesses, userOut } from "@/lib/server/users";

export const GET = route(async () => {
  const user = await requireUser();
  requireAdmin(user);
  return Response.json(db.prepare("SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at").all(user.tenant_id).map(userOut));
});

export const POST = route(async (request) => {
  const actor = await requireUser();
  requireAdmin(actor);
  const body = await readJson(request);
  const email = requireString(body.email, "Email", { max: 200 }).toLowerCase();
  const displayName = requireString(body.display_name, "Full name", { max: 120 });
  const password = validatePassword(body.password);
  const role = cleanRole(body.role);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new HttpError(409, "email_taken", "An account with this email already exists.");
  }
  const id = newId("usr");
  transaction(() => {
    db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id, actor.tenant_id, email, hashPassword(password), displayName, role, now()
    );
    setUserBusinesses(actor, id, body.business_ids);
  });
  return Response.json(userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(id)), { status: 201 });
});
