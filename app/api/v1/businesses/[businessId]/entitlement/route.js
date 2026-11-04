import { requireBusiness, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const GET = route(async (_request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);

  // Parse custom entitlement if saved in DB, or grant default full operational access
  let ent = {};
  try {
    ent = JSON.parse(business.entitlement || "{}");
  } catch {}

  const now = Date.now();
  const endsAt = ent.ends_at ?? (now + 365 * 24 * 60 * 60 * 1000); // 1 year default

  return Response.json({
    business_id: business.id,
    operational_access: ent.operational_access !== undefined ? Boolean(ent.operational_access) : true,
    ends_at: endsAt,
    plan_name: ent.plan_name ?? "Pro Unlimited",
    daily_lead_limit: ent.daily_lead_limit ?? 500,
    received_at: now,
  });
});

