// End-to-end lead lifecycle: real extension code produces each payload, the real server stores it.
import assert from "node:assert/strict";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { imBuyAnswer, imRow, loadContentScript, plain } from "./helpers/extension.mjs";
import { startServer } from "./helpers/server.mjs";

const { api: ext } = loadContentScript();
let server;
let business;
let hook;
let nextId = 91000000;
const delivered = [];

before(async () => {
  server = await startServer(3461);
  business = server.businessId;
  assert.equal((await server.call("POST", `/businesses/${business}/keyword-rules`, { keyword: "tadalafil", match: "contains" })).status, 201);
  assert.equal((await server.call("POST", `/businesses/${business}/keyword-rules`, { keyword: "veterinary", type: "negative", match: "contains" })).status, 201);
  const settings = await server.call("PUT", `/businesses/${business}/filter-settings`, {
    allowed_countries: ["us", "gb", "au"],
    daily_capture_limit: 10,
    email_mode: "off",
    phone_mode: "available",
    any_contact_mode: "off",
    trusted_buyer_bypass: false,
  });
  assert.equal(settings.status, 200);

  hook = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      delivered.push(JSON.parse(body));
      response.end("ok");
    });
  });
  await new Promise((resolve) => hook.listen(3463, "127.0.0.1", resolve));
  const created = await server.call("POST", `/businesses/${business}/webhooks`, {
    name: "Test CRM",
    url: "http://127.0.0.1:3463/hook",
    events: ["retrieved", "not_retrieved", "filtered"],
  });
  assert.ok(created.status < 300, JSON.stringify(created.data));
});

after(() => {
  hook?.close();
  server?.stop();
});

// What content-script.js and service-worker.js send to /leads/ingest for one row of the list.
async function capture(overrides = {}) {
  const config = (await server.call("GET", `/businesses/${business}/decision-config`)).data;
  const row = imRow({ ETO_OFR_ID: String(++nextId), ...overrides });
  const parsed = ext.parseBlApiRow(row);
  const lead = plain(ext.apiLeadToCapturedLead(parsed, "https://seller.indiamart.com/bltxn/?pref=relevant"));
  const local = ext.decideLeadLocally(lead, config, { captured: 0, keyword: {} });
  assert.ok(local, "the extension must reach a decision");
  if (local.decision === "skipped") local.explanation = ext.explainSkip(lead, config);
  const event = { ...lead, local_decision: plain(local), client_event_id: `${business}:${lead.client_event_id}` };
  return { parsed, event, local };
}

const ingest = async (event) => (await server.call("POST", `/businesses/${business}/leads/ingest`, { leads: [event] })).data.items[0];
const allLeads = async () => (await server.call("GET", `/businesses/${business}/leads?limit=5000`)).data;
const getLead = async (id) => (await allLeads()).find((lead) => lead.id === id);
const logs = async (id) => (await server.call("GET", `/businesses/${business}/leads/${id}/logs`)).data.map((entry) => entry.message);
const enrich = (id, payload) => server.call("PATCH", `/businesses/${business}/leads/${id}/enrichment`, payload);
const fail = (event, error) => server.call("POST", `/businesses/${business}/leads/not-retrieved`, { client_event_id: event.client_event_id, error });
const waitForHooks = () => new Promise((resolve) => setTimeout(resolve, 150));

function buyPayload(parsed, answer = imBuyAnswer()) {
  const outcome = ext.parseBuyResult(answer);
  assert.equal(outcome.kind, "bought");
  return plain(ext.enrichmentFromBuy(parsed, outcome, "https://seller.indiamart.com/bltxn/"));
}

test("a bought lead keeps the buyer's phone, email, company and address", async () => {
  const { parsed, event } = await capture();
  const item = await ingest(event);
  assert.equal((await enrich(item.lead_id, buyPayload(parsed))).status, 200);

  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "retrieved");
  assert.equal(lead.buyer_name, "Test Buyer");
  assert.equal(lead.phone, "+1 5550100123");
  assert.equal(lead.email, "buyer@example.com");
  assert.equal(lead.company, "Test Pharma LLC");
  assert.equal(lead.address, "1 Test Street");
  assert.equal(lead.city, "Austin");
  assert.equal(lead.state, "Texas");
  assert.equal(lead.purchase_id, "555001");
  assert.equal(lead.credit_balance, "42");
  assert.equal(lead.filter_reason, null);
  assert.deepEqual(plain(lead.reason), { code: "retrieved", label: "Successfully retrieved", group: "success", detail: null, also: [] });
  assert.ok((await logs(item.lead_id)).includes("Bought: buyer phone and email saved"));
});

