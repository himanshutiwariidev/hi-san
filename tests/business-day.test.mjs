// The day the daily limit counts in: midnight to midnight, Indian time.
import assert from "node:assert/strict";
import { test } from "node:test";
import { businessDate, businessDayStart, businessDayStartIso, msUntilNextBusinessDay } from "../lib/businessDay.js";

const at = (iso) => Date.parse(iso);

test("the day starts at midnight Indian time, which is 18:30 UTC", () => {
  assert.equal(businessDayStartIso(at("2026-11-11T18:29:59.999Z")), "2026-11-10T18:30:00.000Z", "23:59:59 IST still belongs to the 11th");
  assert.equal(businessDayStartIso(at("2026-11-11T18:30:00.000Z")), "2026-11-11T18:30:00.000Z", "00:00:00 IST starts the 12th");
  assert.equal(businessDayStartIso(at("2026-11-12T00:00:00.000Z")), "2026-11-11T18:30:00.000Z", "UTC midnight (05:30 IST) changes nothing any more");
  assert.equal(businessDayStartIso(at("2026-11-12T18:29:59.000Z")), "2026-11-11T18:30:00.000Z");
});

test("the Indian date and the time left in the day", () => {
  assert.equal(businessDate(at("2026-11-11T18:29:59.999Z")), "2026-11-11");
  assert.equal(businessDate(at("2026-11-11T18:30:00.000Z")), "2026-11-12");
  assert.equal(businessDate(at("2026-12-31T19:00:00.000Z")), "2027-01-01");
  assert.equal(msUntilNextBusinessDay(at("2026-11-11T18:30:00.000Z")), 24 * 3600 * 1000);
  assert.equal(msUntilNextBusinessDay(at("2026-11-11T18:29:59.000Z")), 1000);
  const now = Date.now();
  assert.ok(businessDayStart(now) <= now && now - businessDayStart(now) < 24 * 3600 * 1000);
});

test("the Sanket Pharma morning of 12 Nov: all 14 purchases fall in one day now", () => {
  // Seven before 05:30 IST and seven after. Counted by UTC day they were split 7 and 7, and a limit of 10 let all 14 through.
  const ist = (time) => at(`2026-11-12T${time}:00+05:30`);
  const purchases = ["00:46", "01:09", "01:14", "04:50", "05:15", "05:15", "05:20", "05:55", "06:05", "06:12", "06:14", "06:14", "06:44", "07:11"].map(ist);
  const start = businessDayStart(ist("07:30"));
  assert.equal(purchases.filter((time) => time >= start).length, 14);
  const utcStart = at("2026-11-12T00:00:00.000Z");
  assert.equal(purchases.filter((time) => time >= utcStart).length, 7, "what the old rule counted at the same moment");
});
