#!/usr/bin/env python3
"""Build the original watercolor backgrounds for Park. Requires Pillow."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache
import math
import os
from pathlib import Path
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = (1152, 864)
W, H = SIZE
FIRST, LAST = 190, 297

# Each pigment represents the color of the concentrated wash.
PIGMENT = {
    'ink': (58, 62, 65), 'indigo': (51, 78, 133), 'lake': (38, 133, 172),
    'jade': (40, 148, 137), 'pine': (68, 118, 85), 'moss': (125, 143, 76),
    'ochre': (170, 118, 51), 'gold': (224, 159, 27), 'apricot': (227, 130, 86),
    'vermilion': (206, 95, 82), 'rose': (190, 97, 136), 'violet': (130, 104, 167),
}
SINGLES = [key.split() for key in PIGMENT]
PAIRS = [s.split() for s in (
    'ink lake', 'indigo violet', 'lake gold', 'jade moss', 'pine ochre', 'violet rose',
    'ochre vermilion', 'gold apricot', 'apricot rose', 'vermilion indigo', 'rose lake', 'moss gold',
)]
MIXES = [s.split() for s in (
    'lake gold apricot violet', 'indigo jade moss', 'apricot rose violet', 'lake jade gold',
    'pine moss ochre', 'gold vermilion rose', 'lake violet rose', 'ochre gold jade',
    'indigo lake violet', 'apricot jade lake', 'rose vermilion ochre', 'moss jade violet gold',
)]
BRIGHT_PIGMENT = {
    **PIGMENT, 'lake': (20, 145, 202), 'gold': (245, 176, 13),
    'apricot': (244, 127, 77), 'rose': (203, 71, 130),
    'jade': (25, 155, 133), 'violet': (124, 71, 168),
}

# Each stanza describes a painted area: center, two radii, and the angle of its long axis.
LAYOUTS = (
    ((.21,.20,.39,.23,-10),(.60,.13,.28,.18,12),(.92,.32,.24,.22,-14),(.92,.72,.24,.27,-30),(.62,.86,.35,.19,4),(.17,.80,.29,.21,18),(.08,.51,.21,.23,31)),
    ((.11,.86,.34,.24,34),(.23,.64,.29,.18,-19),(.39,.87,.33,.18,12),(.15,.27,.21,.14,-30),(.73,.22,.31,.17,-17),(.90,.10,.28,.20,16),(.89,.44,.22,.16,-28)),
    ((.08,.67,.33,.15,-10),(.29,.75,.36,.19,-22),(.50,.88,.34,.16,6),(.83,.77,.40,.18,16),(.94,.54,.22,.17,-29),(.13,.12,.32,.12,8)),
    ((.08,.09,.39,.22,-6),(.35,.17,.34,.18,13),(.65,.12,.32,.14,-8),(.88,.24,.32,.23,17),(.94,.58,.20,.24,4),(.70,.85,.28,.15,-15)),
    ((.12,.25,.24,.35,4),(.18,.56,.25,.30,-27),(.12,.88,.32,.19,18),(.39,.86,.29,.15,5),(.79,.71,.25,.14,-31),(.94,.43,.19,.25,15),(.84,.13,.27,.17,-8)),
    ((.12,.12,.33,.15,-22),(.27,.20,.33,.12,8),(.11,.48,.21,.21,8),(.64,.69,.33,.15,25),(.83,.76,.37,.21,-15),(.93,.92,.33,.16,8)),
    ((.23,.17,.31,.19,-23),(.55,.15,.33,.13,12),(.76,.30,.28,.19,35),(.90,.48,.22,.23,9),(.30,.83,.34,.16,-8),(.06,.71,.23,.17,-28)),
    ((.14,.23,.35,.21,-12),(.23,.45,.29,.22,31),(.15,.73,.24,.20,-2),(.51,.84,.36,.13,17),(.80,.78,.32,.22,-22),(.89,.51,.21,.19,15)),
)


def noise(rng, resolution, target=SIZE):
    raw = Image.frombytes('L', resolution, rng.randbytes(resolution[0] * resolution[1]))
    return raw if resolution == target else raw.resize(target, Image.Resampling.BICUBIC)


@lru_cache(maxsize=1)
def paper():
    """Handmade paper has both short fibers and a fine, irregular surface tooth."""
    rng = random.Random(391073)
    fine = noise(rng, SIZE)
    tooth = Image.blend(fine, noise(rng, (415, 285)), .37)
    tooth = Image.blend(tooth, noise(rng, (18, 15)), .13)
    fibers = Image.new('L', SIZE, 128)
    draw = ImageDraw.Draw(fibers)
    for _ in range(4000):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        angle, length = rng.uniform(0, math.tau), rng.uniform(2, 16)
        dx, dy = length*math.cos(angle), length*math.sin(angle)
        draw.line([(x,y), (x+dx*.58,y+dy*.49+rng.uniform(-1,1)), (x+dx,y+dy)],
                  fill=rng.randint(56, 191), width=1)
    tooth = Image.blend(tooth, fibers, .18)
    channels = [tooth.point(lambda v, c=c: min(255, c + (v-128)*.110)) for c in (250,248,242)]
    return Image.merge('RGB', channels)


def shore(rng, x, y, rx, ry, angle):
    """The wet edge wanders over several scales, from broad lobes down to paper fibers."""
    phases = [rng.uniform(0, math.tau) for _ in range(6)]
    bend = rng.uniform(-.49, .49)
    skew = rng.uniform(-.26, .26)
    cos_a, sin_a = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    nodes = []
    count = rng.randint(19, 24)
    for i in range(count):
        a = math.tau * i / count
        r = (1 + .14*math.sin(2*a+phases[0]) + .17*math.sin(3*a+phases[1])
             + .095*math.sin(5*a+phases[2]) + .052*math.cos(8*a+phases[3]) + rng.uniform(-.09,.09))
        u, v = r*math.cos(a), r*math.sin(a)
        v += bend*(u*u-.4) + .09*math.sin(u*4 + phases[4])
        px, py = (u + skew*v)*rx, v*ry
        nodes.append((x + px*cos_a - py*sin_a, y + px*sin_a + py*cos_a))
    for intensity in (.17,.20,.22,.24,.25):
        refined = []
        for i, (ax,ay) in enumerate(nodes):
            bx,by = nodes[(i + 1) % len(nodes)]
            dx,dy = bx-ax,by-ay
            frac, side = rng.uniform(.40,.60), rng.uniform(-intensity,intensity)
            refined.extend(((ax,ay), (ax + frac*dx - dy*side, ay + frac*dy + dx*side)))
        nodes = refined
    return nodes


def end_on_paper(rng, nodes):
    """Let a wash finish on the sheet with its own soft, uneven silhouette."""
    lo_x, hi_x = min(x for x,_ in nodes), max(x for x,_ in nodes)
    lo_y, hi_y = min(y for _,y in nodes), max(y for _,y in nodes)
    left, top = max(lo_x,rng.uniform(10,43)), max(lo_y,rng.uniform(8,35))
    right, bottom = min(hi_x,W-rng.uniform(10,43)), min(hi_y,H-rng.uniform(8,35))
    sx, sy = (right-left)/(hi_x-lo_x), (bottom-top)/(hi_y-lo_y)
    return [(left+(x-lo_x)*sx,top+(y-lo_y)*sy) for x,y in nodes]


def render_shape(rng, sheet, nodes, ink, strength, field, tide=True):
    """Settle pigment within the wet edge, keeping broken tide lines and softer backruns."""
    softness = rng.uniform(.45,1.6) if tide else rng.uniform(2.3,7.8)
    reach = math.ceil(softness * 4 + 4)
    x0 = max(0, math.floor(min(x for x,_ in nodes)) - reach)
    y0 = max(0, math.floor(min(y for _,y in nodes)) - reach)
    x1 = min(W, math.ceil(max(x for x,_ in nodes)) + reach)
    y1 = min(H, math.ceil(max(y for _,y in nodes)) + reach)
    if x1 <= x0 or y1 <= y0:
        return
    rect = x0,y0,x1,y1
    pts = [(x-x0,y-y0) for x,y in nodes]
    mask = Image.new('L', (x1-x0,y1-y0))
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    edge = mask.filter(ImageFilter.GaussianBlur(softness))
    variation = field.crop(rect)
    density = variation.point(lambda v: min(255, strength * (.43 + v/232)))
    opacity = ImageChops.multiply(edge, density)
    if tide:
        # Water carried to the edge dries into a discontinuous line of more concentrated pigment.
        rim = Image.new('L', mask.size)
        ImageDraw.Draw(rim).line(pts + pts[:1], fill=210, width=rng.choice((2,2,3,4)), joint='curve')
        rim = rim.filter(ImageFilter.GaussianBlur(rng.uniform(.65,1.45)))
        deposits = variation.point(lambda v: min(235,max(0,(v-83)*1.55)))
        opacity = ImageChops.add(opacity, ImageChops.multiply(rim, deposits))
    sheet.paste(ink, rect, opacity)


def texture(rng):
    coarse = noise(rng,(11,9))
    middle = noise(rng,(48,39))
    pools = Image.blend(coarse, middle, .42)
    return Image.blend(pools, noise(rng, (389,272)), .21)


@lru_cache(maxsize=1)
def reading_room():
    # Ease the amount of paint at the optical center, keeping paper visible through the wash.
    w,h = 193,145
    values = []
    for j in range(h):
        for i in range(w):
            r = ((i/(w-1)-.50)/.62)**2 + ((j/(h-1)-.49)/.56)**2
            t = min(1, r/1.25)
            values.append(round(161 + 94*t*t*(3-2*t)))
    return Image.frombytes('L',(w,h),bytes(values)).resize(SIZE,Image.Resampling.BICUBIC)


def build_card(key, out):
    group, position = divmod(key - FIRST, 36)
    palette_index, variant = divmod(position, 3)
    hues = (SINGLES, PAIRS, MIXES)[group][palette_index]
    rng = random.Random(76261 * key + 13)
    layout = LAYOUTS[(palette_index*2 + variant*3 + group) % len(LAYOUTS)]
    dry_margin = variant == 2
    bright = variant == 2 and group > 0 and palette_index % 3 != 2
    pigment = BRIGHT_PIGMENT if bright else PIGMENT
    field = texture(rng)
    sheet = paper().copy()

    def paint(nodes, ink, strength, tide=True):
        if dry_margin:
            nodes = end_on_paper(rng,nodes)
        render_shape(rng,sheet,nodes,ink,strength*(1.29 if bright else 1),field,tide)

    washes = []
    for i,(u,v,rx,ry,angle) in enumerate(layout):
        cx = (u+rng.uniform(-.05,.05))*W
        cy = (v+rng.uniform(-.055,.055))*H
        if variant == 2:
            cx = W - cx
            angle = -angle
        sx, sy = rx*rng.uniform(.86,1.11)*W, ry*rng.uniform(.84,1.12)*H
        if dry_margin:
            cx, cy = W*.5 + .87*(cx-W*.5), H*.5 + .90*(cy-H*.5)
            sx, sy = sx*.87, sy*.90
        ink = pigment[hues[min(len(hues)-1, i*len(hues)//len(layout))]]
        washes.append((cx,cy,sx,sy,angle,ink))

    # A broad, faint wet-on-wet underpainting links the separate deposits.
    for cx,cy,rx,ry,angle,ink in washes:
        nodes = shore(rng,cx,cy,rx*1.45,ry*1.4,angle)
        paint(nodes,ink,rng.randint(24,41),tide=False)

    for i,(cx,cy,rx,ry,angle,ink) in enumerate(washes):
        nodes = shore(rng,cx,cy,rx,ry,angle)
        paint(nodes,ink,rng.randint(68,112))
        # A second brushload pools unevenly towards an outer edge, with paper exposed between strokes.
        if rng.random() < .78:
            off_x = rx*rng.uniform(.10,.40)*(1 if cx>W*.5 else -1)
            off_y = ry*rng.uniform(-.25,.25)
            deeper = shore(rng,cx+off_x,cy+off_y,rx*rng.uniform(.43,.72),ry*rng.uniform(.48,.83),angle+rng.uniform(-22,22))
            paint(deeper,ink,rng.randint(51,92))
        if i % 3 == variant % 3:
            # A backrun is cleaner water flowing into a still-wet wash.
            bloom = shore(rng,cx+rx*.15,cy-ry*.17,rx*.51,ry*.47,angle+11)
            lighter = tuple(round(ch*.18 + p*.82) for ch,p in zip(ink,(252,250,244)))
            paint(bloom,lighter,rng.randint(42,77),tide=False)

    sheet = Image.composite(sheet,paper(),reading_room())
    # Reintroduce the fine tooth where pigment covers the paper.
    grain = noise(rng,SIZE).point(lambda v: 128 + (v-128)*.037)
    sheet = Image.merge('RGB', [ImageChops.add(ch,grain,offset=-128) for ch in sheet.split()])
    file = Path(out) / f'{key}.jpg'
    sheet.save(file, quality=86, optimize=True, subsampling=1)
    return key


def parse_keys(raw):
    keys = sorted({int(k) for k in raw.split(',')})
    if not keys or any(k < FIRST or k > LAST for k in keys):
        raise argparse.ArgumentTypeError(f'keys must be between {FIRST} and {LAST}')
    return keys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('staged_root', type=Path)
    parser.add_argument('--only', type=parse_keys, help='comma-separated keys for a partial build')
    parser.add_argument('--jobs', type=int, default=min(4,os.cpu_count() or 1))
    args = parser.parse_args()
    out = args.staged_root / 'note' / 'assets'
    out.mkdir(parents=True,exist_ok=True)
    keys = args.only or list(range(FIRST,LAST+1))
    if args.jobs <= 1:
        for key in keys:
            build_card(key,out)
    else:
        with ProcessPoolExecutor(min(len(keys), args.jobs)) as pool:
            list(pool.map(build_card,keys,[out]*len(keys)))
    print(f'Painted {len(keys)} backgrounds in {out}')


if __name__ == '__main__':
    main()
