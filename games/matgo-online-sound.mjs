// Reuse the existing recorded solo effects without duplicating embedded media.
// Parse only the two JSON dictionaries; no HTML/scripts are executed.
export function createOnlineSound(){
  const KEY='ojjuda-matgo-sound',Audio=window.AudioContext||window.webkitAudioContext;
  let enabled=true,ctx=null,master=null,bank={},ready=null,epoch=0,loaded=null;
  const active=new Set();
  try{enabled=localStorage.getItem(KEY)!=='off';}catch{}
  const cues={jjok:[['wood',0],['triangle',.13]],ttadak:[['wood',0],['wood',.13]],ppuk:[['oops',0,.3]],ppukget:[['wood',0],['cash',.12]],sweep:[['maraca',0],['triangle',.26]],bomb:[['drum',0],['gong',.06,.58]],shake:[['maraca',0],['maraca',.25]],go:[['wood',0],['gong',.12,.3]],stop:[['gong',0,.62]],combo:[['triangle',0,.6]],bonusPlay:[['cash',0,.6]],flipBonus:[['cash',0,.6]],win:[['triangle',0,.55],['applause',.08,.68]],lose:[['sad',0,.38]],nagari:[['maraca',0],['gong',.25,.25]]};
  function clips(){
    if(!loaded)loaded=fetch(new URL('./matgo.html?v=20261005-g-unit1',import.meta.url)).then(async response=>{
      if(!response.ok)throw Error('sound_assets');
      const source=await response.text(),result={};
      for(const name of ['PCM','EVENT_MP3']){
        const json=source.match(new RegExp('const '+name+'=(\\{[^\\n]+\\});'))?.[1];
        if(!json)throw Error('sound_assets');result[name]=JSON.parse(json);
      }
      return result;
    }).catch(error=>{loaded=null;throw error;});
    return loaded;
  }
  function sync(){
    const button=document.getElementById('sound'),start=document.getElementById('sound-start');
    if(button){button.textContent=enabled?'🔊':'🔇';button.disabled=!Audio;button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'효과음 끄기':'효과음 켜기');}
    if(start)start.hidden=!Audio||!enabled||ctx?.state==='running';
  }
  function stop(){epoch++;for(const source of active){try{source.stop();}catch{}}active.clear();}
  function unlock(){
    if(!enabled||!Audio||document.hidden)return;
    try{
      if(!ctx){ctx=new Audio();master=ctx.createGain();master.gain.value=.85;master.connect(ctx.destination);ctx.onstatechange=sync;}
      // This runs synchronously inside a trusted gesture, even if clips still load.
      if(ctx.state!=='running')void ctx.resume().then(sync).catch(()=>{});
      if(!ready)ready=clips().then(async({PCM,EVENT_MP3})=>{
        for(const [name,encoded] of Object.entries(PCM)){
          const bytes=atob(encoded),buffer=ctx.createBuffer(1,bytes.length/2,48000),samples=buffer.getChannelData(0);
          for(let i=0;i<samples.length;i++){let n=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);if(n>=32768)n-=65536;samples[i]=n/32768;}
          bank[name]=buffer;
        }
        await Promise.allSettled(Object.entries(EVENT_MP3).map(async([name,encoded])=>{bank[name]=await ctx.decodeAudioData(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)).buffer);}));
      }).catch(()=>{ready=null;});
      sync();
    }catch{}
  }
  function sample(name,delay=0,volume=.85){
    if(!bank[name])return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=bank[name];
    gain.gain.value=volume;source.connect(gain);gain.connect(master);active.add(source);
    source.onended=()=>{active.delete(source);source.disconnect();gain.disconnect();};source.start(ctx.currentTime+delay);
  }
  function play(name,data={}){
    if(!enabled||!ctx||ctx.state!=='running'||document.hidden)return;
    try{
      if(name==='land')sample(data.onCards?'slapA':'floorA');
      else if(name==='take'||name==='steal')sample('collect');
      else if(cues[name]){stop();for(const [clip,delay,volume] of cues[name])sample(clip,delay,volume);}
    }catch{}
  }
  function preview(){
    unlock();const token=epoch;
    if(ctx&&ready)Promise.all([ctx.resume(),ready]).then(()=>{if(token===epoch&&enabled)play('land');}).catch(()=>{});
  }
  function toggle(){
    enabled=!enabled;try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}
    if(enabled)preview();else stop();sync();
  }
  const gesture=event=>{if(event.isTrusted&&!event.target.closest?.('#sound-start'))unlock();};
  for(const name of ['pointerdown','touchend','keydown','click'])document.addEventListener(name,gesture,{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else sync();});
  window.addEventListener('pagehide',stop);
  // Loading bytes does not create/resume an AudioContext before the first gesture.
  if(Audio&&enabled)void clips().catch(()=>{});
  sync();return {play,toggle,preview,cancel:stop};
}
