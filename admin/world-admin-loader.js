/* Administrator tools load only when their screen is opened. */
(()=>{
 'use strict';
 const scripts=["/admin/visitors.js?v=20261101-game-challenges1","/admin/trash.js?v=20261021-trash1","/admin/friend-messages.js?v=20261021-trash1", "/admin/member-identity.js?v=20260929-phone-unique", "/admin/connections.js?v=20261022-entry1", "/admin/accounts.js?v=20261107-account-guard1", "/admin/activity.js?v=20261107-account-guard1", "/admin/photo-stages.js?v=20261006-photo1", "/admin/groups.js?v=20261107-group-mod2", "/note/operations.js?v=20261021-admin1", "note/admin.js?v=20261022-agit1"],styles=["/admin/visitors.css?v=20261101-game-challenges1","/admin/trash.css?v=20261021-trash1","/admin/friend-messages.css?v=20261020-messages1", "/admin/connections.css?v=20261004-design1", "/admin/accounts.css?v=20261107-account-guard1", "/admin/activity.css?v=20261004-admin1", "/admin/photo-stages.css?v=20261006-photo1", "/admin/groups.css?v=20261107-group-mod1", "/note/operations.css?v=20261021-admin1", "note/admin.css?v=20261022-agit1"],loaded=new Map();
 let pending=null;
 function resource(url,style){
  if(loaded.has(url))return loaded.get(url);
  const promise=new Promise((resolve,reject)=>{
   const node=document.createElement(style?'link':'script');
   if(style){node.rel='stylesheet';node.href=url;}else{node.src=url;node.async=false;}
   node.onload=()=>resolve();node.onerror=()=>{if(style&&node.sheet){resolve();return;}loaded.delete(url);node.remove();reject(Error('admin_asset_unavailable: '+url));};
   document.head.append(node);
  });loaded.set(url,promise);return promise;
 }
 window.OjjudaAdminAssets={ready:false,load(){
  if(this.ready)return Promise.resolve();
  if(!pending){
   // Styles (including optional web fonts) must not hold up the controls.
   for(const url of styles)void resource(url,true).catch(()=>{});
   pending=Promise.all(scripts.map(url=>resource(url,false))).then(()=>{this.ready=true;}).finally(()=>{pending=null;});
  }
  return pending;
 }};
})();
