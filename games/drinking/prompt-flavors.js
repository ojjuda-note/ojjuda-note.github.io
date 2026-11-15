/* Keep the preference per member on this device. Personal labels are scoped to the current page. */
(() => {
  'use strict';
  const memory=new Map(),custom=new Map(),catalog=new Map(),next=new Map();
  const member=document.getElementById('access-content')?.dataset.member||'';
  const key=kind=>'oj.party.'+member+'.promptMode.'+kind;
  const modes=['mild','spicy','mixed'];
  const names={mild:'순한맛',spicy:'빨간맛',mixed:'반반 섞기'};
  const adult=/성인용품|성인 (?:영상|콘텐츠|작품)|성관계|성욕|성적[인 ]|피임|원나잇|잠자리|첫날밤|첫 밤|외박|하룻밤|야한|야동|속옷|팬티|브라(?:자|를| 입)|키스|입맞춤|스킨십|섹시|호텔방|모텔|몸매|노출|절정|가슴|불륜|바람피|바람난|양다리|유혹|은밀|이중생활|수위 높은|침대에서|전 애인|전 연인/;
  function mode(kind){let value=memory.get(kind);try{value||=localStorage.getItem(key(kind));}catch{} return modes.includes(value)?value:'mixed';}
  function set(kind,value){if(!modes.includes(value))return;memory.set(kind,value);try{localStorage.setItem(key(kind),value);}catch{}}
  function signature(kind,value){return JSON.stringify([kind,value]);}
  function tag(kind,value,flavor){if(['mild','spicy'].includes(flavor))custom.set(signature(kind,value),flavor);}
  function setCatalog(kind,values,labels){
    const entries=new Map();
    if(Array.isArray(labels)&&labels.length===values.length){
      labels.forEach((label,i)=>{
        if(label==='mild'||label==='spicy')entries.set(JSON.stringify(values[i]),label);
      });
    }
    catalog.set(kind,entries);
  }
  function level(kind,value){return catalog.get(kind)?.get(JSON.stringify(value))||custom.get(signature(kind,value))||(adult.test(Array.isArray(value)?value.join(' '):value)?'spicy':'mild');}
  function filter(kind,values,selected=mode(kind),getLevel=v=>level(kind,v)){return selected==='mixed'?values:values.filter(v=>getLevel(v)===selected);}
  function recommend(kind,values,previous,selected=mode(kind),getLevel=v=>level(kind,v)){
    if(!values.length)return undefined;
    let pool=filter(kind,values,selected,getLevel);
    if(selected==='mixed'){
      const preferred=next.get(kind)||(Math.random()<.5?'mild':'spicy');
      const half=values.filter(v=>getLevel(v)===preferred);
      if(half.length)pool=half;
    }
    const rest=pool.filter(v=>v!==previous),bag=rest.length?rest:pool;
    const pick=bag[Math.floor(Math.random()*bag.length)];
    if(pick!==undefined&&selected==='mixed')next.set(kind,getLevel(pick)==='mild'?'spicy':'mild');
    return pick;
  }
  function selector(kind,allowed=modes){return '<label class="prompt-flavor-select">수위<select data-prompt-flavor>'+allowed.map(k=>'<option value="'+k+'"'+(mode(kind)===k?' selected':'')+'>'+names[k]+'</option>').join('')+'</select></label>';}
  window.PartyPromptFlavors={mode,set,level,tag,setCatalog,filter,recommend,selector,names};
})();
