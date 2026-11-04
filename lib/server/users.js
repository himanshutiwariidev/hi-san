import { db } from "./db";
import { badRequest, notFound } from "./http";
import { publicUser } from "./auth";

export function userOut(user) {
  const businesses = db.prepare("SELECT business_id FROM user_businesses WHERE user_id = ?").all(user.id).map((r) => r.business_id);
  return { ...publicUser(user), businesses };
}

export function findTenantUser(actor, userId) {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").get(userId, actor.tenant_id);
  if (!user) throw notFound("User not found.");
  return user;
}

export function setUserBusinesses(actor, userId, businessIds) {
  const valid = new Set(db.prepare("SELECT id FROM businesses WHERE tenant_id = ?").all(actor.tenant_id).map((b) => b.id));
  const ids = [...new Set(businessIds ?? [])].filter((id) => valid.has(id));
  db.prepare("DELETE FROM user_businesses WHERE user_id = ?").run(userId);
  const insert = db.prepare("INSERT INTO user_businesses (user_id, business_id) VALUES (?, ?)");
  for (const id of ids) insert.run(userId, id);
}

export function cleanRole(role) {
  if (role !== "admin" && role !== "member") throw badRequest("Role must be admin or member.");
  return role;
}
