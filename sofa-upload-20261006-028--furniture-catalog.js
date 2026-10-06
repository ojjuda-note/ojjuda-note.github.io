// Shared authoring contract: rear grid anchors, item-specific front clearance,
// three real view images, and a single approved color/material reference.
import {sofaAccessorySpec,sofaAccessoryFromSofa,isBlanket,blanketMode,blanketSpec} from './sofa-accessory-placement.js?v=20261006-assembly1';
export {isBlanket} from './sofa-accessory-placement.js?v=20261006-assembly1';
export const ART_STYLE={reference:'references/home-style.png',materials:['warm oak','cream ivory','muted lavender'],lighting:'soft cream daylight; retain natural grain and gentle shadows'};
const plane=source=>({source,clip:source});
export const SOFA_ACCESSORIES=[
 {id:'cream-floral-cushion',label:'크림 꽃무늬 쿠션'},
 {id:'sage-cushion',label:'세이지 쿠션'},
 {id:'peach-cushion',label:'피치 쿠션'},
 {id:'pink-check-cushion',label:'분홍 체크 쿠션'},
 {id:'blanket-sofa',label:'분홍 담요 · 소파용'}
];
// These use the already approved cushion and draped-blanket drawings. Their
// reserved area is independent of the former parent sofa, including on reload.
const separateSofaAccessories=Object.fromEntries(SOFA_ACCESSORIES.filter(({id})=>!isBlanket(id)).map(({id,label})=>{
 const spec=sofaAccessorySpec(id),pose=sofaAccessoryFromSofa(id,{direction:'center',x:3,y:3});
 return [id,{label,shortLabel:label.replace(' · 소파용',''),width:spec.width,depth:spec.depth,height:spec.height,depthFill:1,introduced:16,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',allowOverlap:true,picture:'sofa-accessory',accessoryId:id,
  preview:`assets/${id}-center-v1.png`,preferred:{...pose,elevation:0},
  clearance:'소파 가까이 옮기면 자리에 맞춰지고, 멀리 옮기면 바닥에 놓여요.'}];
}));
const unifiedBlanket={label:'분홍 니트 담요',shortLabel:'분홍 담요',width:2,depth:1.5,height:1.015,depthFill:1,introduced:11,autoPlace:false,
 directions:['left','center','right'],anchor:'rear',layer:'floor',allowOverlap:true,picture:'blanket',accessoryId:'blanket-sofa',
 preview:'assets/blanket-sofa-center-v1.png',preferred:{direction:'center',x:3.5,y:4.5,mode:'floor',elevation:0},
 clearance:'소파에 가져가면 걸치는 담요로, 바닥에 놓으면 펼친 담요로 바뀌어요.'};
