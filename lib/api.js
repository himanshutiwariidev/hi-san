// Browser client for the /api/v1 routes. Auth rides on the httpOnly session cookie.
export class ApiClientError extends Error {
  constructor(error, status) {
    super(error.message);
    this.error = error;
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth") && typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiClientError(data?.error ?? { code: `http_${response.status}`, message: "Request failed. Please try again." }, response.status);
  }
  return data;
}

const post = (path, body) => request(path, { method: "POST", body: body ?? {} });
const patch = (path, body) => request(path, { method: "PATCH", body });
const put = (path, body) => request(path, { method: "PUT", body });
const del = (path) => request(path, { method: "DELETE" });
const biz = (id) => `/businesses/${id}`;

export const apiClient = {
  login: (body) => post("/auth/login", body),
  signup: (body) => post("/auth/signup", body),
  logout: () => post("/auth/logout"),
  me: () => request("/me"),
  updateMe: (body) => patch("/me", body),
  changeMyPassword: (body) => post("/me/change-password", body),

  listBusinesses: () => request("/businesses"),
  createBusiness: (body) => post("/businesses", body),
  updateBusiness: (id, body) => patch(biz(id), body),
  deleteBusiness: (id) => del(biz(id)),

  getFilterSettings: (id) => request(`${biz(id)}/filter-settings`),
  updateFilterSettings: (id, body) => put(`${biz(id)}/filter-settings`, body),

  listKeywordRules: (id) => request(`${biz(id)}/keyword-rules`),
  createKeywordRule: (id, body) => post(`${biz(id)}/keyword-rules`, body),
  updateKeywordRule: (id, ruleId, body) => patch(`${biz(id)}/keyword-rules/${ruleId}`, body),
  deleteKeywordRule: (id, ruleId) => del(`${biz(id)}/keyword-rules/${ruleId}`),
  importKeywordRules: (id, rows) => post(`${biz(id)}/keyword-rules/import`, { rows }),

  listLeads: (id, { since, until, limit } = {}) => {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    if (limit) params.set("limit", String(limit));
    return request(`${biz(id)}/leads?${params}`);
  },
  getLeadLogs: (id, leadId) => request(`${biz(id)}/leads/${leadId}/logs`),

  listWebhooks: (id) => request(`${biz(id)}/webhooks`),
  createWebhook: (id, body) => post(`${biz(id)}/webhooks`, body),
  updateWebhook: (id, hookId, body) => patch(`${biz(id)}/webhooks/${hookId}`, body),
  deleteWebhook: (id, hookId) => del(`${biz(id)}/webhooks/${hookId}`),
  testWebhook: (id, hookId) => post(`${biz(id)}/webhooks/${hookId}/test`),

  getExtension: (id) => request(`${biz(id)}/extension`),
  rotateExtensionKey: (id) => post(`${biz(id)}/extension`),

  listUsers: () => request("/users"),
  createUser: (body) => post("/users", body),
  updateUser: (id, body) => patch(`/users/${id}`, body),
  resetUserPassword: (id, password) => post(`/users/${id}/reset-password`, { password }),
  deleteUser: (id) => del(`/users/${id}`),
};

export function errorMessage(error) {
  return error instanceof ApiClientError ? error.error.message : "Something went wrong. Please try again.";
}
