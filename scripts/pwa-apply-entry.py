from pathlib import Path
import json
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
path = root / 'world.html'
text = path.read_text()
icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>'
banner = '<section class="pwa-install-banner" aria-label="오쭈다 앱 설치"><div class="pwa-banner-copy"><strong>홈 화면에서 바로 만나요</strong><span>오쭈다 아이콘으로 간편하게</span></div><button type="button" class="pwa-install-button" data-pwa-install aria-haspopup="dialog">' + icon + '<span data-pwa-label>앱 설치</span></button><button type="button" class="pwa-banner-dismiss" data-pwa-dismiss aria-label="설치 배너 닫기">×</button></section>'
settings = '<div class="my-menu-group"><button type="button" class="my-menu-summary pwa-install-entry" data-pwa-install aria-haspopup="dialog"><span class="my-menu-icon" aria-hidden="true">' + icon + '</span><span class="my-menu-copy"><span class="my-menu-title" data-pwa-label>앱 설치</span><span class="my-menu-caption" data-pwa-caption>홈 화면 아이콘으로 바로 열기</span></span></button></div>'
pairs = [
    ('<link rel="manifest" href="manifest.webmanifest?v=20261022-agit-logo2">', '<link rel="manifest" href="manifest.webmanifest?v=20261104-pwa1">\n<link rel="stylesheet" href="/pwa-install.css?v=20261104-pwa1">\n<script src="/pwa-install.js?v=20261104-pwa1" defer></script>'),
    ('</header><main class="main">${o}</main>', '</header><main class="main">${e==="place"&&g.place?.id==="arcade"?\'' + banner + '\':""}${o}</main>'),
    ('<h3 class="my-section-title">이용 설정</h3>', '<h3 class="my-section-title">이용 설정</h3>\n  ' + settings),
    ('closeOverlay:()=>{\n   if(worldRecommendedRestaurants', 'closeOverlay:()=>{\n   if(window.OjjudaPWA?.close())return true;\n   if(worldRecommendedRestaurants'),
    ('syncWorldMemberEntry();syncWorldArcadeRooms()}function ni(', 'syncWorldMemberEntry();syncWorldArcadeRooms();window.OjjudaPWA?.refresh()}function ni('),
    ('Go="0.48.6-beta"', 'Go="0.49.0-beta"'),
]
for old, new in pairs:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one entry target, got {count}: {old[:70]}')
    text = text.replace(old, new, 1)
path.write_text(text)
(root / 'version.json').write_text(json.dumps({'version': '0.49.0-beta'}, separators=(',', ':')) + '\n')
print('Updated world.html and version.json: PWA install entry 0.49.0-beta')
