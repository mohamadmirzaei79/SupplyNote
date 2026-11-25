import {answer,project,dayLabel} from './engine.mjs';
const $=id=>document.getElementById(id);
const element=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text||'';if(cls)el.className=cls;return el};
const api=new URLSearchParams(location.search).has('api');
let data,model,context=null;
const requests=[];
const ms=n=>n.toFixed(2)+' ms';
let selected=0;
function inspect(index){
  selected=index;
  const r=requests[index];
  $('traceTitle').textContent='Request '+(index+1);
  const stats=element('dl');
  for(const [label,value] of [['Response',ms(r.elapsed)],['Intent routing',ms(r.routeMs)],['ERP lookup',ms(r.queryMs)],['Intent',r.intent]])stats.append(element('dt',label),element('dd',value));
  $('details').replaceChildren(element('b',r.question),stats,element('div',r.time+' · '+r.origin),element('code',r.id));
  for(const b of document.querySelectorAll('[data-request]'))b.setAttribute('aria-pressed',Number(b.dataset.request)===index);
}
function render(){
  const slice=requests.slice(-24), max=Math.max(1,...slice.map(r=>r.elapsed));
  const scale=Math.ceil(max*2)/2, plot=$('latency');plot.replaceChildren();
  for(let n=0;n<=4;n++){const tick=element('span',(scale*n/4).toFixed(scale<10?2:0),'tick');tick.style.bottom='calc('+n*25+'% - 7px)';plot.append(tick)}
  if(!slice.length){plot.append(element('div','Waiting for the first response','empty'));$('traces').replaceChildren(element('p','Completed questions and test queries will appear here.','quiet'));return}
  const bars=element('div','','bars');plot.append(bars);$('traces').replaceChildren();
  slice.forEach((r,i)=>{
    const index=requests.length-slice.length+i;
    const label='Request '+(index+1)+' · '+r.question+' · '+ms(r.elapsed);
    const bar=element('button','','point');bar.style.setProperty('--height',100*r.elapsed/scale+'%');bar.title=label;bar.setAttribute('aria-label',label);bars.append(bar);
    const row=element('button','','trace');row.append(element('span','#'+(index+1)),element('b',r.question),element('span',ms(r.elapsed)));$('traces').prepend(row);
    for(const button of [bar,row]){button.dataset.request=index;button.onclick=()=>inspect(index)}
  });
  const sorted=requests.map(r=>r.elapsed).sort((a,b)=>a-b);
  $('count').textContent=requests.length;$('latest').textContent=ms(requests.at(-1).elapsed);$('p95').textContent=ms(sorted[Math.ceil(sorted.length*.95)-1]);inspect(requests.length-1);
}
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
  draw('path',{d:path,fill:'none',stroke:'#367561','stroke-width':3});
  for(const [d,q] of points)draw('circle',{cx:x(d),cy:y(q),r:4,fill:q<0?'#a9442e':'#367561'});
  draw('text',{x:40,y:133,'font-size':11},dayLabel(data,0));draw('text',{x:405,y:133,'font-size':11,'text-anchor':'end'},dayLabel(data,end));
  $('plot').replaceChildren(svg);
}
function select(plan){
  const item=plan.item;
  $('partsku').textContent=item.sku+' / '+item.family;
  $('partfacts').replaceChildren(...[['On hand',item.qty],['Peak shortage',plan.gap],['Closing balance',plan.ending]].map(([name,value])=>{const f=element('div');f.append(element('small',name),element('strong',String(value)));return f}));
  $('schedule').replaceChildren(...plan.events.map(o=>{const b=source(o.id);b.className='orderline';b.replaceChildren(element('time',dayLabel(data,o.day)),element('span',o.id),element('b',(o.type==='purchase'?'+':'−')+o.qty));return b}));
  if(!plan.events.length)$('schedule').textContent='No open orders for this part.';
  $('askpart').onclick=()=>{location.hash='assistant';$('question').value='Show stock position for '+item.sku;requestAnimationFrame(()=>$('question').focus())};
  $('itemtitle').textContent=plan.item.name;chart(plan);$('evidence').replaceChildren(...[plan.item.bin,...plan.events.map(o=>o.id)].map(source));for(const b of $('items').children)b.setAttribute('aria-pressed',b.dataset.sku===plan.item.sku)}
async function json(url,options){const r=await fetch(url,options);if(!r.ok)throw Error('Request failed ('+r.status+')');return r.json()}
async function ask(q,origin="Chat"){
  const form=document.querySelector('#assistant form');if(form.dataset.busy||!q.trim())return;form.dataset.busy='true';
  const started=performance.now();
  try{const r=api?await json('./api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,context:origin==="Chat"?context:null})}):answer(data,model,q,origin==="Chat"?context:null);
    if(origin==="Chat")context=r.context;const box=element('div','','bubble'),refs=element('div','','sources');refs.append(...r.sources.map(source));box.append(element('h3',origin==='Chat'?q:'Test query · '+q),element('p',r.text),refs);$('history').append(box);if(origin==='Chat')$('question').value='';
    requests.push({...r.trace,question:q,origin,time:new Date().toLocaleTimeString(),elapsed:performance.now()-started});render();
  }catch(e){$('error').textContent=e.message}finally{delete form.dataset.busy}
}
try{
  [data,model]=await Promise.all([json(api?'./api/snapshot':'./erp.json'),api?null:json('./model.json')]);if(api)$('mode').textContent='ERP snapshot · API mode';
  const plans=data.items.map(i=>project(data,i)).sort((a,b)=>b.gap-a.gap||a.item.name.localeCompare(b.item.name));$('warehouse').textContent=data.warehouse+' · Planning snapshot · '+data.asOf;
  $('gap').textContent=plans.reduce((s,r)=>s+r.gap,0);$('risk').textContent=plans.filter(p=>p.gap).length+' / '+plans.length;$('inbound').textContent=new Set(data.orders.filter(o=>o.type==='purchase').map(o=>o.id.split('/')[0])).size;
  for(const p of plans){const b=element('button'),label=element('span');label.append(element('b',p.item.name),element('span',p.item.sku+' · '+p.item.family,'code'));b.append(label,element('span',p.gap?p.gap+' short':'Covered','pill'+(p.gap?' short':'')));b.dataset.sku=p.item.sku;b.onclick=()=>select(p);$('items').append(b)}select(plans[0]);
  render();
  $('probe').disabled=false;
  $('probe').onclick=async()=>{
    $('probe').disabled=true;
    try{for(const q of ['Which items will run short?','When does the servo drive arrive?','Show inventory balances','Show stock position for CT-410','List inbound shipments','What should I expedite?']){
      await ask(q,'Test query');await new Promise(resolve=>setTimeout(resolve,90));
    }}finally{$('probe').disabled=false}
  };
  for(const b of document.querySelectorAll('.prompts button'))b.onclick=()=>ask(b.textContent);
  document.querySelector('#assistant form').onsubmit=e=>{e.preventDefault();ask($('question').value)};
  function nav(){
    const ids=['overview','assistant','observability'],current=ids.includes(location.hash.slice(1))?location.hash.slice(1):'overview';
    for(const id of ids)$(id).hidden=id!==current;
    for(const a of document.querySelectorAll('nav a')){const active=a.hash==='#'+current;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}
    window.scrollTo(0,0);
  }nav();window.addEventListener('hashchange',nav);
}catch(e){$('error').textContent='Could not load the planning snapshot. '+e.message}
