(() => {
  'use strict';
  const catalog = window.OjjudaFanCatalog;
  if (!catalog?.client) return;
  const {client,sections} = catalog;
  const artist = new URLSearchParams(location.search).get('group');
  const hub = document.body.dataset.page === 'hub';
  const launch = document.getElementById('fan-manage');
  let admin = false, dialog, sessionId, check = 0;
  function el(tag, text) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent=text;
    return n;
  }
  function button(label, action) {
    const b=el('button',label); b.type='button'; b.addEventListener('click', action); return b;
  }
  let labelNumber=0;
  function labelled(text,control) {
    const label=el('label'), caption=el('span',text);
    caption.id='fan-field-'+(++labelNumber);
    control.setAttribute('aria-labelledby',caption.id);
    label.append(caption,control); return label;
  }
  function select(options) {
    const input=el('select');
    for (const [value,label] of options) input.add(new Option(label,value));
    return input;
  }
  const categories=[['girl','여돌'],['boy','남돌'],['mixed','혼성·기타']];
  function message(error) {
    if (error?.code==='40001') return '다른 사람이 이 항목을 먼저 수정했어요. 입력 내용을 복사한 뒤 새로고침해 주세요.';
    if (error?.code==='23505') return '이미 사용 중인 페이지 주소예요.';
    if (error?.code==='42501' || error?.statusCode==='403') return '이 페이지를 관리할 권한이 없어요.';
    return error instanceof Error && error.name==='FanInputError' ? error.message : '처리하지 못했어요. 연결과 권한을 확인하고 다시 시도해 주세요.';
  }
  function invalid(text) { const e=new Error(text); e.name='FanInputError'; throw e; }
  async function result(request) { const {data,error}=await request; if (error) throw error; return data; }
  function submitting(form, run) {
    form.addEventListener('submit', async event=>{
      event.preventDefault();
      const controls=[...form.elements], states=controls.map(n=>n.disabled);
      controls.forEach(n=>{n.disabled=true;});
      const status=form.querySelector('[role=status]'); status.textContent='저장 중…';
      try { await run(); } catch(e) { status.textContent=message(e); }
      finally { controls.forEach((n,i)=>{n.disabled=states[i];}); }
    });
  }
  function formEnd(form,text) {
    const status=el('p'); status.setAttribute('role','status');
    const save=el('button',text); save.type='submit'; save.className='fan-primary'; form.append(save,status);
    return status;
  }
  function picker(parent, optional) {
    const box=el('fieldset'), phrase=el('input'), choices=el('select'), note=el('small');
    phrase.type='search'; phrase.placeholder='닉네임 또는 이메일'; choices.add(new Option(optional?'나중에 지정':'회원을 선택하세요',''));
    let latest=0;
    const find=button('회원 찾기',async()=>{
      const n=++latest, term=phrase.value.trim(); if (!term) {note.textContent='검색할 회원을 입력해 주세요.'; return;}
      choices.length=1; note.textContent='검색 중…';
      try {
        const data=await result(client.rpc('admin_list_member_accounts',{p_query:term,p_filter:'all',p_offset:0,p_limit:20,p_sort:'created_at'}));
        if(n!==latest) return;
        for(const m of data.items || []) choices.add(new Option([m.nickname,m.email].filter(Boolean).join(' · ') || m.id,m.id));
        note.textContent=data.items?.length?'지정할 회원을 선택해 주세요.':'검색 결과가 없어요.';
      } catch(e) {if(n===latest) note.textContent=message(e);}
    });
    phrase.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find.click();}});
    box.append(el('legend','담당 회원'),labelled('회원 검색',phrase),find,labelled('검색 결과',choices),note); parent.append(box);
    return choices;
  }
  function openDialog(title) {
    dialog?.remove(); dialog=el('dialog'); dialog.className='fan-admin'; dialog.setAttribute('aria-labelledby','fan-admin-title');
    const header=el('header'), heading=el('h2',title); heading.id='fan-admin-title';
    header.append(heading,button('닫기',()=>dialog.close()));
    dialog.append(header); document.body.append(dialog);
    const self=dialog; self.addEventListener('close',()=>{self.remove();if(dialog===self)dialog=null; launch.focus();});
    dialog.showModal(); return dialog;
  }
  function create() {
    const panel=openDialog('아이돌 추가'), form=el('form'), name=el('input'), slug=el('input'), category=select(categories);
    name.required=true; name.maxLength=120; slug.maxLength=64; slug.pattern='[a-z0-9][a-z0-9\\-]{0,63}'; slug.placeholder='비워 두면 자동 생성';
    form.append(labelled('아이돌 이름',name),labelled('분류',category),labelled('페이지 주소 이름 (선택)',slug));
    const manager=picker(form,true); formEnd(form,'팬페이지 만들기'); panel.append(form);
    submitting(form,async()=>{
      const id=slug.value || (/^[a-z0-9][a-z0-9-]{0,63}$/.test(name.value.trim().toLowerCase()) ? name.value.trim().toLowerCase() : 'idol-'+crypto.randomUUID());
      if(catalog.entries.has(id)) invalid('이미 등록된 페이지 주소예요.');
      await result(client.rpc('create_fanpage',{p_artist:id,p_name:name.value.trim(),p_category:category.value,p_manager:manager.value || null}));
      location.assign('./artist.html?group='+encodeURIComponent(id));
    });
  }
  function assignment(panel) {
    const details=el('details'), form=el('form'), current=el('p','현재 담당 확인 중…');
    details.append(el('summary','담당자 지정'),current,form); panel.append(details);
    const member=picker(form,false), status=formEnd(form,'담당자 지정');
    async function refresh() {
      try {
        const m=await result(client.from('fanpage_managers').select('member_id,profiles(nickname)').eq('artist_id',artist).maybeSingle());
        current.textContent='현재 담당 · '+(m ? (m.profiles?.nickname || m.member_id) : '미지정');
      } catch(e){current.textContent=message(e);}
    }
    submitting(form,async()=>{
      if(!member.value) invalid('지정할 회원을 선택해 주세요.');
      await result(client.rpc('assign_fanpage_manager',{p_artist:artist,p_manager:member.value}));
      await refresh(); status.textContent='담당자를 지정했어요.';
    });
    void refresh();
  }
  const formats={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'};
  function editField(f,v) {
    const input=f.type==='category'?select(categories):el(f.type==='lines' || f.key==='concept'?'textarea':'input');
    if(f.type==='bool'){input.type='checkbox'; input.checked=!!v;}
    else {
      if(['date','color'].includes(f.type)) input.type=f.type;
      if(f.type==='youtube') input.pattern='[A-Za-z0-9_\\-]{11}';
      input.value=f.type==='lines'?(v || []).join('\n'):(v || '');
    }
    const container=el('div'); container.append(labelled(f.label,input));
    let file;
    if(['image','video'].includes(f.type)){
      input.placeholder='파일을 선택하거나 주소 입력';
      file=el('input'); file.type='file'; file.accept=Object.keys(formats).filter(type=>type.startsWith(f.type+'/')).join(',');
      container.append(labelled(f.label+' 업로드',file));
    }
    return {node:container,async read(){
      if(file?.files.length){
        const data=file.files[0], ext=formats[data.type];
        if(!ext || !data.type.startsWith(f.type+'/')) invalid('지원되는 사진이나 영상 파일을 선택해 주세요.');
        if(data.size>50*1024*1024) invalid('파일 하나당 50MB까지 올릴 수 있어요.');
        const path=artist+'/'+crypto.randomUUID()+'.'+ext;
        const bucket=client.storage.from('fanpage-media');
        await result(bucket.upload(path,data,{contentType:data.type,upsert:false}));
        input.value=bucket.getPublicUrl(path).data.publicUrl; file.value='';
      }
      const value=input.value.trim();
      if(['url','image','video'].includes(f.type) && value && !/^https:\/\//i.test(value)) invalid(f.label+'에 https 주소를 입력해 주세요.');
      if(f.type==='bool') return input.checked;
      if(f.type==='lines') return value.split('\n').map(s=>s.trim()).filter(Boolean);
      return value;
    }};
  }
  function editor() {
    const panel=openDialog('팬페이지 관리'), nav=select(Object.entries(sections).map(([k,v])=>[k,v[0]])), content=el('div');
    if(admin) assignment(panel);
    panel.append(labelled('편집할 항목',nav),content);
    function draw(){
      const key=nav.value, [label,many,definition]=sections[key], values=catalog.sectionValue(artist,key);
      const expected=catalog.entries.get(artist)?.[key] ?? null, form=el('form'), rows=el('div'), readers=new Map();
      content.replaceChildren(form); form.append(rows);
      function add(value,open){
        const row=el(many?'details':'div'), list=definition.map(f=>editField(f,value[f.key]));
        if(many){
          row.open=open; row.append(el('summary',value.title || value.label || value.name || label+' 항목'));
          row.append(button('이 항목 빼기',()=>{readers.delete(row);row.remove();}));
        }
        list.forEach(f=>row.append(f.node)); rows.append(row);
        readers.set(row,async()=>{
          const obj={};
          for(let i=0;i<definition.length;i++) obj[definition[i].key]=await list[i].read();
          if(many && !obj[definition[0].key]) invalid(definition[0].label+'을 입력해 주세요.');
          if(key==='videos' && !obj.file && !obj.id) invalid('영상 파일이나 YouTube 영상 ID를 입력해 주세요.');
          if(key==='photos' && !obj.image) invalid('사진 파일이나 주소를 입력해 주세요.');
          if(key==='appearances' && !obj.date) invalid('시작일을 입력해 주세요.');
          if(key==='appearances' && obj.endDate && obj.endDate<obj.date) invalid('종료일은 시작일 이후로 정해 주세요.');
          if(['links','music','merch','appearances','schedules','news','campaigns','awards','records','sources'].includes(key) && !(obj.href || obj.url)) invalid('자료 주소를 입력해 주세요.');
          if(key==='identity' && (!obj.korean || !obj.name)) invalid('한글 이름과 표시 이름을 입력해 주세요.');
          return obj;
        });
      }
      for(const row of (many?values:[values])) add(row,false);
      if(many) form.append(button(label+' 항목 추가',()=>add({},true)));
      formEnd(form,'변경 사항 저장');
      submitting(form,async()=>{
        nav.disabled=true;
        try {
          const items=[]; for(const read of readers.values()) items.push(await read());
          let value=items;
          if(!many){
            value={...expected};
            for(const [field,next] of Object.entries(items[0])){
              if(next!==values[field]) value[field]=next;
            }
          }
          await result(client.rpc('save_fanpage_section',{p_artist:artist,p_section:key,p_expected:expected,p_value:value}));
          location.reload();
        } finally { nav.disabled=false; }
      });
    }
    nav.addEventListener('change',draw); draw();
  }
  async function access(id) {
    const run=++check; sessionId=id; admin=false; launch.hidden=true; dialog?.close();
    await catalog.ready;
    if(!id || !catalog.available || run!==check) return;
    try {
      const isAdmin=await result(client.rpc('is_admin'));
      const allowed=hub ? isAdmin : catalog.entries.has(artist) && await result(client.rpc('can_edit_fanpage',{p_artist:artist}));
      if(run===check){admin=!!isAdmin; launch.hidden=!allowed;}
    } catch { /* Public reading remains available. */ }
  }
  launch.addEventListener('click',()=>hub?create():editor());
  client.auth.onAuthStateChange((_event,session)=>{
    const id=session?.user?.id || null;
    if(id!==sessionId) setTimeout(()=>{if(id!==sessionId) void access(id);},0);
  });
})();
