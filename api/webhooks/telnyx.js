import {verifyWebhook, receive, json} from '../../lib/receiving.js';
export const config = {api: {bodyParser: false}};
export default async function handler(req, res) {
  if (req.method !== 'POST') {res.setHeader('Allow', 'POST'); return json(res, 405, {error: 'Use POST'});}
  if (!process.env.TELNYX_PUBLIC_KEY || !process.env.TELNYX_FAX_CONNECTION_ID) return json(res, 503, {error: 'Receiver is not configured'});
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {size += chunk.length; if (size > 256 * 1024) return json(res, 413, {error: 'Payload too large'}); chunks.push(chunk);}
    const raw = Buffer.concat(chunks);
    if (!verifyWebhook(raw, req.headers, process.env.TELNYX_PUBLIC_KEY)) return json(res, 401, {error: 'Invalid signature'});
    let body; try {body = JSON.parse(raw);} catch {return json(res, 400, {error: 'Invalid JSON'});}
    await receive(body.data);
    return json(res, 200, {received: true});
  } catch {return json(res, 503, {error: 'Could not persist fax; retry delivery'});}
}
