import { requireBusiness, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";

export const PATCH = route(async (request, { businessId }) => {
  const user = await requireUser();
  requireBusiness(user, businessId);
  await readJson(request);
  return Response.json({ ok: true });
});
