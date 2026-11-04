import { db, newId, now, transaction } from "@/lib/server/db";
import { requireBusiness, requireUser } from "@/lib/server/auth";
import { badRequest, readJson, route } from "@/lib/server/http";
import { cleanRule } from "@/lib/server/keywords";

// Body: { rows: [{ keyword, match?, countries? }] } — the UI parses the CSV.
export const POST = route(async (request, { businessId }) => {
  const business = requireBusiness(await requireUser(), businessId);
  const { rows } = await readJson(request);
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest("The file has no keyword rows.");
  if (rows.length > 5000) throw badRequest("Import at most 5000 keywords at a time.");

  const result = { total_rows: rows.length, imported_rows: 0, skipped_rows: 0, errors: [] };
  const insert = db.prepare(
    "INSERT OR IGNORE INTO keyword_rules (id, business_id, keyword, match, countries, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
  );
  transaction(() => {
    rows.forEach((row, index) => {
      try {
        const rule = cleanRule(row);
        const { changes } = insert.run(newId("kw"), business.id, rule.keyword, rule.match, JSON.stringify(rule.countries), now());
        if (changes) result.imported_rows += 1;
        else result.skipped_rows += 1;
      } catch (error) {
        if (result.errors.length < 20) result.errors.push(`Row ${index + 1}: ${error.message}`);
      }
    });
  });
  return Response.json(result);
});
