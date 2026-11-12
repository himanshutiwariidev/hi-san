// The day the daily purchase limit counts in. It starts at midnight Indian time for every business, wherever the
// server or the operator's PC is. One place, so the limit, "Bought today" and the Leads page's "Today" all agree.
export const BUSINESS_DAY_OFFSET_MINUTES = 330;

const OFFSET_MS = BUSINESS_DAY_OFFSET_MINUTES * 60000;
const DAY_MS = 24 * 3600 * 1000;

// Milliseconds since 1970 of the most recent Indian midnight.
export function businessDayStart(now = Date.now()) {
  return Math.floor((now + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;
}

export const businessDayStartIso = (now = Date.now()) => new Date(businessDayStart(now)).toISOString();

// The Indian calendar date, as YYYY-MM-DD.
export const businessDate = (now = Date.now()) => new Date(now + OFFSET_MS).toISOString().slice(0, 10);

export const msUntilNextBusinessDay = (now = Date.now()) => businessDayStart(now) + DAY_MS - now;
