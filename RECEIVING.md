# Receive faxes with Firebase on Vercel

This implements a single-owner inbox. Outbound fax sending uses the real Telnyx API; see README.md for its additional settings.

1. Create or select a project at https://console.firebase.google.com/. Create a **Cloud Firestore Standard edition** database with the default database ID, in production mode. Enable **Storage** and create a bucket. Cloud Storage requires the Blaze billing plan; review current Firebase billing requirements.
2. Publish `firebase/firestore.rules` in Firestore Rules and `firebase/storage.rules` in Storage Rules. These deny browser access; the server Admin SDK uses IAM credentials. Use a dedicated project, or merge these rules with existing app rules carefully. Keep bucket IAM private; do not allow allUsers access.
3. In Firebase Project settings ? Service accounts ? Firebase Admin SDK, generate a private key. Keep the JSON outside this repository and never paste it into chat. The service account needs Firestore document and Storage object read/write access.
4. In Vercel ? Project ? Settings ? Environment Variables, add these for Production:
   - `FIREBASE_PROJECT_ID`: the service-account JSON `project_id`.
   - `FIREBASE_CLIENT_EMAIL`: its `client_email`.
   - `FIREBASE_PRIVATE_KEY`: its entire `private_key`, including BEGIN/END lines. Actual newlines or literal `\n` both work.
   - `FIREBASE_STORAGE_BUCKET`: the exact bucket name from Storage, without `gs://`; do not guess the suffix.
   - `TELNYX_PUBLIC_KEY`: the base64 webhook signing public key from Telnyx Settings ? Public Keys.
   - `TELNYX_FAX_CONNECTION_ID`: `3090754403011921243` (confirm this matches your application).
   - `INBOX_ACCESS_TOKEN`: a unique random value of at least 32 characters, kept in your password manager. Generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
5. Deploy this Git revision through your connected Vercel repository. After changing environment variables, redeploy. The included Vercel configuration deploys static pages and API functions, including the real `/api/faxes` sending endpoint.
6. In Telnyx, keep the webhook URL `https://fax.wbify.com/api/webhooks/telnyx`, select PDF in Inbound settings and assign your number to the application.
7. Open `https://fax.wbify.com/inbox`, enter your inbox token, and send a real test fax from another fax service. Confirm the PDF downloads correctly. A partial fax is explicitly labeled.

No Telnyx API key is needed for receiving webhooks. The endpoint rejects unsigned requests, checks timestamps and the application ID, ignores unrelated events, and returns success only after a completed fax is persisted. Duplicate completed events use the fax ID to avoid duplicate records. Media downloads allow signed AWS S3 HTTPS URLs, reject redirects, and cap PDFs at 20 MB. Unexpected provider media hosts fail closed and require updating the allowlist.

The inbox displays the latest 100 completed faxes; intermediate and failed events are acknowledged without inbox entries. Storage failures return 503 so Telnyx can retry. Monitor Telnyx webhook logs: received media links expire, so retries are not a replacement for durable queueing and operational monitoring. This initial receiver downloads synchronously; tune the Telnyx webhook timeout to accommodate storage latency (up to the portal's supported maximum), and use a durable queue before higher-volume operation.

Install dependencies with `npm install`, then run checks with `node --test`. Local development: set the variables in your shell, or copy `.env.example` to `.env` and run `node --env-file=.env server.js`.

Tests use mocked Firebase persistence; an actual Telnyx delivery and Vercel/Firebase integration test remain required. This is a shared owner inbox, not a multi-user commercial service. Do not use it for regulated documents until access, retention and compliance requirements are reviewed.

The homepage sends real faxes after configuration. Access receiving through `/inbox`. Verify a Firestore `inbound_faxes` record and private Storage `faxes/<fax-id>.pdf` appear after a test delivery. No Firebase browser API key is needed.

Firebase references: https://firebase.google.com/docs/admin/setup and https://firebase.google.com/docs/storage/admin/start
