// Read-only audit of what IndiaMART returned for each purchase, as saved in the extension's local outbox.
// It changes nothing and sends nothing. Phones and emails are masked in the output.
//
// Where to run it: chrome://extensions -> Hi-San Bot -> click "service worker" -> Console -> paste this file.
// Run it in the browser the bot runs in, because the outbox exists only there.
(async () => {
  const known = await indexedDB.databases();
  if (!known.some((database) => database.name === "im_leads_outbox")) {
    console.log("No outbox in this browser. Run this in the browser where the bot buys leads.");
    return null;
  }
  const database = await new Promise((resolve, reject) => {
    const open = indexedDB.open("im_leads_outbox");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const records = await new Promise((resolve, reject) => {
    const all = database.transaction("enrichments").objectStore("enrichments").getAll();
    all.onsuccess = () => resolve(all.result);
    all.onerror = () => reject(all.error);
  });
  database.close();

  const maskPhone = (value) => (value ? `***${String(value).slice(-2)}` : "NONE");
  const maskEmail = (value) => (value ? `${String(value)[0]}***@${String(value).split("@")[1] ?? "?"}` : "NONE");
  const rows = records.map(({ business_id: business, state, payload = {}, created_at: at }) => ({
    business: String(business).slice(-6),
    bought: String(at).slice(0, 16),
    lead: String(payload.popup_title ?? "").slice(0, 36),
    buyer: payload.buyer_name ? "yes" : "NONE",
    phone: maskPhone(payload.buyer_phone),
    email: maskEmail(payload.buyer_email),
    company: payload.requirement_fields?.Company ? "yes" : "NONE",
    sync: state,
  }));
  console.table(rows);

  const summary = {
    purchases: rows.length,
    with_phone: rows.filter((row) => row.phone !== "NONE").length,
    with_email: rows.filter((row) => row.email !== "NONE").length,
    with_phone_or_email: rows.filter((row) => row.phone !== "NONE" || row.email !== "NONE").length,
    with_neither: rows.filter((row) => row.phone === "NONE" && row.email === "NONE").length,
  };
  console.log(summary);
  return summary;
})();
