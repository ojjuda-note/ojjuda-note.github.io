(function (global) {
  'use strict';
  const STORE = 'ojjuda.world.admin-favorites-v1';
  const GROUPS = Object.freeze([
    { id:'status', label:'운영 현황', items:[
      ['account','overview','운영 요약'],['account','visitors','방문·이용 통계'],
      ['operations','errors','오류 현황'] ] },
    { id:'members', label:'회원·ZU', items:[
      ['account','users','가입자 관리'],['account','suspended','정지 계정'],
      ['trash','trash-accounts','탈퇴 계정'],['account','referrals','추천인'],
      ['payment','users','사용자별 ZU'],['payment','settings','무료 충전 설정'] ] },
    { id:'content', label:'콘텐츠 관리', items:[
      ['content','cards','카드'],['content','messages','쪽지 관리'],
      ['content','groups','그룹 관리'],['content','photo-stages','포토땅따먹기'],
      ['content','map','위치 지도'],['library','assets','자료 모아보기'] ] },
    { id:'safety', label:'신고·안전', items:[
      ['support','reports','신고 처리'],['support','feedback','문의·의견'],
      ['content','risk','위험 신호'],['support','note-users','카드 이용 제한'],
      ['operations','spam','도배 방지'],['operations','words','금칙어'] ] },
    { id:'system', label:'운영·보관', items:[
      ['operations','notice','공지 관리'],['operations','connections','운영 연결'],
      ['operations','activity','작업 기록'],['trash','trash-all','휴지통 전체'],
      ['trash','trash-cards','삭제한 카드'],['trash','trash-messages','삭제한 쪽지'],
      ['trash','trash-other','기타 보관'] ] }
  ]);
  const key = (area, tab) => `${area}:${tab}`;
  const allItems = GROUPS.flatMap(group => group.items.map(([area,tab,label])=>({area,tab,label,group:group.id})));
  const known = new Set(allItems.map(item=>key(item.area,item.tab)));
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let pins = [];
  try {
    const saved = JSON.parse(global.localStorage.getItem(STORE) || '[]');
    if (Array.isArray(saved)) pins = [...new Set(saved.filter(item=>typeof item==='string'&&known.has(item)))].slice(0,6);
  } catch {}
  let query = '', lastLocation = '';

  function activeGroup(area,tab) {
    return allItems.find(item=>item.area===area&&item.tab===tab)?.group || 'status';
  }
  function badgeNumber(summary,area,tab) {
    const field = ({'support:reports':'reports_open','support:feedback':'feedback_open','operations:errors':'errors_24h'})[key(area,tab)];
    const value = field ? Number(summary?.[field]) : 0;
    return Number.isSafeInteger(value)&&value>0 ? value : 0;
  }
  function itemHtml(item,area,tab,summary,groupLabel='') {
    const current=item.area===area&&item.tab===tab;
    const pinned=pins.includes(key(item.area,item.tab));
    const count=badgeNumber(summary,item.area,item.tab);
    const search=(item.label+' '+groupLabel).toLocaleLowerCase('ko-KR');
    const hidden=query&&!search.includes(query)?' hidden':'';
    return `<div class="adm-menu-item" data-admin-nav-item data-search="${escape(search)}"${hidden}>
      <button type="button" class="adm-menu-link${current?' is-current':''}" data-act="adm-open" data-area="${item.area}" data-v="${item.tab}"${current?' aria-current="page"':''}><span>${escape(item.label)}</span><span class="adm-menu-count" data-admin-count="${item.area}:${item.tab}"${count?'':' hidden'}>${count?count.toLocaleString('ko-KR'):''}</span></button>
      <button type="button" class="adm-menu-pin${pinned?' is-pinned':''}" data-act="adm-pin" data-area="${item.area}" data-v="${item.tab}" aria-label="${escape(item.label)} 즐겨찾기 ${pinned?'해제':'추가'}" aria-pressed="${pinned}" title="즐겨찾기 ${pinned?'해제':'추가'}">${pinned?'★':'☆'}</button>
    </div>`;
  }
  function render({area='account',tab='overview',summary=null}={}) {
    const locationKey=key(area,tab);
    if(lastLocation&&lastLocation!==locationKey)query='';
    lastLocation=locationKey;
    const selected=activeGroup(area,tab);
    const selectedLabel=GROUPS.find(group=>group.id===selected)?.label || '운영 현황';
    const favorites=pins.map(id=>allItems.find(item=>key(item.area,item.tab)===id)).filter(Boolean);
    const matchedFavorites=favorites.filter(item=>!query||(item.label+' '+GROUPS.find(group=>group.id===item.group)?.label).toLocaleLowerCase('ko-KR').includes(query));
    const favoriteHtml=favorites.map(item=>itemHtml(item,area,tab,summary,GROUPS.find(group=>group.id===item.group)?.label)).join('');
    const groupsHtml=GROUPS.map(group=>{
      const extra=group.id==='members'
        ? `<div class="adm-menu-item" data-admin-nav-item data-search="상품권 등록 회원·zu"${query&&!('상품권 등록 회원·zu').includes(query)?' hidden':''}><a class="adm-menu-link" href="/admin/rewards.html">상품권 등록</a></div>` : '';
      const matched=group.items.some(([, ,label])=>!query||(label+' '+group.label).toLocaleLowerCase('ko-KR').includes(query))
        ||(group.id==='members'&&(!query||('상품권 등록 회원·zu').includes(query)));
      const items=group.items.map(([targetArea,targetTab,label])=>itemHtml({area:targetArea,tab:targetTab,label},area,tab,summary,group.label)).join('')+extra;
      return `<details class="adm-menu-group" data-group="${group.id}" data-active="${selected===group.id}"${(query&&matched)||(!query&&selected===group.id)?' open':''}${query&&!matched?' hidden':''}><summary>${escape(group.label)}<span class="adm-menu-chevron" aria-hidden="true">⌄</span></summary><div class="adm-menu-group-items">${items}</div></details>`;
    }).join('');
    return `<aside class="adm-navigation" aria-label="관리자 메뉴" data-area="${escape(area)}" data-tab="${escape(tab)}">
      <button type="button" class="adm-menu-toggle" data-act="adm-nav-toggle" aria-expanded="false" aria-controls="adm-nav-body"><span>☰ 관리 메뉴</span><strong>${escape(selectedLabel)}</strong><span aria-hidden="true">⌄</span></button>
      <div class="adm-nav-body" id="adm-nav-body">
        <label class="adm-menu-search-label" for="adm-menu-search">기능 찾기</label>
        <input class="adm-menu-search" id="adm-menu-search" data-admin-search type="search" autocomplete="off" placeholder="관리 기능 검색" value="${escape(query)}">
        <section class="adm-menu-favorites" data-admin-pins${matchedFavorites.length?'':' hidden'}><h3>★ 즐겨찾기 <small>최대 6개</small></h3>${favoriteHtml}</section>
        <div class="adm-menu-groups">${groupsHtml}</div>
        <div class="adm-menu-external"><a href="https://yeoul-spring-reader.mj830417686850.chatgpt.site/">원고실</a></div>
      </div>
    </aside><!--adm-main-->`;
  }
  function filter(input) {
    const nav=input.closest('.adm-navigation');if(!nav)return;
    query=input.value.trim().toLocaleLowerCase('ko-KR');
    let found=false;
    nav.querySelectorAll('.adm-menu-group').forEach(group=>{
      let visible=false;
      group.querySelectorAll('[data-admin-nav-item]').forEach(item=>{
        const match=!query||item.dataset.search.includes(query);
        item.hidden=!match;if(match)visible=true;
      });
      group.hidden=!!query&&!visible;
      group.open=query?visible:group.dataset.active==='true';
      found ||= visible;
    });
    const favorites=nav.querySelector('[data-admin-pins]');
    if(favorites){let shown=false;favorites.querySelectorAll('[data-admin-nav-item]').forEach(item=>{
      const match=!query||item.dataset.search.includes(query);
      item.hidden=!match;if(match)shown=true;
    });favorites.hidden=!shown;}
    nav.querySelector('.adm-menu-empty')?.remove();
    if(query&&!found&&!favorites?.querySelector('[data-admin-nav-item]:not([hidden])')){
      const empty=global.document.createElement('p');empty.className='adm-menu-empty';empty.textContent='일치하는 관리 기능이 없어요.';
      nav.querySelector('.adm-menu-groups').append(empty);
    }
  }
  function updateCounts(summary) {
    global.document.querySelectorAll('.adm-navigation [data-admin-count]').forEach(badge=>{
      const [area,tab]=badge.dataset.adminCount.split(':');
      const n=badgeNumber(summary,area,tab);badge.textContent=n?n.toLocaleString('ko-KR'):'';badge.hidden=!n;
    });
  }
  function togglePin(area,tab) {
    const id=key(area,tab);if(!known.has(id))return false;
    pins=pins.includes(id)?pins.filter(saved=>saved!==id):[...pins.slice(-5),id];
    try { global.localStorage.setItem(STORE,JSON.stringify(pins)); } catch {}
    return true;
  }
  function replaceNav(options,focusKey='') {
    const old=global.document.querySelector('.adm-navigation');if(!old)return;
    const expanded=old.classList.contains('is-open'),scrollTop=old.scrollTop;
    const template=global.document.createElement('template');template.innerHTML=render(options);
    const next=template.content.querySelector('.adm-navigation');if(!next)return;
    if(expanded){next.classList.add('is-open');next.querySelector('.adm-menu-toggle')?.setAttribute('aria-expanded','true');}
    old.replaceWith(next);next.scrollTop=scrollTop;
    if(focusKey){const [area,tab]=focusKey.split(':');next.querySelector(`[data-act="adm-pin"][data-area="${area}"][data-v="${tab}"]`)?.focus({preventScroll:true});}
  }
  function toggleDrawer(button) {
    const nav=button.closest('.adm-navigation');if(!nav)return;
    const expanded=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(expanded));
  }
  global.document.addEventListener('input',event=>{
    if(event.target?.matches?.('[data-admin-search]')) filter(event.target);
  });
  global.OjjudaAdminNavigation={GROUPS,render,filter,updateCounts,togglePin,replaceNav,toggleDrawer,activeGroup,
    resetQuery(){query='';lastLocation='';}};
})(window);
