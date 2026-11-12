import {authorized, json} from '../lib/receiving.js';
import {firebaseStore} from '../lib/firebase.js';
import {sendingReady, sendFax, validateFax} from '../lib/sending.js';
export const config = {api: {bodyParser: false}};
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, {error: 'Use GET or POST'});
  if (!authorized(req.headers.authorization, process.env.INBOX_ACCESS_TOKEN)) return json(res, 401, {error: 'Enter your workspace access token.'});
  if (!sendingReady()) return json(res, 503, {error: 'Fax sending is not configured. Add the Telnyx and Firebase server settings.'});
  try {
    if (req.method === 'GET') return json(res, 200, {jobs: await (await firebaseStore()).listOutbound()});
    const id = req.headers['idempotency-key'];
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id || '')) return json(res, 400, {error: 'A valid request ID is required.'});
    let data;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {size += chunk.length; if (size > 4.3 * 1024 * 1024) return json(res, 413, {error: 'PDF must be 3 MB or smaller.'}); chunks.push(Buffer.from(chunk));}
      data = JSON.parse(Buffer.concat(chunks)); validateFax(data);
    } catch (error) {return json(res, 400, {error: error.message || 'Invalid request'});}
    return json(res, 202, {job: await sendFax(data, id)});
  } catch {return json(res, 503, {error: 'Fax service unavailable. Refresh history before sending again.'});}
}
