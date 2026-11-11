// Loads the real, shipped extension bundle so tests exercise production code rather than a copy.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

const EXPORTS = [
  "parseBlApiRow", "parseBlDisplayData", "parseBlClosedLeads", "parseBuyResult", "enrichmentFromBuy", "enrichmentHasBuyerData",
  "apiLeadToCapturedLead", "apiLeadClientEventId", "decideLeadLocally", "classifyLeadLocally", "explainSkip", "createBuyQueue",
  "isPollRateLimited", "nextSafetyBrake", "resetRealtimeThrottle", "startRealtimeLeadListener", "decidePolledLeads",
  "decideArrivedLeads", "shouldAutoEnrichMarker", "canBuyInThisTab", "alreadyDecided", "sweepDeferredLeads", "rememberMarkers",
  "recordEnrichmentAttempt", "restoreDecidedLeadKeys", "isBuyLeadPath", "parseRealtimeLeadMessage",
];

// Runs content-script.js in a fresh VM. The bundle only boots itself when window and chrome exist,
// so the test decides what those globals look like after the code has loaded.
export function loadContentScript(globals = {}) {
  const source = fs.readFileSync(path.join(ROOT, "extension/content-script.js"), "utf8");
  const exportsBlock = EXPORTS.map((name) => `if (typeof ${name} !== "undefined") globalThis.__t.${name} = ${name};`).join("\n");
  // Direct eval reaches the bundle's private variables, which is how a test sets up tab state.
  const stateAccess = "globalThis.__t.setState = (name, value) => eval(`${name} = value`); globalThis.__t.getState = (name) => eval(name);";
  const patched = source.replace(/\}\)\(\);\s*$/, `globalThis.__t = {};\n${exportsBlock}\n${stateAccess}\n})();`);
  const context = vm.createContext({ console, URL, Intl, setTimeout, clearTimeout, ...globals });
  vm.runInContext(patched, context, { filename: "content-script.js" });
  return { api: context.__t, context };
}

// JSON round trip: objects from the VM carry a foreign prototype, which breaks deepEqual and fetch bodies.
export const plain = (value) => JSON.parse(JSON.stringify(value));

export function readBundle(file) {
  return fs.readFileSync(path.join(ROOT, "extension", file), "utf8");
}

// A row in the shape IndiaMART's getBLDisplayData returns, using the keys parseBlApiRow reads. All values are fake.
export function imRow(overrides = {}) {
  return {
    ETO_OFR_ID: "90000001",
    ETO_OFR_TITLE: "Tadalafil Tablets",
    GLUSR_COUNTRY: "USA",
    FK_GL_COUNTRY_ISO: "US",
    GLUSR_STATE: null,
    DATATYPE: "lead",
    PURCHASE_STATUS: "OPEN",
    ETO_OFR_BUYER_IS_MOB_VERF: 1,
    ETO_OFR_EMAIL_VERIFIED: 1,
    BY_LEAD_TYPE: 3,
    GLUSR_USR_MEMBERSINCE: "Jan 2020",
    OFR_DATE: "20261106120000",
    ETO_OFR_ADDITIONAL_DETAILS: [{ is_whatsapp_active: 1 }],
    ...overrides,
  };
}

// A successful contactBuyNow answer with the buyer's contacts present. All values are fake.
export function imBuyAnswer(overrides = {}) {
  return {
    ok: true,
    status: 200,
    retryAfterSeconds: null,
    json: {
      Status: "Success",
      Flag: "1",
      pur_id: "555001",
      Data: [
        {
          GLUSR_NAME: "Test Buyer",
          GLUSR_COMPANY: "Test Pharma LLC",
          GLUSR_USR_PH_MOBILE: "5550100123",
          GLUSR_USR_PH_COUNTRY: "1",
          GLUSR_USR_EMAIL: "buyer@example.com",
          GLUSR_ADDRESS: "1 Test Street",
          GLUSR_CITY: "Austin",
          GLUSR_STATE: "Texas",
          GLUSR_COUNTRY: "USA",
          ...overrides,
        },
        { creditBalance: "42" },
      ],
    },
  };
}
