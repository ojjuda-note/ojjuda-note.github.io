from pathlib import Path
import subprocess
p=Path('world.html')
s=p.read_text()
changes=[
 ('<script src="note/notifications.js?v=20261031-performance1" defer></script>', '<script src="note/notifications.js?v=20261031-performance1" defer></script>\n<link rel="stylesheet" href="/daily-updates.css?v=20261106-1">\n<script src="/daily-updates.js?v=20261106-1" defer></script>'),
 ('function ensureSharedNotifications(){', 'var worldDailyUpdates=null;\nfunction ensureSharedNotifications(){\n if(!worldDailyUpdates&&window.OjjudaDailyUpdates)worldDailyUpdates=window.OjjudaDailyUpdates.install({client:S,getUserId:()=>D.user?.id||null,isReady:()=>(Tr&&D.online)||D.parkGuest===true,canShow:()=>g.tab!=="admin"});\n worldDailyUpdates?.sync();'),
 ('if(window.OjjudaPWA?.close())return true;', 'if(worldDailyUpdates?.isOpen()){void worldDailyUpdates.acknowledge();return true;}\n   if(window.OjjudaPWA?.close())return true;'),
 ('Go="0.51.8-beta"', 'Go="0.51.9-beta"')
]
for before,after in changes:
 assert s.count(before)==1, 'World source anchor changed'
 s=s.replace(before,after)
p.write_text(s)
assert subprocess.check_output(['git','hash-object','world.html'],text=True).strip()=='63f03cfa794df9d25a24b719f21a6fc59f64947b', 'Prepared world must match locally tested bytes'
print('World bytes match tested implementation')
