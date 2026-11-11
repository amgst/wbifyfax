# Enable receiving on Vercel

This implements a single-owner inbox. Outbound fax sending remains a demo.

1. Create a Supabase project. In its SQL Editor, run `supabase/setup.sql`. This creates the metadata table and a **private** `faxes` bucket with no browser access policies.
2. In Vercel → Project → Settings → Environment Variables, add these for Production:
   - `SUPABASE_URL`: your Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the server-only service_role key from Supabase project API settings. Never use it in browser code or commit it.
   - `TELNYX_PUBLIC_KEY`: the base64 webhook signing public key from Telnyx Settings → Public Keys.
   - `TELNYX_FAX_CONNECTION_ID`: `3090754403011921243` (confirm this matches your application).
   - `INBOX_ACCESS_TOKEN`: a unique random value of at least 32 characters, kept in your password manager. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` locally.
3. Deploy this Git revision through your connected Vercel repository. After changing environment variables, redeploy. The included Vercel configuration deploys static pages and API functions; the local sending demo's `/api/faxes` JSON history is not deployed.
4. In Telnyx, keep the webhook URL `https://fax.wbify.com/api/webhooks/telnyx`, select PDF in Inbound settings and assign your number to the application.
5. Open `https://fax.wbify.com/inbox`, enter your inbox token, and send a real test fax from another fax service. Confirm the PDF downloads correctly. A partial fax is explicitly labeled.

No Telnyx API key is needed for receiving webhooks. The endpoint rejects unsigned requests, checks timestamps and the application ID, ignores unrelated events, and returns success only after a completed fax is persisted. Duplicate completed events use the fax ID to avoid duplicate records. Media downloads allow signed AWS S3 HTTPS URLs, reject redirects, and cap PDFs at 20 MB. Unexpected provider media hosts fail closed and require updating the allowlist.

The inbox displays the latest 100 completed faxes; intermediate and failed events are acknowledged without inbox entries. Storage failures return 503 so Telnyx can retry. Monitor Telnyx webhook logs: received media links expire, so retries are not a replacement for durable queueing and operational monitoring. This initial receiver downloads synchronously; tune the Telnyx webhook timeout to accommodate storage latency (up to the portal's supported maximum), and use a durable queue before higher-volume operation.

Run checks: `node --test`. Local development: set the variables in your shell, or copy `.env.example` to `.env` and run `node --env-file=.env server.js`.

Tests use mocked storage; an actual Telnyx delivery and Vercel/Supabase integration test remain required. This is a shared owner inbox, not a multi-user commercial service. Do not use it for regulated documents until access, retention and compliance requirements are reviewed.
