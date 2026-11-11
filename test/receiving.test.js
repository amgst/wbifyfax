import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {verifyWebhook, authorized, receive} from '../lib/receiving.js';
import handler from '../api/webhooks/telnyx.js';
import {Readable} from 'node:stream';

test('accepts signed raw payload and rejects tampering, stale timestamps and missing signatures', () => {
  const {publicKey, privateKey} = generateKeyPairSync('ed25519');
  const key = publicKey.export({format: 'der', type: 'spki'}).subarray(-32).toString('base64');
  const raw = Buffer.from('{"data":{}}'), timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {'telnyx-timestamp': timestamp, 'telnyx-signature-ed25519': sign(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), privateKey).toString('base64')};
  assert.equal(verifyWebhook(raw, headers, key), true);
  assert.equal(verifyWebhook(Buffer.from('{}'), headers, key), false);
  assert.equal(verifyWebhook(raw, headers, key, Date.now() + 600000), false);
  assert.equal(verifyWebhook(raw, {}, key), false);
});
test('inbox fails closed without a strong configured token', () => {
  assert.equal(authorized('Bearer undefined', undefined), false);
  assert.equal(authorized('Bearer short', 'short'), false);
  assert.equal(authorized(`Bearer ${'a'.repeat(32)}`, 'a'.repeat(32)), true);
  assert.equal(authorized(`Bearer ${'b'.repeat(32)}`, 'a'.repeat(32)), false);
});
test('completed fax is stored before acknowledgement and duplicate skips media download', async () => {
  const original = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'; process.env.TELNYX_FAX_CONNECTION_ID = 'connection';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes('?fax_id=')) return Response.json([]);
    if (String(url).includes('s3.amazonaws.com')) return new Response('%PDF-1.7\nexample');
    return new Response(null, {status: 201});
  };
  const event = {event_type: 'fax.received', occurred_at: new Date().toISOString(), payload: {direction: 'inbound', connection_id: 'connection', fax_id: 'abc-123', from: '+1234567890', to: '+1234567891', page_count: 1, media_url: 'https://s3.amazonaws.com/faxes/test.pdf'}};
  try {
    await receive(event); assert.equal(calls.length, 4);
    assert.match(calls[2][0], /storage\/v1\/object\/faxes\/abc-123.pdf/);
    assert.match(calls[3][0], /rest\/v1\/inbound_faxes/);
    globalThis.fetch = async () => Response.json([{fax_id: 'abc-123'}]);
    await receive(event);
    globalThis.fetch = async () => Response.json([]);
    await assert.rejects(receive({...event, payload: {...event.payload, media_url: 'http://127.0.0.1/private'}}), /Unsupported/);
  } finally {globalThis.fetch = original;}
});
test('webhook returns retryable failure when unconfigured', async () => {
  const prior = process.env.TELNYX_PUBLIC_KEY; delete process.env.TELNYX_PUBLIC_KEY;
  const req = Readable.from([]); req.method = 'POST';
  let status;
  try {await handler(req, {writeHead: value => {status = value;}, end() {}}); assert.equal(status, 503);}
  finally {if (prior) process.env.TELNYX_PUBLIC_KEY = prior;}
});
