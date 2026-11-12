import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {sendFax, validateFax, updateDelivery} from '../lib/sending.js';
import handler from '../api/faxes.js';
const id = '12345678-1234-4123-8123-123456789012';
const document = {filename: 'test.pdf', number: '+14155550123', file: `data:application/pdf;base64,${Buffer.from('%PDF-1.7\nexample').toString('base64')}`};
function memoryStore() {
  let job, uploads = 0, deletions = 0;
  return {
    async reserveOutbound(value) {if (job) return false; job = {...value}; return true;},
    async getOutbound() {return {...job};},
    async uploadOutbound() {uploads++; return 'https://storage.googleapis.com/private/test.pdf?signed=yes';},
    async updateOutbound(key, patch) {assert.equal(key, id); Object.assign(job, patch);},
    async deleteOutboundPDF() {deletions++;},
    get uploads() {return uploads;}, get deletions() {return deletions;}
  };
}
test('real provider request includes a private document URL and repeated request IDs cannot send twice', async () => {
  const store = memoryStore(); let calls = 0;
  const provider = async (url, options) => {
    calls++; assert.equal(url, 'https://api.telnyx.com/v2/faxes');
    const body = JSON.parse(options.body);
    assert.equal(body.to, document.number); assert.match(body.media_url, /signed=yes/);
    assert.equal(Buffer.from(body.client_state, 'base64').toString(), id);
    return Response.json({data: {id: 'provider-123', status: 'queued'}});
  };
  const job = await sendFax(document, id, async () => store, provider);
  assert.equal(job.status, 'queued'); assert.equal(job.fax_id, 'provider-123');
  await sendFax(document, id, async () => store, provider);
  assert.equal(calls, 1); assert.equal(store.uploads, 1);
});
test('ambiguous provider failures remain unknown and are never automatically resent', async () => {
  const store = memoryStore(); let calls = 0;
  const provider = async () => {calls++; throw Error('Network timeout');};
  assert.equal((await sendFax(document, id, async () => store, provider)).status, 'unknown');
  await sendFax(document, id, async () => store, provider); assert.equal(calls, 1);
});
test('storage failure never places a fax call; provider rejections are recorded as failed', async () => {
  const store = memoryStore(); store.uploadOutbound = async () => {throw Error('storage down');};
  assert.equal((await sendFax(document, id, async () => store, () => assert.fail('Must not send'))).status, 'failed');
  const other = memoryStore();
  assert.equal((await sendFax(document, id, async () => other, async () => new Response('', {status: 422}))).status, 'failed');
});
test('delivery update checks application and identity, and removes the sent PDF', async () => {
  const store = memoryStore(); await store.reserveOutbound({id, status: 'queued'});
  const event = {event_type: 'fax.delivered', payload: {direction: 'outbound', connection_id: process.env.TELNYX_FAX_CONNECTION_ID, fax_id: 'provider-123', client_state: Buffer.from(id).toString('base64')}};
  await updateDelivery(event, async () => store);
  assert.equal((await store.getOutbound()).status, 'delivered'); assert.equal(store.deletions, 1);
  await assert.rejects(updateDelivery({...event, payload: {...event.payload, connection_id: 'wrong'}}, async () => store), /Unexpected/);
});
test('invalid documents, destinations and separate cover notes are rejected', () => {
  for (const data of [{...document, number: '123'}, {...document, file: 'data:application/pdf;base64,YmFk'}, {...document, cover: 'Must not silently drop this'}]) assert.throws(() => validateFax(data));
});
test('sending endpoint rejects unauthenticated requests before reading documents', async () => {
  const req = Readable.from([]); req.method = 'POST'; req.headers = {};
  let status; await handler(req, {writeHead(code) {status = code;}, end() {}});
  assert.equal(status, 401);
});
