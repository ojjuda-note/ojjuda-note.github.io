// In-memory transport fixture; the browser uses the real World album service.
module.exports=function makeAlbumFixture(){
 const owner='member-a',other='member-b',folders=[{id:'old-folder',user_id:owner,name:'추억',visibility:'friends',allowed:[],created_at:'2026-09-01'},{id:'note-folder',user_id:owner,name:'익명카드',visibility:'me',allowed:[],created_at:'2026-09-02'}];
 const media=[{id:'old-photo',user_id:owner,type:'image',path:owner+'/photo.jpg',thumb_path:owner+'/thumb.jpg',caption:'기존 사진',visibility:'friends',folder_id:'old-folder',created_at:'2026-09-10'},
 {id:'note-photo',user_id:owner,type:'image',path:owner+'/note.jpg',thumb_path:owner+'/note-thumb.jpg',caption:'오쭈다노트에 올린 사진',visibility:'me',folder_id:'note-folder',created_at:'2026-09-09'},
 {id:'old-video',user_id:owner,type:'video',path:owner+'/movie.mp4',thumb_path:owner+'/movie-thumb.jpg',caption:'기존 영상',visibility:'me',folder_id:null,created_at:'2026-09-08'},
 {id:'other-photo',user_id:other,type:'image',path:other+'/private.jpg',thumb_path:other+'/thumb.jpg',caption:'다른 계정 사진',visibility:'me',folder_id:null,created_at:'2026-09-11'}];
 const db={media,media_folders:folders},files=new Map(),calls=[];let serial=0;
 const state={owner,db,files,calls,fail:null,pause:null};
 const client={from(table){const filters=[],sorts=[];let operation='read',values,single=false,range;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){return q.eq(k,v);},order(k,o){sorts.push([k,o]);return q;},range(a,b){range=[a,b];return q;},single(){single=true;return q;},maybeSingle(){single='maybe';return q;},insert(v){operation='insert';values=v;return q;},update(v){operation='update';values=v;return q;},then(resolve,reject){return Promise.resolve().then(async()=>{
   calls.push({table,operation,filters:filters.map(x=>[...x]),values});if(state.pause)await state.pause;
   if(state.fail===operation||state.fail===table)return{error:{message:'fixture failure'}};
   let rows=db[table].filter(row=>filters.every(([k,v])=>row[k]===v));
   if(operation==='insert'){const row={id:'new-'+(++serial),created_at:'2026-10-04',...values};db[table].push(row);rows=[row];}
   if(operation==='update')rows.forEach(row=>Object.assign(row,values));
   for(const [k,o]of [...sorts].reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));
   if(range)rows=rows.slice(range[0],range[1]+1);rows=rows.map(row=>({...row}));
   return single?(rows.length===1?{data:rows[0]}:single==='maybe'&&rows.length===0?{data:null}:{error:{message:'single row missing'}}):{data:rows};
  }).then(resolve,reject);}};return q;
 },storage:{from(){return{async createSignedUrls(paths){calls.push({signed:paths});return{data:paths.map(path=>({path,signedUrl:'/house-test/assets/entry-house-v1.webp?path='+encodeURIComponent(path)}))};},async upload(path,blob){calls.push({upload:path});if(state.fail==='upload'||state.fail==='thumb'&&path.includes('_thumb'))return{error:{message:'upload failed'}};files.set(path,blob);return{};},async remove(paths){calls.push({remove:paths});paths.forEach(path=>files.delete(path));return{};}};}}};
 return {...state,client,state};
};
