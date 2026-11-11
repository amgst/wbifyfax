# FaxBridge — Online Fax MVP (demo)

A responsive online fax app with PDF upload, E.164 phone-number validation, optional cover note, and persistent demo fax history. The app **does not send real faxes** or charge payments. Uploaded PDF bytes are validated and discarded; only their name/size and fax request metadata are stored in `data/faxes.json`.

## Run

Requires Node.js 20+; no npm dependencies.

```bash
npm start
```

Open http://localhost:3000

## Connect actual fax sending

1. Open an account with a fax provider such as Phaxio or Telnyx. Confirm your intended destinations are supported.
2. Add server-side secrets as environment variables (`PHAXIO_API_KEY`, `PHAXIO_API_SECRET`), never in browser code.
3. Replace the demo-only portion of `POST /api/faxes` with a real authenticated server-side submission to the provider; transmit file bytes over TLS, store the provider's fax ID and `queued` status.
4. Add a webhook endpoint that authenticates provider callbacks and updates status on confirmed outcomes. Do not label an accepted fax as delivered.
5. Before exposing this publicly, implement real login, per-user authorization, a transactional database, encrypted object storage, malware scanning, rate limits, abuse controls, international destination restrictions, secure document deletion, compliance/privacy policies and payment processing. The current shared JSON history is for **local demonstration only** and **not production safe**.

No provider integration or payments are configured. This is not a fully operational commercial fax service.

## Incoming faxes on Vercel

Firebase-backed Telnyx receiving and a private owner inbox are implemented. Follow [RECEIVING.md](RECEIVING.md) for Firestore, Cloud Storage, credentials and deployment. Sending remains a demo. Run `npm install` before starting the app.
