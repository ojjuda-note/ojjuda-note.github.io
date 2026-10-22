from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import hashlib,json,struct

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'ops/share-image-edits.json').read_text())
for entry in manifest:
    path=root/entry['path']; data=path.read_bytes()
    assert hashlib.sha256(data).hexdigest()==entry['before'],entry['path']+': changed base'
    text=data.decode()
    for edit in entry['edits']:
        assert text.count(edit['old'])==edit['count'],entry['path']+': changed match count'
        text=text.replace(edit['old'],edit['new'])
    output=text.encode()
    assert hashlib.sha256(output).hexdigest()==entry['after'],entry['path']+': output mismatch'
    path.write_bytes(output)

class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(); self.values={}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='meta':
            key=attrs.get('property',attrs.get('name',''))
            self.values.setdefault(key,[]).append(attrs.get('content',''))

count=0
for entry in manifest:
    if not entry['path'].endswith('.html'): continue
    text=(root/entry['path']).read_text(); parser=Metadata(); parser.feed(text)
    for key in ['og:image','twitter:image']:
        values=parser.values[key]
        assert len(values)==1,(entry['path'],key,values)
        url=urlsplit(values[0])
        assert url.scheme=='https' and url.netloc=='ojjuda.kr'
        assert url.path=='/brand/og-agit-20261022.png' and not url.query
        image=(root/url.path.lstrip('/')).read_bytes()
        assert image[:8]==b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II',image[16:24])==(1200,630)
        assert image==(root/'og-image.png').read_bytes()
    for key in ['og:title','twitter:title']:
        assert len(parser.values[key])==1
        assert '오쭈다 월드' not in parser.values[key][0].replace('월드땅따먹기',''),(entry['path'],key)
    assert parser.values['og:image:alt']==['오쭈다 아지트 · 웃는 노트 로고']
    assert parser.values['twitter:card']==['summary_large_image']
    count+=1
assert count==22,count
assert hashlib.sha256((root/'brand/og-agit-20261022.png').read_bytes()).hexdigest()=='ba8f43e4b54bc749bb83ecff8ba768ba4678e11c4faf2782fb235dc820021de2'
print('Verified sharing metadata, titles and approved PNG on',count,'pages')
