/** The contents are a modal choice, separate from the story being read. */
export function createReadingNavigator({select,pages,domains,domainForPage,groupForPage,periodForPage,topicForScene}) {
  const doc=select.ownerDocument;
  const make=(tag,className,text)=>{
    const element=doc.createElement(tag);if(className)element.className=className;
    if(text!==undefined)element.textContent=text;return element;
  };
  const pageId=page=>page.id||page.element.id;
  const pageById=new Map(pages.map(page=>[pageId(page),page]));
  const root=make('div','reading-navigator');root.id=`${select.id}-navigator`;
  const toggle=make('button','story-menu-button','목차');toggle.type='button';toggle.id=`${select.id}-toggle`;
  const dialog=make('dialog','story-menu');dialog.id=`${select.id}-items`;
  const heading=make('h2','story-menu-title','풀이 목차');heading.id=`select-${select.id}-menu-title`;
  heading.tabIndex=-1;
  dialog.setAttribute('aria-labelledby',heading.id);
  toggle.setAttribute('aria-haspopup','dialog');toggle.setAttribute('aria-controls',dialog.id);toggle.setAttribute('aria-expanded','false');
  const closeButton=make('button','story-menu-close','닫기');closeButton.type='button';
  const header=make('header','story-menu-heading');header.append(heading,closeButton);
  const domainNav=make('div','reading-domain-nav');domainNav.setAttribute('role','group');domainNav.setAttribute('aria-label','읽을 분야');
  const periodControl=make('label','story-period-control');periodControl.hidden=true;
  const periodLabel=make('span','story-period-label','읽을 기간');
  const periodSelect=make('select','story-period-select');periodSelect.id=`${select.id}-period`;
  periodControl.append(periodLabel,periodSelect);
  const list=make('div','story-menu-list reading-item-groups');list.id=`${select.id}-list`;
  dialog.append(header,domainNav,periodControl,list);root.append(toggle,dialog);select.hidden=true;
  const buttons=new Map(),groups=new Map(),items=new Map(),periods=new Map(),selectedPeriods=new Map();let activeDomain=null;
  function close() {
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    toggle.setAttribute('aria-expanded','false');toggle.focus({preventScroll:true});
  }
  function open() {
    sync();
    if(!dialog.open) {
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    }
    toggle.setAttribute('aria-expanded','true');closeButton.focus({preventScroll:true});
  }
  function showDomain() {
    for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(id===activeDomain));
    const available=periods.get(activeDomain);
    if(available?.size) {
      const selected=selectedPeriods.get(activeDomain)||[...available.values()].find(period=>period.current)?.id||available.keys().next().value;
      selectedPeriods.set(activeDomain,selected);
      periodSelect.replaceChildren(...[...available.values()].map(period=>{
        const option=make('option','',period.label+(period.current?' · 지금':''));option.value=period.id;return option;
      }));
      periodSelect.value=selected;
      periodLabel.textContent=activeDomain==='monthly'?'읽을 달':'읽을 10년 구간';
    }
    periodControl.hidden=!available||available.size<2;
    for(const group of groups.values())group.element.hidden=group.domain!==activeDomain
      ||Boolean(group.period&&group.period!==selectedPeriods.get(activeDomain));
    root.dataset.readingDomain=activeDomain||'';
  }
  function choose(id) {
    if(![...select.options].some(option=>option.value===id))return;
    select.value=id;select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));close();
  }
  for(const page of pages) {
    const id=pageId(page),domain=domainForPage(page),label=groupForPage?.(page)||page.group||'항목';
    const period=periodForPage?.(page);
    if(period) {
      if(!periods.has(domain))periods.set(domain,new Map());
      periods.get(domain).set(period.id,period);
    }
    const key=`${domain}\n${period?.id||''}\n${label}`;
    if(!groups.has(key)) {
      const group=make('section','reading-item-group');group.dataset.readingDomain=domain;
      const entries=make('ul','reading-item-list');group.append(make('h3','reading-item-group-title',label),entries);
      groups.set(key,{element:group,list:entries,domain,period:period?.id});list.append(group);
    }
    const button=make('button','reading-item-button story-topic-button',page.label);button.type='button';
    button.id=`${select.id}-item-${id}`;button.dataset.readingTarget=id;button.dataset.readingDomain=domain;
    if(period)button.dataset.readingPeriod=period.id;
    button.addEventListener('click',()=>choose(id));
    const entry=make('li');entry.append(button);groups.get(key).list.append(entry);items.set(id,button);
  }
  for(const domain of domains) {
    if(!pages.some(page=>domainForPage(page)===domain.id))continue;
    const button=make('button','reading-domain-button',domain.label);button.type='button';
    button.id=`${select.id}-domain-${domain.id}`;button.dataset.readingDomain=domain.id;
    button.setAttribute('aria-controls',list.id);button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{activeDomain=domain.id;showDomain();});
    buttons.set(domain.id,button);domainNav.append(button);
  }
  domainNav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const available=[...buttons.values()],index=available.indexOf(event.target);if(index<0)return;
    event.preventDefault();event.stopPropagation();
    const next=event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length;
    available[next].click();available[next].focus({preventScroll:true});
  });
  toggle.addEventListener('click',open);closeButton.addEventListener('click',close);
  periodSelect.addEventListener('change',()=>{selectedPeriods.set(activeDomain,periodSelect.value);showDomain();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  });
  function sync() {
    const id=topicForScene?.(select.value)||select.value,selected=pageById.get(id);if(!selected)return;
    activeDomain=domainForPage(selected);
    const period=periodForPage?.(selected);if(period)selectedPeriods.set(activeDomain,period.id);
    showDomain();
    for(const [key,button] of items) {
      if(key===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
  }
  return {element:root,toggle,dialog,sync,focus({open:expanded=false}={}){if(expanded)open();else toggle.focus({preventScroll:true});}};
}
