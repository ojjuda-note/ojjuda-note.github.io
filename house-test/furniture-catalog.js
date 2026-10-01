// Shared authoring contract: rear grid anchors, item-specific front clearance,
// three real view images, and a single approved color/material reference.
export const ART_STYLE={reference:'references/home-style.png',materials:['warm oak','cream ivory','muted lavender'],lighting:'soft cream daylight; retain natural grain and gentle shadows'};
const deskSources={
 center:{
  top:[[180,174],[1354,174],[1482,281],[54,281]],
  edge:[[54,282],[1482,282],[1481,313],[54,313]],
  end:[[54,282],[1482,282],[1481,313],[54,313]],
  apron:[[158,318],[1380,318],[1380,383],[158,383]],
  apronEnd:[[158,318],[1380,318],[1380,383],[158,383]],
  leg:[[95,318],[153,318],[145,878],[98,878]],
  legSide:[[95,318],[153,318],[145,878],[98,878]]
 },
 left:{
  top:[[84,210],[1115,133],[1477,202],[291,294]],
  edge:[[291,294],[1477,202],[1477,233],[291,325]],
  end:[[84,210],[291,294],[291,325],[84,243]],
  apron:[[371,323],[1390,241],[1390,303],[371,393]],
  apronEnd:[[143,278],[291,332],[291,390],[143,330]],
  leg:[[313,325],[369,323],[350,915],[313,919]],
  legSide:[[292,326],[313,325],[313,919],[296,906]]
 },
 right:{
  top:[[418,121],[1482,206],[1236,335],[54,208]],
  edge:[[54,208],[1236,335],[1236,365],[54,235]],
  end:[[1236,335],[1482,206],[1482,232],[1236,365]],
  apron:[[142,247],[1157,355],[1157,429],[142,302]],
  apronEnd:[[1245,356],[1424,260],[1424,319],[1245,416]],
  leg:[[1159,361],[1213,365],[1211,930],[1173,922]],
  legSide:[[1213,365],[1243,354],[1227,918],[1211,930]]
 }
};
const plane=source=>({source,clip:source});
const deskTextures=kind=>Object.fromEntries(Object.entries(deskSources).map(([direction,s])=>[direction,{
 image:`assets/desk-${direction}-v1.webp`,planes:{
  front:plane(s[kind==='top'?'edge':kind]),
  side:plane(s[kind==='top'?'end':kind==='leg'?'legSide':'apronEnd']),
  top:plane(s.top)
 }
}]));
const deskParts=[
 ...[[0,0],[.95,0],[0,.88],[.95,.88]].map(([u,v],i)=>({id:'leg-'+i,u,v,w:.05,d:.12,base:0,height:1.5,views:deskTextures('leg')})),
 ...[0,.92].map((v,i)=>({id:'apron-'+i,u:.05,v,w:.9,d:.08,base:1.25,height:.25,views:deskTextures('apron')})),
 ...[0,.95].map((u,i)=>({id:'end-apron-'+i,u,v:.12,w:.05,d:.76,base:1.25,height:.25,views:deskTextures('apron')})),
 {id:'tabletop',u:0,v:0,w:1,d:1,base:1.5,height:.1,views:deskTextures('top')}
];
const chairSources={
 center:{
  seatTop:[[250,657],[775,657],[870,805],[153,805]],seatEdge:[[152,779],[872,779],[872,872],[152,872]],
  sideEdge:[[152,779],[872,779],[872,872],[152,872]],
  rail:[[150,73],[877,73],[877,261],[150,261]],
  post:[[215,235],[268,242],[312,663],[247,670]],
  slat:[[491,260],[533,260],[535,659],[490,659]],
  leg:[[203,862],[268,866],[200,1458],[148,1456]],
  stretcher:[[251,1020],[771,1020],[771,1055],[251,1055]]
 },
 left:{
  seatTop:[[205,682],[689,617],[934,729],[413,819]],seatEdge:[[413,819],[934,729],[944,792],[411,874]],
  sideEdge:[[198,684],[413,819],[411,874],[190,748]],
  rail:[[125,44],[741,44],[741,245],[125,245]],
  post:[[172,224],[229,233],[281,673],[215,676]],
  slat:[[391,243],[433,238],[469,626],[428,632]],
  leg:[[366,881],[438,870],[391,1490],[335,1486]],
  stretcher:[[433,1014],[857,954],[861,987],[436,1054]]
 },
 right:{
  seatTop:[[382,646],[865,704],[656,865],[105,760]],seatEdge:[[105,760],[656,865],[661,923],[93,826]],
  sideEdge:[[656,865],[865,704],[885,760],[661,923]],
  rail:[[302,64],[966,64],[966,274],[302,274]],
  post:[[853,273],[911,265],[853,702],[786,688]],
  slat:[[625,266],[666,269],[641,662],[597,654]],
  leg:[[578,920],[637,922],[699,1475],[642,1479]],
  stretcher:[[203,1000],[597,1072],[599,1107],[201,1035]]
 }
};
const chairTextures=kind=>Object.fromEntries(Object.entries(chairSources).map(([direction,s])=>[direction,{
 image:`assets/chair-${direction}-v1.webp`,planes:{
  front:plane(s[kind==='seat'?'seatEdge':kind]),back:plane(s[kind==='seat'?'seatEdge':kind]),
  side:plane(s[kind==='seat'?'sideEdge':kind]),...(kind==='seat'?{top:plane(s.seatTop)}:{})
 }
}]));
const chairParts=[
 ...[[0,0,.05,.04],[.88,0,.83,.04],[0,.88,.05,.82],[.88,.88,.83,.82]].map(([u,v,tu,tv],i)=>({id:'leg-'+i,u,v,w:.12,d:.12,upper:{u:tu,v:tv},base:0,height:.86,cap:false,views:chairTextures('leg')})),
 ...[.07,.87].map((u,i)=>({id:'side-stretcher-'+i,u,v:.14,w:.06,d:.7,base:.35,height:.06,cap:false,views:chairTextures('stretcher')})),
 {id:'front-stretcher',u:.1,v:.84,w:.8,d:.06,base:.35,height:.06,cap:false,views:chairTextures('stretcher')},
 {id:'seat',u:0,v:0,w:1,d:1,base:.84,height:.12,views:chairTextures('seat')},
 ...[[.06,.03],[.83,.86]].map(([u,tu],i)=>({id:'back-post-'+i,u,v:.04,w:.11,d:.12,upper:{u:tu,v:0},base:.92,height:.94,cap:false,views:chairTextures('post')})),
 ...[.235,.465,.695].map((u,i)=>({id:'back-slat-'+i,u,v:.06,w:.065,d:.06,upper:{v:0},base:.96,height:.81,cap:false,views:chairTextures('slat')})),
 {id:'back-rail',u:0,v:0,w:1,d:.14,base:1.7,height:.25,cap:false,views:chairTextures('rail')}
];
export const FURNITURE={
 chair:{
  label:'원목 의자',shortLabel:'의자',width:1,depth:1,height:1.95,depthFill:1,introduced:5,
  directions:['left','center','right'],anchor:'rear',layer:'standing',
  imageSize:{width:1024,height:1536},views:chairTextures('seat'),components:chairParts,
  preferred:{direction:'left',x:7.5,y:5},clearance:'책상 앞 여유 공간을 남기고 의자를 놓아 주세요.'
 },
 desk:{
  label:'원목 책상',shortLabel:'책상',width:3,depth:1.5,height:1.6,depthFill:2/3,introduced:4,
  directions:['left','center','right'],anchor:'rear',layer:'standing',
  imageSize:{width:1536,height:1024},views:deskTextures('top'),components:deskParts,
  preferred:{direction:'right',x:8.5,y:4},clearance:'책상 앞 0.5칸을 비워 의자와 다리를 둘 여유를 남겨요.'
 },
 bookshelf:{
  label:'원목 책장',shortLabel:'책장',width:2,depth:1,height:3.8,depthFill:2/3,
  directions:['left','center','right'],anchor:'rear',layer:'standing',
  imageSize:{width:1024,height:1536},
  views:{
   right:{image:'assets/bookshelf-right-v1.webp',planes:{
    front:{source:[[309,180],[637,117],[637,1501],[315,1368]],clip:[[300,182],[637,117],[637,1510],[300,1510]]},
    side:{source:[[637,117],[757,145],[750,1429],[637,1501]],clip:[[637,117],[770,135],[770,1440],[637,1510]]}
   }},
   left:{image:'assets/bookshelf-left-v1.webp',planes:{
    front:{source:[[416,116],[729,174],[718,1374],[415,1481]],clip:[[416,112],[736,170],[736,1390],[440,1485],[416,1490]]},
    side:{source:[[277,145],[416,116],[415,1481],[285,1438]],clip:[[270,140],[416,112],[416,1490],[270,1445]]}
   }},
   center:{image:'assets/bookshelf-center-v1.webp',planes:{
    front:{source:[[289,112],[737,112],[731,1470],[293,1470]],clip:[[285,112],[740,112],[740,1480],[285,1480]]}
   }}
  },
  attachments:[{
   id:'top-box',widthFraction:.65,depthFraction:.75,height:.32,
   views:{
    right:{image:'assets/bookshelf-right-v1.webp',planes:{
     front:{source:[[367,90],[527,54],[527,134],[367,167]],clip:[[367,90],[527,54],[527,134],[367,167]]},
     side:{source:[[527,54],[651,83],[651,117],[527,134]],clip:[[527,54],[651,83],[651,117],[527,134]]}
    }},
    left:{image:'assets/bookshelf-left-v1.webp',planes:{
     front:{source:[[493,45],[650,76],[650,156],[493,128]],clip:[[493,45],[650,76],[650,156],[493,128]]},
     side:{source:[[364,74],[493,45],[493,128],[364,126]],clip:[[364,74],[493,45],[493,128],[364,126]]}
    }},
    center:{image:'assets/bookshelf-center-v1.webp',planes:{
     front:{source:[[374,25],[651,25],[650,112],[375,112]],clip:[[374,25],[651,25],[650,112],[375,112]]}
    }}
   }
  }]
 }
};
export function itemSize(id,direction){
 const item=FURNITURE[id];if(!item||!item.directions.includes(direction))return null;
 return direction==='center'?{w:item.width,d:item.depth}:{w:item.depth,d:item.width};
}
export function contactBounds(id,s){
 const item=FURNITURE[id],size=itemSize(id,s.direction);if(!item||!size)return null;
 // Keep the entire rear edge on the reservation's grid corners. Only the
 // forward depth changes: no sideways inset and no reduction in height.
 if(s.direction==='center')return {x:s.x,y:s.y,w:size.w,d:size.d*item.depthFill};
 const w=size.w*item.depthFill;
 return {x:s.x+(s.direction==='right'?size.w-w:0),y:s.y,w,d:size.d};
}
