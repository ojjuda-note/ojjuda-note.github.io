#!/usr/bin/env python3
"""Render Ojjuda's exact Korean wordmarks and their eight seasonal treatments.

The checked-in font is a renamed seven-Hangul-glyph OFL subset. SVG outputs
contain outlines, so public icons and Android do not download or load a font.
Requires Python 3, Pillow, fontTools and Inkscape; see the artwork README.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'brand/app-icons'
WORDMARK = ART / 'wordmark'
FONT = WORDMARK / 'font/OjjudaIconLettering-Regular.ttf'
APPS = {'agit': '아지트', 'park': '공원', 'pajang': '파장'}
THEMES = {
    'spring': ('봄', ('#155D56', '#3D6D43', '#825176'), '#F5B6CE'),
    'summer': ('여름', ('#086578', '#33703E', '#7152A0'), '#89E3D0'),
    'autumn': ('가을', ('#17594F', '#526338', '#783D59'), '#F6BD70'),
    'winter': ('겨울', ('#234F70', '#2D5B55', '#585985'), '#B7DDEC'),
    'newyear': ('새해', ('#173F4C', '#294E40', '#553B69'), '#F8D487'),
    'seollal': ('설', ('#19575B', '#3C604A', '#78425D'), '#F3BAC7'),
    'chuseok': ('추석', ('#435848', '#505E32', '#694868'), '#F2CF84'),
    'christmas': ('크리스마스', ('#124D40', '#2A533D', '#752E49'), '#F3C880'),
}


def leaf(x, y, scale=1, angle=0, color='#F4B765'):
    return f'''<g transform="translate({x} {y}) rotate({angle}) scale({scale})">
      <path d="M0 -47C43 -35 53 -3 0 49C-43 9 -42 -25 0 -47Z" fill="{color}"/>
      <path d="M0 37Q5 1 0 -32" fill="none" stroke="#FFF5D9" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>
    </g>'''


def flower(x, y, scale=1, color='#F5B6CE'):
    petals = ''.join(f'<ellipse cx="0" cy="-24" rx="17" ry="24" transform="rotate({angle})"/>' for angle in range(0, 360, 72))
    return f'<g transform="translate({x} {y}) scale({scale})" fill="{color}">{petals}<circle r="12" fill="#FFE6A0"/></g>'


def star(x, y, size=16, color='#FFF2D4'):
    return f'<path d="M{x} {y-size}Q{x+3} {y-3} {x+size} {y}Q{x+3} {y+3} {x} {y+size}Q{x-3} {y+3} {x-size} {y}Q{x-3} {y-3} {x} {y-size}Z" fill="{color}"/>'


def snowflake(x, y, scale=1):
    arms = ''.join(f'<path d="M0 -37V37M-10 -26L0 -16L10 -26M-10 26L0 16L10 26" transform="rotate({a})"/>' for a in (0, 60, 120))
    return f'<g transform="translate({x} {y}) scale({scale})" fill="none" stroke="#C5E8F6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">{arms}</g>'


def decorations(theme, top, bottom, accent):
    """Keep the theme outside the readable letterforms, inside the 800px crop."""
    upper = round(top - 70)
    lower = round(bottom + 61)
    if theme == 'spring':
        return (leaf(732, upper + 20, .65, 55, '#AFD7A5') + flower(699, upper, .95)
                + flower(752, upper + 30, .54, '#FFE3E8')
                + f'<path d="M344 {lower}Q478 {lower+25} 635 {lower-4}" fill="none" stroke="{accent}" stroke-width="13" stroke-linecap="round"/>'
                + flower(664, lower-3, .35))
    if theme == 'summer':
        return (f'<g transform="translate(730 {upper})"><circle r="33" fill="#F5D279"/>'
                + ''.join(f'<path d="M0 -49V-61" transform="rotate({a})" stroke="#F5D279" stroke-width="8" stroke-linecap="round"/>' for a in range(0, 360, 45)) + '</g>'
                + f'<path d="M306 {lower}Q350 {lower-23} 394 {lower}T482 {lower}T570 {lower}T658 {lower}T746 {lower}" fill="none" stroke="{accent}" stroke-width="15" stroke-linecap="round"/>'
                + f'<path d="M391 {lower+32}Q435 {lower+10} 479 {lower+32}T567 {lower+32}T655 {lower+32}" fill="none" stroke="#FFF4D9" stroke-opacity=".55" stroke-width="7" stroke-linecap="round"/>')
    if theme == 'autumn':
        return (leaf(718, upper+4, 1.03, 31, '#E9A263') + leaf(767, upper+24, .63, 80, '#F8D08D')
                + f'<path d="M335 {lower}Q478 {lower+23} 651 {lower-6}" fill="none" stroke="{accent}" stroke-width="13" stroke-linecap="round"/>'
                + leaf(310, lower-5, .38, -53, '#E1A475'))
    if theme == 'winter':
        return (snowflake(735, upper, 1.0) + snowflake(283, lower-2, .49)
                + f'<path d="M362 {lower}Q511 {lower+17} 660 {lower-8}" fill="none" stroke="#D5ECF6" stroke-width="15" stroke-linecap="round"/>'
                + f'<circle cx="790" cy="{upper+63}" r="8" fill="#D5ECF6"/>')
    if theme == 'newyear':
        rays = ''.join(f'<path d="M0 -25V-43" transform="rotate({a})"/>' for a in range(0, 360, 45))
        return (f'<g transform="translate(726 {upper+3})" stroke="#F1CB7C" stroke-width="7" stroke-linecap="round">{rays}</g>'
                + star(659, upper+21, 14) + star(793, upper+43, 12)
                + f'<path d="M349 {lower}Q511 {lower+31} 674 {lower-5}" fill="none" stroke="{accent}" stroke-width="12" stroke-linecap="round"/>'
                + star(308, lower-3, 14, accent))
    if theme == 'seollal':
        return (f'<g transform="translate(731 {upper+9}) rotate(12)"><path d="M0 -42C-44 -66 -58 -13 0 0C58 -13 44 -66 0 -42ZM0 0C-52 12 -35 53 0 24C35 53 52 12 0 0Z" fill="none" stroke="#EAB2BA" stroke-width="13" stroke-linejoin="round"/><circle cy="-6" r="10" fill="#F7D899"/><path d="M0 27V62" stroke="#F7D899" stroke-width="9" stroke-linecap="round"/></g>'
                + f'<path d="M344 {lower}Q486 {lower+22} 650 {lower-2}" fill="none" stroke="{accent}" stroke-width="13" stroke-linecap="round"/>'
                + star(290, top-26, 13, '#E6D5B7'))
    if theme == 'chuseok':
        return (f'<circle cx="729" cy="{upper+4}" r="43" fill="#F4D69A"/><circle cx="716" cy="{upper-9}" r="27" fill="#FFE8B6" opacity=".6"/>'
                + leaf(783, upper+39, .48, 45, '#D8B177')
                + f'<path d="M346 {lower}Q499 {lower+24} 667 {lower-6}" fill="none" stroke="{accent}" stroke-width="13" stroke-linecap="round"/>'
                + star(283, lower-3, 11, '#EDC983'))
    if theme == 'christmas':
        # A hat is perched above the first letter; no red shape covers its strokes.
        hat_y = round(top - 27)
        return (f'<g transform="translate(285 {hat_y}) rotate(-10)"><path d="M-58 -8Q-55 -93 25 -115Q34 -85 68 -76Q23 -68 49 -8Z" fill="#EB7169"/><path d="M-43 -34Q-28 -76 8 -93" fill="none" stroke="#FBA597" stroke-width="8" stroke-linecap="round"/><rect x="-66" y="-13" width="124" height="28" rx="14" fill="#FFF4E7"/><circle cx="68" cy="-77" r="19" fill="#FFF4E7"/></g>'
                + star(755, upper+19, 19, '#F4D597')
                + f'<path d="M359 {lower}Q501 {lower+23} 647 {lower-4}" fill="none" stroke="{accent}" stroke-width="12" stroke-linecap="round"/>'
                + leaf(689, lower-7, .39, 52, '#95BD90')
                + f'<circle cx="675" cy="{lower-8}" r="10" fill="#EC8879"/>')
    raise ValueError(theme)


def wordmark(font, word, width):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    paths, all_bounds = [], []
    cursor = 0
    for char in word:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        bounds = BoundsPen(glyphs)
        glyphs[name].draw(bounds)
        x0, y0, x1, y1 = bounds.bounds
        all_bounds.append((x0+cursor, y0, x1+cursor, y1))
        paths.append(f'<path transform="translate({cursor} 0)" d="{pen.getCommands()}"/>')
        cursor += font['hmtx'].metrics[name][0] + 26
    x0 = min(b[0] for b in all_bounds)
    y0 = min(b[1] for b in all_bounds)
    x1 = max(b[2] for b in all_bounds)
    y1 = max(b[3] for b in all_bounds)
    scale = width / (x1-x0)
    height = (y1-y0)*scale
    tx = 512-width/2-x0*scale
    ty = 513+height/2+y0*scale
    body = f'<g transform="rotate(-3 512 513)"><g transform="translate({tx:.6f} {ty:.6f}) scale({scale:.8f} {-scale:.8f})">' + ''.join(paths) + '</g></g>'
    return body, 513-height/2, 513+height/2


def svg_source(app, theme, font):
    title, backgrounds, accent = THEMES[theme]
    bg = backgrounds[list(APPS).index(app)]
    word, top, bottom = wordmark(font, APPS[app], 722 if app == 'agit' else 698)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="{APPS[app]} {title} 앱 아이콘">
  <title>{APPS[app]} · {title}</title>
  <desc>큰 한글 이름과 계절 장식. Bagel Fat One 기반 OFL 서브셋을 윤곽선으로 렌더링했습니다.</desc>
  <defs>
    <radialGradient id="glow"><stop stop-color="#FFFFFF" stop-opacity=".085"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFCF2"/><stop offset="1" stop-color="#F9E8CE"/></linearGradient>
    <g id="letters">{word}</g>
    <clipPath id="letter-mask"><use xlink:href="#letters"/></clipPath>
  </defs>
  <rect width="1024" height="1024" fill="{bg}"/>
  <circle cx="512" cy="478" r="425" fill="url(#glow)"/>
  <use xlink:href="#letters" transform="translate(0 10)" fill="{accent}" fill-opacity=".7"/>
  <rect x="100" y="240" width="824" height="520" fill="url(#ink)" clip-path="url(#letter-mask)"/>
  {decorations(theme, top, bottom, accent)}
</svg>
'''


def render(item):
    app, theme, source = item
    svg = WORDMARK / 'sources' / app / f'{theme}.svg'
    png = ART / 'seasonal' / app / f'{theme}.png'
    svg.parent.mkdir(parents=True, exist_ok=True)
    png.parent.mkdir(parents=True, exist_ok=True)
    svg.write_text(source, encoding='utf-8')
    result = subprocess.run([
        'inkscape', str(svg), '--export-type=png', f'--export-filename={png}',
        '--export-width=1024', '--export-height=1024'
    ], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr)
    with Image.open(png) as image:
        if image.size != (1024, 1024) or image.convert('RGBA').getextrema()[3] != (255, 255):
            raise ValueError(f'Not an opaque 1024px icon: {png}')
        image.convert('RGB').save(png, optimize=True)
    return {'app': app, 'theme': theme, 'path': str(png.relative_to(ROOT)), 'sha256': sha256(png.read_bytes()).hexdigest(), 'bytes': png.stat().st_size}


def rounded_icon(path, size):
    with Image.open(path) as image:
        icon = image.crop((112, 112, 912, 912)).resize((size, size), Image.Resampling.LANCZOS).convert('RGBA')
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size-1, size-1), radius=round(size*.225), fill=255)
    icon.putalpha(mask)
    return icon


def previews():
    # Proof sheets show the actual regular crop, not a larger artwork mock-up.
    typeface = ImageFont.truetype(str(FONT), 38)
    all_seasons = Image.new('RGB', (1664, 768), '#F4F2ED')
    for row, app in enumerate(APPS):
        for col, theme in enumerate(THEMES):
            icon = rounded_icon(ART / 'seasonal' / app / f'{theme}.png', 176)
            all_seasons.paste(icon, (col*208+16, row*256+48), icon)
    all_seasons.save(WORDMARK / 'seasonal-preview.png', optimize=True)
    hero = Image.new('RGB', (1500, 560), '#F4F2ED')
    for col, app in enumerate(APPS):
        icon = rounded_icon(ART / 'seasonal' / app / 'autumn.png', 384)
        hero.paste(icon, (col*500+58, 70), icon)
        draw = ImageDraw.Draw(hero)
        draw.text((col*500+250, 492), APPS[app], font=typeface, fill='#3A4540', anchor='mm')
    hero.save(WORDMARK / 'preview.png', optimize=True)
    small = Image.new('RGB', (800, 330), '#F4F2ED')
    draw = ImageDraw.Draw(small)
    label = ImageFont.truetype(str(FONT), 28)
    for col, app in enumerate(APPS):
        x = col*260+32
        draw.text((x, 15), APPS[app], fill='#3A4540', font=label)
        for row, theme in enumerate(('autumn', 'christmas')):
            for offset, size in ((0, 48), (74, 96)):
                icon = rounded_icon(ART / 'seasonal' / app / f'{theme}.png', size)
                small.paste(icon, (x+offset, 65+row*130), icon)
    small.save(WORDMARK / 'readability-48-96.png', optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previews-only', action='store_true')
    args = parser.parse_args()
    if args.previews_only:
        previews()
        return
    if not shutil.which('inkscape'):
        raise SystemExit('Inkscape is required to render the outlined SVG artwork.')
    font = TTFont(FONT)
    work = [(app, theme, svg_source(app, theme, font)) for app in APPS for theme in THEMES]
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(render, work))
    # The six top-level assets are the current default wordmark, not stale art.
    for app in APPS:
        image = Image.open(ART / 'seasonal' / app / 'summer.png')
        image.save(ART / f'{app}-maskable-1024.png', optimize=True)
        image.crop((112, 112, 912, 912)).resize((1024, 1024), Image.Resampling.LANCZOS).save(ART / f'{app}-1024.png', optimize=True)
    (WORDMARK / 'inventory.json').write_text(json.dumps({'revision': '20261120-korean-wordmarks-1', 'names': APPS, 'masters': records}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    previews()
    print(json.dumps({'masters': len(records), 'totalBytes': sum(r['bytes'] for r in records), 'preview': str((WORDMARK / 'preview.png').relative_to(ROOT))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
