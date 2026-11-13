(() => {
 'use strict';
 const base='./audio/';
 const click=new Audio(base+'switch-click.wav'),laugh=new Audio(base+'croc-laugh.wav');
 click.preload=laugh.preload='auto'; laugh.loop=true;
 let timer;
 function playClip(clip){clip.currentTime=0;clip.play().catch(()=>{});}
 function vibrate(ms){try{navigator.vibrate?.(ms)}catch{}}
 function quiet(){clearInterval(timer);timer=null;laugh.pause();click.pause();vibrate(0);}
 function startBite(){if(timer||document.hidden)return;playClip(laugh);vibrate(3000);timer=setInterval(()=>vibrate(3000),1500);}
 // Prime both recordings inside the first touch, including browsers that gate audio by element.
 function prime(){for(const clip of [click,laugh]){clip.muted=true;const start=clip.play();clip.pause();clip.muted=false;start?.catch(()=>{});}}
 document.addEventListener('pointerdown',prime,{once:true,capture:true});
 window.PartyFX={quiet,startBite,play:()=>playClip(click)};
})();
