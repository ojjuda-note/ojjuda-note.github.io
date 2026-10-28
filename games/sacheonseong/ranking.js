/* One ascending time scale, stored in the arcade's descending score system. */
(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.OjjudaSacheonseongRanking=rules;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const BASE=2000000000,MAX_STAGE=15;
 function game(stage){return Number.isInteger(stage)&&stage>=1&&stage<=MAX_STAGE?'sacheonseong_'+stage:null;}
 function isGame(id){return /^sacheonseong_([1-9]|1[0-5])$/.test(id);}
 function score(duration){if(!Number.isFinite(duration)||duration<=0)return null;const ticks=Math.max(1,Math.floor(duration/10));return ticks<=BASE?BASE-ticks:null;}
 function duration(value){return Number.isInteger(value)&&value>=0&&value<BASE?(BASE-value)*10:null;}
 function format(value){const ms=duration(value);if(ms===null)return '—';const ticks=ms/10;return String(Math.floor(ticks/6000)).padStart(2,'0')+':'+String(Math.floor(ticks/100)%60).padStart(2,'0')+'.'+String(ticks%100).padStart(2,'0');}
 return Object.freeze({BASE,MAX_STAGE,game,isGame,score,duration,format});
});