test("a bought lead with no contact says so, and names the fields IndiaMART sent", async () => {
  const { parsed, event } = await capture();
  const item = await ingest(event);
  const noContacts = imBuyAnswer({ GLUSR_USR_PH_MOBILE: "", GLUSR_USR_EMAIL: "", GLUSR_USR_PH_COUNTRY: "" });
  await enrich(item.lead_id, buyPayload(parsed, noContacts));

  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "retrieved");
  assert.equal(lead.phone, null);
  assert.ok((await logs(item.lead_id)).some((message) => message.startsWith("Bought, but no phone or email was received (IndiaMART contact fields: none)")));
});

test("the contact field trace holds names only, never a phone or email", async () => {
  const { parsed } = await capture();
  const payload = buyPayload(parsed);
  assert.deepEqual(payload.contact_fields.sort(), ["GLUSR_USR_EMAIL", "GLUSR_USR_PH_COUNTRY", "GLUSR_USR_PH_MOBILE"]);
  assert.ok(!JSON.stringify(payload.contact_fields).includes("5550100123"));
});

test("a matched lead stays pending until the purchase is confirmed", async () => {
  const { event, local } = await capture();
  assert.equal(local.decision, "captured");
  const item = await ingest(event);
  assert.equal(item.decision, "captured", "the extension's retry logic depends on this echo");

  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "pending");
  assert.equal(lead.retrieved_at, null);
  assert.equal(lead.matched_keyword, "tadalafil");
  assert.equal(lead.reason.label, "Pending");
});

test("a lost purchase is recorded with IndiaMART's reason and its slot is released", async () => {
  const { event } = await capture();
  const item = await ingest(event);
  const message = "lost:Sorry, this Buylead expired just a minute ago. (posted 1.6 s before we saw it)";
  await fail(event, message);

  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "not_retrieved");
  assert.equal(lead.reason.code, "lost");
  assert.equal(lead.reason.label, "Expired or Sold Out");
  assert.equal(lead.reason.group, "indiamart");
  assert.match(lead.reason.detail, /expired just a minute ago/);
  assert.equal(lead.filter_reason, message, "the raw value stays available");
});

test("a technical failure is told apart from a business filter", async () => {
  const timedOut = await capture();
  const timedOutItem = await ingest(timedOut.event);
  await fail(timedOut.event, "buy_failed:bridge_timeout (buy sent 4 ms after)");
  const failed = await capture();
  const failedItem = await ingest(failed.event);
  await fail(failed.event, "buy_failed:HTTP 500");

  const timeout = await getLead(timedOutItem.lead_id);
  assert.equal(timeout.reason.label, "Retrieval Timeout");
  assert.equal(timeout.reason.group, "technical");
  const generic = await getLead(failedItem.lead_id);
  assert.equal(generic.reason.label, "Retrieval Failed");
  assert.equal(generic.reason.group, "technical");
});

test("raw IndiaMART answers are never shown as a reason detail", async () => {
  const { event } = await capture();
  const item = await ingest(event);
  await fail(event, 'contact_details_not_retrieved:{"GLUSR_USR_EMAIL":"secret@example.com"}');
  const lead = await getLead(item.lead_id);
  assert.equal(lead.reason.label, "Missing Contact Information");
  assert.equal(lead.reason.detail, null);
});

test("a country mismatch shows the exact reason", async () => {
  const { event, local } = await capture({ GLUSR_COUNTRY: "Nepal", FK_GL_COUNTRY_ISO: "NP" });
  assert.equal(local.skip_reason, "country_not_allowed");
  const item = await ingest(event);
  assert.equal(item.decision, "skipped");
  assert.equal(item.skip_reason, "country_not_allowed");

  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "filtered");
  assert.equal(lead.reason.label, "Country Mismatch");
  assert.equal(lead.reason.group, "filter");
  assert.equal(lead.reason.detail, "Nepal is not in your allowed countries");
  assert.ok((await logs(item.lead_id)).includes("Filtered: Country Mismatch"));
});

test("a keyword mismatch shows the exact reason", async () => {
  const { event, local } = await capture({ ETO_OFR_TITLE: "Steel Pipes" });
  assert.equal(local.skip_reason, "no_positive_keyword_match");
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.reason.label, "Keyword Mismatch");
  assert.equal(lead.reason.detail, "The title did not match any enabled keyword");
});

