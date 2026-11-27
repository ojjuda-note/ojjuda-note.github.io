// Each opening position lives only inside its open tutorial.
export const round=(title,initial,draw)=>({title,initial,draw});
export const tile=(face,label,kind='',selected=false)=>({face,label,kind,selected});
export const gap=()=>({face:'',label:'',kind:'empty',inert:true});
export function element(tag,cls,text){
  const node=document.createElement(tag);node.className=cls;
  if(text!==undefined)node.textContent=text;
  if(tag==='button')node.type='button';
  return node;
}
export function mount(host,spec,{local=false,onComplete=()=>{},onDraw,initial=spec.initial,demo=false}={}){
  let state,active=true,message='',alarms=[],pausedAt=0,pausedTime=0;
  const now=()=>(active?performance.now():pausedAt)-pausedTime;
  const title=element('h3','round-title',spec.title);
  const prompt=element('p','round-cue');prompt.setAttribute('aria-live','polite');
  const board=element('div','round-surface');
  const status=element('p','rehearsal-feedback');status.setAttribute('role','status');
  const restart=element('button','round-restart','처음부터');restart.onclick=reset;
  const head=element('div','rehearsal-head');head.append(title,restart);
  host.append(head,prompt,board,status);
  function cancel(){alarms.forEach(clearTimeout);alarms=[];}
  function reset(){state=structuredClone(initial);message='';render();onComplete(false);}
  function change(patch={},note=''){Object.assign(state,patch);message=note;render();}
  function finish(note,patch={}){change({...patch,done:note},note);onComplete(true);}
  function say(note){message=note;status.textContent=note;}
  function later(ms,fn){
    if(!active||state.done)return;
    alarms.push(setTimeout(()=>{if(active&&host.isConnected&&!host.hidden&&!state.done)fn();},Math.max(0,ms)));
  }
  function grid(cols,items,select,style='',drag){
    const g=element('div','round-grid '+style);g.style.setProperty('--cols',cols);
    items.forEach((item,i)=>{
      if(typeof item==='string')item=tile(item,item);
      const b=element(item.inert?'span':'button','round-cell '+(item.kind||''),item.face);
      if(item.image){const img=element('img','');img.src=item.image;img.alt='';b.replaceChildren(img);}
      if(!item.inert){
        b.dataset.cell=i;b.setAttribute('aria-label',item.label);b.title=item.label;
        if(item.selected)b.setAttribute('aria-pressed','true');
        b.disabled=!!state.done||!!item.disabled;b.onclick=()=>select(i);
      }else if(item.label){b.setAttribute('aria-label',item.label);}else b.setAttribute('aria-hidden','true');
      g.append(b);
    });
    if(drag){
      let src=null;
      g.classList.add('round-draggable');
      g.onpointerdown=e=>{const b=e.target.closest('[data-cell]');src=b&&!b.disabled?{i:Number(b.dataset.cell),id:e.pointerId}:null;};
      g.onpointercancel=()=>{src=null;};
      g.onpointerup=e=>{
        if(!src||e.pointerId!==src.id)return;
        const start=src.i;src=null;
        const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-cell]');
        if(!target||!g.contains(target)||start===Number(target.dataset.cell))return;
        e.preventDefault();drag(start,Number(target.dataset.cell));
      };
    }
    board.append(g);return g;
  }
  function buttons(entries){
    const bar=element('div','round-controls');
    entries.forEach(([label,act,disabled])=>{
      const b=element('button','round-key',label);b.disabled=!!disabled||!!state.done;b.onclick=act;bar.append(b);
    });
    board.append(bar);return bar;
  }
  function field(label,submit,{type='text',min,max}={}){
    const form=element('form','round-input');const input=element('input','');
    input.type=type;input.setAttribute('aria-label',label);input.placeholder=label;input.required=true;
    if(type==='number')input.inputMode='numeric';if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
    const enter=element('button','round-key','입력');enter.type='submit';
    form.onsubmit=e=>{e.preventDefault();if(input.value.trim())submit(input.value.trim());};
    input.disabled=enter.disabled=!!state.done;form.append(input,enter);board.append(form);return input;
  }
  function range(label,value,min,max,update){
    const wrap=element('label','round-range');const out=element('span','',label+' '+value);
    const input=element('input','');input.type='range';input.min=min;input.max=max;input.value=value;input.setAttribute('aria-label',label);input.disabled=!!state.done;
    input.oninput=()=>{out.textContent=label+' '+input.value;update(Number(input.value));notify();};
    wrap.append(out,input);board.append(wrap);return input;
  }
  function display(value,kind=''){const n=element('div','round-readout '+kind,value);board.append(n);return n;}
  function meter(label,value,max){const wrap=element('div','round-meter');const name=element('span','',label+' '+value+' / '+max);
    const bar=element('progress','');bar.max=max;bar.value=value;bar.setAttribute('aria-label',label);wrap.append(name,bar);board.append(wrap);}
  function notify(){onDraw?.(state,board,prompt,now());}
  const ui={board,local,demo,now,notify,grid,buttons,field,range,display,meter,later,say,change,finish,
    cue:text=>{prompt.textContent=text;},
    reduced:()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false};
  function render(){
    cancel();const prev=document.activeElement;const key=board.contains(prev)?prev.dataset.cell:undefined;
    const label=board.contains(prev)?prev.getAttribute('aria-label')||prev.textContent:null;
    board.replaceChildren();spec.draw(ui,state);status.textContent=state.done||message;
    host.dataset.complete=String(!!state.done);
    notify();
    if(!demo&&prev&&!prev.isConnected){
      const controls=[...board.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
      const target=controls.find(n=>key!==undefined?n.dataset.cell===key:(n.getAttribute('aria-label')||n.textContent)===label);
      (target||controls[0]||restart).focus({preventScroll:true});
    }
  }
  reset();
  return {refresh:notify,pause(){if(!active)return;pausedAt=performance.now();active=false;cancel();},
    resume(){if(!active){
      const field=board.querySelector('.round-input input'),draft=field?.value;
      pausedTime+=performance.now()-pausedAt;active=true;render();
      if(draft){const next=board.querySelector('.round-input input');if(next)next.value=draft;}
    }},complete:()=>!!state.done};
}
