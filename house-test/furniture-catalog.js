// Shared authoring contract: rear grid anchors, item-specific front clearance,
// three real view images, and a single approved color/material reference.
export const ART_STYLE={reference:'references/home-style.png',materials:['warm oak','cream ivory','muted lavender'],lighting:'soft cream daylight; retain natural grain and gentle shadows'};
const plane=source=>({source,clip:source});
export const SOFA_ACCESSORIES=[
 {id:'cream-floral-cushion',label:'크림 꽃무늬 쿠션'},
 {id:'sage-cushion',label:'세이지 쿠션'},
 {id:'peach-cushion',label:'피치 쿠션'},
 {id:'pink-check-cushion',label:'분홍 체크 쿠션'},
 {id:'blanket-sofa',label:'분홍 담요 · 소파용'}
];
export const FURNITURE={
 chair:{label:'원목 책상 의자',shortLabel:'의자',width:1.2,depth:1.2,height:1.65,depthFill:1,introduced:15,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'made',preview:'assets/chair-center-preview-v1.png',
  preferred:{direction:'left',x:7.5,y:4.5},preferredViews:{left:{direction:'left',x:7.5,y:4.5},center:{direction:'center',x:4.5,y:4.5},right:{direction:'right',x:4,y:4.5}},
  clearance:'책상과 연결하면 무릎 공간으로 0.5칸 들어가 함께 움직여요. 연결을 끄면 따로 배치할 수 있어요.'},
 carpet:{label:'크림 샤기 카펫',shortLabel:'카펫',width:5.5,depth:3.5,height:.1,depthFill:1,introduced:14,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'floor',picture:'made',preview:'assets/carpet-center-preview-v1.png',
  preferred:{direction:'center',x:1,y:3},clearance:'바닥에 까는 보송한 카펫이에요. 가구 아래에 놓을 수 있고, 다른 바닥 소품과는 겹치지 않게 놓아 주세요.'},
 'coffee-table':{label:'원목 낮은 거실 테이블',shortLabel:'거실 테이블',width:2,depth:1.5,height:.6,depthFill:1,introduced:13,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'made',preview:'assets/coffee-table-center-preview-v2.png',
  preferred:{direction:'left',x:2,y:4},clearance:'빈 상판의 낮은 거실 테이블이에요. 0.5칸씩 옮기고 다른 가구와 겹치지 않는 곳에 놓아 주세요.'},
 'side-table':{label:'원목 오픈 협탁',shortLabel:'협탁',width:1,depth:2/3,height:.9,depthFill:1,introduced:12,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'side-table',
  preferred:{direction:'left',x:0,y:4.5},clearance:'0.5칸씩 이동 · 다른 가구와 겹치지 않는 곳에 놓아 주세요.'},
 sofa:{label:'라벤더 패브릭 소파',shortLabel:'소파',width:3.5,depth:1.5,height:1.8,depthFill:1,introduced:11,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'sofa',
  preferred:{direction:'left',x:0,y:3},clearance:'쿠션과 담요는 소파와 함께 움직여요. 방향별 그림이 뒤집히는 위치로는 이동하지 않습니다.'},
 'blanket-floor':{label:'분홍 니트 담요 · 바닥용',shortLabel:'바닥 담요',width:2,depth:1.5,height:.05,depthFill:1,introduced:11,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'floor',picture:'accessory',
  preferred:{direction:'center',x:3.5,y:4.5},clearance:'바닥용 그림이에요. 0.5칸씩 따로 옮길 수 있고 가구 아래에 놓을 수 있어요.'},
 desk:{label:'원목 서랍 책상',shortLabel:'책상',width:3,depth:1,height:1.4,depthFill:1,introduced:9,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'desk',
  preferred:{direction:'right',x:9,y:3.5},clearance:'0.5칸씩 이동 · 연결한 의자는 책상 아래에 0.5칸 들어가 함께 움직여요. 다른 가구와는 겹칠 수 없어요.'},
 bookshelf:{
  label:'원목 책장',shortLabel:'책장',width:2,depth:1,height:3.8,depthFill:2/3,
  directions:['left','center','right'],anchor:'rear',layer:'standing',
  imageSize:{width:1024,height:1536},
  // Approved source corners share the room grid registration in bookshelf-art.js.
  views:{
   right:{image:'assets/bookshelf-right-v2.webp',planes:{
    front:plane([[333.08332421134673,209.5476059525281],[489.7502546251135,161.14094586782153],[489.7502546251135,1472],[333.08332421134673,1284.4558719231256]]),
    side:plane([[489.7502546251135,161.14094586782153],[690.9166757886528,161.14094586782153],[690.9166757886528,1472],[489.7502546251135,1472]]),
    back:plane([[489.7502546251135,161.14094586782153],[690.9166757886528,161.14094586782153],[690.9166757886528,1472],[489.7502546251135,1472]])
   }},
   left:{image:'assets/bookshelf-left-v2.webp',planes:{
    front:plane([[535.5169354294594,161.14094586782153],[689.6494857340799,209.5476059525281],[689.6494857340799,1284.4558719231256],[535.5169354294594,1472]]),
    side:plane([[334.3505142659202,161.14094586782153],[535.5169354294594,161.14094586782153],[535.5169354294594,1472],[334.3505142659202,1472]]),
    back:plane([[334.3505142659202,161.14094586782153],[535.5169354294594,161.14094586782153],[535.5169354294594,1472],[334.3505142659202,1472]])
   }},
   center:{image:'assets/bookshelf-center-v2.webp',planes:{
    front:plane([[179.7684855577263,170.6195167657106],[844.2315144422741,170.6195167657106],[844.2315144422741,1472],[179.7684855577263,1472]])
   }}
  },
  attachments:[{
   id:'top-box',widthFraction:.65,depthFraction:.75,height:.32,
   views:{
    right:{image:'assets/bookshelf-right-v2.webp',planes:{
     front:plane([[380.38276907745194,108.27706369657744],[483.91916570399144,64],[483.91916570399144,170.53297384196856],[380.38276907745194,201.92465597280125]]),
     side:plane([[483.91916570399144,64],[631.3149973925051,64],[631.3149973925051,170.53297384196856],[483.91916570399144,170.53297384196856]]),
     back:plane([[483.91916570399144,64],[631.3149973925051,64],[631.3149973925051,170.53297384196856],[483.91916570399144,170.53297384196856]])
    }},
    left:{image:'assets/bookshelf-left-v2.webp',planes:{
     front:plane([[540.8562951372751,64],[642.7491481967559,108.27706369657744],[642.7491481967559,201.92465597280125],[540.8562951372751,170.53297384196856]]),
     side:plane([[393.4604634487616,64],[540.8562951372751,64],[540.8562951372751,170.53297384196856],[393.4604634487616,170.53297384196856]]),
     back:plane([[393.4604634487616,64],[540.8562951372751,64],[540.8562951372751,170.53297384196856],[393.4604634487616,170.53297384196856]])
    }},
    center:{image:'assets/bookshelf-center-v2.webp',planes:{
     front:plane([[297.008506567789,64],[726.8812329027187,64],[726.8812329027187,172.72549287902984],[297.008506567789,172.72549287902984]])
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
