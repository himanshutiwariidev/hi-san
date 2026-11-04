import { db } from "@/lib/server/db";
import { accessibleBusinesses, requireAdmin, requireBusiness, requireUser } from "@/lib/server/auth";
import { badRequest, readJson, requireString, route } from "@/lib/server/http";
import { businessOut } from "@/lib/server/serializers";

export const PATCH = route(async (request, { businessId }) => {
  const user = await requireUser();
  requireAdmin(user);
  const business = requireBusiness(user, businessId);
  const body = await readJson(request);
  const name = requireString(body.name, "Business name", { max: 120 });
  db.prepare("UPDATE businesses SET name = ? WHERE id = ?").run(name, business.id);
  return Response.json(businessOut({ ...business, name }));
});

export const DELETE = route(async (_request, { businessId }) => {
  const user = await requireUser();
  requireAdmin(user);
  const business = requireBusiness(user, businessId);
  if (accessibleBusinesses(user).length <= 1) throw badRequest("You need at least one business.");
  db.prepare("DELETE FROM businesses WHERE id = ?").run(business.id);
  return new Response(null, { status: 204 });
});
