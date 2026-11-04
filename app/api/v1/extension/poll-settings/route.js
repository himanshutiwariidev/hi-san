import { route } from "@/lib/server/http";

export const GET = route(async () => {
  return Response.json({
    poll_gap_ms: 7000,
    min_poll_gap_ms: 2000,
    max_poll_gap_ms: 60000,
    max_polls_in_flight: 1,
    poll_not_ok_delay_ms: 15000,
    poll_failure_backoff_ms: [15000, 30000, 60000],
    safety_brake_steps_ms: [120000, 300000, 900000],
    safety_brake_reset_ms: 1800000,
    max_safety_brake_ms: 3600000,
    list_requests_per_minute: 8,
    buy_requests_per_minute: 12,
  });
});
