// Boots the real production build against a throwaway SQLite file. Never talks to IndiaMART or the live site.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const ADMIN = { email: "test-admin@example.com", password: "test-password-123" };

export async function startServer(port, { seedDatabase } = {}) {
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Run `npm run build` before the integration tests.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hisan-test-"));
  const databasePath = path.join(dir, "test.db");
  seedDatabase?.(databasePath);
  const child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
      DATABASE_PATH: databasePath,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      INSECURE_COOKIES: "1",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}/api/v1`;
  const stop = () => {
    child.kill("SIGTERM");
    fs.rmSync(dir, { recursive: true, force: true });
  };
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const up = await fetch(`${base}/extension/poll-settings`).then(() => true, () => false);
    if (up) break;
    if (attempt === 99) {
      stop();
      throw new Error("Server did not start.");
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ADMIN),
  }).then((response) => response.json());
  const token = login.access_token;

  async function call(method, url, body) {
    const response = await fetch(base + url, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }

  return { call, stop, databasePath, businessId: login.default_business.id };
}