test("a contact mismatch names the missing contact", async () => {
  const { event, local } = await capture({ BY_LEAD_TYPE: 2, ETO_OFR_BUYER_IS_MOB_VERF: 0, ETO_OFR_ADDITIONAL_DETAILS: [{ is_whatsapp_active: 0 }] });
  assert.equal(local.skip_reason, "contact_requirement_not_met");
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.reason.label, "Contact Mismatch");
  assert.equal(lead.reason.detail, "Missing phone");
  assert.equal(lead.contacts.phone, "missing");
  assert.equal(lead.contacts.email, "verified");
});

test("an excluded keyword is named", async () => {
  const { event, local } = await capture({ ETO_OFR_TITLE: "Tadalafil Veterinary Tablets" });
  assert.equal(local.skip_reason, "negative_keyword_match");
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.reason.detail, 'Matched excluded keyword "veterinary"');
});

test("several failed conditions are all preserved", async () => {
  const { event } = await capture({ GLUSR_COUNTRY: "Nepal", FK_GL_COUNTRY_ISO: "NP", ETO_OFR_TITLE: "Steel Pipes" });
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.reason.label, "Country Mismatch");
  assert.deepEqual(plain(lead.reason.also), ["Keyword Mismatch"]);
});

test("a contact signal the buyer left is shown as available, not missing", async () => {
  const { event } = await capture({ BY_LEAD_TYPE: 3, ETO_OFR_BUYER_IS_MOB_VERF: 0, ETO_OFR_EMAIL_VERIFIED: 0 });
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.contacts.email, "available");
  assert.equal(lead.contacts.phone, "available");
});

test("contact flags that arrive late are stored", async () => {
  const { event } = await capture({ BY_LEAD_TYPE: 3, ETO_OFR_BUYER_IS_MOB_VERF: 0, ETO_OFR_EMAIL_VERIFIED: 0 });
  const item = await ingest(event);
  const answer = await server.call("PATCH", `/businesses/${business}/leads/contact-signals`, {
    client_event_id: event.client_event_id, has_phone: true, has_email: true, has_whatsapp: true, phone_verified: true, email_verified: false,
  });
  assert.equal(answer.status, 200);
  const lead = await getLead(item.lead_id);
  assert.equal(lead.contacts.phone, "verified");
  assert.equal(lead.contacts.whatsapp, "available");
  const missing = await server.call("PATCH", `/businesses/${business}/leads/contact-signals`, { client_event_id: "nope" });
  assert.equal(missing.status, 404, "the extension retries once on 404");
});

test("sending the same event twice creates one lead and undoes nothing", async () => {
  const { parsed, event } = await capture();
  const first = await ingest(event);
  await enrich(first.lead_id, buyPayload(parsed));
  const before = (await allLeads()).length;

  const again = await ingest(event);
  assert.equal(again.lead_id, first.lead_id);
  assert.equal(again.decision, "captured");
  assert.equal((await allLeads()).length, before, "no double counting");
  assert.equal((await getLead(first.lead_id)).status, "retrieved");

  const pending = await capture();
  const pendingItem = await ingest(pending.event);
  await fail(pending.event, "lost:gone");
  await ingest(pending.event);
  assert.equal((await getLead(pendingItem.lead_id)).status, "not_retrieved", "a resend must not hide a failure");
});

test("a confirmed purchase survives a late failure report", async () => {
  const { parsed, event } = await capture();
  const item = await ingest(event);
  await enrich(item.lead_id, buyPayload(parsed));
  await fail(event, "lost:reported late");
  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "retrieved");
  assert.equal(lead.phone, "+1 5550100123");
});

test("a purchase confirmed after a failure report wins, and clears the failure", async () => {
  const { parsed, event } = await capture();
  const item = await ingest(event);
  await fail(event, "buy_failed:bridge_timeout");
  await enrich(item.lead_id, buyPayload(parsed));
  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "retrieved");
  assert.equal(lead.filter_reason, null);
});

test("a filtered lead is decided again when it becomes eligible", async () => {
  const skipped = await capture({ ETO_OFR_TITLE: "Steel Pipes" });
  const item = await ingest(skipped.event);
  const captured = { ...skipped.event, local_decision: { decision: "captured", skip_reason: null, matched_positive_rule_ids: [] } };
  const again = await ingest(captured);
  assert.equal(again.decision, "captured");
  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "pending");
  assert.equal(lead.filter_reason, null);
});

test("a purchase nobody reported on becomes a Retrieval Timeout, and can still recover", async () => {
  const { parsed, event } = await capture();
  const item = await ingest(event);
  const db = new DatabaseSync(server.databasePath);
  db.prepare("UPDATE leads SET decided_at = ? WHERE id = ?").run(new Date(Date.now() - 16 * 60000).toISOString(), item.lead_id);
  db.close();

  const lead = await getLead(item.lead_id);
  assert.equal(lead.status, "not_retrieved");
  assert.equal(lead.reason.label, "Retrieval Timeout");

  await enrich(item.lead_id, buyPayload(parsed));
  assert.equal((await getLead(item.lead_id)).status, "retrieved");
});

