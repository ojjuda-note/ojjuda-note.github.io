from pathlib import Path
import hashlib

p = Path('world.html')
s = p.read_text()
if hashlib.sha256(p.read_bytes()).hexdigest() == '063e920f74abaa08caa9ae5451060b3f89aa1a8a52ca099a12e44378f587b062':
    print('World focus already applied')
    raise SystemExit(0)
assert hashlib.sha256(p.read_bytes()).hexdigest() == '3b17e894c473b22fc2767717fc3d7317d0536ab6ef9c55f708b9d226b570e9fc'

def replace(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)

replace('<button data-act="tab" data-tab="park">공원 산책하기 <span aria-hidden="true">↗</span></button>', '')
a = s.index('<aside class="arcade-social">')
b = s.index('</aside>', a) + len('</aside>')
s = s[:a] + '<aside class="arcade-social" aria-label="대전방"><span class="world-eyebrow">PLAY TOGETHER</span>${window.OjjudaArcadeRooms?.markup()||\'<section class="arcade-rooms"><h3>대전방</h3><p class="note">대전방을 불러오는 중이에요.</p></section>\'}</aside>' + s[b:]
# Keep channel occupancy while retiring public Arcade messages and reactions.
a = s.index('if(t.id!=="park")i.on("broadcast"')
b = s.index('i.subscribe(', a)
s = s[:a] + s[b:]
a = s.index('});if(t.id==="park")return;let{data:l,error:s}=await S.from("place_messages")')
b = s.index('async function ', a)
assert s[a:b].endswith('}}')
s = s[:a] + '});}' + s[b:]
replace('"pl-send"(){if(g.place?.id==="park")return;', '"pl-send"(){if(["park","arcade"].includes(g.place?.id))return;')
replace('"pl-react"(t){let e=g.place;if(e?.id==="park")return;', '"pl-react"(t){let e=g.place;if(["park","arcade"].includes(e?.id))return;')
replace('방을 채팅창에 게시했어요. 상대가 참여하면 시작해요.', '대전방을 만들었어요. 상대가 참여하면 시작해요.')
for old,new in [
 ('/arcade-rooms.css?v=20261005-chatrooms2','/arcade-rooms.css?v=20261022-rooms1'),
 ('/arcade-rooms.js?v=20261018-catalog1','/arcade-rooms.js?v=20261022-rooms1'),
 ('/world-design.css?v=20261022-1','/world-design.css?v=20261022-2'),
 ('0.46.1-beta','0.46.2-beta'),
]:
    assert old in s, old
    s=s.replace(old,new)
s=s.replace('/world-park-notes.js?v=20261022-1','/world-park-notes.js?v=20261022-focus1')
a = s.index('<aside class="arcade-welcome">')
b = s.index('</aside>',a) + len('</aside>')
s = s[:a] + s[b:]
s = s.replace('/world-game-rankings.css?v=20261022-1','/world-game-rankings.css?v=20261022-2')
assert hashlib.sha256(s.encode()).hexdigest() == '063e920f74abaa08caa9ae5451060b3f89aa1a8a52ca099a12e44378f587b062'
p.write_text(s)
print('World focus:',p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest())
