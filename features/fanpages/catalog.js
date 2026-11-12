/* The packaged catalogue remains the baseline. A manager saves one section at a time. */
(() => {
  'use strict';
  const field = (key, label, type = 'text') => ({ key, label, type });
  const title = field('title', '제목'), href = field('href', '출처 주소', 'url');
  const sub = field('sub', '설명'), date = field('date', '날짜');
  const credit = field('credit', '촬영자·출처');
  const history = [field('year','시기'), title, field('detail','내용'), href];
  const sections = {
    identity: ['기본 정보', false, [
      field('korean','한글 이름'), field('name','표시 이름'), field('category','분류','category'),
      field('fan','팬덤'), field('agency','기획사'), field('status','대표 문구'),
      field('official','공식 홈페이지','url'), field('image','대표 사진','image'),
      field('imageCredit','대표 사진 출처명'), field('imageLink','대표 사진 출처 주소','url'),
      field('shape','상징'), field('accent','강조색','color'), field('light','밝은색','color'),
      field('dark','글자색','color'), field('bg','배경색','color'), field('night','어두운 테마','bool')
    ]],
    profile: ['그룹 소개', false, [field('concept','소개'), field('debut','데뷔일'),field('debutWork','데뷔곡·음반'),field('agency','기획사'),field('checkedAt','자료 확인일'),field('heightSource','키 참고 주소','url')]],
    members: ['멤버', true, [field('name','이름'), field('note','역할·소개'),field('birthday','생일'),field('height','키 (cm)'),field('bloodType','혈액형'),field('mbti','MBTI'),field('hometown','고향·출신'),field('school','학력'),field('source','자료 주소','url'),field('heightSource','키 참고 주소','url')]],
    photos: ['사진', true, [field('label','사진 제목'), field('image','사진','image'),field('full','확대 사진','image'),field('meta','연도·분류'), credit, href,field('sourceLabel','출처 버튼 이름'),field('license','이용 조건'),field('licenseUrl','이용 조건 주소','url'),field('optimized','크기 조정된 사진','bool')]],
    videos: ['영상', true, [title,field('kind','분류'),field('source','채널·출처'),field('id','YouTube 영상 ID','youtube'),field('file','영상 파일','video')]],
    music: ['앨범·노래', true, [title,field('type','음반 종류'),date,field('songs','수록곡 (한 줄에 한 곡)','lines'),href]],
    merch: ['굿즈', true, [title,sub,href]],
    appearances: ['출연 예정', true, [title,field('date','시작일','date'),field('endDate','종료일','date'),sub,href]],
    schedules: ['공식 일정', true, [title,sub,href]],
    news: ['소식', true, [title,date,field('tag','분류'),href]],
    campaigns: ['콜라보·광고', true, [title,field('kind','분류'),date,sub,href]],
    links: ['공식 채널', true, [field('label','채널 이름'),field('url','주소','url'),field('icon','아이콘')]],
    awards: ['수상', true, history], records: ['기록', true, history],
    sources: ['소개 자료 출처', true, [field('label','출처명'),href]]
  };
  const seedArtists = new Map(window.OJJUDA_FAN_ARTISTS.map(a => [a.id,a]));
  const seedProfiles = window.OJJUDA_FAN_PROFILES || {}, seedVideos = window.OJJUDA_FAN_VIDEOS || {};
  const entries = new Map();
  const raw = new Map();
  const defaults = { name:'', korean:'', fan:'', agency:'', status:'', shape:'✳', category:'girl', accent:'#7956a7', light:'#eee1fa', dark:'#48325f', bg:'#faf7ff', night:false };
  function address(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:') ? url.href : '';
    } catch { return ''; }
  }
  function clean(value, type) {
    if (type === 'lines') return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
    if (type === 'bool') return value === true;
    const str = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    if (['image','video','url'].includes(type)) return address(str);
    if (type === 'color') return /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(str) ? str : '';
    if (type === 'youtube') return /^[\w-]{11}$/.test(str) ? str : '';
    if (type === 'category') return ['girl','boy','mixed'].includes(str) ? str : 'girl';
    return str;
  }
  function fields(key, item) {
    return Object.fromEntries(sections[key][2].map(f => [f.key,clean(item?.[f.key],f.type)]));
  }
  function sectionValue(id, key) {
    const a = seedArtists.get(id) || {}, p = Object.hasOwn(seedProfiles,id) ? seedProfiles[id] : {};
    const edits = entries.get(id) || {};
    if (key === 'identity') {
      const base = {...defaults, name:id,korean:id,...a, category:a.category || (id === 'a2osoul' ? 'boy' : 'girl'), ...a.theme};
      return fields(key,{...base,...edits.identity});
    }
    if (key === 'profile') return fields(key,{...p,...edits.profile});
    let base = a[key];
    if (key === 'members') base = p.members || a.members?.map(name=>({name}));
    if (['awards','records','sources'].includes(key)) base = p[key];
    if (key === 'videos') base = seedVideos[id];
    const value = Array.isArray(edits[key]) ? edits[key] : base;
    return Array.isArray(value) ? value.filter(x=>x && typeof x === 'object').map(x=>fields(key,x)) : [];
  }
  function escape(value) {
    if (Array.isArray(value)) return value.map(escape);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,escape(v)]));
    if (typeof value !== 'string') return value;
    return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }
  function prepare() {
    const artists = [], profiles = Object.create(null), videos = Object.create(null);
    for (const id of new Set([...seedArtists.keys(), ...entries.keys()])) {
      const original = seedArtists.get(id);
      const identity = sectionValue(id,'identity');
      for (const key of ['accent','light','dark','bg','shape','name','korean']) identity[key] ||= defaults[key] || id;
      const edits = entries.get(id) || {};
      const customTheme = !original || original.theme || ['bg','night'].some(k=>Object.hasOwn(edits.identity || {},k));
      const a = {...identity,id,theme:customTheme ? {bg:identity.bg,night:identity.night} : null,basicProfile:original?.basicProfile};
      for (const key of ['links','photos','music','merch','appearances','schedules','news','campaigns']) a[key]=sectionValue(id,key);
      const p = sectionValue(id,'profile');
      for (const key of ['members','sources','awards','records']) p[key]=sectionValue(id,key);
      a.members = Object.hasOwn(edits,'members') ? p.members.map(m=>m.name) : original?.members || p.members.map(m=>m.name);
      p.basic = seedProfiles[id]?.basic;
      p.expanded = seedProfiles[id]?.expanded || ['members','awards','records','profile','sources'].some(k=>Object.hasOwn(edits,k));
      const v = sectionValue(id,'videos').filter(item=>item.file || item.id);
      raw.set(id,{artist:a,profile:p,videos:v});
      artists.push(escape(a)); profiles[id]=escape(p); videos[id]=escape(v);
    }
    window.OJJUDA_FAN_ARTISTS=artists; window.OJJUDA_FAN_PROFILES=profiles; window.OJJUDA_FAN_VIDEOS=videos;
  }
  const client = window.ojjudaSupabase || (window.supabase && window.OJJUDA_CONFIG
    ? window.supabase.createClient(window.OJJUDA_CONFIG.supabaseUrl,window.OJJUDA_CONFIG.supabaseKey) : null);
  if (client) window.ojjudaSupabase=client;
  async function read() {
    if (!client) throw Error('연결할 수 없어요.');
    const group = new URLSearchParams(location.search).get('group');
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),8000);
    try {
      for (let start=0;;start+=500) {
        const {data,error} = await client.from('fanpage_pages').select('artist_id,identity:sections->identity').order('artist_id').range(start,start+499).abortSignal(controller.signal);
        if (error) throw error;
        for (const row of data) entries.set(row.artist_id,row.identity ? {identity:row.identity} : {});
        if (data.length < 500) break;
      }
      if (entries.has(group)) {
        const {data,error} = await client.from('fanpage_pages').select('sections').eq('artist_id',group).single().abortSignal(controller.signal);
        if (error) throw error;
        entries.set(group,data.sections);
      }
      prepare();
    } finally { clearTimeout(timer); }
  }
  const catalog = {client, sections, entries, raw, sectionValue, address, ready:null, available:false};
  window.OjjudaFanCatalog=catalog;
  catalog.ready=read().then(()=>{catalog.available=true;}).catch(()=>{
    const status=document.getElementById('catalog-status');
    if (status) { status.hidden=false; status.textContent='최신 자료를 불러오지 못했어요. 새로고침해 주세요.'; }
  });
})();
