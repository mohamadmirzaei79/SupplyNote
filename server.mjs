import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {answer} from './engine.mjs';
const local=name=>new URL(name,import.meta.url);
const data=JSON.parse(await readFile(process.env.ERP_SNAPSHOT||local('erp.json')));
const model=JSON.parse(await readFile(local('model.json')));
const counts=new Map(), buckets=[.0001,.001,.01,.1,1], hits=buckets.map(()=>0);
let total=0,sum=0,errors=0;
function metrics(){
 const rows=['# TYPE supplynote_answers_total counter',...Array.from(counts,([k,v])=>'supplynote_answers_total{intent="'+k+'"} '+v),'# TYPE supplynote_errors_total counter','supplynote_errors_total '+errors,'# TYPE supplynote_answer_seconds histogram'];
 buckets.forEach((b,i)=>rows.push('supplynote_answer_seconds_bucket{le="'+b+'"} '+hits[i]));
 return [...rows,'supplynote_answer_seconds_bucket{le="+Inf"} '+total,'supplynote_answer_seconds_count '+total,'supplynote_answer_seconds_sum '+sum,''].join('\n');
}
const assets={'/index.html':'text/html','/ui.mjs':'text/javascript','/engine.mjs':'text/javascript','/style.css':'text/css','/erp.json':'application/json','/model.json':'application/json'};
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 function send(code,type,value){res.writeHead(code,{'Content-Type':type+'; charset=utf-8'});res.end(value)}
 try{
 if(path==='/'&&req.method==='GET'){res.writeHead(302,{Location:'./index.html?api'});return res.end()}
 if(req.method==='GET'&&Object.hasOwn(assets,path))return send(200,assets[path],await readFile(local(path.slice(1))));
 if(req.method==='GET'&&path==='/api/snapshot')return send(200,'application/json',JSON.stringify(data));
 if(req.method==='GET'&&path==='/metrics')return send(200,'text/plain',metrics());
 if(req.method==='POST'&&path==='/api/ask'){
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){errors++;return send(413,'text/plain','Request too large')}chunks.push(chunk)}
  let body;try{body=JSON.parse(Buffer.concat(chunks))}catch{errors++;return send(400,'text/plain','Invalid JSON')}
  if(typeof body?.question!=='string'||!body.question.trim()||body.question.length>360||(body.context!=null&&!data.items.some(i=>i.sku===body.context))){errors++;return send(400,'text/plain','Invalid question or item')}
  const r=answer(data,model,body.question,body.context),sec=r.trace.totalMs/1000;counts.set(r.trace.intent,(counts.get(r.trace.intent)||0)+1);total++;sum+=sec;buckets.forEach((b,i)=>{if(sec<=b)hits[i]++});return send(200,'application/json',JSON.stringify(r));
 }send(404,'text/plain','Unknown route');
 }catch{errors++;send(500,'text/plain','Request failed')}
}).listen(Number(process.env.PORT||8080),process.env.HOST||'127.0.0.1');