test("replaying saved contacts restores them once, without repeat webhooks", async () => {
  const { parsed, event } = await capture();
  const item = await ingest(event);
  const payload = buyPayload(parsed);
  await enrich(item.lead_id, { ...payload, buyer_phone: undefined, buyer_email: undefined });
  await waitForHooks();
  const count = () => delivered.filter((entry) => entry.lead.id === item.lead_id).length;
  assert.equal(count(), 1);

  await enrich(item.lead_id, payload);
  await waitForHooks();
  assert.equal((await getLead(item.lead_id)).phone, "+1 5550100123");
  assert.equal(count(), 2, "the CRM gets the contacts it never received");

  await enrich(item.lead_id, payload);
  await waitForHooks();
  assert.equal(count(), 2, "a further resend is silent");
  const messages = await logs(item.lead_id);
  assert.equal(messages.filter((message) => message.startsWith("Bought:")).length, 1);
});

test("webhooks fire for failures and carry the reason", async () => {
  const { event } = await capture();
  const item = await ingest(event);
  await fail(event, "lost:gone");
  await waitForHooks();
  const entry = delivered.find((candidate) => candidate.lead.id === item.lead_id);
  assert.equal(entry.event, "lead.not_retrieved");
  assert.equal(entry.lead.reason.label, "Expired or Sold Out");
});

test("flags work for IndiaMART's codes, old records and unknown countries", async () => {
  const cases = [
    [{ GLUSR_COUNTRY: "USA", FK_GL_COUNTRY_ISO: "US" }, "us"],
    [{ GLUSR_COUNTRY: "UK", FK_GL_COUNTRY_ISO: "UK" }, "gb"],
    [{ GLUSR_COUNTRY: "Australia", FK_GL_COUNTRY_ISO: null }, "au"],
    [{ GLUSR_COUNTRY: "Atlantis", FK_GL_COUNTRY_ISO: "??" }, ""],
    [{ GLUSR_COUNTRY: null, FK_GL_COUNTRY_ISO: null }, ""],
  ];
  for (const [overrides, expected] of cases) {
    const { event } = await capture(overrides);
    const lead = await getLead((await ingest(event)).lead_id);
    assert.equal(lead.country.flag, expected, JSON.stringify(overrides));
  }
});

test("the raw country code stays in the API so webhook consumers see no change", async () => {
  const { event } = await capture({ GLUSR_COUNTRY: "UK", FK_GL_COUNTRY_ISO: "UK" });
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.country.code, "UK");
  assert.equal(lead.country.name, "UK");
});

test("records written before this fix are read correctly without any migration of their data", async () => {
  const db = new DatabaseSync(server.databasePath);
  const insert = db.prepare(
    `INSERT INTO leads (id, business_id, external_id, title, country_code, country_name, status, decision, filter_reason, buyer_name, received_at, decided_at)
     VALUES (?, ?, ?, 'Old lead', 'US', 'USA', ?, ?, ?, ?, ?, ?)`
  );
  const ts = new Date().toISOString();
  insert.run("lead_old_filtered", business, "old-1", "filtered", "skipped", "Filtered by rules", null, ts, ts);
  insert.run("lead_old_bought", business, "old-2", "retrieved", "captured", "Filtered by rules", "Old Buyer", ts, ts);
  insert.run("lead_old_lost", business, "old-3", "not_retrieved", "skipped", "lost:Sorry, this Buylead expired", null, ts, ts);
  insert.run("lead_old_engine", business, "old-4", "filtered", "skipped", "Blocked word: sample", null, ts, ts);
  db.close();

  const filtered = await getLead("lead_old_filtered");
  assert.equal(filtered.reason.label, "Reason Not Recorded");
  assert.equal(filtered.reason.group, "legacy");
  assert.equal(filtered.country.flag, "us");
  const bought = await getLead("lead_old_bought");
  assert.equal(bought.reason.label, "Successfully retrieved");
  assert.equal(bought.filter_reason, null);
  assert.equal((await getLead("lead_old_lost")).reason.label, "Expired or Sold Out");
  assert.equal((await getLead("lead_old_engine")).reason.label, "Blocked word: sample", "unknown text is shown as recorded");
});

