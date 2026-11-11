import {authorized, json} from '../lib/receiving.js';
import {firebaseStore} from '../lib/firebase.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, {error: 'Use GET'});
  if (!authorized(req.headers.authorization, process.env.INBOX_ACCESS_TOKEN)) return json(res, 401, {error: 'Invalid inbox access token'});
  try {
    const store = await firebaseStore();
    const id = new URL(req.url, 'https://localhost').searchParams.get('id');
    if (id) {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return json(res, 400, {error: 'Invalid ID'});
      const pdf = await store.download(id);
      res.writeHead(200, {'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${id}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      return res.end(pdf);
    }
    return json(res, 200, {faxes: await store.list()});
  } catch {return json(res, 503, {error: 'Inbox unavailable; check storage setup'});}
}
