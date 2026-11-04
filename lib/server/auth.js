import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db, now } from "./db";
import { createBusiness } from "./businesses";
import { HttpError, forbidden, notFound } from "./http";

export const SESSION_COOKIE = "im_leads_auth";
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = stored.split("$");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new HttpError(400, "weak_password", "Password must be at least 8 characters.");
  }
  return password;
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);

  if (userId === "admin") {
    // Super-admin has no DB row — temporarily disable FK checks so we can
    // store a sentinel "admin" token without a matching users row.
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.prepare("INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, "admin", expires.toISOString());
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  } else {
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires.toISOString());
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(now(), userId);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });

  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  store.delete(SESSION_COOKIE);
}

export function publicUser(user) {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

export async function requireUser() {
  let token = null;
  try {
    const reqHeaders = await headers();
    const auth = reqHeaders.get("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      token = auth.slice(7).trim();
    }
  } catch {
    // headers() might throw outside request context
  }

  if (!token) {
    const store = await cookies();
    token = store.get(SESSION_COOKIE)?.value;
  }

  if (!token) throw new HttpError(401, "unauthenticated", "Please log in again.");

  // Check if this is a super-admin session (no DB user row).
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?").get(token, now());
  if (!session) throw new HttpError(401, "unauthenticated", "Please log in again.");

  if (session.user_id === "admin") {
    const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@hisan.com").trim().toLowerCase();
    return {
      id:           "admin",
      tenant_id:    "admin",
      email:        adminEmail,
      display_name: "Super Admin",
      role:         "owner",
      created_at:   new Date().toISOString(),
      last_login:   new Date().toISOString(),
    };
  }

  const user = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now());
  if (!user) throw new HttpError(401, "unauthenticated", "Please log in again.");
  return user;
}

export function requireAdmin(user) {
  if (user.role === "member") throw forbidden("Only owners and admins can do this.");
}

export function accessibleBusinesses(user) {
  if (user.id === "admin") {
    db.prepare("INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES ('admin', 'Main Organization', ?)").run(now());
    let all = db.prepare("SELECT * FROM businesses ORDER BY created_at").all();
    if (all.length === 0) {
      createBusiness("admin", "Default Business");
      all = db.prepare("SELECT * FROM businesses ORDER BY created_at").all();
    }
    return all;
  }
  if (user.role === "member") {
    return db
      .prepare(
        `SELECT b.* FROM businesses b JOIN user_businesses ub ON ub.business_id = b.id
         WHERE ub.user_id = ? ORDER BY b.created_at`
      )
      .all(user.id);
  }
  return db.prepare("SELECT * FROM businesses WHERE tenant_id = ? ORDER BY created_at").all(user.tenant_id);
}

export function requireBusiness(user, businessId) {
  const business = accessibleBusinesses(user).find((b) => b.id === businessId);
  if (!business) throw notFound("Business not found.");
  return business;
}
