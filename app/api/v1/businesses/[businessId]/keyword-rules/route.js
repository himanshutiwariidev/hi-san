import { db, newId, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { HttpError, readJson, route } from "@/lib/server/http";
import { cleanRule } from "@/lib/server/keywords";
import { ruleOut } from "@/lib/server/serializers";

export const GET = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const type = new URL(request.url).searchParams.get("type");
  let query = "SELECT * FROM keyword_rules WHERE business_id = ?";
  const params = [business.id];
  if (type) {
    query += " AND type = ?";
    params.push(type);
  }
  query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(...params).map(ruleOut);
  return Response.json({ items: rows, count: rows.length });
});

export const POST = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const rule = cleanRule(await readJson(request));
  const id = newId("kw");
  try {
    db.prepare(
      `INSERT INTO keyword_rules (
        id, business_id, keyword, type, match, match_type, unit, minimum_quantity, max_leads_per_day, countries, states, enabled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      business.id,
      rule.keyword,
      rule.type,
      rule.match,
      rule.match_type,
      rule.unit,
      rule.minimum_quantity,
      rule.max_leads_per_day,
      JSON.stringify(rule.countries),
      JSON.stringify(rule.states),
      now()
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) throw new HttpError(409, "duplicate_keyword", "This keyword already exists.");
    throw error;
  }
  return Response.json(ruleOut(db.prepare("SELECT * FROM keyword_rules WHERE id = ?").get(id)), { status: 201 });
});
