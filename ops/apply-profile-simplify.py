from pathlib import Path
import hashlib

p = Path('world.html')
s = p.read_text()
if hashlib.sha256(p.read_bytes()).hexdigest() == 'b93831327fc7101840a3e662d3b8e8789d693407cc82a7f51e02772a5e682dfc':
    print('World cleanup and game Back fix already applied')
    raise SystemExit(0)
assert hashlib.sha256(p.read_bytes()).hexdigest() == '063e920f74abaa08caa9ae5451060b3f89aa1a8a52ca099a12e44378f587b062'

def replace(old, new):
    global s
    assert s.count(old) == 1, old[:100]
    s = s.replace(old, new)

replace('var yi=["😊","🥰","😴","🔥","🌧️","🎧","🍀","🌙"],Jn=', 'var Jn=')
a = s.index('.moods{')
b = s.index('.switch{', a)
s = s[:a] + s[b:]
a = s.index('  <div class="field"><label>오늘의 기분</label>')
b = s.index('  <button class="btn pri" data-act="profile-save">', a)
s = s[:a] + s[b:]
replace('function rememberWorldProfileDraft(mood){', 'function rememberWorldProfileDraft(){')
replace("const nick=form.querySelector('#p-nick'),bio=form.querySelector('#p-bio'),moodText=form.querySelector('#p-mt');", "const nick=form.querySelector('#p-nick'),bio=form.querySelector('#p-bio');")
replace('if(!nick||!bio||!moodText)return false;', 'if(!nick||!bio)return false;')
replace('values:{nick:nick.value,bio:bio.value,moodText:moodText.value,mood:mood??worldProfileValues().mood}', 'values:{nick:nick.value,bio:bio.value}')
assert s.count("['p-nick','p-bio','p-mt']") == 2
s = s.replace("['p-nick','p-bio','p-mt']", "['p-nick','p-bio']")
replace('"mood-pick"(t,e){if(!rememberWorldProfileDraft(t.v))return;Pr(".moods button").forEach(o=>o.classList.toggle("on",o===e))},', '')
replace('Object.assign($.me,{nick:t,bio:z("#p-bio").value.trim(),moodText:z("#p-mt").value.trim(),mood:worldProfileValues().mood})', 'Object.assign($.me,{nick:t,bio:z("#p-bio").value.trim()})')
replace('var Go="0.46.2-beta"', 'var Go="0.46.3-beta"')
replace('<header class="world-page-heading"><div><p class="world-eyebrow">PLAY A LITTLE, SMILE A LOT</p><h1>오늘의 작은 즐거움<span>.</span></h1><p>가볍게 한 판, 함께하면 더 즐거운 시간.</p><span class="world-theme-chip" data-theme-status></span></div><div class="visit-banner">', '<header class="arcade-status" aria-label="오락실 채널"><div class="visit-banner">')
replace('/world-design.css?v=20261022-2', '/world-design.css?v=20261022-3')
replace('/world-navigation.js?v=20261004-swipe3', '/world-navigation.js?v=20261022-back1')
replace('/matgo-bridge.js?v=20261018-arcade-entry1', '/matgo-bridge.js?v=20261022-back1')
replace('  isMain:()=>worldMainTab()==="arcade",', '  isMain:()=>worldMainTab()==="arcade",\n  hasOverlay:()=>document.body.classList.contains("gaming")||!!document.querySelector(\'#matgo-overlay,#modal-root:not(:empty),dialog[open]\'),')
replace("   const gameClose=document.querySelector('[data-bl=\"close\"],[data-bd=\"close\"],[data-g=\"close\"]');", "   if(document.getElementById('matgo-overlay')){window.requestMatgoClose?.();return true;}\n   const gameClose=document.querySelector('.tour-game-dialog[open]>.tour-game-header button,.spot-game-dialog[open]>.spot-game-header button,#ttang-overlay button[aria-label=\"월드땅따먹기 닫기\"],#photo-ttang-overlay button[aria-label=\"포토땅따먹기 닫기\"],[data-bl=\"close\"],[data-bd=\"close\"],[data-g=\"close\"]');")
assert 'favicon.svg?v=20261022-1' in s
s = s.replace('favicon.svg?v=20261022-1', 'favicon.svg?v=20261022-original1')
for retired in ['mood-pick', 'p-mt', '.moods', '오늘의 기분', '기분 한마디']:
    assert retired not in s, retired
assert hashlib.sha256(s.encode()).hexdigest() == 'b93831327fc7101840a3e662d3b8e8789d693407cc82a7f51e02772a5e682dfc'
p.write_text(s)
print('Simplified profile:', p.stat().st_size, hashlib.sha256(p.read_bytes()).hexdigest())
for name, before, after in [
    ('index.html', '360ad3cc915e0cf603b9173bf1b6c3696b291e7558cee8f077ab56cd14311bcb', '3c344ebab014104ad5ceedbab8436081d2f4a554aa6e643e00ca7df9e7261c65'),
    ('park/index.html', 'c1693750f23efc9bbcfb77e832182c60a21213d7e079fd45bfb7ed1e0398b15f', 'ee1588f622212704cb5c798fa8fedf7ebe471e45eb29ccc6a3d643c33dcd5e2c'),
]:
    page = Path(name)
    assert hashlib.sha256(page.read_bytes()).hexdigest() == before
    updated = page.read_text().replace('favicon.svg?v=20261022-1', 'favicon.svg?v=20261022-original1')
    assert hashlib.sha256(updated.encode()).hexdigest() == after
    page.write_text(updated)
