// unchanged production source at line 1
   const dialog=document.createElement('dialog');
   dialog.className='tour-game-dialog archery-game-dialog';
   dialog.setAttribute('aria-label','바람의 궁수 · 싱글 게임');
   dialog.innerHTML='<header class="tour-game-header"><button type="button" class="arcade-return">← 오쭈다 오락실</button><span>바람의 궁수 <small>싱글 게임</small></span></header><iframe title="바람의 궁수" src="/games/forest-archer/index.html?v=20261113-game-popup-order1'+(/(?:^|[?&])archery_shop=coin(?:&|$)/.test(location.search||'')?'&shop=coin':'')+'" allow="autoplay; fullscreen; web-share"></iframe>';
   const frame=dialog.querySelector('iframe');
   const sessionId=crypto.randomUUID(),requests=new Map(),deadlines=new Set();
   let inFlight=null,finished=false,accessTimer=null;
// unchanged production source at line 19
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='ojjuda-archery-game')return;
    if(!current()){if(active?.dialog===dialog)close();return;}
    const message=event.data;
    if(message.type==='exit'){close();return;}
    if(message.type==='ready'){initialize();return;}
    if(message.owner!==owner||message.sessionId!==sessionId)return;
    if(message.type==='round-finished'){
// unchanged production source at line 83
