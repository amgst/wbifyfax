import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const dbPath=path.join(root,'data','faxes.json');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
let jobs=[];
try {jobs=JSON.parse(await readFile(dbPath,'utf8'));}catch{}
const save=async()=>{await mkdir(path.dirname(dbPath),{recursive:true});await writeFile(dbPath,JSON.stringify(jobs,null,2));};
const send=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
const parse=async req=>{let data='';for await(const chunk of req){data+=chunk;if(data.length>15000000)throw Error('Upload too large (10 MB maximum)');}return JSON.parse(data);};
const server=http.createServer(async(req,res)=>{
try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/faxes'&&req.method==='GET')return send(res,200,{mode:'demo',jobs:jobs.slice().reverse().map(({filename,...job})=>job)});
 if(u.pathname==='/api/faxes'&&req.method==='POST'){
   const d=await parse(req);const number=String(d.number||'').trim();const filename=String(d.filename||'').slice(0,150);
   if(!/^\+[1-9]\d{7,14}$/.test(number))return send(res,400,{error:'Use an international fax number, e.g. +442071234567'});
   if(!filename.toLowerCase().endsWith('.pdf')||!String(d.file||'').startsWith('data:application/pdf;base64,'))return send(res,400,{error:'Please upload a PDF'});
   const bytes=Buffer.from(String(d.file).split(',')[1]||'','base64');
   if(bytes.length<8||bytes.length>10*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')return send(res,400,{error:'Invalid PDF or larger than 10 MB'});
   const job={id:crypto.randomUUID(),number,filename,cover:String(d.cover||'').slice(0,500),status:'demo only',createdAt:new Date().toISOString(),size:bytes.length};
   // Intentionally do not store confidential uploaded PDF content in demo mode.
   jobs.push(job);await save();return send(res,201,{job,notice:'Demo saved. No actual fax was transmitted.'});
 }
 if(u.pathname.startsWith('/api/'))return send(res,404,{error:'Not found'});
 const file=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(!['index.html','app.js','styles.css'].includes(file)){res.writeHead(404);return res.end('Not found');}
 const body=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':mime[path.extname(file)],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'"});res.end(body);
 }catch(e){send(res,400,{error:e.message||'Request failed'});}
});server.listen(port,()=>console.log(`FaxBridge demo: http://localhost:${port}`));
