const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../note/preview.js'),'utf8');
const start=source.indexOf('const FREE_FONT_CODES'),end=source.indexOf('\n}\n',start)+3;
function fixture(font='heart') {
 const calls=[],prompts=[],select={value:font,selectedOptions:[{textContent:'하트 손글씨 · 싱글데이 · 10쭈 / 1개월'}]};
 const state={session:{user:{id:'a'}},identityEpoch:1,composerRun:1,backdrop:{hidden:false},editingId:null,
  cache:new Map(),busy:false,composeMessage:{textContent:''},Date,crypto:require('node:crypto'),
  $:()=>select,setComposerInputs(){},updateComposer(){},loadWorldBalance(){},
  window:{confirm(text){prompts.push(text);return state.confirm;}},confirm:true,
  licenses:[],result:{expires_at:new Date(Date.now()+86400000).toISOString()},
  async noteRpc(name,args){calls.push({name,args});return name==='list_my_card_font_entitlements'?state.licenses:state.result;}};
 vm.createContext(state);vm.runInContext(source.slice(start,end)+'\nthis.ensure=ensureComposeFont;',state);
 return {state,calls,prompts,select};
}
(async()=>{
 for(const font of ['default','round','serif']){const f=fixture(font);assert.equal(await f.state.ensure('a',1,1),true);assert.equal(f.calls.length,0);}
 const canceled=fixture();canceled.state.confirm=false;
 assert.equal(await canceled.state.ensure('a',1,1),false);assert.equal(canceled.calls.length,1);assert.equal(canceled.state.busy,false);
 const owned=fixture();owned.state.licenses=[{font:'heart',expires_at:new Date(Date.now()+86400000).toISOString()}];
 assert.equal(await owned.state.ensure('a',1,1),true);assert.equal(owned.prompts.length,0);assert.equal(owned.calls.length,1);
 const bought=fixture();assert.equal(await bought.state.ensure('a',1,1),true);assert.match(bought.prompts[0],/10쭈.*1개월/);assert.equal(bought.calls[1].name,'purchase_card_font');
 const retry=fixture();let first=true;
 retry.state.noteRpc=async(name,args)=>{retry.calls.push({name,args});if(name==='list_my_card_font_entitlements')return [];if(first){first=false;throw Error('network');}return retry.state.result;};
 assert.equal(await retry.state.ensure('a',1,1),false);assert.equal(await retry.state.ensure('a',1,1),true);
 assert.equal(retry.calls[1].args.p_request_id,retry.calls[3].args.p_request_id);
 const changed=fixture();changed.state.noteRpc=async()=>{changed.state.session={user:{id:'b'}};return [];};
 assert.equal(await changed.state.ensure('a',1,1),false);assert.equal(changed.prompts.length,0);
 const html=fs.readFileSync(require('node:path').join(__dirname,'../park/index.html'),'utf8');
 assert.equal((html.match(/<optgroup label="기본 무료 글꼴">([\s\S]*?)<\/optgroup>/)[1].match(/<option /g)||[]).length,3);
 console.log('PASS monthly font client: free fonts, cancel, owned reuse, purchase consent, stable retry request and identity switch');
})().catch(error=>{console.error(error);process.exitCode=1;});
