// Transport fixture only. Actual authorization is checked by the PGlite test.
module.exports=function createLedgerFixture(getOwner){
 const control={fail:false,delay:0,calls:[]},key='fixture-cloud-ledger';
 const read=()=>JSON.parse(localStorage.getItem(key)||'[]'),save=rows=>localStorage.setItem(key,JSON.stringify(rows));
 const client={control,from(table){if(table!=='life_ledger_entries')throw Error(table);let operation='select',payload,filters=[],orders=[],start=0,end=Infinity,single=false,ignore=false;
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},order(k,o){orders.push([k,o.ascending]);return q;},range(a,b){start=a;end=b;return q;},single(){single=true;return q;},update(p){operation='update';payload=p;return q;},upsert(p,o){operation='upsert';payload=Array.isArray(p)?p:[p];ignore=o.ignoreDuplicates;return q;},then(resolve,reject){return (async()=>{
   if(control.delay)await new Promise(r=>setTimeout(r,control.delay));if(control.fail){control.fail=false;return {data:null,error:{message:'offline'}};}
   control.calls.push(operation);let rows=read(),result=[];
   if(operation==='upsert'){for(const p of payload){const existing=rows.find(r=>r.user_id===p.user_id&&r.id===p.id);if(!existing){const r={...p,revision:crypto.randomUUID(),deleted_at:null};rows.push(r);result.push(r);}else if(!ignore){Object.assign(existing,p,{revision:crypto.randomUUID()});result.push(existing);}}save(rows);}
   else if(operation==='update'){for(const r of rows)if(filters.every(f=>f(r))){Object.assign(r,payload,{revision:crypto.randomUUID()});result.push(r);}save(rows);}
   else{result=rows.filter(r=>filters.every(f=>f(r))).sort((a,b)=>{for(const [k,asc]of orders){const d=String(a[k]).localeCompare(String(b[k]));if(d)return asc?d:-d;}return 0;}).slice(start,end+1);}
   return {data:single?result[0]:result,error:null};
  })().then(resolve,reject);}};return q;},async rpc(name,{p_month}){if(name!=='life_ledger_month')throw Error(name);if(control.delay)await new Promise(r=>setTimeout(r,control.delay));const rows=read().filter(r=>r.user_id===getOwner()&&!r.deleted_at&&r.date.slice(0,7)===p_month.slice(0,7));let income=0n,expense=0n,groups={};for(const r of rows){if(r.type==='income')income+=BigInt(r.amount);else{expense+=BigInt(r.amount);groups[r.category]=(groups[r.category]||0n)+BigInt(r.amount);}}return {data:{income:String(income),expense:String(expense),balance:String(income-expense),categories:Object.entries(groups).map(([category,amount])=>({category,amount:String(amount)}))},error:null};}};
 return client;
};
