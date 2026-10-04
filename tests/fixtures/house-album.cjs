// In-memory transport fixture; the browser uses the real World album service.
module.exports=function makeAlbumFixture(){
 const owner='member-a',other='member-b',folders=[{id:'old-folder',user_id:owner,name:'추억',visibility:'friends',allowed:[],created_at:'2026-09-01'},{id:'note-folder',user_id:owner,name:'익명카드',visibility:'me',allowed:[],created_at:'2026-09-02'}];
 const media=[{id:'old-photo',user_id:owner,type:'image',path:owner+'/photo.jpg',thumb_path:owner+'/thumb.jpg',caption:'기존 사진',visibility:'friends',folder_id:'old-folder',created_at:'2026-09-10'},
 {id:'note-photo',user_id:owner,type:'image',path:owner+'/note.jpg',thumb_path:owner+'/note-thumb.jpg',caption:'오쭈다노트에 올린 사진',visibility:'me',folder_id:'note-folder',created_at:'2026-09-09'},
 {id:'old-video',user_id:owner,type:'video',path:owner+'/movie.mp4',thumb_path:owner+'/movie-thumb.jpg',caption:'기존 영상',visibility:'me',folder_id:null,created_at:'2026-09-08'},
 {id:'other-photo',user_id:other,type:'image',path:other+'/private.jpg',thumb_path:other+'/thumb.jpg',caption:'다른 계정 사진',visibility:'me',folder_id:null,created_at:'2026-09-11'}];
 const db={media,media_folders:folders,house_posts:[],house_media_trash:[],house_friend_groups:[]},files=new Map(),calls=[];let serial=0;
 const state={owner,db,files,calls,fail:null,pause:null};
 const client={async rpc(name,args){
  calls.push({rpc:name,args});if(state.pause)await state.pause;if(state.fail==='rpc')return {error:{message:'fixture rpc failed'}};
  if(name==='house_save_friend_group'){
   let row=db.house_friend_groups.find(row=>row.id===args.p_id);
   if(row&&row.user_id!==state.owner||!row&&!args.p_create||db.house_friend_groups.some(row=>row.user_id===state.owner&&row.name===args.p_name&&row.id!==args.p_id))return {error:{message:'unavailable'}};
   if(!row){row={id:args.p_id,user_id:state.owner,created_at:new Date().toISOString()};db.house_friend_groups.push(row);}Object.assign(row,{name:args.p_name,members:args.p_members});return {data:{...row}};
  }
  if(name==='house_delete_friend_group'){
   const row=db.house_friend_groups.find(row=>row.id===args.p_id&&row.user_id===state.owner);if(!row)return {error:{message:'unavailable'}};
   db.media_folders.filter(folder=>folder.user_id===state.owner).forEach(folder=>folder.allowed_groups=(folder.allowed_groups||[]).filter(id=>id!==row.id));db.house_friend_groups.splice(db.house_friend_groups.indexOf(row),1);return {data:{id:row.id}};
  }
  if(name==='house_delete_media_folder'){
   const folder=db.media_folders.find(row=>row.id===args.p_folder_id&&row.user_id===state.owner);if(!folder)return {error:{message:'unavailable'}};
   const rows=db.media.filter(row=>row.folder_id===folder.id&&row.user_id===state.owner);rows.forEach(row=>{row.folder_id=null;row.visibility='me';});db.house_posts.filter(row=>row.folder_id===folder.id&&row.user_id===state.owner).forEach(row=>{row.folder_id=null;row.visibility='me';});db.media_folders.splice(db.media_folders.indexOf(folder),1);return {data:{deleted_folder:folder.id,moved:rows.length}};
  }
  if(name==='house_move_media'){
   const ids=[...new Set(args.p_ids)],target=args.p_folder_id,rows=db.media.filter(row=>ids.includes(row.id)&&row.user_id===state.owner);
   if(rows.length!==ids.length||target&&!db.media_folders.some(row=>row.id===target&&row.user_id===state.owner))return {error:{message:'unavailable'}};
   rows.forEach(row=>{row.folder_id=target;if(!target)row.visibility='me';});return {data:{ids,folder_id:target,moved:rows.length}};
  }
  if(name==='house_save_post'){
   let row=db.house_posts.find(row=>row.id===args.p_id);
   if(row&&(row.user_id!==state.owner||row.deleted_at)||!row&&!args.p_create)return {error:{message:'unavailable'}};
   if(!row){row={id:args.p_id,user_id:state.owner,created_at:new Date().toISOString(),deleted_at:null};db.house_posts.push(row);}
   Object.assign(row,{body:args.p_body.trim(),visibility:args.p_visibility,folder_id:args.p_folder_id});return {data:{id:row.id}};
  }
  if(name==='house_manage_records'){
   const action=args.p_action,mids=[...new Set(args.p_media_ids)],pids=[...new Set(args.p_post_ids)],source=action==='restore'?db.house_media_trash:db.media;
   const mediaRows=source.filter(row=>mids.includes(row.id)&&row.user_id===state.owner),posts=db.house_posts.filter(row=>pids.includes(row.id)&&row.user_id===state.owner&&!!row.deleted_at===(action==='restore'));
   if(mediaRows.length!==mids.length||posts.length!==pids.length||action==='move'&&args.p_folder_id&&!db.media_folders.some(row=>row.id===args.p_folder_id&&row.user_id===state.owner))return {error:{message:'unavailable'}};
   if(action==='move')[...mediaRows,...posts].forEach(row=>{row.folder_id=args.p_folder_id;if(!row.folder_id)row.visibility='me';});
   if(action==='trash'){for(const row of mediaRows){db.house_media_trash.push({...row,deleted_at:new Date().toISOString()});db.media.splice(db.media.indexOf(row),1);}posts.forEach(row=>row.deleted_at=new Date().toISOString());}
   const restored=[];if(action==='restore'){for(const row of mediaRows){const back={...row,folder_id:null,visibility:'me'};delete back.deleted_at;db.media.push(back);restored.push(back);db.house_media_trash.splice(db.house_media_trash.indexOf(row),1);}posts.forEach(row=>{row.deleted_at=null;row.folder_id=null;row.visibility='me';});}
   return {data:{action,media_ids:mids,post_ids:pids,folder_id:args.p_folder_id,media:restored}};
  }
  return {error:{message:'unsupported'}};
 },from(table){const filters=[],sorts=[];let operation='read',values,single=false,range;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){return q.eq(k,v);},in(k,v){filters.push([k,v]);return q;},order(k,o){sorts.push([k,o]);return q;},range(a,b){range=[a,b];return q;},single(){single=true;return q;},maybeSingle(){single='maybe';return q;},insert(v){operation='insert';values=v;return q;},update(v){operation='update';values=v;return q;},then(resolve,reject){return Promise.resolve().then(async()=>{
   calls.push({table,operation,filters:filters.map(x=>[...x]),values});if(state.pause)await state.pause;
   if(state.fail===operation||state.fail===table||['house_records','house_trash_records'].includes(table)&&['media','house_posts'].includes(state.fail))return{error:{message:'fixture failure'}};
   const rowsOf=()=>{if(!['house_records','house_trash_records'].includes(table))return db[table];const trash=table==='house_trash_records';return [...(trash?db.house_media_trash.map(row=>({...row,created_at:row.deleted_at})):db.media),...db.house_posts.filter(row=>!!row.deleted_at===trash).map(row=>({...row,type:'text',caption:row.body,path:null,thumb_path:null,created_at:trash?row.deleted_at:row.created_at}))];};
   let rows=rowsOf().filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));
   if(operation==='insert'){const row={id:'new-'+(++serial),created_at:'2026-10-04',...values};db[table].push(row);rows=[row];}
   if(operation==='update')rows.forEach(row=>Object.assign(row,values));
   for(const [k,o]of [...sorts].reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));
   if(range)rows=rows.slice(range[0],range[1]+1);rows=rows.map(row=>({...row}));
   return single?(rows.length===1?{data:rows[0]}:single==='maybe'&&rows.length===0?{data:null}:{error:{message:'single row missing'}}):{data:rows};
  }).then(resolve,reject);}};return q;
 },storage:{from(){return{async createSignedUrls(paths){calls.push({signed:paths});return{data:paths.map(path=>({path,signedUrl:'/house-test/assets/entry-house-v1.webp?path='+encodeURIComponent(path)}))};},async upload(path,blob){calls.push({upload:path});if(state.fail==='upload'||state.fail==='thumb'&&path.includes('_thumb'))return{error:{message:'upload failed'}};files.set(path,blob);return{};},async remove(paths){calls.push({remove:paths});paths.forEach(path=>files.delete(path));return{};}};}}};
 return {...state,client,state};
};
