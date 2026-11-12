import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import telnyxWebhook from './api/webhooks/telnyx.js';
import inbox from './api/inbox.js';
import faxes from './api/faxes.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/webhooks/telnyx')return await telnyxWebhook(req,res);
 if(u.pathname==='/api/inbox')return await inbox(req,res);
 if(u.pathname==='/api/faxes')return await faxes(req,res);
 if(u.pathname.startsWith('/api/'))return (res.writeHead(404),res.end('Not found'));
 const file=u.pathname==='/'?'index.html':u.pathname==='/inbox'?'inbox.html':u.pathname.slice(1);
 if(!['index.html','app.js','styles.css','inbox.html','inbox.js'].includes(file)){res.writeHead(404);return res.end('Not found');}
 const body=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':mime[path.extname(file)],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'"});res.end(body);
 }catch(e){res.writeHead(500);res.end('Request failed');}
});server.listen(port,()=>console.log(`FaxBridge: http://localhost:${port}`));
