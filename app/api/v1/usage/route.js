import { db } from "@/lib/server/db";
import { accessibleBusinesses, requireUser } from "@/lib/server/auth";
import { badRequest, route } from "@/lib/server/http";
import { BUSINESS_DAY_OFFSET_MINUTES, businessDate } from "@/lib/businessDay";

const DAY_MS = 24 * 3600 * 1000;

// Read-only: what each business the user can see bought on one Indian calendar day (midnight to midnight IST,
// the same day the daily purchase limit counts in). Query: date=YYYY-MM-DD, default today.
export const GET = route(async (request) => {
  const user = await requireUser();
  const date = new URL(request.url).searchParams.get("date") || businessDate();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const startMs = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - BUSINESS_DAY_OFFSET_MINUTES * 60000 : NaN;
  if (!Number.isFinite(startMs) || new Date(startMs + BUSINESS_DAY_OFFSET_MINUTES * 60000).toISOString().slice(0, 10) !== date) {
    throw badRequest("date must be a real calendar date, written YYYY-MM-DD.");
  }
  const start = new Date(startMs).toISOString();
  const end = new Date(startMs + DAY_MS).toISOString();

  const byStatus = db.prepare("SELECT status, COUNT(*) n FROM leads WHERE business_id = ? AND received_at >= ? AND received_at < ? GROUP BY status");
  const businesses = accessibleBusinesses(user).map((business) => {
    const counts = Object.fromEntries(byStatus.all(business.id, start, end).map((row) => [row.status, row.n]));
    const retrieved = counts.retrieved ?? 0;
    const pending = counts.pending ?? 0;
    const notRetrieved = counts.not_retrieved ?? 0;
    const filtered = counts.filtered ?? 0;
    return {
      business_id: business.id,
      name: business.name,
      retrieved,
      pending,
      not_retrieved: notRetrieved,
      filtered,
      total: retrieved + pending + notRetrieved + filtered,
    };
  });

  return Response.json({ date, start, end, businesses });
});
