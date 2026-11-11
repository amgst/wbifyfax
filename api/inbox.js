import {authorized, storage, json} from '../lib/receiving.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, {error: 'Use GET'});
  if (!authorized(req.headers.authorization, process.env.INBOX_ACCESS_TOKEN)) return json(res, 401, {error: 'Invalid inbox access token'});
  try {
    const id = new URL(req.url, 'https://localhost').searchParams.get('id');
    if (id) {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return json(res, 400, {error: 'Invalid ID'});
      const response = await storage(`/storage/v1/object/authenticated/faxes/${id}.pdf`);
      const pdf = Buffer.from(await response.arrayBuffer());
      res.writeHead(200, {'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${id}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      return res.end(pdf);
    }
    const response = await storage('/rest/v1/inbound_faxes?select=fax_id,sender,recipient,page_count,partial,received_at&order=received_at.desc&limit=100');
    return json(res, 200, {faxes: await response.json()});
  } catch {return json(res, 503, {error: 'Inbox unavailable; check storage setup'});}
}
