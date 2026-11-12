// Real extension + real Chromium + real server, against the fake IndiaMART. Chromium's DNS is locked to the fake
// site and localhost, so this cannot reach IndiaMART or the live dashboard. Takes about five minutes.
//   npm run build && node tests/e2e/browser.e2e.mjs
// Needs a Chromium that allows --load-extension (Playwright's works). Set E2E_CHROMIUM to use another one.
// A look-alike extension (the same page script under the names every build of this engine once shared) is always
// on the page, so a request of ours that somebody else's page script also runs shows up as a doubled request.
// E2E_EXTRA_EXTENSIONS=/path/a,/path/b loads more unpacked extensions beside ours, exactly as they are.
// E2E_PAGE_PATH changes the BuyLeads address the tab opens (default /bltxn?pref=relevant).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { channelNames, EXTENSION_DIR, imRow, readBundle } from "../helpers/extension.mjs";
import { ADMIN, startServer } from "../helpers/server.mjs";
import { startFakeIndiaMart } from "./fake-indiamart.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APP_PORT = 3476;
const IM_PORT = 3478;
const DEBUG_PORT = 9333;
const shots = process.env.E2E_SCREENSHOTS;
const PAGE_PATH = process.env.E2E_PAGE_PATH ?? "/bltxn?pref=relevant";
const EXTRA_EXTENSIONS = (process.env.E2E_EXTRA_EXTENSIONS ?? "").split(",").map((dir) => dir.trim()).filter(Boolean);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChromium() {
  if (process.env.E2E_CHROMIUM) return process.env.E2E_CHROMIUM;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const builds = fs.readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse();
  return path.join(cache, builds[0], "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
}

const results = [];
function check(name, passed, detail = "") {
  results.push(passed);
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function until(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) {
      console.log(`  timed out waiting for: ${label}`);
      return null;
    }
    await sleep(250);
  }
}

// Just enough of the DevTools protocol to run code in a page.
async function devtools(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const waiting = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => reject(new Error(`DevTools call timed out: ${method}`)), 15000);
      waiting.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return {
    send,
    async evaluate(expression) {
      const answer = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (answer.result?.exceptionDetails) throw new Error(JSON.stringify(answer.result.exceptionDetails).slice(0, 400));
      return answer.result?.result?.value;
    },
    close: () => socket.close(),
  };
}

function launch(extraArgs, profile) {
  return spawn(findChromium(), [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-background-networking",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${DEBUG_PORT}`, ...extraArgs, "about:blank",
  ], { stdio: "ignore" });
}
const debugList = () => fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
const openTab = (url) => fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());

// Same code, pointed at the local server. Nothing else differs from what ships.
function prepareExtension(dir) {
  fs.cpSync(EXTENSION_DIR, dir, { recursive: true });
  const local = `http://127.0.0.1:${APP_PORT}`;
  for (const file of ["service-worker.js", "popup.js", "sidepanel.js"]) {
    const target = path.join(dir, file);
    fs.writeFileSync(target, fs.readFileSync(target, "utf8").replaceAll("https://hi-san.medishipper.com", local));
  }
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.host_permissions.push(`${local}/*`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// Another extension built from the same engine: our page script, listening on the names they all used to share.
function prepareLookAlike(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const ours = channelNames("page-network-hook.js");
  const shared = { request: "im-leads-bridge-request", response: "im-leads-bridge-response", pageData: "im-leads-page-hook" };
  let hook = readBundle("page-network-hook.js");
  for (const key of Object.keys(shared)) hook = hook.replaceAll(ours[key], shared[key]);
  fs.writeFileSync(path.join(dir, "page-network-hook.js"), hook);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "Look-alike engine (test only)",
    version: "1.0.0",
    content_scripts: [{ matches: ["https://seller.indiamart.com/bltxn*"], js: ["page-network-hook.js"], run_at: "document_start", world: "MAIN" }],
  }));
}

