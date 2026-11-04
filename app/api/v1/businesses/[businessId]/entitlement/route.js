import { requireBusiness, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const GET = route(async (_request, { businessId }) => {
  const user = await requireUser();
  const business = requireBusiness(user, businessId);

  let ent = {};
  try {
    ent = JSON.parse(business.entitlement || "{}");
  } catch {}

  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const coverageEndsAt = ent.coverage_ends_at ?? new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();
  const paidEndsAt = ent.paid_coverage_ends_at ?? coverageEndsAt;

  return Response.json({
    business_id: business.id,
    business_status: "active",
    billing_state: "active",
    operational_access: true,
    plan_name: ent.plan_name ?? "Pro Unlimited",
    plan_price_paise: 0,
    daily_lead_limit: ent.daily_lead_limit ?? 500,
    checked_at: checkedAt,
    received_at: checkedAt,
    coverage_ends_at: coverageEndsAt,
    paid_coverage_ends_at: paidEndsAt,
    trial_ends_at: null,
  });
});
