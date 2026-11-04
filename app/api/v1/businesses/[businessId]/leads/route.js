import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { expireStalePending } from "@/lib/server/engine";
import { route } from "@/lib/server/http";
import { leadOut } from "@/lib/server/serializers";

// Query: since (ISO), until (ISO), limit (max 5000). Further filtering happens in the UI.
export const GET = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  expireStalePending(business.id);
  const params = new URL(request.url).searchParams;
  const since = params.get("since") ?? "0000";
  const until = params.get("until") ?? "9999";
  const limit = Math.min(5000, Number(params.get("limit")) || 2000);
  const rows = db
    .prepare("SELECT * FROM leads WHERE business_id = ? AND received_at >= ? AND received_at <= ? ORDER BY received_at DESC LIMIT ?")
    .all(business.id, since, until, limit);
  return Response.json(rows.map(leadOut));
});
