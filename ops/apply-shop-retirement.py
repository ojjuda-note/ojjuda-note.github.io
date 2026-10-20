from pathlib import Path
import hashlib, json, re

BASE = {
  "world.html": "b93831327fc7101840a3e662d3b8e8789d693407cc82a7f51e02772a5e682dfc",
  "park/index.html": "ee1588f622212704cb5c798fa8fedf7ebe471e45eb29ccc6a3d643c33dcd5e2c",
  "index.html": "3c344ebab014104ad5ceedbab8436081d2f4a554aa6e643e00ca7df9e7261c65",
  "ju-shop.js": "d53220ac4967ca30be3f83c2b7da8576fd5b7c39783b798857e9d36deef7e5a4",
  "ju-shop.css": "ecbd2e851456d0d280bdcc713aed5262d680395dc5ecb66b21f19ee9a79e9f76",
  "ju-charge.js": "f522dae1ffc46d25a4e5c8c860aacfcf371ed3f8bcb227af902c8014b14602c7",
  "note/preview.js": "a92916fa53beaf4405672d456182c54007a25dad85d98a2d1559a412a1f33aa0",
  "park/integration.js": "26ddda5515e2a020f853e5cd30884873404cecee96e62e9202406b0a090c2d73",
  "world-park-notes.js": "e4646562a5133064894955e537a5f46513b906ab309d7b5ee091b80a618dcb7d",
  "photo-ttang-help.js": "f28e2c58a8807ab0fadf3e9fb3e0dd17bad0f5f589e1d22a75a6fd77b24225b1",
  "photo-ttang-access.js": "4f4613c34bfacb0ecbff1d41570be051c0f04e6ae88a6d7cd1393a0fd37e5dc9",
  "games/photo-ttang.html": "0a9ad64b4ae45546a79d14234ce6577d49e2977b417ef0584ad1c17df283550f",
  "paid-ui.css": "948af3b3c06faedc48c34bf5eb679c11ecd0dcc5750b39b9f380991c0032b130",
  "favicon.svg": "c77d48af94c9c89cf26c35b39175d5db2085cc7b389572057785f1022a98422b",
  "world-themes.css": "8933667d29746823c204941b20ea1e00ed07d1eb2d668041c7c2cde6b2ece977",
  "world-design.css": "d6c8121bbfd7c5a7cf1c7919d1897d45b9165166085a2ab7ac319a00b27739d0",
  "version.json": "5dff5d6c802b48e3f81cce007826c0622d7c42025e36eb858d0575cde38862f1",
  "tests/park-note-chat-ui.test.cjs": "1d546fbfc5b1fe5026c0cfcfda48a92f8f044cd0bbf39659d4c3857c75d00c38",
  "tests/shop-read-cache.test.cjs": "6ca43c6976e9a5b930486bcb24e044d01d9bec12c34f83af0513f3117d4cfce9",
  "tests/package.json": "dc557bd81a27c788d96c25054760b95a27e863ad67712f0a161040e1a9be7c62",
  "tests/ju-shop-ui.test.cjs": "a7cb63da97ec1ee69492017f4cf5781eb6f7443b80f49164c1daedd0dc7dba3b",
  "tests/shop-composer.test.cjs": "8743beb647668bbf221b84a431ac15484aa5f228c652f56886277d608c41a65f",
  "docs/ju-shop-rollout.md": "6ec22cd237f3e37f2008275bb15101794130aae4bc5b6ec26d6511b3ef6f7b98"
}  # Filled from the reviewed base commit before publishing.
OUTPUTS = {
  "version.json": "9b3af109581837596d07fd9fa970a8bed3733d9eb260d7a6a830d5cb90b70515",
  "photo-ttang-help.js": "b9823822d92c768deb5d5b24d6d6561c4091b4ce24f501b99725a92c31e3891f",
  "world-design.css": "35ce30f7784e350b1261cdb6e3a57568a3e43f67d4d1e1be11c5a2e3a22b8251",
  "index.html": "21db3c12e4e51c5da5e20c98495fc3a11640bbfd4cb4014fa4a5987d29226a89",
  "world-themes.css": "bdeebe347edd03f3f42f11258be154ba53b3463b211632f0493eee2e572d1cbd",
  "favicon.svg": "d4095e2a9a1ac744e28f71c31b872ea011eac291d59a45f36f768c731de96332",
  "paid-ui.css": "a33baa91147e46875521e558585282c843dc709b4977980452f41fdd9588f9ab",
  "photo-ttang-access.js": "4226983a232fc745feb843341fe27c4d96d4ff10689304ffea5e21ff00c74ab9",
  "world.html": "1f7e1714652bad7fc93c829cb84b58e67f0f8a830aba83450fe97f67ab177187",
  "ju-charge.js": "eaed38eaf5a5d1999b9fb9ec6fd3e6f0f22e3039ea537744d3f91d5d548b6cb2",
  "ju-decorations.css": "4c5067c6683ecf836247ecc21cd6047af9f2648fa36224d7ae812710a84354ed",
  "world-park-notes.js": "0cd65d6a7a013b7945f1096d5ebbe5cfe18beb887318c02e337e5de52ce505aa",
  "ju-decorations.js": "d5316522299e08452ecec4c7af80bf0d1711e3c7ae2d3e04831bbfc67eb9e156",
  "tests/decoration-read-cache.test.cjs": "b7742a7995812b52e1dab93cdeb2ecb16b711dbc736434f03eb8be0bb81e3a8a",
  "tests/package.json": "272f03e25721a09be40fbf44f4a4ac7a69d2e73ad42b4470ef6c3c9be6c53d01",
  "tests/park-note-chat-ui.test.cjs": "84766d10f32b25358fab2d6cf51957370f4d279233d0be44f706256749892f3a",
  "park/index.html": "9589eede27f2f7daef3225924a9e29c4e23bbc211a8dc20f7a39533b9c0f2994",
  "park/integration.js": "b27da7d67129a7dafaf1b41b7d9c9bb21c5c8f395842fdc3cfea3efb449c5f3a",
  "note/preview.js": "248d9c16f22529eee00758cbc75ba230941d3f4a976b39913cea39a351de70db",
  "games/photo-ttang.html": "b897a23628ae69a4d810aa977823a1615c924960e552a73ccb5e39827084f5d5"
}
DELETED = ["ju-shop.js", "ju-shop.css", "tests/shop-read-cache.test.cjs", "tests/ju-shop-ui.test.cjs", "tests/shop-composer.test.cjs", "docs/ju-shop-rollout.md"]
if all(Path(name).is_file() and hashlib.sha256(Path(name).read_bytes()).hexdigest()==digest for name,digest in OUTPUTS.items()) and all(not Path(name).exists() for name in DELETED):
    print("Cleanup already applied");raise SystemExit(0)
