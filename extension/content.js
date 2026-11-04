// Hi-San Bot - IndiaMART BuyLead Auto-Buy Engine
// Fast sub-millisecond lead detection via WebSocketChannel + Dexie-compatible IndexedDB Outbox
(() => {
  if (window.__hisanLoaded) return;
  window.__hisanLoaded = true;

  // ---------- Configuration & Constants ----------
  const REALTIME_CHANNEL_NAME = "WebSocketChannel";
  const REALTIME_RESOURCES = new Set(["realtime_bl", "realtime_bl_new"]);
  const OUTBOX_DB_NAME = "im_leads_outbox";
  const OUTBOX_DB_VERSION = 2;
  const XMPP_CONNECTION_DATA_KEY = "xmppConnectionData";
  const XMPP_MINUTE_LIMIT = 15;
  const SENT_KEY_TTL_MS = 24 * 60 * 60 * 1000;
  const PENDING_TTL = 2 * 60 * 1000;

  const BUY_TEXT = /^\s*contact\s+buyer(\s+now)?\s*$/i;
  const CONFIRM_TEXT = /^\s*(yes|confirm|ok|okay|continue|proceed|contact buyer now|buy now)\s*$/i;
  const ERROR_TEXT =
    /(insufficient[^\n]{0,60}|no (buy ?lead )?credits?[^\n]{0,60}|recharge[^\n]{0,60}|limit (exceeded|reached)[^\n]{0,60}|already (been )?(purchased|sold)[^\n]{0,60}|lead (is |has )?expired[^\n]{0,60}|not available[^\n]{0,60})/i;
  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,12}\d/g;
  const hasContact = (text) => new RegExp(EMAIL.source, "i").test(text) || new RegExp(PHONE.source).test(text);

  const COUNTRIES = self.HISAN_COUNTRIES ?? [];
  const COUNTRY_ALIASES = {
    USA: "United States",
    "U.S.A": "United States",
    UAE: "United Arab Emirates",
    "U.A.E": "United Arab Emirates",
    UK: "United Kingdom",
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const jitter = (ms) => ms * (0.8 + Math.random() * 0.4);
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => null);
  const textOf = (el) => (el?.innerText ?? el?.value ?? "").trim();
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return `h${h.toString(36)}`;
  }

  // =========================================================================
  // 1. Dexie-Compatible IndexedDB Outbox Database (im_leads_outbox)
  // =========================================================================

  class OutboxDB {
    constructor() {
      this.db = null;
      this.ready = this.init();
    }

    init() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains("events")) {
            const store = db.createObjectStore("events", { keyPath: "client_event_id" });
            store.createIndex("state", "state", { unique: false });
            store.createIndex("created_at", "created_at", { unique: false });
          }
          if (!db.objectStoreNames.contains("enrichments")) {
            const store = db.createObjectStore("enrichments", { keyPath: "enrichment_id" });
            store.createIndex("state", "state", { unique: false });
            store.createIndex("client_event_id", "client_event_id", { unique: false });
          }
          if (!db.objectStoreNames.contains("sentKeys")) {
            const store = db.createObjectStore("sentKeys", { keyPath: "key" });
            store.createIndex("at", "at", { unique: false });
          }
          if (!db.objectStoreNames.contains("activity")) {
            const store = db.createObjectStore("activity", { keyPath: "client_event_id" });
            store.createIndex("at", "at", { unique: false });
          }
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve(this.db);
        };
        req.onerror = () => reject(req.error);
      });
    }

    async enqueueLead(event) {
      await this.ready;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(["events", "sentKeys", "activity"], "readwrite");
          const now = new Date().toISOString();
          const record = {
            ...event,
            state: event.state || "PENDING",
            created_at: event.created_at || now,
            updated_at: now,
          };
          tx.objectStore("events").put(record);
          if (event.ofr_id) {
            tx.objectStore("sentKeys").put({ key: `ofr:${event.ofr_id}`, at: Date.now() });
          }
          tx.objectStore("activity").put({
            client_event_id: event.client_event_id,
            title: event.title,
            country: event.country,
            decision: event.decision,
            skip_reason: event.skip_reason,
            at: now,
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    async getPendingEvents(limit = 25) {
      await this.ready;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction("events", "readonly");
          const index = tx.objectStore("events").index("state");
          const req = index.getAll("PENDING", limit);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }

    async markEventsState(ids, state) {
      await this.ready;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction("events", "readwrite");
          const store = tx.objectStore("events");
          let pending = ids.length;
          if (!pending) return resolve(true);
          for (const id of ids) {
            const getReq = store.get(id);
            getReq.onsuccess = () => {
              const record = getReq.result;
              if (record) {
                record.state = state;
                record.updated_at = new Date().toISOString();
                store.put(record);
              }
              if (--pending === 0) resolve(true);
            };
            getReq.onerror = () => {
              if (--pending === 0) resolve(true);
            };
          }
        } catch {
          resolve(false);
        }
      });
    }

    async isDuplicate(ofrId) {
      if (!ofrId) return false;
      await this.ready;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction("sentKeys", "readonly");
          const req = tx.objectStore("sentKeys").get(`ofr:${ofrId}`);
          req.onsuccess = () => {
            const item = req.result;
            resolve(Boolean(item && Date.now() - item.at < SENT_KEY_TTL_MS));
          };
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
  }

  const outbox = new OutboxDB();

  // Background Outbox Drainer: Syncs pending leads whenever online
  async function drainOutbox() {
    try {
      const pending = await outbox.getPendingEvents(25);
      if (!pending.length) return;

      const ids = pending.map((e) => e.client_event_id);
      await outbox.markEventsState(ids, "SENDING");

      const response = await send({
        type: "api",
        path: "/extension/ingest",
        options: {
          method: "POST",
          body: { leads: pending },
        },
      });

      if (response && response.ok) {
        await outbox.markEventsState(ids, "ACKED");
      } else {
        // Network drop or server unreachable: Return to PENDING for offline retry
        await outbox.markEventsState(ids, "PENDING");
      }
    } catch {
      // Offline fallback
    }
  }

  setInterval(drainOutbox, 15000);

  // =========================================================================
  // 2. Real-Time WebSocket / XMPP Push Lead Capture (BroadcastChannel)
  // =========================================================================

  function decodeXmlText(value) {
    return value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&amp;/g, "&");
  }

  function parseRealtimeBody(body) {
    let json = body.trim().replace(/;$/, "").trim();
    try {
      let parsed = JSON.parse(json);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      return parsed;
    } catch {
      if (json.startsWith('"') && json.endsWith('"')) json = json.slice(1, -1);
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
    if (typeof raw !== "string" || !raw.includes("realtime_bl")) return [];
    const message = /<message\b([^>]*)>([\s\S]*?)<\/message>/i.exec(raw);
    const from = message ? /\bfrom\s*=\s*(["'])(.*?)\1/i.exec(message[1])?.[2] ?? "" : "";
    const resource = from.split("/")[1] ?? "";
    if (!message || !REALTIME_RESOURCES.has(resource)) return [];

    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(message[2])?.[1];
    if (!body) return [];

    try {
      const parsed = parseRealtimeBody(decodeXmlText(body));
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.DisplayList)
        ? parsed.DisplayList
        : parsed && typeof parsed === "object"
        ? [parsed]
        : [];
      return rows.map(normalizeRealtimeRow).filter(Boolean);
    } catch {
      return [];
    }
  }

  function normalizeRealtimeRow(row) {
    const ofrId = String(row.DISP_OFFER_ID || row.ofrid || row.GLUSR_USR_PH_NUMBER || "").trim();
    const title = String(row.ofrtitle || row.SUBJECT || row.ITEM_NAME || row.title || "").trim();
    if (!title) return null;

    return {
      ofr_id: ofrId,
      external_id: ofrId ? `im_${ofrId}` : hash(title.toLowerCase()),
      title: title.slice(0, 300),
      quantity: row.QUANTITY || row.QTY || null,
      unit: row.QTY_UNIT || row.UNIT || null,
      country: row.GLUSR_COUNTRY || row.COUNTRY || "India",
      city: row.GLUSR_CITY || row.CITY || null,
      state: row.GLUSR_STATE || row.STATE || null,
      email_verified: Boolean(row.is_email || row.IS_EMAIL_VERIFIED),
      phone_verified: Boolean(row.is_mobnum || row.IS_MOBILE_VERIFIED),
      has_whatsapp: Boolean(row.IS_WHATSAPP || /whatsapp/i.test(row.CONTACT_PREF || "")),
      source_url: location.href,
      mcat_id: row.MCAT_ID || row.matched_mcat_id || null,
      grid_parameters: row.GRID_PARAMETERS || null,
      raw: row,
    };
  }

  // Anti-Throttling: Resets IndiaMART seller XMPP throttle counter in localStorage
  function resetRealtimeThrottle() {
    try {
      const raw = localStorage.getItem(XMPP_CONNECTION_DATA_KEY);
      if (!raw) return;
      const connections = JSON.parse(raw);
      let changed = false;
      const now = Date.now();
      for (const conn of Object.values(connections || {})) {
        if (conn && ((conn.minuteCount || 0) >= XMPP_MINUTE_LIMIT || now - (conn.minuteTimestamp || 0) > 60000)) {
          conn.minuteCount = 0;
          conn.minuteTimestamp = now;
          changed = true;
        }
      }
      if (changed) localStorage.setItem(XMPP_CONNECTION_DATA_KEY, JSON.stringify(connections));
    } catch {}
  }
  setInterval(resetRealtimeThrottle, 20000);

  // Fast Buy Execution via IndiaMART Seller API
  function readGlid() {
    try {
      if (window.glid) return String(window.glid).trim();
      const stored = localStorage.getItem("glid");
      if (stored) return stored.trim();
      const m = document.cookie.match(/(?:^|;\s*)glid=([^;]+)/);
      if (m) return decodeURIComponent(m[1]).trim();
      const visitor = document.cookie.match(/(?:^|;\s*)ImeshVisitor=([^;]+)/);
      if (visitor) {
        const vm = decodeURIComponent(visitor[1]).match(/glid=([^|&]+)/);
        if (vm) return vm[1].trim();
      }
    } catch {}
    return "";
  }

  async function fastBuyLead(lead) {
    const glid = readGlid();
    if (!glid || !lead.ofr_id) return { success: false, error: "missing_glid_or_ofrid" };

    const payload = {
      glusrId: glid,
      ofrid: lead.ofr_id,
      purchasemod: "WEB",
      count: 1,
      tsearch_text: "latestbl_relevant_NTB_f_loc_AI",
      serial: 1,
      responseTextArea: 0,
      bl_page_location: "page=relevant#city=#mcatid=#locpref=2",
      matched_mcat_id: lead.mcat_id ?? "",
      order_value_flag: "",
      is_bulk_order: "",
      ofrtitle: lead.title,
      mapped_mcat_id: lead.mcat_id ?? "",
      GRID_PARAMETERS: lead.grid_parameters ?? "",
      ptime: new Date().toISOString(),
      pref: "https://seller.indiamart.com/bltxn/?pref=relevant&N_T_B=1",
      grid_lead_pos: 1,
      NIClick: 1,
    };

    try {
      const response = await fetch("https://seller.indiamart.com/blreact/contactBuyNow", {
        method: "POST",
        headers: { accept: "*/*", "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (json && (String(json.Flag) === "1" || String(json.Status).toLowerCase() === "success")) {
        return { success: true, json };
      }
      return { success: false, error: json?.MESSAGE || json?.Status || `HTTP ${response.status}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Handle incoming real-time leads from BroadcastChannel
  async function handleRealtimeLead(lead) {
    if (!lead || !lead.title) return;
    if (await outbox.isDuplicate(lead.ofr_id)) return;

    const settings = await send({ type: "settings" });
    if (!settings || (!settings.enabled && !settings.apiKey)) return;

    // Sub-millisecond evaluation
    const clientEventId = `im-ofr:${lead.ofr_id || hash(lead.title)}`;
    const event = {
      client_event_id: clientEventId,
      ofr_id: lead.ofr_id,
      external_id: lead.external_id,
      title: lead.title,
      quantity: lead.quantity,
      country: lead.country,
      source: "push_websocket",
      decision: "captured",
      skip_reason: null,
      state: "PENDING",
    };

    // Commit immediately to Dexie IndexedDB Outbox
    await outbox.enqueueLead(event);

    // If dry run is off, trigger fast buy
    if (!settings.dryRun) {
      const buyResult = await fastBuyLead(lead);
      if (buyResult.success) {
        event.state = "BOUGHT";
        await outbox.enqueueLead(event);
      }
    }

    // Trigger immediate outbox drain
    void drainOutbox();
  }

  // Initialize BroadcastChannel listener
  function startRealtimeListener() {
    try {
      resetRealtimeThrottle();
      const channel = new BroadcastChannel(REALTIME_CHANNEL_NAME);
      channel.addEventListener("message", (event) => {
        const leads = parseRealtimeLeadMessage(event.data);
        for (const lead of leads) {
          void handleRealtimeLead(lead);
        }
      });
    } catch {}
  }

  startRealtimeListener();

  // =========================================================================
  // 3. Fallback DOM Lead Parsing & Standard Actions
  // =========================================================================

  function findBuyButtons() {
    const candidates = [...document.querySelectorAll("button, a, input[type=button], input[type=submit], [role=button], span, div")].filter(
      (el) => el.childElementCount <= 3 && BUY_TEXT.test(textOf(el)) && isVisible(el)
    );
    return candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)));
  }

  function findCard(button, buttons, cardSelector) {
    if (cardSelector) return button.closest(cardSelector);
    let el = button;
    while (el.parentElement && el.parentElement !== document.body) {
      const parent = el.parentElement;
      if (buttons.some((b) => b !== button && parent.contains(b))) return el;
      if (textOf(parent).length > 4000) return el;
      el = parent;
    }
    return el;
  }

  function lines(card) {
    return textOf(card)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function attributeText(card) {
    return [...card.querySelectorAll("[title], [alt], [aria-label], [data-tooltip], [data-original-title]")]
      .map((el) => [el.getAttribute("title"), el.getAttribute("alt"), el.getAttribute("aria-label"), el.dataset.tooltip, el.dataset.originalTitle].filter(Boolean).join(" "))
      .join(" | ");
  }

  function findCountryIn(text) {
    for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
      if (new RegExp(`\\b${alias.replace(/\./g, "\\.")}\\b`).test(text)) return name;
    }
    const match = COUNTRIES.find((c) => c.name !== "India" && new RegExp(`\\b${c.name}\\b`, "i").test(text));
    return match?.name ?? null;
  }

  function ageMinutes(allLines) {
    for (const line of allLines) {
      if (/just now/i.test(line)) return 0;
      const m = line.match(/(\d+)\s*(sec|min|hr|hour|day|week|month)s?\b[^\n]*ago/i);
      if (!m) continue;
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      return unit === "sec" ? 0 : unit === "min" ? n : unit === "hr" || unit === "hour" ? n * 60 : unit === "day" ? n * 1440 : unit === "week" ? n * 10080 : n * 43200;
    }
    return null;
  }

  function externalId(card, fallbackParts) {
    for (const el of [card, ...card.querySelectorAll("*")]) {
      for (const attr of el.attributes) {
        if (!/^(data-|id$|name$|value$|href$)/.test(attr.name)) continue;
        const m = attr.value.match(/(?:^|\D)(\d{7,12})(?:\D|$)/);
        if (m) return `im_${m[1]}`;
      }
    }
    return hash(fallbackParts.join("|").toLowerCase());
  }

  function parseCard(card) {
    const allLines = lines(card);
    const attrs = attributeText(card);
    const joined = `${allLines.join("\n")}\n${attrs}`;

    const heading = card.querySelector("h1, h2, h3, h4, [class*='title' i], [class*='heading' i]");
    const ignore = (l) => BUY_TEXT.test(l) || /ago$|quantity|member since|^\d+$/i.test(l);
    let title = heading && !ignore(textOf(heading)) ? textOf(heading).split("\n")[0] : null;
    title ??= allLines.find((l) => l.length >= 3 && l.length <= 150 && !ignore(l)) ?? "";

    let quantity = null;
    const qIndex = allLines.findIndex((l) => /^(quantity|qty)\b/i.test(l));
    if (qIndex >= 0) {
      const inline = allLines[qIndex].replace(/^(quantity|qty)\s*[:\-]?\s*/i, "");
      quantity = inline || allLines[qIndex + 1] || null;
    }

    const country = findCountryIn(joined);
    const locationLine = allLines.find((l) => (country && l.includes(country)) || (/^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(l) && l.length < 60));
    const city = locationLine ? locationLine.split(",")[0].trim() : null;

    return {
      external_id: externalId(card, [title, quantity ?? "", locationLine ?? ""]),
      title: title.slice(0, 300),
      quantity,
      country: country ?? "India",
      city,
      email_verified: /e-?mail[^|\n]{0,20}verified|verified[^|\n]{0,12}e-?mail/i.test(joined),
      phone_verified: /(mobile|phone)[^|\n]{0,25}verified|verified[^|\n]{0,12}(mobile|phone)/i.test(joined),
      has_whatsapp: /whats\s?app/i.test(joined),
      age_minutes: ageMinutes(allLines),
      posted_text: joined.match(/\d+\s*(?:sec|min|hr|hour|day|week|month)s?\.?\s*ago|just now/i)?.[0] ?? null,
      source_url: location.href,
    };
  }

  function collectLeads(settings) {
    const buttons = findBuyButtons();
    const seen = new Set();
    const items = [];
    for (const button of buttons) {
      const card = findCard(button, buttons, settings.cardSelector);
      if (!card) continue;
      const lead = parseCard(card);
      if (!lead.title || seen.has(lead.external_id)) continue;
      seen.add(lead.external_id);
      items.push({ lead, card, button });
    }
    return items;
  }

  function extractContacts(text) {
    const emails = (text.match(EMAIL) ?? []).filter((e) => !/indiamart|example\./i.test(e));
    const phones = (text.match(PHONE) ?? []).map((p) => p.trim()).filter((p) => p.replace(/\D/g, "").length >= 10);
    const field = (re) => text.match(re)?.[1]?.trim().slice(0, 120) ?? null;
    return {
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
      buyer_name: field(/(?:buyer\s*)?name\s*[:\-]\s*([^\n|]+)/i),
      company: field(/company(?:\s*name)?\s*[:\-]\s*([^\n|]+)/i),
      has_whatsapp: /whats\s?app/i.test(text),
    };
  }

  async function report(externalIdValue, result) {
    // Record into outbox
    await outbox.enqueueLead({
      client_event_id: `res:${externalIdValue}`,
      external_id: externalIdValue,
      decision: result.success ? "bought" : "failed",
      skip_reason: result.error || null,
      state: "PENDING",
    });
    return send({ type: "api", path: "/extension/result", options: { method: "POST", body: { external_id: externalIdValue, ...result } } });
  }

  async function buy({ lead, card, button }) {
    await chrome.storage.local.set({ pendingBuy: { external_id: lead.external_id, title: lead.title, at: Date.now(), returnUrl: location.href } });

    const added = [];
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) added.push(node.nodeType === 1 ? node : node.parentElement);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    button.scrollIntoView({ block: "center" });
    await sleep(jitter(600));
    button.click();

    let confirmed = false;
    let outcome = null;
    for (let i = 0; i < 24 && !outcome; i++) {
      await sleep(500);
      const fresh = added.filter((n) => n?.isConnected);
      const text = [...fresh.map(textOf), textOf(card)].join("\n");

      const error = text.match(ERROR_TEXT);
      if (error) outcome = { success: false, error: error[0].trim() };

      const contacts = extractContacts(text);
      if (!outcome && (contacts.email || contacts.phone)) outcome = { success: true, ...contacts };

      if (!outcome && !confirmed) {
        const confirm = fresh
          .flatMap((n) => [n, ...n.querySelectorAll("button, a, [role=button], input[type=button], input[type=submit]")])
          .find((el) => el.matches?.("button, a, [role=button], input[type=button], input[type=submit]") && CONFIRM_TEXT.test(textOf(el)) && isVisible(el));
        if (confirm) {
          confirmed = true;
          await sleep(jitter(500));
          confirm.click();
        }
      }
    }
    observer.disconnect();

    outcome ??= !button.isConnected || !BUY_TEXT.test(textOf(button))
      ? { success: true }
      : { success: false, error: "Purchase not confirmed on the page. Check IndiaMART Lead Manager." };

    await chrome.storage.local.remove("pendingBuy");
    await report(lead.external_id, outcome);
    return outcome;
  }

  async function finishRedirectedPurchase() {
    const { pendingBuy } = await chrome.storage.local.get("pendingBuy");
    if (!pendingBuy || Date.now() - pendingBuy.at > PENDING_TTL) return false;
    await chrome.storage.local.remove("pendingBuy");
    await sleep(4000);

    const titleWords = pendingBuy.title.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    const containers = [...document.querySelectorAll("div, section, article, li, td")]
      .filter((el) => textOf(el).toLowerCase().includes(titleWords) && hasContact(textOf(el)))
      .sort((a, b) => textOf(a).length - textOf(b).length);
    const contacts = extractContacts(textOf(containers[0] ?? document.body));

    await report(pendingBuy.external_id, { success: true, ...contacts });
    await sleep(2000);
    location.href = pendingBuy.returnUrl;
    return true;
  }

  async function scanOnce({ manual = false } = {}) {
    try {
      const settings = await send({ type: "settings" });
      if (!settings?.apiKey && !settings?.enabled) return null;
      if (!settings.enabled && !manual) return null;

      const items = collectLeads(settings);
      if (!items.length) return null;

      // Enqueue to Outbox
      for (const item of items) {
        await outbox.enqueueLead({
          client_event_id: item.lead.external_id,
          external_id: item.lead.external_id,
          title: item.lead.title,
          country: item.lead.country,
          source: "dom_scan",
          state: "PENDING",
        });
      }

      const response = await send({
        type: "api",
        path: "/extension/evaluate",
        options: { method: "POST", body: { dry_run: settings.dryRun, leads: items.map((i) => i.lead) } },
      });

      if (!response?.ok) return null;

      const decisions = new Map(response.data.decisions.map((d) => [d.external_id, d]));
      for (const item of items) {
        const decision = decisions.get(item.lead.external_id);
        if (decision?.action !== "buy" || settings.dryRun) continue;
        await buy(item);
        await sleep(jitter(2500));
      }
    } catch {}
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "scanNow") {
      scanOnce({ manual: true }).then((result) => sendResponse(result ?? { message: "Scan complete." }));
      return true;
    }
    return false;
  });

  async function main() {
    if (await finishRedirectedPurchase()) return;
    if (!location.pathname.startsWith("/bltxn")) return;

    await sleep(jitter(2000));
    await scanOnce();
  }

  main();
})();
