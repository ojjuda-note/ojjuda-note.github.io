// unchanged production source at line 1
  dialog.querySelector('.ge-primary').addEventListener('click',()=>{
   if(frame)return;
   frame=document.createElement('iframe');frame.title='사천성 게임판';frame.allow='web-share';
   frame.src='/games/sacheonseong/index.html?v=20261112-arcade-entry-return2';
   frame.addEventListener('load',initialize);
   dialog.querySelector('.sacheonseong-entry-wrap').remove();dialog.append(frame);
   dialog.classList.add('sacheonseong-playing');frame.focus();
// unchanged production source at line 72
