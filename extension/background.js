// Service worker: holds settings, proxies API calls (host permissions avoid CORS), and sends heartbeats.
const VERSION = chrome.runtime.getManifest().version;

const DEFAULTS = {
  serverUrl: "http://localhost:3000",
  apiKey: "",
  enabled: false,
  dryRun: true,
  intervalSeconds: 60,
  maxBuysPerScan: 3,
  cardSelector: "",
};

async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function api(path, { method = "GET", body } = {}) {
  const settings = await getSettings();
  if (!settings.apiKey) return { ok: false, status: 0, data: { error: { message: "Add your API key in the extension options." } } };
  try {
    const response = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", "x-api-key": settings.apiKey, "x-extension-version": VERSION },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: { message: `Cannot reach server: ${error.message}` } } };
  }
}

async function setBadge() {
  const { enabled, dryRun } = await getSettings();
  await chrome.action.setBadgeText({ text: enabled ? (dryRun ? "DRY" : "ON") : "" });
  await chrome.action.setBadgeBackgroundColor({ color: dryRun ? "#f59e0b" : "#4f46e5" });
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
  await setBadge();
  const { apiKey } = await getSettings();
  if (!apiKey) chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(setBadge);
chrome.storage.onChanged.addListener(setBadge);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "heartbeat") return;
  const { enabled, apiKey } = await getSettings();
  if (enabled && apiKey) await api("/extension/heartbeat", { method: "POST" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "settings") return getSettings();
    if (message.type === "api") return api(message.path, message.options);
    if (message.type === "log") {
      const { scanLog = [] } = await chrome.storage.local.get("scanLog");
      const entry = { at: new Date().toISOString(), ...message.entry };
      await chrome.storage.local.set({ scanLog: [entry, ...scanLog].slice(0, 30), lastScan: entry });
      return true;
    }
    return null;
  })().then(sendResponse);
  return true;
});
