import { destroySession } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const POST = route(async () => {
  await destroySession();
  return new Response(null, { status: 204 });
});
