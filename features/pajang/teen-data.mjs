// Account-bound erasure, available even when the teen community release flag is disabled.
const status=document.getElementById('teen-data-status');
const erase=document.getElementById('teen-data-erase');
let initialAccount=null,busy=false;
function note(message){status.textContent=message;}
async function begin(){
  try{
    const db=await window.OjjudaGetClient();
    const {data,error}=await db.auth.getUser();
    if(error||!data?.user||data.user.is_anonymous){note('로그인한 회원만 이용할 수 있어요.');return;}
    initialAccount=data.user.id;
    erase.disabled=false;
    note('이 계정에 연결된 이전 청소년 글을 정리할 수 있어요.');
    db.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||(initialAccount&&session?.user?.id!==initialAccount)){
        initialAccount=null;erase.disabled=true;note('계정이 변경됐어요. 새로 로그인해 주세요.');
      }
    });
    erase.addEventListener('click',async()=>{
      if(busy||!initialAccount)return;
      if(!window.confirm('이전에 작성한 청소년 답변·댓글을 삭제할까요? 삭제된 내용은 복구할 수 없습니다.'))return;
      busy=true;erase.disabled=true;note('삭제를 확인하고 있어요.');
      try{
        const check=await db.auth.getUser();
        if(check.error||check.data?.user?.id!==initialAccount)throw Error('계정이 변경됐어요. 다시 로그인해 주세요.');
        const {data:result,error:requestError}=await db.rpc('pajang_teen_erase_own');
        if(requestError)throw Error(requestError.message);
        if(result?.reviewHold===true){
          note('신고·검토 자료가 있어 작성물은 숨겼습니다. 완전 삭제는 설정의 문의·의견으로 요청해 주세요.');
          return;
        }
        if(result?.deleted!==true)throw Error('삭제 결과를 확인하지 못했어요.');
        note('내 청소년 답변 '+Number(result.deletedAnswers||0)+'개와 댓글 '+Number(result.deletedComments||0)+'개를 정리했습니다.');
      }catch(error){
        note(error instanceof Error?error.message:'삭제하지 못했어요. 다시 시도해 주세요.');
      }finally{busy=false;if(initialAccount)erase.disabled=false;}
    });
  }catch{note('회원 정보를 확인하지 못했어요. 잠시 후 다시 열어 주세요.');}
}
void begin();
