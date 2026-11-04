import { db } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { notFound, readJson, route } from "@/lib/server/http";
import { cleanRule } from "@/lib/server/keywords";
import { ruleOut } from "@/lib/server/serializers";

function findRule(businessId, ruleId) {
  const rule = db.prepare("SELECT * FROM keyword_rules WHERE id = ? AND business_id = ?").get(ruleId, businessId);
  if (!rule) throw notFound("Keyword rule not found.");
  return rule;
}

export const PATCH = route(async (request, { businessId, ruleId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const existing = findRule(business.id, ruleId);
  const body = await readJson(request);
  const merged = cleanRule({ ...ruleOut(existing), ...body });
  const enabled = body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0;
  db.prepare("UPDATE keyword_rules SET keyword = ?, match = ?, countries = ?, enabled = ? WHERE id = ?").run(
    merged.keyword, merged.match, JSON.stringify(merged.countries), enabled, existing.id
  );
  return Response.json(ruleOut(findRule(business.id, ruleId)));
});

export const DELETE = route(async (_request, { businessId, ruleId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  findRule(business.id, ruleId);
  db.prepare("DELETE FROM keyword_rules WHERE id = ?").run(ruleId);
  return new Response(null, { status: 204 });
});
