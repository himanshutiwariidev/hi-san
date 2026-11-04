import { db } from "@/lib/server/db";
import { hashPassword, requireUser, validatePassword, verifyPassword } from "@/lib/server/auth";
import { HttpError, readJson, route } from "@/lib/server/http";

export const POST = route(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  if (!verifyPassword(String(body.current_password ?? ""), user.password_hash)) {
    throw new HttpError(400, "invalid_password", "Current password is incorrect.");
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(validatePassword(body.new_password)), user.id);
  return new Response(null, { status: 204 });
});
