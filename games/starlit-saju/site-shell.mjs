// The homepage only changes the visible journey. Calculation and payment stay
// with the existing form handlers, including their explicit final confirmation.
const homes=new WeakMap();

export function attachSajuHomepage(form,{flow}={}) {
  const empty={start(){return false;},home(){return false;},sync(){}};
  if(!form?.ownerDocument)return empty;
  if(homes.has(form))return homes.get(form);
  const doc=form.ownerDocument,win=doc.defaultView;
  const intro=form.closest('.site-intro');
  const landing=intro?.querySelector('.site-landing');
  const panel=intro?.querySelector('.site-entry-panel');
  if(!intro||!landing||!panel)return empty;
  const compatibility=form.dataset.entryFlow==='compatibility';
  const result=doc.getElementById(compatibility?'compatibility-result':'result');
  const firstField=doc.getElementById(compatibility?'self-year':'birth-year');
  const heading=landing.querySelector('h1');
  const skip=doc.querySelector('.skip-link');
  const busy=()=>form.getAttribute('aria-busy')==='true'||form.dataset.flowBusy==='true';
  const reduced=()=>doc.documentElement.dataset.reducedMotion==='true'||(doc.documentElement.dataset.reducedMotion!=='false'&&win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  function sync() {
    const reading=result&&!result.hidden;
    doc.body.dataset.siteView=reading?'reading':panel.hidden?'home':'entry';
    for(const button of intro.querySelectorAll('button[data-start-reading],button[data-home-back]'))button.disabled=busy();
    if(skip) {
      skip.href=reading?'#'+(compatibility?'compatibility-result-title':'result-title'):panel.hidden?'#'+heading.id:'#'+form.id;
      skip.textContent=reading?(compatibility?'궁합 결과로 바로가기':'사주 결과로 바로가기'):panel.hidden?'사주 시작으로 바로가기':'출생 정보 입력으로 바로가기';
    }
  }
  function start({focus=true,reset=false}={}) {
    if(busy())return false;
    landing.hidden=true;panel.hidden=false;
    if(reset)flow?.reset({focus:false});
    sync();
    if(focus&&!intro.hidden) {
      firstField?.focus({preventScroll:true});
      panel.scrollIntoView?.({block:'start',behavior:reduced()?'instant':'smooth'});
    }
    return true;
  }
  function home({focus=true,reset=true}={}) {
    if(busy())return false;
    if(reset)flow?.reset({focus:false});
    landing.hidden=false;panel.hidden=true;
    for(const details of intro.querySelectorAll('.method-preview[open]'))details.open=false;
    sync();
    if(win.location.hash==='#start')win.history.replaceState(win.history.state,'',win.location.pathname+win.location.search);
    if(focus&&!intro.hidden) {
      heading.tabIndex=-1;heading.focus({preventScroll:true});
      landing.scrollIntoView?.({block:'start',behavior:reduced()?'instant':'smooth'});
    }
    return true;
  }
  intro.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-start-reading],[data-home-back]');
    if(!trigger||!intro.contains(trigger))return;
    event.preventDefault();
    if(trigger.hasAttribute('data-start-reading'))start({reset:true});else home();
  });
  for(const menu of doc.querySelectorAll('.result-utility,.site-settings')) {
    menu.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&menu.open){event.preventDefault();menu.open=false;menu.querySelector('summary')?.focus({preventScroll:true});}
    });
  }
  const observer=new win.MutationObserver(sync);
  observer.observe(intro,{attributes:true,attributeFilter:['hidden']});
  observer.observe(form,{attributes:true,attributeFilter:['aria-busy','data-flow-busy']});
  if(result)observer.observe(result,{attributes:true,attributeFilter:['hidden']});
  win.addEventListener('hashchange',()=>{if(win.location.hash==='#start'&&!intro.hidden)start({reset:true});});
  const controller={start,home,sync};homes.set(form,controller);
  if(win.location.hash==='#start')start({focus:false,reset:true});else home({focus:false,reset:false});
  return controller;
}
