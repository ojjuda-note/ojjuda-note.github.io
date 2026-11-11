from pathlib import Path
import re
root=Path('.')
p=root/'groups/app.js'
s=p.read_text()
def replace(old,new):
 global s
 assert s.count(old)==1,(old[:100],s.count(old))
 s=s.replace(old,new)
replace(" function badge(room) { return `<span class=\"tag age-tag\">${escape(label(room))}</span>`; }", " const policy = room => modes.some(([value])=>value===room?.age_policy) ? room.age_policy : 'all';\n function badge(room = {}) { return `<span class=\"tag age-tag\" data-age-policy=\"${policy(room)}\">${escape(label(room))}</span>`; }")
replace("const mode = room.age_policy || 'all', lo", "const mode = policy(room), lo")
replace('<fieldset class="age-settings"><legend>', '<fieldset class="age-settings" data-age-policy="${mode}"><legend>')
replace('</select></label><div data-age-range', '</select></label><p class="age-preview" data-age-preview role="status" aria-live="polite" aria-atomic="true">${badge(room)}</p><div data-age-range')
replace("  const validate=()=>hi.setCustomValidity(mode.value==='range' && lo.value!=='' && hi.value!=='' && Number(lo.value)>Number(hi.value)?'최대 나이는 최소 나이 이상이어야 해요.':'');", """  const settings=mode.closest('.age-settings'), preview=settings.querySelector('[data-age-preview]');
  const paint=()=>{
   const selected=policy({age_policy:mode.value}), lower=Number(lo.value), upper=Number(hi.value);
   settings.dataset.agePolicy=selected;
   preview.innerHTML=badge({age_policy:selected,min_age:lo.value,max_age:hi.value});
   if(selected==='range' && (lo.value==='' || hi.value==='' || !Number.isInteger(lower) || !Number.isInteger(upper) || lower<14 || upper>150 || lower>upper))
    preview.querySelector('.age-tag').textContent='나이대 설정 · 나이 범위를 확인해 주세요.';
  };
  const validate=()=>{hi.setCustomValidity(mode.value==='range' && lo.value!=='' && hi.value!=='' && Number(lo.value)>Number(hi.value)?'최대 나이는 최소 나이 이상이어야 해요.':'');paint();};""")
