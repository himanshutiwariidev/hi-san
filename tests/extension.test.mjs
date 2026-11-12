// Extension behaviour, run against the shipped bundle with a fake browser and a fake IndiaMART.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { channelNames, imBuyAnswer, imRow, loadContentScript, loadPageHook, plain, readBundle } from "./helpers/extension.mjs";

const channels = channelNames();
// What every extension built from the same engine used before, and what Supermine still uses.
const SHARED_NAMES = { request: "im-leads-bridge-request", response: "im-leads-bridge-response", pageData: "im-leads-page-hook" };

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
  const storageListeners = [];
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
      onChanged: { addListener: (listener) => storageListeners.push(listener) },
    },
  };
  const window = {
    setTimeout: (fn, ms) => {
      const timer = setTimeout(fn, Math.min(ms, 5));
      timer.unref();
      return timer;
    },
    clearTimeout,
    location: { href: "https://seller.indiamart.com/bltxn/?pref=relevant", pathname: "/bltxn/" },
    addEventListener: () => void 0,
    dispatchEvent: (event) => {
      const request = JSON.parse(event.detail);
      if (request.type === "IM_BL_FETCH") {
        tab.answerList = (rows) => tab.listeners.forEach((listener) => listener({ detail: `${JSON.stringify({ requestId: request.requestId, result: { ok: true, status: 200, retryAfterSeconds: null, durationMs: 5 } })}\n${JSON.stringify({ DisplayList: rows })}` }));
        return;
      }
      if (request.type !== "IM_BL_BUY") return;
      buys.push(request.payload);
      const answer = tab.buyAnswer ?? imBuyAnswer();
      const { json, ...result } = answer;
      const detail = `${JSON.stringify({ requestId: request.requestId, result })}\n${JSON.stringify(json)}`;
      queueMicrotask(() => tab.listeners.forEach((listener) => listener({ detail })));
    },
  };
  window.addEventListener = (type, listener) => {
    if (type === channels.response) tab.listeners.push(listener);
    if (type === "message") tab.messageListeners.push(listener);
  };
  const { api } = loadContentScript({ chrome, window, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  const tab = { api, sent, buys, storage, config, listeners: [], messageListeners: [], buyAnswer: null, window };
  // What chrome.storage does when the service worker saves a newer value.
  tab.storageChanged = (changes) => storageListeners.forEach((listener) => listener(Object.fromEntries(Object.entries(changes).map(([key, newValue]) => [key, { newValue }])), "local"));
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
  const timing = enriched.enrichment.buy_timing;
  assert.equal(timing.retry, false);
  for (const key of ["seen_to_sent_ms", "decide_ms", "slot_wait_ms", "answer_ms"]) assert.ok(Number.isInteger(timing[key]) && timing[key] >= 0 && timing[key] < 1000, `${key}: ${timing[key]}`);
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

test("the dashboard's download link names the version that is in the zip", async () => {
  const { EXTENSION_VERSION, EXTENSION_DOWNLOAD_URL } = await import("../lib/version.js");
  const zipped = JSON.parse(execFileSync("unzip", ["-p", "public/hi-san-bot-extension.zip", "manifest.json"]).toString("utf8"));
  assert.equal(EXTENSION_VERSION, zipped.version, "update EXTENSION_VERSION in lib/version.js when the extension changes");
  assert.equal(EXTENSION_VERSION, JSON.parse(readBundle("manifest.json")).version);
  assert.equal(EXTENSION_DOWNLOAD_URL, `/hi-san-bot-extension.zip?v=${zipped.version}`);
});

test("the zip users download is the current extension", () => {
  for (const file of ["manifest.json", "content-script.js", "service-worker.js", "page-network-hook.js", "popup.js", "sidepanel.js"]) {
    const zipped = execFileSync("unzip", ["-p", "public/hi-san-bot-extension.zip", file], { maxBuffer: 8 * 1024 * 1024 }).toString("utf8");
    assert.equal(zipped === readBundle(file), true, `${file} in the zip differs from extension/. Rebuild the zip.`);
  }
});

test("channels: the content script and the page script use the same names, and nobody else's", () => {
  const hook = channelNames("page-network-hook.js");
  assert.deepEqual(hook, channels);
  for (const [key, name] of Object.entries(channels)) {
    assert.ok(name, key);
    assert.notEqual(name, SHARED_NAMES[key], `${key} is still the name other extensions use`);
  }
  for (const file of ["content-script.js", "page-network-hook.js"]) {
    for (const name of Object.values(SHARED_NAMES)) assert.equal(readBundle(file).includes(name), false, `${file} still uses ${name}`);
  }
});

test("channels: the page script runs our purchase once and ignores another extension's request", async () => {
  const hook = loadPageHook();
  hook.request(SHARED_NAMES.request, "IM_BL_BUY", { ofrid: "501", ofrtitle: "x" });
  hook.request(SHARED_NAMES.request, "IM_BL_FETCH");
  await settle();
  assert.equal(hook.sent.length, 0, "a request from another extension must not reach IndiaMART through us");

  hook.request(channels.request, "IM_BL_BUY", { ofrid: "502", ofrtitle: "x" });
  await settle();
  assert.equal(hook.sent.length, 1);
  assert.match(hook.sent[0].url, /contactBuyNow$/);
  assert.equal(hook.sent[0].body.ofrid, "502");
  assert.equal(hook.sent[0].body.glusrId, "123456");
});

test("channels: the content script ignores lead lists posted by another extension's page script", async () => {
  const tab = makeTab();
  tab.api.startPageDataListener();
  const post = (source) => tab.messageListeners.forEach((listener) => listener({ source: tab.window, data: { source, type: "IM_BL_DISPLAY_DATA", status: 200, payload: { DisplayList: [imRow({ ETO_OFR_ID: source === channels.pageData ? "70021" : "70020" })] } } }));
  post(SHARED_NAMES.pageData);
  await settle();
  assert.equal(tab.recorded().length, 0);
  post(channels.pageData);
  await settle();
  assert.deepEqual(tab.recorded().map((lead) => lead.client_event_id), ["im-ofr:70021"]);
});

// The matching rule exactly as it was before the speed-up: one pattern per word, built up front.
function referenceMatcher(keyword, matchType, stemmed, negative) {
  const normalize = (value) => (value ?? "").toLowerCase().split(/\s+/u).filter(Boolean).join(" ");
  const WORD = "[\\p{L}\\p{N}_]";
  const SUFFIX = "(?:ings|ing|ers|er|als|al|ed|es|s)?";
  const STOP = new Set(["and", "are", "but", "for", "from", "has", "have", "into", "its", "not", "our", "the", "this", "that", "was", "with", "you"]);
  const pattern = (word, suffix = "") => new RegExp(`(?<!${WORD})${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${suffix}(?!${WORD})`, "u");
  const normalized = normalize(keyword);
  if (!normalized) return null;
  if (matchType === "contains") {
    if (negative) return (text) => text.includes(normalized);
    const kept = normalized.split(" ").filter((word) => word.length >= 3 && !STOP.has(word));
    const words = (kept.length ? [...new Set(kept)] : [normalized]).map((word) => pattern(word));
    return (text) => words.some((one) => one.test(text));
  }
  if (matchType === "all_words") {
    const words = normalized.split(" ").map((word) => pattern(word, stemmed ? SUFFIX : ""));
    return (text) => words.every((one) => one.test(text));
  }
  const whole = pattern(normalized, stemmed ? SUFFIX : "");
  return (text) => whole.test(text);
}

test("speed: the faster keyword check gives exactly the same answer as before, for every match type", () => {
  const { api } = loadContentScript();
  const pieces = ["tadalafil", "tadalafil20", "tablets", "tablet", "20", "mg", "20mg", "minoxidil+finast", "minoxidil", "acid", "tranexamic", "the", "for", "é", "crème", "दवा", "c++", "a.b", "(usp)", "test", "testosterone", "testing", "tested", "e", "x_y", "250", "ip", "oil-free", "50%", "𝒳"];
  let seed = 7;
  const random = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const phrase = (max) => Array.from({ length: 1 + random(max) }, () => pieces[random(pieces.length)]).join(random(5) ? " " : "+");
  const normalize = (value) => value.toLowerCase().split(/\s+/u).filter(Boolean).join(" ");
  let compared = 0;
  let matched = 0;
  for (let round = 0; round < 6000; round += 1) {
    const keyword = phrase(3);
    const title = normalize(phrase(7));
    const matchType = ["contains", "whole_word", "all_words", "exact"][random(4)];
    const stemmed = random(2) === 1;
    const negative = random(2) === 1;
    const expected = referenceMatcher(keyword, matchType, stemmed, negative)(title);
    const actual = api.keywordMatcher(keyword, matchType, stemmed, negative)(title);
    assert.equal(actual, expected, JSON.stringify({ keyword, title, matchType, stemmed, negative }));
    compared += 1;
    matched += expected ? 1 : 0;
  }
  assert.ok(matched > 500 && matched < compared - 500, `the sample must cover both outcomes: ${matched} of ${compared} matched`);
  assert.equal(api.keywordMatcher("   ", "contains"), null);
});

test("speed: a decision builds patterns only for keywords that appear in the title", () => {
  let built = 0;
  class CountingRegExp extends RegExp {
    constructor(...args) {
      super(...args);
      built += 1;
    }
  }
  const { api } = loadContentScript({ RegExp: CountingRegExp });
  const rules = Array.from({ length: 300 }, (_, index) => ({ id: `r${index}`, type: "positive", keyword: index === 0 ? "tadalafil" : `keyword${index} extra${index}`, match_type: "contains" }));
  const config = baseConfig({}, rules);
  const lead = plain(api.apiLeadToCapturedLead(api.parseBlApiRow(imRow({ ETO_OFR_TITLE: "Vidalista 20 Mg Tadalafil Tablets" })), "https://x"));
  const decision = api.decideLeadLocally(lead, config, { captured: 0, keyword: {} });
  assert.equal(decision.decision, "captured");
  assert.deepEqual(plain(decision.matched_positive_rule_ids), ["r0"]);
  assert.ok(built <= 5, `${built} patterns were built for one lead; before this fix it was one per keyword word (about 600 here)`);
});

test("rules: an open tab uses changed keywords as soon as the server's version changes", async () => {
  const before = baseConfig({}, [{ id: "r1", type: "positive", keyword: "tadalafil", match_type: "contains" }]);
  const tab = makeTab({ config: before });
  tab.api.startCaptureStateSync();
  const sildenafil = () => tab.parse(imRow({ ETO_OFR_ID: String(71000 + tab.recorded().length), ETO_OFR_TITLE: "Sildenafil Tablets" }));
  const lastDecision = () => tab.recorded().at(-1).local_decision;
  const current = () => tab.api.getState("captureState").decisionConfig;
  const withNewRule = (version) => ({ ...before, version, keyword_rules: [...before.keyword_rules, { id: "r2", type: "positive", keyword: "sildenafil", match_type: "contains" }] });

  tab.storageChanged({ decisionConfig: withNewRule(before.version) });
  tab.api.decidePolledLeads([sildenafil()], "biz", current(), "poll");
  await settle();
  assert.equal(lastDecision().skip_reason, "no_positive_keyword_match", "same version: the tab keeps the rules it compiled, which is why the server must change the version");

  tab.storageChanged({ decisionConfig: withNewRule(before.version + 1) });
  tab.api.decidePolledLeads([sildenafil()], "biz", current(), "poll");
  await settle();
  assert.equal(lastDecision().decision, "captured");

  tab.storageChanged({ decisionConfig: { ...before, version: before.version + 2 } });
  tab.api.decidePolledLeads([sildenafil()], "biz", current(), "poll");
  await settle();
  assert.equal(lastDecision().skip_reason, "no_positive_keyword_match", "a deleted keyword stops buying at once");
});

test("timing: the note says whether the delay was deciding or waiting for a purchase slot", () => {
  const { api } = loadContentScript();
  const base = { postedAtMs: 1000, receivedAt: 2400, sentAt: 2520, answeredAt: 2570 };
  assert.equal(api.buyTimingNote({ ...base, queuedAt: 2500, startedAt: 2500 }), "posted 1.4 s before we saw it \u00b7 buy sent 120 ms after (100 ms deciding) \u00b7 IndiaMART answered in 50 ms");
  assert.equal(api.buyTimingNote({ ...base, queuedAt: 2402, startedAt: 2518 }), "posted 1.4 s before we saw it \u00b7 buy sent 120 ms after (116 ms waiting for a buy slot) \u00b7 IndiaMART answered in 50 ms");
  assert.equal(api.buyTimingNote({ ...base, sentAt: 2403, queuedAt: 2401, startedAt: 2402, answeredAt: 2453 }), "posted 1.4 s before we saw it \u00b7 buy sent 3 ms after \u00b7 IndiaMART answered in 50 ms");
});

test("rules: a poll that was waiting decides with the keywords as they are when the list arrives", async () => {
  const before = baseConfig({}, [{ id: "r1", type: "positive", keyword: "tadalafil", match_type: "contains" }]);
  const tab = makeTab({ config: before });
  tab.api.startCaptureStateSync();
  const poll = tab.api.runApiPoll();
  // The fake page shortens every timer to 5 ms, so answer as soon as the request is out.
  for (let turn = 0; turn < 50 && !tab.answerList; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof tab.answerList, "function", "the list request is in flight");
  tab.storageChanged({ decisionConfig: { ...before, version: before.version + 1, keyword_rules: [...before.keyword_rules, { id: "r2", type: "positive", keyword: "sildenafil", match_type: "contains" }] } });
  tab.answerList([imRow({ ETO_OFR_ID: "72001", ETO_OFR_TITLE: "Sildenafil Tablets" })]);
  const delay = await poll;
  await settle();
  assert.equal(tab.recorded()[0]?.local_decision.decision, "captured", JSON.stringify({ delay, poll: tab.storage.lastApiPoll, sent: tab.sent.map((m) => m.type) }));
});

test("measurement: every recorded lead says how and when it was first seen", async () => {
  const tab = makeTab();
  await tab.api.decideArrivedLeads([tab.parse(imRow({ ETO_OFR_ID: "73001" }))], "push");
  await tab.api.decideArrivedLeads([tab.parse(imRow({ ETO_OFR_ID: "73002" }))], "page");
  await settle();
  const [pushed, listed] = tab.recorded();
  assert.equal(pushed.seen.via, "push");
  assert.equal(listed.seen.via, "page");
  for (const lead of [pushed, listed]) {
    assert.ok(Math.abs(Date.now() - lead.seen.at_ms) < 2000, "the time it reached the tab");
    assert.equal(lead.seen.since_poll_ms, null, "no poll has answered yet");
    assert.ok(lead.seen.decided_after_ms >= 0 && lead.seen.decided_after_ms < 500);
    assert.equal(lead.local_decision.decision, "captured", "measuring changes no decision");
  }
  assert.equal(tab.buys.length, 2);
});

test("measurement: a lead pushed first and decided later still counts as seen by push", async () => {
  const config = baseConfig({ phone_mode: "available" });
  // Not the polling tab: a held-back lead would otherwise start the poll loop, which has no IndiaMART to talk to here.
  const tab = makeTab({ config, pollerStarted: false });
  const unknown = tab.parse(imRow({ ETO_OFR_ID: "73003", ETO_OFR_BUYER_IS_MOB_VERF: undefined, ETO_OFR_EMAIL_VERIFIED: undefined, BY_LEAD_TYPE: undefined, ETO_OFR_ADDITIONAL_DETAILS: undefined }));
  await tab.api.decideArrivedLeads([unknown], "push");
  await settle();
  assert.equal(tab.recorded().length, 0, "held back for its contact flags");
  const pushedAt = tab.api.getState("firstSightings").get("73003").at;

  await new Promise((resolve) => setTimeout(resolve, 60));
  await tab.api.decideArrivedLeads([tab.parse(imRow({ ETO_OFR_ID: "73003" }))], "page");
  await settle();
  const [lead] = tab.recorded();
  assert.equal(lead.seen.via, "push");
  assert.equal(lead.seen.at_ms, pushedAt);
  assert.ok(lead.seen.decided_after_ms >= 50, `decided ${lead.seen.decided_after_ms} ms after it was first seen`);
});

test("measurement: a polled lead is marked as polled, and later ones know how long ago the list was read", async () => {
  const tab = makeTab();
  const poll = tab.api.runApiPoll();
  for (let turn = 0; turn < 50 && !tab.answerList; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  tab.answerList([imRow({ ETO_OFR_ID: "73004" })]);
  await poll;
  await new Promise((resolve) => setTimeout(resolve, 40));
  await tab.api.decideArrivedLeads([tab.parse(imRow({ ETO_OFR_ID: "73005" }))], "push");
  await settle();
  const [polled, pushed] = tab.recorded();
  assert.equal(polled.seen.via, "poll");
  assert.equal(polled.seen.since_poll_ms, null, "the first list this tab read");
  assert.equal(pushed.seen.via, "push");
  assert.ok(pushed.seen.since_poll_ms >= 30 && pushed.seen.since_poll_ms < 2000, `the list read ${pushed.seen.since_poll_ms} ms earlier did not have it`);
});

test("measurement: the sightings list cannot grow without limit", () => {
  const { api } = loadContentScript();
  api.noteSightings(Array.from({ length: 2500 }, (_, index) => ({ ofr_id: String(index) })), "poll", 1000);
  const kept = api.getState("firstSightings");
  assert.equal(kept.size, 2000);
  assert.equal(kept.has("0"), false);
  assert.equal(kept.has("2499"), true);
  assert.deepEqual(plain(api.sightingOf({ ofr_id: "unknown" }, "push", 500, 800)), { via: "push", at_ms: 500, since_poll_ms: null, decided_after_ms: 300, ext: null });
});

test("measurement: the service worker adds how long ago the lead was seen, and nothing else", () => {
  const source = readBundle("service-worker.js");
  const start = source.indexOf("function withSendDelay(");
  const withSendDelay = new Function(`${source.slice(start, source.indexOf("async function sendLeadBatch(", start))}; return withSendDelay;`)();
  const event = { client_event_id: "b:im-ofr:1", title: "x", seen: { via: "push", at_ms: 10_000, since_poll_ms: 5, ext: "1.0.17" } };
  assert.deepEqual(withSendDelay(event, 10_250), { ...event, seen: { ...event.seen, sent_after_ms: 250 } });
  assert.equal(withSendDelay(event, 9_000).seen.sent_after_ms, 0, "never negative");
  assert.equal(event.seen.sent_after_ms, undefined, "the stored event is not changed, so a retry measures afresh");
  const plainEvent = { client_event_id: "b:im-ofr:2", title: "x" };
  assert.equal(withSendDelay(plainEvent, 10_250), plainEvent);
  assert.equal(withSendDelay({ seen: { at_ms: "soon" } }, 1).seen.sent_after_ms, undefined);
  assert.match(source, /leads: claimed\.map\(\(record\) => withSendDelay\(record\.event\)\)/);
});

test("daily limit: counts from yesterday are not used once the server's day has ended", () => {
  const { api } = loadContentScript();
  const lead = plain(api.apiLeadToCapturedLead(api.parseBlApiRow(imRow()), "https://x"));
  const counters = { captured: 0, keyword: {} };
  const now = Date.now();
  const config = (today) => ({ ...baseConfig(), requested_at: now - 60000, today: { ...baseConfig().today, ...today } });

  assert.equal(api.decideLeadLocally(lead, config({ resets_in_ms: 3600000 }), counters, now).decision, "captured", "an hour of the day is left");
  assert.equal(api.decideLeadLocally(lead, config({ resets_in_ms: 59000 }), counters, now), null, "the day ended a second ago: wait for fresh counts");
  assert.equal(api.decideLeadLocally(lead, config({ resets_in_ms: 60001 }), counters, now).decision, "captured");
  assert.equal(api.decideLeadLocally(lead, config({}), counters, now).decision, "captured", "a server from before this change sends no such number");
  assert.equal(api.decideLeadLocally(lead, { ...config({ resets_in_ms: 1 }), requested_at: undefined }, counters, now).decision, "captured", "without a request time there is nothing to measure from");
});
