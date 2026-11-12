// When IndiaMART posted a lead, when and how the bot first saw it, and how the purchase request went.
// Shared by the server (to store and serve it) and the UI (to show it). Nothing here changes a decision.

const IST_OFFSET_MS = 330 * 60000;
const DAY_MS = 24 * 3600 * 1000;
const SEEN_VIA = new Set(["push", "poll", "page"]);

// IndiaMART stamps a lead as YYYYMMDDHHMMSS in Indian time, to the whole second.
export function postedAtFromOfferDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Leads stored before the posted time had its own column still carry it inside the raw lead.
function offerDateFromRaw(raw) {
  return /"offer_date":"(\d{14})"/.exec(String(raw ?? ""))?.[1] ?? null;
}

function parseJson(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const duration = (value, max = DAY_MS) => {
  const number = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? Math.round(number) : null;
};

// The extension says how long ago its tab first saw the lead. Taking that off this server's own clock gives a
// time that does not depend on the operator's PC clock, which is often a second or more off.
export function seenFromEvent(seen, receivedAtIso) {
  const event = seen && typeof seen === "object" ? seen : {};
  const sentAfter = duration(event.sent_after_ms);
  const extra = {};
  const sincePoll = duration(event.since_poll_ms);
  const decidedAfter = duration(event.decided_after_ms);
  if (sincePoll !== null) extra.since_poll_ms = sincePoll;
  if (decidedAfter !== null) extra.decided_after_ms = decidedAfter;
  if (typeof event.ext === "string" && event.ext) extra.ext = event.ext.slice(0, 20);
  return {
    seen_at: sentAfter === null ? null : new Date(Date.parse(receivedAtIso) - sentAfter).toISOString(),
    seen_via: SEEN_VIA.has(event.via) ? event.via : null,
    extra,
  };
}

// What the extension measured around one purchase request. Null when nothing usable was sent.
export function cleanBuyTiming(value) {
  if (!value || typeof value !== "object") return null;
  const buy = {
    seen_to_sent_ms: duration(value.seen_to_sent_ms),
    decide_ms: duration(value.decide_ms, 600000),
    slot_wait_ms: duration(value.slot_wait_ms, 600000),
    answer_ms: duration(value.answer_ms, 600000),
    retry: value.retry === true,
  };
  return buy.answer_ms === null && buy.seen_to_sent_ms === null ? null : buy;
}

// A failed purchase carries the same numbers as text, e.g.
// "lost:Sorry… (posted 1.4 s before we saw it · buy sent 3 ms after · IndiaMART answered in 52 ms)".
export function parseBuyNote(note) {
  const text = String(note ?? "");
  const read = (pattern) => {
    const match = pattern.exec(text);
    return match ? Math.round(Number(match[1]) * (match[2] === "s" ? 1000 : 1)) : null;
  };
  const answer = read(/IndiaMART answered in ([\d.]+) (ms|s)\)/);
  if (answer === null) return null;
  const retry = /\(retry · IndiaMART answered/.test(text);
  return { seen_to_sent_ms: retry ? null : read(/buy sent ([\d.]+) (ms|s) after/), decide_ms: null, slot_wait_ms: null, answer_ms: answer, retry };
}

// Takes a leads table row. posted_to_seen_ms is exact when the extension reported the sighting; for older
// records it is measured to the moment the lead reached this server, which adds the upload time.
export function leadTiming(row) {
  const postedAt = row.posted_at ?? postedAtFromOfferDate(offerDateFromRaw(row.raw));
  const seenAt = row.seen_at ?? null;
  const reference = seenAt ?? row.received_at ?? null;
  const extra = parseJson(row.timing);
  const postedToSeen = postedAt && reference ? Date.parse(reference) - Date.parse(postedAt) : null;
  return {
    posted_at: postedAt,
    seen_at: seenAt,
    seen_via: row.seen_via ?? null,
    posted_to_seen_ms: Number.isFinite(postedToSeen) ? postedToSeen : null,
    exact: Boolean(seenAt),
    since_poll_ms: extra.since_poll_ms ?? null,
    decided_after_ms: extra.decided_after_ms ?? null,
    extension: extra.ext ?? null,
    buy: cleanBuyTiming(extra.buy) ?? parseBuyNote(row.filter_reason),
  };
}

// Adds the purchase numbers to what is already stored for a lead, keeping the first ones it got.
export function withBuyTiming(storedTiming, buyTiming) {
  const buy = cleanBuyTiming(buyTiming);
  const extra = parseJson(storedTiming);
  if (!buy || extra.buy) return null;
  return JSON.stringify({ ...extra, buy });
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  const value = Math.max(0, ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`;
  if (value < 3600000) return `${Math.round(value / 60000)} min`;
  return `${(value / 3600000).toFixed(1)} h`;
}

const VIA_LABELS = { push: "IndiaMART's live push", poll: "the bot's list check", page: "the page's own list" };

// One line for the lead window: how long after posting the bot saw the lead, and through which channel.
export function describeSeen(timing) {
  if (!timing || timing.posted_to_seen_ms === null) return "";
  const after = formatDuration(timing.posted_to_seen_ms);
  if (!timing.exact) return `Reached the server ${after} after posting`;
  return `${after} after posting${timing.seen_via ? `, by ${VIA_LABELS[timing.seen_via]}` : ""}`;
}

export function describeBuy(timing) {
  const buy = timing?.buy;
  if (!buy || buy.answer_ms === null) return "";
  const sent = buy.retry ? "Retry" : buy.seen_to_sent_ms === null ? "" : `Sent ${formatDuration(buy.seen_to_sent_ms)} after seeing it`;
  return [sent, `IndiaMART answered in ${formatDuration(buy.answer_ms)}`].filter(Boolean).join(" · ");
}
