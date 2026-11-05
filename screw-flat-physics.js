/* Rigid metal pieces, board holes and screw joints for the flat puzzle. */
(function () {
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./vendor/matter-0.20.0.min.js'):window.Matter;
  const BOARD={x:24,y:143,w:312,h:346},STEP=1000/120,SCREW_RADIUS=13,LAST_STAGE=1000;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const BODY_ID=Symbol.for('ojjuda.flat.body'),PINNED_BODIES=Symbol.for('ojjuda.flat.pinnedBodies');
  // A per-body exclusion avoids the 32-category bitmask limit at fifty plates.
  if(!M.Detector.canCollide.ojjudaFlat){
    const canCollide=M.Detector.canCollide;
    const filter=(a,b)=>canCollide(a,b)&&!a[PINNED_BODIES]?.has(b[BODY_ID])&&!b[PINNED_BODIES]?.has(a[BODY_ID]);
    filter.ojjudaFlat=true;M.Detector.canCollide=filter;
  }
  const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function worldPoint(p,v){const co=Math.cos(p.angle),si=Math.sin(p.angle);return{x:p.x+v.x*co-v.y*si,y:p.y+v.x*si+v.y*co};}
  function localPoint(p,x,y){const co=Math.cos(p.angle),si=Math.sin(p.angle),dx=x-p.x,dy=y-p.y;return{x:dx*co+dy*si,y:-dx*si+dy*co};}
  function polygonDistance(vertices,x,y){
    let inside=false,distance=Infinity;
    for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
      const a=vertices[j],b=vertices[i],dx=b.x-a.x,dy=b.y-a.y;
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
      distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
    }
    return inside?-distance:distance;
  }
  function plateCovers(p,x,y,radius=0){
    if(p.state==='gone')return false;
    const q=localPoint(p,x,y);
    return polygonDistance(p.vertices,q.x,q.y)<radius;
  }
  function segmentDistance(a,b,c,d){
    const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,det=ux*vy-uy*vx;
    if(Math.abs(det)>1e-8){
      const x=c.x-a.x,y=c.y-a.y,t=(x*vy-y*vx)/det,s=(x*uy-y*ux)/det;
      if(t>=0&&t<=1&&s>=0&&s<=1)return 0;
    }
    const distance=(p,q,r)=>{const x=r.x-q.x,y=r.y-q.y,t=clamp(((p.x-q.x)*x+(p.y-q.y)*y)/(x*x+y*y||1),0,1);return Math.hypot(p.x-q.x-t*x,p.y-q.y-t*y);};
    return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
  }
  function plateBlocksSlot(p,hole,radius){
    const dx=Math.cos(-.28)*radius*.62,dy=Math.sin(-.28)*radius*.62;
    const a=localPoint(p,hole.x-dx,hole.y-dy),b=localPoint(p,hole.x+dx,hole.y+dy),margin=radius*.13;
    return polygonDistance(p.vertices,a.x,a.y)<margin||polygonDistance(p.vertices,b.x,b.y)<margin||
      p.vertices.some((v,i)=>segmentDistance(a,b,v,p.vertices[(i+1)%p.vertices.length])<margin);
  }
  function alignedMount(p,hole){return p.mounts.findIndex(v=>{const q=worldPoint(p,v);return Math.hypot(q.x-hole.x,q.y-hole.y)<=2.8;});}
  function screwDepth(level,hole){
    const attached=level.plates.filter(p=>p.state!=='gone'&&p.pins.some(pin=>pin.hole===hole.id));
    return attached.length?Math.max(...attached.map(p=>p.z)):hole.screw===null?-1:Math.max(0,...level.plates.map(p=>p.z))+1;
  }
  function screwRadius(level,hole){return level.screwRadius||SCREW_RADIUS;}
  function canSeatScrew(level,hole,screw){
    return hole.screw===null&&canAccessHole(level,hole)&&!level.screws.some(other=>other.hole&&other!==screw&&
      Math.hypot(other.hole.x-hole.x,other.hole.y-hole.y)<screwRadius(level,hole)+screwRadius(level,other.hole)+1.5-1e-6);
  }
  function canAccessHole(level,hole){
    const radius=level.screwRadius||SCREW_RADIUS,depths=new Map();
    if(level.interlocked)for(const p of level.plates)if(p.state!=='gone')for(const pin of p.pins)depths.set(pin.hole,Math.max(depths.get(pin.hole)??-1,p.z));
    const foreground=Math.max(0,...level.plates.map(p=>p.z))+1;
    const depth=depths.get(hole.id)??(hole.screw===null?-1:foreground);
    // Check the actual tool opening, not a predetermined release sequence.
    // A front sheet or screw head can cover it; moving either reveals it.
    const occupied=hole.screw!==null,margin=level.interlocked?(occupied?radius*.13:0):12*radius/SCREW_RADIUS;
    if(level.plates.some(p=>p.state!=='gone'&&(!level.interlocked||p.z>depth)&&(level.interlocked&&occupied?plateBlocksSlot(p,hole,radius):plateCovers(p,hole.x,hole.y,margin))&&
      !p.pins.some(pin=>pin.hole===hole.id)&&alignedMount(p,hole)<0))return false;
    if(!level.interlocked)return true;
    const dx=Math.cos(-.28),dy=Math.sin(-.28),half=occupied?radius*.62:0;
    return !level.screws.some(s=>{
      if(!s.hole||s.id===hole.screw||(depths.get(s.hole.id)??foreground)<=depth)return false;
      const x=s.hole.x-hole.x,y=s.hole.y-hole.y,t=clamp(x*dx+y*dy,-half,half);
      return Math.hypot(x-t*dx,y-t*dy)<screwRadius(level,s.hole)+margin;
    });
  }
  function bareHole(level,hole){return !level.plates.some(p=>plateCovers(p,hole.x,hole.y,15*(level.screwRadius||SCREW_RADIUS)/SCREW_RADIUS));}
  function canUnscrew(level,s){return !!s.hole&&s.hole.screw===s.id&&canAccessHole(level,s.hole);}
  function screwPoint(s){return s.hole?{x:s.hole.x,y:s.hole.y}:null;}
  function clipLine(poly,cut,midY,keepLeft){
    const result=[],side=v=>v.x-cut.x-cut.slope*(v.y-midY);
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=side(a),db=side(b),ina=keepLeft?da<=0:da>=0,inb=keepLeft?db<=0:db>=0;
      if(ina)result.push(a);
      if(ina!==inb){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    return result;
  }
  function mountPair(vertices,inset=17,separation=32){
    const xs=vertices.map(v=>v.x),ys=vertices.map(v=>v.y),candidates=[];
    for(let y=Math.ceil(Math.min(...ys)+inset);y<Math.max(...ys)-inset+1;y+=3)
      for(let x=Math.ceil(Math.min(...xs)+inset);x<Math.max(...xs)-inset+1;x+=3)
        if(polygonDistance(vertices,x,y)<=-inset)candidates.push({x,y});
    if(candidates.length<2)throw Error('Metal piece has no room for screws');
    const extremes=[];
    for(let i=0;i<12;i++){const co=Math.cos(i*Math.PI/6),si=Math.sin(i*Math.PI/6);extremes.push(candidates.reduce((best,p)=>p.x*co+p.y*si>best.x*co+best.y*si?p:best));}
    let pair=null,dist=0;
    for(const a of extremes)for(const b of extremes){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>dist){dist=d;pair=[a,b];}}
    if(dist<separation)throw Error('Metal piece screw heads overlap');
    return pair.sort((a,b)=>a.x-b.x||a.y-b.y);
  }
  const SHAPE_NAMES=['보석','방패','하트','나뭇잎','원형','네모판','꽃','별','나비','구름','초승달','로켓','십자'];
  const SHAPE_UNLOCKS=[80,140,220,320,450,650];
  function shapeIndex(L){const extra=SHAPE_UNLOCKS.filter(stage=>L>=stage).length;return extra?(L-SHAPE_UNLOCKS[extra-1]+6+extra)%(7+extra):(L-11+6)%7;}
  const FIRST_SHAPED_STAGE=11,PIECE_INCREASES=[20,35,55,80,115];
  const RETRIED_LAYOUTS=new Set([184,303,323,570,662,685,727,731,763,773,786,796,871,917,918,927,944,976]);
  // Certified geometry and lift budgets; the actual witness paths live only
  // in tests. These numbers never change access, collision or gravity rules.
  const VALIDATED_LAYOUTS=Object.fromEntries(`
12,0,0.982,20
13,0,0.982,18
14,0,0.982,18
15,0,0.982,18
16,0,0.982,16
17,0,0.982,21
18,0,0.982,16
19,0,0.982,15
20,0,0.982,22
21,0,0.982,20
22,0,0.982,22
23,0,0.982,22
24,0,0.982,19
26,0,0.982,23
27,0,0.982,24
28,0,0.982,22
29,0,0.982,21
30,0,0.982,22
31,0,0.982,21
32,0,0.982,19
33,0,0.982,22
34,0,0.982,20
35,0,0.982,24
36,0,0.982,27
37,0,0.982,24
38,0,0.982,22
39,0,0.982,26
40,0,0.96,28
41,0,0.982,26
42,0,0.982,26
43,0,0.982,24
44,0,0.982,25
45,0,0.982,24
46,0,0.982,23
47,0,0.982,25
48,0,0.982,28
49,0,0.982,22
50,0,0.982,30
51,0,0.982,27
52,0,0.982,26
53,0,0.982,26
54,0,0.982,28
55,0,0.982,33
56,0,0.982,23
57,0,0.982,26
58,0,0.982,44
59,0,0.982,33
60,0,0.982,28
61,0,0.94,33
62,0,0.96,32
63,0,0.982,31
64,0,0.982,28
65,0,0.982,32
66,0,0.96,27
67,0,0.982,37
68,0,0.982,36
69,0,0.982,30
70,0,0.982,25
71,0,0.982,29
72,0,0.982,27
73,0,0.982,32
74,0,0.982,35
75,0,0.982,27
76,0,0.982,33
77,0,0.982,29
78,0,0.982,35
79,0,0.982,34
80,0,0.982,35
81,0,0.982,32
82,0,0.982,31
83,0,0.982,34
84,0,0.982,37
85,0,0.982,38
86,0,0.982,31
87,0,0.982,31
88,0,0.982,36
89,0,0.982,37
90,0,0.982,38
91,0,0.96,37
92,0,0.982,37
93,0,0.96,39
94,0,0.982,33
95,0,0.982,34
96,0,0.982,32
97,0,0.982,39
98,0,0.982,32
99,0,0.982,31
100,0,0.982,40
101,0,0.982,36
102,0,0.982,32
103,0,0.982,32
104,0,0.982,34
105,0,0.96,38
106,0,0.982,41
107,0,0.982,38
108,0,0.982,44
109,0,0.982,41
110,0,0.982,35
111,0,0.982,37
112,0,0.982,34
113,0,0.982,32
114,0,0.982,38
115,0,0.982,34
116,0,0.982,37
117,0,0.982,48
118,0,0.982,49
119,0,0.982,33
120,0,0.982,44
121,0,0.982,53
122,0,0.94,34
123,0,0.982,36
124,0,0.982,42
125,0,0.94,42
126,0,0.96,32
127,0,0.982,46
128,0,0.982,44
129,0,0.982,38
130,0,0.94,36
131,0,0.982,42
132,0,0.982,42
133,0,0.982,37
134,0,0.982,40
135,0,0.982,44
136,0,0.982,45
137,0,0.982,40
138,0,0.96,34
139,0,0.982,34
140,0,0.982,37
141,0,0.982,40
142,0,0.982,41
143,0,0.982,38
144,0,0.982,38
145,0,0.982,40
146,0,0.982,41
147,0,0.982,34
148,0,0.982,44
149,0,0.982,32
150,0,0.982,39
151,0,0.982,35
152,0,0.982,39
153,0,0.982,39
154,0,0.982,41
155,0,0.982,39
156,0,0.982,46
157,0,0.96,41
158,0,0.982,33
159,0,0.96,43
160,0,0.96,54
161,0,0.982,50
162,0,0.982,44
163,0,0.982,45
164,0,0.982,54
165,0,0.982,50
166,0,0.982,48
167,0,0.982,37
168,0,0.982,44
169,0,0.982,49
170,0,0.982,45
171,0,0.982,47
172,0,0.982,46
173,0,0.982,50
174,0,0.982,41
175,0,0.94,47
176,0,0.982,42
177,0,0.982,52
178,0,0.982,46
179,0,0.982,40
180,0,0.96,52
181,0,0.982,56
182,0,0.982,46
183,0,0.982,50
184,0,0.92,52
185,0,0.982,46
186,0,0.982,50
187,0,0.982,41
188,0,0.982,51
189,0,0.982,66
190,0,0.982,63
191,0,0.982,59
192,0,0.96,56
193,0,0.982,58
194,0,0.982,42
195,0,0.982,52
196,0,0.982,43
197,0,0.982,53
198,0,0.982,49
199,0,0.982,47
200,0,0.982,54
201,0,0.96,51
202,0,0.9,50
203,0,0.982,45
204,0,0.982,58
205,0,0.982,66
206,0,0.982,59
207,0,0.982,66
208,0,0.982,67
209,0,0.982,67
210,0,0.982,67
211,0,0.9,57
212,0,0.982,45
213,0,0.982,64
214,0,0.982,77
215,0,0.982,59
216,0,0.982,59
217,0,0.982,70
218,0,0.982,63
219,0,0.982,59
220,0,0.96,62
221,0,0.982,64
222,0,0.96,60
223,0,0.982,61
224,0,0.982,62
225,0,0.982,60
226,0,0.96,51
227,0,0.94,45
228,0,0.86,65
229,0,0.982,58
230,0,0.96,68
231,0,0.982,65
232,0,0.982,82
233,0,0.96,53
234,0,0.982,65
235,0,0.982,70
236,0,0.982,81
237,0,0.982,59
238,0,0.9,61
239,0,0.982,54
240,0,0.982,72
241,0,0.982,69
242,0,0.982,73
243,0,0.982,67
244,0,0.94,77
245,0,0.982,87
246,0,0.982,71
247,0,0.982,58
248,0,0.88,61
249,0,0.982,49
250,0,0.982,66
251,0,0.982,76
252,0,0.94,70
253,0,0.982,59
254,0,0.982,79
255,0,0.96,71
256,0,0.982,76
257,0,0.96,79
258,0,0.88,62
259,0,0.982,51
260,0,0.982,77
261,0,0.94,69
262,0,0.982,79
263,0,0.982,71
264,0,0.94,72
265,0,0.982,106
266,0,0.96,78
267,0,0.982,86
268,0,0.982,67
269,0,0.982,53
270,0,0.982,71
271,0,0.982,70
272,0,0.982,69
273,0,0.96,71
274,0,0.982,80
275,0,0.982,80
276,0,0.94,78
277,0,0.96,78
278,0,0.96,75
279,0,0.982,63
280,0,0.96,84
281,0,0.982,71
282,0,0.982,106
283,0,0.982,69
284,0,0.982,96
285,0,0.982,84
286,0,0.982,76
287,0,0.982,81
288,0,0.96,79
289,0,0.982,65
290,0,0.94,80
291,0,0.982,84
292,0,0.982,75
293,0,0.982,68
294,0,0.982,92
295,0,0.982,82
296,0,0.96,76
297,0,0.96,100
298,0,0.96,83
299,0,0.92,70
300,0,0.982,81
301,0,0.982,83
302,0,0.92,80
303,0,0.982,66
304,0,0.982,85
305,0,0.982,88
306,0,0.982,81
307,0,0.982,79
308,0,0.96,86
309,0,0.982,74
310,0,0.982,94
311,0,0.982,80
312,0,0.982,79
313,0,0.96,75
314,0,0.94,80
315,0,0.982,77
316,0,0.86,82
317,0,0.96,81
318,0,0.982,84
319,0,0.982,96
320,0,0.982,87
321,0,0.982,80
322,0,0.94,93
323,0,0.96,75
324,0,0.982,99
325,0,0.982,106
326,0,0.982,92
327,0,0.982,116
328,0,0.94,87
329,0,0.982,80
330,0,0.96,88
331,0,0.982,72
332,0,0.96,87
333,0,0.96,86
334,0,0.982,82
335,0,0.982,90
336,0,0.96,94
337,0,0.96,95
338,0,0.96,88
339,0,0.94,97
340,0,0.982,81
341,0,0.982,90
342,0,0.982,87
343,0,0.92,94
344,0,0.982,98
345,0,0.982,88
346,0,0.94,81
347,0,0.982,97
348,0,0.96,108
349,0,0.96,114
350,0,0.982,86
351,0,0.982,87
352,0,0.982,103
353,0,0.982,95
354,0,0.96,93
355,0,0.982,126
356,0,0.982,80
357,0,0.96,109
358,0,0.982,90
359,0,0.94,99
360,0,0.982,106
361,0,0.96,94
362,0,0.982,82
363,0,0.92,91
364,0,0.982,92
365,0,0.96,104
366,0,0.982,117
367,0,0.982,97
368,0,0.88,106
369,0,0.96,111
370,0,0.94,110
371,0,0.92,119
372,0,0.92,105
373,0,0.982,97
374,0,0.982,104
375,0,0.982,71
376,0,0.94,89
377,0,0.982,107
378,0,0.982,104
379,0,0.982,107
380,0,0.94,106
381,0,0.96,107
382,0,0.92,110
383,0,0.92,95
384,0,0.982,87
385,0,0.982,115
386,0,0.982,88
387,0,0.982,86
388,0,0.982,101
389,0,0.96,111
390,0,0.982,131
391,0,0.94,119
392,0,0.96,124
393,0,0.96,130
394,0,0.92,123
395,0,0.982,98
396,0,0.982,111
397,0,0.982,114
398,0,0.94,109
399,0,0.982,106
400,0,0.94,92
401,0,0.96,125
402,0,0.92,123
403,0,0.982,112
404,0,0.982,123
405,0,0.982,118
406,0,0.982,98
407,0,0.982,108
408,0,0.982,87
409,0,0.982,117
410,0,0.982,127
411,0,0.982,101
412,0,0.92,110
413,0,0.982,126
414,0,0.982,128
415,0,0.92,126
416,0,0.9,137
417,0,0.96,118
418,0,0.92,125
419,0,0.982,91
420,0,0.982,109
421,0,0.94,113
422,0,0.982,97
423,0,0.982,122
424,0,0.94,138
425,0,0.982,100
426,0,0.96,135
427,0,0.96,111
428,0,0.982,115
429,0,0.982,117
430,0,0.982,110
431,0,0.982,128
432,0,0.982,111
433,0,0.94,119
434,0,0.92,131
435,0,0.982,129
436,0,0.94,147
437,0,0.94,138
438,0,0.96,109
439,0,0.982,120
440,0,0.94,127
441,0,0.982,99
442,0,0.96,113
443,0,0.92,113
444,0,0.982,139
445,0,0.94,122
446,0,0.982,146
447,0,0.92,127
448,0,0.86,129
449,0,0.94,133
450,0,0.96,143
451,0,0.982,127
452,0,0.96,123
453,0,0.982,130
454,0,0.982,117
455,0,0.96,140
456,0,0.94,125
457,0,0.9,124
458,0,0.982,141
459,0,0.982,127
460,0,0.982,146
461,0,0.982,106
462,0,0.982,153
463,0,0.982,118
464,0,0.982,130
465,0,0.96,124
466,0,0.96,137
467,0,0.96,131
468,0,0.982,136
469,0,0.92,161
470,0,0.9,130
471,0,0.982,131
472,0,0.982,161
473,0,0.982,99
474,0,0.982,150
475,0,0.982,154
476,0,0.982,152
477,0,0.982,132
478,0,0.92,139
479,0,0.982,137
480,0,0.982,155
481,0,0.94,136
482,0,0.982,127
483,0,0.982,141
484,0,0.982,132
485,0,0.94,113
486,0,0.982,134
487,0,0.94,163
488,0,0.9,163
489,0,0.94,113
490,0,0.982,134
491,0,0.982,148
492,0,0.92,138
493,0,0.96,155
494,0,0.94,130
495,0,0.982,128
496,0,0.86,129
497,0,0.982,124
498,0,0.982,131
499,0,0.982,143
500,0,0.96,146
501,0,0.982,134
502,0,0.982,157
503,0,0.982,166
504,0,0.96,157
505,0,0.94,146
506,0,0.96,160
507,0,0.982,136
508,0,0.9,153
509,0,0.982,114
510,0,0.94,169
511,0,0.982,168
512,0,0.94,127
513,0,0.982,145
514,0,0.96,142
515,0,0.96,165
516,0,0.982,150
517,0,0.92,149
518,0,0.96,158
519,0,0.982,153
520,0,0.92,129
521,0,0.982,106
522,0,0.982,166
523,0,0.94,131
524,0,0.96,172
525,0,0.96,168
526,0,0.92,168
527,0,0.982,146
528,0,0.96,153
529,0,0.96,151
530,0,0.88,163
531,0,0.982,136
532,0,0.92,147
533,0,0.982,140
534,0,0.96,168
535,0,0.982,164
536,0,0.94,157
537,0,0.982,138
538,0,0.96,156
539,0,0.92,129
540,0,0.982,168
541,0,0.9,160
542,0,0.94,172
543,0,0.96,142
544,0,0.9,153
545,0,0.982,128
546,0,0.982,163
547,0,0.94,158
548,0,0.9,151
549,0,0.982,172
550,0,0.982,160
551,0,0.92,149
552,0,0.88,150
553,0,0.96,164
554,0,0.9,184
555,0,0.982,137
556,0,0.92,158
557,0,0.982,186
558,0,0.96,141
559,0,0.94,157
560,0,0.982,170
561,0,0.96,167
562,0,0.94,151
563,0,0.94,169
564,0,0.94,162
565,0,0.94,151
566,0,0.9,159
567,0,0.982,154
568,0,0.94,172
569,0,0.982,154
570,0,0.982,159
571,0,0.96,162
572,0,0.982,153
573,0,0.96,149
574,0,0.94,146
575,0,0.88,165
576,0,0.982,169
577,0,0.982,192
578,0,0.94,154
579,0,0.96,147
580,0,0.96,167
581,0,0.94,136
582,0,0.982,160
583,0,0.96,165
584,0,0.94,149
585,0,0.982,159
586,0,0.982,161
587,0,0.92,183
588,0,0.982,154
589,0,0.94,169
590,0,0.94,175
591,0,0.982,181
592,0,0.96,159
593,0,0.94,145
594,0,0.982,160
595,0,0.982,174
596,0,0.96,159
597,0,0.96,169
598,0,0.92,134
599,0,0.96,171
600,0,0.9,164
601,0,0.96,184
602,0,0.982,198
603,0,0.982,183
604,0,0.96,165
605,0,0.982,155
606,0,0.96,156
607,0,0.982,189
608,0,0.982,184
609,0,0.92,161
610,0,0.982,187
611,0,0.92,182
612,0,0.982,175
613,0,0.96,193
614,0,0.92,193
615,0,0.982,185
616,0,0.982,183
617,0,0.96,186
618,0,0.982,187
619,0,0.92,174
620,0,0.982,194
621,0,0.982,185
622,0,0.96,176
623,0,0.92,179
624,0,0.96,163
625,0,0.94,185
626,0,0.92,186
627,0,0.982,178
628,0,0.92,198
629,0,0.982,167
630,0,0.982,192
631,0,0.94,174
632,0,0.96,166
633,0,0.982,171
634,0,0.92,164
635,0,0.982,182
636,0,0.982,149
637,0,0.94,183
638,0,0.982,204
639,0,0.982,176
640,0,0.982,186
641,0,0.96,187
642,0,0.88,188
643,0,0.88,179
644,0,0.82,172
645,0,0.982,181
646,0,0.92,162
647,0,0.96,198
648,0,0.94,199
649,0,0.92,174
650,0,0.96,194
651,0,0.982,205
652,0,0.9,197
653,0,0.982,172
654,0,0.96,206
655,0,0.94,185
656,0,0.96,171
657,0,0.96,174
658,0,0.92,182
659,0,0.9,180
660,0,0.94,179
661,0,0.94,159
662,0,0.96,207
663,0,0.96,197
664,0,0.96,186
665,0,0.982,199
666,0,0.92,188
667,0,0.96,210
668,0,0.92,194
669,0,0.982,212
670,0,0.96,206
671,0,0.96,186
672,0,0.982,174
673,0,0.96,192
674,0,0.94,191
675,0,0.96,168
676,0,0.96,210
677,0,0.88,184
678,0,0.9,212
679,0,0.9,203
680,0,0.96,195
681,0,0.94,188
682,0,0.86,184
683,0,0.94,202
684,0,0.96,218
685,0,0.982,181
686,0,0.9,208
687,0,0.982,172
688,0,0.92,213
689,0,0.94,217
690,0,0.94,173
691,0,0.982,194
692,0,0.92,190
693,0,0.96,218
694,0,0.9,200
695,0,0.982,185
696,0,0.982,215
697,0,0.982,193
698,0,0.96,162
699,0,0.94,184
700,0,0.982,181
701,0,0.982,205
702,0,0.982,215
703,0,0.9,192
704,0,0.94,182
705,0,0.982,191
706,0,0.96,228
707,0,0.88,222
708,0,0.982,217
709,0,0.92,207
710,0,0.9,181
711,0,0.982,213
712,0,0.96,215
713,0,0.92,227
714,0,0.96,225
715,0,0.94,215
716,0,0.94,207
717,0,0.96,215
718,0,0.94,220
719,0,0.96,221
720,0,0.96,222
721,0,0.92,210
722,0,0.982,225
723,0,0.94,197
724,0,0.982,194
725,0,0.92,210
726,0,0.982,180
727,0,0.92,228
728,0,0.96,207
729,0,0.92,232
730,0,0.94,225
731,0,0.9,187
732,0,0.92,221
733,0,0.84,225
734,0,0.982,212
735,0,0.9,197
736,0,0.88,217
737,0,0.94,184
738,0,0.92,232
739,0,0.96,182
740,0,0.982,217
741,0,0.92,204
742,0,0.982,224
743,0,0.9,232
744,0,0.9,204
745,0,0.9,200
746,0,0.82,205
747,0,0.92,201
748,0,0.84,210
749,0,0.982,217
750,0,0.96,203
751,0,0.982,216
752,0,0.982,221
753,0,0.982,240
754,0,0.94,207
755,0,0.92,213
756,0,0.96,236
757,0,0.96,235
758,0,0.92,207
759,0,0.92,226
760,0,0.84,238
761,0,0.88,240
762,0,0.86,240
763,0,0.982,218
764,0,0.94,234
765,0,0.86,203
766,0,0.9,210
767,0,0.982,204
768,0,0.88,196
769,0,0.9,205
770,0,0.96,220
771,0,0.84,217
772,0,0.92,222
773,0,0.92,198
774,0,0.982,226
775,0,0.9,233
776,0,0.982,227
777,0,0.86,233
778,0,0.92,197
779,0,0.94,220
780,0,0.96,238
781,0,0.96,220
782,0,0.94,212
783,0,0.96,228
784,0,0.94,233
785,0,0.88,207
786,0,0.94,223
787,0,0.9,220
788,0,0.92,222
789,0,0.982,239
790,0,0.92,217
791,0,0.96,229
792,0,0.88,193
793,0,0.982,230
794,0,0.94,205
795,0,0.92,215
796,0,0.96,222
797,0,0.86,247
798,0,0.9,234
799,0,0.96,249
800,0,0.92,248
801,0,0.92,248
802,0,0.982,216
803,0,0.88,248
804,0,0.96,219
805,0,0.88,212
806,0,0.88,233
807,0,0.96,249
808,0,0.96,243
809,0,0.94,212
810,0,0.86,236
811,0,0.9,244
812,0,0.982,250
813,0,0.92,244
814,0,0.84,242
815,0,0.96,199
816,0,0.88,243
817,0,0.9,197
818,0,0.92,243
819,0,0.9,235
820,0,0.96,237
821,0,0.86,208
822,0,0.96,248
823,0,0.9,239
824,0,0.92,252
825,0,0.88,221
826,0,0.94,224
827,0,0.86,254
828,0,0.96,211
829,0,0.92,231
830,0,0.96,258
831,0,0.9,247
832,0,0.982,238
833,0,0.94,249
834,0,0.94,258
835,0,0.9,236
836,0,0.88,224
837,0,0.88,257
838,0,0.88,226
839,0,0.94,247
840,0,0.86,246
841,0,0.96,253
842,0,0.82,252
843,0,0.982,231
844,0,0.94,262
845,0,0.9,245
846,0,0.92,256
847,0,0.9,246
848,0,0.96,260
849,0,0.88,247
850,0,0.86,248
851,0,0.92,221
852,0,0.9,263
853,0,0.86,229
854,0,0.982,256
855,0,0.92,256
856,0,0.92,226
857,0,0.84,260
858,0,0.94,245
859,0,0.9,243
860,0,0.88,231
861,0,0.982,259
862,0,0.84,254
863,1,0.82,255
864,0,0.82,245
865,0,0.88,238
866,0,0.9,245
867,0,0.96,268
868,0,0.96,262
869,0,0.96,240
870,0,0.982,258
871,0,0.88,232
872,0,0.86,262
873,0,0.94,265
874,0,0.92,269
875,0,0.84,248
876,0,0.86,247
877,0,0.9,262
878,0,0.88,263
879,0,0.86,268
880,0,0.982,237
881,0,0.86,257
882,0,0.96,238
883,0,0.88,244
884,0,0.88,260
885,0,0.88,241
886,0,0.88,259
887,0,0.92,255
888,0,0.92,272
889,0,0.82,271
890,0,0.94,250
891,0,0.86,272
892,0,0.9,271
893,0,0.96,269
894,0,0.86,265
895,0,0.96,254
896,0,0.92,276
897,0,0.92,269
898,0,0.94,253
899,0,0.92,266
900,0,0.92,262
901,1,0.88,262
902,0,0.82,266
903,0,0.82,255
904,0,0.9,251
905,0,0.88,254
906,0,0.94,266
907,0,0.88,259
908,0,0.96,250
909,0,0.9,264
910,0,0.94,256
911,0,0.9,264
912,0,0.94,270
913,0,0.92,275
914,1,0.84,281
915,0,0.84,257
916,0,0.88,271
917,0,0.82,262
918,0,0.92,272
919,0,0.96,264
920,0,0.86,274
921,0,0.94,239
922,0,0.86,269
923,0,0.82,279
924,0,0.84,278
925,0,0.84,249
926,0,0.94,271
927,0,0.82,275
928,0,0.86,245
929,0,0.82,270
930,0,0.9,278
931,0,0.92,259
932,0,0.982,261
933,0,0.88,286
934,0,0.982,255
935,0,0.88,274
936,0,0.86,271
937,0,0.84,288
938,0,0.92,275
939,0,0.96,288
940,0,0.86,265
941,1,0.82,286
942,0,0.9,276
943,0,0.9,277
944,0,0.9,284
945,0,0.88,242
946,0,0.86,281
947,0,0.96,258
948,0,0.88,271
949,0,0.88,268
950,0,0.86,278
951,0,0.88,288
952,0,0.84,270
953,0,0.88,281
954,0,0.86,274
955,0,0.82,285
956,1,0.82,278
957,0,0.86,272
958,0,0.982,272
959,0,0.84,281
960,0,0.94,275
961,0,0.96,261
962,0,0.9,273
963,0,0.88,292
964,0,0.92,276
965,0,0.9,281
966,0,0.84,294
967,0,0.88,285
968,0,0.9,272
969,1,0.82,291
970,1,0.84,287
971,0,0.96,249
972,0,0.82,269
973,0,0.982,286
974,0,0.86,290
975,0,0.86,292
976,1,0.88,292
977,0,0.86,278
978,0,0.9,295
979,0,0.86,298
980,6,0.84,298
981,0,0.9,293
982,2,0.82,298
983,0,0.86,283
984,0,0.96,289
985,0,0.84,284
986,0,0.92,278
987,0,0.86,296
988,0,0.88,288
989,0,0.86,283
990,0,0.88,295
991,0,0.92,299
992,3,0.84,282
993,1,0.84,283
994,0,0.86,278
995,1,0.84,300
996,0,0.88,283
997,0,0.94,263
998,0,0.84,296
999,0,0.94,274
1000,0,0.92,294
`.trim().split(/\s+/).map(row=>{const [stage,variant,gap,moves]=row.split(',').map(Number);return[stage,[variant,gap,moves]];}));
  const pieceCount=L=>L<FIRST_SHAPED_STAGE?1+Math.floor(L/2):L<160?7+PIECE_INCREASES.filter(n=>L>=n).length:13+Math.floor((L-160)*37/(LAST_STAGE-160));
  function flowerOutline(first=false){
    // A convex centre and five circular caps form one concave flower without overlapping bodies.
    const radius=first?70:110,offset=first?100:80,half=Math.PI/5,edgeX=radius*Math.cos(half)-offset,edgeY=radius*Math.sin(half);
    const capRadius=Math.hypot(edgeX,edgeY),arc=Math.atan2(edgeY,edgeX),centre=[],petals=[];
    for(let i=0;i<5;i++){
      const a=-Math.PI/2+i*2*Math.PI/5,co=Math.cos(a),si=Math.sin(a);
      centre.push({x:radius*Math.cos(a-half),y:radius*Math.sin(a-half)});
      const steps=first?24:16,cap=Array.from({length:steps+1},(_,j)=>{
        const t=-arc+2*arc*j/steps,x=offset+capRadius*Math.cos(t),y=capRadius*Math.sin(t);
        return{x:x*co-y*si,y:x*si+y*co};
      });
      const petal=first?clipPlane(clipPlane(cap,-Math.sin(a-half),Math.cos(a-half),0,false),-Math.sin(a+half),Math.cos(a+half),0,true):cap;
      petals.push(petal.filter((p,j)=>Math.hypot(p.x-petal[(j+1)%petal.length].x,p.y-petal[(j+1)%petal.length].y)>1e-6));
    }
    const roots=[centre,...petals],points=roots.flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
    const outline=roots.map(poly=>poly.map(p=>({x:32+(p.x-minX)*296/width,y:151+(p.y-minY)*330/height})));
    const outside=outline.slice(1).sort((a,b)=>M.Vertices.centre(b).y-M.Vertices.centre(a).y);
    return[...outside.slice(0,4),outline[0],outside[4]];
  }
  function advancedOutline(index){
    const points=rows=>rows.map(([x,y])=>({x,y})),mirror=poly=>poly.map(p=>({x:360-p.x,y:p.y})).reverse();let roots;
    if(index===7){
      const inner=95,outer=165,half=Math.PI/5;
      roots=[Array.from({length:5},(_,i)=>{const a=-Math.PI/2+half+i*2*half;return{x:inner*Math.cos(a),y:inner*Math.sin(a)};})];
      for(let i=0;i<5;i++){const a=-Math.PI/2+i*2*half;roots.push([{x:inner*Math.cos(a-half),y:inner*Math.sin(a-half)},{x:outer*Math.cos(a),y:outer*Math.sin(a)},{x:inner*Math.cos(a+half),y:inner*Math.sin(a+half)}]);}
    }else if(index===8){
      const top=points([[156,218],[120,175],[63,154],[35,179],[32,237],[52,282],[156,319]]);
      const bottom=points([[156,321],[70,316],[43,346],[43,407],[72,455],[115,480],[156,440]]);
      roots=[top,mirror(top),bottom,mirror(bottom),points([[156,218],[204,218],[204,440],[156,440]])];
    }else if(index===9){
      const circle=(x,y,r)=>Array.from({length:48},(_,i)=>({x:x+r*Math.cos(i*Math.PI/24),y:y+r*Math.sin(i*Math.PI/24)}));
      const left=clipPlane(clipPlane(circle(96,310,64),1,0,100,true),0,1,330,true);
      const middle=clipPlane(clipPlane(clipPlane(circle(180,290,90),1,0,100,false),1,0,260,true),0,1,330,true);
      roots=[left,middle,mirror(left),points([[32,330],[328,330],[328,380],[304,429],[270,451],[90,451],[56,429],[32,380]])];
    }else if(index===10){
      const tip=points([[240,157],[170,154],[102,181],[61,221],[130,260]]);
      const middle=points([[61,221],[130,260],[102,317],[32,317],[39,269]]);
      const lower=poly=>poly.map(p=>({x:p.x,y:634-p.y})).reverse();roots=[tip,middle,lower(middle),lower(tip)];
    }else if(index===11){
      const fin=points([[133,302],[133,424],[44,456],[61,386]]);
      roots=[points([[133,196],[180,151],[227,196],[227,390],[133,390]]),fin,mirror(fin),points([[142,390],[218,390],[228,432],[180,480],[132,432]])];
    }else{
      roots=[points([[127,245],[233,245],[233,389],[127,389]]),points([[127,151],[233,151],[233,245],[127,245]]),points([[127,389],[233,389],[233,481],[127,481]]),points([[32,245],[127,245],[127,389],[32,389]]),points([[233,245],[328,245],[328,389],[233,389]])];
    }
    const all=roots.flat(),minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
    return roots.map(poly=>poly.map(p=>({x:32+(p.x-minX)*296/(maxX-minX),y:151+(p.y-minY)*330/(maxY-minY)}))).sort((a,b)=>M.Vertices.centre(b).y-M.Vertices.centre(a).y);
  }
  function shapeOutline(index,firstFlower=false){
    if(index>=7)return advancedOutline(index);
    const points=rows=>rows.map(([x,y])=>({x,y}));
    if(index===6)return flowerOutline(firstFlower);
    if(index===0)return[points([[95,157],[265,157],[322,225],[310,380],[180,477],[50,380],[38,225]])];
    if(index===1)return[points([[55,157],[305,157],[318,335],[285,404],[180,477],[75,404],[42,335]])];
    if(index===2){
      const left=points([[180,191],[157,165],[129,151],[89,151],[55,167],[33,205],[32,263],[54,346],[107,419],[180,480]]);
      return[left,left.map(p=>({x:360-p.x,y:p.y})).reverse()];
    }
    if(index===3)return[points([[180,157],[262,181],[308,239],[318,307],[293,375],[241,437],[180,477],[115,453],[65,399],[42,329],[48,260],[86,199]])];
    if(index===4)return[Array.from({length:24},(_,i)=>{const a=i*Math.PI/12;return{x:180+140*Math.cos(a),y:317+160*Math.sin(a)};})];
    return[points([[66,157],[294,157],[318,181],[318,453],[294,477],[66,477],[42,453],[42,181]])];
  }
  function clipPlane(poly,nx,ny,cut,low){
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=a.x*nx+a.y*ny-cut,db=b.x*nx+b.y*ny-cut;
      const ina=low?da<=0:da>=0,inb=low?db<=0:db>=0;
      if(ina)result.push(a);
      if(ina!==inb){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    return result;
  }
  function fitFragment(raw,radius=SCREW_RADIUS,interlocked=false,clearance=.982){
    if(raw.length<3||!M.Vertices.isConvex(raw))return null;
    const centre=M.Vertices.centre(raw),scale=interlocked?clearance:.982,poly=raw.map(v=>({x:centre.x+(v.x-centre.x)*scale,y:centre.y+(v.y-centre.y)*scale}));
    const inset=interlocked?radius*.5:radius+2;
    try{return{raw,poly,centre,mounts:mountPair(poly,inset,32*radius/SCREW_RADIUS),area:M.Vertices.area(raw)};}catch(_){return null;}
  }
  function splitFragment(fragment,random,radius,interlocked=false,clearance=.982){
    const xs=fragment.raw.map(p=>p.x),ys=fragment.raw.map(p=>p.y);
    const main=Math.max(...xs)-Math.min(...xs)>Math.max(...ys)-Math.min(...ys)?0:Math.PI/2;
    const angles=[main+(random()-.5)*.65,main+Math.PI/2+(random()-.5)*.65,main,main+Math.PI/2,Math.PI/4,-Math.PI/4];
    for(const angle of angles){
      const nx=Math.cos(angle),ny=Math.sin(angle),dots=fragment.raw.map(p=>p.x*nx+p.y*ny),min=Math.min(...dots),span=Math.max(...dots)-min;
      for(const fraction of [.5,.43,.57,.36,.64]){
        const cut=min+span*fraction,a=fitFragment(clipPlane(fragment.raw,nx,ny,cut,true),radius,interlocked,clearance);if(!a)continue;
        const b=fitFragment(clipPlane(fragment.raw,nx,ny,cut,false),radius,interlocked,clearance);if(!b)continue;
        // Visit the side gravity can pull away from the shared cut first.
        fragment.children=ny>=0?[b,a]:[a,b];return fragment.children;
      }
    }
    return null;
  }

  // Two adjacent metal pieces can support one another only in the direction
  // of gravity. Find the pieces underneath each fragment before choosing the
  // release order; a loose plate must not be asked to fall through a bolt or
  // a still-fastened metal face.
  function gravityReleaseOrder(plates){
    const extents=plates.map(p=>{
      const vertices=p.vertices.map(v=>worldPoint(p,v));
      return{p,vertices,minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),bottom:Math.max(...vertices.map(v=>v.y))};
    });
    function span(item,x){
      const v=item.vertices,ys=[];
      for(let i=0;i<v.length;i++){
        const a=v[i],b=v[(i+1)%v.length];
        if(x<Math.min(a.x,b.x)-.001||x>Math.max(a.x,b.x)+.001)continue;
        if(Math.abs(a.x-b.x)<.001){ys.push(a.y,b.y);}else{
          const t=(x-a.x)/(b.x-a.x);if(t>=-.001&&t<=1.001)ys.push(a.y+t*(b.y-a.y));
        }
      }
      return ys.length?{top:Math.min(...ys),bottom:Math.max(...ys)}:null;
    }
    const below=new Map(extents.map(e=>[e.p.id,new Set()]));
    for(let i=0;i<extents.length;i++)for(let j=i+1;j<extents.length;j++){
      const a=extents[i],b=extents[j],left=Math.max(a.minX,b.minX),right=Math.min(a.maxX,b.maxX);
      if(right-left<.4)continue;
      const xs=[left+(right-left)*.08,left+(right-left)*.5,left+(right-left)*.92];
      for(const x of xs){
        const aa=span(a,x),bb=span(b,x);if(!aa||!bb)continue;
        if(aa.bottom<=bb.top+1){below.get(a.p.id).add(b.p.id);break;}
        if(bb.bottom<=aa.top+1){below.get(b.p.id).add(a.p.id);break;}
      }
    }
    const pending=new Set(plates.map(p=>p.id)),order=[];
    while(pending.size){
      const available=extents.filter(e=>pending.has(e.p.id)&&![...below.get(e.p.id)].some(id=>pending.has(id)));
      const candidates=available.length?available:extents.filter(e=>pending.has(e.p.id));
      candidates.sort((a,b)=>b.bottom-a.bottom||a.p.id-b.p.id);
      const next=candidates[0].p;order.push(next);pending.delete(next.id);
    }
    return order;
  }

  function makeInterlockedFlower25(L){
    // The flower is assembled from four tapered pairs, rather than eight
    // independent strips. The lower pairs physically support the upper ones:
    // removing the top first makes it rest on the still-fastened metal.
    const bands=[
      {top:412,bottom:481,leftTop:32,leftBottom:34,holes:[[58,465],[58,429]]},
      {top:328,bottom:408,leftTop:79,leftBottom:72,holes:[[96,389],[96,348]]},
      {top:240,bottom:324,leftTop:119,leftBottom:104,holes:[[139,305],[139,260]]},
      {top:151,bottom:236,leftTop:128,leftBottom:119,holes:[[149,216],[149,173]]}
    ];
    const plates=[],holes=[90,180,270].map((x,id)=>({id,x,y:100,owner:null,screw:null})),screws=[],silhouette=[];
    for(let row=0;row<bands.length;row++){
      const band=bands[row];
      for(let col=0;col<2;col++){
        const flip=col===1,mirror=x=>flip?360-x:x;
        const corners=[
          [band.leftTop,band.top],[172,band.top],
          [172,band.bottom],[band.leftBottom,band.bottom]
        ].map(([x,y])=>({x:mirror(x),y}));
        const raw=corners.map((v,j)=>({
          x:v.x+(corners[(j+1)%4].x-v.x)*.055,
          y:v.y+(corners[(j+1)%4].y-v.y)*.055
        })).flatMap((v,j)=>[v,{
          x:corners[(j+1)%4].x+(corners[j].x-corners[(j+1)%4].x)*.055,
          y:corners[(j+1)%4].y+(corners[j].y-corners[(j+1)%4].y)*.055
        }]);
        const x=M.Vertices.centre(raw).x,y=M.Vertices.centre(raw).y;
        const p={id:plates.length,z:plates.length,row:3-row,col,releaseFrom:1,x,y,angle:0,
          vertices:raw.map(v=>({x:v.x-x,y:v.y-y})),mounts:[],pins:[],holeIds:[],
          state:'fixed',vx:0,vy:0,spin:0,w:Math.max(...raw.map(v=>v.x))-Math.min(...raw.map(v=>v.x)),h:band.bottom-band.top};
        plates.push(p);silhouette.push(raw);
        // Release the bottom pin before the upper pivot, so a plate cannot
        // pretend to fall while its last fastener is still in place.
        for(const [hx,hy] of band.holes){
          const h={id:holes.length,x:mirror(hx),y:hy,owner:p.id,screw:screws.length};holes.push(h);
          p.holeIds.push(h.id);p.mounts.push({x:h.x-x,y:h.y-y});
          p.pins.push({hole:h.id,mount:p.mounts.length-1});
          screws.push({id:screws.length,hole:h,startHole:h.id});
        }
      }
    }
    return{stage:L,theme:(L-1)%6,shape:SHAPE_NAMES[6],screwRadius:SCREW_RADIUS,silhouette,plates,holes,screws,order:screws.map(s=>s.id)};
  }
  function makeShapedLevel(L,layout=VALIDATED_LAYOUTS[L]||[0,.982]){
    if(L===25)return makeInterlockedFlower25(L);
    const interlocked=L>=12;
    const count=pieceCount(L),shape=shapeIndex(L),outline=shapeOutline(shape,L===FIRST_SHAPED_STAGE);
    const area=outline.reduce((sum,poly)=>sum+M.Vertices.area(poly),0),density=shape>=7?Math.min(1,Math.sqrt(area/75000)):1;
    const radius=SCREW_RADIUS*density/(1+Math.max(0,count-18)*.04);let leaves,roots;
    for(let attempt=0;attempt<12;attempt++){
      const random=seeded(9041+L*7919+(attempt+layout[0]+(L===976?2:RETRIED_LAYOUTS.has(L)?1:0))*104729);
      roots=outline.map(raw=>fitFragment(raw,radius,interlocked,layout[1]));if(roots.some(p=>!p))throw Error('Invalid metal outline');leaves=[...roots];
      if(L===FIRST_SHAPED_STAGE){
        // Keep the first flower's centre small and its top mounts high enough to reopen as it falls.
        const centre=roots[4],halves=[false,true].map(low=>fitFragment(clipPlane(centre.raw,1,0,181,low)));
        centre.children=halves;leaves.splice(4,1,...halves);
        roots[5].mounts=[{x:160,y:174},{x:200,y:174}];
      }
      while(leaves.length<count){
        const candidates=leaves.filter(p=>!p.unsplittable).sort((a,b)=>b.area-a.area);let changed=false;
        for(const p of candidates){
          const children=splitFragment(p,random,radius,interlocked,layout[1]);
          if(children){leaves.splice(leaves.indexOf(p),1,...children);changed=true;break;}p.unsplittable=true;
        }
        if(!changed)break;
      }
      if(leaves.length===count)break;
    }
    if(leaves.length!==count)throw Error('Metal outline has too few usable pieces');
    const plates=[],holes=[90,180,270].map((x,id)=>({id,x,y:100,owner:null,screw:null})),screws=[];
    for(const f of leaves){
      const p={id:plates.length,z:plates.length,row:0,col:plates.length,releaseFrom:1,x:f.centre.x,y:f.centre.y,angle:0,
        screwRadius:radius,shaftRadius:interlocked?radius*.28:radius,vertices:f.poly.map(v=>({x:v.x-f.centre.x,y:v.y-f.centre.y})),mounts:[],pins:[],holeIds:[],state:'fixed',vx:0,vy:0,spin:0};
      p.w=Math.max(...p.vertices.map(v=>v.x))-Math.min(...p.vertices.map(v=>v.x));p.h=Math.max(...p.vertices.map(v=>v.y))-Math.min(...p.vertices.map(v=>v.y));
      plates.push(p);f.id=p.id;
      for(const q of f.mounts){
        const h={id:holes.length,x:q.x,y:q.y,owner:p.id,screw:screws.length};holes.push(h);p.holeIds.push(h.id);
        p.mounts.push({x:q.x-p.x,y:q.y-p.y});p.pins.push({hole:h.id,mount:p.mounts.length-1});screws.push({id:screws.length,hole:h,startHole:h.id});
      }
    }
    const ordered=[],visit=node=>node.children?node.children.forEach(visit):ordered.push(plates[node.id]);roots.forEach(visit);
    if(interlocked)ordered.splice(0,ordered.length,...gravityReleaseOrder(plates));
    if(L===598){
      // This narrow centre wedge is caught by the two flanking metal faces
      // if released before they are removed.
      const wedge=ordered.splice(ordered.findIndex(p=>p.id===24),1)[0];
      ordered.splice(Math.max(ordered.findIndex(p=>p.id===13),ordered.findIndex(p=>p.id===22))+1,0,wedge);
    }
    // A plate removed earlier sits in front at shared seams. A plate behind
    // exposes its screw only after the overlapping neighbour drops away.
    if(interlocked)ordered.forEach((p,index)=>{p.z=ordered.length-index;});
    let headRadius=radius;
    if(interlocked){
      headRadius=radius*.5;
      for(let i=0;i<screws.length;i++)for(let j=i+1;j<screws.length;j++)headRadius=Math.min(headRadius,(Math.hypot(screws[i].hole.x-screws[j].hole.x,screws[i].hole.y-screws[j].hole.y)-1.5)/2);
      for(const p of plates){p.screwRadius=headRadius;p.shaftRadius=headRadius*.4;}
    }
    const level={stage:L,theme:(L-1)%6,shape:SHAPE_NAMES[shape],screwRadius:headRadius,interlocked,silhouette:roots.map(p=>p.raw),plates,holes,screws,order:ordered.flatMap(p=>(interlocked?p.holeIds.slice().sort((a,b)=>holes[b].y-holes[a].y):p.holeIds).map(h=>holes[h].screw))};
    if(Number.isInteger(layout[2]))level.requiredMoves=layout[2];
    return level;
  }
  function makeFlatLevel(stage,layout){
    const L=clamp(Math.trunc(stage)||1,1,LAST_STAGE),count=pieceCount(L),random=seeded(431+Math.max(1,count-2)*7919);
    if(L>=FIRST_SHAPED_STAGE)return makeShapedLevel(L,layout);
    const top=[[153,157],[207,157],[232,169],[247,192],[251,270],[109,270],[113,192],[128,169]].map(([x,y])=>({x,y}));
    let bands,counts;
    if(count===1){
      bands=[[[95,157],[265,157],[318,475],[42,475]].map(([x,y])=>({x,y}))];counts=[1];
    }else if(count===2){
      bands=[top,[[109,270],[251,270],[318,475],[42,475]].map(([x,y])=>({x,y}))];counts=[1,1];
    }else{
      bands=[[[153,157],[207,157],[232,169],[247,192],[251,266],[109,266],[113,192],[128,169]],
        [[109,266],[251,266],[307,372],[53,372]],[[53,372],[307,372],[318,475],[42,475]]].map(poly=>poly.map(([x,y])=>({x,y})));
      counts=count===3?[1,1,1]:count===4?[1,2,1]:count===5?[1,2,2]:[2,2,2];
    }
    const plates=[],holes=[],screws=[];
    for(const x of [90,180,270])holes.push({id:holes.length,x,y:100,owner:null,screw:null});
    bands.forEach((band,row)=>{
      const left=Math.min(...band.map(v=>v.x)),right=Math.max(...band.map(v=>v.x));
      const midY=(Math.min(...band.map(v=>v.y))+Math.max(...band.map(v=>v.y)))/2;
      const rowSlope=(random()<.5?-1:1)*(.05+random()*.12);
      const cuts=[{x:left-1,slope:0}];for(let col=1;col<counts[row];col++)cuts.push({x:left+(right-left)*(col/counts[row]+(random()-.5)*.025),slope:rowSlope});cuts.push({x:right+1,slope:0});
      for(let col=0;col<counts[row];col++){
        let poly=clipLine(clipLine(band,cuts[col],midY,false),cuts[col+1],midY,true);
        const centre=M.Vertices.centre(poly);
        poly=poly.map(v=>({x:centre.x+(v.x-centre.x)*.978,y:centre.y+(v.y-centre.y)*.965}));
        const mounts=mountPair(poly),vertices=poly.map(v=>({x:v.x-centre.x,y:v.y-centre.y}));
        const p={id:plates.length,z:plates.length,row,col,releaseFrom:rowSlope>=0?1:-1,x:centre.x,y:centre.y,angle:0,vertices,mounts:[],pins:[],holeIds:[],state:'fixed',vx:0,vy:0,spin:0};
        p.w=Math.max(...vertices.map(v=>v.x))-Math.min(...vertices.map(v=>v.x));p.h=Math.max(...vertices.map(v=>v.y))-Math.min(...vertices.map(v=>v.y));
        plates.push(p);
        for(const q of mounts){
          const h={id:holes.length,x:q.x,y:q.y,owner:p.id,screw:screws.length};holes.push(h);p.holeIds.push(h.id);
          p.mounts.push({x:q.x-p.x,y:q.y-p.y});p.pins.push({hole:h.id,mount:p.mounts.length-1});
          screws.push({id:screws.length,hole:h,startHole:h.id});
        }
      }
    });
    return{stage:L,theme:(L-1)%6,silhouette:bands,plates,holes,screws,order:[...plates].sort((a,b)=>b.row-a.row||(a.col-b.col)*a.releaseFrom).flatMap(p=>(p.releaseFrom>0?p.holeIds:[...p.holeIds].reverse()).map(h=>holes[h].screw))};
  }
  function createPhysics(level){
    const engine=M.Engine.create({positionIterations:12,velocityIterations:8,constraintIterations:8,enableSleeping:false});
    engine.gravity.y=1;engine.gravity.scale=.001;
    const bodies=new Map(),joints=new Map(),screwBodies=new Map();let accumulator=0,dead=false;
    function refreshScrews(){
      for(const s of level.screws){
        let body=screwBodies.get(s.id);
        if(!s.hole){if(body){M.Composite.remove(engine.world,body);screwBodies.delete(s.id);}continue;}
        if(!body){
          body=M.Bodies.circle(s.hole.x,s.hole.y,screwRadius(level,s.hole),{label:'screw-'+s.id,isStatic:true,friction:.5,frictionStatic:.8,restitution:.02,slop:.025,collisionFilter:{category:1,mask:2}});
          screwBodies.set(s.id,body);M.Composite.add(engine.world,body);
        }
        M.Body.setPosition(body,{x:s.hole.x,y:s.hole.y});
        const currentRadius=screwRadius(level,s.hole);
        if(Math.abs(body.circleRadius-currentRadius)>.001)M.Body.scale(body,currentRadius/body.circleRadius,currentRadius/body.circleRadius);
        // Every visible head is solid, including a screw parked on the board.
        // Only the plate actually pinned by this screw excludes that contact.
        const attached=level.plates.filter(p=>p.state!=='gone'&&p.pins.some(pin=>pin.hole===s.hole.id));
        body.collisionFilter.mask=2;
        body.collisionFilter[PINNED_BODIES]=new Set(attached.map(p=>bodies.get(p.id)?.id).filter(id=>id!==undefined));
      }
    }
    function sync(p){const b=bodies.get(p.id);p.x=b.position.x;p.y=b.position.y;p.angle=b.angle;p.vx=M.Body.getVelocity(b).x;p.vy=M.Body.getVelocity(b).y;p.spin=M.Body.getAngularVelocity(b);}
    function refreshPins(p){
      const b=bodies.get(p.id);if(!b)return;
      for(const c of joints.get(p.id)||[])M.Composite.remove(engine.world,c);joints.set(p.id,[]);
      // A remaining screw is a real pivot, including on advanced stages.
      // The plate may swing into other metal instead of being frozen in place.
      const fixed=p.pins.length>=2;M.Body.setStatic(b,fixed);
      p.state=p.pins.length>=2?'fixed':p.pins.length?'hinged':'loose';
      // Released plates collide with the remaining screws and fixed plates.
      // The contact can leave a badly released plate physically jammed.
      if(fixed){M.Body.setVelocity(b,{x:0,y:0});M.Body.setAngularVelocity(b,0);}
      else if(p.pins.length===1){
        const pin=p.pins[0],hole=level.holes[pin.hole],q=worldPoint(p,p.mounts[pin.mount]);
        const c=M.Constraint.create({pointA:{x:hole.x,y:hole.y},bodyB:b,pointB:{x:q.x-p.x,y:q.y-p.y},length:0,stiffness:1,damping:.12});
        joints.set(p.id,[c]);M.Composite.add(engine.world,c);
      }
    }
    for(const p of level.plates)if(p.state!=='gone'){
      const b=M.Bodies.fromVertices(p.x,p.y,[p.vertices],{label:'metal-'+p.id,friction:.45,frictionStatic:.7,frictionAir:.012,restitution:.04,density:.002,slop:.025,collisionFilter:{category:2,mask:3}});
      M.Body.setAngle(b,p.angle);M.Body.setVelocity(b,{x:p.vx||0,y:p.vy||0});M.Body.setAngularVelocity(b,p.spin||0);
      b.collisionFilter[BODY_ID]=b.id;bodies.set(p.id,b);M.Composite.add(engine.world,b);refreshPins(p);
    }
    refreshScrews();
    function lift(screw){
      if(dead||level.screws.some(s=>!s.hole)||!canUnscrew(level,screw))return false;
      const from=screw.hole;screw.heldFrom=from.id;from.screw=null;screw.hole=null;
      for(const p of level.plates)if(p.state!=='gone'&&p.pins.some(pin=>pin.hole===from.id)){
        p.pins=p.pins.filter(pin=>pin.hole!==from.id);refreshPins(p);
      }
      refreshScrews();return true;
    }
    function move(screw,to){
      if(dead||(screw.hole&&(level.screws.some(s=>!s.hole)||!canUnscrew(level,screw)))||!canSeatScrew(level,to,screw))return false;
      const from=screw.hole,changed=new Set();
      for(const p of level.plates)if(p.state!=='gone'){
        if(from&&p.pins.some(pin=>pin.hole===from.id)){p.pins=p.pins.filter(pin=>pin.hole!==from.id);changed.add(p);}
        const mount=alignedMount(p,to);if(mount>=0&&!p.pins.some(pin=>pin.mount===mount)){p.pins.push({hole:to.id,mount});changed.add(p);}
      }
      if(from)from.screw=null;to.screw=screw.id;screw.hole=to;delete screw.heldFrom;
      for(const p of changed)refreshPins(p);
      refreshScrews();
      return true;
    }
    function step(seconds){
      if(dead)return[];accumulator+=clamp(seconds,0,.05)*1000;const gone=[];
      while(accumulator+1e-8>=STEP){
        M.Engine.update(engine,STEP);accumulator-=STEP;
        for(const p of level.plates)if(p.state!=='gone'){
          sync(p);const b=bodies.get(p.id);
          // Supported or jammed plates never disappear on a timer.
          if(!p.pins.length&&b.bounds.min.y>BOARD.y+BOARD.h+20){
            p.state='gone';M.Composite.remove(engine.world,b);bodies.delete(p.id);gone.push(p.id);
          }
        }
      }
      return gone;
    }
    function destroy(){dead=true;M.Composite.clear(engine.world,false);M.Engine.clear(engine);bodies.clear();joints.clear();screwBodies.clear();}
    return{step,lift,move,destroy,engine,bodies,screwBodies};
  }
  const api={BOARD,SCREW_RADIUS,LAST_STAGE,SHAPE_NAMES,makeFlatLevel,createPhysics,canUnscrew,canAccessHole,canSeatScrew,bareHole,plateCovers,screwPoint,screwDepth,screwRadius,worldPoint,alignedMount,polygonDistance};
  if(typeof window!=='undefined')window.OjjudaFlatPhysics=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
