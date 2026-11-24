/* Administrator tools load only when their screen is opened. */
(()=>{
 'use strict';
 const scripts=[
 "/admin/visitors.js?v=20261121-pajang-visits1","/admin/trash.js?v=20261021-trash1",
  "/admin/friend-messages.js?v=20261116-message-page1","/admin/member-identity.js?v=20260929-phone-unique",
  "/admin/pajang-moderation.js?v=20261122-adult-only1",
  "/admin/connections.js?v=20261022-entry1","/admin/accounts.js?v=20261125-guardian-service1",
  "/admin/activity.js?v=20261119-pajang-admin1","/admin/photo-stages.js?v=20261006-photo1",
  "/admin/drinking-prompts.js?v=20261114-drinking-plus3001",
  "/admin/fortune-purchases.js?v=20261113-biorhythm-paid1",
  "/admin/groups.js?v=20261107-group-mod2","/admin/asset-library.js?v=20261124-service1",
  "/note/operations.js?v=20261119-question-admin1",
  "/note/admin.js?v=20261121-admin-media1"
 ],styles=[
  "/admin/visitors.css?v=20261121-campaign1",
  "/admin/visitors-charts.css?v=20261113-feature-chart2",
  "/admin/trash.css?v=20261021-trash1","/admin/friend-messages.css?v=20261020-messages1",
  "/admin/pajang-moderation.css?v=20261119-pajang-admin1",
  "/admin/connections.css?v=20261004-design1","/admin/accounts.css?v=20261110-member-history1",
  "/admin/activity.css?v=20261004-admin1","/admin/drinking-prompts.css?v=20261114-drinks-content1","/admin/photo-stages.css?v=20261006-photo1",
  "/admin/fortune-purchases.css?v=20261113-biorhythm-paid1",
  "/admin/groups.css?v=20261107-group-mod1","/admin/asset-library.css?v=20261111-asset-library1",
  "/note/operations.css?v=20261021-admin1",
  "/note/admin.css?v=20261121-admin-media1",
  "/park/fonts.css?v=20261120-nanum-myeongjo1"
 ],loaded=new Map();
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
 const workspaceModules={
  cards:['/note/admin'],risk:['/note/admin'],map:['/note/admin'],notice:['/note/admin'],spam:['/note/admin'],'note-users':['/note/admin'],
  reports:['/note/operations','/note/admin'],feedback:['/note/operations'],'pajang-questions':['/note/operations'],
  'pajang-answers':['/admin/pajang-moderation'],'pajang-chats':['/admin/pajang-moderation'],
  users:['/admin/accounts','/admin/member-identity'],suspended:['/admin/accounts'],referrals:['/admin/accounts'],
  visitors:['/admin/visitors','/admin/visitors-charts'],activity:['/admin/activity'],connections:['/admin/connections'],assets:['/admin/asset-library']
 };
 window.OjjudaAdminAssets={ready:false,async loadWorkspace(tab){
  const stems=tab.startsWith('trash-')?['/admin/trash']:(workspaceModules[tab]||[]);
  const required=url=>stems.some(stem=>url.startsWith(stem+'.'));
  const css=styles.filter(required);
  if(stems.includes('/note/admin'))css.push('/park/fonts.css?v=20261120-nanum-myeongjo1');
  for(const url of css)void resource(url,true).catch(()=>{});
  const [workspace]=await Promise.all([import('/admin/service-workspace.mjs?v=20261125-guardian-service1'),...scripts.filter(required).map(url=>resource(url,false))]);
  return workspace;
 },async loadGallery(){
  await Promise.all([
    resource('/app/world/world-themes.js?v=20261119-auto-theme1',false),
    resource('/features/home/agit-welcome.js?v=20261122-member-app-start1',false),
    resource('/features/home/agit-welcome.css?v=20261119-auto-theme1',true)
  ]);
 },load(){
  if(this.ready)return Promise.resolve();
  if(!pending){
   // Styles (including optional web fonts) must not hold up the controls.
   for(const url of styles)void resource(url,true).catch(()=>{});
   pending=Promise.all(scripts.map(url=>resource(url,false))).then(()=>{this.ready=true;}).finally(()=>{pending=null;});
  }
  return pending;
 }};
})();
