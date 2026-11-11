"use strict";
(() => {
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
  function billingAllows(state, now = Date.now()) {
    // Free mode: Always allowed, no subscription or payment required
    return true;
  }

  // ../../packages/schemas/dist/index.js
  var DEFAULT_DAILY_CAPTURE_LIMIT = 11;
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
  var TRUSTED_BUYER_MIN_MEMBER_MONTHS = 12;
  var INDIAN_STATES = [
    { name: "Andaman and Nicobar Islands", code: "AN" },
    { name: "Andhra Pradesh", code: "AP" },
    { name: "Arunachal Pradesh", code: "AR" },
    { name: "Assam", code: "AS" },
    { name: "Bihar", code: "BR" },
    { name: "Chandigarh", code: "CH" },
    { name: "Chhattisgarh", code: "CT" },
    { name: "Dadra and Nagar Haveli and Daman and Diu", code: "DH" },
    { name: "Delhi", code: "DL" },
    { name: "Goa", code: "GA" },
    { name: "Gujarat", code: "GJ" },
    { name: "Haryana", code: "HR" },
    { name: "Himachal Pradesh", code: "HP" },
    { name: "Jammu and Kashmir", code: "JK" },
    { name: "Jharkhand", code: "JH" },
    { name: "Karnataka", code: "KA" },
    { name: "Kerala", code: "KL" },
    { name: "Ladakh", code: "LA" },
    { name: "Lakshadweep", code: "LD" },
    { name: "Madhya Pradesh", code: "MP" },
    { name: "Maharashtra", code: "MH" },
    { name: "Manipur", code: "MN" },
    { name: "Meghalaya", code: "ML" },
    { name: "Mizoram", code: "MZ" },
    { name: "Nagaland", code: "NL" },
    { name: "Odisha", code: "OR" },
    { name: "Puducherry", code: "PY" },
    { name: "Punjab", code: "PB" },
    { name: "Rajasthan", code: "RJ" },
    { name: "Sikkim", code: "SK" },
    { name: "Tamil Nadu", code: "TN" },
    { name: "Telangana", code: "TG" },
    { name: "Tripura", code: "TR" },
    { name: "Uttar Pradesh", code: "UP" },
    { name: "Uttarakhand", code: "UT" },
    { name: "West Bengal", code: "WB" }
  ];

  // src/lead-decision.ts
  var WORD_CHAR = "[\\p{L}\\p{N}_]";
  var LEAD_AGE_ONLY_TITLE = /^\s*(just now|\d+\s*(sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days)\s+ago)\s*$/i;
  var NEGATIVE_STEM_SUFFIX = "(?:ings|ing|ers|er|als|al|ed|es|s)?";
  function normalizeText(value) {
    return (value ?? "").toLowerCase().split(/\s+/u).filter(Boolean).join(" ");
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function keywordPattern(keyword, suffix = "") {
    const normalized = normalizeText(keyword);
    return normalized ? new RegExp(`(?<!${WORD_CHAR})${escapeRegExp(normalized)}${suffix}(?!${WORD_CHAR})`, "u") : null;
  }
  var ANY_WORD_STOP_WORDS = /* @__PURE__ */ new Set([
    "and",
    "are",
    "but",
    "for",
    "from",
    "has",
    "have",
    "into",
    "its",
    "not",
    "our",
    "the",
    "this",
    "that",
    "was",
    "with",
    "you"
  ]);
  function anyWordKeywords(normalizedKeyword) {
    const words = normalizedKeyword.split(" ").filter((word) => word.length >= 3 && !ANY_WORD_STOP_WORDS.has(word));
    return words.length ? [...new Set(words)] : [normalizedKeyword];
  }
  function wordBoundaryMatcher(word, suffix = "") {
    let pattern;
    return (text3) => {
      if (!text3.includes(word)) {
        return false;
      }
      if (pattern === void 0) {
        pattern = keywordPattern(word, suffix);
      }
      return Boolean(pattern?.test(text3));
    };
  }
  function keywordMatcher(keyword, matchType = "whole_word", stemmed = false, negative = false) {
    const normalized = normalizeText(keyword);
    if (!normalized) {
      return null;
    }
    if (matchType === "contains") {
      if (negative) {
        return (text3) => text3.includes(normalized);
      }
      const words = anyWordKeywords(normalized).map((word) => wordBoundaryMatcher(word));
      return (text3) => words.some((matches) => matches(text3));
    }
    if (matchType === "all_words") {
      const words = normalized.split(" ").map((word) => wordBoundaryMatcher(word, stemmed ? NEGATIVE_STEM_SUFFIX : ""));
      return (text3) => words.every((matches) => matches(text3));
    }
    return wordBoundaryMatcher(normalized, stemmed ? NEGATIVE_STEM_SUFFIX : "");
  }
  function isInvalidLeadTitle(title) {
    return !(title ?? "").trim() || LEAD_AGE_ONLY_TITLE.test(title ?? "");
  }
  var COUNTRY_ALIAS_GROUPS = [
    ["united states", "usa", "us", "united states of america", "america", "u.s.a."],
    ["united kingdom", "uk", "gb", "great britain", "britain", "england"],
    ["united arab emirates", "uae", "ae", "emirates"]
  ];
  function countryCandidates(allowed) {
    const normalized = normalizeText(allowed);
    const group = COUNTRY_ALIAS_GROUPS.find((names) => names.includes(normalized));
    return group ?? [normalized];
  }
  function nameInText(name, text3) {
    return text3 === name || new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}($|[^\\p{L}\\p{N}_])`, "u").test(text3);
  }
  function countryAllowed(leadCountry, allowedCountries, leadCountryIso) {
    const country = normalizeText(leadCountry);
    const iso = normalizeText(leadCountryIso);
    if (!country && !iso) {
      return false;
    }
    return allowedCountries.some(
      (allowed) => countryCandidates(allowed).some(
        (name) => (
          // Two-letter names are codes: only an exact match, never a word inside a location.
          name.length <= 2 ? name === iso || name === country : Boolean(country) && nameInText(name, country)
        )
      )
    );
  }
  function isIndianLead(lead) {
    return normalizeText(lead.country_iso) === "in" || nameInText("india", normalizeText(lead.country));
  }
  function stateAllowed(lead, allowedStates) {
    const text3 = normalizeText(lead.state ?? lead.country);
    if (!text3) {
      return false;
    }
    return allowedStates.some((allowed) => {
      const normalized = normalizeText(allowed);
      const known = INDIAN_STATES.find(
        (state) => normalizeText(state.name) === normalized || normalizeText(state.code) === normalized
      );
      const name = known ? normalizeText(known.name) : normalized;
      return nameInText(name, text3) || known !== void 0 && text3 === normalizeText(known.code);
    });
  }
  var UNIT_SYNONYMS = {
    pc: "piece",
    pcs: "piece",
    pce: "piece",
    piece: "piece",
    pieces: "piece",
    no: "piece",
    nos: "piece",
    number: "piece",
    numbers: "piece",
    unit: "piece",
    units: "piece",
    box: "box",
    boxes: "box",
    bx: "box",
    kg: "kg",
    kgs: "kg",
    kilo: "kg",
    kilogram: "kg",
    kilograms: "kg",
    g: "g",
    gm: "g",
    gms: "g",
    gr: "g",
    gram: "g",
    grams: "g",
    l: "l",
    ltr: "l",
    ltrs: "l",
    litre: "l",
    litres: "l",
    liter: "l",
    liters: "l",
    ml: "ml",
    mls: "ml",
    tab: "tablet",
    tabs: "tablet",
    tablet: "tablet",
    tablets: "tablet",
    cap: "capsule",
    caps: "capsule",
    capsule: "capsule",
    capsules: "capsule",
    pack: "pack",
    packs: "pack",
    packet: "pack",
    packets: "pack",
    pkt: "pack",
    ton: "ton",
    tons: "ton",
    tonne: "ton",
    tonnes: "ton",
    mt: "ton"
  };
  function normalizeUnit(value) {
    const unit = (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
    if (!unit) {
      return "";
    }
    if (unit in UNIT_SYNONYMS) {
      return UNIT_SYNONYMS[unit];
    }
    if (unit.length > 3 && unit.endsWith("es")) {
      return unit.slice(0, -2);
    }
    return unit.length > 2 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  }
  function categoryParts(category) {
    return (category ?? "").split(">").map(normalizeText).filter(Boolean);
  }
  function negativeSearchText(lead) {
    return normalizeText([lead.title, lead.description, lead.category, lead.purpose].filter(Boolean).join(" "));
  }
  var compiledRulesCache = /* @__PURE__ */ new WeakMap();
  function compiledRules(config) {
    const stemNegatives = config.settings.negative_keyword_stemming === true;
    const cached = compiledRulesCache.get(config.keyword_rules);
    if (cached && cached.stemNegatives === stemNegatives) {
      return cached.rules;
    }
    const rules = [];
    for (const rule of config.keyword_rules) {
      const negative = rule.type === "negative";
      const matches = keywordMatcher(rule.keyword, rule.match_type, negative && stemNegatives, negative);
      rules.push({
        id: String(rule.id),
        type: rule.type,
        keyword: rule.keyword,
        matches: matches ?? (() => false),
        minimumQuantity: rule.minimum_quantity ?? null,
        unit: rule.unit ?? null,
        maxLeadsPerDay: rule.max_leads_per_day ?? null,
        allowedCountries: (rule.allowed_countries ?? []).map(normalizeText).filter(Boolean),
        allowedStates: (rule.allowed_states ?? []).filter((state) => normalizeText(state))
      });
    }
    compiledRulesCache.set(config.keyword_rules, { stemNegatives, rules });
    return rules;
  }
  function skipped(reason) {
    return { decision: "skipped", skip_reason: reason, matched_positive_rule_ids: [] };
  }
  function missingChannel(mode, name, shown, verified) {
    if (mode === "verified" && verified !== true) {
      return `verified ${name}`;
    }
    if (mode === "available" && !shown) {
      return name;
    }
    return null;
  }
  function missingContactSignals(lead, settings) {
    const anyMode = normalizeAnyContactMode(settings.any_contact_mode);
    const phoneShown = lead.has_phone || lead.has_whatsapp;
    const oneVerified = lead.email_verified === true || lead.phone_verified === true;
    if (anyMode === "one_verified") {
      return oneVerified ? [] : ["a verified email or phone"];
    }
    if (anyMode === "one_available_one_verified") {
      const met = lead.has_email && phoneShown && oneVerified;
      return met ? [] : ["one available + one verified contact"];
    }
    const emailMode = normalizeChannelContactMode(settings.email_mode);
    const phoneMode = normalizeChannelContactMode(settings.phone_mode);
    const email = missingChannel(emailMode, "email", lead.has_email, lead.email_verified);
    const phone = missingChannel(phoneMode, "phone", phoneShown, lead.phone_verified);
    if (anyMode === "required") {
      const active = [emailMode !== "off" ? email : void 0, phoneMode !== "off" ? phone : void 0].filter(
        (value) => value !== void 0
      );
      if (!active.length) {
        return lead.has_email || phoneShown ? [] : ["email or phone"];
      }
      return active.includes(null) ? [] : [active.join(" or ")];
    }
    return [email, phone].filter((value) => value !== null);
  }
  function isTrustedBuyer(lead) {
    const oneContact = lead.has_email || lead.has_phone || lead.has_whatsapp || lead.email_verified === true || lead.phone_verified === true;
    return lead.buyer_member_months != null && lead.buyer_member_months >= TRUSTED_BUYER_MIN_MEMBER_MONTHS && oneContact;
  }
  function categoryAllowed(lead, settings) {
    const parts = categoryParts(lead.category);
    const allowed = (settings.allowed_categories ?? []).map(normalizeText).filter(Boolean);
    const blocked = (settings.blocked_categories ?? []).map(normalizeText).filter(Boolean);
    if (blocked.some((category) => parts.includes(category))) {
      return false;
    }
    return !allowed.length || allowed.some((category) => parts.includes(category));
  }
  function classifyLeadLocally(lead, config) {
    const { settings } = config;
    const normalizedTitle = normalizeText(lead.title);
    const allowedCountries = settings.allowed_countries.map(normalizeText).filter(Boolean);
    const allowedStates = (settings.allowed_states ?? []).filter((state) => normalizeText(state));
    const indianLead = isIndianLead(lead);
    if (isInvalidLeadTitle(lead.title)) {
      return skipped("invalid_title");
    }
    if (settings.max_lead_age_seconds != null && lead.lead_age_seconds != null && lead.lead_age_seconds > settings.max_lead_age_seconds) {
      return skipped("lead_too_old");
    }
    if (allowedCountries.length && !countryAllowed(lead.country, allowedCountries, lead.country_iso)) {
      return skipped("country_not_allowed");
    }
    if (allowedStates.length && indianLead && !stateAllowed(lead, allowedStates)) {
      return skipped("state_not_allowed");
    }
    const contactMissing = missingContactSignals(lead, settings).length > 0;
    const contactSkippedForTrustedBuyer = contactMissing && settings.trusted_buyer_bypass === true && isTrustedBuyer(lead);
    if (contactMissing && !contactSkippedForTrustedBuyer) {
      return skipped("contact_requirement_not_met");
    }
    if (settings.require_gst_verified === true && lead.gst_verified !== true) {
      return skipped("gst_not_verified");
    }
    if (settings.min_buyer_member_months != null && lead.buyer_member_months != null && lead.buyer_member_months < settings.min_buyer_member_months) {
      return skipped("buyer_too_new");
    }
    if (!categoryAllowed(lead, settings)) {
      return skipped("category_not_allowed");
    }
    const rules = compiledRules(config);
    const negativeText = settings.negative_keyword_full_text === true ? negativeSearchText(lead) : normalizedTitle;
    if (rules.some((rule) => rule.type === "negative" && rule.matches(negativeText))) {
      return skipped("negative_keyword_match");
    }
    const matchedPositive = [];
    const mismatches = /* @__PURE__ */ new Set();
    for (const rule of rules) {
      if (rule.type !== "positive" || !rule.matches(normalizedTitle)) {
        continue;
      }
      if (rule.allowedCountries.length && !countryAllowed(lead.country, rule.allowedCountries, lead.country_iso)) {
        mismatches.add("keyword_country_mismatch");
        continue;
      }
      if (rule.allowedStates.length && indianLead && !stateAllowed(lead, rule.allowedStates)) {
        mismatches.add("keyword_state_mismatch");
        continue;
      }
      const ruleUnit = normalizeUnit(rule.unit);
      const leadUnit = normalizeUnit(lead.unit);
      if (ruleUnit && leadUnit && ruleUnit !== leadUnit) {
        mismatches.add("unit_mismatch");
        continue;
      }
      if (rule.minimumQuantity !== null && (lead.quantity == null || Number(lead.quantity) < Number(rule.minimumQuantity))) {
        mismatches.add("quantity_below_minimum");
        continue;
      }
      matchedPositive.push(rule.id);
    }
    if (matchedPositive.length) {
      const threshold = settings.retail_quantity_threshold;
      const excludeRetail = settings.include_retail_leads === false;
      const retailBySize = excludeRetail && threshold != null && lead.quantity != null && Number(lead.quantity) < Number(threshold);
      const retailByFlag = excludeRetail && lead.is_retail_flagged === true;
      if (retailBySize || retailByFlag) {
        return { decision: "skipped", skip_reason: "retail_lead", matched_positive_rule_ids: matchedPositive };
      }
      const captured = { decision: "captured", skip_reason: null, matched_positive_rule_ids: matchedPositive };
      return contactSkippedForTrustedBuyer ? { ...captured, capture_rule: "trusted_buyer" } : captured;
    }
    const reason = ["keyword_country_mismatch", "keyword_state_mismatch", "unit_mismatch", "quantity_below_minimum"].find((candidate) => mismatches.has(candidate));
    return skipped(reason ?? "no_positive_keyword_match");
  }
  function explainSkip(lead, config) {
    try {
      const { settings } = config;
      const normalizedTitle = normalizeText(lead.title);
      const allowedCountries = settings.allowed_countries.map(normalizeText).filter(Boolean);
      const allowedStates = (settings.allowed_states ?? []).filter((state) => normalizeText(state));
      const rules = compiledRules(config);
      const negativeText = settings.negative_keyword_full_text === true ? negativeSearchText(lead) : normalizedTitle;
      const excluded = rules.find((rule) => rule.type === "negative" && rule.matches(negativeText));
      const missingContacts = missingContactSignals(lead, settings);
      const contactBypassed = settings.trusted_buyer_bypass === true && isTrustedBuyer(lead);
      const reasons = [];
      if (allowedCountries.length && !countryAllowed(lead.country, allowedCountries, lead.country_iso)) {
        reasons.push("country_not_allowed");
      }
      if (allowedStates.length && isIndianLead(lead) && !stateAllowed(lead, allowedStates)) {
        reasons.push("state_not_allowed");
      }
      if (missingContacts.length && !contactBypassed) {
        reasons.push("contact_requirement_not_met");
      }
      if (settings.require_gst_verified === true && lead.gst_verified !== true) {
        reasons.push("gst_not_verified");
      }
      if (!categoryAllowed(lead, settings)) {
        reasons.push("category_not_allowed");
      }
      if (excluded) {
        reasons.push("negative_keyword_match");
      }
      if (!rules.some((rule) => rule.type === "positive" && rule.matches(normalizedTitle))) {
        reasons.push("no_positive_keyword_match");
      }
      return { reasons, missing_contacts: missingContacts, excluded_keyword: excluded?.keyword ?? null };
    } catch {
      return null;
    }
  }
  function rankExpiredLead(lead, config) {
    const { settings } = config;
    if (isInvalidLeadTitle(lead.title)) {
      return { rank: "C", matched_positive_rule_ids: [], reason: "invalid_title" };
    }
    const normalizedTitle = normalizeText(lead.title);
    const rules = compiledRules(config);
    const negativeText = settings.negative_keyword_full_text === true ? negativeSearchText(lead) : normalizedTitle;
    if (rules.some((rule) => rule.type === "negative" && rule.matches(negativeText))) {
      return { rank: "C", matched_positive_rule_ids: [], reason: "negative_keyword_match" };
    }
    const positives = rules.filter((rule) => rule.type === "positive" && rule.matches(normalizedTitle));
    if (!positives.length) {
      return { rank: "C", matched_positive_rule_ids: [], reason: "no_positive_keyword_match" };
    }
    const indianLead = isIndianLead(lead);
    const allowedCountries = settings.allowed_countries.map(normalizeText).filter(Boolean);
    const allowedStates = (settings.allowed_states ?? []).filter((state) => normalizeText(state));
    const keywordIds = positives.map((rule) => rule.id);
    if (allowedCountries.length && !countryAllowed(lead.country, allowedCountries, lead.country_iso)) {
      return { rank: "B", matched_positive_rule_ids: keywordIds, reason: "country_not_allowed" };
    }
    if (allowedStates.length && indianLead && !stateAllowed(lead, allowedStates)) {
      return { rank: "B", matched_positive_rule_ids: keywordIds, reason: "state_not_allowed" };
    }
    const located = positives.filter(
      (rule) => (!rule.allowedCountries.length || countryAllowed(lead.country, rule.allowedCountries, lead.country_iso)) && (!rule.allowedStates.length || !indianLead || stateAllowed(lead, rule.allowedStates))
    );
    if (!located.length) {
      return { rank: "B", matched_positive_rule_ids: keywordIds, reason: "keyword_country_mismatch" };
    }
    return { rank: "A", matched_positive_rule_ids: located.map((rule) => rule.id), reason: "matched" };
  }
  function effectiveDailyLimit(limit, cap) {
    return Math.min(limit ?? cap, cap);
  }
  function utcDateString(now = Date.now()) {
    return new Date(now).toISOString().slice(0, 10);
  }
  function decideLeadLocally(lead, config, counters, now = Date.now()) {
    if (!config || config.today.utc_date !== utcDateString(now)) {
      return null;
    }
    const classification = classifyLeadLocally(lead, config);
    const result = { ...classification, config_version: config.version };
    if (classification.decision !== "captured") {
      return result;
    }
    const cap = config.settings.max_daily_capture_limit ?? DEFAULT_DAILY_CAPTURE_LIMIT;
    const limits = new Map(compiledRules(config).map((rule) => [rule.id, effectiveDailyLimit(rule.maxLeadsPerDay, cap)]));
    const withRoom = classification.matched_positive_rule_ids.filter((ruleId) => {
      const limit = limits.get(ruleId) ?? cap;
      return (counters.keyword[ruleId] ?? 0) < limit;
    });
    if (!withRoom.length) {
      return { ...result, decision: "skipped", skip_reason: "keyword_daily_limit_reached" };
    }
    if (counters.captured >= effectiveDailyLimit(config.settings.daily_capture_limit, cap)) {
      return { ...result, decision: "skipped", skip_reason: "daily_limit_reached" };
    }
    return { ...result, matched_positive_rule_ids: withRoom };
  }
  function currentCaptureCounters(config, localCaptures2) {
    const counters = {
      captured: config.today.captured_count,
      keyword: { ...config.today.keyword_captured_counts }
    };
    for (const capture of localCaptures2) {
      if (capture.ackedAt !== void 0 && capture.ackedAt < config.requested_at) {
        continue;
      }
      counters.captured += 1;
      for (const ruleId of capture.ruleIds) {
        counters.keyword[ruleId] = (counters.keyword[ruleId] ?? 0) + 1;
      }
    }
    return counters;
  }

  // src/fast-buy.ts
  var BRIDGE_REQUEST_EVENT = "hisan-bot-bridge-request";
  var BRIDGE_RESPONSE_EVENT = "hisan-bot-bridge-response";
  function encodeBridgeRequest(request) {
    return JSON.stringify(request);
  }
  function decodeBridgeResponse(detail) {
    if (typeof detail !== "string") {
      return null;
    }
    const split = detail.indexOf("\n");
    try {
      const head = JSON.parse(split < 0 ? detail : detail.slice(0, split));
      if (typeof head?.requestId !== "string" || !head.result || typeof head.result !== "object") {
        return null;
      }
      return { requestId: head.requestId, result: { ...head.result, json: parseBody(split < 0 ? "" : detail.slice(split + 1)) } };
    } catch {
      return null;
    }
  }
  function parseBody(body) {
    if (!body) {
      return null;
    }
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  var TSEARCH_TEXT = "latestbl_relevant_NTB_f_loc_AI";
  var BL_PAGE_LOCATION = "page=relevant#city=#mcatid=#locpref=2";
  var PREF_URL = "https://seller.indiamart.com/bltxn/?pref=relevant&N_T_B=1";
  var POLL_GAP_MS = 7e3;
  var POLL_SETTINGS_STORAGE_KEY = "pollSettings";
  var MIN_POLL_GAP_MS = 2e3;
  var MAX_POLL_GAP_MS = 6e4;
  var MAX_POLLS_IN_FLIGHT = 1;
  var POLL_NOT_OK_DELAY_MS = 15e3;
  var POLL_FAILURE_BACKOFF_MS = [15e3, 3e4, 6e4];
  var SAFETY_BRAKE_STEPS_MS = [2 * 6e4, 5 * 6e4, 15 * 6e4];
  var SAFETY_BRAKE_RESET_MS = 30 * 6e4;
  var MAX_SAFETY_BRAKE_MS = 60 * 6e4;
  var DEFAULT_BUY_RATE_LIMIT_COOLDOWN_SECONDS = SAFETY_BRAKE_STEPS_MS[0] / 1e3;
  function pad(value) {
    return String(value).padStart(2, "0");
  }
  function istTimestamp(now = Date.now()) {
    const ist = new Date(now + 5.5 * 60 * 60 * 1e3);
    return `${pad(ist.getUTCDate())}-${pad(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()} ${pad(ist.getUTCHours())}:${pad(
      ist.getUTCMinutes()
    )}:${pad(ist.getUTCSeconds())}`;
  }
  function buildBuyPayload(lead, glid, position = 1, now = Date.now()) {
    return {
      glusrId: glid,
      ofrid: lead.ofr_id,
      purchasemod: "WEB",
      count: position,
      tsearch_text: TSEARCH_TEXT,
      serial: position,
      responseTextArea: 0,
      bl_page_location: BL_PAGE_LOCATION,
      matched_mcat_id: lead.mcat_id ?? "",
      order_value_flag: "",
      is_bulk_order: "",
      ofrtitle: lead.title,
      mapped_mcat_id: lead.mcat_id ?? "",
      GRID_PARAMETERS: lead.grid_parameters ?? "",
      ptime: istTimestamp(now),
      pref: PREF_URL,
      grid_lead_pos: position,
      search_top_mcat_id: "",
      search_mcat_priority_level: "",
      searchTracking: "",
      NIClick: 1
    };
  }
  function text(value) {
    const result = value === null || value === void 0 ? "" : String(value).trim();
    return result || null;
  }
  function plainMessage(value) {
    return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
  }
  function firstText(row, keys) {
    for (const key of keys) {
      const value = text(row[key]);
      if (value) {
        return value;
      }
    }
    return null;
  }
  var MOBILE_KEYS = ["GLUSR_USR_PH_MOBILE", "GLUSR_USR_PH_MOBILE_ALT", "GLUSR_USR_PH_NUMBER", "GLUSR_USR_PH2_NUMBER"];
  var EMAIL_KEYS = ["GLUSR_USR_EMAIL", "GLUSR_USR_EMAIL_ALT", "GLUSR_EMAIL"];
  var NAME_KEYS = ["GLUSR_NAME", "GLUSR_USR_NAME", "GLUSR_FIRSTNAME"];
  function buyerPhone(row) {
    const mobile = firstText(row, MOBILE_KEYS);
    const country = text(row.GLUSR_USR_PH_COUNTRY);
    const digits = [country, mobile].filter(Boolean).join("").replace(/\D/g, "");
    if (!mobile || digits.length < 7) {
      return null;
    }
    return country && !mobile.startsWith("+") ? `+${country.replace(/^\+/, "")} ${mobile}` : mobile;
  }
  function isRow(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function hasBuyerFields(row) {
    return Object.keys(row).some((key) => key.startsWith("GLUSR_"));
  }
  function buyerRow(data) {
    if (isRow(data)) {
      return hasBuyerFields(data) ? data : null;
    }
    if (!Array.isArray(data)) {
      return null;
    }
    return data.find((row) => isRow(row) && hasBuyerFields(row)) ?? (isRow(data[0]) ? data[0] : null);
  }
  function rawAnswer(json) {
    try {
      return (JSON.stringify(json) ?? "").slice(0, 300);
    } catch {
      return "";
    }
  }
  var ACTIVITY_WARNING_PATTERN = /\b(unusual|high|suspicious|abnormal|excessive)\s+(activity|traffic|usage)\b|too\s+many\s+requests|activity\s+(has\s+been\s+)?(detected|flagged)|temporarily\s+(blocked|restricted|suspended)/i;
  function looksLikeActivityWarning(text3) {
    return ACTIVITY_WARNING_PATTERN.test(text3);
  }
  function isRateLimitStatus(status) {
    return status === 429 || status === 403 || status === 503;
  }
  function parseBuyResult(result) {
    if (isRateLimitStatus(result.status)) {
      return { kind: "rate_limited", retryAfterSeconds: result.retryAfterSeconds ?? DEFAULT_BUY_RATE_LIMIT_COOLDOWN_SECONDS };
    }
    const json = result.json;
    if (!json || typeof json !== "object") {
      return { kind: "failed", message: result.error ?? `HTTP ${result.status}` };
    }
    const message = plainMessage(text(json.issue_rectify) ?? text(json.MESSAGE) ?? text(json.Msg) ?? text(json.Status) ?? "");
    if (String(json.Flag ?? "") === "7") {
      return { kind: "lost", message: message || "expired or bought by another seller" };
    }
    const statusSuccess = String(json.Status ?? "").toLowerCase() === "success";
    const flagSuccess = String(json.Flag ?? "") === "1";
    const buyer = buyerRow(json.Data);
    if (!result.ok || !(statusSuccess || flagSuccess) || !buyer) {
      if (looksLikeActivityWarning(message)) {
        return { kind: "rate_limited", retryAfterSeconds: result.retryAfterSeconds ?? DEFAULT_BUY_RATE_LIMIT_COOLDOWN_SECONDS };
      }
      if (result.ok && statusSuccess && flagSuccess) {
        return { kind: "bought_no_details", message: message || "no buyer details in the answer", raw: rawAnswer(json) };
      }
      return { kind: "failed", message: message || `HTTP ${result.status}` };
    }
    const balance = Array.isArray(json.Data) ? json.Data.find((row) => isRow(row) && "creditBalance" in row) : null;
    return {
      kind: "bought",
      purchaseId: text(json.pur_id) ?? "",
      creditBalance: isRow(balance) ? text(balance.creditBalance) : null,
      raw: rawAnswer(json),
      buyer: {
        name: firstText(buyer, NAME_KEYS),
        company: text(buyer.GLUSR_COMPANY),
        phone: buyerPhone(buyer),
        email: firstText(buyer, EMAIL_KEYS),
        address: text(buyer.GLUSR_ADDRESS),
        city: text(buyer.GLUSR_CITY),
        state: text(buyer.GLUSR_STATE),
        country: text(buyer.GLUSR_COUNTRY),
        member_since: text(buyer.GLUSR_USR_MEMBERSINCE),
        contact_fields: Object.keys(buyer).filter((key) => /PH|MOBILE|EMAIL/i.test(key) && text(buyer[key]))
      }
    };
  }
  function enrichmentFromBuy(lead, outcome, sourceUrl, now = Date.now()) {
    const { buyer } = outcome;
    const requirementFields = { ...lead.enrichment };
    for (const [label, value] of [
      ["Company", buyer.company],
      ["Address", buyer.address],
      ["City", buyer.city],
      ["State", buyer.state]
    ]) {
      if (value) {
        requirementFields[label] = value;
      }
    }
    return {
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone,
      buyer_member_since: buyer.member_since ?? lead.member_since,
      requirement_fields: requirementFields,
      popup_title: lead.title,
      popup_country: buyer.country ?? lead.country,
      popup_lead_age_text: null,
      source_url: sourceUrl,
      contact_enriched_at: new Date(now).toISOString(),
      purchase_id: outcome.purchaseId || null,
      credit_balance: outcome.creditBalance,
      contact_fields: buyer.contact_fields ?? []
    };
  }
  var BUY_CONCURRENCY = 3;
  var RETRY_BUY_SLOTS = 1;
  function createBuyQueue(slots, clock = () => Date.now(), retrySlots = RETRY_BUY_SLOTS) {
    const fresh = [];
    const retry = [];
    let running = 0;
    let runningRetries = 0;
    let pausedUntil = 0;
    const start = (job) => {
      running += 1;
      runningRetries += job.retry ? 1 : 0;
      let started;
      try {
        started = job.run();
      } catch {
        started = Promise.reject();
      }
      void started.catch(() => null).then((value) => {
        running -= 1;
        runningRetries -= job.retry ? 1 : 0;
        job.resolve(value);
        pump();
      });
    };
    const pump = () => {
      while (fresh.length && clock() >= pausedUntil && running < slots) {
        start(fresh.shift());
      }
      while (retry.length && clock() >= pausedUntil && runningRetries < retrySlots && running < Math.max(1, slots - 1)) {
        start(retry.shift());
      }
    };
    return {
      enqueue(task, priority = "retry") {
        if (clock() < pausedUntil) {
          return Promise.resolve(null);
        }
        return new Promise((resolve) => {
          const job = { run: task, resolve, retry: priority !== "fresh" };
          (job.retry ? retry : fresh).push(job);
          pump();
        });
      },
      pause(untilMs) {
        pausedUntil = Math.max(pausedUntil, untilMs);
        for (const job of [...fresh.splice(0), ...retry.splice(0)]) {
          job.resolve(null);
        }
      },
      get running() {
        return running;
      },
      get queued() {
        return fresh.length + retry.length;
      }
    };
  }
  function duration(ms) {
    return ms < 1e3 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1e3).toFixed(ms < 1e4 ? 1 : 0)} s`;
  }
  function buyTimingNote(timing) {
    const parts = [];
    if (timing.receivedAt === void 0) {
      parts.push("retry");
    } else {
      const heldMs = timing.firstSeenAt !== void 0 ? timing.receivedAt - timing.firstSeenAt : 0;
      const seenAt = heldMs >= 20 ? timing.firstSeenAt : timing.receivedAt;
      if (timing.postedAtMs !== null) {
        parts.push(`posted ${duration(seenAt - timing.postedAtMs)} before we ${heldMs >= 20 ? "first " : ""}saw it`);
      }
      if (heldMs >= 20) {
        parts.push(`held ${duration(heldMs)} for IndiaMART's contact flags`);
      }
      const queuedAt = timing.queuedAt ?? timing.receivedAt;
      const deciding = queuedAt - timing.receivedAt;
      const waiting = timing.startedAt !== void 0 ? timing.startedAt - queuedAt : 0;
      const delays = [deciding >= 20 ? `${duration(deciding)} deciding` : "", waiting >= 20 ? `${duration(waiting)} waiting for a buy slot` : ""].filter(Boolean);
      parts.push(`buy sent ${duration(timing.sentAt - timing.receivedAt)} after${delays.length ? ` (${delays.join(", ")})` : ""}`);
    }
    parts.push(`IndiaMART answered in ${duration(timing.answeredAt - timing.sentAt)}`);
    return parts.join(" \xB7 ");
  }
  function isPollRateLimited(result) {
    return isRateLimitStatus(result.status) || result.retryAfterSeconds !== null;
  }
  function nextSafetyBrake(previous, reason, retryAfterSeconds, now = Date.now()) {
    const recent = previous && now - previous.tripped_at < SAFETY_BRAKE_RESET_MS;
    const step = recent ? Math.min(previous.step + 1, SAFETY_BRAKE_STEPS_MS.length - 1) : 0;
    const pauseMs = Math.min(Math.max(SAFETY_BRAKE_STEPS_MS[step], (retryAfterSeconds ?? 0) * 1e3), MAX_SAFETY_BRAKE_MS);
    return { until: Math.max(previous?.until ?? 0, now + pauseMs), step, tripped_at: now, reason };
  }
  function safetyBrakeActive(brake, now = Date.now()) {
    return Boolean(brake && brake.until > now);
  }
  var SAFETY_BRAKE_STORAGE_KEY = "imSafetyBrake";
  function pollGapMsFrom(stored) {
    const seconds = stored?.poll_gap_seconds;
    const gapMs = typeof seconds === "number" && Number.isFinite(seconds) ? seconds * 1e3 : NaN;
    return gapMs >= MIN_POLL_GAP_MS && gapMs <= MAX_POLL_GAP_MS ? gapMs : POLL_GAP_MS;
  }
  function nextPollDelayMs(gapMs = POLL_GAP_MS) {
    return gapMs;
  }
  function pollFailureBackoffMs(consecutiveFailures) {
    return POLL_FAILURE_BACKOFF_MS[Math.min(Math.max(consecutiveFailures, 1), POLL_FAILURE_BACKOFF_MS.length) - 1];
  }
  function firstPollDelayMs(lastRequestAt, now = Date.now(), gapMs = POLL_GAP_MS) {
    return Math.max(0, lastRequestAt + gapMs - now);
  }
  function shouldReloadAfterBrake(brake, reloadedForTrippedAt, now = Date.now()) {
    return Boolean(
      brake && !safetyBrakeActive(brake, now) && now - brake.until < SAFETY_BRAKE_RESET_MS && brake.tripped_at !== reloadedForTrippedAt
    );
  }

  // src/expired-interest.ts
  function buildMarkShortlistPayload(glid, target) {
    return {
      glusrid: glid,
      mcatid: target.mcatId ?? "",
      ofrid: target.offerId,
      flag_val: "I",
      status: 1,
      is_expire: 1,
      source: "EXPIRED_BL_SECTION"
    };
  }
  function parseMarkShortlistResult(result) {
    if (result.status === 429) {
      return { kind: "rate_limited", retryAfterSeconds: result.retryAfterSeconds };
    }
    const json = result.json ?? null;
    const code = String(json?.CODE ?? "");
    const status = String(json?.STATUS ?? "").toUpperCase();
    const message = String(json?.MESSAGE ?? "").trim();
    if (result.ok && code === "200" && (status === "SUCCESSFUL" || status === "SUCCESS")) {
      return /already/i.test(message) ? { kind: "already" } : { kind: "ok" };
    }
    if (/already/i.test(message)) {
      return { kind: "already" };
    }
    if (!json || typeof json !== "object" || !("CODE" in json || "STATUS" in json) || result.status === 0 || result.status >= 500) {
      return { kind: "retry", message: result.error || (result.status ? `HTTP ${result.status}` : "no answer") };
    }
    return { kind: "failed", message: message || result.error || (result.status ? `HTTP ${result.status}` : "no answer") };
  }
  var EXPIRED_INTEREST_ENABLED_KEY = "expiredInterestEnabled";
  var EXPIRED_INTEREST_LOG_KEY = "expiredInterestLog";
  var EXPIRED_INTEREST_STATS_KEY = "expiredInterestStats";
  var EXPIRED_INTEREST_SENT_KEY = "expiredInterestSentIds";
  var EXPIRED_INTEREST_LOCK_KEY = "expiredInterestLock";
  var EXPIRED_INTEREST_STATUS_KEY = "expiredInterestStatus";
  var EXPIRED_INTEREST_LAST_SCAN_KEY = "expiredInterestLastScan";
  var MAX_LOG_ENTRIES = 300;
  var MAX_SENT_IDS = 2e3;
  var MAX_MARK_ATTEMPTS = 3;
  var EXPIRED_SCAN_INTERVAL_MS = 6e4;
  var MARK_GAP_MS = 1500;
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
  function normalizeSentIds(stored) {
    const value = stored && typeof stored === "object" ? stored : {};
    return {
      done: Array.isArray(value.done) ? value.done.filter((id) => typeof id === "string") : [],
      attempts: value.attempts && typeof value.attempts === "object" ? { ...value.attempts } : {}
    };
  }
  function rememberDone(sent, offerId) {
    const done = [...sent.done.filter((id) => id !== offerId), offerId].slice(-MAX_SENT_IDS);
    const { [offerId]: _dropped, ...attempts } = sent.attempts;
    return { done, attempts };
  }
  function rememberFailure(sent, offerId) {
    const tries = (sent.attempts[offerId] ?? 0) + 1;
    if (tries >= MAX_MARK_ATTEMPTS) {
      return rememberDone(sent, offerId);
    }
    const attempts = { ...sent.attempts, [offerId]: tries };
    const keys = Object.keys(attempts);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_SENT_IDS))) {
      delete attempts[key];
    }
    return { done: sent.done, attempts };
  }
  function isHandled(sent, offerId) {
    return sent.done.includes(offerId);
  }
  function prependLog(log, entry) {
    const rows = Array.isArray(log) ? log : [];
    return [entry, ...rows].slice(0, MAX_LOG_ENTRIES);
  }

  // src/indiamart-api-adapter.ts
  var BL_DISPLAY_DATA_SOURCE = "hisan-bot-page-hook";
  var BL_DISPLAY_DATA_MESSAGE = "IM_BL_DISPLAY_DATA";
  function text2(value) {
    if (value === null || value === void 0) {
      return null;
    }
    const result = String(value).replace(/\s+/g, " ").trim();
    return result || null;
  }
  function flag(value) {
    return value === 1 || value === "1" || value === true;
  }
  function numberOrNull(value) {
    const parsed = typeof value === "number" ? value : Number(text2(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function parseJsonObject(value) {
    if (typeof value !== "string") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  function parseEnrichmentInfo(value) {
    const parsed = parseJsonObject(value);
    const fields = {};
    if (!parsed || typeof parsed !== "object") {
      return fields;
    }
    for (const group of Object.values(parsed)) {
      if (!Array.isArray(group)) {
        continue;
      }
      for (const entry of group) {
        const label = text2(entry?.DESC);
        const response = text2(entry?.RESPONSE);
        if (label && response && !(label in fields)) {
          fields[label] = response;
        }
      }
    }
    return fields;
  }
  function fieldIgnoringCase(fields, label) {
    const key = Object.keys(fields).find((candidate) => candidate.toLowerCase() === label.toLowerCase());
    return key ? fields[key] : null;
  }
  function parseApiQuantity(value) {
    const match = value?.match(/([\d][\d,]*(?:\.\d+)?)\s*([\p{L}][\p{L} .]*)?/u);
    if (!match) {
      return { quantity: null, unit: null };
    }
    const quantity = Number(match[1].replace(/,/g, ""));
    return { quantity: Number.isFinite(quantity) ? quantity : null, unit: text2(match[2]) };
  }
  var IST_OFFSET_MS = 5.5 * 60 * 60 * 1e3;
  function parseOfrDate(value) {
    const match = value?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!match) {
      return null;
    }
    const [, year, month, day, hour, minute, second] = match.map(Number);
    return Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
  }
  var MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function parseMemberSinceMonths(value, now = Date.now()) {
    const textValue = (value ?? "").toLowerCase();
    const span = textValue.match(/(\d+(?:\.\d+)?)\s*\+?\s*(year|yr|month|mon|week|day)/);
    if (span) {
      const amount = Number(span[1]);
      const unit = span[2];
      return unit === "year" || unit === "yr" ? Math.floor(amount * 12) : unit === "month" || unit === "mon" ? Math.floor(amount) : 0;
    }
    const since = textValue.match(/\b([a-z]{3})[a-z]*\.?\s*,?\s*(\d{4})\b/);
    const monthIndex = since ? MONTH_NAMES.indexOf(since[1]) : -1;
    if (since && monthIndex >= 0) {
      const today = new Date(now);
      const months = (today.getUTCFullYear() - Number(since[2])) * 12 + (today.getUTCMonth() - monthIndex);
      return Math.max(0, months);
    }
    return null;
  }
  function isRetailLogo(value) {
    const parsed = parseJsonObject(value);
    const values = parsed && typeof parsed === "object" ? Object.values(parsed) : [value];
    return values.some((entry) => /retail lead/i.test(String(entry ?? "")));
  }
  var LIVE_DATATYPES = /* @__PURE__ */ new Set(["lead"]);
  var EXPIRED_DATATYPES = /* @__PURE__ */ new Set(["lead", "expiredlead"]);
  function parseBlApiRow(row, dataTypes = LIVE_DATATYPES) {
    const ofrId = text2(row.ETO_OFR_ID) ?? text2(row.ETO_OFR_DISPLAY_ID);
    const title = text2(row.ETO_OFR_TITLE);
    if (!ofrId || !title) {
      return null;
    }
    if (row.DATATYPE !== void 0 && !dataTypes.has(String(row.DATATYPE)) || row.PURCHASE_STATUS && row.PURCHASE_STATUS !== "OPEN") {
      return null;
    }
    const enrichment = parseEnrichmentInfo(row.ENRICHMENTINFO);
    const { quantity, unit } = parseApiQuantity(fieldIgnoringCase(enrichment, "Quantity"));
    const details = Array.isArray(row.ETO_OFR_ADDITIONAL_DETAILS) ? row.ETO_OFR_ADDITIONAL_DETAILS[0] : void 0;
    const phoneVerified = flag(row.ETO_OFR_BUYER_IS_MOB_VERF);
    const emailVerified = flag(row.ETO_OFR_EMAIL_VERIFIED);
    const leadType = numberOrNull(row.BY_LEAD_TYPE);
    return {
      ofr_id: ofrId,
      title,
      country: text2(row.GLUSR_COUNTRY),
      country_iso: text2(row.FK_GL_COUNTRY_ISO),
      state: text2(row.GLUSR_STATE),
      description: text2(row.ETO_OFR_DESC),
      category: text2(row.PRIME_MCAT_NAME) ?? text2(row.ETO_OFR_GLCAT_MCAT_NAME),
      parent_category: text2(row.PARENT_MCAT_NAME),
      quantity,
      unit,
      purpose: fieldIgnoringCase(enrichment, "I want this for"),
      enrichment,
      // A contact is available when the buyer left it (BY_LEAD_TYPE) or IndiaMART verified it; the
      // numbers and addresses stay hidden until the lead is bought. A phone country code is on
      // every lead, so it says nothing.
      has_phone: phoneVerified || leadType === 1 || leadType === 3,
      has_email: emailVerified || leadType === 2 || leadType === 3,
      has_whatsapp: flag(details?.is_whatsapp_active),
      phone_verified: phoneVerified,
      email_verified: emailVerified,
      gst_verified: flag(row.ETO_OFR_BUYER_IS_GST_VERF),
      contact_signals_known: row.ETO_OFR_BUYER_IS_MOB_VERF != null || row.ETO_OFR_EMAIL_VERIFIED != null,
      is_retail_lead: isRetailLogo(row.LOGO_TYPE),
      member_since: text2(row.GLUSR_USR_MEMBERSINCE),
      buyer_leads_count: numberOrNull(row.ETO_OFR_BUYER_LEADS_CNT),
      buyer_reply_count: numberOrNull(details?.eto_ofr_buyer_reply_cnt),
      offer_date: text2(row.OFR_DATE),
      posted_at_ms: parseOfrDate(text2(row.OFR_DATE)),
      mcat_id: text2(row.FK_GLCAT_MCAT_ID) ?? text2(row.PRIME_MCAT_ID),
      grid_parameters: text2(row.GRID_PARAMETERS)
    };
  }
  function parseBlDisplayData(payload) {
    const list = payload?.DisplayList;
    if (!Array.isArray(list)) {
      return [];
    }
    return list.map((row) => row && typeof row === "object" ? parseBlApiRow(row) : null).filter((lead) => lead !== null);
  }
  function parseBlClosedLeads(payload) {
    const list = payload?.DisplayList;
    if (!Array.isArray(list)) {
      return [];
    }
    const leads = [];
    for (const row of list) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const status = text2(row.PURCHASE_STATUS);
      const liveRow = row.DATATYPE === void 0 || LIVE_DATATYPES.has(String(row.DATATYPE));
      if (!status || status === "OPEN" || !liveRow) {
        continue;
      }
      const api = parseBlApiRow({ ...row, PURCHASE_STATUS: "OPEN" });
      if (api) {
        leads.push({ ...api, closed_status: status });
      }
    }
    return leads;
  }
  function parseExpiredBlDisplayData(payload) {
    const list = payload?.DisplayList;
    if (!Array.isArray(list)) {
      return [];
    }
    const leads = [];
    for (const row of list) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const api = parseBlApiRow(row, EXPIRED_DATATYPES);
      if (api) {
        const shortlisted = String(row.SHORTLISTED ?? "").toUpperCase() === "YES";
        leads.push({ api, shortlisted });
      }
    }
    return leads;
  }
  var REALTIME_CHANNEL_NAME = "WebSocketChannel";
  var REALTIME_RESOURCES = /* @__PURE__ */ new Set(["realtime_bl", "realtime_bl_new"]);
  function decodeXmlText(value) {
    return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&amp;/g, "&");
  }
  function parseRealtimeBody(body) {
    let json = body.trim().replace(/;$/, "").trim();
    try {
      let parsed = JSON.parse(json);
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
      return parsed;
    } catch {
      if (json.startsWith('"') && json.endsWith('"')) {
        json = json.slice(1, -1);
      }
      json = json.replace(/\n/g, "\\n").replace(/"LOGO_TYPE"\s*:\s*"(\{.*?\})"/s, (_, inner) => {
        try {
          return `"LOGO_TYPE": ${JSON.stringify(JSON.parse(inner.replace(/\\"/g, '"')))}`;
        } catch {
          return '"LOGO_TYPE": null';
        }
      });
      return JSON.parse(json);
    }
  }
  function parseRealtimeLeadMessage(raw) {
    if (typeof raw !== "string" || !raw.includes("realtime_bl")) {
      return [];
    }
    const message = /<message\b([^>]*)>([\s\S]*?)<\/message>/i.exec(raw);
    const from = message ? /\bfrom\s*=\s*(["'])(.*?)\1/i.exec(message[1])?.[2] ?? "" : "";
    const resource = from.split("/")[1] ?? "";
    if (!message || !REALTIME_RESOURCES.has(resource)) {
      return [];
    }
    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(message[2])?.[1];
    if (!body) {
      return [];
    }
    try {
      const parsed = parseRealtimeBody(decodeXmlText(body));
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.DisplayList) ? parsed.DisplayList : parsed && typeof parsed === "object" ? [parsed] : [];
      return parseBlDisplayData({ DisplayList: rows });
    } catch {
      return [];
    }
  }
  var MAX_INDEXED_LEADS = 500;
  var BlApiLeadIndex = class {
    byOfrId = /* @__PURE__ */ new Map();
    get size() {
      return this.byOfrId.size;
    }
    add(leads) {
      let added = 0;
      for (const lead of leads) {
        if (!this.byOfrId.has(lead.ofr_id)) {
          added += 1;
        }
        this.byOfrId.delete(lead.ofr_id);
        this.byOfrId.set(lead.ofr_id, lead);
      }
      while (this.byOfrId.size > MAX_INDEXED_LEADS) {
        const oldest = this.byOfrId.values().next().value;
        this.byOfrId.delete(oldest.ofr_id);
      }
      return added;
    }
    /** The API lead with this offer id, while it is still indexed. */
    get(ofrId) {
      return this.byOfrId.get(ofrId) ?? null;
    }
    clear() {
      this.byOfrId.clear();
    }
  };
  function mergeApiLead(lead, api, now = Date.now()) {
    const memberMonths = parseMemberSinceMonths(api.member_since, now);
    return {
      ...lead,
      country: lead.country ?? api.country,
      country_iso: api.country_iso ?? lead.country_iso ?? null,
      state: api.state ?? lead.state ?? null,
      description: api.description ?? lead.description ?? null,
      // IndiaMART's own timestamp is exact; the card only says "6 mins ago".
      lead_age_seconds: api.posted_at_ms !== null ? Math.max(0, Math.round((now - api.posted_at_ms) / 1e3)) : lead.lead_age_seconds ?? null,
      buyer_member_months: memberMonths ?? lead.buyer_member_months ?? null,
      is_retail_flagged: lead.is_retail_flagged === true || api.is_retail_lead,
      category: lead.category ?? ([api.parent_category, api.category].filter(Boolean).join(" > ") || null),
      quantity: lead.quantity ?? api.quantity,
      unit: lead.unit ?? api.unit,
      purpose: lead.purpose ?? api.purpose,
      has_phone: lead.has_phone || api.has_phone,
      has_email: lead.has_email || api.has_email,
      has_whatsapp: lead.has_whatsapp || api.has_whatsapp,
      phone_verified: api.phone_verified || lead.phone_verified === true,
      email_verified: api.email_verified || lead.email_verified === true,
      gst_verified: api.gst_verified,
      raw_fields: {
        ...lead.raw_fields,
        is_retail_lead: lead.raw_fields.is_retail_lead === true || api.is_retail_lead,
        indiamart_api: {
          eto_ofr_id: api.ofr_id,
          country_iso: api.country_iso,
          category: api.category,
          parent_category: api.parent_category,
          enrichment: api.enrichment,
          phone_verified: api.phone_verified,
          email_verified: api.email_verified,
          gst_verified: api.gst_verified,
          member_since: api.member_since,
          buyer_leads_count: api.buyer_leads_count,
          buyer_reply_count: api.buyer_reply_count,
          offer_date: api.offer_date
        }
      }
    };
  }
  function apiLeadClientEventId(ofrId) {
    return `im-ofr:${ofrId}`;
  }
  function apiLeadToCapturedLead(api, sourceUrl, now = Date.now()) {
    const fields = { ...api.enrichment };
    const base = {
      client_event_id: apiLeadClientEventId(api.ofr_id),
      provider: "indiamart",
      title: api.title,
      country: api.country,
      category: null,
      quantity: null,
      unit: null,
      purpose: null,
      has_email: false,
      has_phone: false,
      has_whatsapp: false,
      source_url: sourceUrl,
      captured_at: new Date(now).toISOString(),
      raw_fields: {
        adapter_version: "indiamart-api-poll-1",
        fields,
        breadcrumbs: [api.parent_category, api.category].filter(Boolean),
        buyer_member_since: api.member_since,
        is_retail_lead: api.is_retail_lead
      },
      visible_text: [api.title, api.description, ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join(" | ")
    };
    return mergeApiLead(base, api, now);
  }

  // src/expired-interest-runner.ts
  var STATE_KEYS = [
    "authSession",
    "selectedBusinessId",
    "billingEntitlement",
    "decisionConfig",
    SAFETY_BRAKE_STORAGE_KEY,
    EXPIRED_INTEREST_ENABLED_KEY,
    EXPIRED_INTEREST_LOCK_KEY,
    EXPIRED_INTEREST_SENT_KEY,
    EXPIRED_INTEREST_STATS_KEY,
    EXPIRED_INTEREST_LOG_KEY
  ];
  async function setStatus(deps, state) {
    await deps.storageSet({ [EXPIRED_INTEREST_STATUS_KEY]: { state, at: new Date(deps.now()).toISOString() } });
  }
  function idle(state) {
    return { state, marked: 0, counts: null };
  }
  function blockedReason(values, now) {
    const session = values.authSession;
    if (!session?.access_token) {
      return "not_signed_in";
    }
    if (!billingAllows(values, now)) {
      return "billing_not_confirmed";
    }
    const businessId = resolveSelectedBusinessId(values) ?? "";
    const config = values.decisionConfig;
    if (!config || String(config.business_id) !== businessId) {
      return "filter_config_not_loaded";
    }
    if (safetyBrakeActive(values[SAFETY_BRAKE_STORAGE_KEY], now)) {
      return "safety_brake";
    }
    return null;
  }
  function lockFree(values, owner, now) {
    const lock = values[EXPIRED_INTEREST_LOCK_KEY];
    return !lock?.owner || lock.owner === owner || typeof lock.at !== "number" || now - lock.at >= EXPIRED_LOCK_STALE_MS;
  }
  async function tripBrake(deps, retryAfterSeconds) {
    const stored = await deps.storageGet([SAFETY_BRAKE_STORAGE_KEY]);
    const brake = nextSafetyBrake(
      stored?.[SAFETY_BRAKE_STORAGE_KEY],
      "interest_rate_limited",
      retryAfterSeconds,
      deps.now()
    );
    await deps.storageSet({ [SAFETY_BRAKE_STORAGE_KEY]: brake });
  }
  function keywordsOf(config, ruleIds) {
    const byId = new Map(config.keyword_rules.map((rule) => [String(rule.id), rule.keyword]));
    return ruleIds.map((id) => byId.get(id)).filter((keyword) => Boolean(keyword));
  }
  async function runExpiredInterestScan(deps) {
    const values = await deps.storageGet(STATE_KEYS);
    if (!values || values[EXPIRED_INTEREST_ENABLED_KEY] !== true) {
      return idle("stopped");
    }
    const now = deps.now();
    const blocked = blockedReason(values, now);
    if (blocked) {
      await setStatus(deps, blocked);
      return idle(blocked);
    }
    if (!lockFree(values, deps.ownerToken, now)) {
      return idle("other_tab");
    }
    await deps.storageSet({ [EXPIRED_INTEREST_LOCK_KEY]: { owner: deps.ownerToken, at: now } });
    const config = values.decisionConfig;
    const list = await deps.bridgeRequest("IM_BL_EXPIRED_FETCH", {});
    if (list.status === 429) {
      await tripBrake(deps, list.retryAfterSeconds);
      await setStatus(deps, "safety_brake");
      return idle("safety_brake");
    }
    if (list.error === "not_logged_in") {
      await setStatus(deps, "not_logged_in_indiamart");
      return idle("not_logged_in_indiamart");
    }
    if (!list.ok || !Array.isArray(list.json?.DisplayList)) {
      await setStatus(deps, "list_failed");
      return idle("list_failed");
    }
    const counts = { A: 0, B: 0, C: 0, already_shortlisted: 0 };
    let sent = normalizeSentIds(values[EXPIRED_INTEREST_SENT_KEY]);
    let log = values[EXPIRED_INTEREST_LOG_KEY];
    let stats = statsForDay(values[EXPIRED_INTEREST_STATS_KEY], utcDateString(now));
    const toMark = [];
    const rows = [];
    for (const { api, shortlisted } of parseExpiredBlDisplayData(list.json)) {
      const lead = apiLeadToCapturedLead(api, deps.sourceUrl(), now);
      const ranking = rankExpiredLead(lead, config);
      counts[ranking.rank] += 1;
      if (shortlisted) {
        counts.already_shortlisted += 1;
      }
      const entry = {
        offer_id: api.ofr_id,
        title: api.title,
        country: api.country,
        keywords: keywordsOf(config, ranking.matched_positive_rule_ids)
      };
      const row = { ...entry, rank: ranking.rank, reason: ranking.reason, shortlisted, action: "skipped" };
      rows.push(row);
      if (ranking.rank !== "A") {
        continue;
      }
      if (isHandled(sent, api.ofr_id)) {
        row.action = shortlisted ? "already" : "handled_before";
        continue;
      }
      if (shortlisted) {
        row.action = "already";
        sent = rememberDone(sent, api.ofr_id);
        log = prependLog(log, { ...entry, status: "already", error: null, at: new Date(now).toISOString() });
        continue;
      }
      row.action = "queued";
      toMark.push({ entry, mcatId: api.mcat_id, row });
    }
    stats = { ...stats, last_scan_at: new Date(now).toISOString(), last_scan: counts, last_error: null };
    await deps.storageSet({
      [EXPIRED_INTEREST_SENT_KEY]: sent,
      [EXPIRED_INTEREST_LOG_KEY]: log,
      [EXPIRED_INTEREST_STATS_KEY]: stats,
      [EXPIRED_INTEREST_LAST_SCAN_KEY]: rows
    });
    await setStatus(deps, "running");
    let marked = 0;
    for (const [index, { entry, mcatId, row }] of toMark.entries()) {
      if (index > 0) {
        await deps.sleep(MARK_GAP_MS);
        const latest = await deps.storageGet([EXPIRED_INTEREST_ENABLED_KEY, SAFETY_BRAKE_STORAGE_KEY]);
        if (latest?.[EXPIRED_INTEREST_ENABLED_KEY] !== true) {
          await setStatus(deps, "stopped");
          return { state: "stopped", marked, counts };
        }
        if (safetyBrakeActive(latest?.[SAFETY_BRAKE_STORAGE_KEY], deps.now())) {
          await setStatus(deps, "safety_brake");
          return { state: "safety_brake", marked, counts };
        }
      }
      const result = await deps.bridgeRequest("IM_BL_MARK_SHORTLIST", buildMarkShortlistPayload("", { offerId: entry.offer_id, mcatId }));
      const outcome = parseMarkShortlistResult(result);
      const at = new Date(deps.now()).toISOString();
      if (outcome.kind === "rate_limited") {
        await tripBrake(deps, outcome.retryAfterSeconds);
        stats = { ...stats, last_error: "IndiaMART rate-limited I am Interested" };
        await deps.storageSet({ [EXPIRED_INTEREST_STATS_KEY]: stats });
        await setStatus(deps, "safety_brake");
        return { state: "safety_brake", marked, counts };
      }
      if (outcome.kind === "retry") {
        row.action = "retry";
        stats = { ...stats, last_error: `I am Interested got no answer (${outcome.message}); retrying next scan` };
      } else if (outcome.kind === "ok") {
        row.action = "marked";
        marked += 1;
        sent = rememberDone(sent, entry.offer_id);
        stats = { ...stats, sent_today: stats.sent_today + 1, sent_total: stats.sent_total + 1 };
        log = prependLog(log, { ...entry, status: "interested", error: null, at });
      } else if (outcome.kind === "already") {
        row.action = "already";
        sent = rememberDone(sent, entry.offer_id);
        log = prependLog(log, { ...entry, status: "already", error: null, at });
      } else {
        row.action = "failed";
        sent = rememberFailure(sent, entry.offer_id);
        stats = { ...stats, last_error: outcome.message };
        log = prependLog(log, { ...entry, status: "failed", error: outcome.message, at });
      }
      await deps.storageSet({
        [EXPIRED_INTEREST_SENT_KEY]: sent,
        [EXPIRED_INTEREST_LOG_KEY]: log,
        [EXPIRED_INTEREST_STATS_KEY]: stats,
        [EXPIRED_INTEREST_LAST_SCAN_KEY]: rows,
        [EXPIRED_INTEREST_LOCK_KEY]: { owner: deps.ownerToken, at: deps.now() }
      });
    }
    return { state: "running", marked, counts };
  }
  function startExpiredInterestLoop(deps) {
    let timer = null;
    let running = false;
    let again = false;
    let stopped = false;
    const schedule = (ms) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = stopped ? null : setTimeout(tick, ms);
    };
    async function tick() {
      timer = null;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await runExpiredInterestScan(deps);
      } catch {
      } finally {
        running = false;
      }
      schedule(again ? 0 : EXPIRED_SCAN_INTERVAL_MS);
      again = false;
    }
    schedule(0);
    return {
      runNow: () => schedule(0),
      stop: () => {
        stopped = true;
        if (timer) {
          clearTimeout(timer);
        }
        timer = null;
      },
      release: async () => {
        const values = await deps.storageGet([EXPIRED_INTEREST_LOCK_KEY]);
        const lock = values?.[EXPIRED_INTEREST_LOCK_KEY];
        if (lock?.owner === deps.ownerToken) {
          await deps.storageSet({ [EXPIRED_INTEREST_LOCK_KEY]: null });
        }
      }
    };
  }

  // src/country-iso.ts
  var RETIRED_CODES = /* @__PURE__ */ new Set(["AN", "BU", "CS", "DD", "DY", "EU", "EZ", "FX", "HV", "NH", "NT", "QO", "RH", "SU", "TP", "UN", "VD", "XA", "XB", "XK", "YD", "YU", "ZR", "ZZ"]);
  var EXTRA_NAMES = {
    usa: "US",
    us: "US",
    "u s a": "US",
    america: "US",
    "united states of america": "US",
    uk: "UK",
    gb: "UK",
    britain: "UK",
    "great britain": "UK",
    england: "UK",
    uae: "AE",
    emirates: "AE",
    "czech republic": "CZ",
    "ivory coast": "CI",
    "cote d ivoire": "CI",
    burma: "MM",
    myanmar: "MM",
    "hong kong": "HK",
    palestine: "PS",
    congo: "CG",
    "republic of the congo": "CG",
    "democratic republic of the congo": "CD",
    "holy see": "VA",
    vatican: "VA",
    "cabo verde": "CV",
    turkey: "TR",
    "east timor": "TL",
    "timor leste": "TL",
    korea: "KR",
    "south korea": "KR"
  };
  function normalizeCountry(value) {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  }
  var namesToCodes = null;
  function countryCodes() {
    if (namesToCodes) {
      return namesToCodes;
    }
    const codes = /* @__PURE__ */ new Map();
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      for (let first = 65; first <= 90; first += 1) {
        for (let second = 65; second <= 90; second += 1) {
          const code = String.fromCharCode(first, second);
          const name = RETIRED_CODES.has(code) ? void 0 : names.of(code);
          if (name && name !== code) {
            codes.set(normalizeCountry(name), code === "GB" ? "UK" : code);
          }
        }
      }
    } catch {
    }
    for (const [name, code] of Object.entries(EXTRA_NAMES)) {
      codes.set(name, code);
    }
    namesToCodes = codes;
    return codes;
  }
  function countryIso(country) {
    const normalized = normalizeCountry(country);
    if (!normalized) {
      return null;
    }
    const known = countryCodes().get(normalized);
    if (known) {
      return known;
    }
    const code = normalized.toUpperCase();
    return /^[A-Z]{2}$/.test(code) && [...countryCodes().values()].includes(code) ? code : null;
  }
  var isoFilterCache = /* @__PURE__ */ new WeakMap();
  function leadListIsoFilter(config) {
    if (isoFilterCache.has(config)) {
      return isoFilterCache.get(config) ?? null;
    }
    const result = computeIsoFilter(config);
    isoFilterCache.set(config, result);
    return result;
  }
  function computeIsoFilter(config) {
    let countries = config.settings.allowed_countries.filter((country) => country.trim());
    if (!countries.length) {
      const positives = config.keyword_rules.filter((rule) => rule.type === "positive");
      if (!positives.length || positives.some((rule) => !(rule.allowed_countries ?? []).some((country) => country.trim()))) {
        return null;
      }
      countries = positives.flatMap((rule) => rule.allowed_countries ?? []);
    }
    const codes = /* @__PURE__ */ new Set();
    for (const country of countries) {
      const code = countryIso(country);
      if (!code || code === "IN") {
        return null;
      }
      codes.add(code);
    }
    return [...codes].sort();
  }
  function leadListIsoFilterGap(config) {
    if (leadListIsoFilter(config)) {
      return null;
    }
    const countries = config.settings.allowed_countries.filter((country) => country.trim());
    if (!countries.length) {
      return "no country filter: every country can be captured";
    }
    const unknown = countries.find((country) => !countryIso(country));
    if (unknown) {
      return `country not recognised: ${unknown}`;
    }
    return "India is allowed: Indian leads are listed by state, not country";
  }
  function shuffledIsoParam(codes, random = Math.random) {
    const shuffled = codes.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled.join(",");
  }

  // src/content-script-core.ts
  var extensionContextInvalidated = false;
  var seenLeadIds = /* @__PURE__ */ new Set();
  var pendingLeadStores = /* @__PURE__ */ new Set();
  var pendingEnrichmentStores = /* @__PURE__ */ new Set();
  var inactivityWatcherStarted = false;
  var inactivityReloadStarted = false;
  var enrichmentRetryStates = /* @__PURE__ */ new Map();
  var queuedEnrichmentIds = /* @__PURE__ */ new Set();
  var enrichedLeadIds = /* @__PURE__ */ new Set();
  var markersByClientEventId = /* @__PURE__ */ new Map();
  var MARKER_STORAGE_KEY = "leadDecisionMarkers";
  var ENRICHMENT_RETRY_DELAYS_MS = [2e3, 1e4];
  var ENRICHED_STORAGE_KEY = "enrichedLeadIds";
  var MAX_STORED_ENRICHED_IDS = 500;
  var apiLeadIndex = new BlApiLeadIndex();
  var pageDataListenerStarted = false;
  var realtimeListenerStarted = false;
  var INACTIVITY_CHECK_INTERVAL_MS = 2e3;
  var INACTIVITY_CONTINUE_RETRY_MS = 5e3;
  var MAX_INACTIVITY_CONTINUE_CLICKS = 2;
  var lastInactivityContinueAt = 0;
  var inactivityContinueClicks = 0;
  var DECISION_CONFIG_STORAGE_KEY = "decisionConfig";
  var CAPTURE_STATE_KEYS = ["authSession", "selectedBusinessId", "billingEntitlement", "botEnabled", DECISION_CONFIG_STORAGE_KEY];
  var KEEPALIVE_PORT_NAME = "im-leads-keepalive";
  var KEEPALIVE_PING_MS = 2e4;
  var FLUSH_BEFORE_RELOAD_MAX_MS = 1500;
  var INACTIVITY_POPUP_SELECTORS = [".Bl_admin_modal-content", ".sm_inn_pop_n"];
  var INACTIVITY_DIALOG_CANDIDATES = "[role='dialog'], [role='alertdialog'], .modal, [class*='modal' i], [class*='popup' i], [id*='popup' i], [class*='overlay' i]";
  var INACTIVITY_TEXT_PATTERN = /inactiv|session\s+(has\s+)?(expired|timed?\s*out)|are\s+you\s+still\s+(there|here)|you\s+(have\s+)?been\s+idle|idle\s+for|due\s+to\s+inactivity/i;
  var safetyBrake = null;
  var buyQueue = createBuyQueue(BUY_CONCURRENCY);
  var parkedEnrichments = /* @__PURE__ */ new Map();
  var localDecisionsByClientEventId = /* @__PURE__ */ new Map();
  var localCaptures = /* @__PURE__ */ new Map();
  var captureState = null;
  var captureStateLoad = null;
  var storedMarkersLoad = null;
  var storedMarkersLoaded = false;
  function isExtensionContextInvalidatedError(caught) {
    return caught instanceof Error && /extension context invalidated/i.test(caught.message);
  }
  function stopExtensionLoops() {
    extensionContextInvalidated = true;
    if (apiPollTimer !== void 0) {
      window.clearTimeout(apiPollTimer);
      apiPollTimer = void 0;
    }
  }
  function handleChromeApiError(caught) {
    if (!isExtensionContextInvalidatedError(caught)) {
      return false;
    }
    stopExtensionLoops();
    return true;
  }
  async function safeStorageGet(keys) {
    if (extensionContextInvalidated) {
      return null;
    }
    try {
      return await new Promise((resolve) => {
        chrome.storage.local.get(keys, (items) => resolve(items));
      });
    } catch (caught) {
      if (handleChromeApiError(caught)) {
        return null;
      }
      throw caught;
    }
  }
  async function safeStorageSet(values) {
    if (extensionContextInvalidated) {
      return;
    }
    try {
      await chrome.storage.local.set(values);
    } catch (caught) {
      if (!handleChromeApiError(caught)) {
        throw caught;
      }
    }
  }
  function sendMessageForResponse(message) {
    if (extensionContextInvalidated) {
      return Promise.resolve(null);
    }
    try {
      return chrome.runtime.sendMessage(message).catch((caught) => {
        handleChromeApiError(caught);
        return null;
      });
    } catch (caught) {
      handleChromeApiError(caught);
      return Promise.resolve(null);
    }
  }
  function safeSendMessage(message) {
    if (extensionContextInvalidated) {
      return;
    }
    try {
      chrome.runtime.sendMessage(message);
    } catch (caught) {
      handleChromeApiError(caught);
    }
  }
  function isAllowedIndiaMartUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname.endsWith(".indiamart.com");
    } catch {
      return false;
    }
  }
  function detectPageContext(url, title) {
    if (!isAllowedIndiaMartUrl(url)) {
      return "ignored";
    }
    return title.toLowerCase().includes("indiamart") ? "indiamart_allowed" : "indiamart_allowed";
  }
  function textFrom(element) {
    const directText = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    const labeledText = Array.from(element.querySelectorAll("[aria-label], [title], img[alt]")).map((child) => child.getAttribute("aria-label") ?? child.getAttribute("title") ?? child.getAttribute("alt") ?? "").filter(Boolean).join(" ");
    return `${directText} ${labeledText}`.replace(/\s+/g, " ").trim();
  }
  function normalizeTextValue(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }
  function startPageDataListener() {
    if (pageDataListenerStarted) {
      return;
    }
    pageDataListenerStarted = true;
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (event.source !== window || data?.source !== BL_DISPLAY_DATA_SOURCE || data.type !== BL_DISPLAY_DATA_MESSAGE) {
        return;
      }
      void decideArrivedLeads(parseBlDisplayData(data.payload), "page").catch(() => void 0);
      void trackClosedLeads(data.payload).catch(() => void 0);
      notePageListRequest(
        typeof data.status === "number" ? data.status : 200,
        typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : null,
        data.payload
      );
    });
  }
  function rememberMarkers(markers) {
    for (const marker of markers) {
      markersByClientEventId.set(marker.client_event_id, marker);
    }
  }
  function shouldAutoEnrichMarker(marker, now = Date.now()) {
    if (marker.decision !== "captured" || enrichedLeadIds.has(marker.client_event_id) || queuedEnrichmentIds.has(marker.client_event_id) || parkedEnrichments.has(marker.client_event_id)) {
      return false;
    }
    return (enrichmentRetryStates.get(marker.client_event_id)?.nextAttemptAt ?? 0) <= now;
  }
  function enrichmentHasBuyerData(enrichment) {
    return Boolean(enrichment.buyer_name || enrichment.buyer_phone || enrichment.buyer_email);
  }
  function recordEnrichmentFailure(clientEventId, now = Date.now(), retryAt) {
    const attempts = (enrichmentRetryStates.get(clientEventId)?.attempts ?? 0) + 1;
    const delay = attempts <= ENRICHMENT_RETRY_DELAYS_MS.length ? ENRICHMENT_RETRY_DELAYS_MS[attempts - 1] : Number.POSITIVE_INFINITY;
    const state = { attempts, nextAttemptAt: retryAt ?? now + delay };
    enrichmentRetryStates.set(clientEventId, state);
    return state;
  }
  async function persistEnrichedLeadId(clientEventId) {
    const state = await safeStorageGet([ENRICHED_STORAGE_KEY]);
    if (!state) {
      return;
    }
    const stored = state[ENRICHED_STORAGE_KEY] ?? {};
    const next = Object.entries({ ...stored, [clientEventId]: (/* @__PURE__ */ new Date()).toISOString() }).sort(([, first], [, second]) => second.localeCompare(first)).slice(0, MAX_STORED_ENRICHED_IDS);
    await safeStorageSet({ [ENRICHED_STORAGE_KEY]: Object.fromEntries(next) });
  }
  async function sendLeadEnrichment(marker, enrichment) {
    if (enrichedLeadIds.has(marker.client_event_id)) {
      return true;
    }
    const store = sendMessageForResponse({
      type: "INDIAMART_LEAD_ENRICHED",
      business_id: marker.business_id,
      // The server's id when it has answered by now; the service worker pairs it up otherwise.
      backend_lead_id: markersByClientEventId.get(marker.client_event_id)?.backend_lead_id ?? marker.backend_lead_id,
      client_event_id: marker.client_event_id,
      enrichment
    });
    pendingEnrichmentStores.add(store);
    const response = await store.finally(() => pendingEnrichmentStores.delete(store));
    if (!response?.stored) {
      return false;
    }
    enrichedLeadIds.add(marker.client_event_id);
    enrichmentRetryStates.delete(marker.client_event_id);
    await persistEnrichedLeadId(marker.client_event_id);
    await safeStorageSet({
      lastLeadEnrichmentAttempt: {
        client_event_id: marker.client_event_id,
        backend_lead_id: marker.backend_lead_id,
        buyer_name: enrichment.buyer_name,
        buyer_email: enrichment.buyer_email,
        buyer_phone: enrichment.buyer_phone,
        enriched_at: enrichment.contact_enriched_at
      }
    });
    return true;
  }
  function shouldReportEnrichmentFailure(attempt) {
    return [1, 2, 5, 10].includes(attempt) || attempt % 20 === 0;
  }
  async function recordEnrichmentAttempt(marker, error, retryAt, givesUp = false) {
    const retry = recordEnrichmentFailure(marker.client_event_id, Date.now(), retryAt);
    const final = givesUp && !Number.isFinite(retry.nextAttemptAt);
    if (final) {
      localCaptures.delete(marker.client_event_id);
      enrichedLeadIds.add(marker.client_event_id);
      await persistEnrichedLeadId(marker.client_event_id);
    }
    const backendLeadId = markersByClientEventId.get(marker.client_event_id)?.backend_lead_id ?? marker.backend_lead_id;
    safeSendMessage({
      type: "INDIAMART_LEAD_ENRICHMENT_FAILED",
      business_id: marker.business_id,
      backend_lead_id: backendLeadId ?? null,
      client_event_id: marker.client_event_id,
      error,
      attempt: retry.attempts,
      report: shouldReportEnrichmentFailure(retry.attempts),
      final
    });
    await safeStorageSet({
      lastLeadEnrichmentAttempt: {
        client_event_id: marker.client_event_id,
        backend_lead_id: backendLeadId,
        error,
        attempt: retry.attempts,
        next_attempt_at: Number.isFinite(retry.nextAttemptAt) ? new Date(retry.nextAttemptAt).toISOString() : null,
        attempted_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  function apiLeadForMarker(marker) {
    if (!marker.client_event_id.startsWith("im-ofr:")) {
      return null;
    }
    return apiLeadIndex.get(marker.client_event_id.slice("im-ofr:".length));
  }
  async function buyCapturedLead(marker, api, position, stored = Promise.resolve(true), receivedAt, firstSeenAt, queuedAt) {
    const startedAt = Date.now();
    const state = captureState ?? await readCaptureState();
    if (!state || !isBotRunning(state) || !billingAllows(state) || enrichedLeadIds.has(marker.client_event_id) || brakeOn()) {
      return null;
    }
    const sentAt = Date.now();
    const outcome = parseBuyResult(await bridgeRequest("IM_BL_BUY", buildBuyPayload(api, "", position)));
    const timing = buyTimingNote({ postedAtMs: api.posted_at_ms, receivedAt, firstSeenAt, queuedAt, startedAt, sentAt, answeredAt: Date.now() });
    recordBuyTiming(api, outcome, receivedAt, startedAt, sentAt, firstSeenAt, queuedAt);
    if (!await stored) {
      if (outcome.kind === "bought") {
        const enrichment = enrichmentFromBuy(api, outcome, window.location.href);
        if (enrichmentHasBuyerData(enrichment)) {
          parkedEnrichments.set(marker.client_event_id, enrichment);
        }
      }
      return outcome;
    }
    if (outcome.kind === "bought") {
      void safeStorageSet({
        lastBuy: {
          ofr_id: api.ofr_id,
          purchase_id: outcome.purchaseId,
          credit_balance: outcome.creditBalance,
          at: (/* @__PURE__ */ new Date()).toISOString()
        }
      }).catch(() => void 0);
      const enrichment = enrichmentFromBuy(api, outcome, window.location.href);
      if (!enrichmentHasBuyerData(enrichment)) {
        await recordEnrichmentAttempt(marker, `contact_details_not_retrieved:${outcome.raw}`, Number.POSITIVE_INFINITY, true);
      } else if (!await sendLeadEnrichment(marker, enrichment)) {
        parkedEnrichments.set(marker.client_event_id, enrichment);
        await recordEnrichmentAttempt(marker, "enrichment_not_stored", Number.POSITIVE_INFINITY);
      }
    } else if (outcome.kind === "bought_no_details") {
      await recordEnrichmentAttempt(
        marker,
        `bought_no_details:${outcome.message} ${outcome.raw} (${timing})`,
        Number.POSITIVE_INFINITY,
        true
      );
    } else if (outcome.kind === "lost") {
      await recordEnrichmentAttempt(marker, `lost:${outcome.message} (${timing})`, Number.POSITIVE_INFINITY, true);
    } else if (outcome.kind === "rate_limited") {
      const until = await tripSafetyBrake("buy_rate_limited", outcome.retryAfterSeconds);
      await recordEnrichmentAttempt(marker, `rate_limited:${Math.round((until - Date.now()) / 1e3)}s`, until);
    } else {
      await recordEnrichmentAttempt(marker, `buy_failed:${outcome.message} (${timing})`, void 0, true);
    }
    return outcome;
  }
  function recordBuyTiming(api, outcome, receivedAt, startedAt, sentAt, firstSeenAt, queuedAt) {
    void safeStorageSet({
      lastBuyTiming: {
        ofr_id: api.ofr_id,
        outcome: outcome.kind,
        posted_to_first_seen_ms: api.posted_at_ms === null ? null : (firstSeenAt ?? receivedAt ?? sentAt) - api.posted_at_ms,
        held_for_contact_flags_ms: receivedAt === void 0 || firstSeenAt === void 0 ? null : receivedAt - firstSeenAt,
        received_to_sent_ms: receivedAt === void 0 ? null : sentAt - receivedAt,
        queued_ms: receivedAt === void 0 ? null : startedAt - receivedAt,
        decide_ms: receivedAt === void 0 || queuedAt === void 0 ? null : queuedAt - receivedAt,
        slot_wait_ms: queuedAt === void 0 ? null : startedAt - queuedAt,
        buy_ms: Date.now() - sentAt,
        at: (/* @__PURE__ */ new Date()).toISOString()
      }
    }).catch(() => void 0);
  }
  function startBuy(marker, api, position, priority, stored, receivedAt, firstSeenAt) {
    const id = marker.client_event_id;
    const queuedAt = Date.now();
    queuedEnrichmentIds.add(id);
    void buyQueue.enqueue(() => buyCapturedLead(marker, api, position, stored, receivedAt, firstSeenAt, queuedAt), priority).finally(() => queuedEnrichmentIds.delete(id));
  }
  function autoEnrichCapturedLeadMarkers(markers, priority = "retry") {
    const now = Date.now();
    if (brakeOn(now) || !canBuyInThisTab(now)) {
      return;
    }
    markers.filter((marker) => shouldAutoEnrichMarker(marker, now)).map((marker) => ({ marker, api: apiLeadForMarker(marker) })).filter((item) => item.api !== null).sort((first, second) => second.marker.synced_at.localeCompare(first.marker.synced_at)).forEach(({ marker, api }, index) => startBuy(marker, api, index + 1, priority));
  }
  async function loadStoredLeadDecisions() {
    const state = await safeStorageGet([
      MARKER_STORAGE_KEY,
      ENRICHED_STORAGE_KEY,
      DECIDED_LEAD_KEYS_STORAGE_KEY,
      "authSession",
      "selectedBusinessId"
    ]);
    if (!state) {
      return;
    }
    storedMarkersLoaded = true;
    restoreDecidedLeadKeys(state[DECIDED_LEAD_KEYS_STORAGE_KEY]);
    for (const clientEventId of Object.keys(state[ENRICHED_STORAGE_KEY] ?? {})) {
      enrichedLeadIds.add(clientEventId);
    }
    const markerHistory = state[MARKER_STORAGE_KEY];
    const businessId = resolveSelectedBusinessId(state);
    const markers = Object.values(markerHistory ?? {}).filter((marker) => marker.business_id === businessId);
    rememberMarkers(markers);
    autoEnrichCapturedLeadMarkers(markers);
  }
  function storeLeadsLocally(businessId, leads) {
    const store = sendMessageForResponse({
      type: "INDIAMART_LEADS_CAPTURED",
      business_id: businessId,
      leads
    }).then((response) => {
      const stored = (response?.accepted ?? 0) >= leads.length;
      if (!stored) {
        forgetDecisions(leads);
      }
      return stored;
    });
    pendingLeadStores.add(store);
    void store.finally(() => pendingLeadStores.delete(store));
    return store;
  }
  function forgetDecisions(leads, seenIds = seenLeadIds) {
    let keysChanged = false;
    for (const { client_event_id: id } of leads) {
      seenIds.delete(id);
      localDecisionsByClientEventId.delete(id);
      markersByClientEventId.delete(id);
      localCaptures.delete(id);
      if (id.startsWith("im-ofr:") && decidedLeadKeys.delete(`ofr:${id.slice("im-ofr:".length)}`)) {
        keysChanged = true;
      }
    }
    if (keysChanged) {
      schedulePersistDecidedLeadKeys();
    }
  }
  async function flushLeadsBeforeReload() {
    await Promise.all([...pendingLeadStores, ...pendingEnrichmentStores]);
  }
  function readCaptureState() {
    if (captureState) {
      return Promise.resolve(captureState);
    }
    captureStateLoad ??= safeStorageGet(CAPTURE_STATE_KEYS).then((state) => {
      captureState = state;
      captureStateLoad = null;
      return state;
    });
    return captureStateLoad;
  }
  function startCaptureStateSync() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
          return;
        }
        if (captureState) {
          const next = { ...captureState };
          for (const key of CAPTURE_STATE_KEYS) {
            if (key in changes) {
              next[key] = changes[key].newValue;
            }
          }
          next[DECISION_CONFIG_STORAGE_KEY] = keepCompiledRules(
            captureState[DECISION_CONFIG_STORAGE_KEY],
            next[DECISION_CONFIG_STORAGE_KEY]
          );
          captureState = next;
        }
        if (changes[DECISION_CONFIG_STORAGE_KEY]) {
          forgetCountedLocalCaptures();
        }
        if (changes[POLL_LOCK_STORAGE_KEY]) {
          pollLock = changes[POLL_LOCK_STORAGE_KEY].newValue;
        }
        if (changes[POLL_SETTINGS_STORAGE_KEY]) {
          pollGapMs = pollGapMsFrom(changes[POLL_SETTINGS_STORAGE_KEY].newValue);
        }
        if (changes[LAST_LIST_REQUEST_STORAGE_KEY]) {
          lastListRequestAt = Math.max(lastListRequestAt, Number(changes[LAST_LIST_REQUEST_STORAGE_KEY].newValue) || 0);
        }
        if (changes[SAFETY_BRAKE_STORAGE_KEY]) {
          safetyBrake = changes[SAFETY_BRAKE_STORAGE_KEY].newValue ?? null;
          if (brakeOn()) {
            buyQueue.pause(safetyBrake?.until ?? 0);
          }
        }
        if (changes[MARKER_STORAGE_KEY]) {
          const businessId = captureState ? resolveSelectedBusinessId(captureState) : null;
          const markers = Object.values(changes[MARKER_STORAGE_KEY].newValue ?? {}).filter(
            (marker) => marker.business_id === businessId
          );
          rememberMarkers(markers);
          autoEnrichCapturedLeadMarkers(markers);
        }
      });
    } catch (caught) {
      handleChromeApiError(caught);
    }
  }
  function keepCompiledRules(previous, next) {
    if (!previous || !next || previous === next || previous.version !== next.version || String(previous.business_id) !== String(next.business_id)) {
      return next;
    }
    return { ...next, keyword_rules: previous.keyword_rules };
  }
  function cachedDecisionConfig(state, businessId) {
    const config = state[DECISION_CONFIG_STORAGE_KEY];
    return config && String(config.business_id) === businessId ? config : null;
  }
  function forgetCountedLocalCaptures() {
    const config = captureState?.[DECISION_CONFIG_STORAGE_KEY];
    if (!config) {
      return;
    }
    for (const [clientEventId, capture] of localCaptures) {
      if (capture.ackedAt !== void 0 && capture.ackedAt < config.requested_at) {
        localCaptures.delete(clientEventId);
      }
    }
  }
  function noteServerDecisions(markers, now = Date.now()) {
    for (const marker of markers) {
      const capture = localCaptures.get(marker.client_event_id);
      if (capture) {
        capture.ackedAt ??= now;
      } else if (marker.decision === "captured") {
        localCaptures.set(marker.client_event_id, { ruleIds: [], ackedAt: now });
      }
    }
  }
  var DECIDED_LEAD_KEYS_STORAGE_KEY = "decidedLeadKeys";
  var DECIDED_LEAD_KEYS_TTL_MS = 24 * 60 * 60 * 1e3;
  var MAX_DECIDED_LEAD_KEYS = 2e3;
  var POLL_LOCK_STORAGE_KEY = "blPollLock";
  var LAST_LIST_REQUEST_STORAGE_KEY = "blLastListRequestAt";
  var SAFETY_BRAKE_RELOAD_STORAGE_KEY = "safetyBrakeReloadedFor";
  var POLL_LOCK_STALE_MS = 45e3;
  var POLL_IDLE_DELAY_MS = 1e3;
  var BRIDGE_RESPONSE_TIMEOUT_MS = 3e4;
  var decidedLeadKeys = /* @__PURE__ */ new Map();
  var decidedLeadKeysWriteTimer;
  var apiPollerStarted = false;
  var apiPollTimer;
  var apiPollFailures = 0;
  var apiPollHttpErrors = 0;
  var MAX_POLL_HTTP_ERRORS = 3;
  var apiPollDueAt;
  var apiPollsInFlight = 0;
  var lastApiPollEndedAt = 0;
  var lastListRequestAt = 0;
  var pollGapMs = POLL_GAP_MS;
  var apiPollWanted = false;
  var lastApiPollPenalized = false;
  var pollOwnerToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  var pendingBridgeRequests = /* @__PURE__ */ new Map();
  var bridgeListenerStarted = false;
  function titleLeadKey(title, country) {
    const clean = (value) => (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return `title:${clean(title)}|${clean(country)}`;
  }
  function rememberDecidedLead(api, clientEventId, now = Date.now()) {
    const key = `ofr:${api.ofr_id}`;
    if (!decidedLeadKeys.has(key)) {
      decidedLeadKeys.set(key, { id: clientEventId, at: now });
    }
    schedulePersistDecidedLeadKeys();
  }
  function schedulePersistDecidedLeadKeys() {
    if (decidedLeadKeysWriteTimer === void 0 && typeof window !== "undefined") {
      decidedLeadKeysWriteTimer = window.setTimeout(() => {
        decidedLeadKeysWriteTimer = void 0;
        void persistDecidedLeadKeys();
      }, 500);
    }
  }
  async function persistDecidedLeadKeys(now = Date.now()) {
    const entries = [...decidedLeadKeys.entries()].filter(([, value]) => now - value.at < DECIDED_LEAD_KEYS_TTL_MS).sort((first, second) => second[1].at - first[1].at).slice(0, MAX_DECIDED_LEAD_KEYS);
    await safeStorageSet({ [DECIDED_LEAD_KEYS_STORAGE_KEY]: Object.fromEntries(entries) });
  }
  function restoreDecidedLeadKeys(stored, now = Date.now()) {
    for (const [key, value] of Object.entries(stored ?? {})) {
      if (value?.id && typeof value.at === "number" && now - value.at < DECIDED_LEAD_KEYS_TTL_MS && !decidedLeadKeys.has(key)) {
        decidedLeadKeys.set(key, { id: value.id, at: value.at });
      }
    }
  }
  function alreadyDecided(api) {
    const id = apiLeadClientEventId(api.ofr_id);
    const cardDecision = decidedLeadKeys.get(titleLeadKey(api.title, api.country))?.id;
    return seenLeadIds.has(id) || localDecisionsByClientEventId.has(id) || markersByClientEventId.has(id) || decidedLeadKeys.has(`ofr:${api.ofr_id}`) || Boolean(cardDecision && !cardDecision.startsWith("im-ofr:"));
  }
  function startBridgeResponseListener() {
    if (bridgeListenerStarted) {
      return;
    }
    bridgeListenerStarted = true;
    window.addEventListener(BRIDGE_RESPONSE_EVENT, (event) => {
      const response = decodeBridgeResponse(event.detail);
      const resolve = response ? pendingBridgeRequests.get(response.requestId) : void 0;
      if (response && resolve) {
        pendingBridgeRequests.delete(response.requestId);
        resolve(response.result);
      }
    });
  }
  function bridgeRequest(type, payload = {}) {
    startBridgeResponseListener();
    const requestId = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        resolve({ ok: false, status: 0, retryAfterSeconds: null, durationMs: BRIDGE_RESPONSE_TIMEOUT_MS, json: null, error: "bridge_timeout" });
      }, BRIDGE_RESPONSE_TIMEOUT_MS);
      pendingBridgeRequests.set(requestId, (result) => {
        window.clearTimeout(timer);
        resolve(result);
      });
      window.dispatchEvent(new CustomEvent(BRIDGE_REQUEST_EVENT, { detail: encodeBridgeRequest({ type, requestId, payload }) }));
    });
  }
  var pollLock;
  var pollSharedStateLoad = null;
  var pollLockWrittenAt = 0;
  var POLL_LOCK_REFRESH_MS = 5e3;
  function loadPollSharedState() {
    pollSharedStateLoad ??= safeStorageGet([POLL_LOCK_STORAGE_KEY, SAFETY_BRAKE_STORAGE_KEY, LAST_LIST_REQUEST_STORAGE_KEY, POLL_SETTINGS_STORAGE_KEY]).then((state) => {
      pollGapMs = pollGapMsFrom(state?.[POLL_SETTINGS_STORAGE_KEY]);
      pollLock = state?.[POLL_LOCK_STORAGE_KEY];
      lastListRequestAt = Math.max(lastListRequestAt, Number(state?.[LAST_LIST_REQUEST_STORAGE_KEY]) || 0);
      safetyBrake = state?.[SAFETY_BRAKE_STORAGE_KEY] ?? safetyBrake;
    });
    return pollSharedStateLoad;
  }
  function holdPollLock(now = Date.now()) {
    const lock = pollLock;
    if (lock?.owner && lock.owner !== pollOwnerToken && typeof lock.at === "number" && now - lock.at < POLL_LOCK_STALE_MS) {
      return false;
    }
    if (lock?.owner !== pollOwnerToken || now - pollLockWrittenAt >= POLL_LOCK_REFRESH_MS) {
      pollLockWrittenAt = now;
      pollLock = { owner: pollOwnerToken, at: now };
      void safeStorageSet({ [POLL_LOCK_STORAGE_KEY]: pollLock }).catch(() => void 0);
    }
    return true;
  }
  function releasePollLock() {
    if (pollLock?.owner === pollOwnerToken) {
      pollLock = void 0;
      void safeStorageSet({ [POLL_LOCK_STORAGE_KEY]: null }).catch(() => void 0);
    }
  }
  function noteListRequest(now = Date.now()) {
    lastListRequestAt = Math.max(lastListRequestAt, now);
    void safeStorageSet({ [LAST_LIST_REQUEST_STORAGE_KEY]: lastListRequestAt }).catch(() => void 0);
  }
  function lastListActivityAt() {
    return Math.max(lastApiPollEndedAt, lastListRequestAt);
  }
  function notePageListRequest(status, retryAfterSeconds, payload) {
    const now = Date.now();
    noteListRequest(now);
    const listed = Array.isArray(payload?.DisplayList);
    const activityWarning = !listed && payload != null && looksLikeActivityWarning(JSON.stringify(payload).slice(0, 2e3));
    if (isPollRateLimited({ status, retryAfterSeconds }) || activityWarning) {
      void tripSafetyBrake("page_list_rate_limited", retryAfterSeconds).then((until) => {
        if (apiPollerStarted && apiPollsInFlight === 0) {
          lastApiPollPenalized = true;
          scheduleApiPoll(Math.max(0, until - Date.now()));
        }
      });
      return;
    }
    const earliest = now + nextPollDelayMs(pollGapMs);
    if (apiPollDueAt !== void 0 && apiPollDueAt < earliest) {
      scheduleApiPoll(earliest - now);
    }
  }
  function scheduleApiPoll(delayMs) {
    if (extensionContextInvalidated) {
      return;
    }
    if (apiPollTimer !== void 0) {
      window.clearTimeout(apiPollTimer);
    }
    apiPollDueAt = Date.now() + delayMs;
    apiPollTimer = window.setTimeout(startApiPollNow, delayMs);
  }
  function startApiPollNow() {
    if (extensionContextInvalidated) {
      return;
    }
    if (apiPollTimer !== void 0) {
      window.clearTimeout(apiPollTimer);
    }
    apiPollTimer = void 0;
    apiPollDueAt = void 0;
    if (apiPollsInFlight >= MAX_POLLS_IN_FLIGHT) {
      apiPollWanted = true;
      return;
    }
    const gapLeft = pollGapMs - (Date.now() - lastListActivityAt());
    if (gapLeft > 0) {
      scheduleApiPoll(gapLeft);
      return;
    }
    apiPollWanted = false;
    apiPollsInFlight += 1;
    void runApiPoll().catch(() => {
      lastApiPollPenalized = true;
      return pollFailureBackoffMs(++apiPollFailures);
    }).then((delayMs) => {
      apiPollsInFlight -= 1;
      lastApiPollEndedAt = Date.now();
      scheduleApiPoll(apiPollWanted && !lastApiPollPenalized ? Math.min(delayMs, pollGapMs) : delayMs);
    });
  }
  function pollSoon() {
    if (!apiPollerStarted || lastApiPollPenalized || brakeOn()) {
      return;
    }
    if (apiPollsInFlight > 0) {
      apiPollWanted = true;
      return;
    }
    const earliest = lastListActivityAt() + pollGapMs;
    if (apiPollDueAt === void 0 || apiPollDueAt > earliest) {
      scheduleApiPoll(Math.max(0, earliest - Date.now()));
    }
  }
  function runOverdueApiPoll() {
    if (apiPollDueAt !== void 0 && Date.now() >= apiPollDueAt) {
      startApiPollNow();
    }
  }
  function isBotRunning(state) {
    return state.botEnabled === true;
  }
  function captureContextFrom(state) {
    const authSession = state?.authSession;
    if (!state || !authSession?.access_token) {
      return { idle: "not_signed_in" };
    }
    if (!isBotRunning(state)) {
      return { idle: "bot_stopped" };
    }
    if (!billingAllows(state)) {
      return { idle: "billing_not_confirmed" };
    }
    const businessId = resolveSelectedBusinessId(state) ?? "";
    const config = cachedDecisionConfig(state, businessId);
    return config ? { businessId, config } : { idle: "filter_config_not_loaded" };
  }
  async function decideArrivedLeads(leads, source) {
    if (!leads.length) {
      return;
    }
    const receivedAt = Date.now();
    apiLeadIndex.add(source === "push" ? leads.filter((api) => !apiLeadIndex.get(api.ofr_id)) : leads);
    if (!storedMarkersLoaded) {
      storedMarkersLoad ??= loadStoredLeadDecisions().catch(() => void 0);
      await storedMarkersLoad;
    }
    const context = captureContextFrom(captureState ?? await readCaptureState());
    if ("idle" in context) {
      return;
    }
    const result = decidePolledLeads(leads, context.businessId, context.config, source, receivedAt);
    if (result.deferred) {
      pollSoon();
    }
  }
  var XMPP_CONNECTION_DATA_KEY = "xmppConnectionData";
  var XMPP_MINUTE_LIMIT = 15;
  function resetRealtimeThrottle(storage = safeLocalStorage(), now = Date.now()) {
    try {
      const raw = storage?.getItem(XMPP_CONNECTION_DATA_KEY);
      if (!storage || !raw) {
        return false;
      }
      const connections = JSON.parse(raw);
      let changed = false;
      for (const connection of Object.values(connections ?? {})) {
        if (connection && ((connection.minuteCount ?? 0) >= XMPP_MINUTE_LIMIT || now - (connection.minuteTimestamp ?? 0) > 6e4)) {
          connection.minuteCount = 0;
          connection.minuteTimestamp = now;
          changed = true;
        }
      }
      if (changed) {
        storage.setItem(XMPP_CONNECTION_DATA_KEY, JSON.stringify(connections));
      }
      return changed;
    } catch {
      return false;
    }
  }
  function safeLocalStorage() {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  }
  function startRealtimeLeadListener() {
    if (realtimeListenerStarted || typeof BroadcastChannel === "undefined") {
      return;
    }
    realtimeListenerStarted = true;
    resetRealtimeThrottle();
    try {
      const channel = new BroadcastChannel(REALTIME_CHANNEL_NAME);
      channel.addEventListener("message", (event) => {
        const leads = parseRealtimeLeadMessage(event.data);
        if (leads.length) {
          void decideArrivedLeads(leads, "push").catch(() => void 0);
        }
      });
    } catch {
    }
  }
  var POLL_STATUS_WRITE_INTERVAL_MS = 5e3;
  var lastPollStatusKey = "";
  var lastPollStatusWrittenAt = 0;
  async function recordPollStatus(status) {
    lastPollIdleReason = null;
    const key = `${status.ok}|${status.status}|${status.error ?? ""}`;
    const now = Date.now();
    if (key === lastPollStatusKey && now - lastPollStatusWrittenAt < POLL_STATUS_WRITE_INTERVAL_MS && !status.new_leads) {
      return;
    }
    lastPollStatusKey = key;
    lastPollStatusWrittenAt = now;
    await safeStorageSet({ lastApiPoll: { ...status, at: new Date(now).toISOString() } });
  }
  var lastPollIdleReason = null;
  function pollIdle(reason, delayMs = POLL_IDLE_DELAY_MS) {
    if (reason !== lastPollIdleReason) {
      lastPollIdleReason = reason;
      void safeStorageSet({ lastApiPoll: { ok: false, idle: reason, url: window.location.href, at: (/* @__PURE__ */ new Date()).toISOString() } });
    }
    return delayMs;
  }
  function brakeOn(now = Date.now()) {
    return safetyBrakeActive(safetyBrake, now);
  }
  async function tripSafetyBrake(reason, retryAfterSeconds, detail) {
    const now = Date.now();
    if (safetyBrake && brakeOn(now)) {
      return safetyBrake.until;
    }
    safetyBrake = nextSafetyBrake(safetyBrake, reason, retryAfterSeconds, now);
    buyQueue.pause(safetyBrake.until);
    await safeStorageSet({
      [SAFETY_BRAKE_STORAGE_KEY]: safetyBrake,
      lastSafetyBrake: { ...safetyBrake, detail: detail ?? null, at: new Date(now).toISOString() }
    });
    return safetyBrake.until;
  }
  async function runApiPoll() {
    lastApiPollPenalized = false;
    storedMarkersLoad ??= loadStoredLeadDecisions().catch(() => void 0);
    await storedMarkersLoad;
    const context = captureContextFrom(await readCaptureState());
    if ("idle" in context) {
      return pollIdle(context.idle);
    }
    let { businessId, config } = context;
    await loadPollSharedState();
    if (safetyBrake && brakeOn()) {
      lastApiPollPenalized = true;
      return pollIdle(`safety_brake_until_${new Date(safetyBrake.until).toISOString()}`, safetyBrake.until - Date.now());
    }
    if (!holdPollLock()) {
      return pollIdle("another_tab_is_polling");
    }
    const isoFilter = leadListIsoFilter(config);
    const request = bridgeRequest("IM_BL_FETCH", isoFilter ? { iso: shuffledIsoParam(isoFilter) } : {});
    noteListRequest();
    const result = await request;
    const receivedAt = Date.now();
    const listed = Array.isArray(result.json?.DisplayList);
    const activityWarning = !listed && result.json != null && looksLikeActivityWarning(JSON.stringify(result.json).slice(0, 2e3));
    if (isPollRateLimited(result) || activityWarning) {
      lastApiPollPenalized = true;
      const until = await tripSafetyBrake(activityWarning ? "list_activity_warning" : "list_rate_limited", result.retryAfterSeconds);
      await recordPollStatus({
        ok: false,
        status: result.status,
        retry_after: result.retryAfterSeconds,
        error: `IndiaMART pushed back, polling and buying paused until ${new Date(until).toISOString()}`
      });
      return until - Date.now();
    }
    if (result.status === 0) {
      lastApiPollPenalized = true;
      apiPollFailures += 1;
      await recordPollStatus({ ok: false, status: 0, error: result.error ?? "no response", failures: apiPollFailures });
      return pollFailureBackoffMs(apiPollFailures);
    }
    apiPollFailures = 0;
    const leads = result.ok ? parseBlDisplayData(result.json) : [];
    if (!result.ok || !listed) {
      lastApiPollPenalized = true;
      apiPollHttpErrors = result.ok ? 0 : apiPollHttpErrors + 1;
      if (apiPollHttpErrors >= MAX_POLL_HTTP_ERRORS) {
        apiPollHttpErrors = 0;
        const until = await tripSafetyBrake("list_http_errors", result.retryAfterSeconds);
        await recordPollStatus({
          ok: false,
          status: result.status,
          retry_after: result.retryAfterSeconds,
          error: `IndiaMART pushed back, polling and buying paused until ${new Date(until).toISOString()}`
        });
        return until - Date.now();
      }
      await recordPollStatus({
        ok: false,
        status: result.status,
        error: result.error ?? (listed ? `HTTP ${result.status}` : "response without DisplayList")
      });
      return POLL_NOT_OK_DELAY_MS;
    }
    apiPollHttpErrors = 0;
    apiLeadIndex.add(leads);
    // The request can wait several seconds for a slot. Decide with the rules as they are now, not as they were when it was sent.
    const latest = captureContextFrom(captureState ?? await readCaptureState());
    if ("idle" in latest) {
      return pollIdle(latest.idle);
    }
    ({ businessId, config } = latest);
    const { recorded } = decidePolledLeads(leads, businessId, config, "poll", receivedAt);
    sweepDeferredLeads(businessId, config);
    void trackClosedLeads(result.json, receivedAt).catch(() => void 0);
    await recordPollStatus({
      ok: true,
      status: result.status,
      listed: leads.length,
      unlisted_rows: result.json.DisplayList.length - leads.length,
      new_leads: recorded,
      ms: result.durationMs,
      // Which countries the list was asked for, or why it was not filtered by country.
      iso: isoFilter ? isoFilter.join(",") : null,
      iso_gap: isoFilter ? null : leadListIsoFilterGap(config)
    });
    autoEnrichCapturedLeadMarkers([...markersByClientEventId.values()]);
    sendParkedEnrichments([...parkedEnrichments.keys()].map((id) => ({ client_event_id: id })));
    return nextPollDelayMs(pollGapMs);
  }
  // Only a tab with the page hook can reach IndiaMART, and only one tab should buy. Every other tab
  // still records what it sees; the owner picks up the purchase from the shared markers.
  function canBuyInThisTab(now = Date.now()) {
    const lock = pollLock;
    const heldElsewhere = Boolean(lock?.owner) && lock.owner !== pollOwnerToken && typeof lock.at === "number" && now - lock.at < POLL_LOCK_STALE_MS;
    return apiPollerStarted && !heldElsewhere;
  }
  function isBuyLeadPath(pathname) {
    return /^\/bltxn(\/|$)/.test(pathname);
  }
  // Leads held back until the list confirms them. Without this, one that sold out first was never recorded.
  var DEFERRED_LEAD_MAX_WAIT_MS = 2e4;
  var deferredLeads = /* @__PURE__ */ new Map();
  function deferLead(api, now) {
    if (!deferredLeads.has(api.ofr_id)) {
      deferredLeads.set(api.ofr_id, { api, since: now });
    }
    if (deferredLeads.size > MAX_DECIDED_LEAD_KEYS) {
      deferredLeads.delete(deferredLeads.keys().next().value);
    }
  }
  function sweepDeferredLeads(businessId, config, now = Date.now()) {
    const due = [];
    for (const [ofrId, entry] of deferredLeads) {
      if (alreadyDecided(entry.api)) {
        deferredLeads.delete(ofrId);
      } else if (now - entry.since >= DEFERRED_LEAD_MAX_WAIT_MS) {
        deferredLeads.delete(ofrId);
        due.push(entry.api);
      }
    }
    if (due.length) {
      decidePolledLeads(due, businessId, config, "sweep");
    }
  }
  // Kept out of the decided list on purpose: a lead that reopens must still be judged normally.
  var closedLeadIds = /* @__PURE__ */ new Set();
  async function trackClosedLeads(payload, receivedAt = Date.now()) {
    const closed = parseBlClosedLeads(payload);
    if (!closed.length) {
      return 0;
    }
    storedMarkersLoad ??= loadStoredLeadDecisions().catch(() => void 0);
    await storedMarkersLoad;
    const context = captureContextFrom(captureState ?? await readCaptureState());
    if ("idle" in context) {
      return 0;
    }
    const now = Date.now();
    const recorded = [];
    for (const api of closed) {
      if (alreadyDecided(api) || closedLeadIds.has(api.ofr_id)) {
        continue;
      }
      closedLeadIds.add(api.ofr_id);
      if (closedLeadIds.size > MAX_DECIDED_LEAD_KEYS) {
        closedLeadIds.delete(closedLeadIds.values().next().value);
      }
      recorded.push({
        ...apiLeadToCapturedLead(api, window.location.href, now),
        local_decision: {
          decision: "skipped",
          skip_reason: "lead_not_open",
          matched_positive_rule_ids: [],
          explanation: { indiamart_status: api.closed_status },
          config_version: context.config.version
        }
      });
    }
    if (recorded.length) {
      void storeLeadsLocally(context.businessId, recorded);
    }
    return recorded.length;
  }
  function decidePolledLeads(leads, businessId, config, source = "poll", receivedAt = Date.now()) {
    const sourceUrl = window.location.href;
    const now = Date.now();
    const positions = new Map(leads.map((api, index) => [api.ofr_id, index + 1]));
    let settleStored = () => void 0;
    const stored = new Promise((resolve) => {
      settleStored = resolve;
    });
    const buyNow = !brakeOn(now) && canBuyInThisTab(now);
    const fresh = leads.filter((api) => !alreadyDecided(api)).sort((first, second) => (second.posted_at_ms ?? 0) - (first.posted_at_ms ?? 0));
    const recorded = [];
    let undecided = 0;
    let deferred = 0;
    for (const api of fresh) {
      const lead = apiLeadToCapturedLead(api, sourceUrl, now);
      const decision = decideLeadLocally(lead, config, currentCaptureCounters(config, localCaptures.values()), now);
      if (!decision) {
        undecided += 1;
        if (source === "sweep") {
          deferLead(api, now);
        }
        continue;
      }
      if (source === "push" && decision.decision !== "captured" && !skipProvenByPush(decision.skip_reason, api)) {
        deferred += 1;
        deferLead(api, now);
        continue;
      }
      const waitingForSignals = source !== "sweep" && !api.contact_signals_known && stillWaitingForSignals(api.ofr_id, now);
      if (waitingForSignals && decision.skip_reason === "contact_requirement_not_met") {
        deferred += 1;
        deferLead(api, now);
        continue;
      }
      if (decision.decision === "skipped") {
        decision.explanation = explainSkip(lead, config);
      }
      const firstSeenAt = contactSignalsMissingSince.get(api.ofr_id);
      contactSignalsMissingSince.delete(api.ofr_id);
      const id = lead.client_event_id;
      localDecisionsByClientEventId.set(id, decision);
      rememberDecidedLead(api, id, now);
      const marker = {
        client_event_id: id,
        business_id: businessId,
        backend_lead_id: null,
        decision: decision.decision,
        skip_reason: decision.skip_reason ?? null,
        synced_at: new Date(now).toISOString()
      };
      markersByClientEventId.set(id, marker);
      if (!api.contact_signals_known) {
        awaitContactSignals(api.ofr_id, businessId, id, now);
      }
      if (decision.decision === "captured") {
        localCaptures.set(id, { ruleIds: decision.matched_positive_rule_ids });
        if (buyNow && shouldAutoEnrichMarker(marker, now)) {
          startBuy(marker, api, positions.get(api.ofr_id) ?? 1, "fresh", stored, receivedAt, firstSeenAt);
        }
      }
      recorded.push({ ...lead, local_decision: decision });
    }
    sendLateContactSignals(leads, now);
    if (undecided) {
      requestFreshDecisionConfig();
    }
    recordLeads(businessId, recorded, settleStored, source, receivedAt);
    return { recorded: recorded.length, deferred };
  }
  function recordLeads(businessId, leads, settle, source, receivedAt) {
    if (!leads.length) {
      settle(true);
      return;
    }
    for (const lead of leads) {
      seenLeadIds.add(lead.client_event_id);
    }
    const decidedAt = Date.now();
    void storeLeadsLocally(businessId, leads).then((isStored) => {
      settle(isStored);
      noteIntake(source, leads.length, decidedAt - receivedAt, Date.now() - decidedAt);
      if (isStored) {
        sendParkedEnrichments(leads);
      }
    });
  }
  var CONTACT_SIGNALS_WAIT_MS = 15e3;
  var contactSignalsMissingSince = /* @__PURE__ */ new Map();
  var awaitingContactSignals = /* @__PURE__ */ new Map();
  var CONTACT_SIGNALS_UPDATE_MS = 10 * 6e4;
  function stillWaitingForSignals(ofrId, now) {
    const since = contactSignalsMissingSince.get(ofrId) ?? now;
    contactSignalsMissingSince.set(ofrId, since);
    if (contactSignalsMissingSince.size > MAX_DECIDED_LEAD_KEYS) {
      contactSignalsMissingSince.delete(contactSignalsMissingSince.keys().next().value);
    }
    return now - since < CONTACT_SIGNALS_WAIT_MS;
  }
  function awaitContactSignals(ofrId, businessId, clientEventId, now) {
    awaitingContactSignals.set(ofrId, { businessId, clientEventId, since: now });
    if (awaitingContactSignals.size > MAX_DECIDED_LEAD_KEYS) {
      awaitingContactSignals.delete(awaitingContactSignals.keys().next().value);
    }
  }
  function sendLateContactSignals(leads, now) {
    if (!awaitingContactSignals.size) {
      return;
    }
    for (const api of leads) {
      const waiting = awaitingContactSignals.get(api.ofr_id);
      if (!waiting) {
        continue;
      }
      if (now - waiting.since > CONTACT_SIGNALS_UPDATE_MS) {
        awaitingContactSignals.delete(api.ofr_id);
      } else if (api.contact_signals_known) {
        awaitingContactSignals.delete(api.ofr_id);
        safeSendMessage({
          type: "INDIAMART_LEAD_CONTACT_SIGNALS",
          business_id: waiting.businessId,
          client_event_id: waiting.clientEventId,
          signals: contactSignalsOf(api)
        });
      }
    }
  }
  function contactSignalsOf(api) {
    return {
      has_phone: api.has_phone,
      has_email: api.has_email,
      has_whatsapp: api.has_whatsapp,
      phone_verified: api.phone_verified,
      email_verified: api.email_verified
    };
  }
  var SKIPS_PROVEN_BY_PUSH = /* @__PURE__ */ new Set([
    "invalid_title",
    "country_not_allowed",
    "negative_keyword_match",
    "no_positive_keyword_match",
    "daily_limit_reached"
  ]);
  function skipProvenByPush(reason, api) {
    if (reason === "country_not_allowed" && !api.country && !api.country_iso) {
      return false;
    }
    return reason != null && SKIPS_PROVEN_BY_PUSH.has(reason);
  }
  function sendParkedEnrichments(leads) {
    for (const { client_event_id: id } of leads) {
      const enrichment = parkedEnrichments.get(id);
      const marker = markersByClientEventId.get(id);
      if (!enrichment || !marker) {
        continue;
      }
      void sendLeadEnrichment(marker, enrichment).then((sent) => {
        if (sent) {
          parkedEnrichments.delete(id);
        }
      });
    }
  }
  var freshConfigRequestedAt = 0;
  function requestFreshDecisionConfig(now = Date.now()) {
    if (now - freshConfigRequestedAt < 5e3) {
      return;
    }
    freshConfigRequestedAt = now;
    pollIdle("filter_config_stale");
    safeSendMessage({ type: "SYNC_NOW" });
  }
  var INTAKE_WRITE_INTERVAL_MS = 5e3;
  var lastIntakeWrittenAt = 0;
  function noteIntake(source, count, decideMs, storeMs, now = Date.now()) {
    if (now - lastIntakeWrittenAt < INTAKE_WRITE_INTERVAL_MS) {
      return;
    }
    lastIntakeWrittenAt = now;
    void safeStorageSet({
      lastIntake: { source, count, decide_ms: decideMs, store_ms: storeMs, at: new Date(now).toISOString() }
    }).catch(() => void 0);
  }
  function startApiPoller() {
    if (apiPollerStarted || window.top !== window || !isBuyLeadPath(window.location.pathname)) {
      return;
    }
    apiPollerStarted = true;
    window.addEventListener("pagehide", releasePollLock);
    void loadPollSharedState().catch(() => void 0).then(() => {
      if (apiPollTimer === void 0 && apiPollsInFlight === 0) {
        scheduleApiPoll(firstPollDelayMs(lastListActivityAt(), Date.now(), pollGapMs));
      }
    });
  }
  function looksLikeInactivityPrompt(text3) {
    const normalized = normalizeTextValue(text3);
    return normalized.length > 0 && normalized.length < 600 && INACTIVITY_TEXT_PATTERN.test(normalized);
  }
  function isVisibleElement(element) {
    if (element.getClientRects().length === 0) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }
  function findInactivityPopup() {
    for (const selector of INACTIVITY_POPUP_SELECTORS) {
      const popup = Array.from(document.querySelectorAll(selector)).find(
        (candidate) => isVisibleElement(candidate) && looksLikeInactivityPrompt(
          candidate.querySelector(".pop_in_txt")?.textContent ?? candidate.innerText ?? candidate.textContent ?? ""
        )
      );
      if (popup) {
        return popup;
      }
    }
    return Array.from(document.querySelectorAll(INACTIVITY_DIALOG_CANDIDATES)).find(
      (candidate) => !candidate.closest(".bl_quote_form") && isVisibleElement(candidate) && looksLikeInactivityPrompt(candidate.innerText || candidate.textContent || "")
    ) ?? null;
  }
  function findInactivityContinueButton(popup) {
    const container = popup.closest(".Bl_admin_modal") ?? popup;
    const byId = container.querySelector("#Yes");
    if (byId) {
      return byId;
    }
    return Array.from(container.querySelectorAll("button, a, [role='button']")).find(
      (candidate) => /get\s+fresh\s+leads|continue/i.test(textFrom(candidate))
    ) ?? null;
  }
  function findActivityWarningPopup() {
    return Array.from(document.querySelectorAll([...INACTIVITY_POPUP_SELECTORS, INACTIVITY_DIALOG_CANDIDATES].join(", "))).find(
      (candidate) => {
        const text3 = normalizeTextValue(candidate.innerText || candidate.textContent || "");
        return text3.length > 0 && text3.length < 1e3 && isVisibleElement(candidate) && looksLikeActivityWarning(text3);
      }
    ) ?? null;
  }
  async function checkForActivityWarning() {
    const popup = findActivityWarningPopup();
    if (!popup) {
      return false;
    }
    const state = captureState ?? await readCaptureState();
    if (!state || !isBotRunning(state)) {
      return true;
    }
    await loadPollSharedState().catch(() => void 0);
    if (brakeOn()) {
      return true;
    }
    const reloadedFor = (await safeStorageGet([SAFETY_BRAKE_RELOAD_STORAGE_KEY]))?.[SAFETY_BRAKE_RELOAD_STORAGE_KEY];
    if (safetyBrake && shouldReloadAfterBrake(safetyBrake, typeof reloadedFor === "number" ? reloadedFor : null)) {
      await safeStorageSet({ [SAFETY_BRAKE_RELOAD_STORAGE_KEY]: safetyBrake.tripped_at });
      await reloadBuyLeadPage("lastSafetyBrakeReload", popup);
      return true;
    }
    await tripSafetyBrake("indiamart_activity_warning", null, normalizeTextValue(popup.innerText || popup.textContent).slice(0, 200));
    return true;
  }
  function checkForInactivityPopup() {
    if (inactivityReloadStarted || extensionContextInvalidated) {
      return;
    }
    void checkForActivityWarning().catch(() => false).then((warned) => {
      if (!warned) {
        checkForInactivityPrompt();
      }
    });
  }
  function checkForInactivityPrompt() {
    const popup = findInactivityPopup();
    if (!popup) {
      inactivityContinueClicks = 0;
      return;
    }
    void continueAfterInactivity(popup);
  }
  async function continueAfterInactivity(popup) {
    const now = Date.now();
    if (now - lastInactivityContinueAt < INACTIVITY_CONTINUE_RETRY_MS) {
      return;
    }
    const state = await readCaptureState();
    if (!state || !isBotRunning(state) || !billingAllows(state)) {
      return;
    }
    const button = findInactivityContinueButton(popup);
    if (!button || inactivityContinueClicks >= MAX_INACTIVITY_CONTINUE_CLICKS) {
      await reloadAfterInactivity(popup);
      return;
    }
    lastInactivityContinueAt = now;
    inactivityContinueClicks += 1;
    const cap = new Promise((resolve) => window.setTimeout(resolve, FLUSH_BEFORE_RELOAD_MAX_MS));
    await Promise.race([flushLeadsBeforeReload().catch(() => void 0), cap]);
    button.click();
    await safeStorageSet({
      lastInactivityContinue: {
        clicked_at: (/* @__PURE__ */ new Date()).toISOString(),
        attempt: inactivityContinueClicks,
        url: window.location.href,
        popup_text: normalizeTextValue(popup.innerText || popup.textContent).slice(0, 200)
      }
    });
  }
  async function reloadAfterInactivity(popup) {
    await reloadBuyLeadPage("lastInactivityReload", popup);
  }
  async function reloadBuyLeadPage(storageKey, popup) {
    const state = await readCaptureState();
    if (!state || !isBotRunning(state) || !billingAllows(state) || inactivityReloadStarted) {
      return;
    }
    inactivityReloadStarted = true;
    const cap = new Promise((resolve) => window.setTimeout(resolve, FLUSH_BEFORE_RELOAD_MAX_MS));
    await Promise.race([flushLeadsBeforeReload().catch(() => void 0), cap]);
    await safeStorageSet({
      [storageKey]: {
        reloaded_at: (/* @__PURE__ */ new Date()).toISOString(),
        url: window.location.href,
        popup_text: normalizeTextValue(popup.innerText || popup.textContent).slice(0, 200)
      }
    });
    window.location.reload();
  }
  function startInactivityWatcher() {
    if (inactivityWatcherStarted) {
      return;
    }
    inactivityWatcherStarted = true;
    window.setInterval(checkForInactivityPopup, INACTIVITY_CHECK_INTERVAL_MS);
    checkForInactivityPopup();
  }
  function startServiceWorkerKeepalive() {
    let port = null;
    const connect = () => {
      if (extensionContextInvalidated) {
        return;
      }
      try {
        port = chrome.runtime.connect({ name: KEEPALIVE_PORT_NAME });
        port.onMessage.addListener((message) => {
          if (message?.type === "tick") {
            runOverdueApiPoll();
          }
        });
        port.onDisconnect.addListener(() => {
          port = null;
          void chrome.runtime.lastError;
          window.setTimeout(connect, 1e3);
        });
      } catch (caught) {
        port = null;
        handleChromeApiError(caught);
      }
    };
    connect();
    window.setInterval(() => {
      try {
        port?.postMessage({ type: "ping" });
      } catch {
        port = null;
      }
    }, KEEPALIVE_PING_MS);
  }
  function resetLeadTracking() {
    seenLeadIds.clear();
    localDecisionsByClientEventId.clear();
  }
  function pollNow() {
    if (apiPollerStarted) {
      scheduleApiPoll(0);
    }
  }
  var expiredInterestStarted = false;
  function startExpiredInterest() {
    if (expiredInterestStarted || window.top !== window || !/^\/bltxn(\/|$)/.test(window.location.pathname)) {
      return;
    }
    expiredInterestStarted = true;
    const deps = {
      bridgeRequest,
      storageGet: safeStorageGet,
      storageSet: safeStorageSet,
      sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      now: () => Date.now(),
      sourceUrl: () => window.location.href,
      ownerToken: `interest-${pollOwnerToken}`
    };
    let loop = startExpiredInterestLoop(deps);
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[EXPIRED_INTEREST_ENABLED_KEY]?.newValue === true) {
          loop?.runNow();
        }
      });
    } catch (caught) {
      handleChromeApiError(caught);
    }
    window.addEventListener("pagehide", () => {
      loop?.stop();
      void loop?.release().catch(() => void 0);
      loop = null;
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted && !loop) {
        loop = startExpiredInterestLoop(deps);
      }
    });
  }
  function initializeIndiaMartContentScript() {
    const context = detectPageContext(window.location.href, document.title);
    if (context === "indiamart_allowed") {
      safeSendMessage({
        type: "INDIAMART_PAGE_DETECTED",
        url: window.location.href,
        title: document.title,
        scraping_enabled: true
      });
      startPageDataListener();
      startRealtimeLeadListener();
      startApiPoller();
      startCaptureStateSync();
      startServiceWorkerKeepalive();
      startInactivityWatcher();
      startExpiredInterest();
    }
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "BUSINESS_SELECTION_CHANGED") {
        resetLeadTracking();
        pollNow();
      }
      if (message?.type === "BOT_STATE_CHANGED") {
        if (message.enabled) {
          resetLeadTracking();
          pollNow();
        }
      }
      if (message?.type === "LEAD_SYNC_DECISIONS" && Array.isArray(message.items)) {
        const markers = message.items;
        noteServerDecisions(markers);
        rememberMarkers(markers);
        autoEnrichCapturedLeadMarkers(markers);
      }
    });
  }

  // src/content-script.ts
  if (typeof window !== "undefined" && typeof document !== "undefined" && typeof chrome !== "undefined") {
    initializeIndiaMartContentScript();
  }
})();
