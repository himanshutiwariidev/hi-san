// Only the selected business lives in the browser; the session itself is an httpOnly cookie.
const BUSINESS_KEY = "im_leads_selected_business_id";

export function readSelectedBusinessId() {
  try {
    return localStorage.getItem(BUSINESS_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedBusinessId(id) {
  try {
    localStorage.setItem(BUSINESS_KEY, id);
  } catch {}
}
