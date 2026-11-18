// Compatibility for an Agit tab that still has the former popup launcher.
let opening=false;
window.addEventListener('pageshow',()=>{opening=false;});
export function openPajang(){
  if(opening)return;
  opening=true;
  location.assign('/features/pajang/');
}
