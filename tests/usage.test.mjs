// Usage by date: what each business bought on one Indian calendar day.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { startServer } from "./helpers/server.mjs";

let server;
let first;
let second;
const ist = (text) => new Date(`${text}+05:30`).toISOString();

before(async () => {
  server = await startServer(3464);
  first = server.businessId;
  second = (await server.call("POST", "/businesses", { name: "Second Shop" })).data.id;
  const db = new DatabaseSync(server.databasePath);
  const add = db.prepare("INSERT INTO leads (id, business_id, external_id, title, status, decision, received_at, decided_at) VALUES (?, ?, ?, 'Lead', ?, 'captured', ?, ?)");
  const rows = [
    [first, "retrieved", "2026-11-17T00:00:00"],
    [first, "retrieved", "2026-11-17T09:30:00"],
    [first, "not_retrieved", "2026-11-17T10:00:00"],
    [first, "filtered", "2026-11-17T11:00:00"],
    [first, "pending", "2026-11-17T23:59:59"],
    [first, "retrieved", "2026-11-16T23:59:59"],
    [first, "retrieved", "2026-11-18T00:00:00"],
    [second, "retrieved", "2026-11-17T05:00:00"],
    [second, "filtered", "2026-11-17T05:29:59"],
  ];
  rows.forEach(([business, status, time], index) => add.run(`usage_${index}`, business, `usage-${index}`, status, ist(time), ist(time)));
  db.close();
});

after(() => server?.stop());

const usage = (date) => server.call("GET", `/usage${date === undefined ? "" : `?date=${date}`}`);
const row = (answer, id) => answer.data.businesses.find((entry) => entry.business_id === id);

test("a day counts from midnight to midnight India time, per business", async () => {
  const answer = await usage("2026-11-17");
  assert.equal(answer.status, 200);
  assert.equal(answer.data.start, "2026-11-16T18:30:00.000Z");
  assert.equal(answer.data.end, "2026-11-17T18:30:00.000Z");
  assert.deepEqual(row(answer, first), { business_id: first, name: "Default Business", retrieved: 2, pending: 1, not_retrieved: 1, filtered: 1, total: 5 });
  assert.deepEqual(row(answer, second), { business_id: second, name: "Second Shop", retrieved: 1, pending: 0, not_retrieved: 0, filtered: 1, total: 2 });
});

test("the neighbouring days get the purchases just either side of midnight", async () => {
  assert.equal(row(await usage("2026-11-16"), first).retrieved, 1, "23:59:59 on the 16th");
  assert.equal(row(await usage("2026-11-18"), first).retrieved, 1, "00:00:00 on the 18th");
  assert.deepEqual(row(await usage("2025-01-01"), second), { business_id: second, name: "Second Shop", retrieved: 0, pending: 0, not_retrieved: 0, filtered: 0, total: 0 });
});

test("without a date it is today in India", async () => {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const answer = await usage();
  assert.equal(answer.status, 200);
  assert.equal(answer.data.date, today);
});

test("a date that is not a real calendar date is refused", async () => {
  for (const bad of ["2026-02-30", "17-11-2026", "2026-11-17T00:00", "yesterday", "2026-13-01"]) {
    assert.equal((await usage(encodeURIComponent(bad))).status, 400, bad);
  }
});

test("a member sees only the businesses they are assigned to, and only signed-in users see anything", async () => {
  await server.call("POST", "/users", { email: "usage-member@example.com", display_name: "Member", password: "member-pass-123", role: "member", business_ids: [second] });
  const base = server.databasePath ? `http://127.0.0.1:3464/api/v1` : "";
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "usage-member@example.com", password: "member-pass-123" }) }).then((r) => r.json());
  const answer = await fetch(`${base}/usage?date=2026-11-17`, { headers: { authorization: `Bearer ${login.access_token}` } }).then((r) => r.json());
  assert.deepEqual(answer.businesses.map((entry) => entry.name), ["Second Shop"]);
  assert.equal((await fetch(`${base}/usage?date=2026-11-17`)).status, 401);
});

test("reading usage changes nothing", async () => {
  const db = new DatabaseSync(server.databasePath, { readOnly: true });
  const snapshot = () => JSON.stringify(db.prepare("SELECT id, status, received_at FROM leads ORDER BY id").all());
  const before = snapshot();
  await usage("2026-11-17");
  await usage();
  assert.equal(snapshot(), before);
  db.close();
});
