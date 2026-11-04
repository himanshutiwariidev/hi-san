import { randomBytes } from "node:crypto";
import { db, newId, now } from "./db";
import { DEFAULT_FILTER_SETTINGS } from "./serializers";

export function newApiKey() {
  return `hsb_${randomBytes(24).toString("hex")}`;
}

export function createBusiness(tenantId, name) {
  const id = newId("biz");
  db.prepare("INSERT INTO businesses (id, tenant_id, name, api_key, filter_settings, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id, tenantId, name, newApiKey(), JSON.stringify(DEFAULT_FILTER_SETTINGS), now()
  );
  return db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
}
