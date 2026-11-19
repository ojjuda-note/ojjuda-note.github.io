// Synthetic RPC data shared by the DOM and Chromium checks. No live requests.
function createQuestionFixture() {
  const prefix = '[파장 · 오늘의 질문 제안]\n';
  const id = value => '10000000-0000-4000-8000-' + String(value).padStart(12,'0');
  const clone = value => JSON.parse(JSON.stringify(value));
  const listeners = new Set();
  const fixture = {
    owner:'90000000-0000-4000-8000-000000000001',calls:[],fail:false,hold:false,release:null,
    items:Array.from({length:31},(_,index) => ({
      id:id(index+1),user_id:id(index+101),nickname:index===1?'회원':'질문제안회원 '+(index+1),
      body:prefix+(index===0?'오늘 함께 나누고 싶은 작은 기쁨은 무엇인가요?\n긴 질문도 끝까지 읽을 수 있어요. https://example.invalid/'+'a'.repeat(120):'함께 이야기하고 싶은 질문 '+(index+1)),
      status:index%2?'resolved':'open',reply:index%2?'좋은 질문을 제안해 주셔서 감사합니다.':'',
      created_at:new Date(Date.parse('2026-11-19T04:00:00Z')-index*60000).toISOString(),
      updated_at:'2026-11-19T04:00:00Z'
    })),
    auth(userId) {
      fixture.owner=userId;
      for(const listener of listeners)listener(userId?'SIGNED_IN':'SIGNED_OUT',userId?{user:{id:userId}}:null);
    }
  };
  async function request(schema,name,args={}) {
    fixture.calls.push({schema,name,args:clone(args)});
    if(schema!=='ojjuda_note'||name!=='admin_pajang_question_suggestions')throw Error('Unexpected synthetic RPC: '+schema+'.'+name);
    const rows=fixture.items.filter(item=>args.p_status==='all'||item.status===args.p_status);
    const result=fixture.fail?{data:null,error:{code:'42501'}}
      :{data:clone(rows.slice(args.p_offset,args.p_offset+args.p_limit)),error:null};
    if(fixture.hold)return new Promise(resolve=>{fixture.release=()=>{fixture.release=null;resolve(result);};});
    return result;
  }
  fixture.client={
    rpc:(name,args)=>request('public',name,args),
    schema:schema=>({rpc:(name,args)=>request(schema,name,args)}),
    auth:{
      onAuthStateChange(listener) {listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};},
      async getSession() {return {data:{session:fixture.owner?{user:{id:fixture.owner}}:null},error:null};}
    }
  };
  return fixture;
}

module.exports={createQuestionFixture};
