import { db } from "@/lib/server/db";
import { accessibleBusinesses, requireAdmin, requireUser } from "@/lib/server/auth";
import { createBusiness } from "@/lib/server/businesses";
import { readJson, requireString, route } from "@/lib/server/http";
import { businessOut } from "@/lib/server/serializers";

export const GET = route(async () => {
  const user = await requireUser();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const count = db.prepare("SELECT COUNT(*) n FROM leads WHERE business_id = ? AND status = 'retrieved' AND retrieved_at >= ?");
  return Response.json(accessibleBusinesses(user).map((b) => businessOut(b, { leads_this_month: count.get(b.id, monthStart).n })));
});

export const POST = route(async (request) => {
  const user = await requireUser();
  requireAdmin(user);
  const body = await readJson(request);
  const business = createBusiness(user.tenant_id, requireString(body.name, "Business name", { max: 120 }));
  return Response.json(businessOut(business, { leads_this_month: 0 }), { status: 201 });
});
