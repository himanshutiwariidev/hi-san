export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = "invalid_request") => new HttpError(400, code, message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const forbidden = (message = "You do not have access to this resource.") => new HttpError(403, "forbidden", message);

// Wraps a route handler so thrown HttpErrors become the same JSON error shape the client expects.
export function route(handler) {
  return async (request, context) => {
    try {
      const params = context?.params ? await context.params : {};
      return await handler(request, params);
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
      }
      console.error(error);
      return Response.json({ error: { code: "server_error", message: "Something went wrong. Please try again." } }, { status: 500 });
    }
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

export function requireString(value, field, { min = 1, max = 500 } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min) throw badRequest(`${field} is required.`);
  if (text.length > max) throw badRequest(`${field} is too long.`);
  return text;
}
