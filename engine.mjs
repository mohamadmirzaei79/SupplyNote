export function dayLabel(data, day) {
  const d=new Date(data.asOf+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+day);
  return d.toLocaleDateString('en-GB',{month:'short',day:'numeric',timeZone:'UTC'});
}

export function project(data,item) {
  const orders=data.orders.filter(o=>o.sku===item.sku).sort((a,b)=>a.day-b.day || (a.type===b.type?a.id.localeCompare(b.id):a.type==='purchase'?-1:1));
  let balance=item.qty, low=balance, breach=null;
  const events=orders.map(order=>{
    balance+=(order.type==='purchase'?1:-1)*order.qty;
    if(balance<0&&!breach) breach=order;
    low=Math.min(low,balance);
    return {...order,balance};
  });
  return {item,events,low,breach,ending:balance,gap:Math.max(0,-low)};
}

export function classify(model,question) {
  const tokens=question.toLowerCase().match(/[a-z]+/g)||[];
  const ids=tokens.filter(t=>Object.hasOwn(model.vocabulary,t)).map(t=>model.vocabulary[t]);
  const scores=model.prior.map((prior,k)=>ids.reduce((s,i)=>s+model.weights[k][i],prior));
  const top=Math.max(...scores),p=1/scores.reduce((s,n)=>s+Math.exp(n-top),0);
  return {intent:ids.length&&p>=0.55?model.labels[scores.indexOf(top)]:'unknown',confidence:p};
}

export function answer(data,model,question,context=null) {
  const start=performance.now(), query=question.toLowerCase();
  const match=data.items.find(i=>query.includes(i.sku.toLowerCase())||query.includes(i.name.toLowerCase()));
  const mentioned=data.orders.find(o=>query.includes(o.id.toLowerCase()));
  const key=match?.sku||mentioned?.sku||(/\b(it|that|this|its|those)\b/.test(query)?context:null);
  const items=key?data.items.filter(i=>i.sku===key):data.items;
  const {intent,confidence}=classify(model,question), classified=performance.now();
  const plans=items.map(i=>project(data,i)),sources=new Set();
  const parts=[];
  if(intent==='risk'){
    const risks=plans.filter(r=>r.gap>0).sort((a,b)=>b.gap-a.gap);
    for(const r of risks){
      parts.push(r.item.name+' ('+r.item.sku+') first falls below zero on '+dayLabel(data,r.breach.day)+' at '+r.breach.id+'. Peak shortage: '+r.gap+' units.');
    }
    if(!risks.length)parts.push('Supply covers the recorded demand for the selected item(s) in this snapshot.');
    for(const r of risks.length?risks:plans){sources.add(r.item.bin);r.events.forEach(o=>sources.add(o.id));}
  }else if(intent==='inbound'){
    for(const r of plans){const po=r.events.find(e=>e.type==='purchase');
      if(po){parts.push(r.item.name+': '+po.qty+' units from '+po.party+' on '+dayLabel(data,po.day)+' ('+po.id+').');sources.add(po.id);}
      else{parts.push(r.item.name+': no open purchase order in this snapshot.');sources.add(r.item.bin);}
    }
  }else if(intent==='balance'){
    for(const r of plans){
      parts.push(r.item.name+': '+r.item.qty+' units on hand, '+r.ending+' projected after all recorded orders.');
      sources.add(r.item.bin);r.events.forEach(o=>sources.add(o.id));
    }
  }else parts.push('I can check stock shortages, inbound purchase orders and inventory balances. Include an item name or SKU to narrow the answer.');
  const end=performance.now();
  return {text:parts.join('\n\n'),sources:[...sources],context:key||(intent==='risk'?plans.filter(r=>r.gap).sort((a,b)=>b.gap-a.gap)[0]?.item.sku:null)||null,trace:{id:crypto.randomUUID(),intent,confidence,routeMs:classified-start,queryMs:end-classified,totalMs:end-start}};
}
