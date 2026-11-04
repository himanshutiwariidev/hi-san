// Runs on seller.indiamart.com.
// - On the BuyLeads page (/bltxn): reads lead cards, asks the Hi-San Bot server which to buy,
//   clicks "Contact Buyer Now" on those, and reports the buyer contacts back.
// - On any other IndiaMART page: if a purchase just redirected here, reads the contacts and reports them.
(() => {
  if (window.__hisanLoaded) return;
  window.__hisanLoaded = true;

  const BUY_TEXT = /^\s*contact\s+buyer(\s+now)?\s*$/i;
  const CONFIRM_TEXT = /^\s*(yes|confirm|ok|okay|continue|proceed|contact buyer now|buy now)\s*$/i;
  const ERROR_TEXT =
    /(insufficient[^\n]{0,60}|no (buy ?lead )?credits?[^\n]{0,60}|recharge[^\n]{0,60}|limit (exceeded|reached)[^\n]{0,60}|already (been )?(purchased|sold)[^\n]{0,60}|lead (is |has )?expired[^\n]{0,60}|not available[^\n]{0,60})/i;
  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,12}\d/g;
  const hasContact = (text) => new RegExp(EMAIL.source, "i").test(text) || new RegExp(PHONE.source).test(text);
  const PENDING_TTL = 2 * 60 * 1000;

  const COUNTRIES = self.HISAN_COUNTRIES ?? [];
  const COUNTRY_ALIASES = { USA: "United States", "U.S.A": "United States", UAE: "United Arab Emirates", "U.A.E": "United Arab Emirates", UK: "United Kingdom" };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const jitter = (ms) => ms * (0.8 + Math.random() * 0.4);
  const send = (message) => chrome.runtime.sendMessage(message);
  const textOf = (el) => (el?.innerText ?? el?.value ?? "").trim();
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return `h${h.toString(36)}`;
  }

  // ---------- Reading lead cards ----------

  function findBuyButtons() {
    const candidates = [...document.querySelectorAll("button, a, input[type=button], input[type=submit], [role=button], span, div")].filter(
      (el) => el.childElementCount <= 3 && BUY_TEXT.test(textOf(el)) && isVisible(el)
    );
    // Keep the outermost match so a <span> inside a <button> is not counted twice.
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

  // ---------- Reading contacts after a purchase ----------

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

    // No contacts or error seen: if the buy button is gone or changed, the purchase most likely went through.
    outcome ??= !button.isConnected || !BUY_TEXT.test(textOf(button))
      ? { success: true }
      : { success: false, error: "Purchase not confirmed on the page. Check IndiaMART Lead Manager." };

    await chrome.storage.local.remove("pendingBuy");
    await report(lead.external_id, outcome);
    return outcome;
  }

  // Purchase redirected to another IndiaMART page (e.g. Lead Manager): read the contacts there.
  async function finishRedirectedPurchase() {
    const { pendingBuy } = await chrome.storage.local.get("pendingBuy");
    if (!pendingBuy || Date.now() - pendingBuy.at > PENDING_TTL) return false;
    await chrome.storage.local.remove("pendingBuy");
    await sleep(4000);

    // Prefer the smallest element that mentions the lead title and contains contact details.
    const titleWords = pendingBuy.title.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    const containers = [...document.querySelectorAll("div, section, article, li, td")]
      .filter((el) => textOf(el).toLowerCase().includes(titleWords) && hasContact(textOf(el)))
      .sort((a, b) => textOf(a).length - textOf(b).length);
    const contacts = extractContacts(textOf(containers[0] ?? document.body));

    await report(pendingBuy.external_id, { success: true, ...contacts });
    await send({ type: "log", entry: { kind: "redirect", message: `Bought "${pendingBuy.title}" (contacts read from ${location.pathname})` } });
    await sleep(2000);
    location.href = pendingBuy.returnUrl;
    return true;
  }

  // ---------- Scan loop ----------

  async function waitForCards(timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (findBuyButtons().length) return true;
      await sleep(1000);
    }
    return false;
  }

  let scanning = false;

  async function scanOnce({ manual = false } = {}) {
    if (scanning) return { message: "A scan is already running." };
    scanning = true;
    try {
      const settings = await send({ type: "settings" });
      if (!settings.apiKey) return log({ kind: "error", message: "No API key. Open the extension options." });
      if (!settings.enabled && !manual) return null;

      await waitForCards(15000);
      const items = collectLeads(settings);
      if (!items.length) return log({ kind: "warn", message: "No lead cards with a “Contact Buyer Now” button found on this page." });

      const response = await send({
        type: "api",
        path: "/extension/evaluate",
        options: { method: "POST", body: { dry_run: settings.dryRun, leads: items.map((i) => i.lead) } },
      });
      if (!response.ok) return log({ kind: "error", message: response.data?.error?.message ?? `Server error ${response.status}` });

      const decisions = new Map(response.data.decisions.map((d) => [d.external_id, d]));
      let bought = 0;
      let failed = 0;
      for (const item of items) {
        const decision = decisions.get(item.lead.external_id);
        if (decision?.action !== "buy" || settings.dryRun) continue;
        const outcome = await buy(item);
        if (outcome.success) bought += 1;
        else failed += 1;
        await sleep(jitter(2500));
      }

      return log({
        kind: "scan",
        dryRun: settings.dryRun,
        message: settings.dryRun
          ? `Dry run: ${items.length} leads read, ${[...decisions.values()].filter((d) => d.action === "buy").length} would be bought.`
          : `${items.length} leads read, ${bought} bought${failed ? `, ${failed} failed` : ""}.`,
        leads: items.map(({ lead }) => {
          const d = decisions.get(lead.external_id);
          return { title: lead.title, quantity: lead.quantity, country: lead.country, action: d?.action, reason: d?.reason ?? (d?.action === "buy" ? `Matched “${d.keyword}”` : null) };
        }),
      });
    } finally {
      scanning = false;
    }
  }

  async function log(entry) {
    await send({ type: "log", entry });
    return entry;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "scanNow") {
      if (!location.pathname.startsWith("/bltxn")) {
        sendResponse({ message: "Open the IndiaMART BuyLeads page first." });
        return false;
      }
      scanOnce({ manual: true }).then((result) => sendResponse(result ?? { message: "Done." }));
      return true;
    }
    return false;
  });

  async function main() {
    if (await finishRedirectedPurchase()) return;
    if (!location.pathname.startsWith("/bltxn")) return;

    await sleep(jitter(3000));
    await scanOnce();

    // Reload to pick up fresh leads; IndiaMART does not push new leads into an open page reliably.
    const { enabled, intervalSeconds } = await send({ type: "settings" });
    if (enabled) setTimeout(() => location.reload(), jitter(Math.max(30, intervalSeconds) * 1000));
    else setTimeout(main, 15000);
  }

  main();
})();
