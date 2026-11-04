// ../../packages/schemas/dist/index.js
var DEFAULT_DAILY_CAPTURE_LIMIT = 11;
function anyContactModeIgnoresChannels(mode) {
  return mode === "one_verified" || mode === "one_available_one_verified";
}
var EMAIL_MODE_OPTIONS = [
  { value: "off", label: "Off", hint: "Email is not checked." },
  { value: "available", label: "Available", hint: "The lead must show an email address (verified or not)." },
  { value: "verified", label: "Verified", hint: "IndiaMART must mark the buyer's email as verified." }
];
var PHONE_MODE_OPTIONS = [
  { value: "off", label: "Off", hint: "Phone is not checked." },
  { value: "available", label: "Available", hint: "The lead must show a phone number or an active WhatsApp (verified or not)." },
  { value: "verified", label: "Verified", hint: "IndiaMART must mark the buyer's mobile number as verified." }
];
var ANY_CONTACT_OPTIONS = [
  { value: "off", label: "Off", hint: "Email and Phone are checked separately: every one that is not Off must pass." },
  {
    value: "required",
    label: "Either one",
    hint: "The Email OR the Phone setting must pass, not both. With both Off, the lead must show at least one contact."
  },
  {
    value: "one_verified",
    label: "Any Verified",
    hint: "IndiaMART must have verified the buyer's email or mobile number. Email and Phone settings are ignored."
  },
  {
    value: "one_available_one_verified",
    label: "One Available + One Verified",
    hint: "Email and phone must both be shown and at least one must be verified by IndiaMART. Email and Phone settings are ignored."
  }
];
var FILTER_CHECK_ORDER = [
  { title: "Readable lead", detail: "Leads without a real title are skipped." },
  { title: "Lead age", detail: "Older than Max lead age is skipped." },
  { title: "Country", detail: "Must be one of the allowed countries (if any are set)." },
  { title: "Indian state", detail: "Leads from India must come from an allowed state (if any are set)." },
  {
    title: "Contact",
    detail: 'Email setting, then Phone setting, then Any Contact decides how they combine. With "Trusted buyers skip contact filter" on, a buyer on IndiaMART 1+ years with any email or phone shown or verified passes this check; every other check still applies.'
  },
  { title: "GST verified", detail: 'Only when "Only GST-verified buyers" is on.' },
  { title: "Buyer membership", detail: "Buyer must be on IndiaMART for at least the minimum months." },
  { title: "Category", detail: "Blocked categories are skipped; with an allow list, the category must be on it." },
  { title: "Excluded keywords", detail: "Any excluded keyword in the title skips the lead." },
  { title: "Keyword match", detail: "A keyword must match the title, with its own country, state, unit and minimum quantity." },
  { title: "Retail", detail: "Retail leads are off, and the lead is below the retail quantity or marked Retail by IndiaMART." },
  { title: "Daily limits", detail: "Each keyword's limit, then the business limit (never above the account's daily cap)." }
];
function normalizeChannelContactMode(value) {
  if (value === "available") {
    return "available";
  }
  if (value === "verified" || value === "verified_only" || value === "required" || value === "available_and_verified") {
    return "verified";
  }
  return "off";
}
function normalizeAnyContactMode(value) {
  return value === "required" || value === "one_verified" || value === "one_available_one_verified" ? value : "off";
}
var SKIP_REASON_LABELS = {
  country_not_allowed: "Country Not Matched",
  contact_requirement_not_met: "Contact Not Matched",
  negative_keyword_match: "Excluded Keyword",
  no_positive_keyword_match: "Keyword Not Matched",
  quantity_below_minimum: "Quantity Not Matched",
  unit_mismatch: "Unit Not Matched",
  retail_lead: "Retail Lead",
  daily_limit_reached: "Daily Limit Reached",
  keyword_daily_limit_reached: "Keyword Limit Reached",
  invalid_title: "Unreadable Lead",
  lead_too_old: "Lead Too Old",
  state_not_allowed: "State Not Matched",
  keyword_country_mismatch: "Keyword Country Not Matched",
  keyword_state_mismatch: "Keyword State Not Matched",
  gst_not_verified: "GST Not Verified",
  buyer_too_new: "Buyer Too New",
  category_not_allowed: "Category Not Matched",
  indiamart_not_retrieved: "IndiaMART Side Lead Not Retrieved"
};
var BUSINESS_SKIP_REASON_OPTIONS = Object.entries(SKIP_REASON_LABELS).filter(([reason]) => reason !== "indiamart_not_retrieved");

// src/fast-buy.ts
var SAFETY_BRAKE_STEPS_MS = [2 * 6e4, 5 * 6e4, 15 * 6e4];
var SAFETY_BRAKE_RESET_MS = 30 * 6e4;
var MAX_SAFETY_BRAKE_MS = 60 * 6e4;
var DEFAULT_BUY_RATE_LIMIT_COOLDOWN_SECONDS = SAFETY_BRAKE_STEPS_MS[0] / 1e3;
function safetyBrakeActive(brake, now = Date.now()) {
  return Boolean(brake && brake.until > now);
}
var SAFETY_BRAKE_STORAGE_KEY = "imSafetyBrake";
var SAFETY_BRAKE_REASON_TEXT = {
  list_rate_limited: "IndiaMART rate-limited the lead list",
  buy_rate_limited: "IndiaMART rate-limited a buy",
  list_activity_warning: "IndiaMART reported high activity",
  page_list_rate_limited: "IndiaMART rate-limited the page's lead list",
  indiamart_activity_warning: "IndiaMART showed a high-activity warning"
};
function safetyBrakeNotice(brake, now = Date.now()) {
  if (!brake || !safetyBrakeActive(brake, now)) {
    return null;
  }
  const resumes = new Date(brake.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const why = SAFETY_BRAKE_REASON_TEXT[brake.reason] ?? "IndiaMART pushed back";
  return `Paused for account safety: ${why}. Polling and buying resume at ${resumes}.`;
}

// src/activity-log.ts
function relativeTime(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1e3));
  if (!Number.isFinite(seconds)) {
    return "";
  }
  if (seconds < 45) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return new Date(iso).toLocaleDateString(void 0, { day: "numeric", month: "short" });
}

