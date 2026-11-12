// Read-only summary of lead timing, from the dashboard's own API. It changes nothing and never contacts IndiaMART.
//
//   HISAN_EMAIL=you@example.com HISAN_PASSWORD=... node tools/speed-report.mjs [hours]
//
// HISAN_URL defaults to the live dashboard. hours defaults to 24. Use a login that can see the businesses.
// Exact timing needs extension 1.0.17 or newer; older leads are counted separately and left out of the tables.

const base = `${(process.env.HISAN_URL ?? "https://hi-san.medishipper.com").replace(/\/$/, "")}/api/v1`;
const hours = Number(process.argv[2]) || 24;
if (!process.env.HISAN_EMAIL || !process.env.HISAN_PASSWORD) {
  console.error("Set HISAN_EMAIL and HISAN_PASSWORD.");
  process.exit(1);
}

const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.HISAN_EMAIL, password: process.env.HISAN_PASSWORD }),
});
if (!login.ok) {
  console.error(`Login failed (${login.status}).`);
  process.exit(1);
}
const headers = { authorization: `Bearer ${(await login.json()).access_token}` };
const get = async (path) => {
  const response = await fetch(base + path, { headers });
  return response.ok ? response.json() : null;
};

const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
const businesses = (await get("/businesses")) ?? [];
const leads = [];
for (const business of Array.isArray(businesses) ? businesses : (businesses.items ?? [])) {
  for (const lead of (await get(`/businesses/${business.id}/leads?limit=5000&since=${encodeURIComponent(since)}`)) ?? []) {
    leads.push({ ...lead, business: business.name.slice(0, 18) });
  }
}

const middle = (values) => {
  const sorted = values.filter((value) => value !== null && value !== undefined).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const lowest = (values) => (values.length ? Math.min(...values) : null);
const seconds = (ms) => (ms === null ? "-" : (ms / 1000).toFixed(2));
const share = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : "-");
const EDGES = [500, 1000, 1500, 2000, 3000];
const buckets = (values) => {
  const out = {};
  EDGES.forEach((edge, index) => {
    out[`${(index ? EDGES[index - 1] : 0) / 1000}-${edge / 1000}s`] = values.filter((ms) => ms < edge && ms >= (index ? EDGES[index - 1] : -Infinity)).length;
  });
  out["3s+"] = values.filter((ms) => ms >= 3000).length;
  return out;
};

const exact = leads.filter((lead) => lead.timing?.exact && lead.timing.posted_to_seen_ms !== null);
// The bot's own list check only asks for allowed countries, so only these leads could have been found by it.
const pollable = exact.filter((lead) => (lead.filter_reason ?? "") !== "country_not_allowed");
const fresh = (list) => list.filter((lead) => lead.timing.posted_to_seen_ms < 10000);
const via = (list, channel) => list.filter((lead) => lead.timing.seen_via === channel);

console.log(`Last ${hours} h: ${leads.length} leads, ${exact.length} with exact timing (extension 1.0.17+), ${leads.length - exact.length} without.`);
if (!exact.length) {
  console.log("No exact timing yet. Update the extension, reload the IndiaMART tab, and run this again later.");
  process.exit(0);
}

console.log("\n1. How each lead first reached the bot, and how long after IndiaMART posted it (seconds)");
console.table(Object.fromEntries(["push", "poll", "page"].map((channel) => {
  const delays = fresh(via(exact, channel)).map((lead) => lead.timing.posted_to_seen_ms);
  return [channel, { leads: via(exact, channel).length, fastest: seconds(lowest(delays)), middle: seconds(middle(delays)), ...buckets(delays) }];
})));

console.log("2. Could the list have shown a lead before the push? (only leads from allowed countries)");
const freshPollable = fresh(pollable);
const polledFirst = via(freshPollable, "poll");
const pushedFirst = via(freshPollable, "push").filter((lead) => lead.timing.since_poll_ms !== null);
const gaps = pushedFirst.map((lead) => lead.timing.since_poll_ms);
console.log(`   Seen first by the list check: ${polledFirst.length} of ${freshPollable.length} fresh leads (${share(polledFirst.length, freshPollable.length)}).`);
console.log(`   Pushed leads the list had NOT shown when it was read shortly before: ${gaps.filter((ms) => ms < 500).length} within 0.5 s, ${gaps.filter((ms) => ms < 1000).length} within 1 s, ${gaps.filter((ms) => ms < 2000).length} within 2 s (closest: ${seconds(lowest(gaps))} s).`);
console.log("   Many leads seen first by the list means the list is ahead of the push. A list read just before a push that did not have the lead means it is not.");

console.log("\n3. Purchases (seconds from posting to first sight; milliseconds for the request)");
const tried = exact.filter((lead) => lead.status === "retrieved" || lead.status === "not_retrieved");
const row = (list) => {
  const won = list.filter((lead) => lead.status === "retrieved");
  const lost = list.filter((lead) => lead.status === "not_retrieved");
  const number = (items, pick) => middle(items.map(pick));
  return {
    won: won.length,
    lost: lost.length,
    win_rate: share(won.length, won.length + lost.length),
    won_seen_s: seconds(number(won, (lead) => lead.timing.posted_to_seen_ms)),
    lost_seen_s: seconds(number(lost, (lead) => lead.timing.posted_to_seen_ms)),
    won_sent_ms: number(won, (lead) => lead.timing.buy?.seen_to_sent_ms) ?? "-",
    lost_sent_ms: number(lost, (lead) => lead.timing.buy?.seen_to_sent_ms) ?? "-",
    won_answer_ms: number(won, (lead) => lead.timing.buy?.answer_ms) ?? "-",
    lost_answer_ms: number(lost, (lead) => lead.timing.buy?.answer_ms) ?? "-",
  };
};
console.table({ all: row(tried), ...Object.fromEntries([...new Set(tried.map((lead) => lead.business))].map((name) => [name, row(tried.filter((lead) => lead.business === name))])) });
console.log("   seen = posting to first sight. sent = first sight to purchase request. answer = IndiaMART's reply time, which includes the network both ways.");

console.log("\n4. Win rate by how the lead arrived and how soon");
console.table(Object.fromEntries([["push, under 1.5 s", (lead) => lead.timing.seen_via === "push" && lead.timing.posted_to_seen_ms < 1500], ["push, 1.5 s or more", (lead) => lead.timing.seen_via === "push" && lead.timing.posted_to_seen_ms >= 1500], ["list (poll or page)", (lead) => lead.timing.seen_via !== "push"]].map(([label, test]) => {
  const group = tried.filter(test);
  const won = group.filter((lead) => lead.status === "retrieved").length;
  return [label, { tried: group.length, won, win_rate: share(won, group.length) }];
})));
