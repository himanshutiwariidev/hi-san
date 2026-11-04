import { route } from "@/lib/server/http";
import { requireExtensionBusiness } from "@/lib/server/extensionAuth";

export const POST = route(async (request) => {
  const business = requireExtensionBusiness(request);
  return Response.json({ ok: true, business: { id: business.id, name: business.name } });
});
