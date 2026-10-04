// Transport-only fixture. Real RLS is covered separately against Postgres.
module.exports=function createScheduleFixture(getOwner){
 const control={fail:false,delay:0,lost:false,calls:[]},key='fixture-cloud-schedule';
 const read=()=>JSON.parse(localStorage.getItem(key)||'[]'),write=rows=>localStorage.setItem(key,JSON.stringify(rows));
 function query(operation='select',payload=null,month=null){let filters=[],from=0,to=Infinity,single=false;
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},range(a,b){from=a;to=b;return q;},single(){single=true;return q;},update(p){operation='update';payload=p;return q;},upsert(p){operation='upsert';payload=p;return q;},then(resolve,reject){const owner=getOwner(),delay=control.delay;return (async()=>{
   if(delay)await new Promise(r=>setTimeout(r,delay));if(control.fail){control.fail=false;return {data:null,error:{message:'offline'}};}control.calls.push(operation);let rows=read(),result=[];
   if(operation==='upsert'){const found=rows.find(r=>r.user_id===owner&&r.id===payload.id);if(!found){const row={...payload,revision:crypto.randomUUID(),deleted_at:null};rows.push(row);result.push(row);}write(rows);}
   else if(operation==='update'){for(const row of rows)if(row.user_id===owner&&filters.every(f=>f(row))){Object.assign(row,payload,{revision:crypto.randomUUID()});result.push(row);}write(rows);}
   else result=rows.filter(r=>r.user_id===owner&&filters.every(f=>f(r))&&(!month||!r.deleted_at&&r.date.slice(0,7)<=month.slice(0,7)&&(r.repeat==='none'?r.date.slice(0,7)===month.slice(0,7):!r.repeat_until||r.repeat_until>=month))).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(from,to+1);
   if(control.lost&&operation==='upsert'){control.lost=false;return {error:{message:'lost response'},data:null};}
   return {data:single?result[0]:result,error:null};
  })().then(resolve,reject);}};return q;
 }
 return {control,from(table){if(table!=='life_schedule_events')throw Error(table);return query();},rpc(name,{p_month}){if(name!=='life_schedule_month')throw Error(name);return query('month',null,p_month);}};
};
