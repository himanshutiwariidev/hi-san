import { db, newId, now, transaction } from "@/lib/server/db";
import { createSession, hashPassword, publicUser, validatePassword } from "@/lib/server/auth";
import { createBusiness } from "@/lib/server/businesses";
import { HttpError, readJson, requireString, route } from "@/lib/server/http";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const email = requireString(body.email, "Email", { max: 200 }).toLowerCase();
  const password = validatePassword(body.password);
  const displayName = requireString(body.display_name, "Full name", { max: 120 });
  const tenantName = requireString(body.tenant_name, "Organization", { max: 120 });
  const businessName = requireString(body.business_name, "Business name", { max: 120 });

  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new HttpError(409, "email_taken", "An account with this email already exists.");
  }

  const user = transaction(() => {
    const tenantId = newId("ten");
    db.prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run(tenantId, tenantName, now());
    const userId = newId("usr");
    db.prepare(
      "INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, 'owner', ?)"
    ).run(userId, tenantId, email, hashPassword(password), displayName, now());
    createBusiness(tenantId, businessName);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  });

  await createSession(user.id);
  return Response.json({ user: publicUser(user) }, { status: 201 });
});