// src/expired-interest.ts
var EXPIRED_INTEREST_ENABLED_KEY = "expiredInterestEnabled";
var EXPIRED_INTEREST_LOG_KEY = "expiredInterestLog";
var EXPIRED_INTEREST_STATS_KEY = "expiredInterestStats";
var EXPIRED_INTEREST_STATUS_KEY = "expiredInterestStatus";
var EXPIRED_LOCK_STALE_MS = 3 * 6e4;
function emptyStats(utcDate) {
  return { utc_date: utcDate, sent_today: 0, sent_total: 0, last_scan_at: null, last_scan: null, last_error: null };
}
function statsForDay(stored, utcDate) {
  const stats = stored && typeof stored === "object" ? stored : null;
  if (!stats) {
    return emptyStats(utcDate);
  }
  return stats.utc_date === utcDate ? stats : { ...stats, utc_date: utcDate, sent_today: 0 };
}
function statusLabel(status) {
  switch (status) {
    case "interested":
      return "Interested \u2713";
    case "already":
      return "Already shortlisted";
    default:
      return "Failed";
  }
}
var RUN_STATUS_TEXT = {
  running: "Running",
  stopped: "Stopped",
  not_signed_in: "Sign in to start",
  billing_not_confirmed: "Waiting for plan check",
  filter_config_not_loaded: "Keywords not loaded yet",
  safety_brake: "Paused for account safety",
  other_tab: "Running in another IndiaMART tab",
  not_logged_in_indiamart: "Log in to IndiaMART",
  list_failed: "Could not read expired leads; retrying"
};
function runStatusText(state) {
  return RUN_STATUS_TEXT[state ?? ""] ?? (state || "Open an IndiaMART BuyLeads tab");
}

// src/lead-decision.ts
function utcDateString(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// src/rank-log-view.ts
var ACTIVITY_PANEL_VIEW_KEY = "activityPanelView";
function readRankLog(value) {
  return Array.isArray(value) ? value : [];
}
function rankLogRow(entry, tag = "li") {
  const item = document.createElement(tag);
  item.className = "rank-row";
  const title = document.createElement("strong");
  title.textContent = entry.title;
  const meta = document.createElement("div");
  meta.className = "rank-meta";
  const badge = document.createElement("span");
  badge.className = "rank-badge";
  badge.dataset.status = entry.status;
  badge.textContent = entry.status === "failed" && entry.error ? `${statusLabel(entry.status)} \xB7 ${entry.error}` : statusLabel(entry.status);
  const parts = [entry.country, entry.keywords.length ? `Keyword: ${entry.keywords.join(", ")}` : null, relativeTime(entry.at)].filter(
    (part) => Boolean(part)
  );
  meta.append(badge, ...parts.map((part) => Object.assign(document.createElement("span"), { textContent: part })));
  item.append(title, meta);
  return item;
}

// src/popup-rank.ts
var KEYS = [EXPIRED_INTEREST_ENABLED_KEY, EXPIRED_INTEREST_LOG_KEY, EXPIRED_INTEREST_STATS_KEY, EXPIRED_INTEREST_STATUS_KEY];
var STATUS_STALE_MS = 15e4;
var POPUP_LOG_ROWS = 5;
function element(selector) {
  return document.querySelector(selector);
}
function interestStatusLine(enabled, status, now = Date.now()) {
  if (!enabled) {
    return { text: "Stopped", tone: "" };
  }
  const at = Date.parse(status?.at ?? "");
  if (!status || !Number.isFinite(at) || now - at > STATUS_STALE_MS) {
    return { text: "Waiting: open an IndiaMART BuyLeads tab", tone: "warn" };
  }
  return { text: runStatusText(status.state), tone: status.state === "running" ? "ok" : "warn" };
}
function openActivityPanel(view) {
  void chrome.storage.local.set({ [ACTIVITY_PANEL_VIEW_KEY]: view }).catch(() => void 0).finally(() => {
    chrome.windows.getCurrent((window2) => {
      if (window2.id !== void 0) {
        void chrome.sidePanel.open({ windowId: window2.id }).then(() => globalThis.close());
      }
    });
  });
}
async function paint() {
  const values = await chrome.storage.local.get(KEYS).catch(() => ({}));
  const enabled = values[EXPIRED_INTEREST_ENABLED_KEY] === true;
  const toggle = element("#interest-toggle");
  if (!toggle) {
    return;
  }
  toggle.textContent = enabled ? "Stop" : "Start";
  toggle.classList.toggle("stopped", !enabled);
  const line = interestStatusLine(enabled, values[EXPIRED_INTEREST_STATUS_KEY]);
  const status = element("#interest-status");
  status.textContent = line.text;
  status.dataset.tone = line.tone;
  const stats = statsForDay(values[EXPIRED_INTEREST_STATS_KEY], utcDateString());
  element("#interest-today").textContent = String(stats.sent_today);
  element("#interest-total").textContent = String(stats.sent_total);
  const scan = stats.last_scan;
  element("#interest-scan").textContent = scan && stats.last_scan_at ? `Last scan ${relativeTime(stats.last_scan_at)}: A ${scan.A} \xB7 B ${scan.B} \xB7 C ${scan.C} \xB7 already shortlisted ${scan.already_shortlisted}` : "No scan yet";
  const error = element("#interest-error");
  error.hidden = !stats.last_error;
  error.textContent = stats.last_error ? `Last error: ${stats.last_error}` : "";
  const log = readRankLog(values[EXPIRED_INTEREST_LOG_KEY]);
  element("#interest-log").replaceChildren(...log.slice(0, POPUP_LOG_ROWS).map((entry) => rankLogRow(entry)));
  element("#interest-log-empty").hidden = log.length > 0;
}
function initLeadRankTab() {
  const toggle = element("#interest-toggle");
  if (!toggle) {
    return;
  }
  toggle.addEventListener("click", async () => {
    const values = await chrome.storage.local.get([EXPIRED_INTEREST_ENABLED_KEY]);
    await chrome.storage.local.set({ [EXPIRED_INTEREST_ENABLED_KEY]: values[EXPIRED_INTEREST_ENABLED_KEY] !== true });
  });
  element("#interest-open-panel")?.addEventListener("click", () => openActivityPanel("rank"));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && KEYS.some((key) => key in changes)) {
      void paint();
    }
  });
  window.setInterval(() => void paint(), 15e3);
  void paint();
}