for name, digest in BASE.items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest, name

def one(s, old, new):
    assert s.count(old) == 1, old[:120]
    return s.replace(old, new)

def cut(s, start, end):
    a=s.index(start); b=s.index(end,a)
    return s[:a]+s[b:]

def edit(name, fn):
    p=Path(name);p.write_text(re.sub(r'(?m)^[ \t]+$', '', fn(p.read_text())))

version='20261022-clean4'
# Keep only the rendering/remaining usage of already-purchased decorations.
# The storefront, purchase/equip actions, receipts UI and retired house bridge go away.
s=Path('ju-shop.js').read_text()
s=one(s,'/* Shared shop. Server is authoritative for prices, ownership and expiration. */','/* Existing decorations only. Sales are retired; the server keeps ownership and expiry authoritative. */')
s=cut(s,' const LABELS=',' const STICKERS=')
s=one(s,'revision=0,busy=false,dialog=null,subscription=null,opener=null','revision=0,subscription=null')
s=one(s,' const houseFrames=new Map();\n const pending=new Map();let timer=null;',' let timer=null;')
s=s.replace('render();decorateWorld();','decorateWorld();updateComposer();').replace('updateComposer();updateComposer();','updateComposer();')
s=one(s,"render('상점 정보를 불러오지 못했어요. 다시 열어 주세요.');decorateWorld();",'decorateWorld();updateComposer();')
s=one(s,"clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);","clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible'){decorateWorld();updateComposer();}},60000);")
s=cut(s,' function message(text)',' function resetDecor()')
s=one(s,'  for(const [frame,ownerId]of houseFrames)if(frame.isConnected)void paintHouse(frame,ownerId);else houseFrames.delete(frame);\n','')
s=cut(s,' async function paintHouse(',' function styleFields()')
s=cut(s,' function applyProduct(',' function updateComposer()')
s=one(s,"if(n.value!=='none'&&!owned(product))n.value='none';}","n.closest('label').hidden=!owned(product);if(n.value!=='none'&&!owned(product))n.value='none';}const wrap=document.querySelector('.ju-compose-tools');if(wrap)wrap.hidden=!['card_stickers','card_fonts','card_foil'].some(owned);")
s=one(s,"  const b=el('button','','ZU 상점 보기');b.type='button';b.onclick=open;wrap.append(b);anchor.closest('.field')?.after(wrap);", "  anchor.closest('.field')?.after(wrap);")
s=cut(s," document.addEventListener('click',e=>", " document.addEventListener('visibilitychange'")
s=s.replace('ojjuda:shop-style','ojjuda:decoration-style')
s=one(s,'window.OjjudaShop={bindHouse,install,open,close,refresh,owned,styleFields,setStyle,applyProduct,decorateCard,decorateWorld,installComposer,isOpen:()=>!!dialog?.open,canLeave:()=>!busy};','window.OjjudaDecorations={install,refresh,owned,styleFields,setStyle,decorateCard,decorateWorld,installComposer};')
assert not any(x in s for x in ['ju_shop_buy','ju_shop_equip','상점','houseFrames','render()','applyProduct'])
Path('ju-decorations.js').write_text(s)
s=Path('ju-shop.css').read_text()
s=cut(s,'.ju-shop-dialog{','[data-ju-frame=')
s=re.sub(r'\.ju-compose-tools button\{[^}]+\}','',s)
s='\n'.join(line for line in s.split('\n') if 'data-ju-shop-open' not in line)
s+='\n.ju-compose-tools[hidden],.ju-compose-tools label[hidden]{display:none}\n'
Path('ju-decorations.css').write_text(s)

