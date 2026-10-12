const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('games/bulssi/index.html');
const owner = '10000000-0000-0000-0000-000000000001';
function game({admin = false, member = 'guest', saved = null, context = null, width = 1024, height = 768, reducedMotion = false} = {}) {
  const dom = new JSDOM(source, {url:'https://fixture.test/games/bulssi/', runScripts:'outside-only'});
  const w = dom.window, messages = [], timers = new Map(); let timerId = 0;
  const parent = {postMessage:(data, origin) => messages.push({data, origin})};
  Object.defineProperty(w, 'parent', {value:parent});
  Object.defineProperty(w,'innerWidth',{value:width,configurable:true});Object.defineProperty(w,'innerHeight',{value:height,configurable:true});
  w.matchMedia = () => ({matches:reducedMotion});
  w.requestAnimationFrame = () => 1;
  w.setTimeout = (fn, ms) => { timers.set(++timerId, {fn, ms}); return timerId; };
  w.clearTimeout = id => timers.delete(id);
  w.confirm = () => true;
  w.HTMLCanvasElement.prototype.getContext = () => context || new Proxy({}, {get:(_, key) => key === 'measureText' ? () => ({width:20}) : /Gradient$/.test(key) ? () => ({addColorStop(){}}) : () => {}});
  if (saved) w.localStorage.setItem('ojjuda.saetbyeol.save.v1:' + member, JSON.stringify(saved));
  w.eval(read('games/bulssi/entry.js'));
  for(const name of ['growth','upgrade-branches','encounters','tree-controls'])w.eval(read(`games/bulssi/${name}.js`));
  const script = [...w.document.querySelectorAll('script:not([src])')][0].textContent;
  w.eval(script.replace('requestAnimationFrame(frame);\n})();', 'window.fixture={get state(){return S},get demo(){return DEMO},get mode(){return mode},upgrades:UP,growth:GROWTH,upgradeLock,refresh,selectDefault,cost,stats,save,startDemo,endDemo,resetGame,winBoss,finale,loadProgress,get run(){return R},get liveStats(){return st},types:TYPES,encounters:ENCOUNTERS,parents:PARENT,tree:TREE,treeView,treeControls,hubGeo,upPos,hubTap,drawHub,drawNode,drawFx,drawCursor,drawRun,startRun,updateRun,spawn,pickType,kill,hurt,hurtBoss,damageTick,pointer:P,setMode,frame,setTime:value=>{T=value}};\nrequestAnimationFrame(frame);\n})();'));
  const receive = (data, origin = w.location.origin, sender = parent) => w.dispatchEvent(new w.MessageEvent('message', {origin, source:sender, data:{source:'ojjuda-world', ...data}}));
  const tick = ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  receive({type:'ojjuda-saetbyeol-init', owner:member, admin});
  return {dom,w,messages,receive,tick,$:s => w.document.querySelector(s)};
}

module.exports={game,read,source,owner};
