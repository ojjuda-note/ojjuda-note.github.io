from pathlib import Path
import hashlib,sys
p=Path('world.html')
base='1f7e1714652bad7fc93c829cb84b58e67f0f8a830aba83450fe97f67ab177187'
expected='5fcbbb2dcfc9e8aead48854373eb92409771506aff4988c144d8dc50c9d9a224'
actual=hashlib.sha256(p.read_bytes()).hexdigest()
if actual==expected:sys.exit(0)
assert actual==base,'Unexpected World base; rebase the reviewed changes first'
s=p.read_text().replace('world-themes.css?v=20261022-clean4','world-themes.css?v=20261020-auto1').replace('world-themes.js?v=20261022-1','world-themes.js?v=20261020-auto1').replace('notifications.js?v=20261006-zu1','notifications.js?v=20261020-messages1').replace('world-park-notes.js?v=20261022-clean4','world-park-notes.js?v=20261020-notes1')
def replace(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
a=s.index('<section class="settings-section settings-theme-section">');b=s.index('<section class="settings-section settings-wide">',a);s=s[:a]+s[b:]
replace('<script src="/world-admin-loader.js?v=20261021-1" defer></script>','<script src="/world-admin-loader.js?v=20261020-messages1" defer></script>\n<link rel="stylesheet" href="/friend-messages.css?v=20261020-messages1">\n<script src="/friend-messages.js?v=20261020-messages1" defer></script>')
replace('var worldNotifications=null;','var worldNotifications=null,worldFriendMessages=null;')
replace('function ensureSharedNotifications(){','function ensureSharedNotifications(){\n if(!worldFriendMessages&&window.OjjudaFriendMessages)worldFriendMessages=window.OjjudaFriendMessages.install({client:S,getUserId:()=>D.user?.id||null});')
s=s.replace('["guestbook","friends","media"].includes','["guestbook","friends","media","message"].includes')
replace('async function openWorldNotification(type,id){','async function openWorldNotification(type,id){\n if(type==="message"){ensureSharedNotifications();return worldFriendMessages?.openMessage(id);}')
replace('closeOverlay:()=>{','closeOverlay:()=>{\n   if(worldFriendMessages?.isOpen()){worldFriendMessages.close();return true;}')
replace('${w(P.rel.get(profile.id).id)}" data-name=', '${w(P.rel.get(profile.id).id)}" data-name=') if False else None
needle='markup+=P.friends.length?P.friends.map(profile=>`<div class="world-friend-row">${person(profile)}<div class="world-friend-actions">'
replace(needle,needle+'<button class="btn sm" data-friend-message="${w(profile.id)}">쪽지</button>')
replace('content:[["photo-stages","포토땅따먹기"],','content:[["messages","쪽지 관리"],["photo-stages","포토땅따먹기"],')
replace('if(L.area==="content"&&L.tab==="photo-stages")return', 'if(L.area==="content"&&L.tab==="messages")return t+\'<div id="world-admin-messages"></div>\';\n if(L.area==="content"&&L.tab==="photo-stages")return')
replace('L.area==="content"&&L.tab==="photo-stages"?"photo-stages":null','L.area==="content"&&L.tab==="photo-stages"?"photo-stages":L.area==="content"&&L.tab==="messages"?"messages":null')
replace('if(name==="activity")adminModuleController=', 'if(name==="messages")adminModuleController=window.OjjudaAdminFriendMessages?.mount({...opts,initialState:previous});\n  if(name==="activity")adminModuleController=')
replace('#world-admin-activity,#world-admin-house-content','#world-admin-activity,#world-admin-messages,#world-admin-house-content')
s=s.replace('content:[["messages","쪽지 관리"],["photo-stages","포토땅따먹기"],["chats","대화"],','content:[["photo-stages","포토땅따먹기"],["chats","대화"],["messages","쪽지 관리"],')
s=s.replace('0.46.4-beta','0.46.5-beta')
assert hashlib.sha256(s.encode()).hexdigest()==expected,'Unexpected output'
p.write_text(s)