// src/billing-access.ts
var ENTITLEMENT_FRESH_MS = 65e3;
var ENTITLEMENT_OUTAGE_GRACE_MS = 10 * 6e4;
function entitlementWindow(entitlement) {
  const checkedAt = Date.parse(entitlement?.checked_at || "");
  const receivedAt = Date.parse(entitlement?.received_at || "") || checkedAt;
  const end = Date.parse(entitlement?.coverage_ends_at || "");
  const skew = Number.isFinite(checkedAt) ? receivedAt - checkedAt : 0;
  return { receivedAt, endsAt: Number.isFinite(end) ? end + skew : Infinity };
}
function resolveSelectedBusinessId(state) {
  const session = state.authSession;
  const selected = state.selectedBusinessId;
  return typeof selected === "string" && selected || session?.default_business?.id || null;
}
var FALLBACK_DENIED_MESSAGE = "No active plan or trial for this business. Capture is paused.";
function accessDeniedMessage(entitlement) {
  if (entitlement?.access_message) return entitlement.access_message;
  if (entitlement?.access_block_reason === "business_inactive") {
    return "This business is inactive. Contact your account administrator.";
  }
  return FALLBACK_DENIED_MESSAGE;
}
function billingAllows(state, now = Date.now()) {
  const session = state.authSession;
  const entitlement = state.billingEntitlement;
  const businessId = resolveSelectedBusinessId(state);
  const { receivedAt, endsAt } = entitlementWindow(entitlement);
  const maxAgeMs = entitlement?.api_unreachable_at ? ENTITLEMENT_OUTAGE_GRACE_MS : ENTITLEMENT_FRESH_MS;
  return Boolean(session?.access_token && entitlement?.business_id === businessId && entitlement?.operational_access && Number.isFinite(receivedAt) && now - receivedAt < maxAgeMs && receivedAt <= now + 5e3 && endsAt > now);
}

// src/bot-presence.ts
var POLL_FRESH_MS = 15e4;
function pollStillRunning(poll) {
  if (poll.ok) return true;
  const idle = poll.idle ?? "";
  return idle === "another_tab_is_polling" || idle === "filter_config_stale" || idle.startsWith("safety_brake") || (poll.error ?? "").startsWith("IndiaMART pushed back");
}
function localBotState(botEnabled, poll, now = Date.now()) {
  if (!botEnabled) return "idle";
  const at = Date.parse(poll?.at ?? "");
  const fresh = Number.isFinite(at) && now - at < POLL_FRESH_MS;
  return fresh && pollStillRunning(poll) ? "running" : "stale";
}
function staleReason(poll, now = Date.now()) {
  const at = Date.parse(poll?.at ?? "");
  if (!poll || !Number.isFinite(at) || now - at >= POLL_FRESH_MS) {
    return "Started, but no IndiaMART BuyLead tab is polling. Open one to resume.";
  }
  if (poll.idle === "billing_not_confirmed") return "Started, waiting for the plan check.";
  if (poll.idle === "filter_config_not_loaded") return "Started, waiting for filter settings.";
  if (poll.idle === "not_signed_in") return "Started, but signed out.";
  return `Started, but IndiaMART polling is failing${poll.status ? ` (HTTP ${poll.status})` : ""}.`;
}
function formatAgo(value, now = Date.now()) {
  const at = Date.parse(value ?? "");
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((now - at) / 1e3));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}
function describeSystem(system) {
  const where = [system.browser, system.os].filter(Boolean).join(" on ");
  return [system.user_name, where].filter(Boolean).join(" \xB7 ");
}
function botPresenceView(local, poll, presence, businessId, now = Date.now()) {
  const receivedAt = Date.parse(presence?.received_at ?? "");
  const current = presence?.business_id === businessId && Number.isFinite(receivedAt) && now - receivedAt < 75e3;
  const others = current ? presence.systems.filter((system) => !system.this_device) : [];
  const othersRunning = others.filter((system) => system.state === "running");
  const othersStale = others.filter((system) => system.state === "stale");
  if (local === "running") {
    const detail = othersRunning.length ? `Also running on ${othersRunning.length} other system${othersRunning.length > 1 ? "s" : ""}: ${othersRunning.map(describeSystem).join(", ")}` : "Polling IndiaMART for new leads.";
    return { tone: "running", label: "Running on your system", detail };
  }
  if (othersRunning.length) {
    const first = othersRunning[0];
    const more = othersRunning.length > 1 ? ` +${othersRunning.length - 1} more` : "";
    return {
      tone: "other",
      label: "Running on other system",
      detail: `${describeSystem(first) || "Another browser"}${more} \xB7 seen ${formatAgo(first.last_seen_at, now)}`
    };
  }
  if (local === "stale") return { tone: "stale", label: "Stale on your system", detail: staleReason(poll, now) };
  if (othersStale.length) {
    const first = othersStale[0];
    return {
      tone: "stale",
      label: "Stale on other system",
      detail: `${describeSystem(first) || "Another browser"} stopped reporting ${formatAgo(first.last_seen_at, now)}.`
    };
  }
  return { tone: "idle", label: "Idle", detail: "No system is running the bot for this business." };
}

