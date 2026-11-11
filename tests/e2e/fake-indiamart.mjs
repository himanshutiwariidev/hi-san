// A stand-in for seller.indiamart.com, so the real extension can run in a real browser with no real traffic.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const PAGE = `<!doctype html><title>IndiaMART BuyLeads</title><h1>BuyLeads</h1><ul id="leads"></ul>
<script>
  fetch("/blreact/getBLDisplayData", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ glusrid: "123456", start: 1, end: 50, offer_type: "B" }),
  }).then((response) => response.json()).then((data) => {
    document.getElementById("leads").innerHTML = (data.DisplayList || []).map((row) => "<li>" + row.ETO_OFR_TITLE + "</li>").join("");
  });
</script>`;

export async function startFakeIndiaMart(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-im-"));
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=seller.indiamart.com"], { stdio: "ignore" });

  const state = { rows: [], listStatus: 200, lostIds: new Set(), lists: [], buys: [] };
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const send = (status, json) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(json));
      };
      const url = new URL(request.url, "https://seller.indiamart.com");
      if (request.method === "GET" && url.pathname.startsWith("/bltxn")) {
        response.writeHead(200, { "content-type": "text/html", "set-cookie": "glid=123456; Path=/" });
        return response.end(PAGE);
      }
      if (url.pathname === "/blreact/getBLDisplayData") {
        state.lists.push({ at: Date.now(), body: JSON.parse(body || "{}") });
        return state.listStatus === 200 ? send(200, { DisplayList: state.rows }) : send(state.listStatus, { error: "slow down" });
      }
      if (url.pathname === "/blreact/contactBuyNow") {
        const { ofrid } = JSON.parse(body || "{}");
        state.buys.push({ at: Date.now(), ofrid: String(ofrid) });
        if (state.lostIds.has(String(ofrid))) {
          return send(200, { Flag: "7", MESSAGE: "Sorry, this Buylead expired just a minute ago. This BuyLead is already consumed by maximum permissible sellers." });
        }
        return send(200, {
          Status: "Success",
          Flag: "1",
          pur_id: `P${ofrid}`,
          Data: [
            {
              GLUSR_NAME: `Buyer ${ofrid}`,
              GLUSR_COMPANY: `Company ${ofrid}`,
              GLUSR_USR_PH_MOBILE: `555${ofrid}`,
              GLUSR_USR_PH_COUNTRY: "1",
              GLUSR_USR_EMAIL: `buyer${ofrid}@example.com`,
              GLUSR_CITY: "Austin",
              GLUSR_STATE: "Texas",
              GLUSR_COUNTRY: "USA",
            },
            { creditBalance: "99" },
          ],
        });
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    state,
    stop() {
      server.close();
      server.closeAllConnections();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
