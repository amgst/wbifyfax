import {createPublicKey, verify, timingSafeEqual} from 'node:crypto';
import {firebaseStore} from './firebase.js';

export function verifyWebhook(raw, headers, publicKey, now = Date.now()) {
  try {
    const timestamp = headers['telnyx-timestamp'];
    if (!/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
    const bytes = Buffer.from(publicKey, 'base64');
    if (bytes.length !== 32) return false;
    const key = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), bytes]), format: 'der', type: 'spki'});
    return verify(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), key, Buffer.from(headers['telnyx-signature-ed25519'] || '', 'base64'));
  } catch { return false; }
}

export function authorized(value, token) {
  if (!token || token.length < 32) return false;
  const expected = Buffer.from(`Bearer ${token}`), actual = Buffer.from(value || '');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function json(res, status, body) {
  res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(JSON.stringify(body));
}

export async function receive(event, storeFactory = firebaseStore) {
  const p = event?.payload;
  if (event?.event_type !== 'fax.received' || p?.direction !== 'inbound') return;
  if (p.connection_id !== process.env.TELNYX_FAX_CONNECTION_ID) throw Error('Unexpected fax application');
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(p.fax_id || '')) throw Error('Invalid fax ID');
  const store = await storeFactory();
  if (await store.exists(p.fax_id)) return;
  const url = new URL(p.media_url);
  // Only fetch the provider's signed AWS media URL; never follow redirects.
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname === 's3.amazonaws.com' || /^[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname))) throw Error('Unsupported media host');
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(12000)});
  if (!response.ok || Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw Error('Media download failed');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw Error('Fax exceeds 20 MB');
    chunks.push(chunk);
  }
  const pdf = Buffer.concat(chunks);
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw Error('Invalid PDF');
  const object_path = `${p.fax_id}.pdf`;
  await store.savePDF(p.fax_id, pdf);
  await store.saveRecord({fax_id: p.fax_id, sender: p.from, recipient: p.to, page_count: p.page_count ?? null, partial: Boolean(p.partial_content), received_at: event.occurred_at, object_path});
}
