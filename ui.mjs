import {answer,project,dayLabel} from './engine.mjs';
const $=id=>document.getElementById(id);
const element=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text||'';if(cls)el.className=cls;return el};
const api=new URLSearchParams(location.search).has('api');
let data,model,context=null;
const timings=[];
function source(id){
  const b=element('button',id,'doclink');
  b.onclick=()=>{const record=data.items.find(i=>i.bin===id)||data.orders.find(o=>o.id===id);
    $('docname').textContent=id;$('fields').replaceChildren();
    for(const [key,value] of Object.entries(record))$('fields').append(element('dt',key==='day'?'Due date':key),element('dd',String(key==='day'?dayLabel(data,value):value)));
    $('doc').showModal();
  };return b;
}
function chart(plan){
  const points=[[0,plan.item.qty],...plan.events.map(o=>[o.day,o.balance])];
  const end=Math.max(1,...points.map(p=>p[0]))+1, high=Math.max(1,...points.map(p=>p[1])),low=Math.min(0,...points.map(p=>p[1]));
  const x=d=>40+365*d/end,y=q=>112-90*(q-low)/(high-low);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 420 140');svg.setAttribute('role','img');svg.setAttribute('aria-label',plan.item.name+' projected stock by day: '+points.map(([d,q])=>dayLabel(data,d)+' '+q).join(', '));
  function draw(tag,attrs,text){const n=document.createElementNS(svg.namespaceURI,tag);for(const [key,val] of Object.entries(attrs))n.setAttribute(key,val);n.textContent=text||'';svg.append(n)}
  for(const q of new Set([high,0,low])){draw('line',{x1:40,x2:405,y1:y(q),y2:y(q),stroke:q?'#e9e3ec':'#bba6b8','stroke-dasharray':'4 4'});draw('text',{x:3,y:y(q)+4,fill:'#695c72','font-size':10},String(q))}
  let path='M40 '+y(points[0][1]);for(const [d,q] of points.slice(1))path+=' H'+x(d)+' V'+y(q);path+=' H405';
  draw('path',{d:path,fill:'none',stroke:'#77508a','stroke-width':3});
  for(const [d,q] of points)draw('circle',{cx:x(d),cy:y(q),r:4,fill:q<0?'#bc4270':'#77508a'});
  draw('text',{x:40,y:133,'font-size':11},dayLabel(data,0));draw('text',{x:405,y:133,'font-size':11,'text-anchor':'end'},dayLabel(data,end));
  $('plot').replaceChildren(svg);
}
function select(plan){$('itemtitle').textContent=plan.item.name;chart(plan);$('evidence').replaceChildren(...[plan.item.bin,...plan.events.map(o=>o.id)].map(source));for(const b of $('items').children)b.setAttribute('aria-pressed',b.dataset.sku===plan.item.sku)}
async function json(url,options){const r=await fetch(url,options);if(!r.ok)throw Error('Request failed ('+r.status+')');return r.json()}
async function ask(q){
  const form=document.querySelector('#assistant form');if(form.dataset.busy||!q.trim())return;form.dataset.busy='true';
  try{const r=api?await json('./api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,context})}):answer(data,model,q,context);
    context=r.context;const box=element('div','','bubble'),refs=element('div','','sources');refs.append(...r.sources.map(source));box.append(element('h3',q),element('p',r.text),refs);$('history').append(box);$('question').value='';
    const t=r.trace;timings.push(t.totalMs);const sorted=[...timings].sort((a,b)=>a-b);
    $('count').textContent=timings.length+' requests · p95 '+sorted[Math.ceil(sorted.length*.95)-1].toFixed(2)+' ms';if(timings.length===1)$('traces').replaceChildren();
    const tr=element('div','','trace');tr.append(element('b',t.intent),element('span','Route '+t.routeMs.toFixed(2)+' ms'),element('span','ERP query '+t.queryMs.toFixed(2)+' ms'),element('span','Trace '+t.id));$('traces').prepend(tr);
  }catch(e){$('error').textContent=e.message}finally{delete form.dataset.busy}
}
try{
  [data,model]=await Promise.all([json(api?'./api/snapshot':'./erp.json'),api?null:json('./model.json')]);if(api)$('mode').textContent='ERP snapshot · API mode';
  const plans=data.items.map(i=>project(data,i));$('warehouse').textContent=data.warehouse+' · Planning snapshot · '+data.asOf;
  $('gap').textContent=plans.reduce((s,r)=>s+r.gap,0);$('risk').textContent=plans.filter(p=>p.gap).length+' / '+plans.length;$('inbound').textContent=new Set(data.orders.filter(o=>o.type==='purchase').map(o=>o.id.split('/')[0])).size;
  for(const p of plans){const b=element('button'),label=element('span');label.append(element('b',p.item.name),element('span',p.item.sku+' · '+p.item.family,'code'));b.append(label,element('span',p.gap?p.gap+' short':'Covered','pill'+(p.gap?' short':'')));b.dataset.sku=p.item.sku;b.onclick=()=>select(p);$('items').append(b)}select(plans[0]);
  $('traces').append(element('p','Ask a question to inspect its classification and ERP lookup timings.','quiet'));
  for(const b of document.querySelectorAll('.prompts button'))b.onclick=()=>ask(b.textContent);
  document.querySelector('#assistant form').onsubmit=e=>{e.preventDefault();ask($('question').value)};
  function nav(){for(const a of document.querySelectorAll('nav a'))a.classList.toggle('active',a.hash===(location.hash||'#overview'))}nav();window.addEventListener('hashchange',nav);
}catch(e){$('error').textContent='Could not load the planning snapshot. '+e.message}
