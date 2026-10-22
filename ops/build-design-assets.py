"""Original, resolution-independent Ojjuda interface illustrations.
All paths are authored for this redesign; no retired artwork is reused.
"""
from pathlib import Path
import json, sys
R=Path.cwd()
A=R/'assets/design'; (A/'games').mkdir(parents=True,exist_ok=True); (A/'themes').mkdir(exist_ok=True)
def svg(content,w=600,h=360):
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none">{content}</svg>\n'
def path(d,color,stroke=None,width=2):
 return f'<path d="{d}" fill="{color}"'+(f' stroke="{stroke}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"' if stroke else '')+'/>'
def circle(x,y,r,c):return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>'
def rect(x,y,w,h,c,r=0):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{c}"/>'
def group(content,transform):return f'<g transform="{transform}">{content}</g>'
green='#527864';deep='#244b3a';sage='#a7bda2';gold='#d6ad6a';cream='#f6f0dc';coral='#ca8e76';ink='#304a3d'
icons={
'arcade':'<path d="M7 8h10c2 0 3 2 3.4 4l.9 5c.4 2-1.8 3.1-3.1 1.7L15.5 16h-7l-2.7 2.7C4.5 20.1 2.3 19 2.7 17l.9-5C4 10 5 8 7 8Z"/><path d="M7 10.5v5M4.5 13H9.5M15 12h.1M18 14h.1M9 5h6"/>',
'park':'<path d="M12 3C7 3 6 7 7 9c-5 2-4 8 1 8h8c5 0 6-6 1-8 1-2 0-6-5-6ZM12 12v9M7 21h10"/>',
'gear':'<path d="M5 5h14M5 12h14M5 19h14"/><circle cx="9" cy="5" r="2" fill="var(--surface,white)"/><circle cx="15" cy="12" r="2" fill="var(--surface,white)"/><circle cx="10" cy="19" r="2" fill="var(--surface,white)"/>',
'user':'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
'home':'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
'door':'<path d="M5 21V3h13v18M4 21h16M14 12h.1"/>',
'palette':'<path d="M12 3a9 9 0 1 0 0 18h1c2 0 3-2 1-4-1-2 1-3 3-3h1c4 0 4-11-6-11Z"/><path d="M7 9h.1M11 6h.1M16 8h.1M6 14h.1"/>',
'bag':'<path d="M4 8h16l-1 13H5L4 8ZM8 8V6a4 4 0 0 1 8 0v2"/>',
'clip':'<path d="m9 15 7-7a3 3 0 0 0-4-4l-8 8a5 5 0 0 0 7 7l9-9M8 16l9-9"/>',
'plus':'<path d="M12 4v16M4 12h16"/>',
'teleport':'<path d="M3 18h18M7 14l5-10 5 10M9 10h6"/>',
'wave':'<path d="M3 9q3-6 6 0t6 0t6 0M3 16q3-6 6 0t6 0t6 0"/>',
'life':'<path d="M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z"/>',
'chevL':'<path d="m14 5-7 7 7 7"/>','chevR':'<path d="m10 5 7 7-7 7"/>',
'display':'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
'shield':'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
'help':'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 17h.01"/>'}
(A/'interface.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(f'<symbol id="{k}" viewBox="0 0 24 24">{v}</symbol>' for k,v in icons.items())+'</svg>\n')
logo=rect(0,0,96,96,deep,27)+path('M24 58V44a24 24 0 0 1 48 0v14H58V44a10 10 0 0 0-20 0v14Z',cream)+circle(31,69,7,gold)+circle(65,69,7,sage)
(R/'favicon.svg').write_text(svg(logo,96,96))
# Small sculptural game emblems, each drawn around its own game mechanics.
games={
'mines':rect(31,19,54,47,sage,7)+rect(36,24,44,37,cream,3)+path('M57 32v27M57 32h19l-6 8 6 8H57',coral,deep,2)+rect(49,59,17,3,deep,1),
'saetbyeol':circle(60,42,29,'#e3d5a2')+path('m60 13 8 19 21 2-16 14 5 21-18-11-18 11 5-21-16-14 21-2Z',gold)+circle(91,22,3,coral)+circle(28,62,4,sage),
'photo_ttang':rect(28,15,64,53,cream,5)+rect(33,20,54,43,sage,3)+circle(72,30,7,gold)+path('M33 57 49 35l17 20 10-12 11 15v5H33Z',green)+path('M52 21v20h33','none',coral,4),
'mole':path('M23 66q37-25 74 0',sage)+path('M39 61V41a21 21 0 0 1 42 0v20Z',coral)+circle(53,42,2,deep)+circle(67,42,2,deep)+circle(60,50,5,cream)+group(rect(79,15,5,28,green,2)+rect(69,12,24,12,gold,3),'rotate(22 81 25)'),
'runner':path('M17 64h87','none',sage,3)+circle(65,19,7,gold)+path('m56 29 12 9 15-2M60 31l-8 14-16-1M61 39l9 15 18 9M59 42 47 58l-16 4','none',green,7)+path('M18 29h22M21 37h12','none',coral,3),
'stacker':rect(22,59,76,12,green,3)+rect(29,45,63,12,sage,3)+rect(36,31,48,12,gold,3)+rect(47,17,38,12,coral,3),
'breakout':''.join(rect(24+c*19,18+r*11,17,8,[green,sage,gold][r],2) for r in range(3) for c in range(4))+circle(64,53,5,coral)+rect(40,66,43,5,green,2)+path('m64 53 8-10','none',coral,2),
'spot':rect(23,17,42,49,sage,5)+rect(29,23,30,37,cream,3)+circle(44,36,7,gold)+path('m29 56 14-13 16 17',green)+circle(74,43,16,cream)+path('m84 55 14 15','none',deep,7)+'<circle cx="74" cy="43" r="16" stroke="#527864" stroke-width="5"/>'+circle(73,42,6,coral),
'screw':group(rect(31,32,61,20,gold,8)+circle(42,42,7,cream)+path('m38 42h8','none',green,2)+circle(81,42,7,cream)+path('m77 42h8','none',green,2),'rotate(-24 60 42)')+group(rect(34,31,51,20,green,8)+circle(44,41,7,cream)+path('m40 41h8','none',deep,2)+circle(76,41,7,cream)+path('m72 41h8','none',deep,2),'rotate(36 60 42)'),
'tank':rect(27,48,66,18,deep,9)+rect(31,43,58,14,sage,5)+rect(47,26,29,21,green,5)+rect(68,31,30,6,green,2)+''.join(circle(x,57,4,gold) for x in [38,51,65,79]),
'tour':path('M28 28 57 16l35 13v33L61 72 28 59Z',sage)+path('M57 16v36l35 10M28 28l33 12 31-11M61 40v32','none',cream,3)+rect(45,33,31,29,cream,7)+circle(53,41,3,green)+circle(68,54,3,green)+circle(61,48,3,green),
'ttang':rect(24,17,72,52,sage,6)+path('M25 43h25V18M50 43v25M51 43h44','none',cream,3)+path('M51 44h43v23H51Z',green)+circle(50,43,5,coral),
'janggi':path('M28 21h62M28 38h62M28 55h62M36 15v48M58 15v48M80 15v48','none',sage,2)+circle(48,38,17,cream)+circle(77,56,16,gold)+'<text x="48" y="44" text-anchor="middle" font-size="18" font-family="serif" fill="#527864">楚</text><text x="77" y="62" text-anchor="middle" font-size="18" font-family="serif" fill="#724c35">漢</text>',
'chess':path('M37 68h48l-3-8H40Zm8-10h32L71 44l5-15-9-12-17 2-7 15 12 4-3 8Z',green)+circle(61,27,2,cream)+path('M43 34h12','none',gold,3),
'carom4':rect(20,19,80,49,green,8)+rect(25,24,70,39,sage,4)+circle(46,45,10,cream)+circle(68,36,10,coral)+circle(77,55,9,gold)+path('m22 67 53-48','none',cream,3),
'matgo':group(rect(29,18,34,49,coral,4)+rect(34,23,24,39,cream,1)+path('M36 55 53 30M39 41l12 5','none',green,3)+circle(51,32,6,gold),'rotate(-14 46 42)')+group(rect(60,17,34,49,deep,4)+rect(65,22,24,39,cream,1)+circle(77,36,8,coral)+path('M65 60 73 45 88 55v5Z',green),'rotate(13 77 42)')}
for name,art in games.items():
 (A/'games'/f'{name}.svg').write_text(svg('<ellipse cx="60" cy="71" rx="36" ry="3" fill="#243c3010"/>'+art,120,84))

# Illustrated editorial scenes. Negative space on the left supports real HTML text.
defs='''<defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="shade" x2=".8" y2="1"><stop stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#1d362d" stop-opacity=".08"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#243c30" flood-opacity=".10"/></filter></defs>'''
def leaf(x,y,color,angle=0,size=1):return group(path('M0 0C-45-12-37-69 0-82C37-69 45-12 0 0Z',color)+path('M0-6v-60','none','#fff8',1.4),f'translate({x} {y}) rotate({angle}) scale({size})')
def blossom(x,y,color,scale=1):return group(''.join(group('<ellipse cy="-14" rx="10" ry="15" fill="'+color+'"/>',f'rotate({i*72})') for i in range(5))+circle(0,0,7,gold),f'translate({x} {y}) scale({scale})')
def heart(x,y,color,scale=1):return group(path('M0 22C-55-10-22-43 0-20C22-43 55-10 0 22Z',color),f'translate({x} {y}) scale({scale})')
def tree(x,y,color,size=1):return group(rect(-5,-60,10,72,'#9d9277',3)+leaf(0,-25,color,0,1.2)+leaf(-19,-10,color,-38,.7)+leaf(20,-10,color,38,.7),f'translate({x} {y}) scale({size})')
def book(x,y,color):return group(path('M-52-24Q-25-35 0-22Q25-35 52-24V30Q25 19 0 32Q-25 19-52 30Z',cream)+path('M-52-24v54Q-25 19 0 32Q25 19 52 30v-54','none',color,3)+path('M0-22v54M-39-11l25-3M-39-1l25-3M14-14l25 3M14-4l25 3','none',color,2),f'translate({x} {y}) rotate(-10)')
def gift(x,y,color):return group(rect(-34,-24,68,58,color,5)+rect(-38,-33,76,16,cream,3)+rect(-6,-33,12,67,gold)+path('M0-34c-46-36-45 12 0 0c46-36 45 12 0 0','none',gold,5),f'translate({x} {y})')
def lantern(x,y,color):return group(path('M0-67v25','none',gold,2)+rect(-17,-44,34,8,green,2)+'<ellipse cy="0" rx="35" ry="39" fill="'+color+'"/>'+path('M0-37v74M-18-30q-12 30 0 60M18-30q12 30 0 60','none','#fff9',2)+rect(-17,36,34,7,green,2)+path('M0 43v24M-6 49v19M6 49v19','none',gold,2),f'translate({x} {y})')
def scene(art):return svg(defs+'<path d="M250 360c40-100 144-124 350-86v86Z" fill="#fff" fill-opacity=".22"/><ellipse cx="449" cy="303" rx="119" ry="15" fill="#253b2c" fill-opacity=".06"/><g filter="url(#s)">'+art+'</g>')
base=tree(510,250,sage,1.3)+group(rect(0,0,115,65,sage,24)+path('M24 22v24M12 34h24','none',cream,7)+circle(85,24,5,coral)+circle(98,39,5,gold), 'translate(350 218) rotate(-12)')+gift(463,286,coral)
(A/'welcome.svg').write_text(scene(base))
scenes={
'spring':path('M430 315q20-90 10-210M445 185l-53-39M445 151l49-43','none',green,7)+''.join(blossom(x,y,c,sc) for x,y,c,sc in [(441,100,'#e9bac4',1.15),(393,140,'#f0cbd0',1),(494,102,'#e8b4c2',1.1),(451,170,'#f1ced1',.9),(500,170,'#d9a1b2',.8)])+leaf(408,246,sage,-45,.6)+rect(393,264,90,60,cream,12),
'summer':circle(480,102,44,'#e9bf6c')+path('M300 260q50-50 100 0t100 0t100 0v100H300Z','#a8c7cb')+path('M280 290q50-40 100 0t100 0t100 0v70H280Z','#669d9f')+path('m407 130-58 110h111Z',cream)+path('M407 128v129M340 261h141l-23 27h-98Z',green,green,3)+path('M550 270q-20-70 0-147','none',sage,7)+leaf(550,169,sage,-55,.7),
'autumn':tree(475,250,'#c28651',1.3)+leaf(375,280,'#e2b76b',-48,.95)+leaf(516,298,'#a66c4b',56,.85)+group(rect(0,0,83,52,cream,8)+path('M80 9c40-8 40 46 0 36','none',coral,8)+path('M21-12q-10-12 0-24M47-12q-10-12 0-24','none',gold,3),'translate(385 267)'),
'winter':tree(485,257,'#8faeb5',1.4)+circle(388,276,38,cream)+circle(388,221,27,'#fffdf4')+rect(357,237,61,11,'#638492',4)+path('m390 219 21 4-21 4Z',coral)+circle(380,217,2,deep)+''.join(circle(x,y,r,'#fff') for x,y,r in [(335,130,5),(429,88,4),(540,193,6),(391,159,3),(520,82,4)]),
'hangeul':book(425,263,'#647b8f')+group(rect(-43,-43,86,86,'#d5e0e7',10)+'<text y="17" text-anchor="middle" font-family="sans-serif" font-size="55" font-weight="700" fill="#3c5368">한</text>','translate(443 149) rotate(-8)')+group(rect(-27,-27,54,54,cream,7)+'<text y="12" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#947345">글</text>','translate(525 233) rotate(12)'),
'liberation':path('M365 312V91','none','#71828b',5)+path('M368 97q81 24 161 2v113q-80 26-161-1Z','#fffdf7')+group('<circle r="28" fill="#b56565"/><path d="M-28 0a28 28 0 0 0 56 0A14 14 0 0 0 0 0a14 14 0 0 1-28 0Z" fill="#52768b"/>','translate(448 155) rotate(-31)')+''.join(group(path('M-14-5h28M-14 0h28M-14 5h28','none','#31475a',2.5),f'translate({x} {y}) rotate({angle})') for x,y,angle in [(395,123,-45),(500,190,-45)])+blossom(510,278,'#e8c5ce',1)+leaf(523,313,sage,50,.7),
'christmas':path('M463 90 408 172h26l-42 66h38l-35 56h139l-36-56h35l-43-66h26Z','#446957')+rect(455,291,15,28,'#af8d67',3)+path('m464 72 5 11 12 1-9 8 2 12-10-6-10 6 2-12-9-8 12-1Z',gold)+''.join(circle(x,y,5,c) for x,y,c in [(454,164,gold),(484,205,coral),(442,235,cream),(480,270,gold)])+gift(371,291,'#b77770')+gift(524,305,'#a4b5a0'),
'seollal':lantern(510,155,'#c58b77')+group(path('M-50-15Q-70 55 0 65Q70 55 50-15L25-26h-50Z','#7c9899')+path('M-50-15Q0 5 50-15L25-26h-50Z',cream)+path('M0-15v78M-22 6l44 0','none',gold,5)+circle(0,30,13,cream)+'<text y="36" text-anchor="middle" font-family="serif" font-size="18" fill="#7c6653">福</text>','translate(408 231)')+path('M362 316q80-15 160 0','none',gold,2),
'chuseok':circle(463,144,65,'#efd79b')+path('M305 293q83-80 157-15t138 20v62H305Z','#b5b890')+path('M353 318q72-49 133-10t114 5v47H353Z','#7c8d69')+group(path('M-40 0q40-55 80 0q-40 30-80 0Z',cream)+path('M-12 14q35-42 66 0q-26 28-66 0Z','#bcc7a3'),'translate(415 291)')+leaf(534,277,gold,30,.7),
'buddha':lantern(388,170,'#d7a0b0')+lantern(507,126,'#c4ba80')+group(''.join(group(path('M0 5C-45-10-30-55 0-74C30-55 45-10 0 5Z',c),f'rotate({ang})') for c,ang in [('#b5c3a3',-65),('#b5c3a3',65),('#dbb5c2',-32),('#dbb5c2',32),('#efd1da',0)])+path('M-57 4q57 27 114 0','none',green,4),'translate(456 295)'),
'halloween':circle(502,111,39,'#e4c789')+path('M520 74a38 38 0 0 0 0 74a38 38 0 0 1 0-74Z','#d8c7a7')+group('<ellipse rx="58" ry="44" fill="#c68b55"/><ellipse rx="35" ry="44" fill="#d99f63"/><ellipse rx="16" ry="44" fill="#e7ad70"/>'+path('M0-44q-12-25 7-28','none',green,8)+path('m-28-7 11-10 9 10Zm37 0 11-10 10 10Z',deep)+path('M-21 13q21 20 42 0','none',deep,4),'translate(429 267)')+path('M326 173q15-25 34 0q18-25 35 0q-20-2-35 20q-15-22-34-20Z','#675975'),
'children':group(path('M0-57 47 0 0 57-47 0Z','#dfb76f')+path('M0-57V57M-47 0h94','none',cream,3)+path('M0 57q-32 19 6 40t-7 39','none',green,2),'translate(448 156) rotate(15)')+rect(353,270,50,50,'#93b2b3',7)+rect(404,287,38,33,cream,5)+path('m505 251 34 69h-68Z','#dba28b')+circle(366,176,17,'#a9bd97'),
'parents':path('M430 311v-115M430 259l-35-29M430 241l39-31','none',green,5)+leaf(434,272,sage,50,.6)+leaf(424,291,green,-50,.6)+''.join(blossom(x,y,c,.6) for x,y,c in [(430,180,'#ba7580'),(412,188,'#cf8a96'),(449,186,'#cf8a96'),(429,198,'#e2a7af')])+path('M397 295h67l-9 35h-49Z',cream)+heart(515,202,gold,.45),
'teachers':book(431,276,'#8b806b')+group(rect(-6,-60,12,112,'#ba9770',3)+path('m-6 52 6 16 6-16Z',cream)+path('m-2 62 2 6 2-6Z',deep),'translate(499 212) rotate(25)')+blossom(404,159,'#cb9297',1)+path('M404 180v50','none',green,4)+leaf(405,223,sage,55,.4),
'pepero':''.join(group(rect(-6,-63,12,127,'#c99f70',5)+rect(-6,-63,12,90,c,5)+''.join(circle(x,y,1.7,cream) for x,y in [(-2,-45),(2,-30),(-1,-13),(2,5)]),f'translate({x} {y}) rotate({ang})') for x,y,ang,c in [(390,235,-18,'#745549'),(437,218,4,'#8b6350'),(487,237,19,'#ba8c79')])+path('M362 274q70 35 143 1l-12 54H375Z',cream)+path('M430 286v43M411 300h39','none',coral,5),
'valentine':heart(445,175,'#b97583',1.7)+group(rect(-55,-30,110,62,'#ad8c78',7)+rect(-48,-23,96,48,'#6e5248',3)+''.join(rect(x,y,24,17,'#947063',3) for x in [-41,-12,17] for y in [-17,5]),'translate(441 286) rotate(-8)')+heart(525,242,gold,.55),
'white':group(circle(0,0,34,'#efe2dc')+path('M-34-18-23 0-34 18-53 20-47 0-53-20Z','#b6ced0')+path('M34-18 23 0 34 18 53 20 47 0 53-20Z','#b6ced0')+path('M-12-28q36 24 22 57','none','#d5b5b9',7),'translate(446 156) rotate(-19)')+gift(429,283,'#adc6c6')+heart(518,261,'#d8aeb8',.65),
'newyear':circle(471,158,59,'#e8ba77')+path('M300 293q120-91 300-7v74H300Z','#9fb5ab')+path('M300 327q120-76 300-7v40H300Z','#698d7b')+path('M405 99l-9-25M474 73V46M533 98l14-20','none',gold,3)+path('M351 227q15-19 30 0M522 228q15-19 30 0','none',cream,3)
}
def trigram(bits,x,y,angle):
 lines=''
 for i,solid in enumerate(bits):
  yy=(i-1)*6
  lines+=rect(-13,yy-1.5,26,3,'#31475a') if solid else rect(-13,yy-1.5,10,3,'#31475a')+rect(3,yy-1.5,10,3,'#31475a')
 return group(lines,f'translate({x} {y}) rotate({angle})')
scenes['liberation']=path('M365 312V91','none','#71828b',5)+rect(368,97,164,116,'#fffdf7',2)+group('<circle r="27" fill="#b56565"/><path d="M-27 0a27 27 0 0 0 54 0A13.5 13.5 0 0 0 0 0a13.5 13.5 0 0 1-27 0Z" fill="#52768b"/>','translate(450 155) rotate(-33)')+trigram([1,1,1],397,120,-55)+trigram([0,1,0],504,120,55)+trigram([1,0,1],397,190,55)+trigram([0,0,0],504,190,-55)+blossom(510,278,'#e8c5ce',1)+leaf(523,313,sage,50,.7)
for name,art in scenes.items():(A/'themes'/f'{name}.svg').write_text(scene(art))
# The same original symbols become install/share icons at release time using CairoSVG.
try:
 import cairosvg
 for filename,size in [('icon-192.png',192),('icon-512.png',512),('icon-maskable-512.png',512),('apple-touch-icon.png',180)]:
  cairosvg.svg2png(bytestring=svg(logo,96,96).encode(),write_to=str(R/filename),output_width=size,output_height=size)
 og=(R/'brand'/'share.svg').read_text()
 cairosvg.svg2png(bytestring=og.encode(),write_to=str(R/'og-image.png'))
except ImportError:print('CairoSVG unavailable; release pipeline must render the icons.')
print('Created interface family, 16 game illustrations and',len(scenes),'individual theme scenes.')
