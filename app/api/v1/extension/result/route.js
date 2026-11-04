import { recordResult } from "@/lib/server/engine";
import { notFound, readJson, requireString, route } from "@/lib/server/http";
import { requireExtensionBusiness } from "@/lib/server/extensionAuth";
import { leadOut } from "@/lib/server/serializers";

// Body: { external_id, success, buyer_name?, company?, email?, phone?, has_whatsapp?, error? }
export const POST = route(async (request) => {
  const business = requireExtensionBusiness(request);
  const body = await readJson(request);
  const lead = recordResult(business, requireString(body.external_id, "external_id"), body);
  if (!lead) throw notFound("Lead not found. Evaluate it before reporting a result.");
  return Response.json(leadOut(lead));
});
