// Bundled examples keep image files separate. User exports remain self-contained.
const directions=['left','center','right'];
const readData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('예제 그림을 읽지 못했어요.'));reader.readAsDataURL(blob);});
export async function loadBundledExample(url){
 const base=new URL(url,location.href),directory=new URL('./side-table/',base);
 if(base.origin!==location.origin)throw new Error('예제 주소를 확인해 주세요.');
 const response=await fetch(base);if(!response.ok)throw new Error('협탁 작업 파일을 불러오지 못했어요.');
 const project=await response.json();
 await Promise.all(directions.map(async direction=>{
  const source=project.views?.[direction]?.source;
  if(!source)throw new Error('예제의 방향별 그림이 없어요.');
  if(source.data)return;
  if(typeof source.url!=='string')throw new Error('예제 그림 주소가 없어요.');
  const imageURL=new URL(source.url,base);
  if(imageURL.origin!==base.origin||!imageURL.pathname.startsWith(directory.pathname)||!imageURL.pathname.endsWith('.webp'))throw new Error('예제 그림 주소를 확인해 주세요.');
  const imageResponse=await fetch(imageURL);if(!imageResponse.ok)throw new Error('예제 그림을 불러오지 못했어요.');
  const blob=await imageResponse.blob();if(blob.size>25000000)throw new Error('예제 그림 파일이 너무 커요.');
  const {url:unused,...metadata}=source;
  project.views[direction].source={...metadata,data:await readData(new Blob([blob],{type:'image/webp'}))};
 }));
 return project;
}