def page(s):
    s=re.sub(r'<div class="my-menu-group"><button\b[^>]*data-ju-shop-open[\s\S]*?</button></div>', '',s)
    s=re.sub(r'/ju-shop\.(css|js)\?v=[^"\s]+',lambda m:'/ju-decorations.'+m[1]+'?v='+version,s)
    for asset in ['ju-charge.js','paid-ui.css','world-design.css','world-themes.css','world-park-notes.js','note/preview.js','park/integration.js']:
        s=re.sub(r'(/?'+re.escape(asset)+r'\?v=)[^"\s]+',lambda m:m[1]+version,s)
    s=s.replace('OjjudaShop','OjjudaDecorations')
    s=s.replace('if(window.OjjudaDecorations?.isOpen())return window.OjjudaDecorations.close();','')
    s=s.replace('onUseCardDecoration:(key,userId)=>worldParkNotes?.useDecoration(key,userId)??false,','')
    return s
edit('world.html',page);edit('park/index.html',page)
edit('ju-charge.js',lambda s:s.replace('OjjudaShop','OjjudaDecorations'))

def preview(s):
    s=cut(s,'let pendingCardDecoration = null;','async function openComposer(')
    s=one(s,'  if (run === composerRun && epoch === identityEpoch) applyPendingCardDecoration();\n','')
    s=one(s,'  onUseCardDecoration: useCardDecoration,\n','')
    return s.replace('OjjudaShop','OjjudaDecorations').replace('ojjuda:shop-style','ojjuda:decoration-style')