p.write_text(s)
css=root/'groups/style.css'
css.write_text(css.read_text()+'''
/* Age policy colors: keep the written condition visible, not color alone. */
.age-tag,.age-settings{--age-ink:#4b5563;--age-bg:#f3f4f6;--age-line:#d1d5db}
.age-tag[data-age-policy="adults"],.age-settings[data-age-policy="adults"]{--age-ink:#9a3412;--age-bg:#fff7ed;--age-line:#fdba74}
.age-tag[data-age-policy="minors"],.age-settings[data-age-policy="minors"]{--age-ink:#1e40af;--age-bg:#eff6ff;--age-line:#93c5fd}
.age-tag[data-age-policy="range"],.age-settings[data-age-policy="range"]{--age-ink:#6b21a8;--age-bg:#faf5ff;--age-line:#d8b4fe}
.age-tag{display:inline-flex;align-items:center;gap:6px;max-width:100%;border:1px solid var(--age-line);background:var(--age-bg);color:var(--age-ink);font-size:12px;font-weight:700;line-height:1.5;vertical-align:middle;white-space:normal;overflow-wrap:anywhere}
.age-tag::before{content:"";width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:currentColor}
.age-settings{border-color:var(--age-line);border-left:4px solid var(--age-ink)}
.age-settings legend{color:var(--age-ink)}
.age-settings select[name="age_policy"]{background:var(--age-bg);border-color:var(--age-line);color:var(--age-ink);font-weight:700}
.age-preview{margin:10px 0 0}
.age-preview .age-tag{margin:0}
@media(forced-colors:active){.age-tag,.age-settings{border-color:CanvasText}}
''')
h=root/'groups/index.html'
htext,n=re.subn(r'/groups/(app\.js|style\.css)\?v=[^"\s]+',r'/groups/\1?v=20261111-age-colors1',h.read_text())
assert n==2,n
h.write_text(htext)
t=root/'tests/group-board-dom.test.cjs'
t.write_text(t.read_text()+r'''

test('age badges use four explicit color keys and keep readable labels with safe fallbacks',async()=>{
 const rows=[['all','전체'],['adults','성인전용'],['minors','성인불가'],['range','만 20~29세'],['adults" onclick="alert(1)','전체']].map(([age_policy,label],i)=>({id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),name:label,member_count:1,age_policy,min_age:20,max_age:29}));
 const f=fixture({respond:a=>a==='home'?{data:{rooms:[],directory:rows,invitations:[]}}:undefined});try{
  await tick();const badges=[...f.w.document.querySelectorAll('#directory .age-tag')];
  assert.deepEqual(badges.map(b=>b.dataset.agePolicy),['all','adults','minors','range','all']);
  for(let i=0;i<rows.length;i++)assert.ok(badges[i].textContent.includes(rows[i].name));
  assert.equal(f.w.document.querySelector('[onclick]'),null);
 }finally{f.dom.window.close();}
});
test('age selector previews colors and custom ages immediately without changing form behavior',async()=>{
 const f=fixture({empty:true,publicGroups:false});try{
  await tick();const d=f.w.document;d.querySelector('[data-action=create]').click();const form=d.querySelector('#room-form'),mode=form.elements.age_policy,settings=form.querySelector('.age-settings'),preview=form.querySelector('[data-age-preview]');
  assert.equal(preview.getAttribute('aria-live'),'polite');
  for(const value of ['all','adults','minors','range']){
   mode.value=value;mode.dispatchEvent(new f.w.Event('change'));
   assert.equal(settings.dataset.agePolicy,value);assert.equal(preview.querySelector('.age-tag').dataset.agePolicy,value);
   assert.equal(form.elements.min_age.disabled,value!=='range');
  }
  assert.match(preview.textContent,/20~29세/);
  const preset=form.querySelector('[data-age-preset]');preset.value='30-39';preset.dispatchEvent(new f.w.Event('change'));assert.match(preview.textContent,/30~39세/);
  form.elements.min_age.value='35';form.elements.max_age.value='45';form.elements.max_age.dispatchEvent(new f.w.Event('input'));assert.match(preview.textContent,/35~45세/);
  form.elements.max_age.value='30';form.elements.max_age.dispatchEvent(new f.w.Event('input'));assert.match(preview.textContent,/나이 범위를 확인/);assert.equal(form.elements.max_age.validity.customError,true);
  form.elements.min_age.value='';form.elements.min_age.dispatchEvent(new f.w.Event('input'));assert.match(preview.textContent,/나이 범위를 확인/);
  mode.value='all';mode.dispatchEvent(new f.w.Event('change'));assert.match(preview.textContent,/전체/);assert.equal(form.elements.max_age.validity.customError,false);
 }finally{f.dom.window.close();}
});
test('room header and management form share the same adult color key',async()=>{
 const row={id:room,name:'성인 모임',description:'',owner_id:id,member_count:1,age_policy:'adults',min_age:19,max_age:null};
 const f=fixture({hash:'#room='+room,respond:a=>a==='rooms'?{data:[row]}:undefined});try{
  await tick();const d=f.w.document;assert.equal(d.querySelector('.room-context .age-tag').dataset.agePolicy,'adults');
  d.querySelector('[data-action=manage]').click();await tick();const form=d.querySelector('#rename-form');
  assert.equal(form.querySelector('.age-settings').dataset.agePolicy,'adults');assert.equal(form.querySelector('[data-age-preview] .age-tag').dataset.agePolicy,'adults');
 }finally{f.dom.window.close();}
});
test('received and shared invitations keep age colors and admission restrictions',async()=>{
 const f=fixture({empty:true,hash:'#invite='+entry,respond:a=>{
  if(a==='home')return {data:{rooms:[],directory:[],invitations:[{id:entry,room_id:room,group_name:'청소년 모임',sender_name:'친구',age_policy:'minors',age_eligible:false}]}};
  if(a==='preview_link')return {data:{room_id:other,group_name:'30대 모임',member:false,age_policy:'range',min_age:30,max_age:39,age_eligible:false}};
 }});try{
  await tick();const d=f.w.document;assert.equal(d.querySelector('#group-invitations .age-tag').dataset.agePolicy,'minors');assert.equal(d.querySelector('[data-accept-invite]').disabled,true);
  assert.equal(d.querySelector('dialog .age-tag').dataset.agePolicy,'range');assert.match(d.querySelector('dialog .age-tag').textContent,/30~39세/);assert.equal(d.querySelector('[data-accept-link]').disabled,true);
 }finally{f.dom.window.close();}
});
test('age color palettes retain strong text contrast and do not depend on color alone',()=>{
 const css=fs.readFileSync(path.join(root,'groups/style.css'),'utf8');
 const palettes=[...css.matchAll(/--age-ink:(#[a-f0-9]{6});--age-bg:(#[a-f0-9]{6});--age-line:(#[a-f0-9]{6})/g)];assert.equal(palettes.length,4);
 const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 for(const [,ink,bg] of palettes){const a=luminance(ink),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,ink+' on '+bg);}
 assert.match(css,/\.age-tag\{[^}]*white-space:normal/);assert.match(css,/@media\(forced-colors:active\)/);
});
''')
print('Age colors and previews updated; admission rules, DB, and version files unchanged.')
