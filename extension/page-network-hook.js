"use strict";
(() => {
  // src/fast-buy.ts
  var BL_DISPLAY_DATA_URL = "https://seller.indiamart.com/blreact/getBLDisplayData";
  var BL_CONTACT_BUY_URL = "https://seller.indiamart.com/blreact/contactBuyNow";
  var BRIDGE_REQUEST_EVENT = "hisan-bot-bridge-request";
  var BRIDGE_RESPONSE_EVENT = "hisan-bot-bridge-response";
  var BRIDGE_REQUEST_TYPES = /* @__PURE__ */ new Set(["IM_BL_FETCH", "IM_BL_BUY", "IM_BL_EXPIRED_FETCH", "IM_BL_MARK_SHORTLIST"]);
  function decodeBridgeRequest(detail) {
    if (typeof detail !== "string") {
      return null;
    }
    try {
      const parsed = JSON.parse(detail);
      if (!parsed || typeof parsed.type !== "string" || !BRIDGE_REQUEST_TYPES.has(parsed.type) || typeof parsed.requestId !== "string" || !parsed.requestId) {
        return null;
      }
      const payload = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : {};
      return { type: parsed.type, requestId: parsed.requestId, payload };
    } catch {
      return null;
    }
  }
  function encodeBridgeResponse(requestId, result, body) {
    return `${JSON.stringify({ requestId, result })}
${body}`;
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
  var POLL_PAGE_SIZE = 50;
  var SAFETY_BRAKE_STEPS_MS = [2 * 6e4, 5 * 6e4, 15 * 6e4];
  var SAFETY_BRAKE_RESET_MS = 30 * 6e4;
  var MAX_SAFETY_BRAKE_MS = 60 * 6e4;
  var DEFAULT_BUY_RATE_LIMIT_COOLDOWN_SECONDS = SAFETY_BRAKE_STEPS_MS[0] / 1e3;
  function buildDisplayRequest(glid, template = null) {
    return {
      LocPref: "1",
      stateid: "",
      city: "",
      iso: "",
      pref_city_lead: 1,
      inbox: "",
      offer: "",
      offer_type: "B",
      UsageTyp: "",
      quantity: "",
      is_email: "",
      is_gst: "",
      is_catalog: "",
      is_mobnum: "",
      is_busname: "",
      mcatid: "",
      sov: "",
      eov: null,
      enqType: "",
      expired: "",
      // The page's own request, when it made one, decides the lead pool ("same as the page").
      ...template ?? {},
      glusrid: glid,
      start: 1,
      end: POLL_PAGE_SIZE
    };
  }

  // src/expired-interest.ts
  var MARK_SHORTLIST_URL = "https://seller.indiamart.com/blreact/markShortlist";
  var EXPIRED_DISPLAY_OVERRIDES = {
    LocPref: "3",
    pref_city_lead: 0,
    inbox: "P",
    expired: 1,
    start: 1,
    end: 20
  };
  function buildExpiredDisplayRequest(glid) {
    return { ...buildDisplayRequest(glid, null), ...EXPIRED_DISPLAY_OVERRIDES, glusrid: glid };
  }
  var EXPIRED_LOCK_STALE_MS = 3 * 6e4;

  // src/indiamart-api-adapter.ts
  var BL_DISPLAY_DATA_SOURCE = "hisan-bot-page-hook";
  var BL_DISPLAY_DATA_MESSAGE = "IM_BL_DISPLAY_DATA";
  function isBlDisplayDataUrl(url) {
    return /\/blreact\/getBLDisplayData\b/i.test(url);
  }
  var IST_OFFSET_MS = 5.5 * 60 * 60 * 1e3;

  // src/request-budget.ts
  var LIST_REQUESTS_PER_MINUTE = 8;
  var BUY_REQUESTS_PER_MINUTE = 12;
  var REQUEST_BUDGET_WINDOW_MS = 6e4;
  var REQUEST_BUDGET_MAX_WAIT_MS = 12e3;
  function createRequestBudget(limit, windowMs = REQUEST_BUDGET_WINDOW_MS) {
    const sentAt = [];
    const prune = (now) => {
      while (sentAt.length && now - sentAt[0] >= windowMs) {
        sentAt.shift();
      }
    };
    return {
      tryTake(now = Date.now()) {
        prune(now);
        if (sentAt.length < limit) {
          sentAt.push(now);
          return { ok: true };
        }
        return { ok: false, waitMs: sentAt[0] + windowMs - now };
      },
      get used() {
        prune(Date.now());
        return sentAt.length;
      }
    };
  }
  async function takeBudgetSlot(budget, maxWaitMs = REQUEST_BUDGET_MAX_WAIT_MS, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), clock = () => Date.now()) {
    const deadline = clock() + maxWaitMs;
    for (; ; ) {
      const slot = budget.tryTake(clock());
      if (slot.ok) {
        return true;
      }
      if (clock() + slot.waitMs > deadline) {
        return false;
      }
      await sleep(slot.waitMs);
    }
  }
  function createRequestFolder() {
    const inFlight = /* @__PURE__ */ new Map();
    return (key, task) => {
      const running = inFlight.get(key);
      if (running) {
        return running;
      }
      const started = task().finally(() => inFlight.delete(key));
      inFlight.set(key, started);
      return started;
    };
  }

  // src/page-network-hook.ts
  var BRIDGE_TIMEOUT_MS = 15e3;
  var originalFetch = window.fetch;
  var displayRequestTemplate = null;
  var handledRequestIds = /* @__PURE__ */ new Set();
  var listBudget = createRequestBudget(LIST_REQUESTS_PER_MINUTE);
  var buyBudget = createRequestBudget(BUY_REQUESTS_PER_MINUTE);
  var EXPIRED_REQUESTS_PER_MINUTE = 30;
  var expiredBudget = createRequestBudget(EXPIRED_REQUESTS_PER_MINUTE);
  var foldRequest = createRequestFolder();
  function retryAfterSeconds(header) {
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  function post(url, payload, listStatus) {
    try {
      window.postMessage(
        { source: BL_DISPLAY_DATA_SOURCE, type: BL_DISPLAY_DATA_MESSAGE, url, payload, ...listStatus, at: Date.now() },
        window.location.origin
      );
    } catch {
    }
  }
  function postText(url, text, listStatus) {
    let payload = null;
    try {
      payload = typeof text === "string" && text ? JSON.parse(text) : null;
    } catch {
    }
    post(url, payload, listStatus);
  }
  function rememberRequestBody(body) {
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : null;
      const expiredList = Boolean(parsed && typeof parsed === "object" && parsed.expired);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !expiredList) {
        const { glusrid: _glid, start: _start, end: _end, ...template } = parsed;
        displayRequestTemplate = template;
      }
    } catch {
    }
  }
  function hookFetch() {
    if (typeof originalFetch !== "function") {
      return;
    }
    window.fetch = function(...args) {
      const result = originalFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "";
        if (isBlDisplayDataUrl(url)) {
          rememberRequestBody(args[1]?.body);
          result.then(
            (response) => response.clone().text().catch(() => "").then(
              (text) => postText(url, text, { status: response.status, retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")) })
            )
          ).catch(() => void 0);
        }
      } catch {
      }
      return result;
    };
  }
  function hookXhr() {
    const proto = window.XMLHttpRequest?.prototype;
    if (!proto) {
      return;
    }
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const urls = /* @__PURE__ */ new WeakMap();
    proto.open = function(...args) {
      try {
        urls.set(this, String(args[1] ?? ""));
      } catch {
      }
      return originalOpen.apply(this, args);
    };
    proto.send = function(...args) {
      try {
        const url = urls.get(this) ?? "";
        if (isBlDisplayDataUrl(url)) {
          rememberRequestBody(args[0]);
          this.addEventListener("load", () => {
            try {
              const listStatus = { status: this.status, retryAfterSeconds: retryAfterSeconds(this.getResponseHeader("retry-after")) };
              if (this.responseType === "json") {
                post(url, this.response, listStatus);
              } else if (this.responseType === "" || this.responseType === "text") {
                postText(url, this.responseText, listStatus);
              } else {
                post(url, null, listStatus);
              }
            } catch {
            }
          });
        }
      } catch {
      }
      return originalSend.apply(this, args);
    };
  }
  function numericId(value) {
    const text = String(value ?? "").trim();
    return /^\d{4,}$/.test(text) ? text : "";
  }
  function readGlid() {
    try {
      const fromWindow = numericId(window.glid);
      if (fromWindow) {
        return fromWindow;
      }
    } catch {
    }
    try {
      const fromStorage = numericId(window.localStorage.getItem("glid"));
      if (fromStorage) {
        return fromStorage;
      }
    } catch {
    }
    const cookies = document.cookie || "";
    const decode = (value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const glidCookie = cookies.match(/(?:^|;\s*)glid=([^;]+)/);
    if (glidCookie && numericId(decode(glidCookie[1]))) {
      return numericId(decode(glidCookie[1]));
    }
    const visitor = cookies.match(/(?:^|;\s*)ImeshVisitor=([^;]+)/);
    const fromVisitor = visitor ? decode(visitor[1]).match(/glid=([^|&]+)/) : null;
    return fromVisitor ? numericId(fromVisitor[1]) : "";
  }
  async function postJson(url, body) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
    try {
      const response = await originalFetch.call(window, url, {
        method: "POST",
        headers: { accept: "*/*", "content-type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
        signal: controller.signal
      });
      let text = "";
      try {
        text = await response.text();
      } catch {
      }
      return {
        result: {
          ok: response.ok,
          status: response.status,
          retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")),
          durationMs: Date.now() - startedAt
        },
        body: text
      };
    } catch (caught) {
      return {
        result: {
          ok: false,
          status: 0,
          retryAfterSeconds: null,
          durationMs: Date.now() - startedAt,
          error: caught instanceof Error ? caught.message : String(caught)
        },
        body: ""
      };
    } finally {
      window.clearTimeout(timer);
    }
  }
  function refused(error, glid) {
    return { result: { ok: false, status: 0, retryAfterSeconds: null, durationMs: 0, error, glid }, body: "" };
  }
  async function runBridgeRequest(type, payload) {
    const glid = readGlid();
    if (!glid) {
      return refused("not_logged_in", glid);
    }
    const expired = type === "IM_BL_EXPIRED_FETCH" || type === "IM_BL_MARK_SHORTLIST";
    const budget = expired ? expiredBudget : type === "IM_BL_FETCH" ? listBudget : buyBudget;
    if (!budget.tryTake().ok && !await takeBudgetSlot(budget)) {
      return refused("request_budget_exceeded", glid);
    }
    if (type === "IM_BL_FETCH") {
      const iso = typeof payload.iso === "string" && payload.iso ? payload.iso : "";
      const body = iso ? buildDisplayRequest(glid, { iso }) : buildDisplayRequest(glid, displayRequestTemplate);
      const raw2 = await postJson(BL_DISPLAY_DATA_URL, body);
      return { ...raw2, result: { ...raw2.result, glid } };
    }
    if (type === "IM_BL_EXPIRED_FETCH") {
      const raw2 = await postJson(BL_DISPLAY_DATA_URL, buildExpiredDisplayRequest(glid));
      return { ...raw2, result: { ...raw2.result, glid } };
    }
    if (type === "IM_BL_MARK_SHORTLIST") {
      const raw2 = await postJson(MARK_SHORTLIST_URL, { ...payload, glusrid: glid });
      return { ...raw2, result: { ...raw2.result, glid } };
    }
    const raw = await postJson(BL_CONTACT_BUY_URL, { ...payload, glusrId: glid });
    return { ...raw, result: { ...raw.result, glid } };
  }
  function announcePurchase({ result, body }) {
    const json = parseBody(body);
    if (!result.ok || !json || String(json.Flag) !== "1" || String(json.Status ?? "").toLowerCase() !== "success") {
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("buyleadPurchased", { detail: json }));
    } catch {
    }
  }
  function bridgeRequestKey(type, payload) {
    if (type === "IM_BL_EXPIRED_FETCH") {
      return "expired-list";
    }
    if (type === "IM_BL_MARK_SHORTLIST") {
      return `shortlist:${String(payload.ofrid ?? "")}`;
    }
    return type === "IM_BL_FETCH" ? "list" : `buy:${String(payload.ofrid ?? "")}`;
  }
  function startRequestBridge() {
    window.addEventListener(BRIDGE_REQUEST_EVENT, (event) => {
      const request = decodeBridgeRequest(event.detail);
      if (!request || handledRequestIds.has(request.requestId)) {
        return;
      }
      const { type, requestId, payload } = request;
      handledRequestIds.add(requestId);
      if (handledRequestIds.size > 200) {
        handledRequestIds.delete(handledRequestIds.values().next().value);
      }
      void foldRequest(bridgeRequestKey(type, payload), () => runBridgeRequest(type, payload)).then((raw) => {
        try {
          window.dispatchEvent(new CustomEvent(BRIDGE_RESPONSE_EVENT, { detail: encodeBridgeResponse(requestId, raw.result, raw.body) }));
        } catch {
        }
        if (type === "IM_BL_BUY") {
          announcePurchase(raw);
        }
      });
    });
  }
  hookFetch();
  hookXhr();
  startRequestBridge();
})();
