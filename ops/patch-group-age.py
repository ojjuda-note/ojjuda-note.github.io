from pathlib import Path
import re,json
root=Path('.')
p=root/'groups/app.js'
s=p.read_text()
def rep(old,new,count=1):
 global s
 assert s.count(old)==count,(old[:90],s.count(old),count)
 s=s.replace(old,new)
if 'const Age=' not in s:
 helper=(root/'groups/age-policy.js').read_text().replace('(() => {','const Age=(() => {',1).replace('window.OjjudaGroupAge=Object.freeze','return Object.freeze')
 rep("'use strict';","'use strict';\n"+helper)
 rep('rooms.filter(r=>!r.deleting)','rooms.filter(r=>!r.deleting&&r.age_eligible!==false)')
 rep('${r.deleting?\'\':\'<button data-action="share">초대 공유</button>\'}','${r.deleting||r.age_eligible===false?\'\':\'<button data-action="share">초대 공유</button>\'}')
 rep('<span class="room-count">${r.member_count}명</span>','<span class="room-count">${r.member_count}명</span> ${Age.badge(r)}')
 rep('<button data-action="manage">${r.owner_id===user.id?\'그룹 관리\':\'그룹원\'}</button>','${r.age_eligible!==false||r.owner_id===user.id?`<button data-action="manage">${r.owner_id===user.id?\'그룹 관리\':\'그룹원\'}</button>`:\'\'}')
 rep('삭제 계속하기</button></div>`:\n`<div class="toolbar">','삭제 계속하기</button></div>`:r.age_eligible===false?`<div class="empty">${Age.note(r)}${r.owner_id===user.id?\'<p>그룹 관리에서 연령 조건을 변경하거나 그룹을 삭제할 수 있어요.</p>\':\'<button data-action="age-leave" class="danger">그룹 나가기</button>\'}</div>`:\n`<div class="toolbar">')
 rep('<h3>${esc(r.name)}</h3>','<h3>${esc(r.name)}</h3>${Age.badge(r)}${Age.note(r)}')
 rep('<button data-request="${r.id}" class="primary">가입 신청</button>','<button data-request="${r.id}" class="primary" ${r.age_eligible===false?\'disabled\':\'\'}>${r.age_eligible===false?\'연령 조건 확인\':\'가입 신청\'}</button>')
 rep("switch(b.dataset.action){case 'home':", "switch(b.dataset.action){case 'age-leave':{const r=currentRoom();if(r)confirmAction('그룹을 나갈까요?','다시 가입할 때 연령 조건을 확인해요.',async()=>{await api('leave',{room_id:r.id});await reloadRooms();route();});break;}case 'home':")
 rep('<p class="hint">이름·소개 공개', '${Age.fields()}<p class="hint">이름·소개 공개')
 rep("d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,btn=f.querySelector('button');", "Age.bind(d.querySelector('form'));d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,btn=f.querySelector('button');if(!f.reportValidity())return;")
 rep('<h3>${esc(i.group_name)}</h3>','<h3>${esc(i.group_name)}</h3>${Age.badge(i)}${Age.note(i)}')
 rep('data-accept-invite="${i.id}">수락','data-accept-invite="${i.id}" ${i.age_eligible===false?\'disabled\':\'\'}>수락')
 rep('<h3>${esc(data.group_name)}</h3>','<h3>${esc(data.group_name)}</h3>${Age.badge(data)}${Age.note(data)}')
 rep('data-accept-link>${data.member?', 'data-accept-link ${data.age_eligible===false?\'disabled\':\'\'}>${data.member?')
 rep('<div class="dialog-foot"><button>이름·소개 저장</button>', '${Age.fields(r,true)}<div class="dialog-foot"><button>그룹 설정 저장</button>')
 rep("const report=err=>d.querySelector('.error').textContent=failure(err);", "Age.bind(d.querySelector('#rename-form'));\nconst report=err=>d.querySelector('.error').textContent=failure(err);")
 rep("e.preventDefault();const b=e.target.querySelector('button');if(b.disabled)return;b.disabled=true;try{await api('rename'", "e.preventDefault();if(!e.target.reportValidity())return;const b=e.target.querySelector('button');if(b.disabled)return;b.disabled=true;try{await api('rename'")
 rep("notify('이름과 소개를 변경했어요.');", "notify('그룹 설정을 변경했어요.');")
 p.write_text(s)
 (root/'groups/age-policy.js').unlink()
 css=root/'groups/style.css'
 css.write_text(css.read_text()+'\n.age-settings{margin:18px 0;padding:14px;border:1px solid #c8d5cc;border-radius:12px;min-width:0}.age-settings legend{padding:0 6px;font-weight:700}.age-settings [data-age-range]{margin-top:12px}.age-settings [data-age-range]>.field{margin-bottom:12px}.age-settings input,.age-settings select{min-width:0;max-width:100%}.age-settings [hidden]{display:none!important}.age-tag{display:inline-block;white-space:normal;margin:6px 0}.age-note{max-width:36rem;overflow-wrap:anywhere}\n')
 h=root/'groups/index.html'
 h.write_text(re.sub(r'/groups/(app.js|style.css)\?v=[^"\s]+',r'/groups/\1?v=20261111-age-policy1',h.read_text()))
 v=root/'version.json'; version=json.loads(v.read_text()); old=version['version']; m=re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(.*)',old)
 assert m,old
 new=f'{m[1]}.{int(m[2])+1}.0{m[4]}'
 world=root/'world.html'; w=world.read_text(); assert old in w,'world/version mismatch'; w=w.replace(old,new)
 world.write_text(w); version['version']=new; v.write_text(json.dumps(version,ensure_ascii=False)+'\n')
 print('feature version',old,'->',new)
 t=root/'tests/group-invitations-db.test.cjs'; txt=t.read_text(); anchor='}finally{await db.close();}'
 assert txt.count(anchor)==1
 txt=txt.replace(anchor,"await db.exec('reset role');\nawait require('./helpers/group-age-scenarios.cjs')({db,assert,as,api,board,val,uid,migration});\n"+anchor)
 t.write_text(txt)
 t=root/'tests/group-board-dom.test.cjs';t.write_text(t.read_text()+'\n'+(root/'ops/group-age-dom-tests.txt').read_text())
 staged=root/'supabase/scripts/groups/group_age_policy_2026_11_11.sql'
 staged.write_text(staged.read_text().replace('ojjjuda_groups_internal','ojjuda_groups_internal'))
print('group-age patch ready')
