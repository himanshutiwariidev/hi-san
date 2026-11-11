# Hi-San Bot: IndiaMART leads on autopilot

A Next.js dashboard and Chrome extension. The extension reads IndiaMART BuyLeads, the server decides which leads match your keywords and filters, and the extension buys them and saves the buyer's contacts.

## Run

```bash
npm install
npm run dev          
```

Open `/sign-up` to create your account (organization, first business and owner login).

Data is stored in SQLite at `data/hisan-bot.db`. Set `DATABASE_PATH` to put it elsewhere. Production: `npm run build && npm start`. It needs a server with a persistent disk (a VPS, Railway, Render or Fly with a volume). Serverless hosting such as Vercel will not keep the database.

## Connect the extension

1. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `extension/` folder.
2. In the extension settings, paste the dashboard URL and the API key from the dashboard's **Extension** page.
3. Log in to IndiaMART and open BuyLeads (`seller.indiamart.com/bltxn`). Keep the tab open.
4. In the popup, turn on **Auto-buy running** with **Dry run** on. Check that leads are read correctly, then turn Dry run off.

## Update the extension

Extract the new version over the same folder and press **Reload** on `chrome://extensions`. Do not remove it or load another folder: an unpacked extension's storage is tied to its folder, and purchases waiting to sync live there. Deploy the server before updating the extension.

## Test

```bash
npm run build
npm test            # unit and API tests against a throwaway database
npm run test:e2e    # the real extension in Chromium against a fake IndiaMART (needs Playwright's Chromium)
```

No test contacts IndiaMART or the live dashboard.

## How a lead is decided (`lib/server/engine.js`)

A lead is bought only if all of these are true:

1. Its title matches an enabled keyword rule. A rule can be limited to certain countries.
2. Its country is in the allowed list, if one is set.
3. The title contains no blocked word.
4. The quantity is at least the minimum.
5. Email or mobile is verified, if you require that.
6. The lead is not older than the maximum age, if one is set.
7. Auto-buy is on.
8. Today's purchases are under the daily limit.

Every decision is stored with its reason and a log. A lead is never bought twice. A filtered lead is checked again if you change your rules.

## Webhooks

Each lead event is POSTed as JSON (`lead.retrieved`, `lead.filtered`, `lead.not_retrieved`). If you set a secret, the body is signed in the `X-HiSan-Signature: sha256=<hmac>` header.

## If IndiaMART changes its page

The extension finds lead cards from their **Contact Buyer Now** buttons and reads the text around them (`extension/content.js`). If IndiaMART changes its layout, set **Lead card CSS selector** in the extension's Advanced settings, or update the parsing in `parseCard`.
