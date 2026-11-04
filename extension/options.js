const $ = (id) => document.getElementById(id);
const FIELDS = ["serverUrl", "apiKey", "intervalSeconds", "cardSelector"];

(async () => {
  const settings = await chrome.runtime.sendMessage({ type: "settings" });
  for (const field of FIELDS) $(field).value = settings[field] ?? "";
})();

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const serverUrl = $("serverUrl").value.trim().replace(/\/$/, "");
  const origin = new URL(serverUrl).origin;

  // localhost is granted in the manifest; any other dashboard URL needs the user's permission.
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      $("result").textContent = "Permission to reach the dashboard was denied.";
      $("result").className = "err";
      return;
    }
  }

  await chrome.storage.local.set({
    serverUrl,
    apiKey: $("apiKey").value.trim(),
    intervalSeconds: Math.max(30, Number($("intervalSeconds").value) || 60),
    cardSelector: $("cardSelector").value.trim(),
  });

  $("result").textContent = "Testing…";
  const res = await chrome.runtime.sendMessage({ type: "api", path: "/extension/config" });
  $("result").textContent = res.ok
    ? `Connected to “${res.data.business.name}” (${res.data.active_keywords} active keywords).`
    : res.data?.error?.message ?? "Could not connect.";
  $("result").className = res.ok ? "ok" : "err";
});
