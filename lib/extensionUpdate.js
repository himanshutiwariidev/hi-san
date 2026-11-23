// Whether a business's bot runs the newest extension, and when the dashboard reminds the user to update it.
// The version comes from the latest lead the bot sent: extension 1.0.17 and newer report it with every lead.

// First reminder 5 s after opening the dashboard; after each close, 30 s, then every 60 s until the bot is updated.
export const UPDATE_POPUP_DELAYS_MS = [5000, 30000, 60000];

export function nextPopupDelay(timesClosed) {
  const step = Math.min(Math.max(Number(timesClosed) || 0, 0), UPDATE_POPUP_DELAYS_MS.length - 1);
  return UPDATE_POPUP_DELAYS_MS[step];
}

const parts = (version) => String(version).split(".").map((part) => Number.parseInt(part, 10) || 0);

export function isAtLeast(version, target) {
  const a = parts(version);
  const b = parts(target);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

// state: "latest" (on the newest), "outdated" (an older one, or one too old to report its version),
// "unknown" (no lead yet, so the version cannot be known).
export function extensionStatus(latestLead, newestVersion) {
  if (!latestLead) return { state: "unknown", version: null };
  const version = latestLead.timing?.extension ?? null;
  if (!version) return { state: "outdated", version: null };
  return { state: isAtLeast(version, newestVersion) ? "latest" : "outdated", version };
}
