// Date helpers for <input type="date"> values (local time).
export function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export const startOfDayIso = (dateString) => new Date(`${dateString}T00:00:00`).toISOString();
export const endOfDayIso = (dateString) => new Date(`${dateString}T23:59:59.999`).toISOString();

export function isOnline(lastHeartbeat) {
  return Boolean(lastHeartbeat) && Date.now() - new Date(lastHeartbeat).getTime() < 3 * 60 * 1000;
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
