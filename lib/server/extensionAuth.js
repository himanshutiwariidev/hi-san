import { db, now } from "./db";
import { HttpError } from "./http";

// The extension authenticates with the business API key shown on the dashboard.
export function requireExtensionBusiness(request) {
  const key = request.headers.get("x-api-key");
  const business = key ? db.prepare("SELECT * FROM businesses WHERE api_key = ?").get(key) : null;
  if (!business) throw new HttpError(401, "invalid_api_key", "Invalid API key. Copy it again from the dashboard.");
  const version = request.headers.get("x-extension-version");
  db.prepare("UPDATE businesses SET last_heartbeat = ?, extension_version = COALESCE(?, extension_version) WHERE id = ?").run(now(), version, business.id);
  return business;
}
