const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname,'../shared/games/multiplayer-entry.js'),'utf8');

function fixture(page,html='<main></main>') {
  const dom = new JSDOM('<!doctype html><body>'+html+'</body>',{
    url:'https://fixture.test'+page,runScripts:'outside-only',pretendToBeVisual:true
  });
  const w = dom.window,frames=new Map(),observers=[],errors=[];
  let frameId=0;
  w.requestAnimationFrame=callback=>{const id=++frameId;frames.set(id,callback);return id;};
  w.cancelAnimationFrame=id=>frames.delete(id);
  w.MutationObserver=class {
    constructor(callback){this.callback=callback;this.active=false;observers.push(this);}
    observe(){this.active=true;}
    disconnect(){this.active=false;}
  };
  w.addEventListener('error',event=>{errors.push(event.message);event.preventDefault();});
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {w,frames,observers,errors,close:()=>w.close(),tick(){
    const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback());
  }};
}

test('a closing game never reads document.body after iframe teardown',() => {
  const f=fixture('/games/roulette/index.html');
  try {
    assert.equal(f.observers.length,1);
    f.observers[0].callback([{type:'childList'}]);
    assert.equal(f.frames.size,1,'an entrance update was scheduled');
    const body=f.w.document.body;body.remove();
    f.w.dispatchEvent(new f.w.MessageEvent('message',{
      origin:f.w.location.origin,source:f.w,data:{type:'ojjuda:entry:query'}
    }));
    assert.deepEqual(f.errors,[],'late frame messages must not read a missing body');
    f.w.dispatchEvent(new f.w.Event('pagehide'));
    assert.equal(f.observers[0].active,false,'the observer disconnects on exit');
    assert.equal(f.frames.size,0,'a pending animation frame is cancelled on exit');
    f.tick();assert.deepEqual(f.errors,[]);
    f.w.document.documentElement.append(body);
    f.w.dispatchEvent(new f.w.Event('pageshow'));
    assert.equal(f.observers.length,2,'a restored page can safely start watching again');
    assert.equal(f.observers[1].active,true);
  } finally {f.close();}
});

test('a removed multiplayer frame releases its load listener',() => {
  const f=fixture('/world.html',
    '<div class="tour-game-dialog"><header><button>닫기</button></header><iframe src="/games/roulette/index.html"></iframe></div>');
  try {
    const host=f.w.document.querySelector('.tour-game-dialog');
    const iframe=host.querySelector('iframe');
    let removed=0;
    const oldRemove=iframe.removeEventListener.bind(iframe);
    iframe.removeEventListener=(name,...args)=>{if(name==='load')removed++;return oldRemove(name,...args);};
    assert.ok(host.querySelector('.mp-entry-bar'),'a frame gets the normal shared toolbar');
    host.remove();
    f.observers[0].callback([{type:'childList',target:f.w.document.body,addedNodes:[],removedNodes:[host]}]);
    f.tick();
    assert.equal(removed,1,'the detached frame no longer has a load listener');
    assert.deepEqual(f.errors,[]);
  } finally {f.close();}
});
