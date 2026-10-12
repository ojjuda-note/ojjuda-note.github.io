const assert=require('node:assert/strict');
const {fixture,ids}=require('./ojjuda-tour-online-fixture.cjs'),{installInvites}=require('./ojjuda-tour-friend-fixture.cjs');
(async()=>{const f=await fixture();try{
 const invite=await installInvites(f.db),[A,B,C,D]=ids;
 await f.db.query('insert into public.friendships values($1,$2),($1,$3),($2,$3)',[A,B,C]);
 const room=(await f.create(A,3)).room;
 const send=(actor,to,code=room.code,kind='marble')=>invite(actor,{p_action:'send',p_to:to,p_kind:kind,p_code:code});
 const answer=(actor,id,action='accept')=>invite(actor,{p_action:action,p_id:id});
 await assert.rejects(()=>send(null,B),/not_allowed/);
 await assert.rejects(()=>send(A,D),/friend_required/);
 await assert.rejects(()=>send(B,C),/room_unavailable/);
 await assert.rejects(()=>send(A,B,'1234'),/invalid_room/);
 // The existing public helper stays caller-scoped even inside a definer RPC.
 await assert.rejects(()=>f.db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[A]);await tx.query('select public.is_banned($1)',[B]);}),/helper_scope_denied/);
 await f.db.query('insert into public.bans values($1)',[B]);await assert.rejects(()=>send(A,B),/friend_required/);await f.db.query('delete from public.bans where id=$1',[B]);
 const sent=await send(A,B);assert.equal((await send(A,B)).id,sent.id);
 const listed=await invite(B,{p_action:'list'});assert.equal(listed.invites[0].kind,'marble');
 assert.equal(Number((await f.db.query('select extract(epoch from (expires_at-created_at)) seconds from public.arcade_friend_invites where id=$1',[sent.id])).rows[0].seconds),60);
 await assert.rejects(()=>answer(C,sent.id),/invite_unavailable/);
 await f.db.query('insert into public.bans values($1)',[A]);await assert.rejects(()=>answer(B,sent.id),/invite_expired/);await f.db.query('delete from public.bans where id=$1',[A]);
 await f.db.query('insert into public.blocks values($1,$2)',[A,B]);await assert.rejects(()=>answer(B,sent.id),/invite_expired/);await f.db.exec('delete from public.blocks');
 const accepted=await answer(B,sent.id);assert.equal(accepted.code,room.code);assert.equal(accepted.kind,'marble');
 assert.equal((await answer(B,sent.id)).code,room.code);
 assert.equal((await f.join(B,{code:accepted.code})).ok,true);
 await assert.rejects(()=>send(A,B),/room_unavailable/);
 const forC=await send(A,C);await f.join(D,room);await assert.rejects(()=>answer(C,forC.id),/room_full/);await assert.rejects(()=>send(A,C),/room_full/);
 await f.call(D,{action:'leave',room_id:room.id});await answer(C,forC.id,'decline');
 assert.equal((await invite(A,{p_action:'list'})).responses[0].kind,'marble');await answer(A,forC.id,'ack');
 const expired=await send(A,C);await f.db.query("update public.arcade_friend_invites set expires_at=now()-interval '1 second' where id=$1",[expired.id]);await assert.rejects(()=>answer(C,expired.id),/invite_expired/);
 const beforeStart=await send(A,C);const latest=(await f.call(A,{action:'read',room_id:room.id})).room;await f.start(A,latest);
 await assert.rejects(()=>answer(C,beforeStart.id),/room_unavailable/);await assert.rejects(()=>send(A,C),/room_unavailable/);
 // Existing games still send/accept with the real scoped helper in place.
 await f.db.query("insert into ojjuda_matgo_internal.rooms values($1,'ABCD1234','waiting')",[A]);
 for(const [kind,code] of [['ttang','abcdefabcdefabcdefabcdef'],['matgo','ABCD1234']]){const old=await send(A,B,code,kind);assert.equal((await answer(B,old.id)).kind,kind);}
 assert.equal((await f.db.query("select has_schema_privilege('authenticated','ojjuda_marble_internal','usage') as allowed")).rows[0].allowed,false);
 console.log('PASS: Marble host-only friend invitations, 60-second expiry, auto-join code, capacity/start checks, bans/blocks, scoped helpers unchanged, retries, decline and existing game compatibility');
}finally{await f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