edit('note/preview.js',preview)
def integration(s):
    s=s.replace('pendingAction = null, pendingDecoration = null,','pendingAction = null,')
    s='\n'.join(line for line in s.split('\n') if 'OjjudaShop' not in line and 'if (pendingDecoration && authKnown)' not in line)
    s=cut(s,'  function useDecoration(','  function reportState()')
    return s.replace('embedded: hosted, navigate, useDecoration,','embedded: hosted, navigate,')
edit('park/integration.js',integration)
def park_bridge(s):
    s=s.replace('pending=null,pendingDecoration=null,','pending=null,').replace('pendingDecoration=null;','')
    s=cut(s,'      if(pendingDecoration&&api()?.useDecoration){','      if(!pending||!api()?.navigate)return;')
    s=cut(s,'    function useDecoration(','    function preserveShell(')
    s=s.replace('close,open,useDecoration,refreshBalance','close,open,refreshBalance')
    return s.replace('20261007-flow1',version).replace('20261022-2',version)
edit('world-park-notes.js',park_bridge)
edit('photo-ttang-help.js',lambda s:one(s,'try{void parent.OjjudaShop?.refresh();}catch{}',''))
edit('photo-ttang-access.js',lambda s:s.replace('20261006-direct1',version))
edit('games/photo-ttang.html',lambda s:s.replace('/photo-ttang-access.js?v=20261006-red1','/photo-ttang-access.js?v='+version))
def paid(s):
    s=s.replace('/* Matching shop and charge tiles, including the missing shop icon. */','/* Charge entry. */')
    s=s.replace('.my-menu-group:has(> [data-ju-shop-open]),\n','').replace(':is([data-ju-shop-open], [data-ju-charge-open])','[data-ju-charge-open]')
    s='\n'.join(line for line in s.split('\n') if not any(x in line for x in ['ju-product','ju-shop-dialog','ju-compose-tools','data-ju-shop-open','/* Purchase prices remain']))
    return s
edit('paid-ui.css',paid)

# Keep the familiar note silhouette and smile. Only the colored fill follows the theme.
paths=Path('favicon.svg').read_text().split('\n',1)[1].rsplit('</svg>',1)[0].strip().replace('fill="#FF765F"','fill="currentColor"').replace('\n','')
def logo(s):
    def inline(m):
        tag=m.group(0);cls=re.search(r'class="([^"]+)"',tag);width=re.search(r'width="(\d+)"',tag);height=re.search(r'height="(\d+)"',tag)
        return '<svg class="'+(cls[1]+' ' if cls else '')+'ojjuda-theme-logo" viewBox="-16 -16 544 544" width="'+(width[1] if width else '32')+'" height="'+(height[1] if height else '32')+'" aria-hidden="true" focusable="false">'+paths+'</svg>'
    s,n=re.subn(r'<img\b[^>]*src="/favicon\.svg[^>]*>',inline,s);assert n>=1
    s=s.replace('favicon.svg?v=20261022-original1','favicon.svg?v='+version)
    return re.sub(r'(world-themes\.css\?v=)[^"\s]+',lambda m:m[1]+version,s)
for name in ['world.html','park/index.html','index.html']:edit(name,logo)
edit('favicon.svg',lambda s:one(s,'#FF765F','#245A48'))
edit('world-themes.css',lambda s:s+'\n/* The original note mark uses the same accent as its current theme. */\n.ojjuda-theme-logo{display:inline-block;flex:none;color:var(--accent,#245a48);vertical-align:middle;overflow:visible}\n')

