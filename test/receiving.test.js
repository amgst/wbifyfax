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
test('Firebase persistence completes before success, duplicates skip download and storage failures propagate', async () => {
  const original = globalThis.fetch;
  process.env.TELNYX_FAX_CONNECTION_ID = 'connection';
  let downloads = 0;
  globalThis.fetch = async () => {downloads++; return new Response('%PDF-1.7\nexample');};
  const event = {event_type: 'fax.received', occurred_at: new Date().toISOString(), payload: {direction: 'inbound', connection_id: 'connection', fax_id: 'abc-123', from: '+1234567890', to: '+1234567891', page_count: 1, media_url: 'https://s3.amazonaws.com/faxes/test.pdf'}};
  const writes = [];
  const store = {exists: async () => false, savePDF: async (id, pdf) => writes.push(['pdf', id, pdf]), saveRecord: async record => writes.push(['record', record])};
  const factory = async () => store;
  try {
    await receive(event, factory);
    assert.equal(downloads, 1); assert.equal(writes[0][0], 'pdf'); assert.equal(writes[1][0], 'record');
    store.exists = async () => true;
    await receive(event, factory); assert.equal(downloads, 1); assert.equal(writes.length, 2);
    store.exists = async () => false;
    await assert.rejects(receive({...event, payload: {...event.payload, media_url: 'http://127.0.0.1/private'}}, factory), /Unsupported/);
    store.savePDF = async () => {throw Error('Storage failed');};
    await assert.rejects(receive(event, factory), /Storage failed/); assert.equal(writes.length, 2);
  } finally {globalThis.fetch = original;}
});
test('webhook returns retryable failure when unconfigured', async () => {
  const prior = process.env.TELNYX_PUBLIC_KEY; delete process.env.TELNYX_PUBLIC_KEY;
  const req = Readable.from([]); req.method = 'POST';
  let status;
  try {await handler(req, {writeHead: value => {status = value;}, end() {}}); assert.equal(status, 503);}
  finally {if (prior) process.env.TELNYX_PUBLIC_KEY = prior;}
});
