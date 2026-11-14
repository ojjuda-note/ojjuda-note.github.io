/** Visible navigation over the pager's existing, purchase-gated selection. */
export function createReadingNavigator({select,pages,domains,domainForPage,groupForPage}) {
  const doc=select.ownerDocument;
  const make=(tag,className,text)=>{
    const element=doc.createElement(tag);
    if(className)element.className=className;
    if(text!==undefined)element.textContent=text;
    return element;
  };
  const pageId=page=>page.id||page.element.id;
  const pageById=new Map(pages.map(page=>[pageId(page),page]));
  const root=make('div','reading-navigator');root.id=`${select.id}-navigator`;
  const domainNav=make('div','reading-domain-nav');
  domainNav.setAttribute('role','group');domainNav.setAttribute('aria-label','읽을 분야');
  const picker=make('details','reading-item-picker');picker.id=`${select.id}-items`;
  const toggle=make('summary','reading-item-toggle');toggle.id=`${select.id}-toggle`;
  const currentTitle=make('strong','reading-current-title');
  const count=make('span','reading-item-count');
  toggle.append(make('span','reading-current-caption','지금 읽는 항목'),currentTitle,count,
    make('span','reading-item-action','항목 목록'));
  const list=make('div','reading-item-groups');list.id=`${select.id}-list`;
  toggle.setAttribute('aria-controls',list.id);
  picker.append(toggle,list);root.append(domainNav,picker);
  // Its value is still the pager's single selection and clock-refresh anchor.
  // Only the visible buttons and disclosure participate in keyboard access.
  select.hidden=true;
  const buttons=new Map(),groups=new Map(),items=new Map(),lastSelection=new Map();
  let activeDomain=null;

  function choose(id,{fromList=false}={}) {
    if(![...select.options].some(option=>option.value===id))return;
    picker.open=false;
    select.value=id;
    select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
    if(fromList)toggle.focus({preventScroll:true});
  }
  for(const domain of domains) {
    const button=make('button','reading-domain-button',domain.label);
    button.type='button';button.id=`${select.id}-domain-${domain.id}`;
    button.dataset.readingDomain=domain.id;button.setAttribute('aria-pressed','false');
    button.setAttribute('aria-controls',picker.id);
    button.addEventListener('click',()=>{
      const candidates=[...items.values()].filter(item=>item.domain===domain.id);
      const remembered=lastSelection.get(domain.id);
      const target=candidates.find(item=>item.id===remembered)||candidates[0];
      if(target) {
        choose(target.id);
        picker.open=candidates.length>1;
      }
    });
    buttons.set(domain.id,button);domainNav.append(button);
  }
  domainNav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const available=[...buttons.values()].filter(button=>!button.hidden);
    const index=available.indexOf(event.target);if(index<0)return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?available.length-1
      :(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length;
    available[next].click();available[next].focus({preventScroll:true});
  });
  picker.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&picker.open) {
      event.preventDefault();picker.open=false;toggle.focus({preventScroll:true});
    }
  });

  function sync() {
    const selected=pageById.get(select.value);
    if(!selected)return;
    activeDomain=domainForPage(selected);
    lastSelection.set(activeDomain,select.value);
    const available=new Set();
    for(const option of select.options) {
      const page=pageById.get(option.value);if(!page)continue;
      const domain=domainForPage(page);
      const label=groupForPage?.(page)||page.menuGroup||page.group||'항목';
      const key=`${domain}\n${label}`;
      if(!groups.has(key)) {
        const group=make('section','reading-item-group');group.dataset.readingDomain=domain;
        const heading=make('h4','reading-item-group-title',label);
        const entries=make('ul','reading-item-list');
        group.append(heading,entries);groups.set(key,{element:group,list:entries,domain});list.append(group);
      }
      if(!items.has(option.value)) {
        const button=make('button','reading-item-button',page.label);
        button.type='button';button.id=`${select.id}-item-${option.value}`;
        button.dataset.readingTarget=option.value;button.dataset.readingDomain=domain;
        button.addEventListener('click',()=>choose(option.value,{fromList:true}));
        const entry=make('li');entry.append(button);groups.get(key).list.append(entry);
        items.set(option.value,{id:option.value,domain,entry,button});
      }
      available.add(option.value);
    }
    for(const [id,item] of items) {
      if(!available.has(id)) {item.entry.remove();items.delete(id);continue;}
      if(id===select.value)item.button.setAttribute('aria-current','page');
      else item.button.removeAttribute('aria-current');
    }
    for(const group of groups.values())group.element.hidden=group.domain!==activeDomain||!group.list.childElementCount;
    for(const [id,button] of buttons) {
      button.hidden=![...items.values()].some(item=>item.domain===id);
      button.setAttribute('aria-pressed',String(id===activeDomain));
    }
    currentTitle.textContent=selected.label;
    count.textContent=`${[...items.values()].filter(item=>item.domain===activeDomain).length}개 항목`;
    root.dataset.readingDomain=activeDomain;
  }
  return {element:root,toggle,sync,focus({open=false}={}) {
    if(open)picker.open=true;
    toggle.focus({preventScroll:true});
  }};
}
