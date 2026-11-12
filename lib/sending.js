import {firebaseStore} from './firebase.js';

export const MAX_PDF_BYTES = 3 * 1024 * 1024;
const phone = /^\+[1-9]\d{7,14}$/;
export function sendingReady() {
  return ['TELNYX_API_KEY', 'TELNYX_FAX_CONNECTION_ID', 'TELNYX_PUBLIC_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_STORAGE_BUCKET'].every(name => Boolean(process.env[name])) && phone.test(process.env.TELNYX_FROM_NUMBER || '');
}
export function validateFax(data) {
  if (!phone.test(data.number || '')) throw Error('Enter an international fax number beginning with +.');
  if (typeof data.filename !== 'string' || !data.filename.toLowerCase().endsWith('.pdf') || data.filename.length > 150) throw Error('Choose a PDF with a filename under 150 characters.');
  if (data.cover) throw Error('Include the cover page inside your PDF.');
  if (typeof data.file !== 'string' || !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.file)) throw Error('Choose a valid PDF.');
  const pdf = Buffer.from(data.file.split(',')[1], 'base64');
  if (pdf.length < 8 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString() !== '%PDF-') throw Error('Choose a valid PDF up to 3 MB.');
  return pdf;
}
// Reserve durably before calling the provider. Never automatically resend an ambiguous submission.
export async function sendFax(data, id, storeFactory = firebaseStore, request = fetch) {
  const pdf = validateFax(data), store = await storeFactory();
  const job = {id, number: data.number, filename: data.filename, size: pdf.length, createdAt: new Date().toISOString(), status: 'submitting'};
  if (!await store.reserveOutbound(job)) return await store.getOutbound(id);
  let media;
  try {media = await store.uploadOutbound(id, pdf);} catch {
    await store.updateOutbound(id, {status: 'failed', failure_reason: 'Document storage failed. No fax was submitted.'});
    return await store.getOutbound(id);
  }
  try {
    const response = await request('https://api.telnyx.com/v2/faxes', {
      method: 'POST', headers: {Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({connection_id: process.env.TELNYX_FAX_CONNECTION_ID, from: process.env.TELNYX_FROM_NUMBER, to: data.number, media_url: media, client_state: Buffer.from(id).toString('base64')}),
      signal: AbortSignal.timeout(20000), redirect: 'error'
    });
    if (!response.ok) {
      await store.updateOutbound(id, {status: response.status >= 500 || response.status === 408 ? 'unknown' : 'failed', failure_reason: `Provider returned HTTP ${response.status}. Check Telnyx before sending again.`});
    } else {
      const result = await response.json();
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(result.data?.id || '')) throw Error('Missing provider ID');
      await store.updateOutbound(id, {fax_id: result.data.id, status: 'queued'});
    }
  } catch {
    await store.updateOutbound(id, {status: 'unknown', failure_reason: 'Submission could not be confirmed. Check Telnyx before sending again.'});
  }
  return await store.getOutbound(id);
}
export async function updateDelivery(event, storeFactory = firebaseStore) {
  const statuses = {'fax.queued': 'queued', 'fax.media.processed': 'processing', 'fax.sending.started': 'sending', 'fax.delivered': 'delivered', 'fax.failed': 'failed'};
  const status = statuses[event?.event_type], p = event?.payload;
  if (!status || p?.direction !== 'outbound') return;
  if (p.connection_id !== process.env.TELNYX_FAX_CONNECTION_ID) throw Error('Unexpected fax application');
  const id = Buffer.from(p.client_state || '', 'base64').toString();
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-zA-Z0-9-]{1,100}$/.test(p.fax_id || '')) throw Error('Invalid outbound fax identity');
  const store = await storeFactory();
  await store.updateOutbound(id, {fax_id: p.fax_id, status, failure_reason: status === 'failed' ? String(p.failure_reason || 'Provider reported delivery failure').slice(0, 300) : null});
  if (status === 'delivered' || status === 'failed') await store.deleteOutboundPDF(id);
}
