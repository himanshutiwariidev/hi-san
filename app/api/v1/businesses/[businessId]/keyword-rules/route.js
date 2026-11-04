import { db, newId, now } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { HttpError, readJson, route } from "@/lib/server/http";
import { cleanRule } from "@/lib/server/keywords";
import { ruleOut } from "@/lib/server/serializers";

export const GET = route(async (_request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  return Response.json(db.prepare("SELECT * FROM keyword_rules WHERE business_id = ? ORDER BY created_at").all(business.id).map(ruleOut));
});

export const POST = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const rule = cleanRule(await readJson(request));
  const id = newId("kw");
  try {
    db.prepare("INSERT INTO keyword_rules (id, business_id, keyword, match, countries, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").run(
      id, business.id, rule.keyword, rule.match, JSON.stringify(rule.countries), now()
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) throw new HttpError(409, "duplicate_keyword", "This keyword already exists.");
    throw error;
  }
  return Response.json(ruleOut(db.prepare("SELECT * FROM keyword_rules WHERE id = ?").get(id)), { status: 201 });
});