test("the daily limit counts purchases in progress and frees failed ones", async () => {
  const today = async () => (await server.call("GET", `/businesses/${business}/decision-config`)).data.today.captured_count;
  const start = await today();
  const { event } = await capture();
  await ingest(event);
  assert.equal(await today(), start + 1);
  await fail(event, "lost:gone");
  assert.equal(await today(), start);
});

test("per-keyword limits are counted by rule id and every rule setting reaches the extension", async () => {
  const created = await server.call("POST", `/businesses/${business}/keyword-rules`, {
    keyword: "sildenafil", match: "contains", minimum_quantity: 5, max_leads_per_day: 2, countries: ["us"],
  });
  const config = (await server.call("GET", `/businesses/${business}/decision-config`)).data;
  const rule = config.keyword_rules.find((candidate) => candidate.id === created.data.id);
  assert.equal(rule.minimum_quantity, 5);
  assert.equal(rule.max_leads_per_day, 2);
  assert.deepEqual(plain(rule.allowed_countries), ["us"]);
  assert.equal(rule.minimumQuantity, 5, "the old names stay");
  assert.deepEqual(plain(rule.allowedCountries), ["us"]);

  const { event } = await capture({ ETO_OFR_TITLE: "Sildenafil Tablets", ENRICHMENTINFO: JSON.stringify({ a: [{ DESC: "Quantity", RESPONSE: "10 Piece" }] }) });
  const lead = await getLead((await ingest(event)).lead_id);
  assert.equal(lead.matched_keyword, "sildenafil");
  const counts = (await server.call("GET", `/businesses/${business}/decision-config`)).data.today.keyword_captured_counts;
  assert.equal(counts[created.data.id], 1);
  assert.equal(counts.sildenafil, 1);
});

test("the extension's limit check uses those counts and stops at the limit", async () => {
  const config = (await server.call("GET", `/businesses/${business}/decision-config`)).data;
  const rule = config.keyword_rules.find((candidate) => candidate.keyword === "sildenafil");
  const parsed = ext.parseBlApiRow(imRow({ ETO_OFR_ID: String(++nextId), ETO_OFR_TITLE: "Sildenafil Tablets", ENRICHMENTINFO: JSON.stringify({ a: [{ DESC: "Quantity", RESPONSE: "10 Piece" }] }) }));
  const lead = plain(ext.apiLeadToCapturedLead(parsed, "https://seller.indiamart.com/bltxn/"));
  assert.equal(ext.decideLeadLocally(lead, config, { captured: 0, keyword: { [rule.id]: 1 } }).decision, "captured");
  assert.equal(ext.decideLeadLocally(lead, config, { captured: 0, keyword: { [rule.id]: 2 } }).skip_reason, "keyword_daily_limit_reached");
});

test("a keyword limited to a minimum quantity is enforced", async () => {
  const { local } = await capture({ ETO_OFR_TITLE: "Sildenafil Tablets", ENRICHMENTINFO: JSON.stringify({ a: [{ DESC: "Quantity", RESPONSE: "1 Piece" }] }) });
  assert.equal(local.skip_reason, "quantity_below_minimum");
});

test("the totals always add up, with nothing counted twice", async () => {
  const leads = await allLeads();
  const by = (status) => leads.filter((lead) => lead.status === status).length;
  assert.equal(leads.length, by("retrieved") + by("filtered") + by("not_retrieved") + by("pending"));
  assert.equal(new Set(leads.map((lead) => lead.id)).size, leads.length);
  assert.equal(new Set(leads.map((lead) => lead.client_event_id)).size, leads.length);
  for (const lead of leads) {
    assert.ok(lead.reason?.label, `every lead explains itself: ${lead.id}`);
    if (lead.status === "retrieved") assert.equal(lead.reason.code, "retrieved");
    if (lead.status === "pending") assert.equal(lead.reason.code, "pending");
  }
});

test("existing endpoints keep their contract", async () => {
  const [lead] = await allLeads();
  for (const key of ["id", "external_id", "client_event_id", "title", "quantity", "unit", "city", "state", "address", "buyer_name", "company", "email", "phone", "contacts", "status", "decision", "filter_reason", "matched_keyword", "received_at", "retrieved_at"]) {
    assert.ok(key in lead, `lead.${key}`);
  }
  assert.deepEqual(Object.keys(lead.contacts).sort(), ["email", "phone", "whatsapp"]);
  for (const url of ["filter-settings", "entitlement", "extension", "webhooks", "keyword-rules"]) {
    assert.equal((await server.call("GET", `/businesses/${business}/${url}`)).status, 200, url);
  }
  assert.equal((await server.call("GET", "/extension/poll-settings")).data.poll_gap_ms, 7000, "polling speed is unchanged");
});
