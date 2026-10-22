"""Render installation/share images from the approved note-shaped SVG.

Requires librsvg2-bin and fonts-noto-cjk. Run from the repository root.
"""
from pathlib import Path
import hashlib,re,shutil,subprocess,tempfile
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
for size in (192,512):
    subprocess.run(['rsvg-convert','--width',str(size),'--height',str(size),'--output',str(ROOT/f'icon-{size}.png'),str(ROOT/'favicon.svg')],check=True)

def padded(size,inset):
    inner=size-inset*2
    return f'<svg xmlns="{SVG}" width="{size}" height="{size}" viewBox="0 0 {size} {size}"><rect width="{size}" height="{size}" fill="#f7f8f4"/><svg x="{inset}" y="{inset}" width="{inner}" height="{inner}" viewBox="-16 -16 544 544">{body}</svg></svg>'
with tempfile.TemporaryDirectory() as directory:
    for filename,size,inset in [('icon-maskable-512.png',512,104),('apple-touch-icon.png',180,20)]:
        source=Path(directory)/'icon.svg';source.write_text(padded(size,inset))
        subprocess.run(['rsvg-convert','--output',str(ROOT/filename),str(source)],check=True)

share_path=ROOT/'brand/share.svg';share=share_path.read_text()
share,count=re.subn(r'(<g id="brand-mark"[^>]*>)[\s\S]*?(</g>)',lambda m:m[1]+'\n'+body+'\n'+m[2],share,count=1)
assert count==1,'Shared preview must have one approved brand mark.'
share_path.write_text(share)
subprocess.run(['rsvg-convert','--output',str(ROOT/'og-image.png'),str(share_path)],check=True)
assert [p.attrib['d'] for p in ET.fromstring(favicon).findall('{'+SVG+'}path')]==[p.attrib['d'] for p in ET.fromstring(share).find('{'+SVG+'}g').findall('{'+SVG+'}path')]
for name in ['favicon.svg','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','og-image.png']:
    data=(ROOT/name).read_bytes()
    print(name,len(data),hashlib.sha256(data).hexdigest())
