from pathlib import Path
import json
import re
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
world_path = root / 'world.html'
world = world_path.read_text(encoding='utf-8')

replacements = [
    ('El();return}R&&R.running&&R.game&&R.game.onKey',
     'l.preventDefault();requestArcadeClose();return}R&&R.running&&R.game&&R.game.onKey'),
    ('o==="close"?El():o==="sound"?',
     'o==="close"?requestArcadeClose():o==="sound"?'),
    ('function El(){', '''
// User-requested exits ask first; internal teardown/replacement stays unconditional.
function requestArcadeClose(){
 const owner=R;
 if(!owner)return;
 if(owner.running){
  const leave=window.confirm("게임을 나갈까요?\\n진행 중인 판이 종료돼요.");
  if(R!==owner)return;
  if(!leave){owner.last=performance.now();return;}
 }
 El();
}
function El(){'''),
]
for old, new in replacements:
    if world.count(old) != 1:
        raise RuntimeError(f'Expected one unmodified anchor: {old}')
    world = world.replace(old, new, 1)

version_path = root / 'version.json'
metadata = json.loads(version_path.read_text(encoding='utf-8'))
old_version = metadata['version']
match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(.*)', old_version)
if not match:
    raise RuntimeError('Unexpected version format')
new_version = f'{match[1]}.{match[2]}.{int(match[3])+1}{match[4]}'
version_anchor = f'Go="{old_version}"'
if world.count(version_anchor) != 1:
    raise RuntimeError('Inline world version does not match version.json')
world = world.replace(version_anchor, f'Go="{new_version}"', 1)
metadata['version'] = new_version

package_path = root / 'tests' / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
if 'arcade-exit-ui.test.cjs' in package['scripts']['test:ui']:
    raise RuntimeError('Arcade regression test is already registered')
package['scripts']['test:ui'] = 'node arcade-exit-ui.test.cjs && ' + package['scripts']['test:ui']

world_path.write_text(world, encoding='utf-8')
version_path.write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Applied arcade exit confirmation: {old_version} -> {new_version}')
