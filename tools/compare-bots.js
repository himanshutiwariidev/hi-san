// Read-only snapshot of how one bot has been doing, so two bots on the same IndiaMART account can be compared
// lead by lead. It changes nothing and sends nothing. It reads lead titles, IndiaMART offer ids and timings,
// never buyer names, phone numbers or emails.
//
// Where to run it: chrome://extensions -> the bot -> click "service worker" -> Console -> paste this file.
// Run it once in Hi-San Bot and once in the other bot, in the browser where they run. The result is printed and,
// when the console allows it, copied to the clipboard as one line of JSON.
(async () => {
  const HOURS = 24;
  const copyToClipboard = typeof copy === "function" ? copy : null; // only reachable before the first await
  const manifest = chrome.runtime.getManifest();
  const stored = await chrome.storage.local.get([
    "botEnabled", "pollSettings", "lastApiPoll", "lastIntake", "lastBuyTiming", "imSafetyBrake", "lastSafetyBrake",
    "lastSyncError", "lastInactivityReload", "lastInactivityContinue", "decisionConfig",
  ]);

  let rows = [];
  if ((await indexedDB.databases()).some((database) => database.name === "im_leads_outbox")) {
    const database = await new Promise((resolve, reject) => {
      const open = indexedDB.open("im_leads_outbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    if (database.objectStoreNames.contains("activity")) {
      rows = await new Promise((resolve, reject) => {
        const all = database.transaction("activity").objectStore("activity").getAll();
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      });
    }
    database.close();
  }

  const since = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();
  const recent = rows.filter((row) => String(row.created_at) >= since).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const milliseconds = (text, pattern) => {
    const match = pattern.exec(text ?? "");
    return match ? Math.round(Number(match[1]) * (match[2] === "s" ? 1000 : 1)) : null;
  };
  const outcomeOf = (row) => {
    if (row.skip_reason === "indiamart_not_retrieved") return "lost";
    if (row.decision !== "captured") return null;
    return ["PENDING", "SENDING", "ACKED", "RETRY"].includes(row.contact_state) ? "bought" : "trying";
  };
  const attempts = recent
    .map((row) => ({ row, outcome: outcomeOf(row) }))
    .filter(({ outcome }) => outcome)
    .map(({ row, outcome }) => {
      const note = outcome === "bought" ? "" : String(row.contact_error ?? "");
      return {
        at: String(row.created_at).slice(11, 19),
        offer: row.offer_id ?? "",
        title: String(row.title ?? "").slice(0, 34),
        country: row.country ?? "",
        outcome,
        why: note.split(":")[0].slice(0, 30),
        posted_to_seen_ms: milliseconds(note, /posted ([\d.]+) (ms|s) before we/),
        seen_to_sent_ms: milliseconds(note, /buy sent ([\d.]+) (ms|s) after/),
        answered_ms: milliseconds(note, /answered in ([\d.]+) (ms|s)/),
      };
    });

  const count = (list, keyOf) => list.reduce((tally, item) => ({ ...tally, [keyOf(item)]: (tally[keyOf(item)] ?? 0) + 1 }), {});
  const median = (values) => {
    const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const config = stored.decisionConfig ?? null;
  const lost = attempts.filter((attempt) => attempt.outcome === "lost");
  const report = {
    bot: `${manifest.name} ${manifest.version}`,
    taken_at: new Date().toISOString(),
    window_hours: HOURS,
    bot_running: stored.botEnabled === true,
    purchases: { tried: attempts.length, ...count(attempts, (attempt) => attempt.outcome) },
    lost_because: count(lost, (attempt) => attempt.why || "unknown"),
    lost_median_ms: {
      posted_to_seen: median(lost.map((attempt) => attempt.posted_to_seen_ms)),
      seen_to_sent: median(lost.map((attempt) => attempt.seen_to_sent_ms)),
      indiamart_answer: median(lost.map((attempt) => attempt.answered_ms)),
    },
    skipped: count(recent.filter((row) => !outcomeOf(row)), (row) => row.skip_reason ?? "none"),
    poll_settings: stored.pollSettings ?? null,
    last_poll: stored.lastApiPoll ?? null,
    last_intake: stored.lastIntake ?? null,
    last_purchase_timing: stored.lastBuyTiming ?? null,
    safety_brake: stored.imSafetyBrake ?? null,
    last_safety_brake: stored.lastSafetyBrake ?? null,
    last_page_reload: stored.lastInactivityReload?.reloaded_at ?? null,
    last_sync_error: stored.lastSyncError || null,
    filters: config && {
      version: config.version,
      keywords: config.keyword_rules?.length ?? 0,
      match_types: count(config.keyword_rules ?? [], (rule) => `${rule.type ?? "positive"}:${rule.match_type ?? "whole_word"}`),
      countries: config.settings?.allowed_countries ?? [],
      contact: { any: config.settings?.any_contact_mode, email: config.settings?.email_mode, phone: config.settings?.phone_mode },
      daily_limit: config.settings?.daily_capture_limit,
      bought_today: config.today?.captured_count,
    },
    attempts,
  };

  console.table(attempts);
  console.log(report);
  if (copyToClipboard) {
    copyToClipboard(JSON.stringify(report));
    console.log("Copied. Paste it into the chat, once for each bot.");
  }
  return report;
})();
