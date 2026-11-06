const fs=require('node:fs');
const path=require('node:path');
module.exports=function loadGameResults(window){
 if(!window.matchMedia)window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const dialog=window.HTMLDialogElement?.prototype;
 if(dialog&&!dialog.showModal)dialog.showModal=function(){this.open=true;};
 if(dialog&&!dialog.close)dialog.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 window.eval(fs.readFileSync(path.join(__dirname,'../shared/games/game-results.js'),'utf8'));
 return window.OjjudaGameResults;
};
