// Shared authoring contract: rear grid anchors, item-specific front clearance,
// three real view images, and a single approved color/material reference.
export const ART_STYLE={reference:'references/home-style.png',materials:['warm oak','cream ivory','muted lavender'],lighting:'soft cream daylight; retain natural grain and gentle shadows'};
export const FURNITURE={
 bookshelf:{
  label:'원목 책장',width:2,depth:1,height:3.8,depthFill:2/3,
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