const row = (id, overrides = {}) => imRow({ ETO_OFR_ID: String(id), ...overrides });
// IndiaMART's own stamp for "posted": Indian time, whole seconds.
const istStamp = (ms) => new Date(ms + 330 * 60000).toISOString().replace(/[-T:]/g, "").slice(0, 14);
const unknownSignals = { ETO_OFR_BUYER_IS_MOB_VERF: undefined, ETO_OFR_EMAIL_VERIFIED: undefined, BY_LEAD_TYPE: undefined, ETO_OFR_ADDITIONAL_DETAILS: undefined };

const work = fs.mkdtempSync(path.join(os.tmpdir(), "hisan-e2e-"));
const server = await startServer(APP_PORT);
const im = await startFakeIndiaMart(IM_PORT);
const business = server.businessId;
let browser;

const leads = async () => (await server.call("GET", `/businesses/${business}/leads?limit=5000`)).data;
const leadFor = async (id) => (await leads()).find((lead) => lead.client_event_id.endsWith(`im-ofr:${id}`));
const reached = (id, status) => () => leadFor(id).then((lead) => (lead?.status === status ? lead : null));

try {
  await server.call("POST", `/businesses/${business}/keyword-rules`, { keyword: "tadalafil", match: "contains" });
  await server.call("PUT", `/businesses/${business}/filter-settings`, {
    allowed_countries: ["us", "gb", "au"], daily_capture_limit: 10, email_mode: "off", phone_mode: "available", any_contact_mode: "off", trusted_buyer_bypass: false,
  });

  // A lead bought before the fix: stored without contacts, while the outbox still has the original payload.
  const ts = new Date().toISOString();
  const database = new DatabaseSync(server.databasePath);
  database.prepare(
    `INSERT INTO leads (id, business_id, external_id, client_event_id, title, country_code, country_name, status, decision, filter_reason, buyer_name, received_at, decided_at, retrieved_at)
     VALUES ('lead_old', ?, ?, ?, 'Old purchase', 'US', 'USA', 'retrieved', 'captured', 'Filtered by rules', 'Old Buyer', ?, ?, ?)`
  ).run(business, `${business}:im-ofr:60000`, `${business}:im-ofr:60000`, ts, ts, ts);
  database.close();

  const extension = path.join(work, "extension");
  prepareExtension(extension);
  const lookAlike = path.join(work, "look-alike");
  prepareLookAlike(lookAlike);
  const extras = EXTRA_EXTENSIONS.map((dir, index) => {
    const copy = path.join(work, `extra-${index}`);
    fs.cpSync(dir, copy, { recursive: true });
    return copy;
  });
  const loaded = [extension, lookAlike, ...extras].join(",");
  browser = launch([
    `--load-extension=${loaded}`, `--disable-extensions-except=${loaded}`, "--ignore-certificate-errors",
    `--host-resolver-rules=MAP seller.indiamart.com 127.0.0.1:${IM_PORT}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
  ], path.join(work, "profile"));

  // Read state through the worker: Chromium freezes a background tab, and the worker stays awake.
  let sw = null;
  let extensionId = "";
  const enabled = new Set(["Look-alike engine (test only)"]);
  await until(async () => {
    for (const target of (await debugList()).filter((candidate) => candidate.type === "service_worker" && candidate.url.endsWith("/service-worker.js"))) {
      const session = await devtools(target.webSocketDebuggerUrl);
      const name = await session.evaluate("chrome.runtime.getManifest().name");
      enabled.add(name);
      if (!sw && name.startsWith("Hi-San")) {
        sw = session;
        extensionId = new URL(target.url).host;
      } else {
        session.close();
      }
    }
    return sw && enabled.size >= 2 + extras.length;
  }, 20000, "service worker");
  check("the service worker starts in a real browser", Boolean(sw), [...enabled].join(" + "));
  if (!sw) throw new Error(`no service worker: ${(await debugList().catch(() => [])).map((target) => target.url).join(", ")}`);

  const panelTarget = await openTab(`chrome-extension://${extensionId}/options.html`);
  const panel = await devtools(panelTarget.webSocketDebuggerUrl);

  const outboxReady = await until(() => panel.evaluate(`indexedDB.databases().then((all) => all.some((db) => db.name === "im_leads_outbox"))`), 45000, "outbox database");
  check("the real Dexie outbox is created", Boolean(outboxReady));

  await panel.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open("im_leads_outbox");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("enrichments", "readwrite");
      tx.objectStore("enrichments").put({
        enrichment_id: "${business}:im-ofr:60000", business_id: "${business}", backend_lead_id: "lead_old", client_event_id: "im-ofr:60000",
        payload: { buyer_name: "Old Buyer", buyer_phone: "+1 5556000000", buyer_email: "old@example.com", requirement_fields: { Company: "Old Co" } },
        state: "ACKED", created_at: "${ts}", updated_at: "${ts}", attempt_count: 0,
      });
      tx.oncomplete = () => { open.result.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    };
  })`);

  const login = await fetch(`http://127.0.0.1:${APP_PORT}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ADMIN) }).then((response) => response.json());
  im.state.rows = [
    row(1001),
    row(1002),
    row(1003, { GLUSR_COUNTRY: "Nepal", FK_GL_COUNTRY_ISO: "NP" }),
    row(1004, { ETO_OFR_TITLE: "Steel Pipes" }),
    row(1005, { PURCHASE_STATUS: "SOLD" }),
    row(1006, { BY_LEAD_TYPE: 2, ETO_OFR_BUYER_IS_MOB_VERF: 0, ETO_OFR_ADDITIONAL_DETAILS: [{ is_whatsapp_active: 0 }] }),
  ];
  im.state.lostIds.add("1002");
  await panel.evaluate(`chrome.storage.local.set(${JSON.stringify({
    authSession: { access_token: login.access_token, default_business: { id: business, name: "Test" } },
    selectedBusinessId: business,
    businesses: [{ id: business, name: "Test" }],
    botEnabled: true,
  })})`);

  const restored = await until(async () => {
    const lead = (await leads()).find((candidate) => candidate.id === "lead_old");
    return lead?.phone ? lead : null;
  }, 40000, "contact replay");
  check("a saved buyer contact is restored from the real outbox", restored?.phone === "+1 5556000000" && restored?.email === "old@example.com" && restored?.company === "Old Co");

  const pageTarget = await openTab(`https://seller.indiamart.com${PAGE_PATH}`);
  const page = await devtools(pageTarget.webSocketDebuggerUrl);

  const bought = await until(reached(1001, "retrieved"), 25000, "lead 1001 retrieved");
  check(`the bot runs on ${PAGE_PATH.split("?")[0]}`, Boolean(bought));
  check("1. a visible lead is detected and 4. retrieved, with contacts", bought?.phone === "+1 5551001" && bought?.email === "buyer1001@example.com" && bought?.company === "Company 1001", bought?.phone);
  check("the keyword and purchase id are saved", bought?.matched_keyword === "tadalafil" && bought?.purchase_id === "P1001");

  const lost = await until(reached(1002, "not_retrieved"), 15000, "lead 1002 not retrieved");
  check("5. a failed purchase is recorded", lost?.reason?.label === "Expired or Sold Out", lost?.reason?.label);
  const country = await until(reached(1003, "filtered"), 10000, "lead 1003");
  check("6. a country mismatch shows its reason", country?.reason?.detail === "Nepal is not in your allowed countries", country?.reason?.detail);
  const keyword = await until(reached(1004, "filtered"), 10000, "lead 1004");
  check("7. a keyword mismatch shows its reason", keyword?.reason?.label === "Keyword Mismatch", keyword?.reason?.label);
  const contact = await until(reached(1006, "filtered"), 10000, "lead 1006");
  check("8. a contact mismatch shows its reason", contact?.reason?.detail === "Missing phone", contact?.reason?.detail);
  const closed = await until(reached(1005, "filtered"), 10000, "lead 1005");
  check("a closed lead no longer disappears", closed?.reason?.detail === "IndiaMART status: SOLD", closed?.reason?.detail);

  im.state.rows.push(row(1007));
  const dynamic = await until(reached(1007, "retrieved"), 15000, "lead 1007");
  check("2. a lead that appears later is detected", Boolean(dynamic));

  im.state.rows.push(row(1008, unknownSignals));
  await until(async () => im.state.lists.at(-1)?.at > Date.now() - 1000 && im.state.lists.length > 0, 9000, "a poll");
  await sleep(1000);
  im.state.rows = im.state.rows.map((candidate) => (candidate.ETO_OFR_ID === "1008" ? row(1008) : candidate));
  const delayed = await until(reached(1008, "retrieved"), 20000, "lead 1008");
  check("3. a lead whose details arrive late is still bought", Boolean(delayed));

  const pushed = row(1009, { ...unknownSignals, BY_LEAD_TYPE: undefined });
  const xmpp = `<message from="a@b/realtime_bl"><body>${JSON.stringify(JSON.stringify(pushed)).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></message>`;
  await page.evaluate(`new BroadcastChannel("WebSocketChannel").postMessage(${JSON.stringify(xmpp)})`);
  await sleep(2000);
  check("a pushed lead with unknown contacts is held back at first", !(await leadFor(1009)));
  const swept = await until(reached(1009, "filtered"), 40000, "lead 1009");
  check("a pushed lead that never reaches the list is still recorded", swept?.reason?.label === "Contact Mismatch", swept?.reason?.label);

  const pushedBuy = row(1010, { OFR_DATE: istStamp(Date.now()) });
  const xmppBuy = `<message from="a@b/realtime_bl"><body>${JSON.stringify(JSON.stringify(pushedBuy)).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></message>`;
  const sentAt = Date.now();
  await page.evaluate(`new BroadcastChannel("WebSocketChannel").postMessage(${JSON.stringify(xmppBuy)})`);
  const realtime = await until(reached(1010, "retrieved"), 15000, "lead 1010");
  const buyAt = im.state.buys.find((buy) => buy.ofrid === "1010")?.at;
  check("a pushed lead is bought straight away", Boolean(realtime) && buyAt - sentAt < 1000, `${buyAt - sentAt} ms`);

  // Measurement: the pushed lead was "posted" this very second, so the server must place its sighting within a
  // couple of seconds of that, by push, with the purchase's own numbers.
  const version = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf8")).version;
  const pushTiming = realtime?.timing;
  check("timing: a pushed lead is recorded as seen by push, moments after it was posted", pushTiming?.seen_via === "push" && pushTiming.exact === true && pushTiming.posted_to_seen_ms > -500 && pushTiming.posted_to_seen_ms < 3000 && pushTiming.extension === version, `${pushTiming?.posted_to_seen_ms} ms after posting, v${pushTiming?.extension}`);
  check("timing: a won purchase keeps how fast the request went", pushTiming?.buy?.retry === false && pushTiming.buy.seen_to_sent_ms >= 0 && pushTiming.buy.seen_to_sent_ms < 1000 && pushTiming.buy.answer_ms >= 0 && pushTiming.buy.answer_ms < 5000, JSON.stringify(pushTiming?.buy));
  const listTiming = (await leadFor(1007))?.timing;
  check("timing: a lead found in the list is recorded as seen by the list", ["poll", "page"].includes(listTiming?.seen_via) && listTiming.exact === true, listTiming?.seen_via);
  const lostTiming = (await leadFor(1002))?.timing;
  check("timing: a lost purchase has its numbers too", lostTiming?.buy?.answer_ms >= 0 && lostTiming.exact === true, JSON.stringify(lostTiming?.buy));

  // A keyword added on the dashboard while the IndiaMART tab stays open.
  await server.call("POST", `/businesses/${business}/keyword-rules`, { keyword: "sildenafil", match: "contains" });
  const synced = await until(() => sw.evaluate(`chrome.storage.local.get("decisionConfig").then((state) => state.decisionConfig?.keyword_rules?.length === 2)`), 45000, "the new keyword reaching the extension");
  im.state.rows.push(row(1012, { ETO_OFR_TITLE: "Sildenafil Tablets" }));
  const newKeyword = synced ? await until(reached(1012, "retrieved"), 20000, "lead 1012") : null;
  check("a keyword added on the dashboard works without reloading the IndiaMART tab", Boolean(newKeyword), newKeyword?.matched_keyword ?? (await leadFor(1012))?.reason?.label ?? "");
  check("timing: a polled lead knows how long before it the list was last read", newKeyword?.timing?.seen_via === "poll" && newKeyword.timing.since_poll_ms > 3000 && newKeyword.timing.since_poll_ms < 30000, `${newKeyword?.timing?.since_poll_ms} ms`);

  const counts = {};
  for (const buy of im.state.buys) counts[buy.ofrid] = (counts[buy.ofrid] ?? 0) + 1;
  check("every purchase reached IndiaMART once, with other extensions on the page", Object.values(counts).every((count) => count === 1), `${im.state.buys.length} requests for ${Object.keys(counts).length} leads`);
  check("closed and filtered leads were never bought", !counts["1003"] && !counts["1004"] && !counts["1005"] && !counts["1006"]);
  const gaps = im.state.lists.slice(1).map((entry, index) => entry.at - im.state.lists[index].at);
  const perMinute = im.state.lists.filter((entry) => entry.at > Date.now() - 60000).length;
  check("the poll rate is unchanged", Math.min(...gaps.slice(1)) >= 6500 && perMinute <= 9, `min gap ${Math.min(...gaps.slice(1))} ms, ${perMinute} in the last minute`);

  im.state.listStatus = 429;
  const before = im.state.lists.length;
  const brake = await until(async () => {
    const stored = await sw.evaluate(`chrome.storage.local.get("imSafetyBrake").then((state) => state.imSafetyBrake ?? null)`);
    return stored?.until > Date.now() ? stored : null;
  }, 15000, "safety brake");
  check("12. a 429 trips the safety brake", Boolean(brake), brake ? `${Math.round((brake.until - Date.now()) / 1000)} s pause` : "");
  const atBrake = im.state.lists.length;
  im.state.rows.push(row(1011));
  await sleep(20000);
  check("no list request is sent during the pause", im.state.lists.length === atBrake, `${atBrake - before} before, ${im.state.lists.length - atBrake} after`);
  check("nothing is bought during the pause", !im.state.buys.some((buy) => buy.ofrid === "1011"));

  im.state.listStatus = 200;
  const resumed = await until(reached(1011, "retrieved"), 125000, "lead 1011 after the pause");
  const firstAfter = im.state.lists[atBrake]?.at;
  check("the bot resumes by itself, and not before the pause ends", Boolean(resumed) && firstAfter >= brake.until, `resumed ${Math.round((firstAfter - brake.until) / 1000)} s after the pause ended`);

  const all = await leads();
  const by = (status) => all.filter((lead) => lead.status === status).length;
  check("10. the totals add up", all.length === by("retrieved") + by("filtered") + by("not_retrieved") + by("pending"), `${all.length} = ${by("retrieved")} + ${by("filtered")} + ${by("not_retrieved")} + ${by("pending")}`);
  check("every detected lead is accounted for", [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012].every((id) => all.some((lead) => lead.client_event_id.endsWith(`im-ofr:${id}`))));

  const audit = await sw.evaluate(fs.readFileSync(path.join(ROOT, "tools/audit-saved-contacts.js"), "utf8"));
  const expectedPurchases = im.state.buys.filter((buy) => !im.state.lostIds.has(buy.ofrid)).length + 1;
  check("the audit tool reads a real outbox", audit?.purchases === expectedPurchases && audit?.with_phone === expectedPurchases && audit?.with_neither === 0, JSON.stringify(audit));

  const comparison = await sw.evaluate(fs.readFileSync(path.join(ROOT, "tools/compare-bots.js"), "utf8"));
  const comparisonText = JSON.stringify(comparison ?? {});
  check(
    "the comparison tool reports this bot's purchases and no buyer contacts",
    comparison?.bot?.startsWith("Hi-San") && comparison.purchases.bought === expectedPurchases - 1 && comparison.purchases.lost === 1 && comparison.lost_because.lost === 1 && comparison.filters.keywords === 2 && !/@example\.com|\+1 555|Buyer \d/.test(comparisonText),
    JSON.stringify(comparison?.purchases)
  );

  const sync = await sw.evaluate(`chrome.storage.local.get(["lastSyncError", "lastLeadEnrichmentError", "buyerContactReplayDone"])`);
  check("the extension reports no sync errors", !sync.lastSyncError && !sync.lastLeadEnrichmentError, JSON.stringify(sync).slice(0, 120));

  page.close();
  panel.close();
  sw.close();
  browser.kill("SIGKILL");
  await sleep(1500);

  // The dashboard, in a browser that can reach flagcdn, showing what the run above produced.
  const ui = launch(["--window-size=1500,1100"], path.join(work, "profile-ui"));
  browser = ui;
  await until(() => debugList(), 15000, "browser");
  const tab = await devtools((await openTab(`http://127.0.0.1:${APP_PORT}/login`)).webSocketDebuggerUrl);
  await sleep(1500);
  await tab.evaluate(`fetch("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: ${JSON.stringify(JSON.stringify(ADMIN))} }).then((response) => response.ok)`);
  await tab.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });

  async function shot(url, file) {
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${APP_PORT}${url}` });
    await sleep(3500);
    if (shots) {
      const { result } = await tab.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(shots, file), Buffer.from(result.data, "base64"));
    }
  }

  await shot("/leads", "leads.png");
  const headers = await tab.evaluate(`[...document.querySelectorAll("th")].map((th) => th.textContent)`);
  check("the Reason column is on the Leads page", headers?.includes("Reason"), headers?.join(" | "));
  const flags = await tab.evaluate(`Promise.all([...document.querySelectorAll('img[src*="flagcdn"]')].map((img) => img.complete ? img : new Promise((resolve) => { img.onload = img.onerror = () => resolve(img); }))).then((images) => images.map((img) => [img.src.split("/").pop(), img.naturalWidth]))`);
  check("9. flags load in the Leads table", flags?.length > 0 && flags.every(([, width]) => width > 0), JSON.stringify([...new Set(flags?.map(([name]) => name))]));
  const broken = await tab.evaluate(`[...document.images].filter((img) => img.complete && img.naturalWidth === 0).length`);
  check("no broken image on the page", broken === 0, `${broken}`);
  const reasonTexts = await tab.evaluate(`[...document.querySelectorAll("tbody tr td:nth-child(5)")].map((td) => td.innerText.split("\\n")[0])`);
  check("every row has a reason", reasonTexts?.length > 0 && reasonTexts.every(Boolean), [...new Set(reasonTexts)].join(", "));

  await tab.evaluate(`document.querySelectorAll("select")[3].selectedIndex`);
  const before2 = await tab.evaluate(`document.querySelectorAll("tbody tr").length`);
  await tab.evaluate(`(() => {
    const select = [...document.querySelectorAll("select")].find((candidate) => candidate.options[0]?.textContent === "All reasons");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, "Country Mismatch");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(400);
  const after2 = await tab.evaluate(`[...document.querySelectorAll("tbody tr")].map((tr) => tr.children[4].innerText.split("\\n")[0])`);
  check("11. the reason filter works with the existing filters", after2?.length > 0 && after2.length < before2 && after2.every((text) => text === "Country Mismatch"), `${before2} -> ${after2?.length}`);

  await tab.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await shot("/leads", "leads-mobile.png");
  const overflow = await tab.evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  check("no sideways page scroll on a phone", overflow <= 0, `${overflow}px`);
  await tab.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });

  await shot("/", "dashboard.png");
  const dashboard = await tab.evaluate(`document.body.innerText`);
  check("the dashboard shows buyer emails and phones", /Buyer emails\s*[1-9]/.test(dashboard) && /Phone numbers\s*[1-9]/.test(dashboard));
  check("the dashboard shows top keywords", /tadalafil/.test(dashboard));
  check("no generic reason on the dashboard", !/Filtered by rules/.test(dashboard));
  tab.close();
} catch (error) {
  console.log("FAIL  run stopped:", error.message);
  results.push(false);
} finally {
  browser?.kill("SIGKILL");
  im.stop();
  server.stop();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((passed) => !passed).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
