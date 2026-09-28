/* Ojjuda World — layered, wardrobe-compatible character artwork.
 * Keep the original avatar data and pose anchors. No image or network dependency.
 */
(function (root) {
  'use strict';
  var serial = 0;
  var skinPalette = ['#FFE3D0','#F6CFA9','#E0A77C','#A86E4B','#FFF0E6','#F3C29A','#C98B62','#7E4B2F'];
  var hairPalette = ['#3B2A2A','#7A4B2E','#D9A45B','#E86E8E','#6E7BEA','#2E2E38','#A34A33','#E8904A','#9AA0B5','#F1F1F4','#6CCFB5','#B69CF0','#F2D16B','#34406B'];
  function tone(color, amount) {
    var c = String(color).replace('#','');
    if (c.length === 3) c = c.split('').map(function(v){return v+v;}).join('');
    if (!/^[\da-f]{6}$/i.test(c)) return color;
    var n = parseInt(c,16), target=amount<0?0:255, weight=Math.abs(amount);
    return '#' + [n>>16,(n>>8)&255,n&255].map(function(v){return Math.round(v+(target-v)*weight).toString(16).padStart(2,'0');}).join('');
  }
  function path(d, fill, extra) { return '<path d="'+d+'" fill="'+(fill||'none')+'" '+(extra||'')+'/>'; }
  function line(d, color, width, extra) { return path(d,'none','stroke="'+color+'" stroke-width="'+(width||.6)+'" stroke-linecap="round" stroke-linejoin="round" '+(extra||'')); }
  function eye(x, id, mood) {
    var upper = 'M'+(x-3.65)+' -57.2 C'+(x-3.5)+' -63.1 '+(x+3.15)+' -63.4 '+(x+3.65)+' -57.4';
    return '<g class="oj-av-eye">'+
      '<ellipse cx="'+x+'" cy="-58" rx="3.8" ry="4.85" fill="#FFF9F3"/>'+
      '<ellipse cx="'+(x+.15)+'" cy="-57.75" rx="3.05" ry="4.3" fill="url(#'+id+'-iris)"/>'+
      '<ellipse cx="'+(x+.22)+'" cy="-58.15" rx="1.66" ry="3.02" fill="#302325"/>'+
      '<ellipse cx="'+(x-1.08)+'" cy="-60.03" rx="1.12" ry="1.36" fill="#FFFFFF"/>'+
      '<circle cx="'+(x+1.35)+'" cy="-55.8" r=".56" fill="#FFECCF"/>'+
      line(upper,'#56352F',mood==='cool'?1.12:.86)+
      line('M'+(x-2.25)+' -53.5 Q'+x+' -52.95 '+(x+2)+' -53.65','#C99583',.38,'opacity=".5"')+
      '</g>';
  }
  function face(mood, id, skin) {
    var ink='#69423A';
    var closed=function(x){return line('M'+(x-3.5)+' -57 Q'+x+' -62.1 '+(x+3.5)+' -57',ink,1.25)+line('M'+(x-3.6)+' -56.9 l-1 -.8',ink,.65);};
    var sleepy=function(x){return line('M'+(x-3.35)+' -58 Q'+x+' -56.2 '+(x+3.35)+' -58',ink,1.05);};
    var heart=function(x){return '<g transform="translate('+x+' -58)">'+path('M0 3.9 C-7.1 -.8-2.7-5.9 0-2.2 C2.7-5.9 7.1-.8 0 3.9','url(#'+id+'-pink)')+'</g>';};
    var star=function(x){return '<g transform="translate('+x+' -58)">'+path('M0-4.8 1.25-1.5 4.65-1.3 2.05.9 2.9 4.2 0 2.4 -2.9 4.2 -2.05.9 -4.65-1.3 -1.25-1.5Z','#EDBB56','stroke="#A56930" stroke-width=".4"')+'</g>';};
    var eyes;
    if(mood==='grin') eyes=closed(-7)+closed(7);
    else if(mood==='wink'||mood==='tongue') eyes=eye(-7,id)+closed(7);
    else if(mood==='love') eyes=heart(-7)+heart(7);
    else if(mood==='sleepy') eyes=sleepy(-7)+sleepy(7);
    else if(mood==='shy') eyes=line('M-10.4-60.5 -5.2-57.8 -10.4-55.2 M10.4-60.5 5.2-57.8 10.4-55.2',ink,1.1);
    else if(mood==='starry') eyes=star(-7)+star(7);
    else eyes=eye(-7,id,mood)+eye(7,id,mood);
    var mouth=path('M-3.4-49.9 Q0-47.5 3.4-49.9 Q2.4-46.25 0-46.15 Q-2.4-46.25-3.4-49.9Z','#A9474A')+path('M-1.7-47.1 Q0-48.2 1.7-47.1 Q0-45.9-1.7-47.1Z','#F4A09A');
    if(mood==='grin'||mood==='starry') mouth=path('M-4.5-50.6 Q0-48.5 4.5-50.6 Q3.5-44.6 0-44.5 Q-3.5-44.6-4.5-50.6Z','#963D42')+path('M-3.4-50 Q0-48.9 3.4-50 L2.8-48.6 Q0-47.9-2.8-48.6Z','#FFF8F0')+path('M-2.3-46.2 Q0-48.1 2.3-46.2 Q0-44.3-2.3-46.2Z','#EC9899');
    if(mood==='surprised') mouth='<ellipse cx="0" cy="-48.6" rx="2.3" ry="3" fill="#934148"/><ellipse cx=".1" cy="-47.5" rx="1.2" ry="1" fill="#EFA19D"/>';
    if(mood==='sleepy') mouth=line('M-2-48.5 Q0-48 2-48.5',ink,.8);
    if(mood==='calm'||!mood) mouth=line('M-2.8-49.1 Q0-47.5 2.8-49.1',ink,.75);
    if(mood==='cool') mouth=line('M-2.7-49.1 Q1-47.8 3.5-50.2',ink,.85);
    if(mood==='cry'||mood==='angry') mouth=line('M-3.4-47.6 Q0-51 3.4-47.6',ink,.95);
    if(mood==='shy') mouth=line('M-2.8-48.7 q1.4-1.2 2.8 0 q1.4 1.2 2.8 0',ink,.85);
    if(mood==='tongue') mouth=path('M-3.5-50 Q0-47.8 3.5-50 Q2.3-46 0-46 Q-2.3-46-3.5-50Z','#963D42')+path('M-1.55-47.9 Q0-48.5 1.55-47.9 L1.5-45.45 Q0-43.5-1.5-45.45Z','#EB858F')+line('M0-47.6 v1.4','#C96776',.35);
    var eyebrows=mood==='angry'?'M-11-65.1 -3.5-62.6 M11-65.1 3.5-62.6':mood==='cry'?'M-11-63.4 Q-7-63.1-4-65 M11-63.4 Q7-63.1 4-65':'M-10.5-64.4 Q-7-66-3.8-64.6 M3.8-64.6 Q7-66 10.5-64.4';
    return '<g class="oj-av-face">'+
      '<ellipse cx="-18.1" cy="-57.4" rx="3.65" ry="5.5" fill="url(#'+id+'-skin)"/><ellipse cx="18.1" cy="-57.4" rx="3.65" ry="5.5" fill="url(#'+id+'-skin)"/>'+
      line('M-19.4-59.8 Q-16.4-61-17.2-54.8 M19.4-59.8 Q16.4-61 17.2-54.8',tone(skin,-.22),.68,'opacity=".55"')+
      path('M-18.9-62.2 C-19.6-74.8-11.4-80.1 0-80.1 C11.4-80.1 19.6-74.8 18.9-62.2 L18.4-55.3 C17.7-45.9 9.5-41.4 0-40.95 C-9.5-41.4-17.7-45.9-18.4-55.3Z','url(#'+id+'-skin)','stroke="'+tone(skin,-.15)+'" stroke-width=".4"')+
      '<ellipse cx="-11.7" cy="-51.8" rx="5.2" ry="3.8" fill="url(#'+id+'-blush)"/><ellipse cx="11.7" cy="-51.8" rx="5.2" ry="3.8" fill="url(#'+id+'-blush)"/>'+
      line(eyebrows,ink,.9,'opacity=".7"')+eyes+
      path('M-.25-55.4 Q-1.1-53.1 .1-52.9 Q1.5-52.9 1.75-53.55',tone(skin,-.15),'opacity=".72"')+
      '<ellipse cx="-.15" cy="-53.75" rx=".75" ry=".55" fill="#FFFFFF" opacity=".35"/>'+mouth+
      (mood==='cry'?path('M-9.3-53.8 Q-12.3-48.7-9.6-47.8 Q-6.8-48.7-9.3-53.8 M9.3-53.8 Q12.3-48.7 9.6-47.8 Q6.8-48.7 9.3-53.8','#9EDCEC','opacity=".9"'):'')+
      (mood==='angry'?line('M14-69 l2-2 M16.3-66.7 l2.6-.6','#D57576',.95):'')+
      '</g>';
  }
  function hairBack(kind,id,color) {
    var shapes={
      bob:'M-18-70 C-29-64-26-47-23-41 C-21-36-15-38-12-38 L13-38 C21-37 25-40 25-47 C27-57 25-66 18-70Z',
      long:'M-19-70 C-25-61-23-40-25-29 Q-19-22-12-25 Q-4-21 2-25 Q12-21 23-27 C20-40 26-61 18-70Z',
      bangs:'M-19-69 C-25-58-22-42-23-28 Q-13-24-8-27 Q0-24 8-27 Q16-24 23-28 C22-42 25-58 19-69Z',
      wavy:'M-19-69 C-30-58-18-52-25-43 C-34-33-22-24-16-26 Q-8-20-1-25 Q7-20 14-25 C25-22 32-32 25-43 C18-53 30-59 18-69Z',
      ponytail:'M14-71 C29-79 34-65 28-54 C23-45 26-40 21-37 C16-39 14-46 17-54 C22-64 13-63 14-71Z',
      twin:'M-15-68 C-31-73-30-56-26-49 Q-22-38-17-39 C-24-52-15-51-15-68Z M15-68 C31-73 30-56 26-49 Q22-38 17-39 C24-52 15-51 15-68Z',
      braid:'M16-62 Q25-58 20-51 Q27-47 21-42 Q27-37 21-32 Q26-28 20-24 Q15-25 17-31 Q12-35 17-41 Q12-46 17-51 Q11-58 16-62Z',
      afro:'M-24-62 C-33-73-24-80-18-80 C-16-92-5-92 0-88 C7-94 18-87 19-81 C30-80 32-68 25-63 C29-54 21-43 15-47 C6-40-4-40-12-46 C-24-40-31-52-24-62Z'
    };
    var d=shapes[kind]; if(!d)return '';
    var result=path(d,'url(#'+id+'-hairback)','stroke="'+tone(color,-.16)+'" stroke-width=".35" stroke-linejoin="round"');
    var details={bob:'M-20-62 Q-25-48-18-41 M-15-60 Q-20-44-14-39 M20-62 Q25-48 18-41 M15-60 Q20-44 14-39',long:'M-18-59 Q-20-42-21-29 M-13-52 Q-16-34-12-27 M18-59 Q20-42 21-29 M13-52 Q16-34 12-27',bangs:'M-18-59 Q-20-41-19-29 M-13-52 Q-15-38-13-29 M18-59 Q20-41 19-29 M13-52 Q15-38 13-29',wavy:'M-21-62 C-26-51-17-50-23-40 Q-27-30-17-29 M21-62 C26-51 17-50 23-40 Q27-30 17-29',ponytail:'M23-68 Q29-62 23-53 Q19-45 22-40',twin:'M-23-65 Q-28-57-23-48 M23-65 Q28-57 23-48',braid:'M17-58 l4 5 -4 6 4 5 -4 5 4 5',afro:'M-24-68 q4-7 8-4 M-18-79 q5-5 9-1 M7-83 q5-3 8 2 M20-75 q6 2 5 7'};
    return '<g class="oj-av-hair-back">'+result+line(details[kind],tone(color,.3),1.4,'opacity=".2"')+(kind==='braid'?'<ellipse cx="20" cy="-26" rx="3" ry="1.5" fill="#E895AE"/>':'')+'</g>';
  }
  function hairFront(kind,id,color) {
    var base={
      short:'M-19-58 C-24-67-20-79-8-82 Q4-88 15-78 C22-75 24-66 19-58 L16-66 Q10-64 5-71 Q0-64-6-69 Q-15-68-17-58Z',
      bob:'M-20-52 C-28-68-20-83-7-83 Q8-88 18-76 C26-68 25-58 19-50 L17-63 Q13-65 11-70 C6-62-3-64-10-66 Q-14-61-18-57Z',
      long:'M-20-55 C-25-70-20-81-6-82 Q7-88 18-76 C25-69 23-60 20-54 L17-66 Q10-66 7-72 C0-64-9-65-14-66 L-17-56Z',
      bun:'M-19-58 C-22-70-15-80 0-81 C15-82 22-70 19-58 L16-67 Q7-66 3-72 Q-3-65-11-67Z',
      ponytail:'M-19-58 C-22-70-16-82 0-81 C16-82 22-70 19-58 L16-66 Q8-65 5-72 Q-3-64-11-67Z',
      twin:'M-19-58 C-22-70-16-81 0-81 C16-81 22-70 19-58 L16-66 Q8-65 5-71 Q-3-64-11-67Z',
      wavy:'M-21-53 C-28-69-21-81-8-83 Q7-88 17-78 C28-72 26-58 21-52 L17-62 Q18-69 12-70 C8-62 0-64-3-68 Q-11-62-15-66Z',
      sidepart:'M-19-56 C-24-70-15-83-1-82 C16-85 24-71 20-58 L17-66 Q11-75 2-73 C-5-65-12-65-19-56Z',
      pixie:'M-19-57 C-25-69-17-83 0-82 C15-85 24-71 19-57 L16-65 11-62 6-70 -1-64 -6-69 -12-63 -16-65Z',
      spiky:'M-19-58 -23-69 -18-70 -16-80 -10-76 -4-87 2-78 11-85 12-76 21-77 18-67 21-63 18-57 13-66 5-67 -2-71 -9-66 -15-67Z',
      buzz:'M-18.8-62 C-21-73-13-80 0-80 C13-80 21-73 18.8-62 Q10-71 0-71 Q-10-71-18.8-62Z',
      bangs:'M-20-54 C-24-70-18-83 0-82 C18-83 24-70 20-54 L17-54 17-64 -17-64 -17-54Z',
      braid:'M-19-58 C-23-71-15-81-1-81 C16-84 23-69 19-58 L16-65 Q8-68 3-72 Q-6-66-14-65Z',
      doublebun:'M-19-58 C-23-71-15-81 0-81 C15-81 23-71 19-58 L16-65 Q8-65 4-71 Q-4-65-11-67Z'
    };
    var fill='url(#'+id+'-hair)', edge='stroke="'+tone(color,-.16)+'" stroke-width=".3" stroke-linejoin="round"';
    var head='';
    if(kind==='bun') head=path('M-8-79 C-14-91-2-96 6-88 Q13-81 6-77Z',fill,edge)+line('M-6-82 Q-8-91 1-89 M-1-81 Q8-87 4-89',tone(color,.28),.8);
    if(kind==='doublebun') head='<ellipse cx="-15.5" cy="-79" rx="8" ry="8.4" fill="'+fill+'" '+edge+'/><ellipse cx="15.5" cy="-79" rx="8" ry="8.4" fill="'+fill+'" '+edge+'/>';
    if(kind==='curly'||kind==='afro') {
      var curls=kind==='afro'?[[-19,-67,7],[-15,-75,7],[-7,-81,7],[2,-81,7],[11,-78,7],[19,-71,7],[20,-61,6.5]]:[[-19,-59,5.5],[-18,-69,7],[-11,-77,7],[-2,-80,7.5],[8,-78,7],[17,-71,7],[20,-61,6]];
      head+=curls.map(function(c){return '<circle cx="'+c[0]+'" cy="'+c[1]+'" r="'+c[2]+'" fill="'+fill+'" '+edge+'/>'+line('M'+(c[0]-c[2]*.45)+' '+(c[1]+1)+' q-2-6 4-5',tone(color,.36),.65,'opacity=".7"');}).join('');
    } else {
      head+=path(base[kind]||base.bob,fill,edge);
      var strands=kind==='bangs'?'M-14-74 Q-17-69-16-64 M-8-77 Q-10-69-9-64 M0-78 Q-2-71-1-64 M7-77 Q5-70 6-64 M13-74 Q12-69 14-64':kind==='buzz'?'M-13-73 Q-4-79 5-75 M-9-74 Q0-78 8-74':kind==='sidepart'||kind==='braid'?'M-15-64 Q-11-78 3-78 M-9-69 Q-4-77 3-78 M7-78 Q17-75 18-65':'M-16-65 Q-18-77-5-79 M-10-70 Q-10-77-2-79 M-3-71 Q2-74 5-79 M9-77 Q17-76 19-65';
      head+=line(strands,tone(color,.3),1.2,'opacity=".25"')+line(strands,tone(color,.24),.35,'opacity=".32"');
      if(kind!=='buzz'&&kind!=='spiky'&&kind!=='bangs') {
        head+=path('M-17.3-68.1 C-17.4-74.7-9.6-79.6-3.3-79.1 C-9.9-76.8-13.8-73.7-17.3-68.1Z',tone(color,.62),'opacity=".15"')+
          line('M-16.3-70.4 C-14.7-74.4-10.3-77.3-5.6-78.2',tone(color,.67),.52,'opacity=".32"')+
          line('M-11.5-73.7 Q-8.8-77-3.5-78.4 M11.1-75.2 Q15.5-72.4 16.9-67.1',tone(color,.48),.3,'opacity=".45"');
      }
    }
    if(kind==='twin'||kind==='doublebun') head+='<ellipse cx="-18" cy="-70" rx="2.6" ry="2.2" fill="#EB9DB6"/><ellipse cx="18" cy="-70" rx="2.6" ry="2.2" fill="#EB9DB6"/>';
    return '<g class="oj-av-hair-front">'+head+'</g>';
  }
  function shoes(kind,id,material) {
    var color={sneakers:'#F5F1E9',loafers:'#83573D',boots:'#9B6A49',rainboots:'#F3C86F',sandals:'#CB9C73',slippers:'#ECAEC9',kkotsin:'#EFA7C2'}[kind]||'#F5F1E9';
    var g=material(color), dark=tone(color,-.22), result='';
    [-1,1].forEach(function(side){
      var x=side*5.5;
      result+='<g transform="translate('+x+' 0)">';
      if(kind==='boots'||kind==='rainboots') result+=path('M-3.9-11.5 Q0-12.7 3.9-11.5 L4-4 Q6-3 6.1-.6 Q5.5 1.1-5.2.5 L-5.2-2Z',g,'stroke="'+dark+'" stroke-width=".4"')+line('M-3.5-10.7 Q0-9.9 3.5-10.7',tone(color,.25),.8)+line('M-2.5-8.7 L-2.5-3.5',tone(color,.42),.8,'opacity=".55"');
      else if(kind==='sandals') result+=path('M-4.8-2.6 Q-4.5-4.1-.8-4.4 Q3.8-4.9 5.4-1.8 Q5.8.6-.1 1 Q-5.4.8-4.8-2.6Z',g)+line('M-3.8-2.9 Q0-6 3.7-2.8','#C97279',1.35)+line('M-.5-4.2 V-1.8','#D58D8B',1.05);
      else result+=path('M-4.9-1 Q-5.1-4.9-.8-5.6 Q2.1-5.9 3.7-3.6 Q6.2-2.7 5.6-.1 Q2.8 2-3.6.9 Q-5.1.7-4.9-1Z',g,'stroke="'+dark+'" stroke-width=".4"')+path('M-4.8-.8 Q.2.8 5.5-.4 L5.3.5 Q1.1 2.2-4.5 1Z',tone(color,-.08));
      if(kind==='sneakers') result+=line('M-2.1-3.8 L1.6-3.7 M-1.5-2.6 L2.4-2.5','#FFFFFF',.75)+line('M-4.2-1.8 Q.2-.5 4.8-1.6',tone(color,-.1),.48);
      if(kind==='loafers') result+=line('M-3.8-3 L3.2-3','#DDBB86',1.1)+path('M-.7-3.7 H.9 V-2.4 H-.7Z','#EBC891');
      if(kind==='slippers') result+='<ellipse cx="-2" cy="-5" rx="1.5" ry="2" fill="#FFF4EB"/><ellipse cx="2" cy="-5" rx="1.5" ry="2" fill="#FFF4EB"/><circle cx="-1.2" cy="-2.8" r=".42" fill="#7D5969"/><circle cx="1.2" cy="-2.8" r=".42" fill="#7D5969"/>';
      if(kind==='kkotsin') result+='<circle cx=".5" cy="-3.7" r="1.2" fill="#F7E6AE"/><circle cx=".5" cy="-3.7" r=".45" fill="#E8AB71"/>';
      result+='</g>';
    });
    return '<g class="oj-av-shoes">'+result+'</g>';
  }
  function fabric(t, material) {
    var top=t.top||'tee', color=t.topColor||'#9DB7F5', bottom=t.bottomColor||'#3A3F66', dark=tone(color,-.2), light=tone(color,.4);
    var result='';
    if(top==='cardigan') {
      result=path('M-9.7-42.4 Q-6.4-44.8-1-40.3 L-3.5-35.8 Q-8.5-35.8-9.7-42.4Z','#FFF6E9')+path('M9.7-42.4 Q6.4-44.8 1-40.3 L3.5-35.8 Q8.5-35.8 9.7-42.4Z','#FFF6E9')+line('M0-35.8 V-22.4',dark,.5)+line('M-8.7-26.4 H-3.7 M3.7-26.4 H8.7',dark,.55)+line('M-8.5-25.7 H-4 M4-25.7 H8.5',light,.45);
      [-34,-29,-24].forEach(function(y){result+='<circle cx=".4" cy="'+y+'" r="1.18" fill="#F5E4C6" stroke="'+dark+'" stroke-width=".22"/><circle cx=".1" cy="'+(y-.35)+'" r=".35" fill="#FFFDF5"/>';});
    }
    if(top==='hoodie')result=line('M-9-39 Q-6-44 0-40 Q6-44 9-39',dark,.68)+line('M-5.7-27.8 Q0-26.8 5.7-27.8',light,.6);
    if(top==='shirt'||top==='jacket')result+=line('M-8.8-29 Q-7.1-27.5-5.6-29 M5.6-29 Q7.1-27.5 8.8-29',light,.55);
    if(top==='dress'||top==='witch')result+=line('M-8-26 Q-9-17-12-12 M-2-24 V-12 M7-26 Q10-17 12-12',dark,.55,'opacity=".55"')+line('M-7-25 Q-7-17-9-12 M5-25 Q6-17 9-12',light,.6,'opacity=".45"');
    if(!['dress','witch','hanbok','santa'].includes(top))result+=line('M-10.1-25.3 Q0-23 10.1-25.3',dark,.45,'opacity=".35"')+line('M-9.7-39 Q-11-34-9.7-31 M9.7-39 Q11-34 9.7-31',light,.6,'opacity=".65"');
    if(['sweater','cardigan','vest'].includes(top)){
      var stitches='';for(var x=-9;x<=9;x+=2)stitches+=line('M'+x+' -32 l.35 .55 .35-.55 M'+x+' -28 l.35 .55 .35-.55',light,.21,'opacity=".35"');
      result+=stitches;
    }
    if(!['dress','witch'].includes(top)&&['pants','jeans','jogger','santapants',undefined].includes(t.bottom)){
      result+=line('M-7.5-19 Q-7.6-10-8-6 M3.5-19 Q3.4-10 3-6',tone(bottom,.45),.65,'opacity=".5"')+line('M-7.8-7.7 l4.7 .5 M3-7.7 l4.7 .5',tone(bottom,-.15),.55,'opacity=".7"');
      if(t.bottom==='jeans')result+=line('M-8.7-23 Q-7.8-19-3.4-20 M8.7-23 Q7.8-19 3.4-20 M-.3-23 v4',tone(bottom,-.2),.52)+line('M-7.3-15 l3.4-.7 M3.4-15 l3.4.7',tone(bottom,.4),.5,'opacity=".7"');
    }
    return '<g class="oj-av-fabric" pointer-events="none">'+result+'</g>';
  }
  // The running game uses Canvas rather than the room's SVG scene. Keep its
  // original pivot coordinates and phase equations, and paint the same materials.
  function createRunner(skins,hairs) {
    return function N2(ctx,x,y,phase,jumping,cfg) {
      cfg=cfg||{};
      if(!ctx||![x,y,phase].every(Number.isFinite))return;
      var skin=skins[cfg.skin]||skins[0],hair=hairs[cfg.hairColor]||hairs[0],top=cfg.topColor||'#9DB7F5',bottom=cfg.bottomColor||'#3A3F66';
      var shoe={sneakers:'#F5F1E9',loafers:'#83573D',boots:'#9B6A49',rainboots:'#F3C86F',sandals:'#CB9C73',slippers:'#ECAEC9',kkotsin:'#EFA7C2'}[cfg.shoes]||'#F5F1E9';
      var dress=cfg.top==='dress'||cfg.top==='witch',skirt=dress||['skirt','pleats','longskirt','chima'].includes(cfg.bottom),swing=jumping?0:Math.sin(phase*16);
      function mat(c,x0,y0,x1,y1) {
        var g=ctx.createLinearGradient(x0,y0,x1,y1);
        g.addColorStop(0,tone(c,.24));g.addColorStop(.35,tone(c,.08));g.addColorStop(.72,c);g.addColorStop(1,tone(c,-.22));return g;
      }
      function oval(cx,cy,rx,ry,fill) {ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
      function rounded(rx,ry,w,h,r,fill) {
        r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(rx+r,ry);ctx.lineTo(rx+w-r,ry);ctx.quadraticCurveTo(rx+w,ry,rx+w,ry+r);ctx.lineTo(rx+w,ry+h-r);ctx.quadraticCurveTo(rx+w,ry+h,rx+w-r,ry+h);ctx.lineTo(rx+r,ry+h);ctx.quadraticCurveTo(rx,ry+h,rx,ry+h-r);ctx.lineTo(rx,ry+r);ctx.quadraticCurveTo(rx,ry,rx+r,ry);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
      }
      function stroke(draw,color,width) {ctx.beginPath();draw();ctx.strokeStyle=color;ctx.lineWidth=width||.6;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
      function polygon(points,fill) {ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
      function leg(angle,cloth,foot) {
        ctx.save();ctx.translate(0,-28);ctx.rotate(angle);
        var bare=skirt||cfg.bottom==='shorts';
        rounded(-3.5,0,7,22,3.5,mat(bare?skin:cloth,-4,0,5,20));
        if(cfg.bottom==='shorts'&&!skirt)rounded(-4.1,-.2,8.2,9,2.4,mat(cloth,-4,0,4,9));
        if(!bare)stroke(function(){ctx.moveTo(-1.9,4);ctx.quadraticCurveTo(-2.2,12,-2,18);},tone(cloth,.35),.55);
        if(cfg.shoes==='boots'||cfg.shoes==='rainboots')rounded(-3.6,13.5,7.1,9,1.8,mat(foot,-4,13,5,22));
        rounded(-3.5,19,12,6,3,mat(foot,-4,19,9,25));
        stroke(function(){ctx.moveTo(-2.5,23.5);ctx.quadraticCurveTo(2.5,24.5,7.4,23.5);},tone(foot,-.18),.62);
        if(!cfg.shoes||cfg.shoes==='sneakers')stroke(function(){ctx.moveTo(.1,20.4);ctx.lineTo(3.4,20.8);ctx.moveTo(-.4,21.6);ctx.lineTo(3.1,22);},'#FFFFFF',.7);
        if(cfg.shoes==='loafers')stroke(function(){ctx.moveTo(-.8,20.1);ctx.lineTo(3.8,20.4);},'#DEBF92',1);
        if(cfg.shoes==='slippers') {oval(-.3,19.7,1.1,1.6,'#FFF6ED');oval(2.1,19.9,1.1,1.6,'#FFF6ED');}
        ctx.restore();
      }
      function arm(angle,color) {
        ctx.save();ctx.translate(1,-50);ctx.rotate(angle);
        rounded(-3,0,6,16,3,mat(color,-3,0,4,15));
        stroke(function(){ctx.moveTo(-1.6,3);ctx.quadraticCurveTo(-2,8,-1.5,12);},tone(color,.3),.55);
        if(cfg.top==='santa')rounded(-3,12,6,2.8,1.2,'#FFF9F2');
        if(cfg.top==='hanbok') ['#E89B99','#EBCD84','#9BC9AB','#9DAEE0'].forEach(function(c,k){rounded(-3,5+k*1.8,6,1.8,.25,c);});
        oval(0,17,3.3,3.3,mat(skin,-3,14,3,20));
        stroke(function(){ctx.moveTo(.3,17.4);ctx.lineTo(.7,19);},tone(skin,-.15),.35);
        ctx.restore();
      }
      ctx.save();ctx.translate(x,y);
      try {
        oval(2,2,16,4,'rgba(78,65,91,.1)');
        leg(jumping?-.95:swing*.75,tone(bottom,-.15),tone(shoe,-.12));
        arm(jumping?-1.1:-swing*.85,tone(top,-.2));
        var longHair=['long','wavy','bangs','bob','twin','ponytail','braid'].includes(cfg.hair);
        if(longHair) {
          rounded(-16,-76,14,cfg.hair==='bob'?22:30,7,mat(hair,-16,-76,0,-44));
          stroke(function(){ctx.moveTo(-12,-67);ctx.quadraticCurveTo(-15,-58,-11,cfg.hair==='bob'?-56:-49);},tone(hair,.25),1.2);
          if(cfg.hair==='braid')[-62,-57,-52,-47].forEach(function(v){oval(-13,v,3.5,3.3,mat(hair,-17,v-3,-10,v+3));});
        }
        rounded(-9,-54,18,dress?30:25,8,mat(top,-10,-53,12,-28));
        if(skirt&&!dress) {
          var hem=cfg.bottom==='longskirt'||cfg.bottom==='chima'?-10:-20;
          polygon([[-9,-32],[9,-32],[13,hem],[-13,hem]],mat(bottom,-12,-33,15,hem));
          [-6,0,6].forEach(function(v){stroke(function(){ctx.moveTo(v*.7,-30);ctx.lineTo(v*1.3,hem-1.5);},tone(bottom,-.16),.55);});
        }
        if(dress) {
          polygon([[-9,-34],[9,-34],[14,-16],[-14,-16]],mat(top,-14,-34,14,-16));
          [-6,0,6].forEach(function(v){stroke(function(){ctx.moveTo(v*.65,-32);ctx.lineTo(v*1.5,-18);},tone(top,-.17),.55);});
          rounded(-8.5,-34,17,2.5,.5,cfg.top==='witch'?'#DCB681':tone(top,-.18));
        }
        var kind=cfg.top||'tee';
        if(kind==='cardigan'||kind==='shirt'||kind==='jacket') {
          stroke(function(){ctx.moveTo(3,-48);ctx.lineTo(3,-30);},tone(top,-.23),.6);
          polygon([[-3,-53],[3,-49],[.5,-45],[-5.8,-50]],'#FFF5E8');polygon([[3,-49],[7,-52],[8.5,-48],[6,-45]],'#FFF5E8');
          [-43,-38,-33].forEach(function(v){oval(4.1,v,.8,.9,'#F4E3C6');});
          if(kind==='jacket')polygon([[-5,-52],[-1,-45],[-4,-41],[-7,-48]],tone(top,-.19));
        }
        if(kind==='hoodie') {
          stroke(function(){ctx.moveTo(-6,-52);ctx.quadraticCurveTo(0,-45,7,-51);},tone(top,-.2),1.3);
          rounded(-2,-39,8,5,1.6,tone(top,-.1));
          stroke(function(){ctx.moveTo(1,-47);ctx.lineTo(1,-42);ctx.moveTo(4,-47);ctx.lineTo(4,-42);},'#FFF9F3',.65);
        }
        if(kind==='stripe') {rounded(-8.2,-43,16.4,2.4,.3,tone(top,.45));rounded(-8.2,-36,16.4,2.4,.3,tone(top,.45));}
        if(kind==='sweater'||kind==='vest')[-4,0,4].forEach(function(v){stroke(function(){ctx.moveTo(v,-48);ctx.quadraticCurveTo(v+1.8,-43,v,-40);ctx.quadraticCurveTo(v-1.6,-36,v,-32);},tone(top,-.18),.55);});
        if(kind==='polka') [[-4,-46],[3,-43],[-2,-38],[5,-34]].forEach(function(p){oval(p[0],p[1],1.3,1.3,'#FFF8F1');});
        if(kind==='overalls') {rounded(-5.5,-44,11,14,1.8,mat(top,-6,-44,6,-30));stroke(function(){ctx.moveTo(-4,-44);ctx.lineTo(-5,-52);ctx.moveTo(4,-44);ctx.lineTo(5,-52);},tone(top,-.16),1.6);oval(-3,-43,.8,.8,'#E9CC8E');oval(3,-43,.8,.8,'#E9CC8E');}
        if(kind==='sailor') {polygon([[-7,-53],[8,-52],[5,-44],[0,-40],[-5,-46]],'#3A4B79');stroke(function(){ctx.moveTo(-5,-51);ctx.lineTo(6,-50);ctx.lineTo(3,-45);ctx.lineTo(0,-43);},'#FFF9F1',.65);polygon([[0,-41],[2,-39],[4,-42],[3,-35],[1,-37],[-1,-35]],'#D97C82');}
        if(kind==='hanbok') {stroke(function(){ctx.moveTo(-5,-53);ctx.lineTo(3,-45);ctx.lineTo(7,-52);},'#FFF9F1',1.7);stroke(function(){ctx.moveTo(3,-45);ctx.quadraticCurveTo(9,-40,5,-33);ctx.moveTo(3,-45);ctx.quadraticCurveTo(9,-44,10,-38);},'#CF6573',1.5);}
        if(kind==='santa') {rounded(1,-51,2.5,20,.4,'#FFF9F0');rounded(-8.5,-37,17,2.8,.3,'#474051');rounded(-1,-37.8,5,4.4,.7,'#ECC782');rounded(.1,-36.7,2.8,2.1,.2,'#474051');rounded(-8,-30.8,16,2.6,.5,'#FFF9F0');}
        if(kind==='redtee') {ctx.fillStyle='#FFF9F2';ctx.font='bold 3.4px sans-serif';ctx.fillText('KOREA',-5.8,-39);}
        if(kind==='taegeuktee') {oval(1,-41,3.3,3.3,'#C95A69');ctx.beginPath();ctx.arc(1,-41,3.3,0,Math.PI);ctx.fillStyle='#5378A4';ctx.fill();}
        stroke(function(){ctx.moveTo(-7,-33);ctx.quadraticCurveTo(0,-31.8,7,-33);},tone(top,-.18),.45);
        leg(jumping?.55:-swing*.75,bottom,shoe);
        var skinGradient=ctx.createRadialGradient(-2,-75,1,3,-69,19);skinGradient.addColorStop(0,tone(skin,.25));skinGradient.addColorStop(.6,skin);skinGradient.addColorStop(1,tone(skin,-.13));
        oval(2,-70,15,15,skinGradient);
        oval(-8.5,-68.4,3,4.2,mat(skin,-12,-71,-6,-64));
        stroke(function(){ctx.moveTo(-9.7,-70);ctx.quadraticCurveTo(-7,-70.8,-8.2,-66.5);},tone(skin,-.18),.6);
        ctx.beginPath();ctx.arc(1,-72,16,Math.PI*.92,Math.PI*2.02);ctx.quadraticCurveTo(12,-82,4,-80);ctx.quadraticCurveTo(-4,-76,-8,-66);ctx.lineTo(-15,-62);ctx.closePath();ctx.fillStyle=mat(hair,-13,-87,14,-62);ctx.fill();
        stroke(function(){ctx.moveTo(-12,-74);ctx.quadraticCurveTo(-8,-84,3,-83);ctx.moveTo(-8,-77);ctx.quadraticCurveTo(-4,-82,1,-83);},tone(hair,.32),1);
        if(cfg.hair==='bangs') {polygon([[-10,-78],[13,-79],[13,-73],[4,-72],[-8,-69]],mat(hair,-12,-80,14,-70));stroke(function(){ctx.moveTo(3,-78);ctx.lineTo(4,-73);ctx.moveTo(8,-78);ctx.lineTo(9,-73);},tone(hair,.25),.55);}
        if(cfg.hair==='afro'||cfg.hair==='curly') {var curls=cfg.hair==='afro'?[[-15,-72,8],[-13,-81,8],[-5,-87,8],[5,-87,8],[12,-81,7.5]]:[[-13,-73,6],[-12,-80,6],[-5,-84,6],[3,-84,6],[10,-80,5.5]];curls.forEach(function(c){oval(c[0],c[1],c[2],c[2],mat(hair,c[0]-c[2],c[1]-c[2],c[0]+c[2],c[1]+c[2]));stroke(function(){ctx.moveTo(c[0]-2,c[1]+1);ctx.quadraticCurveTo(c[0]-4,c[1]-4,c[0]+2,c[1]-4);},tone(hair,.28),.65);});}
        if(cfg.hair==='ponytail'||cfg.hair==='twin') {ctx.save();ctx.translate(-15,-74);ctx.rotate(-.5+swing*.15);oval(-5,6,5,11,mat(hair,-10,-5,1,17));stroke(function(){ctx.moveTo(-6,-.5);ctx.quadraticCurveTo(-10,8,-5,14);},tone(hair,.3),.85);ctx.restore();}
        if(cfg.hair==='bun'||cfg.hair==='doublebun') {oval(-6,-88,7,7,mat(hair,-13,-95,1,-81));stroke(function(){ctx.moveTo(-10,-88);ctx.quadraticCurveTo(-8,-94,-3,-91);},tone(hair,.28),.8);}
        if(cfg.hair==='spiky')polygon([[-12,-82],[-8,-94],[-2,-85],[4,-96],[8,-84]],mat(hair,-10,-95,9,-81));
        if(cfg.hair==='buzz') {ctx.beginPath();ctx.arc(2,-72,14.5,Math.PI,Math.PI*1.96);ctx.lineTo(14,-77);ctx.quadraticCurveTo(0,-82,-10,-71);ctx.closePath();ctx.fillStyle=mat(hair,-12,-86,17,-68);ctx.fill();}
        // The visible eye sits at the original side-view eye anchor (9.5,-70).
        var faceKind=cfg.face||'calm';
        if(faceKind==='grin'||faceKind==='wink'||faceKind==='tongue')stroke(function(){ctx.moveTo(6.8,-69.1);ctx.quadraticCurveTo(9.7,-74,12.6,-69.1);},'#674239',1);
        else if(faceKind==='shy')stroke(function(){ctx.moveTo(7.2,-73);ctx.lineTo(11.6,-70);ctx.lineTo(7.2,-67.5);},'#674239',1);
        else if(faceKind==='sleepy')stroke(function(){ctx.moveTo(6.8,-70.1);ctx.quadraticCurveTo(9.6,-68.7,12.4,-70.1);},'#674239',1);
        else {
          oval(9.5,-70,2.9,3.9,'#FFF9F0');oval(10,-69.8,2.2,3.3,mat('#80513C',9,-73,11,-67));oval(10.3,-70.1,1.25,2.35,'#342327');oval(9.2,-71.7,.78,1,'#FFFFFF');oval(11,-68.4,.39,.46,'#FFF0D2');
          stroke(function(){ctx.moveTo(6.7,-70.3);ctx.quadraticCurveTo(7.6,-74.5,11.4,-73);},'#674239',.72);
        }
        if(faceKind==='love') {polygon([[9.7,-68],[6.8,-71.2],[8,-73.1],[9.7,-71.7],[11.6,-73],[12.7,-71.1]],'#E987A5');}
        if(faceKind==='starry')polygon([[9.6,-74],[10.5,-71.5],[13,-71.4],[11.1,-69.7],[11.7,-67.3],[9.6,-68.7],[7.5,-67.3],[8.1,-69.7],[6.2,-71.4],[8.7,-71.5]],'#E8B95E');
        var blush=ctx.createRadialGradient(7.8,-63.8,.4,7.8,-63.8,4);blush.addColorStop(0,'rgba(231,142,143,.5)');blush.addColorStop(1,'rgba(231,142,143,0)');oval(7.8,-63.8,4.3,3.3,blush);
        if(faceKind==='cry') {ctx.beginPath();ctx.moveTo(8.6,-66.8);ctx.quadraticCurveTo(6.4,-62,8.5,-61.3);ctx.quadraticCurveTo(10.8,-62,8.6,-66.8);ctx.fillStyle='#99D3E4';ctx.fill();}
        stroke(function(){ctx.moveTo(7.7,-76.1);ctx.quadraticCurveTo(10.4,faceKind==='angry'?-74.2:-77,12.1,-75.5);},'#715044',.7);
        if(faceKind==='smile'||faceKind==='grin'||faceKind==='starry') {ctx.beginPath();ctx.moveTo(10.1,-63.8);ctx.quadraticCurveTo(12.4,-62.3,14.7,-64.2);ctx.quadraticCurveTo(13.7,-59.8,11.3,-61);ctx.closePath();ctx.fillStyle='#A14D53';ctx.fill();stroke(function(){ctx.moveTo(12,-61.3);ctx.lineTo(13.5,-61.6);},'#EBA19C',1);}
        else if(faceKind==='surprised')oval(12.6,-62.3,1.4,1.9,'#A14D53');
        else if(faceKind==='tongue') {stroke(function(){ctx.moveTo(10.8,-63);ctx.quadraticCurveTo(12.5,-60.4,14.3,-63.5);},'#835249',.8);rounded(11.8,-62.2,2,3.2,.95,'#DF929E');}
        else stroke(function(){ctx.moveTo(10.8,-63);ctx.quadraticCurveTo(12.5,faceKind==='cry'||faceKind==='angry'?-65.3:-60.4,14.3,-63.5);},'#835249',.8);
        // Headwear uses the same silhouette limits as the original game renderer.
        var hat={cap:'#6E7BEA',beanie:'#6CCFB5',santahat:'#E0413E',witchhat:'#3A2E58',beret:'#E86E6E',strawhat:'#F2D38E'}[cfg.acc];
        if(hat) {
          ctx.beginPath();ctx.arc(1,-76,15.5,Math.PI,0);ctx.closePath();ctx.fillStyle=mat(hat,-15,-92,17,-75);ctx.fill();
          stroke(function(){ctx.moveTo(-11,-81);ctx.quadraticCurveTo(-6,-89,3,-88);},tone(hat,.35),.8);
          if(cfg.acc==='cap')rounded(4,-78,16,4,2,mat(hat,4,-78,20,-74));
          if(cfg.acc==='beanie')rounded(-14,-79,30,4.5,1.6,tone(hat,-.1));
          if(cfg.acc==='strawhat')oval(1,-76,21,4.2,mat(hat,-20,-80,22,-72));
          if(cfg.acc==='witchhat') {polygon([[-10,-84],[-2,-108],[10,-84]],mat(hat,-12,-104,10,-83));rounded(-22,-80,44,4,2,mat(hat,-22,-80,22,-76));rounded(-9,-86,18,3,0,'#DDAE82');}
          if(cfg.acc==='santahat') {ctx.beginPath();ctx.moveTo(-12,-84);ctx.quadraticCurveTo(-20,-98,-26,-90);ctx.lineTo(10,-84);ctx.closePath();ctx.fillStyle=mat(hat,-24,-94,10,-82);ctx.fill();oval(-26,-90,4,4,'#FFF9F1');rounded(-15,-80,32,5,2.5,'#FFF9F1');}
        }
        if(cfg.acc==='ribbon'||cfg.acc==='flower') {
          if(cfg.acc==='ribbon'){polygon([[-6,-82],[-13,-88],[-13,-80],[-6,-83],[0,-89],[1,-81]],mat('#E898B3',-13,-88,1,-80));oval(-6,-83.5,1.7,2.2,'#F1ADC5');}
          else {for(var k=0;k<5;k++){var a=k*Math.PI*2/5;oval(-6+Math.cos(a)*2.8,-83+Math.sin(a)*2.8,2.3,2.3,'#F5B7CC');}oval(-6,-83,1.8,1.8,'#ECCB84');}
        }
        if(cfg.acc==='glasses'||cfg.acc==='sunglasses') {
          if(cfg.acc==='glasses'){ctx.beginPath();ctx.ellipse(10,-70,4.1,4.7,0,0,Math.PI*2);ctx.strokeStyle='#58516C';ctx.lineWidth=.8;ctx.stroke();stroke(function(){ctx.moveTo(6,-71);ctx.lineTo(-4,-71.8);},'#58516C',.75);}
          else {rounded(6,-74.3,8.2,7.4,2.1,mat('#454358',6,-74,14,-67));stroke(function(){ctx.moveTo(6,-72);ctx.lineTo(-4,-72);},'#454358',1);stroke(function(){ctx.moveTo(8,-72.2);ctx.lineTo(10.5,-73);},'#CFCBDE',.7);}
        }
        if(cfg.acc==='headphones') {stroke(function(){ctx.moveTo(-10,-68);ctx.quadraticCurveTo(-19,-92,5,-87);},'#4B4A67',2.8);rounded(-13,-75,6.4,12,3,mat('#E594B6',-13,-75,-7,-63));}
        if(cfg.acc==='catears')polygon([[-13,-82],[-15,-98],[-5,-88],[4,-88],[12,-99],[14,-84]],mat('#4D4556',-15,-99,14,-82));
        if(cfg.acc==='bunnyears') {oval(-9,-94,3.5,11,'#FFF9F0');oval(-9,-94,1.6,8,'#EBB0C5');oval(5,-94,3.5,11,'#FFF9F0');oval(5,-94,1.6,8,'#EBB0C5');}
        if(cfg.acc==='halo') {ctx.beginPath();ctx.ellipse(0,-93,10.8,3.2,0,0,Math.PI*2);ctx.strokeStyle='#EFD592';ctx.lineWidth=2;ctx.stroke();}
        if(cfg.acc==='crown')polygon([[-9,-83],[-9,-94],[-4,-88],[1,-97],[6,-88],[11,-94],[11,-83]],mat('#EBCB79',-9,-97,11,-83));
        if(cfg.acc==='earrings'){oval(-8.6,-64,.9,1,'#E2BB72');oval(-8.6,-61.7,1.2,1.6,'#DC93B1');}
        if(cfg.acc==='bandaid') {ctx.save();ctx.translate(6,-64);ctx.rotate(-.4);rounded(-3,-1.3,6,2.6,1.2,'#E8B290');ctx.restore();}
        if(cfg.acc==='scarf') {rounded(-8,-56,19,5.5,2.5,mat('#D77D83',-8,-56,11,-50));rounded(4,-52,5,11,1.5,'#D77D83');}
        if(cfg.acc==='daenggi') {stroke(function(){ctx.moveTo(-12,-51);ctx.quadraticCurveTo(-7,-46,-10,-39);ctx.moveTo(-12,-51);ctx.quadraticCurveTo(-4,-46,-5,-42);},'#CF6578',1.8);oval(-12,-51,1.6,1.6,'#E598A6');}
        if(cfg.acc==='flagband') {stroke(function(){ctx.moveTo(-13,-78);ctx.quadraticCurveTo(0,-84,14,-79);},'#FFF9F1',3.3);oval(4,-81,2,2,'#C96573');}
        if(cfg.acc==='devilhorns') {polygon([[-11,-81],[-13,-94],[-4,-86]],mat('#C96970',-13,-94,-4,-81));polygon([[5,-84],[12,-96],[13,-81]],mat('#C96970',5,-96,13,-81));}
        if(cfg.acc==='backpack') {rounded(-14,-51,9.5,20,3.5,mat('#D98590',-14,-51,-4,-31));rounded(-13,-40,7.5,7,2,'#C67786');stroke(function(){ctx.moveTo(-3,-52);ctx.lineTo(-1,-35);},'#C67786',1.6);}
        arm(jumping?-2.3:swing*.85,top);
      } finally {ctx.restore();}
    };
  }
  function install(originals) {
    if(!originals||typeof originals.Ue!=='function')throw new Error('OjjudaAvatarArt requires the original avatar renderer');
    originals={Ue:originals.Ue,jm:originals.jm,Im:originals.Im,Om:originals.Om,Pm:originals.Pm,Nm:originals.Nm,pe:originals.pe,ye:originals.ye,N2:originals.N2};
    var skins=originals.pe||skinPalette, hairs=originals.ye||hairPalette;
    function Ue(t, options) {
      t=t||{};options=options||{};
      var id='ojav-'+(++serial).toString(36), skin=skins[t.skin]||skins[0], hair=hairs[t.hairColor]||hairs[0];
      var defs=[], colors=new Map();
      var material=function(color){
        if(!/^#[\da-f]{3}([\da-f]{3})?$/i.test(color))return color;
        if(colors.has(color))return colors.get(color);
        var key=id+'-m'+colors.size;
        defs.push('<linearGradient id="'+key+'" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="'+tone(color,.24)+'"/><stop offset=".34" stop-color="'+tone(color,.1)+'"/><stop offset=".7" stop-color="'+color+'"/><stop offset="1" stop-color="'+tone(color,-.2)+'"/></linearGradient>');
        var paint='url(#'+key+')';colors.set(color,paint);return paint;
      };
      defs.push('<radialGradient id="'+id+'-skin" cx=".32" cy=".25" r=".83"><stop stop-color="'+tone(skin,.25)+'"/><stop offset=".55" stop-color="'+skin+'"/><stop offset=".88" stop-color="'+tone(skin,-.08)+'"/><stop offset="1" stop-color="'+tone(skin,-.18)+'"/></radialGradient>',
        '<radialGradient id="'+id+'-hair" cx=".35" cy=".15" r=".92"><stop stop-color="'+tone(hair,.3)+'"/><stop offset=".36" stop-color="'+tone(hair,.12)+'"/><stop offset=".7" stop-color="'+hair+'"/><stop offset="1" stop-color="'+tone(hair,-.31)+'"/></radialGradient>',
        '<linearGradient id="'+id+'-hairback" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="'+tone(hair,-.19)+'"/><stop offset=".5" stop-color="'+hair+'"/><stop offset=".82" stop-color="'+tone(hair,.1)+'"/><stop offset="1" stop-color="'+tone(hair,-.29)+'"/></linearGradient>',
        '<radialGradient id="'+id+'-blush"><stop stop-color="#ED9D9A" stop-opacity=".58"/><stop offset="1" stop-color="#EA9B94" stop-opacity="0"/></radialGradient>',
        '<linearGradient id="'+id+'-iris" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#44282A"/><stop offset=".58" stop-color="#79503D"/><stop offset="1" stop-color="#C08F65"/></linearGradient>',
        '<linearGradient id="'+id+'-pink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F89AB4"/><stop offset="1" stop-color="#D85783"/></linearGradient>');
      var raw=originals.Ue(t,options), start=raw.lastIndexOf('<circle cx="0" cy="-60" r="19"');
      if(start<0)return raw;
      var body=raw.slice(0,start), oldBack=originals.Om(t.hair,hair), oldShoe=originals.Nm(t.shoes||'sneakers');
      body=body.replace('<ellipse cx="0" cy="0" rx="15" ry="4.5" fill="rgba(20,20,60,.18)"/>','');
      if(oldBack)body=body.replace(oldBack,'');
      body=body.replace(oldShoe,'');
      if(t.top==='cardigan'){
        body=body.replace('<rect x="-4" y="-43" width="8" height="21" fill="#FFFFFF"/>','');
        body=body.replace(/<circle cx="5\.5" cy="-(36|30)" r="1" fill="[^"]+"\/>/g,'');
      }
      // Original dashed denim center lines were much too coarse at large preview sizes.
      if(t.bottom==='jeans')body=body.replace(/<g stroke="[^"]+" stroke-width="\.8" stroke-dasharray="1\.6 1\.2">[\s\S]*?<\/g>/,'');
      // Rounded shoulders, slightly tapered sleeves and softened fingertips retain
      // the original shoulder/hand coordinates used by the pet-care animation.
      body=body.replace(/<rect x="(-17|10)" y="-40" width="7" height="17" rx="3\.5" fill="([^"]+)"\/>/g,function(_,x,color){
        return x==='-17'?path('M-11.7-40.7 Q-15.8-42-17-38.1 L-17.5-29.4 Q-17.7-24.1-14-23.2 Q-10.6-23-10.3-27.2 L-9.9-35.2Z',color):path('M11.7-40.7 Q15.8-42 17-38.1 L17.5-29.4 Q17.7-24.1 14-23.2 Q10.6-23 10.3-27.2 L9.9-35.2Z',color);
      });
      body=body.replace(/<circle cx="(-13\.5|13\.5)" cy="-22" r="3\.3" fill="([^"]+)"\/>/g,function(_,x,color){
        var mirror=+x<0?-1:1;
        return '<g transform="translate('+x+' -22) scale('+mirror+' 1)">'+path('M-2.7-1.8 Q-2.5-3.4 .2-3.2 Q2.9-3.3 3.1-.6 L3 1.6 Q2.9 3.9.6 3.5 L-1.8 2.8 Q-4.1 1.9-3.5.2Z',color)+line('M-.2.8 L.6 2.3 M1.2.7 L1.8 2',tone(skin,-.15),.35)+'</g>';
      });
      body=body.replace(/<rect x="-12" y="-43" width="24" height="21" rx="7" fill="([^"]+)"\/>/,function(_,color){return path('M-6.9-43.6 Q0-45 6.9-43.6 L11.6-39.8 Q12.8-37.4 11.5-32.2 L11.3-24 Q10.8-21.4 7.4-21.7 H-7.4 Q-10.8-21.4-11.3-24 L-11.5-32.2 Q-12.8-37.4-11.6-39.8Z',color);});
      body=body.replace(/<rect x="(-9|1)" y="-25" width="8" height="23" rx="3" fill="([^"]+)"\/>/g,function(_,x,color){return path(x==='-9'?'M-8.7-25 L-1-25 -.8-17 -1.2-4.2 Q-4.9-2.6-10.2-4.1 L-9.5-16Z':'M1-25 L8.7-25 9.5-16 10.2-4.1 Q4.9-2.6 1.2-4.2 L.8-17Z',color);});
      // Preserve every existing garment motif; add dimensional material paint.
      body=body.replace(/fill="(#[\da-f]{3}(?:[\da-f]{3})?)"/gi,function(_,c){return 'fill="'+(c.toLowerCase()===skin.toLowerCase()?'url(#'+id+'-skin)':material(c))+'"';});
      var acc=originals.Pm(t.acc).replace(/fill="(#[\da-f]{3}(?:[\da-f]{3})?)"/gi,function(_,c){return 'fill="'+material(c)+'"';});
      if(t.acc==='ribbon')acc=path('M10.8-77 Q1-88 .5-81 L1.1-72.4 Q5.6-71.9 10.8-76 M12-77 Q20.8-88 22.2-81 L21.7-72.4 Q17.2-71.9 12-76Z','url(#'+id+'-pink)','stroke="#D26F94" stroke-width=".4"')+'<ellipse cx="11.5" cy="-77" rx="2.65" ry="3.1" fill="#E899B3"/>'+line('M3.7-78.9 8.7-77 M19.4-78.9 14.4-77','#FFD1DF',.75);
      var shoe=shoes(t.shoes||'sneakers',id,material), cloth=fabric(t,material);
      return '<g class="oj-avatar-art" data-art="2.5d"><defs>'+defs.join('')+'</defs>'+
        '<ellipse cx="0" cy="1.4" rx="15.8" ry="3.7" fill="#62516C" opacity=".08"/><ellipse cx="0" cy=".8" rx="10.5" ry="2.1" fill="#564B62" opacity=".12"/>'+
        hairBack(t.hair,id,hair)+body+cloth+shoe+face(t.face,id,skin)+hairFront(t.hair,id,hair)+'<g class="oj-av-accessory">'+acc+'</g></g>';
    }
    var overrides={Ue:Ue,jm:originals.jm,Im:originals.Im,Om:originals.Om,Pm:originals.Pm,Nm:originals.Nm};
    if(typeof originals.N2==='function')overrides.N2=createRunner(skins,hairs);
    return overrides;
  }
  root.OjjudaAvatarArt={install:install,version:'20260928-soft-volume-1'};
})(typeof window!=='undefined'?window:globalThis);
