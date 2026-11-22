/* Admin review for teen-only Pajang. Every RPC independently verifies admin privileges. */
(()=>{
  'use strict';
  const root=document.getElementById('teen-admin-root');
  const status=document.getElementById('teen-admin-status');
  const config=window.OJJUDA_CONFIG;
  const id=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const item=(tag,text,cls)=>{
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=String(text);
    if(cls)el.className=cls;
    return el;
  };
  const section=(title,description)=>{
    const el=item('section');
    el.append(item('h2',title),item('p',description,'muted'));
    return el;
  };
  if(!config?.supabaseUrl||!config?.supabaseKey||!window.supabase?.createClient){
    status.textContent='로그인 설정을 확인할 수 없어요.';return;
  }
  const client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
  let account=null,busy=false,generation=0;
  const say=text=>{status.textContent=text;};
  async function request(name,args){
    const {data,error}=await client.rpc(name,args);
    if(error)throw Error(error.message||'처리 실패');
    return data;
  }
  async function update(kind,action,target){
    if(busy||!id(target))return;
    busy=true;const before=++generation;
    say('처리 중이에요.');
    try{
      const params=kind==='answer'
        ?{p_action:action,p_answer:target}
        :kind==='answer_report'
          ?{p_action:'resolve',p_report:target}
          :{p_action:action,p_target:target};
      const rpc=kind==='comment'||kind==='comment_report'
        ?'admin_pajang_teen_comments':'admin_pajang_teen_moderation';
      const result=await request(rpc,params);
      if(!result||!((result.updated===true)||(result.resolved===true)))throw Error('서버 변경 결과를 확인하지 못했어요.');
      if(before!==generation)return;
      await reload();
    }catch(error){say(error instanceof Error?error.message:'요청에 실패했어요.');}
    finally{busy=false;}
  }
  const button=(label,kind,action,target,cls)=>{
    const node=item('button',label,cls);
    node.type='button';
    node.addEventListener('click',()=>void update(kind,action,target));
    return node;
  };
  const card=(title,body,options,actions)=>{
    const node=item('article');
    node.append(item('strong',title),item('p',body));
    if(options)node.append(item('small',options));
    const controls=item('div');
    for(const action of actions)controls.append(button(...action));
    node.append(controls);
    return node;
  };
  async function reload(){
    if(!account)return;
    const current=++generation;
    say('검토할 답변을 불러오는 중이에요.');
    const [answers,comments]=await Promise.all([
      request('admin_pajang_teen_moderation',{p_action:'queue'}),
      request('admin_pajang_teen_comments',{p_action:'queue'})
    ]);
    if(current!==generation)return;
    if(!Array.isArray(answers?.drafts)||!Array.isArray(answers?.reports)
      ||!Array.isArray(comments?.comments)||!Array.isArray(comments?.reports))
      throw Error('조회 결과를 확인하지 못했어요.');
    const answerSection=section('답변 검토','승인하면 14~18세 회원에게만 공개됩니다.');
    const answerItems=answers.drafts.filter(x=>x?.status==='pending'&&id(x.id)&&typeof x.body==='string');
    for(const a of answerItems)
      answerSection.append(card('질문 '+String(a.questionId||''),a.body,'검토 대기',[
        ['승인','answer','approve',a.id,'primary'],['숨김','answer','hide',a.id,'danger']
      ]));
    if(!answerItems.length)answerSection.append(item('p','검토할 답변이 없어요.','muted'));
    const commentSection=section('댓글 검토','승인된 댓글만 청소년 회원에게 보여요.');
    for(const c of comments.comments.filter(x=>id(x?.id)&&typeof x.body==='string'))
      commentSection.append(card('댓글',c.body,'검토 대기',[
        ['승인','comment','approve',c.id,'primary'],['숨김','comment','hide',c.id,'danger']
      ]));
    if(!comments.comments.length)commentSection.append(item('p','검토할 댓글이 없어요.','muted'));
    const reportSection=section('신고 접수','신고 내용을 확인하고 필요하면 원문을 숨겨 주세요.');
    for(const r of answers.reports.filter(x=>id(x?.id)))
      reportSection.append(card('답변 신고',String(r.reason||''),'접수된 신고',[
        ['처리 완료','answer_report','resolve',r.id,'primary']
      ]));
    for(const r of comments.reports.filter(x=>id(x?.id)))
      reportSection.append(card('댓글 신고',String(r.reason||''),'접수된 신고',[
        ['처리 완료','comment_report','resolve-report',r.id,'primary']
      ]));
    if(!answers.reports.length&&!comments.reports.length)reportSection.append(item('p','새 신고가 없어요.','muted'));
    const actions=item('div');actions.id='teen-admin-actions';
    const refresh=item('button','새로고침');
    refresh.type='button';refresh.addEventListener('click',()=>void reload().catch(e=>say(e.message)));
    actions.append(refresh);
    for(const older of root.querySelectorAll('section,#teen-admin-actions'))older.remove();
    root.append(actions,answerSection,commentSection,reportSection);
    say('답변 '+answerItems.length+'건, 댓글 '+comments.comments.length+'건, 신고 '+(answers.reports.length+comments.reports.length)+'건');
  }
  async function start(){
    try{
      const {data,error}=await client.auth.getUser();
      if(error||!data?.user)throw Error('로그인이 필요해요.');
      const check=await client.from('app_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
      if(check.error||!check.data)throw Error('관리자 계정만 이용할 수 있어요.');
      account=data.user.id;
      await reload();
    }catch(error){say(error instanceof Error?error.message:'권한을 확인하지 못했어요.');}
  }
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'||(account&&session?.user?.id!==account)){
      account=null;generation++;
      for(const el of root.querySelectorAll('section,#teen-admin-actions'))el.remove();
      say('계정이 변경되었어요. 관리자 계정으로 다시 로그인해 주세요.');
    }
  });
  void start();
})();
