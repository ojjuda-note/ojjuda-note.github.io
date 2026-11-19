"""Render the website's vector favicon and share images from the note-shaped SVG.

Requires librsvg2-bin and fonts-noto-cjk. Run from the repository root.
Installation icons are separate approved artwork in brand/app-icons; this
command must never overwrite them with the older note-shaped symbol.
"""
from pathlib import Path
import hashlib,re,shutil,subprocess
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
SVG='http://www.w3.org/2000/svg'
ET.register_namespace('',SVG)
if not shutil.which('rsvg-convert'):
    raise SystemExit('Install librsvg2-bin before rendering brand images.')
font=subprocess.check_output(['fc-match','Noto Sans CJK KR','-f','%{family}'],text=True)
if 'Noto Sans CJK' not in font:
    raise SystemExit('Install fonts-noto-cjk before rendering Korean share text.')

master=(ROOT/'brand/ojjuda-logo.svg').read_text()
assert master.count('#FF765F')==1
favicon=master.replace('#FF765F','#245A48')
paths=re.findall(r'<path\b[^>]+/>',favicon)
assert len(paths)==3,'Approved note logo must contain its body, fold and smile.'
body='\n'.join(paths)
(ROOT/'favicon.svg').write_text(favicon)

share_path=ROOT/'brand/share.svg';share=share_path.read_text()
share,count=re.subn(r'(<g id="brand-mark"[^>]*>)[\s\S]*?(</g>)',lambda m:m[1]+'\n'+body+'\n'+m[2],share,count=1)
assert count==1,'Shared preview must have one approved brand mark.'
share_path.write_text(share)
subprocess.run(['rsvg-convert','--output',str(ROOT/'og-image.png'),str(share_path)],check=True)
# Keep the old URL working; social previews use a new filename after rebranding.
shutil.copyfile(ROOT/'og-image.png',ROOT/'brand/og-agit-20261022.png')
assert [p.attrib['d'] for p in ET.fromstring(favicon).findall('{'+SVG+'}path')]==[p.attrib['d'] for p in ET.fromstring(share).find('{'+SVG+'}g').findall('{'+SVG+'}path')]
for name in ['favicon.svg','og-image.png','brand/og-agit-20261022.png']:
    data=(ROOT/name).read_bytes()
    print(name,len(data),hashlib.sha256(data).hexdigest())
