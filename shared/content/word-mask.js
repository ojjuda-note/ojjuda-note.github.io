/* Local previews use the same catalog and spans as the server's mask_banned. */
(function(root){
  'use strict';
  const marker='❤️❤️';
  const normalize=value=>String(value??'').toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g,'');
  function maskText(value,{words=[],allow=[]}={}){
    if(value==null)return value;
    const original=String(value??''),characters=Array.from(original),masked=characters.map(()=>false);
    const prohibited=[...new Set(words.map(normalize).filter(Boolean))];
    const allowed=allow.map(normalize).filter(Boolean);
    if(!prohibited.length||!original)return original;
    for(;;){
      let normalized='',positions=[];
      const protectedPositions=characters.map(()=>false);
      for(let index=0;index<characters.length;index++){
        if(masked[index])continue;
        const unit=normalize(characters[index]);normalized+=unit;
        for(const unused of unit)positions.push(index);
      }
      for(const phrase of allowed){
        let occurrence;
        while((occurrence=normalized.indexOf(phrase))!==-1){
          for(let index=positions[occurrence];index<=positions[occurrence+phrase.length-1];index++)protectedPositions[index]=true;
          normalized=normalized.slice(0,occurrence)+normalized.slice(occurrence+phrase.length);
          positions.splice(occurrence,phrase.length);
        }
      }
      let changed=false;
      for(const phrase of prohibited){
        let from=0,occurrence;
        while((occurrence=normalized.indexOf(phrase,from))!==-1){
          for(let index=positions[occurrence];index<=positions[occurrence+phrase.length-1];index++){
            if(!protectedPositions[index]&&!masked[index]){masked[index]=true;changed=true;}
          }
          from=occurrence+1;
        }
      }
      if(!changed)break;
    }
    let result='';
    for(let index=0;index<characters.length;index++){
      if(masked[index]){if(!index||!masked[index-1])result+=marker;}
      else result+=characters[index];
    }
    return result;
  }
  const maskedTextLength=value=>Array.from(String(value??'').replaceAll(marker,'♥')).length;
  const textInputMaxLength=(value,limit)=>limit+String(value??'').length-maskedTextLength(value);
  function watchInputs(scope,selector){
    const update=input=>{
      if(!input.matches?.(selector))return;
      const limit=Number(input.dataset.wordLimit??input.getAttribute('maxlength'));
      if(!Number.isFinite(limit)||limit<0)return;
      input.dataset.wordLimit=String(limit);
      input.maxLength=textInputMaxLength(input.value,limit);
    };
    const scan=node=>{update(node);node.querySelectorAll?.(selector).forEach(update);};
    const input=event=>update(event.target);
    scope.addEventListener('input',input);
    scan(scope);
    const observer=new root.MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)scan(node);
    });
    observer.observe(scope,{childList:true,subtree:true});
    return ()=>{scope.removeEventListener('input',input);observer.disconnect();};
  }
  const api=Object.freeze({maskText,maskedTextLength,textInputMaxLength,watchInputs});
  root.OjjudaWordMask=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
