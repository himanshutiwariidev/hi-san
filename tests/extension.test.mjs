// Extension behaviour, run against the shipped bundle with a fake browser and a fake IndiaMART.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { imBuyAnswer, imRow, loadContentScript, plain, readBundle } from "./helpers/extension.mjs";

const baseConfig = (settings = {}, rules = [{ id: "r1", type: "positive", keyword: "tadalafil", match_type: "contains" }]) => ({
  business_id: "biz",
  version: 1,
  requested_at: 1,
  today: { utc_date: new Date().toISOString().slice(0, 10), captured_count: 0, keyword_captured_counts: {} },
  settings: {
    allowed_countries: [],
    daily_capture_limit: 10,
    max_daily_capture_limit: 50,
    any_contact_mode: "off",
    email_mode: "off",
    phone_mode: "off",
    include_retail_leads: true,
    ...settings,
  },
  keyword_rules: rules,
});

// A tab on the BuyLeads page: records what reaches the service worker and which buys are attempted.
function makeTab({ config = baseConfig(), pollerStarted = true } = {}) {
  const sent = [];
  const buys = [];
  const storage = {};
  const chrome = {
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return { accepted: message.leads?.length ?? 0, stored: true };
      },
    },
    storage: {
      local: {
        get: (keys, done) => {
          const out = { ...storage };
          if (done) done(out);
          return Promise.resolve(out);
        },
        set: async (values) => Object.assign(storage, values),
      },
    },
  };
  const window = {
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
    clearTimeout,
    location: { href: "https://seller.indiamart.com/bltxn/?pref=relevant", pathname: "/bltxn/" },
    addEventListener: () => void 0,
    dispatchEvent: (event) => {
      const request = JSON.parse(event.detail);
      if (request.type !== "IM_BL_BUY") return;
      buys.push(request.payload);
      const answer = tab.buyAnswer ?? imBuyAnswer();
      const { json, ...result } = answer;
      const detail = `${JSON.stringify({ requestId: request.requestId, result })}\n${JSON.stringify(json)}`;
      queueMicrotask(() => tab.listeners.forEach((listener) => listener({ detail })));
    },
  };
  window.addEventListener = (type, listener) => {
    if (type === "im-leads-bridge-response") tab.listeners.push(listener);
  };
  const { api } = loadContentScript({ chrome, window, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  const tab = { api, sent, buys, storage, config, listeners: [], buyAnswer: null };
  api.setState("storedMarkersLoaded", true);
  api.setState("apiPollerStarted", pollerStarted);
  api.setState("captureState", { authSession: { access_token: "t", default_business: { id: "biz" } }, selectedBusinessId: "biz", botEnabled: true, decisionConfig: config });
  tab.recorded = () => sent.filter((message) => message.type === "INDIAMART_LEADS_CAPTURED").flatMap((message) => message.leads);
  tab.parse = (row) => api.parseBlApiRow(row);
  return tab;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

test("throttle reset: the mechanism is still there and still runs once per page load", () => {
  const source = readBundle("content-script.js");
  assert.match(source, /function resetRealtimeThrottle\(storage = safeLocalStorage\(\), now = Date\.now\(\)\)/);
  assert.equal(source.match(/resetRealtimeThrottle\(\);/g).length, 1);
  assert.match(source, /var XMPP_MINUTE_LIMIT = 15;/);
});

test("throttle reset: it clears a full window and leaves a live one alone", () => {
  const { api } = loadContentScript();
  const now = 1_000_000;
  const store = (value) => {
    let saved = JSON.stringify(value);
    return { getItem: () => saved, setItem: (_key, next) => (saved = next), read: () => JSON.parse(saved) };
  };
  const full = store({ a: { minuteCount: 15, minuteTimestamp: now - 1000 } });
  assert.equal(api.resetRealtimeThrottle(full, now), true);
  assert.equal(full.read().a.minuteCount, 0);

  const live = store({ a: { minuteCount: 3, minuteTimestamp: now - 1000 } });
  assert.equal(api.resetRealtimeThrottle(live, now), false);
  assert.equal(live.read().a.minuteCount, 3);

  const rolled = store({ a: { minuteCount: 3, minuteTimestamp: now - 61000 } });
  assert.equal(api.resetRealtimeThrottle(rolled, now), true);
});

test("detection: the bot starts on /bltxn with or without the trailing slash", () => {
  const { api } = loadContentScript();
  for (const path of ["/bltxn", "/bltxn/", "/bltxn/default"]) assert.equal(api.isBuyLeadPath(path), true, path);
  for (const path of ["/", "/bltxnfoo", "/messagecentre/bltxn"]) assert.equal(api.isBuyLeadPath(path), false, path);
  const manifest = JSON.parse(readBundle("manifest.json"));
  const hook = manifest.content_scripts.find((entry) => entry.js.includes("page-network-hook.js"));
  assert.deepEqual(hook.matches, ["https://seller.indiamart.com/bltxn*"]);
});

test("detection: a lead in the page's own list is recorded", async () => {
  const tab = makeTab();
  await tab.api.decideArrivedLeads(tab.api.parseBlDisplayData({ DisplayList: [imRow({ ETO_OFR_ID: "70001" })] }), "page");
  await settle();
  assert.deepEqual(tab.recorded().map((lead) => lead.client_event_id), ["im-ofr:70001"]);
});

test("detection: a lead pushed over the realtime channel is recorded and bought", async () => {
  const tab = makeTab();
  const body = JSON.stringify(JSON.stringify(imRow({ ETO_OFR_ID: "70002" }))).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const message = `<message from="a@b/realtime_bl"><body>${body}</body></message>`;
  const leads = tab.api.parseRealtimeLeadMessage(message);
  assert.equal(leads.length, 1);
  await tab.api.decideArrivedLeads(leads, "push");
  await settle();
  assert.equal(tab.recorded()[0].local_decision.decision, "captured");
  assert.equal(tab.buys.length, 1);
});

test("detection: a pushed lead held back for its contact flags is still recorded if it vanishes from the list", async () => {
  const config = baseConfig({ phone_mode: "available" });
  const tab = makeTab({ config });
  const row = imRow({ ETO_OFR_ID: "70003", ETO_OFR_BUYER_IS_MOB_VERF: undefined, ETO_OFR_EMAIL_VERIFIED: undefined, BY_LEAD_TYPE: undefined, ETO_OFR_ADDITIONAL_DETAILS: undefined });
  const lead = tab.parse(row);
  tab.api.decidePolledLeads([lead], "biz", config, "push");
  await settle();
  assert.equal(tab.recorded().length, 0, "held back while IndiaMART may still send the flags");

  tab.api.sweepDeferredLeads("biz", config, Date.now() + 1000);
  await settle();
  assert.equal(tab.recorded().length, 0, "not due yet");

  tab.api.sweepDeferredLeads("biz", config, Date.now() + 21000);
  await settle();
  assert.equal(tab.recorded().length, 1, "the lead is not lost");
  assert.equal(tab.recorded()[0].local_decision.skip_reason, "contact_requirement_not_met");
});

test("detection: a polled lead held back for its contact flags is still recorded if it vanishes from the list", async () => {
  const config = baseConfig({ phone_mode: "available" });
  const tab = makeTab({ config });
  const lead = tab.parse(imRow({ ETO_OFR_ID: "70015", ETO_OFR_BUYER_IS_MOB_VERF: undefined, ETO_OFR_EMAIL_VERIFIED: undefined, BY_LEAD_TYPE: undefined, ETO_OFR_ADDITIONAL_DETAILS: undefined }));
  tab.api.decidePolledLeads([lead], "biz", config, "poll");
  await settle();
  assert.equal(tab.recorded().length, 0, "held back while IndiaMART may still send the flags");
  tab.api.sweepDeferredLeads("biz", config, Date.now() + 21000);
  await settle();
  assert.equal(tab.recorded().length, 1);
  assert.equal(tab.recorded()[0].local_decision.skip_reason, "contact_requirement_not_met");
});

test("detection: a held-back lead the list confirms in time is recorded once", async () => {
  const config = baseConfig({ phone_mode: "available" });
  const tab = makeTab({ config });
  const unknown = tab.parse(imRow({ ETO_OFR_ID: "70004", ETO_OFR_BUYER_IS_MOB_VERF: undefined, ETO_OFR_EMAIL_VERIFIED: undefined, BY_LEAD_TYPE: undefined }));
  tab.api.decidePolledLeads([unknown], "biz", config, "push");
  const known = tab.parse(imRow({ ETO_OFR_ID: "70004" }));
  tab.api.decidePolledLeads([known], "biz", config, "poll");
  await settle();
  tab.api.sweepDeferredLeads("biz", config, Date.now() + 21000);
  await settle();
  assert.equal(tab.recorded().length, 1);
  assert.equal(tab.buys.length, 1);
});

test("detection: a stale filter config holds a lead back rather than losing it", async () => {
  const stale = baseConfig();
  stale.today.utc_date = "2000-01-01";
  const tab = makeTab({ config: stale });
  const lead = tab.parse(imRow({ ETO_OFR_ID: "70005" }));
  tab.api.decidePolledLeads([lead], "biz", stale, "poll");
  await settle();
  assert.equal(tab.recorded().length, 0);
  assert.equal(tab.api.alreadyDecided(lead), false, "the next poll decides it");
  const fresh = baseConfig();
  tab.api.decidePolledLeads([lead], "biz", fresh, "poll");
  await settle();
  assert.equal(tab.recorded().length, 1);
});

test("detection: closed rows are found, expired-list rows and open rows are not", () => {
  const { api } = loadContentScript();
  const payload = {
    DisplayList: [
      imRow({ ETO_OFR_ID: "1", PURCHASE_STATUS: "OPEN" }),
      imRow({ ETO_OFR_ID: "2", PURCHASE_STATUS: "SOLD" }),
      imRow({ ETO_OFR_ID: "3", PURCHASE_STATUS: "SOLD", DATATYPE: "expiredlead" }),
      imRow({ ETO_OFR_ID: "4", PURCHASE_STATUS: "CLOSED", DATATYPE: undefined }),
      imRow({ ETO_OFR_ID: "5", PURCHASE_STATUS: "SOLD", ETO_OFR_TITLE: "" }),
      null,
    ],
  };
  assert.deepEqual(plain(api.parseBlClosedLeads(payload).map((lead) => [lead.ofr_id, lead.closed_status])), [["2", "SOLD"], ["4", "CLOSED"]]);
  assert.deepEqual(plain(api.parseBlDisplayData(payload).map((lead) => lead.ofr_id)), ["1"], "what can be bought is unchanged");
});

test("detection: a closed lead is recorded once, never bought, and can still be judged if it reopens", async () => {
  const tab = makeTab();
  const closedRow = imRow({ ETO_OFR_ID: "70006", PURCHASE_STATUS: "SOLD" });
  const track = tab.api.getState("trackClosedLeads");
  await track({ DisplayList: [closedRow] });
  await track({ DisplayList: [closedRow] });
  await settle();
  assert.equal(tab.recorded().length, 1);
  assert.equal(tab.recorded()[0].local_decision.skip_reason, "lead_not_open");
  assert.equal(tab.recorded()[0].local_decision.explanation.indiamart_status, "SOLD");
  assert.equal(tab.buys.length, 0);

  const reopened = tab.parse(imRow({ ETO_OFR_ID: "70006" }));
  assert.equal(tab.api.alreadyDecided(reopened), false);
});

test("retrieval: one lead is bought once, however many times it is seen", async () => {
  const tab = makeTab();
  const lead = tab.parse(imRow({ ETO_OFR_ID: "70007" }));
  tab.api.decidePolledLeads([lead], "biz", tab.config, "poll");
  tab.api.decidePolledLeads([lead], "biz", tab.config, "push");
  tab.api.decidePolledLeads([lead], "biz", tab.config, "poll");
  await settle();
  assert.equal(tab.buys.length, 1);
  assert.equal(tab.recorded().length, 1);
});

test("retrieval: only the tab that holds the poll lock buys", async () => {
  const other = makeTab();
  other.api.setState("pollLock", { owner: "another-tab", at: Date.now() });
  assert.equal(other.api.canBuyInThisTab(), false);
  const lead = other.parse(imRow({ ETO_OFR_ID: "70008" }));
  other.api.decidePolledLeads([lead], "biz", other.config, "push");
  await settle();
  assert.equal(other.buys.length, 0, "no duplicate purchase request");
  assert.equal(other.recorded().length, 1, "still recorded");

  const stale = makeTab();
  stale.api.setState("pollLock", { owner: "another-tab", at: Date.now() - 46000 });
  assert.equal(stale.api.canBuyInThisTab(), true, "a dead tab does not block buying");
});

test("retrieval: a tab without the page hook does not attempt a buy that can only time out", async () => {
  const tab = makeTab({ pollerStarted: false });
  assert.equal(tab.api.canBuyInThisTab(), false);
  tab.api.decidePolledLeads([tab.parse(imRow({ ETO_OFR_ID: "70009" }))], "biz", tab.config, "push");
  await settle();
  assert.equal(tab.buys.length, 0);
  assert.equal(tab.recorded().length, 1);
});

test("retrieval: the bridge waits longer than the page hook's worst case", () => {
  const source = readBundle("content-script.js");
  const hook = readBundle("page-network-hook.js");
  const bridgeMs = Number(/BRIDGE_RESPONSE_TIMEOUT_MS = (\de\d)/.exec(source)[1]);
  const budgetMs = Number(/REQUEST_BUDGET_MAX_WAIT_MS = (\d+e\d)/.exec(hook)[1]);
  const fetchMs = Number(/BRIDGE_TIMEOUT_MS = (\d+e\d)/.exec(hook)[1]);
  assert.ok(bridgeMs > budgetMs + fetchMs, `${bridgeMs} > ${budgetMs} + ${fetchMs}`);
});

test("retrieval: a lead that has finally failed is not bought again after a reload", async () => {
  const tab = makeTab();
  const marker = { client_event_id: "im-ofr:70010", business_id: "biz", decision: "captured", synced_at: new Date().toISOString() };
  assert.equal(tab.api.shouldAutoEnrichMarker(marker), true);
  await tab.api.recordEnrichmentAttempt(marker, "lost:gone", Number.POSITIVE_INFINITY, true);
  assert.equal(tab.api.shouldAutoEnrichMarker(marker), false);
  assert.ok(tab.storage.enrichedLeadIds["im-ofr:70010"], "survives a reload");
});

test("retrieval: a temporary failure is retried, not given up on", async () => {
  const tab = makeTab();
  const marker = { client_event_id: "im-ofr:70011", business_id: "biz", decision: "captured", synced_at: new Date().toISOString() };
  await tab.api.recordEnrichmentAttempt(marker, "buy_failed:HTTP 500", void 0, true);
  assert.equal(tab.api.shouldAutoEnrichMarker(marker, Date.now() + 2500), true);
  assert.equal(tab.sent.at(-1).final, false);
});

test("safety: fresh buys respect the concurrency limit and all complete", async () => {
  const { api } = loadContentScript();
  const queue = api.createBuyQueue(3);
  let active = 0;
  let peak = 0;
  const task = () => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return "done";
  };
  const results = await Promise.all(Array.from({ length: 7 }, () => queue.enqueue(task(), "fresh")));
  assert.equal(peak, 3);
  assert.deepEqual(plain(results), Array(7).fill("done"));
});

test("safety: pausing stops queued buys instead of sending them", async () => {
  const { api } = loadContentScript();
  let now = 1000;
  const queue = api.createBuyQueue(1, () => now);
  let release;
  const first = queue.enqueue(() => new Promise((resolve) => (release = resolve)), "fresh");
  const second = queue.enqueue(async () => "sent", "fresh");
  assert.equal(queue.queued, 1);
  queue.pause(5000);
  assert.equal(await second, null);
  release("first");
  assert.equal(await first, "first");
  assert.equal(await queue.enqueue(async () => "sent", "fresh"), null, "nothing new starts while paused");
  now = 6000;
  assert.equal(await queue.enqueue(async () => "sent", "fresh"), "sent");
});

test("safety: 429, 403 and 503 all stop the bot", () => {
  const { api } = loadContentScript();
  for (const status of [429, 403, 503]) {
    assert.equal(api.isPollRateLimited({ status, retryAfterSeconds: null }), true, `poll ${status}`);
    assert.equal(api.parseBuyResult({ ok: false, status, retryAfterSeconds: null, json: null }).kind, "rate_limited", `buy ${status}`);
  }
  assert.equal(api.isPollRateLimited({ status: 200, retryAfterSeconds: null }), false);
  assert.equal(api.isPollRateLimited({ status: 500, retryAfterSeconds: null }), false);
  assert.equal(api.isPollRateLimited({ status: 200, retryAfterSeconds: 30 }), true);
});

test("safety: IndiaMART's warning text is treated as a restriction", () => {
  const { api } = loadContentScript();
  const answer = { ok: true, status: 200, retryAfterSeconds: null, json: { Status: "Failure", MESSAGE: "Unusual activity detected, temporarily blocked" } };
  assert.equal(api.parseBuyResult(answer).kind, "rate_limited");
});

test("safety: the pause grows with repeated pushback and honours Retry-After", () => {
  const { api } = loadContentScript();
  const now = 10_000_000;
  const first = api.nextSafetyBrake(null, "x", null, now);
  assert.equal(first.until - now, 120000);
  const second = api.nextSafetyBrake(first, "x", null, now + 1000);
  assert.equal(second.until - (now + 1000), 300000);
  const third = api.nextSafetyBrake(second, "x", null, now + 2000);
  assert.equal(third.until - (now + 2000), 900000);
  assert.equal(api.nextSafetyBrake(null, "x", 1800, now).until - now, 1800000);
});

test("safety: nothing is bought while the brake is on, and the lead waits", async () => {
  const tab = makeTab();
  tab.api.setState("safetyBrake", { until: Date.now() + 60000, step: 0, tripped_at: Date.now(), reason: "x" });
  tab.api.decidePolledLeads([tab.parse(imRow({ ETO_OFR_ID: "70012" }))], "biz", tab.config, "poll");
  await settle();
  assert.equal(tab.buys.length, 0);
  assert.equal(tab.recorded().length, 1, "recorded as pending, not dropped");
  assert.equal(tab.recorded()[0].local_decision.decision, "captured");
});

test("safety: request limits and polling speed are unchanged", () => {
  const source = readBundle("content-script.js");
  const hook = readBundle("page-network-hook.js");
  assert.match(source, /var POLL_GAP_MS = 7e3;/);
  assert.match(source, /var MAX_POLLS_IN_FLIGHT = 1;/);
  assert.match(source, /var BUY_CONCURRENCY = 3;/);
  assert.match(hook, /var LIST_REQUESTS_PER_MINUTE = 8;/);
  assert.match(hook, /var BUY_REQUESTS_PER_MINUTE = 12;/);
  assert.match(hook, /var POLL_PAGE_SIZE = 50;/);
});

test("reasons: explaining a skip never changes the decision", () => {
  const { api } = loadContentScript();
  const config = baseConfig({ allowed_countries: ["us"], phone_mode: "verified" }, [{ id: "n", type: "negative", keyword: "pipes", match_type: "contains" }]);
  const parsed = api.parseBlApiRow(imRow({ ETO_OFR_TITLE: "Steel Pipes", GLUSR_COUNTRY: "Nepal", FK_GL_COUNTRY_ISO: "NP", ETO_OFR_BUYER_IS_MOB_VERF: 0 }));
  const lead = plain(api.apiLeadToCapturedLead(parsed, "https://x"));
  const before = plain(api.classifyLeadLocally(lead, config));
  const explanation = plain(api.explainSkip(lead, config));
  assert.deepEqual(plain(api.classifyLeadLocally(lead, config)), before);
  assert.equal(before.skip_reason, explanation.reasons[0], "the first reason is the deciding one");
  assert.deepEqual(explanation.reasons, ["country_not_allowed", "contact_requirement_not_met", "negative_keyword_match", "no_positive_keyword_match"]);
  assert.equal(explanation.excluded_keyword, "pipes");
  assert.deepEqual(explanation.missing_contacts, ["verified phone"]);
});

test("reasons: a skipped lead reaches the service worker with its explanation", async () => {
  const config = baseConfig({ allowed_countries: ["us"] });
  const tab = makeTab({ config });
  tab.api.decidePolledLeads([tab.parse(imRow({ ETO_OFR_ID: "70016", ETO_OFR_TITLE: "Steel Pipes", GLUSR_COUNTRY: "Nepal", FK_GL_COUNTRY_ISO: "NP" }))], "biz", config, "poll");
  await settle();
  const decision = tab.recorded()[0].local_decision;
  assert.equal(decision.skip_reason, "country_not_allowed");
  assert.deepEqual(plain(decision.explanation.reasons), ["country_not_allowed", "no_positive_keyword_match"]);
});

test("reasons: a broken config cannot break a decision", () => {
  const { api } = loadContentScript();
  assert.equal(api.explainSkip({ title: "x" }, { settings: null }), null);
});

test("a buy with contacts sends them to the service worker in the fields the server reads", async () => {
  const tab = makeTab();
  tab.api.decidePolledLeads([tab.parse(imRow({ ETO_OFR_ID: "70013" }))], "biz", tab.config, "poll");
  await settle();
  const enriched = tab.sent.find((message) => message.type === "INDIAMART_LEAD_ENRICHED");
  assert.equal(enriched.enrichment.buyer_phone, "+1 5550100123");
  assert.equal(enriched.enrichment.buyer_email, "buyer@example.com");
  assert.equal(enriched.enrichment.purchase_id, "555001");
  assert.equal(enriched.enrichment.requirement_fields.Company, "Test Pharma LLC");
});

test("a lost buy is reported as a final failure", async () => {
  const tab = makeTab();
  tab.buyAnswer = { ok: true, status: 200, retryAfterSeconds: null, json: { Flag: "7", MESSAGE: "Sorry, this Buylead expired just a minute ago." } };
  tab.api.decidePolledLeads([tab.parse(imRow({ ETO_OFR_ID: "70014" }))], "biz", tab.config, "poll");
  await settle();
  const failure = tab.sent.find((message) => message.type === "INDIAMART_LEAD_ENRICHMENT_FAILED");
  assert.equal(failure.final, true);
  assert.match(failure.error, /^lost:Sorry, this Buylead expired/);
});

test("service worker: saved contacts are replayed once, and only to a server that can store them", async () => {
  const source = readBundle("service-worker.js");
  const replaySource = source.slice(source.indexOf("var CONTACT_REPLAY_DONE_KEY"), source.indexOf("async function syncPollSettings()"));
  const storage = {};
  const transitions = [];
  let syncs = 0;
  const records = [{ enrichment_id: "a" }, { enrichment_id: "b" }];
  const outboxDb = { enrichments: { where: () => ({ equals: () => ({ toArray: async () => records }) }) } };
  const chrome = { storage: { local: { get: async () => storage, set: async (values) => Object.assign(storage, values) } } };
  const replay = new Function("chrome", "outboxDb", "transitionLeadEnrichment", "syncPendingLeadEnrichments", `${replaySource}; return replaySavedBuyerContacts;`)(
    chrome, outboxDb, async (_db, id, state) => transitions.push([id, state]), () => (syncs += 1)
  );

  assert.equal(await replay(), 2);
  assert.deepEqual(transitions, [["a", "PENDING"], ["b", "PENDING"]]);
  assert.equal(syncs, 1);
  assert.equal(storage.buyerContactReplayDone.count, 2);
  assert.equal(await replay(), 0, "never twice");
  assert.equal(transitions.length, 2);
  assert.match(source, /if \(config\.features\?\.buyer_contact_fields\) \{\s+void replaySavedBuyerContacts/);
});

test("the zip users download is the current extension", () => {
  for (const file of ["manifest.json", "content-script.js", "service-worker.js", "page-network-hook.js", "popup.js", "sidepanel.js"]) {
    const zipped = execFileSync("unzip", ["-p", "public/hi-san-bot-extension.zip", file], { maxBuffer: 8 * 1024 * 1024 }).toString("utf8");
    assert.equal(zipped === readBundle(file), true, `${file} in the zip differs from extension/. Rebuild the zip.`);
  }
});
