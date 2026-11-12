// Lead timing: pure rules for turning what the extension and IndiaMART report into comparable numbers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBuyTiming, describeBuy, describeSeen, formatDuration, leadTiming, parseBuyNote, postedAtFromOfferDate, seenFromEvent, withBuyTiming } from "../lib/leadTiming.js";

test("IndiaMART's posted stamp is Indian time, to the second", () => {
  assert.equal(postedAtFromOfferDate("20261111224640"), "2026-11-11T17:16:40.000Z");
  assert.equal(postedAtFromOfferDate("20270101000000"), "2026-12-31T18:30:00.000Z", "crosses midnight and the year");
  for (const bad of [null, undefined, "", "2026-11-11", "2026111122464", "abcdefghijklmn"]) assert.equal(postedAtFromOfferDate(bad), null, String(bad));
});

test("the sighting is placed on the server's clock, not the PC's", () => {
  const seen = seenFromEvent({ via: "push", at_ms: 123, sent_after_ms: 140, since_poll_ms: 2300, decided_after_ms: 0, ext: "1.0.17" }, "2026-11-11T17:16:41.300Z");
  assert.deepEqual(seen, { seen_at: "2026-11-11T17:16:41.160Z", seen_via: "push", extra: { since_poll_ms: 2300, decided_after_ms: 0, ext: "1.0.17" } });
  assert.equal(seenFromEvent({ via: "poll", sent_after_ms: 0 }, "2026-11-11T17:16:41.300Z").seen_at, "2026-11-11T17:16:41.300Z");
});

test("nonsense from a client is dropped, never stored", () => {
  const at = "2026-11-11T17:16:41.300Z";
  assert.deepEqual(seenFromEvent(undefined, at), { seen_at: null, seen_via: null, extra: {} });
  assert.deepEqual(seenFromEvent("push", at), { seen_at: null, seen_via: null, extra: {} });
  assert.deepEqual(seenFromEvent({ via: "sweep", sent_after_ms: -5, since_poll_ms: "x", ext: 7 }, at), { seen_at: null, seen_via: null, extra: {} });
  assert.equal(seenFromEvent({ sent_after_ms: 25 * 3600 * 1000 }, at).seen_at, null, "older than a day is not believable");
  assert.equal(seenFromEvent({ sent_after_ms: null }, at).seen_at, null);
  assert.equal(cleanBuyTiming({ answer_ms: "abc" }), null);
  assert.equal(cleanBuyTiming(null), null);
  assert.deepEqual(cleanBuyTiming({ answer_ms: 52.4, seen_to_sent_ms: 3, decide_ms: -1, slot_wait_ms: 1e9, retry: "yes" }), { seen_to_sent_ms: 3, decide_ms: null, slot_wait_ms: null, answer_ms: 52, retry: false });
});

test("a failed purchase's note gives the same numbers a win reports", () => {
  const lost = "lost:Sorry, this Buylead expired just a minute ago. (posted 1.8 s before we saw it · buy sent 125 ms after (125 ms waiting for a buy slot) · IndiaMART answered in 164 ms)";
  assert.deepEqual(parseBuyNote(lost), { seen_to_sent_ms: 125, decide_ms: null, slot_wait_ms: null, answer_ms: 164, retry: false });
  assert.deepEqual(parseBuyNote("buy_failed:HTTP 500 (posted 900 ms before we saw it · buy sent 1.2 s after (1.1 s deciding) · IndiaMART answered in 2.5 s)"), { seen_to_sent_ms: 1200, decide_ms: null, slot_wait_ms: null, answer_ms: 2500, retry: false });
  assert.deepEqual(parseBuyNote("lost:gone (retry · IndiaMART answered in 61 ms)"), { seen_to_sent_ms: null, decide_ms: null, slot_wait_ms: null, answer_ms: 61, retry: true });
  for (const none of [null, "", "rate_limited:120s", "Filtered by rules", "country_not_allowed", "lost:answered in 5 ms by a person"]) assert.equal(parseBuyNote(none), null, String(none));
});

test("a lead's timing: exact when the extension reported it, measured at the server otherwise", () => {
  const exact = leadTiming({ posted_at: "2026-11-11T17:16:40.000Z", seen_at: "2026-11-11T17:16:41.160Z", seen_via: "push", received_at: "2026-11-11T17:16:41.300Z", timing: '{"since_poll_ms":2300,"ext":"1.0.17","buy":{"seen_to_sent_ms":3,"answer_ms":52}}' });
  assert.equal(exact.posted_to_seen_ms, 1160);
  assert.equal(exact.exact, true);
  assert.equal(exact.since_poll_ms, 2300);
  assert.equal(exact.extension, "1.0.17");
  assert.deepEqual(exact.buy, { seen_to_sent_ms: 3, decide_ms: null, slot_wait_ms: null, answer_ms: 52, retry: false });
  assert.equal(describeSeen(exact), "1.2 s after posting, by IndiaMART's live push");
  assert.equal(describeBuy(exact), "Sent 3 ms after seeing it · IndiaMART answered in 52 ms");

  const older = leadTiming({ raw: '{"indiamart_api":{"enrichment":{},"offer_date":"20261111224640"}}', received_at: "2026-11-11T17:16:42.900Z", status: "not_retrieved", filter_reason: "lost:x (posted 2 s before we saw it · buy sent 2 ms after · IndiaMART answered in 38 ms)" });
  assert.equal(older.posted_at, "2026-11-11T17:16:40.000Z", "read from the stored lead when there is no column value");
  assert.equal(older.posted_to_seen_ms, 2900);
  assert.equal(older.exact, false);
  assert.equal(older.buy.answer_ms, 38);
  assert.equal(describeSeen(older), "Reached the server 2.9 s after posting");

  const cut = leadTiming({ raw: '{"indiamart_api":{"offer_date":"20261111224640"},"fields":{"x":"cut off he', received_at: "2026-11-11T17:16:41.000Z" });
  assert.equal(cut.posted_to_seen_ms, 1000, "a raw lead cut short at the size limit still gives its posted time");

  const nothing = leadTiming({ received_at: "2026-11-11T17:16:42.900Z", timing: "{broken" });
  assert.deepEqual(nothing, { posted_at: null, seen_at: null, seen_via: null, posted_to_seen_ms: null, exact: false, since_poll_ms: null, decided_after_ms: null, extension: null, buy: null });
  assert.equal(describeSeen(nothing), "");
  assert.equal(describeBuy(nothing), "");
  assert.equal(describeSeen(null), "");
});

test("purchase numbers are stored once and keep what was there", () => {
  const first = withBuyTiming('{"since_poll_ms":10}', { answer_ms: 52, seen_to_sent_ms: 3 });
  assert.deepEqual(JSON.parse(first), { since_poll_ms: 10, buy: { seen_to_sent_ms: 3, decide_ms: null, slot_wait_ms: null, answer_ms: 52, retry: false } });
  assert.equal(withBuyTiming(first, { answer_ms: 999 }), null, "a resend does not replace the first measurement");
  assert.equal(withBuyTiming(null, undefined), null);
  assert.equal(JSON.parse(withBuyTiming(null, { answer_ms: 5 })).buy.answer_ms, 5);
});

test("durations read naturally at every size", () => {
  assert.deepEqual([3, 999, 1000, 1160, 59999, 60000, 5400000, 106534340].map(formatDuration), ["3 ms", "999 ms", "1.0 s", "1.2 s", "60.0 s", "1 min", "1.5 h", "29.6 h"]);
  assert.equal(formatDuration(null), "");
  assert.equal(formatDuration(-40), "0 ms");
});
