import { db } from "@/lib/server/db";
import { accessibleBusinesses, createSession, publicUser, verifyPassword } from "@/lib/server/auth";
import { HttpError, readJson, route } from "@/lib/server/http";
import { businessOut } from "@/lib/server/serializers";

// ---------------------------------------------------------------------------
// Hardcoded super-admin credentials (set via environment variables).
// Defaults are for local development only — always override in production.
// ---------------------------------------------------------------------------
const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL    ?? "admin@hisan.com").trim().toLowerCase();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD ?? "Admin@1234").trim();

function validateLoginInput(body) {
  const email    = String(body.email    ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();

  if (!email) {
    throw new HttpError(400, "validation_error", "Email is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "validation_error", "Please enter a valid email address.");
  }
  if (!password) {
    throw new HttpError(400, "validation_error", "Password is required.");
  }
  if (password.length < 8) {
    throw new HttpError(400, "validation_error", "Password must be at least 8 characters.");
  }

  return { email, password };
}

export const POST = route(async (request) => {
  const body = await readJson(request);
  const { email, password } = validateLoginInput(body);

  // ── 1. Check hardcoded super-admin ──────────────────────────────────────
  if (email === ADMIN_EMAIL) {
    if (password !== ADMIN_PASSWORD) {
      throw new HttpError(401, "invalid_credentials", "Invalid email or password.");
    }
    const adminUser = {
      id:           "admin",
      tenant_id:    "admin",
      email:        ADMIN_EMAIL,
      display_name: "Super Admin",
      role:         "owner",
      created_at:   new Date().toISOString(),
      last_login:   new Date().toISOString(),
    };
    const token = await createSession("admin");
    const businesses = accessibleBusinesses(adminUser);
    const defaultBusiness = businesses[0] ? businessOut(businesses[0]) : null;
    return Response.json({
      access_token: token,
      token_type: "bearer",
      user: adminUser,
      default_business: defaultBusiness,
    });
  }

  // ── 2. Normal DB-based login ─────────────────────────────────────────────
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, "invalid_credentials", "Invalid email or password.");
  }
  const token = await createSession(user.id);
  const businesses = accessibleBusinesses(user);
  const defaultBusiness = businesses[0] ? businessOut(businesses[0]) : null;
  return Response.json({
    access_token: token,
    token_type: "bearer",
    user: publicUser(user),
    default_business: defaultBusiness,
  });
});
