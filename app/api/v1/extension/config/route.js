import { db } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireExtensionBusiness } from "@/lib/server/extensionAuth";
import { parseFilterSettings } from "@/lib/server/serializers";

export const GET = route(async (request) => {
  const business = requireExtensionBusiness(request);
  const keywords = db.prepare("SELECT COUNT(*) n FROM keyword_rules WHERE business_id = ? AND enabled = 1").get(business.id).n;
  return Response.json({ business: { id: business.id, name: business.name }, settings: parseFilterSettings(business.filter_settings), active_keywords: keywords });
});