// src/config.ts
var API_BASE_URL = "https://hi-san.medishipper.com/api";
var DASHBOARD_URL = "https://hi-san.medishipper.com";

// src/popup.ts
var MIN_DAILY_CAPTURE_LIMIT = 1;
var maxDailyCaptureLimit = DEFAULT_DAILY_CAPTURE_LIMIT;
async function readLocalState() {
  const state = await chrome.storage.local.get([
    "selectedBusinessName",
    "selectedBusinessId",
    "businesses",
    "lastSyncAttemptAt",
    "lastSyncError",
    "authSession",
    "botEnabled",
    "todayCounts",
    "cachedFilterSettings"
  ]);
  const businesses = Array.isArray(state.businesses) ? state.businesses : [];
  const selectedBusinessId = state.selectedBusinessId ?? state.authSession?.default_business?.id ?? businesses[0]?.id ?? "";
  const selectedBusinessName = state.selectedBusinessName ?? businesses.find((business) => business.id === selectedBusinessId)?.name ?? state.authSession?.default_business?.name ?? "Not bound";
  return {
    businesses,
    selectedBusinessId,
    selectedBusinessName,
    lastSync: state.lastSyncAttemptAt ?? "Never",
    lastSyncError: state.lastSyncError ?? "",
    authSession: state.authSession ?? null,
    botEnabled: Boolean(state.botEnabled),
    todayCounts: state.todayCounts ?? null,
    cachedFilterSettings: state.cachedFilterSettings ?? null
  };
}
function formatDateTime(value) {
  if (!value || value === "Never") {
    return "Never";
  }
  const date = new Date(parseApiTimestampAsUtc(value));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: systemTimeZone
  }).format(date);
  return `${formatted} ${formatTimeZoneLabel(systemTimeZone)}`;
}
function parseApiTimestampAsUtc(value) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed;
  }
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`;
}
function formatTimeZoneLabel(timeZone) {
  const labels = {
    "Asia/Calcutta": "IST",
    "Asia/Kolkata": "IST"
  };
  return labels[timeZone] ?? timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone;
}
function normalizeDailyCaptureLimit(limit) {
  if (!Number.isFinite(limit)) {
    return maxDailyCaptureLimit;
  }
  return Math.min(maxDailyCaptureLimit, Math.max(MIN_DAILY_CAPTURE_LIMIT, Math.round(limit)));
}
var SERVER_UNREACHABLE_MESSAGE = `Cannot reach the server (${API_BASE_URL}). Captured leads are kept and sent once it is back.`;
async function checkSession(authSession) {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/me`, {
      headers: { authorization: `Bearer ${authSession.access_token}` }
    });
    if (response.ok) {
      return "valid";
    }
    return response.status === 401 || response.status === 403 ? "invalid" : "unreachable";
  } catch {
    return "unreachable";
  }
}
async function fetchApi(url, init) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(SERVER_UNREACHABLE_MESSAGE);
  }
}
async function login(email, password) {
  const response = await fetchApi(`${API_BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? "Login failed.");
  }
  return await response.json();
}
async function requestApi(path, authSession) {
  const response = await fetchApi(`${API_BASE_URL}/v1${path}`, {
    headers: { authorization: `Bearer ${authSession.access_token}` },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return await response.json();
}
async function listBusinesses(authSession) {
  return requestApi("/businesses", authSession);
}
async function countKeywordRules(authSession, businessId, type) {
  let cursor = null;
  let count = 0;
  do {
    const query = new URLSearchParams({ type, is_active: "true", limit: "500" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const response = await requestApi(
      `/businesses/${businessId}/keyword-rules?${query.toString()}`,
      authSession
    );
    count += response.items.length;
    cursor = response.next_cursor ?? null;
  } while (cursor);
  return count;
}
async function refreshBusinesses(authSession) {
  try {
    const businesses = await listBusinesses(authSession);
    const state = await chrome.storage.local.get(["selectedBusinessId"]);
    const selectedBusiness = businesses.find((business) => business.id === state.selectedBusinessId) ?? businesses.find((business) => business.id === authSession.default_business.id) ?? businesses[0];
    if (selectedBusiness) {
      const nextSession = {
        ...authSession,
        default_business: { id: selectedBusiness.id, name: selectedBusiness.name }
      };
      await chrome.storage.local.set({
        authSession: nextSession,
        businesses,
        selectedBusinessId: selectedBusiness.id,
        selectedBusinessName: selectedBusiness.name
      });
    } else {
      await chrome.storage.local.set({ businesses: [] });
    }
    return businesses;
  } catch {
    const fallback = authSession.default_business ? [authSession.default_business] : [];
    await chrome.storage.local.set({ businesses: fallback });
    return fallback;
  }
}
async function selectBusiness(businessId) {
  const state = await readLocalState();
  const selectedBusiness = state.businesses.find((business) => business.id === businessId);
  if (!state.authSession || !selectedBusiness) {
    return;
  }
  await chrome.storage.local.set({
    authSession: {
      ...state.authSession,
      default_business: { id: selectedBusiness.id, name: selectedBusiness.name }
    },
    selectedBusinessId: selectedBusiness.id,
    selectedBusinessName: selectedBusiness.name,
    lastSyncError: ""
  });
  await notifyActiveTabBusinessChanged();
  await renderPopup();
}
async function readFilterSettings(authSession, businessId) {
  try {
    const settings = await requestApi(`/businesses/${businessId}/filter-settings`, authSession);
    await chrome.storage.local.set({ cachedFilterSettings: { businessId, settings } });
    return settings;
  } catch {
    return null;
  }
}
async function updateFilterSettings(authSession, businessId, payload) {
  const response = await fetchApi(`${API_BASE_URL}/v1/businesses/${businessId}/filter-settings`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${authSession.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Filter settings save failed with ${response.status}`);
  }
  return await response.json();
}
function setLoginPending(isPending) {
  const button = document.querySelector("#login");
  const emailInput = document.querySelector("#email");
  const passwordInput = document.querySelector("#password");
  const status = document.querySelector("#login-status");
  button.disabled = isPending;
  emailInput.disabled = isPending;
  passwordInput.disabled = isPending;
  button.textContent = isPending ? "Logging in..." : "Login";
  status.textContent = isPending ? "Logging in... verifying with backend." : "";
}
var ACTIVE_TAB_STORAGE_KEY = "popupActiveTab";
var activeTab = readStoredTab();
function readStoredTab() {
  try {
    return window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) === "rank" ? "rank" : "config";
  } catch {
    return "config";
  }
}
function activateTab(tabName) {
  activeTab = tabName;
  try {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabName);
  } catch {
  }
  document.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tabName}`;
  });
}
function bindTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.tab;
      if (tabName) {
        activateTab(tabName);
      }
    });
  });
}
async function saveBotEnabled(enabled) {
  await chrome.storage.local.set({ botEnabled: enabled });
  await notifyActiveTabBotStateChanged(enabled);
}
async function notifyActiveTabBusinessChanged() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type: "BUSINESS_SELECTION_CHANGED" }).catch(() => void 0);
}
async function notifyActiveTabBotStateChanged(enabled) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type: "BOT_STATE_CHANGED", enabled }).catch(() => void 0);
}
function readIncludeRetailLeadsFromControl() {
  return document.querySelector("#include-retail-leads").checked;
}
function setIncludeRetailLeadsControl(include) {
  document.querySelector("#include-retail-leads").checked = include;
}
function readTrustedBuyerBypassFromControl() {
  return document.querySelector("#trusted-buyer-bypass").checked;
}
function setTrustedBuyerBypassControl(enabled) {
  document.querySelector("#trusted-buyer-bypass").checked = enabled;
}
var CONTACT_SELECTS = [
  ["#email-mode", EMAIL_MODE_OPTIONS],
  ["#phone-mode", PHONE_MODE_OPTIONS],
  ["#any-contact-mode", ANY_CONTACT_OPTIONS]
];
function buildContactControls() {
  for (const [selector, options] of CONTACT_SELECTS) {
    const select = document.querySelector(selector);
    if (!select.options.length) {
      select.append(...options.map((option) => new Option(option.label, option.value)));
    }
    select.onchange = paintContactHints;
  }
  const list = document.querySelector("#filter-check-order");
  if (!list.children.length) {
    for (const step of FILTER_CHECK_ORDER) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = step.title;
      item.append(title, ` \u2014 ${step.detail}`);
      list.append(item);
    }
  }
}
function paintContactHints() {
  for (const [selector, options] of CONTACT_SELECTS) {
    const select = document.querySelector(selector);
    document.getElementById(select.dataset.hint).textContent = options.find((option) => option.value === select.value)?.hint ?? "";
  }
  const ignored = anyContactModeIgnoresChannels(readContactModesFromControls().any_contact_mode);
  for (const selector of ["#email-mode", "#phone-mode"]) {
    document.querySelector(selector).disabled = ignored;
  }
}
function readContactModesFromControls() {
  return {
    email_mode: document.querySelector("#email-mode").value,
    phone_mode: document.querySelector("#phone-mode").value,
    any_contact_mode: document.querySelector("#any-contact-mode").value
  };
}
function setContactModeControls(settings) {
  document.querySelector("#email-mode").value = normalizeChannelContactMode(settings.email_mode);
  document.querySelector("#phone-mode").value = normalizeChannelContactMode(settings.phone_mode);
  document.querySelector("#any-contact-mode").value = normalizeAnyContactMode(settings.any_contact_mode);
  paintContactHints();
}
function readDailyCaptureLimitFromControl() {
  return normalizeDailyCaptureLimit(Number(document.querySelector("#daily-capture-limit").value));
}
function setDailyCaptureLimitCap(cap) {
  maxDailyCaptureLimit = cap ?? DEFAULT_DAILY_CAPTURE_LIMIT;
  document.querySelector("#daily-capture-limit").max = String(maxDailyCaptureLimit);
  document.querySelector("#daily-capture-limit-hint").textContent = `(1\u2013${maxDailyCaptureLimit})`;
}
function setDailyCaptureLimitControl(limit) {
  document.querySelector("#daily-capture-limit").value = String(normalizeDailyCaptureLimit(limit));
}
async function saveAndSync() {
  const button = document.querySelector("#save-sync");
  const error = document.querySelector("#sync-error");
  button.disabled = true;
  button.textContent = "Saving...";
  error.textContent = "";
  try {
    const state = await readLocalState();
    if (state.authSession) {
      const filterSettings = await readFilterSettings(state.authSession, state.selectedBusinessId);
      const updatedSettings = await updateFilterSettings(state.authSession, state.selectedBusinessId, {
        allowed_countries: filterSettings?.allowed_countries ?? [],
        ...readContactModesFromControls(),
        daily_capture_limit: readDailyCaptureLimitFromControl(),
        include_retail_leads: readIncludeRetailLeadsFromControl(),
        trusted_buyer_bypass: readTrustedBuyerBypassFromControl()
      });
      await chrome.storage.local.set({
        cachedFilterSettings: { businessId: state.selectedBusinessId, settings: updatedSettings }
      });
    }
    button.textContent = "Syncing...";
    await chrome.runtime.sendMessage({ type: "SYNC_NOW" });
    await renderPopup();
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : "Save and sync failed.";
  } finally {
    button.disabled = false;
    button.textContent = "Save & Sync";
  }
}
function paintLocalState(state, businesses, billingOk) {
  const businessSelect = document.querySelector("#business-select");
  businessSelect.replaceChildren(
    ...businesses.map((business) => {
      const option = document.createElement("option");
      option.value = business.id;
      option.textContent = business.name;
      return option;
    })
  );
  businessSelect.disabled = businesses.length <= 1;
  businessSelect.value = businesses.some((business) => business.id === state.selectedBusinessId) ? state.selectedBusinessId : state.authSession?.default_business.id ?? "";
  businessSelect.onchange = () => void selectBusiness(businessSelect.value);
  document.querySelector("#business").textContent = state.selectedBusinessName;
  document.querySelector("#profile-user").textContent = state.authSession?.user.display_name ?? "-";
  document.querySelector("#profile-email").textContent = state.authSession?.user.email ?? "-";
  const cachedCounts = state.todayCounts?.businessId === state.selectedBusinessId && state.todayCounts.since === localDayStartIso() ? state.todayCounts : null;
  document.querySelector("#captured-count").textContent = String(cachedCounts?.captured ?? 0);
  document.querySelector("#skipped-count").textContent = String(cachedCounts?.skipped ?? 0);
  document.querySelector("#last-sync").textContent = formatDateTime(state.lastSync);
  document.querySelector("#sync-error").textContent = state.lastSyncError;
  void paintBotPresence();
  const botToggle = document.querySelector("#bot-toggle");
  botToggle.textContent = state.botEnabled ? "Stop Bot" : "Start Bot";
  botToggle.classList.toggle("stopped", !state.botEnabled);
  botToggle.disabled = !state.botEnabled && !billingOk;
  botToggle.title = botToggle.disabled ? "Business plan is not active. Complete payment to start the bot." : "";
  botToggle.onclick = async () => {
    botToggle.disabled = true;
    try {
      const startingBot = !state.botEnabled;
      if (startingBot) {
        const response = await chrome.runtime.sendMessage({ type: "REFRESH_BILLING" }).catch(() => void 0);
        if (!response?.allowed) {
          return;
        }
        await chrome.runtime.sendMessage({ type: "SYNC_POLL_SETTINGS" }).catch(() => void 0);
      }
      await saveBotEnabled(startingBot);
    } finally {
      await renderPopup();
    }
  };
  const notice = document.querySelector("#notice");
  notice.textContent = state.botEnabled ? "Lead capture is active. New leads are picked up the moment IndiaMART shows them." : "Lead capture is paused. Press Start Bot to resume.";
  const cachedFilterSettings = state.cachedFilterSettings?.businessId === state.selectedBusinessId ? state.cachedFilterSettings.settings : null;
  applyFilterSettings(cachedFilterSettings);
  document.querySelector("#daily-capture-limit").onchange = () => {
    setDailyCaptureLimitControl(readDailyCaptureLimitFromControl());
  };
  document.querySelector("#save-sync").onclick = () => void saveAndSync();
  for (const row of document.querySelectorAll(".summary-row")) {
    row.onclick = () => {
      void chrome.tabs.create({ url: `${DASHBOARD_URL}/keywords` });
    };
  }
  document.querySelector("#logout").onclick = async () => {
    await chrome.storage.local.remove(["authSession", "selectedBusinessId", "selectedBusinessName", "businesses"]);
    await renderPopup();
  };
}
var ACCOUNT_STATE = {
  active: { label: "Active", tone: "good" },
  trial: { label: "Trial", tone: "trial" },
  expired: { label: "Expired", tone: "bad" },
  pending_payment: { label: "No plan", tone: "bad" }
};
function formatDay(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat(void 0, { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function daysLeft(value, now = Date.now()) {
  const end = Date.parse(value ?? "");
  return Number.isFinite(end) ? Math.ceil((end - now) / 864e5) : null;
}
function formatRupees(paise) {
  return typeof paise === "number" ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100) : "-";
}
function setChip(selector, label, tone) {
  const chip = document.querySelector(selector);
  chip.textContent = label;
  chip.dataset.tone = tone;
}
function paintAccountStrip(entitlement, businessId, signedIn) {
  const strip = document.querySelector("#account-strip");
  strip.hidden = !signedIn;
  const current = entitlement?.business_id === businessId ? entitlement : void 0;
  const summary = document.querySelector("#account-summary");
  if (!current) {
    setChip("#account-state", "Checking", "muted");
    summary.textContent = "Checking plan\u2026";
    return;
  }
  const inactive = current.business_status === "inactive" || current.access_block_reason === "business_inactive";
  const state = inactive ? { label: "Inactive", tone: "bad" } : ACCOUNT_STATE[current.billing_state] ?? ACCOUNT_STATE.pending_payment;
  setChip("#account-state", state.label, state.tone);
  setChip("#account-status", state.label, state.tone);
  setChip("#account-business", inactive ? "Inactive" : "Active", inactive ? "bad" : "good");
  const trialEnds = current.billing_state === "trial" ? current.trial_ends_at ?? current.coverage_ends_at : current.trial_ends_at;
  const planEnds = current.plan_ends_at ?? (current.billing_state === "active" ? current.coverage_ends_at : null);
  document.querySelector("#account-plan").textContent = current.plan_name ?? (current.billing_state === "trial" ? "Free trial" : "-");
  document.querySelector("#account-price").textContent = formatRupees(current.plan_price_paise);
  document.querySelector("#account-plan-due").textContent = formatDay(planEnds);
  document.querySelector("#account-trial-due").textContent = formatDay(trialEnds);
  const left = (end) => {
    const days = daysLeft(end);
    return days === null ? "" : days <= 0 ? " \xB7 ends today" : ` \xB7 ${days} day${days === 1 ? "" : "s"} left`;
  };
  if (inactive) summary.textContent = "Business is inactive";
  else if (current.billing_state === "trial") summary.textContent = `Trial due ${formatDay(trialEnds)}${left(trialEnds)}`;
  else if (current.billing_state === "active") summary.textContent = `Plan due ${formatDay(current.coverage_ends_at)}${left(current.coverage_ends_at)}`;
  else if (current.billing_state === "expired") summary.textContent = `Plan expired ${formatDay(planEnds ?? current.trial_ends_at)}`;
  else summary.textContent = "No active plan or trial";
}
async function paintBotPresence() {
  const state = await chrome.storage.local.get(["botEnabled", "lastApiPoll", "botPresence", "selectedBusinessId", "authSession"]);
  const poll = state.lastApiPoll;
  const businessId = state.selectedBusinessId ?? state.authSession?.default_business?.id ?? "";
  const view = botPresenceView(
    localBotState(state.botEnabled === true, poll),
    poll,
    state.botPresence,
    businessId
  );
  const status = document.querySelector("#bot-status");
  status.textContent = view.label;
  status.dataset.tone = view.tone;
  document.querySelector("#bot-presence-detail").textContent = view.detail;
}
function applyFilterSettings(filterSettings) {
  buildContactControls();
  if (filterSettings) {
    document.querySelector("#countries-summary").textContent = `${filterSettings.allowed_countries.length} countries selected`;
    setContactModeControls(filterSettings);
    setDailyCaptureLimitCap(filterSettings.max_daily_capture_limit);
    setDailyCaptureLimitControl(filterSettings.daily_capture_limit);
    setIncludeRetailLeadsControl(filterSettings.include_retail_leads !== false);
    setTrustedBuyerBypassControl(filterSettings.trusted_buyer_bypass === true);
  } else {
    document.querySelector("#countries-summary").textContent = "Countries unavailable";
    setDailyCaptureLimitCap(void 0);
    setDailyCaptureLimitControl(maxDailyCaptureLimit);
    setIncludeRetailLeadsControl(true);
    setTrustedBuyerBypassControl(false);
    paintContactHints();
  }
}
function localDayStartIso(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}
async function refreshTodayCountsInBackground(authSession, businessId) {
  const since = localDayStartIso();
  let counts;
  try {
    counts = await requestApi(
      `/businesses/${businessId}/leads/today-counts?${new URLSearchParams({ since }).toString()}`,
      authSession
    );
  } catch {
    return;
  }
  const todayCounts = { businessId, since, captured: counts.captured, skipped: counts.skipped };
  await chrome.storage.local.set({ todayCounts });
  if (document.querySelector("#business-select")?.value !== businessId) {
    return;
  }
  document.querySelector("#captured-count").textContent = String(todayCounts.captured);
  document.querySelector("#skipped-count").textContent = String(todayCounts.skipped);
}
async function refreshKeywordCountsInBackground(authSession, businessId) {
  let positiveCount;
  let negativeCount;
  try {
    [positiveCount, negativeCount] = await Promise.all([
      countKeywordRules(authSession, businessId, "positive"),
      countKeywordRules(authSession, businessId, "negative")
    ]);
  } catch {
    return;
  }
  if (document.querySelector("#business-select")?.value !== businessId) {
    return;
  }
  document.querySelector("#positive-keywords-count").textContent = String(positiveCount);
  document.querySelector("#negative-keywords-count").textContent = String(negativeCount);
}
async function renderPopup() {
  const billingState = await chrome.storage.local.get(["authSession", "selectedBusinessId", "billingEntitlement", "accessStopNotice"]);
  let billingNotice = document.getElementById("billing-notice");
  if (!billingNotice) {
    billingNotice = document.createElement("div");
    billingNotice.id = "billing-notice";
    billingNotice.style.cssText = "padding:12px 14px;background:#fde9e2;border-bottom:1px solid #f0c2b4;color:#8a1f16;font-size:13px;line-height:1.45";
    document.body.prepend(billingNotice);
  }
  billingNotice.replaceChildren();
  const billingOk = billingAllows(billingState);
  paintAccountStrip(
    billingState.billingEntitlement,
    billingState.selectedBusinessId ?? billingState.authSession?.default_business?.id ?? "",
    Boolean(billingState.authSession)
  );
  billingNotice.hidden = !billingState.authSession || billingOk;
  if (!billingNotice.hidden) {
    const entitlement = billingState.billingEntitlement;
    const stopNotice = billingState.accessStopNotice;
    const denied = entitlement?.operational_access === false || Boolean(stopNotice);
    const title = document.createElement("strong");
    title.style.cssText = "display:block;margin-bottom:4px";
    title.textContent = stopNotice?.stopped_bot ? "Bot stopped - access ended" : denied ? "Lead capture is not available" : "Checking plan access";
    const message = document.createElement("p");
    message.style.margin = "0";
    message.textContent = entitlement?.operational_access === false ? accessDeniedMessage(entitlement) : stopNotice?.message ?? "Capture and sync are paused until access is verified.";
    billingNotice.append(title, message);
    if (billingState.authSession?.role === "owner") {
      const link = document.createElement("a");
      link.href = `${DASHBOARD_URL}/billing`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Buy a plan";
      billingNotice.append(link);
    } else {
      const hint = document.createElement("p");
      hint.style.margin = "4px 0 0";
      hint.textContent = "Ask your account owner to buy a plan.";
      billingNotice.append(hint);
    }
  }
  const state = await readLocalState();
  const loginPanel = document.querySelector("#login-panel");
  const appPanel = document.querySelector("#app-panel");
  const headerAccount = document.querySelector("#header-account");
  const error = document.querySelector("#login-error");
  if (!state.authSession) {
    setLoginPending(false);
    loginPanel.hidden = false;
    appPanel.hidden = true;
    headerAccount.hidden = true;
    error.textContent = "";
    return;
  }
  loginPanel.hidden = true;
  appPanel.hidden = false;
  headerAccount.hidden = false;
  activateTab(activeTab);
  paintLocalState(state, state.businesses, billingOk);
  const [session, businesses, filterSettings] = await Promise.all([
    checkSession(state.authSession),
    refreshBusinesses(state.authSession),
    readFilterSettings(state.authSession, state.selectedBusinessId)
  ]);
  if (session === "unreachable") {
    document.querySelector("#sync-error").textContent = SERVER_UNREACHABLE_MESSAGE;
    return;
  }
  if (session === "invalid") {
    await chrome.storage.local.remove(["authSession"]);
    setLoginPending(false);
    loginPanel.hidden = false;
    appPanel.hidden = true;
    headerAccount.hidden = true;
    error.textContent = "";
    return;
  }
  const refreshedState = await readLocalState();
  paintLocalState(refreshedState, businesses, billingOk);
  if (filterSettings) {
    applyFilterSettings(filterSettings);
  }
  if (refreshedState.authSession) {
    void refreshTodayCountsInBackground(refreshedState.authSession, refreshedState.selectedBusinessId);
    void refreshKeywordCountsInBackground(refreshedState.authSession, refreshedState.selectedBusinessId);
  }
}
bindTabs();
document.querySelector("#app-version").textContent = `v${chrome.runtime.getManifest().version}`;
document.querySelector("#login-panel")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value;
  const password = document.querySelector("#password").value;
  const error = document.querySelector("#login-error");
  error.textContent = "";
  setLoginPending(true);
  try {
    const session = await login(email, password);
    const verified = await checkSession(session);
    if (verified !== "valid") {
      throw new Error(verified === "unreachable" ? SERVER_UNREACHABLE_MESSAGE : "Backend verification failed.");
    }
    await chrome.storage.local.set({
      authSession: session,
      businesses: [session.default_business],
      selectedBusinessId: session.default_business.id,
      selectedBusinessName: session.default_business.name
    });
    await refreshBusinesses(session);
    await renderPopup();
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : "Email or password is incorrect.";
    setLoginPending(false);
  }
});
document.querySelector("#open-activity-log")?.addEventListener("click", () => {
  openActivityPanel(activeTab === "rank" ? "rank" : "leads");
});
void renderPopup();
initLeadRankTab();
chrome.runtime.sendMessage({ type: "REFRESH_BILLING" }).catch(() => void 0);
chrome.runtime.sendMessage({ type: "REFRESH_BOT_PRESENCE" }).catch(() => void 0);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.botPresence || changes.lastApiPoll)) void paintBotPresence();
});
window.setInterval(() => void paintBotPresence(), 15e3);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.billingEntitlement || changes.accessStopNotice || changes.botEnabled) void renderPopup();
});
chrome.storage.onChanged.addListener(async (changes) => {
  if (!changes.lastSyncAttemptAt) {
    return;
  }
  document.querySelector("#last-sync").textContent = formatDateTime(changes.lastSyncAttemptAt.newValue);
  const state = await readLocalState();
  if (state.authSession && state.selectedBusinessId) {
    await refreshTodayCountsInBackground(state.authSession, state.selectedBusinessId);
  }
});
var brakeNoticeTimer;
function paintSafetyBrake(brake) {
  const element2 = document.querySelector("#safety-brake");
  if (!element2) {
    return;
  }
  const notice = safetyBrakeNotice(brake);
  element2.hidden = !notice;
  element2.textContent = notice ?? "";
  window.clearTimeout(brakeNoticeTimer);
  if (notice && brake) {
    brakeNoticeTimer = window.setTimeout(() => paintSafetyBrake(brake), Math.max(1e3, brake.until - Date.now() + 500));
  }
}
void chrome.storage.local.get([SAFETY_BRAKE_STORAGE_KEY]).then((items) => paintSafetyBrake(items[SAFETY_BRAKE_STORAGE_KEY])).catch(() => void 0);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SAFETY_BRAKE_STORAGE_KEY]) {
    paintSafetyBrake(changes[SAFETY_BRAKE_STORAGE_KEY].newValue);
  }
});
