const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Single-game fixtures do not contain every private schema. Apply the shipped
// migration's exact game section; the combined fixture checks the full migration
// and its cross-game ranking trigger as one transaction.
module.exports=async function applyGameHandoff(db,kind){
 assert.ok(['tank','marble','bang','poker'].includes(kind));
 const dir=path.join(__dirname,'../supabase/migrations'),file=fs.readdirSync(dir).find(name=>name.endsWith('_fresh_multiplayer_entries.sql'));
 const source=fs.readFileSync(path.join(dir,file),'utf8');
 const block=name=>{const start=source.indexOf('do $handoff_'+name+'$'),end=source.indexOf('end;$handoff_'+name+'$;',start);assert.ok(start>=0&&end>start,'migration contains '+name);return source.slice(start,end+('end;$handoff_'+name+'$;').length);};
 const column=source.split('\n').find(line=>line.startsWith('alter table ojjuda_'+kind+'_internal.rooms '));assert.ok(column);
 await db.exec(column+'\n'+block(kind)+(kind==='bang'?'\n'+block('bang_hint'):''));
};
