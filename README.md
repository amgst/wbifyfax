# FaxBridge

Private, single-owner fax sending and receiving using Telnyx, Firestore and private Cloud Storage. Outbound submissions now call the actual Telnyx fax API; there is no simulated sending mode. A configured, funded provider account is required.

## Run and configure

Requires Node.js 20+. Run `npm install`, copy `.env.example` to `.env`, fill the server settings locally, then run `node --env-file=.env server.js`. Run `npm test` for the automated checks. Never commit secrets or put them in browser code.

Follow [RECEIVING.md](RECEIVING.md) to configure Firebase, the inbox token, Telnyx signing key and the fax application's webhook. For sending, also configure:

- `TELNYX_API_KEY`: a server-side API key for your funded Telnyx account.
- `TELNYX_FROM_NUMBER`: your authorized fax number in E.164 format, such as `+14155550123`.
- `TELNYX_FAX_CONNECTION_ID`: the same fax application used for the number and signed webhooks. Enable outbound faxing and the intended destinations in Telnyx.

Use HTTPS for deployment. In Vercel, set all variables for the target environment and redeploy. `/api/faxes` is deployed as an API function, alongside `/api/inbox` and `/api/webhooks/telnyx`. Both the sending dashboard and inbox require the same strong `INBOX_ACCESS_TOKEN`; the browser keeps this token in memory only.

## Sending and delivery

Unlock the homepage, choose a PDF up to **3 MB**, and enter the destination. Include any cover page in the PDF. The limit keeps base64 requests within Vercel's function body limit. Sending incurs provider charges.

The server reserves a unique request in Firestore before placing a provider call, saves the PDF in private Storage, and supplies Telnyx a signed download URL valid for one hour. The provider ID is recorded, and verified webhooks update queued, processing, sending, delivered or failed statuses. Queued does not mean delivered. The dashboard refreshes every 15 seconds. Duplicate request IDs cannot place another call, and late intermediate events cannot overwrite a terminal delivery status.

A timeout or provider server error produces `unknown`; an interrupted request may remain `submitting`. **Check the Telnyx fax logs before creating another submission** to avoid duplicate paid calls. These states require manual reconciliation; there is no automatic resend. If the browser did not receive confirmation, it remembers the pending request ID in session storage and blocks further submissions until it appears in history. History shows the latest 100 faxes.

Configure a Cloud Storage lifecycle rule to delete objects with prefix `outbound/` after one day. Completed outbound fax webhooks delete the uploaded document immediately; lifecycle deletion handles abandoned uploads and missing webhooks. Firestore metadata remains until removed by the owner. Telnyx may retain documents according to its own settings and policies.

## Verify the live service

Automated tests mock provider and storage calls. To verify deployment, send a harmless PDF to a fax number you control, confirm its actual receipt and the dashboard's delivered status, and send a return fax to verify the inbox and PDF download. No live call is made by tests.

This is an owner-operated workspace. Multi-user accounts, customer billing, automated reconciliation and regulatory compliance are outside the current implementation.

Provider request fields and delivery events follow the [official Telnyx SDK API definition](https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/faxes/faxes.ts).
