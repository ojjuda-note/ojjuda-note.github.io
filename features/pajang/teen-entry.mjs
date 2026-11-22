// Guarded teen entry. The React bundle must never load until the server release gate approves.
const gate=document.getElementById('teen-gate');
const message=document.getElementById('teen-gate-message');
const root=document.getElementById('teen-app');
let generation=0;
function show(text){root.hidden=true;root.replaceChildren();gate.hidden=false;message.textContent=text;}
function signedIn(session){return !!session?.user?.id && !session.user.is_anonymous;}
async function openTeen(){
  const run=++generation;
  try{
    const db=await window.OjjudaGetClient();
    const {data:sessionData,error:sessionError}=await db.auth.getSession();
    const session=sessionData?.session;
    if(sessionError||!signedIn(session)){show('오쭈다 회원 로그인 후 이용할 수 있어요.');return;}
    const expected=session.user.id;
    let subscription;
    const authListener=db.auth.onAuthStateChange((event,current)=>{
      if(event==='INITIAL_SESSION')return;
      if(!signedIn(current)||current.user.id!==expected){
        generation++;subscription?.unsubscribe();
        location.replace('./teen.html');
      }
    });
    subscription=authListener.data?.subscription;
    window.addEventListener('pagehide',()=>subscription?.unsubscribe(),{once:true});
    const [identity,entry]=await Promise.all([db.auth.getUser(),db.rpc('pajang_teen_entry')]);
    if(run!==generation)return;
    if(identity.error||identity.data?.user?.id!==expected||identity.data.user.is_anonymous) {
      show('회원 정보를 확인하지 못했어요. 다시 로그인해 주세요.');return;
    }
    if(entry.error){show('이용 권한을 확인할 수 없어요. 잠시 후 다시 열어 주세요.');return;}
    if(entry.data?.ready!==true){
      show(entry.data?.audience==='teen'
        ?'청소년 파장은 운영 및 안전 검토 후 이용할 수 있어요.'
        :'이 화면은 만 14~18세 회원을 위한 공간입니다.');
      return;
    }
    // Loading the public app bundle cannot bypass the verified backend age and release gate.
    await import('./assets/teen.js?v=20261122-teen-gate1');
    if(run!==generation)return;
    gate.hidden=true;root.hidden=false;
  }catch{
    if(run===generation)show('화면을 열지 못했어요. 잠시 후 다시 열어 주세요.');
  }
}
void openTeen();