export const FURNITURE={
 ...separateSofaAccessories,
 'open-book':{label:'크림 펼친 책',shortLabel:'펼친 책',width:1.25,depth:.8,height:.12,depthFill:1,introduced:26,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/open-book-center-preview-v1.png',
  preferred:{direction:'left',x:.1,y:3.55,elevation:1.4},preferredViews:{left:{direction:'left',x:.1,y:3.55,elevation:1.4},center:{direction:'center',x:4.74,y:.1,elevation:1.4},right:{direction:'right',x:9.1,y:4.25,elevation:1.4}},
  clearance:'책상 앞에 앉아 읽는 방향으로 놓는 책이에요. 가구와 맞지 않으면 바닥에 놓을 수 있어요.'},
 'pencil-cup':{label:'크림 연필꽂이',shortLabel:'연필꽂이',width:.5,depth:.5,height:.65,depthFill:1,introduced:25,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/pencil-cup-center-preview-v1.png',
  preferred:{direction:'left',x:.2,y:3.4,elevation:1.4},preferredViews:{left:{direction:'left',x:.2,y:3.4,elevation:1.4},center:{direction:'center',x:5.8,y:.2,elevation:1.4},right:{direction:'right',x:9.2,y:5.1,elevation:1.4}},
  clearance:'책상 위에 놓는 연필꽂이예요. 가구와 맞지 않으면 바닥에 놓을 수 있어요.'},
 'table-succulent':{label:'원목 사각 다육이',shortLabel:'작은 다육이',width:.7,depth:.7,height:.25,depthFill:1,introduced:24,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/table-succulent-center-preview-v1.png',
  preferred:{direction:'left',x:3.15,y:4.05,elevation:.6},preferredViews:{left:{direction:'left',x:3.15,y:4.05,elevation:.6},center:{direction:'center',x:4.25,y:4.75,elevation:.6},right:{direction:'right',x:6.05,y:4.05,elevation:.6}},
  clearance:'테이블 위에 놓는 작은 다육이예요. 높이를 조절할 수 있고, 테이블을 옮기면 화분도 따로 옮겨 주세요.'},
 'table-books':{label:'크림·세이지 책 두 권',shortLabel:'책 두 권',width:1.1,depth:1.1,height:.1,depthFill:1,introduced:23,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/table-books-center-preview-v1.png',
  preferred:{direction:'left',x:2.7,y:4.8,elevation:.6},preferredViews:{left:{direction:'left',x:2.7,y:4.8,elevation:.6},center:{direction:'center',x:3.25,y:4.4,elevation:.6},right:{direction:'right',x:5.7,y:4.8,elevation:.6}},
  clearance:'두 권이 함께 움직이는 책 소품이에요. 높이를 조절할 수 있고, 테이블을 옮기면 책도 따로 옮겨 주세요.'},
 'clover-mug':{label:'크림 클로버 머그컵',shortLabel:'클로버 머그컵',width:.5,depth:.5,height:.4,depthFill:1,introduced:22,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/clover-mug-center-preview-v1.png',
  preferred:{direction:'left',x:2.9,y:4.6,elevation:.6},preferredViews:{left:{direction:'left',x:2.9,y:4.6,elevation:.6},center:{direction:'center',x:3.7,y:4.5,elevation:.6},right:{direction:'right',x:5.9,y:4.6,elevation:.6}},
  clearance:'테이블 위에 놓는 작은 머그컵이에요. 높이를 조절할 수 있고, 테이블을 옮기면 컵도 따로 옮겨 주세요.'},
 'table-plant':{label:'크림 협탁 화분',shortLabel:'협탁 화분',width:.6,depth:.6,height:1.45,depthFill:1,introduced:21,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/table-plant-center-preview-v1.png',
  preferred:{direction:'left',x:.03,y:5.7,elevation:.9},preferredViews:{left:{direction:'left',x:.03,y:5.7,elevation:.9},center:{direction:'center',x:4.7,y:4.53,elevation:.9},right:{direction:'right',x:9.363333,y:5.7,elevation:.9}},
  clearance:'협탁 위에 놓는 작은 화분이에요. 높이를 조절할 수 있고, 협탁을 옮기면 화분도 따로 옮겨 주세요.'},
 'botanical-frame':{label:'원목 잎사귀 액자',shortLabel:'원목 액자',width:1.2,depth:.1,height:1.9,depthFill:1,introduced:20,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',wallMounted:true,picture:'made',preview:'assets/botanical-frame-center-preview-v1.png',
  preferred:{direction:'left',x:0,y:3,elevation:2.1},preferredViews:{left:{direction:'left',x:0,y:3,elevation:2.1},center:{direction:'center',x:0,y:0,elevation:2.1},right:{direction:'right',x:9.9,y:3.5,elevation:2.1}},
  clearance:'벽을 선택하고 위치와 높이를 조절해요. 창문과 높은 가구를 피해 걸어 주세요.'},
 'window-plant':{label:'크림 화분과 원목 받침',shortLabel:'창가 화분',width:2,depth:2,height:2.8,depthFill:1,introduced:19,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'made',preview:'assets/window-plant-center-preview-v1.png',
  preferred:{direction:'right',x:8,y:.5},preferredViews:{left:{direction:'left',x:0,y:.5},center:{direction:'center',x:4,y:0},right:{direction:'right',x:8,y:.5}},
  clearance:'화분과 원목 받침을 함께 놓아요. 잎이 펼쳐질 공간을 두고 다른 가구와 겹치지 않게 놓아 주세요.'},
 'desk-lamp':{label:'크림 원목 탁상 조명',shortLabel:'탁상 조명',width:.9,depth:.9,height:1,depthFill:1,introduced:18,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'surface',picture:'made',preview:'assets/desk-lamp-center-preview-v1.png',
  preferred:{direction:'right',x:9,y:3.5,elevation:1.4},preferredViews:{left:{direction:'left',x:0,y:4,elevation:1.4},center:{direction:'center',x:4,y:0,elevation:1.4},right:{direction:'right',x:9,y:3.5,elevation:1.4}},
  clearance:'책상 위에 놓는 작은 조명이에요. 높이를 조절할 수 있고, 책상을 옮기면 조명도 따로 옮겨 주세요.'},
 'floor-lamp':{label:'크림 원목 스탠드 조명',shortLabel:'스탠드 조명',width:1.5,depth:1.5,height:2.8,depthFill:1,introduced:17,autoPlace:false,
  directions:['left','center','right'],anchor:'rear',layer:'standing',picture:'made',preview:'assets/floor-lamp-center-preview-v1.png',
  preferred:{direction:'left',x:0,y:1.5},preferredViews:{left:{direction:'left',x:0,y:1.5},center:{direction:'center',x:4,y:2.5},right:{direction:'right',x:7.5,y:1.5}},
  clearance:'갓 둘레의 여유를 포함한 배치 공간이에요. 다른 가구와 겹치지 않는 곳에 놓아 주세요.'},
 // One selectable product; the former sofa slot remains only to preserve a
 // second blanket already present in an older saved room.
 'blanket-floor':{...unifiedBlanket},
 'blanket-sofa':{...unifiedBlanket,hiddenFromMenu:true,legacyInstance:true},
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
  preferred:{direction:'left',x:0,y:3},clearance:'쿠션과 담요는 소품 메뉴에서 따로 놓고 옮길 수 있어요. 방향별 그림이 뒤집히는 위치로는 이동하지 않습니다.'},
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
export function itemSize(id,direction,placement){
 const item=FURNITURE[id];if(!item||!item.directions.includes(direction))return null;
 const spec=isBlanket(id)?blanketSpec(blanketMode(id,placement)):item;
 return direction==='center'?{w:spec.width,d:spec.depth}:{w:spec.depth,d:spec.width};
}
export function itemLayer(id,placement){return isBlanket(id)?blanketMode(id,placement)==='sofa'?'surface':'floor':FURNITURE[id]?.layer;}
export function itemHeight(id,placement){if(FURNITURE[id]?.picture==='sofa-accessory'&&(placement?.elevation??0)===0)return .14;return isBlanket(id)?blanketSpec(blanketMode(id,placement)).height:FURNITURE[id]?.height;}
export function contactBounds(id,s){
 const item=FURNITURE[id],size=itemSize(id,s.direction,s);if(!item||!size)return null;
 // Keep the entire rear edge on the reservation's grid corners. Only the
 // forward depth changes: no sideways inset and no reduction in height.
 if(s.direction==='center')return {x:s.x,y:s.y,w:size.w,d:size.d*item.depthFill};
 const w=size.w*item.depthFill;
 return {x:s.x+(s.direction==='right'?size.w-w:0),y:s.y,w,d:size.d};
}
