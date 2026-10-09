#!/usr/bin/env python3
"""Download a Commons candidate for visual review; never publishes or marks reviewed."""
import argparse
import hashlib
import html
import io
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from PIL import Image

AGENT = 'OjjudaMediaCuration/1.0 (https://ojjuda.kr)'
LICENSES = {'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/'}
for family in ('BY', 'BY-SA'):
    for version in ('2.0', '3.0', '4.0'):
        LICENSES[f'CC {family} {version}'] = f'https://creativecommons.org/licenses/{family.lower()}/{version}/'


def api(**params):
    request = Request('https://commons.wikimedia.org/w/api.php?' + urlencode(dict(action='query', format='json', **params)), headers={'User-Agent': AGENT})
    with urlopen(request, timeout=45) as response:
        value = json.load(response)
    if value.get('error'):
        raise ValueError(value['error'].get('code', 'commons_error'))
    return next(iter(value['query']['pages'].values()))


def download(raw, limit):
    parts = urlsplit(raw)
    if parts.scheme != 'https' or parts.hostname not in ('upload.wikimedia.org', 'thumb.wikimedia.org') or parts.port or parts.username or not parts.path.startswith('/wikipedia/commons/'):
        raise ValueError('Unexpected media host')
    url = urlunsplit((parts.scheme, parts.netloc, parts.path, '', ''))
    with urlopen(Request(url, headers={'User-Agent': AGENT}), timeout=90) as response:
        if response.geturl() != url:
            raise ValueError('Unexpected media redirect')
        data = response.read(limit + 1)
    if not data or len(data) > limit:
        raise ValueError('Candidate exceeds size limit')
    return url, data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--title', required=True, help='Exact Commons File: title')
    parser.add_argument('--caption', required=True, help='Original Korean caption, up to 100 characters')
    parser.add_argument('--out-dir', required=True)
    args = parser.parse_args()
    if not 1 <= len(args.caption) <= 100:
        raise ValueError('Caption must contain 1–100 characters')
    page = api(titles=args.title, prop='imageinfo', iiprop='url|size|mime|sha1|extmetadata', iiurlwidth=960)
    info = page['imageinfo'][0]
    metadata = info.get('extmetadata', {})
    license_name = html.unescape(metadata.get('LicenseShortName', {}).get('value', ''))
    if license_name not in LICENSES:
        raise ValueError('License is not explicitly allowed')
    artist = html.unescape(re.sub('<[^>]+>', '', metadata.get('Artist', {}).get('value', '')))
    artist = ' '.join(artist.split())
    if not artist:
        raise ValueError('Creator attribution missing')
    kind = 'video' if info['mime'].startswith('video/') or (info['mime'] == 'application/ogg' and info.get('duration', 0) > 0) else 'image'
    if kind == 'video':
        if not 0 < info.get('duration', 0) <= 90:
            raise ValueError('Video must be no longer than 90 seconds')
        vi = api(titles=args.title, prop='videoinfo', viprop='url|derivatives', viurlwidth=480)['videoinfo'][0]
        variants = [v for v in vi['derivatives'] if v['type'].startswith('video/webm') and 360 <= v.get('height', 0) <= 720]
        variants.sort(key=lambda v: (abs(v['height']-480), v.get('bandwidth', 0)))
        if not variants:
            raise ValueError('No suitable small WebM derivative')
        url, data = download(variants[0]['src'], 30 * 1024 * 1024)
        thumb_url, thumb = download(vi['thumburl'], 1024 * 1024)
        mime, suffix = 'video/webm', 'webm'
    else:
        url, data = download(info.get('thumburl') or info['url'], 30 * 1024 * 1024)
        image = Image.open(io.BytesIO(data))
        mime = Image.MIME.get(image.format)
        if mime not in ('image/jpeg', 'image/png', 'image/webp'):
            raise ValueError('Use a supported still-image derivative')
        suffix = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[mime]
        if len(data) > 1024 * 1024:
            ti = api(titles=args.title, prop='imageinfo', iiprop='url', iiurlwidth=320)['imageinfo'][0]
            thumb_url, thumb = download(ti['thumburl'], 1024 * 1024)
        else:
            thumb_url, thumb = url, data
    thumbnail = Image.open(io.BytesIO(thumb))
    thumb_mime = Image.MIME.get(thumbnail.format)
    if thumb_mime not in ('image/jpeg', 'image/png', 'image/webp'):
        raise ValueError('Unsupported thumbnail')
    small = thumbnail.convert('L').resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    dhash = ''.join('1' if pixels[y*9+x] > pixels[y*9+x+1] else '0' for y in range(8) for x in range(8))
    out = Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
    media_file = out / f"{page['pageid']}.{suffix}"
    media_file.write_bytes(data)
    thumb_suffix = {'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp'}[thumb_mime]
    thumb_file = out / f"{page['pageid']}-thumb.{thumb_suffix}"
    thumb_file.write_bytes(thumb)
    duration = 0
    if kind == 'video':
        result = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(media_file)], check=True, capture_output=True, text=True)
        duration = float(json.loads(result.stdout)['format']['duration'])
        if not 0 < duration <= 90:
            raise ValueError('Downloaded duration exceeds limit')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(media_file),'-vf',f'fps=12/{duration},scale=320:-1,tile=4x3','-frames:v','1',str(out / f"{page['pageid']}-contact.jpg")], check=True)
    source_page = f"https://commons.wikimedia.org/?curid={page['pageid']}"
    attribution = f'출처·제작: {artist}\n{source_page}\n{license_name} {LICENSES[license_name]}\n크기·인코딩 조정본, 내용 변경 없음.'
    if len(attribution) > 200:
        raise ValueError('Attribution exceeds comment budget; choose a different candidate without dropping required credit')
    manifest = dict(source_key=f"commons:{page['pageid']}",source_page=source_page,source_sha1=info['sha1'],content_sha256=hashlib.sha256(data).hexdigest(),thumb_sha256=hashlib.sha256(thumb).hexdigest(),thumb_dhash=dhash,download_url=url,thumb_url=thumb_url,kind=kind,mime=mime,thumb_mime=thumb_mime,file_size=len(data),thumb_size=len(thumb),duration=duration,caption=args.caption,attribution=attribution,license=license_name,reviewed_at=None)
    manifest_file = out / f"{page['pageid']}-candidate.json"
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'candidate':str(manifest_file),'media':str(media_file),'thumbnail':str(thumb_file),'kind':kind,'bytes':len(data),'status':'NEEDS_VISUAL_REVIEW'},ensure_ascii=False))


if __name__ == '__main__':
    main()
