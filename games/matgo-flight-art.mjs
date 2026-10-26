// Decode each public face before motion, then move a painted bitmap rather than
// a newly mounted SVG <image> that may still be blank on a mobile compositor.
export function createFlightArt({cardSVG,backSVG,document:doc=document}){
  const faces=new Map();
  const parse=html=>{const box=doc.createElement('div');box.innerHTML=html;return box.firstElementChild;};
  function load(card){
    if(!card)return null;
    if(faces.has(card.id))return faces.get(card.id);
    const svg=parse(cardSVG(card)),source=svg.querySelector('image'),record={svg,image:null,ready:!source,promise:null};
    faces.set(card.id,record);
    if(!source){record.promise=Promise.resolve(true);return record;}
    const image=doc.createElement('img');record.image=image;
    image.decoding='sync';image.loading='eager';
    const loaded=new Promise(resolve=>{image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);});
    image.src=source.getAttribute('href')||source.getAttribute('xlink:href');
    record.promise=(async()=>{
      let timer;
      try{
        const decoded=image.decode?image.decode().then(()=>true):image.complete&&image.naturalWidth?Promise.resolve(true):loaded;
        const inTime=await Promise.race([decoded,new Promise(resolve=>{timer=doc.defaultView.setTimeout(()=>resolve(false),2500);})]);
        record.ready=inTime&&image.naturalWidth>0;
      }catch{record.ready=false;}finally{doc.defaultView.clearTimeout(timer);}
      if(!record.ready)faces.delete(card.id); // A later turn can retry a failed load.
      return record.ready;
    })();
    return record;
  }
  async function prepare(cards){return (await Promise.all(cards.filter(Boolean).map(card=>load(card).promise))).every(Boolean);}
  function face(card,back=false){
    if(back)return parse(backSVG);
    const record=load(card);if(!record?.ready)return null;
    if(!record.image)return record.svg.cloneNode(true);
    const canvas=doc.createElement('canvas'),image=record.image;
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.style.cssText='display:block;width:100%;height:100%;border-radius:inherit';
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',record.svg.getAttribute('aria-label')||'화투');
    const context=canvas.getContext('2d');
    context.fillStyle='#fff4d8';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
  }
  return {prepare,face};
}