# One continuous notice track, with an aria-hidden duplicate for the seamless loop.
def notice(s):
    s=one(s,'<span class="nb-track"><span class="nb-text">${w(wt.notice)}</span></span>','<span class="nb-track" aria-hidden="true"><span class="nb-flow"><span class="nb-text">${w(wt.notice)}</span><span class="nb-copy">${w(wt.notice)}</span></span></span>')
    a=s.index('var Qu=300*1e3');b=s.index('var Rs=',a)
    s=s[:a]+'''var noticeTickerText="",noticeTickerStart=0;
function Ts(){
 const banner=document.querySelector('.notice-tk'),track=banner?.querySelector('.nb-track'),flow=banner?.querySelector('.nb-flow'),text=flow?.querySelector('.nb-text');
 if(!track||!flow||!text||!track.clientWidth)return;
 const value=String(wt.notice||''),width=track.clientWidth;
 if(value!==noticeTickerText){noticeTickerText=value;noticeTickerStart=Date.now();}
 if(flow.dataset.width===String(width))return;
 track.style.setProperty('--notice-width',width+'px');
 const distance=text.getBoundingClientRect().width,duration=Math.max(8000,distance/38*1000);
 flow.style.setProperty('--notice-duration',duration+'ms');
 flow.style.animationDelay=(-((Date.now()-noticeTickerStart)%duration))+'ms';
 flow.dataset.width=String(width);
}
window.addEventListener('resize',()=>requestAnimationFrame(Ts));
''' + s[b:]
    # Remove old one-shot ticker CSS (mobile-only, with a long idle period).
    a=s.index('.notice-bar.notice-tk{');b=s.index('.fit4{',a)
    s=s[:a]+s[b:]
    return s
edit('world.html',notice)

# Three mobile columns remain. Stronger labels, more image area and separate game colors.
def design(s):
    s=one(s,'height:91px;border-radius:0;background:var(--surface-2)','height:108px;border-radius:0;background:var(--surface-2)')
    s=one(s,'width:120px;height:84px;object-fit:contain','width:144px;height:101px;object-fit:contain')
    s=one(s,'padding:12px 11px 14px;font-size:12px;font-weight:600','padding:12px 10px 14px;font-size:15px;font-weight:700')
    s=one(s,'.world-redesign .gbtn small{font-size:9px!important','.world-redesign .gbtn small{font-size:11px!important')
    s=one(s,'.world-redesign .gbtn{min-height:125px;border-radius:12px}.world-redesign .gbtn .ge{height:78px}.world-redesign .gbtn .ge img{width:103px;height:74px}.world-redesign .gbtn>span:last-child{font-size:11px;padding:9px 8px 12px}', '.world-redesign .gbtn{min-height:148px;border-radius:13px}.world-redesign .gbtn .ge{height:94px}.world-redesign .gbtn .ge img{width:118px;height:89px}.world-redesign .gbtn>span:last-child{font-size:14px;padding:10px 5px 12px;letter-spacing:-.055em}')
    s=s.replace('.arcade-overview{margin-bottom:32px}', '.arcade-overview{margin-bottom:24px}')
    return s+'''
/* Game covers stay distinct from the seasonal rankings illustration. */
.world-redesign .gbtn{--game-tint:#e2eee5;--game-edge:#aac3b1;border-color:var(--game-edge);box-shadow:0 3px 0 color-mix(in srgb,var(--game-edge) 38%,transparent)}
.world-redesign .gbtn .ge{background:linear-gradient(145deg,color-mix(in srgb,var(--game-tint) 45%,white),var(--game-tint));border-bottom:1px solid color-mix(in srgb,var(--game-edge) 60%,transparent)}
.world-redesign .gbtn .ge img{filter:saturate(1.35) contrast(1.08)}
.world-redesign .gbtn>span:last-child{flex:1;text-align:center;background:var(--surface);min-height:48px}
.world-redesign .gbtn[data-v=saetbyeol],.world-redesign .gbtn[data-v=stacker],.world-redesign .gbtn[data-v=janggi]{--game-tint:#f7e4b5;--game-edge:#d7b96c}
.world-redesign .gbtn[data-v=photo_ttang],.world-redesign .gbtn[data-v=breakout],.world-redesign .gbtn[data-v=ttang]{--game-tint:#dbeaf7;--game-edge:#9bbad4}
.world-redesign .gbtn[data-v=mole],.world-redesign .gbtn[data-v=spot],.world-redesign .gbtn[data-act=matgo-open]{--game-tint:#f4ddd5;--game-edge:#d4a699}
.world-redesign .gbtn[data-v=screw],.world-redesign .gbtn[data-v=tour],.world-redesign .gbtn[data-v=chess]{--game-tint:#e8e0f3;--game-edge:#b7a5cf}
.world-redesign .gbtn:hover{border-color:var(--accent);box-shadow:0 5px 16px #203d3020}
:root[data-theme=dark] .world-redesign .gbtn{border-color:color-mix(in srgb,var(--game-edge) 60%,var(--surface));box-shadow:none}
:root[data-theme=dark] .world-redesign .gbtn .ge{background:linear-gradient(145deg,var(--surface-2),color-mix(in srgb,var(--game-tint) 25%,var(--surface)))}
@media(max-width:360px){.world-redesign .gbtn>span:last-child{font-size:12.5px}.world-redesign .gbtn small{font-size:10px!important}}
/* Read from the left immediately; the second copy continues the same line. */
.notice-bar.notice-tk{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;overflow:hidden}
.notice-tk .nb-ico{flex:none}.notice-tk .nb-track{flex:1;min-width:0;overflow:hidden;white-space:nowrap}
.notice-tk .nb-flow{display:flex;width:max-content;animation:noticeFlow var(--notice-duration,20s) linear infinite;will-change:transform}
.notice-tk .nb-text,.notice-tk .nb-copy{display:block;flex:none;box-sizing:content-box;min-width:var(--notice-width,0px);padding-right:48px;white-space:nowrap}
.notice-tk:focus-visible .nb-flow{animation-play-state:paused}
@keyframes noticeFlow{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.notice-tk .nb-flow{animation:none;width:auto}.notice-tk .nb-copy{display:none}.notice-tk .nb-text{min-width:0;overflow:hidden;text-overflow:ellipsis;padding-right:0}}
'''
edit('world-design.css',design)
edit('world.html',lambda s:one(s,'0.46.3-beta','0.46.4-beta'))
edit('version.json',lambda s:s.replace('0.46.3-beta','0.46.4-beta'))

