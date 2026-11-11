// One vocabulary for why a lead ended up where it did, shared by the server, API and UI.
// Stored values stay as they were written (filter_reason), so older records keep working: this file
// only interprets them. Groups: filter = your rules, indiamart = decided by IndiaMART, technical = our side failed.

const REASONS = {
  country_not_allowed: { label: "Country Mismatch", group: "filter" },
  keyword_country_mismatch: { label: "Country Mismatch", group: "filter" },
  state_not_allowed: { label: "State Mismatch", group: "filter" },
  keyword_state_mismatch: { label: "State Mismatch", group: "filter" },
  no_positive_keyword_match: { label: "Keyword Mismatch", group: "filter" },
  negative_keyword_match: { label: "Excluded Keyword", group: "filter" },
  contact_requirement_not_met: { label: "Contact Mismatch", group: "filter" },
  gst_not_verified: { label: "GST Not Verified", group: "filter" },
  buyer_too_new: { label: "Buyer Too New", group: "filter" },
  category_not_allowed: { label: "Category Mismatch", group: "filter" },
  quantity_below_minimum: { label: "Quantity Mismatch", group: "filter" },
  unit_mismatch: { label: "Unit Mismatch", group: "filter" },
  retail_lead: { label: "Retail Lead", group: "filter" },
  lead_too_old: { label: "Lead Too Old", group: "filter" },
  daily_limit_reached: { label: "Daily Limit Reached", group: "filter" },
  keyword_daily_limit_reached: { label: "Keyword Limit Reached", group: "filter" },
  invalid_title: { label: "Incomplete Lead Data", group: "filter" },

  lead_not_open: { label: "Closed on IndiaMART", group: "indiamart" },
  lost: { label: "Expired or Sold Out", group: "indiamart" },
  indiamart_not_retrieved: { label: "Retrieval Failed", group: "indiamart" },
  rate_limited: { label: "Rate Limited by IndiaMART", group: "indiamart" },

  buy_failed: { label: "Retrieval Failed", group: "technical" },
  not_retrieved: { label: "Retrieval Failed", group: "technical" },
  retrieval_timeout: { label: "Retrieval Timeout", group: "technical" },
  bought_no_details: { label: "Missing Contact Information", group: "technical" },
  contact_details_not_retrieved: { label: "Missing Contact Information", group: "technical" },
  reason_not_recorded: { label: "Reason Not Recorded", group: "legacy" },
};

// Failure messages that embed IndiaMART's raw answer, which can contain buyer data, are never shown as detail.
const RAW_ANSWER_CODES = new Set(["bought_no_details", "contact_details_not_retrieved"]);

const LEGACY_FILTERED = "Filtered by rules";
const NO_RESULT = "Extension did not report a result";

export const REASON_GROUP_LABELS = { filter: "Your filters", indiamart: "IndiaMART", technical: "Technical", legacy: "Older record" };

function parseExplanation(json) {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// filter_reason holds a bare code ("country_not_allowed") or "code:message" from a failed purchase.
function parseStoredReason(value) {
  const text = String(value ?? "").trim();
  if (!text || text === LEGACY_FILTERED) return { code: "reason_not_recorded", message: null };
  if (text === NO_RESULT) return { code: "retrieval_timeout", message: "The extension reported no result within 15 minutes" };
  if (REASONS[text]) return { code: text, message: null };
  const match = /^([a-z_]+):([\s\S]*)$/.exec(text);
  if (match && REASONS[match[1]]) {
    const message = match[2].trim();
    if (match[1] === "buy_failed" && /timeout|timed out|abort/i.test(message)) return { code: "retrieval_timeout", message };
    return { code: match[1], message: message || null };
  }
  return { code: "other", message: text };
}

function filterDetail(code, row, explanation) {
  const country = row.country_name || "This country";
  const missing = Array.isArray(explanation.missing_contacts) ? explanation.missing_contacts.filter(Boolean) : [];
  switch (code) {
    case "country_not_allowed":
      return `${country} is not in your allowed countries`;
    case "keyword_country_mismatch":
      return `A keyword matched, but that keyword is not enabled for ${country}`;
    case "state_not_allowed":
    case "keyword_state_mismatch":
      return `${row.state || "This state"} is not in the allowed states`;
    case "no_positive_keyword_match":
      return "The title did not match any enabled keyword";
    case "negative_keyword_match":
      return explanation.excluded_keyword ? `Matched excluded keyword "${explanation.excluded_keyword}"` : "Matched an excluded keyword";
    case "contact_requirement_not_met":
      return missing.length ? `Missing ${missing.join(", ")}` : "The buyer's contacts did not meet your contact filter";
    case "lead_not_open":
      return explanation.indiamart_status ? `IndiaMART status: ${explanation.indiamart_status}` : "No longer open on IndiaMART";
    case "reason_not_recorded":
      return "Filtered before reasons were saved, so the exact rule is unknown";
    default:
      return null;
  }
}

// Takes a leads table row and returns { code, label, group, detail, also }.
export function describeLeadReason(row) {
  if (row.status === "retrieved") return { code: "retrieved", label: "Successfully retrieved", group: "success", detail: null, also: [] };
  if (row.status === "pending") return { code: "pending", label: "Pending", group: "pending", detail: "Waiting for the purchase result", also: [] };

  const { code, message } = parseStoredReason(row.filter_reason);
  const explanation = parseExplanation(row.reason_detail);
  const known = REASONS[code];
  // Text from an older version that has no code: show exactly what was recorded instead of guessing.
  if (!known) return { code, label: message, group: row.status === "filtered" ? "filter" : "technical", detail: null, also: [] };

  const detail = RAW_ANSWER_CODES.has(code) ? null : (message ?? filterDetail(code, row, explanation));
  const others = Array.isArray(explanation.reasons) ? explanation.reasons.filter((other) => other !== code && REASONS[other]) : [];
  return {
    code,
    label: known.label,
    group: known.group,
    detail,
    also: [...new Set(others.map((other) => REASONS[other].label))].filter((label) => label !== known.label),
  };
}
