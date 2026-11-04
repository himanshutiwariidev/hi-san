import { badRequest, requireString } from "./http";

const EVENTS = ["retrieved", "filtered", "not_retrieved"];

export function cleanWebhook(body) {
  const name = requireString(body.name, "Name", { max: 120 });
  const url = requireString(body.url, "URL", { max: 1000 });
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest("URL is not valid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw badRequest("URL must start with http:// or https://.");

  let headers = body.headers ?? {};
  if (typeof headers === "string") {
    try {
      headers = headers.trim() ? JSON.parse(headers) : {};
    } catch {
      throw badRequest("Headers must be valid JSON.");
    }
  }
  if (typeof headers !== "object" || Array.isArray(headers) || Object.values(headers).some((v) => typeof v !== "string")) {
    throw badRequest('Headers must be a JSON object of strings, e.g. {"Authorization": "Bearer ..."}.');
  }
  const events = (body.events ?? []).filter((e) => EVENTS.includes(e));
  if (!events.length) throw badRequest("Pick at least one lead status to send.");

  return {
    name,
    url,
    method: body.method === "PUT" ? "PUT" : "POST",
    secret: body.secret ? String(body.secret).slice(0, 200) : null,
    headers: JSON.stringify(headers),
    events: JSON.stringify(events),
    enabled: body.enabled === false ? 0 : 1,
  };
}