def park_test(s):
    s=one(s,'useDecoration:(key,owner)=>worldParkNotes.useDecoration(key,owner),','')
    s=s.replace('OjjudaShop','OjjudaDecorations').replace("'ju-shop.js'","'ju-decorations.js'")
    s=cut(s," await page.evaluate(()=>parkFixture.user('fixture-member'));\n assert.equal(await page.evaluate(()=>parkFixture.useDecoration",' assert.deepEqual(errors,[]);')
    return s
edit('tests/park-note-chat-ui.test.cjs',park_test)
edit('tests/shop-read-cache.test.cjs',lambda s:s.replace('ju-shop.js','ju-decorations.js').replace('OjjudaShop','OjjudaDecorations'))
Path('tests/decoration-read-cache.test.cjs').write_text(Path('tests/shop-read-cache.test.cjs').read_text())
def package(s):
    s=s.replace('node shop-composer.test.cjs && node shop-read-cache.test.cjs','node decorations.test.cjs && node decoration-read-cache.test.cjs && node shop-retirement-db.test.cjs')
    return s.replace(' && node ju-shop-ui.test.cjs','')
edit('tests/package.json',package)
for name in ['ju-shop.js','ju-shop.css','tests/ju-shop-ui.test.cjs','tests/shop-composer.test.cjs','tests/shop-read-cache.test.cjs']:
    Path(name).unlink()
Path('docs/ju-shop-rollout.md').unlink()
print('Applied shop retirement, clearer three-column games, continuous notices and theme-colored original logo.')

for name,digest in OUTPUTS.items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==digest, name
