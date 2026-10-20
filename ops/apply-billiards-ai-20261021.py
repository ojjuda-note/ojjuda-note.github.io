from pathlib import Path
import json
p = Path('world.html')
s = p.read_text()
def replace_once(old, new):
    global s
    assert s.count(old) == 1, (old, s.count(old))
    s = s.replace(old, new)
replace_once('function Ys(t,e="normal"){', 'function blPlanAiShot(t,e="normal"){')
replace_once('var H0={},Va=', '// Apply execution error after planning, including fallback shots.\nfunction Ys(state, level = "normal", consecutive = 0) {\n  const shot = blPlanAiShot(state, level);\n  const skill = {\n    easy: { angle: 1.4, power: .08, lapse: .26 },\n    normal: { angle: .65, power: .035, lapse: .18 },\n    hard: { angle: .35, power: .02, lapse: .12 }\n  }[level] || { angle: .65, power: .035, lapse: .18 };\n  const run = Math.min(5, Math.max(0, Number(consecutive) || 0));\n  const lapse = Math.random() < Math.min(.8, skill.lapse + run * .14);\n  const angle = (Math.random() * 2 - 1) * skill.angle * (1 + run * .65) * (lapse ? 2.5 : 1);\n  const power = 1 + (Math.random() * 2 - 1) * (skill.power + run * .025) * (lapse ? 1.5 : 1);\n  const [dx, dy] = Na(shot.dx, shot.dy, angle);\n  return Ke(dx, dy, shot.v * power, shot.top, shot.side,\n    shot.cx !== undefined ? { cx: shot.cx, cy: shot.cy } : undefined);\n}\nfunction blUpdateAiRun(game, result) {\n  if (game.mode !== "ai") return;\n  game.aiRun = game.st.turn !== game.me && result.keep && !result.st.over\n    ? (game.aiRun || 0) + 1 : 0;\n}\n' + 'var H0={},Va=')
replace_once('online:o.online||null,moveCount:0,queue:[]', 'online:o.online||null,moveCount:0,aiRun:0,queue:[]')
replace_once('let i=()=>{k.anim=null,e?cp(r,e):k.st=r.st', 'let i=()=>{blUpdateAiRun(k,r);k.anim=null,e?cp(r,e):k.st=r.st')
start = s.index('let e=Ys(k.st,k.level),o=')
end = s.index('if(e.cx!==void 0)', start)
assert end - start < 600
s = s[:start] + 'let e=Ys(k.st,k.level,k.aiRun);' + s[end:]
version = json.loads(Path('version.json').read_text())
assert version['version'] == '0.45.130-beta'
replace_once('Go="0.45.130-beta"', 'Go="0.45.131-beta"')
p.write_text(s)
version['version'] = '0.45.131-beta'
Path('version.json').write_text(json.dumps(version, indent=2) + '\n')
p = Path('tests/package.json')
s = p.read_text()
assert 'node world-friend-settings.test.cjs' in s
s = s.replace('"test:unit": "', '"test:unit": "node billiards-ai.test.cjs && ', 1)
p.write_text(s)
p = Path('.github/workflows/billiards-controls.yml')
s = p.read_text().replace("      - 'tests/billiards-controls-ui.test.cjs'", "      - 'tests/billiards-controls-ui.test.cjs'\n      - 'tests/billiards-ai.test.cjs'")
s = s.replace('      - name: Install locked test dependencies', '      - name: Check AI accuracy and consecutive scoring\n        run: node tests/billiards-ai.test.cjs\n      - name: Install locked test dependencies')
p.write_text(s)
print('Applied billiards AI balance and regression coverage')
