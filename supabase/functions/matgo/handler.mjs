import { verifyRound } from './verify.mjs';
import { verifyRound as verifyV5Round } from './verify-v5.mjs';
import { verifyRound as verifyV4Round } from './verify-v4.mjs';
import { verifyRound as verifyLegacyRound } from './verify-v1.mjs';
import { verifyRound as verifyV2Round } from './verify-v2.mjs';
import { verifyRound as verifyV3Round } from './verify-v3.mjs';
import {advanceOnline,automaticOnline,replayOnline,onlineView} from './online.mjs';
const origins = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const publicErrors = new Set(['adult_required', 'member_identity_required', 'not_signed_in', 'banned', 'no_account', 'gold_not_empty', 'gold_empty', 'insufficient_zzu', 'paid_confirmation_required', 'round_mismatch','client_update_required','round_in_progress','invalid_stake','stake_offer_pending','stake_offer_changed','match_in_progress','room_not_found','room_unavailable','state_conflict','not_your_turn','invalid_move','invalid_choice','invalid_card','invalid_bomb','invalid_decision','invalid_play','invalid_shake','invalid_gukjin','invalid_chongtong']);
const onlineActions=new Set(['online_quick','online_create','online_join','online_read','online_move','online_leave','online_ready','online_fallback']);
const newSecret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export function createHandler({ env, fetchImpl = fetch }) {
  const url = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), anon = env('SUPABASE_ANON_KEY');
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !origins.has(origin)) return reply({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    if (!url || !service || !anon) return reply({ error: 'unavailable' }, 503);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply({ error: 'not_signed_in' }, 401);
    let body;
    try {
      const reader = request.body?.getReader(); if (!reader) throw Error();
      const chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 131072) { await reader.cancel(); throw Error(); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (!['status', 'start', 'refill', 'settle', 'stake'].includes(body.action)&&!onlineActions.has(body.action)) throw Error();
      if(onlineActions.has(body.action)){
        if(body.stakes_version!==undefined&&body.stakes_version!==1)throw Error();
        if(['online_read','online_move','online_leave','online_ready','online_fallback'].includes(body.action)&&!uuid.test(body.room_id))throw Error();
        if(body.action==='online_join'&&(typeof body.code!=='string'||! /^[a-f0-9]{8}$/i.test(body.code)))throw Error();
        if(body.action==='online_move'&&(!uuid.test(body.request_id)||!Number.isInteger(body.version)||body.version<0||!body.command||JSON.stringify(body.command).length>1024))throw Error();
        if(body.cursor!==undefined&&(!Number.isInteger(body.cursor)||body.cursor<0||body.cursor>10000))throw Error();
      }
      if (body.action === 'settle' && (!uuid.test(body.round_id) || !Array.isArray(body.actions) || ![1, 2, 3, 4, 5, 6, 7].includes(body.rules_version ?? 1))) throw Error();
      if (body.action === 'start' && body.stakes_version !== undefined && body.stakes_version !== 1) throw Error();
      if (body.action === 'stake' && (!Number.isInteger(body.rate) || ![200,500,2000,5000,10000,20000,50000,100000].includes(body.rate) || typeof body.accept !== 'boolean')) throw Error();
      if (body.action === 'refill' && (!uuid.test(body.request_id) || typeof body.paid !== 'boolean')) throw Error();
    } catch { return reply({ error: 'bad_request' }, 400); }
    const get = (path, options) => fetchImpl(url + path, { signal: AbortSignal.timeout(10000), ...options });
    try {
      const auth = await get('/auth/v1/user', { headers: { apikey: anon, authorization } });
      if (!auth.ok) return reply({ error: 'not_signed_in' }, 401);
      const user = await auth.json();
      if (!uuid.test(user.id) || user.is_anonymous) return reply({ error: 'not_signed_in' }, 401);
      if(onlineActions.has(body.action)){
        const onlineRpc=async(action,values={})=>{
          const response=await get('/rest/v1/rpc/'+(action==='fallback'?'matgo_online_fallback':'matgo_online_service'),{method:'POST',
            headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
            body:JSON.stringify(action==='fallback'?{p_actor:user.id,p_room:values.p_room}:{p_actor:user.id,p_action:action,...values})});
          const data=await response.json();
          if(!response.ok)throw Error(publicErrors.has(data.message)?data.message:'unavailable');
          return data;
        };
        const catchUp=async state=>{
          for(let i=0;i<6&&state.room.status==='active';i++){
            if((state.room.round_rate??100)>100&&body.stakes_version!==1&&body.action!=='online_leave')throw Error('client_update_required');
            const replay=await replayOnline(state.room),p=replay.prompt?.p;
            if(p===undefined||(!state.room.bots[p]&&Date.parse(state.room.deadline)>Date.now()))break;
            const next=await automaticOnline(state.room);
            next.auto={p,reason:state.room.bots[p]?'left':'timeout'};
            try{state=await onlineRpc('commit',{p_room:state.room.id,p_expected:state.room.version,p_request:crypto.randomUUID(),p_next:next});}
            catch(error){if(error.message!=='state_conflict'&&error.message!=='room_unavailable')throw error;state=await onlineRpc('read',{p_room:state.room.id});}
          }
          return state;
        };
        let state;
        if(body.action==='online_move'){
          state=await catchUp(await onlineRpc('read',{p_room:body.room_id}));
          if(!state.room.requests.includes(body.request_id)){
            if(state.room.version!==body.version)throw Error('state_conflict');
            if(state.room.bots[state.seat])throw Error('not_your_turn');
            const next=await advanceOnline(state.room,state.seat,body.command);
            state=await onlineRpc('commit',{p_room:body.room_id,p_expected:body.version,p_request:body.request_id,p_next:next});
          }
        }else{
          state=await onlineRpc(body.action.slice(7),{p_room:body.room_id??null,p_code:body.code??null,
            p_seed:['online_quick','online_create','online_join','online_ready'].includes(body.action)?newSecret():null,
            p_next:{stakes_version:body.stakes_version??0}});
        }
        state=await catchUp(state);
        return reply({ok:true,room:await onlineView(state.room,state.seat,body.cursor??0)});
      }
      const rpc = async (action, values = {}) => {
        const response = await get('/rest/v1/rpc/'+(action==='stake'?'matgo_stake_service':'matgo_wallet_service'), { method: 'POST',
          headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_actor: user.id, ...(action==='stake'?{}:{p_action:action}), ...values }) });
        const data = await response.json();
        if (!response.ok) throw Error(publicErrors.has(data.message) ? data.message : 'unavailable');
        return data;
      };
      if (body.action === 'settle') {
        const snapshot = await rpc('round', { p_round: body.round_id });
        if (snapshot.settled) return reply(snapshot);
        if ((snapshot.round.rate ?? 100)>100 && ![6,7].includes(body.rules_version)) return reply({error:'client_update_required'},409);
        let verified;
        try { verified = await (body.rules_version === 7 ? verifyRound : [5,6].includes(body.rules_version) ? verifyV5Round : body.rules_version === 4 ? verifyV4Round : body.rules_version === 3 ? verifyV3Round : body.rules_version === 2 ? verifyV2Round : verifyLegacyRound)(snapshot.round, body.actions); }
        catch {
          // Rules/scoring stay v5. Already-open browsers can finish the old CPU
          // policy; replay the entire transcript rather than trusting a result.
          if(body.rules_version!==5||snapshot.round.gold<=100000)return reply({ error: 'invalid_round' }, 409);
          try{verified=await verifyV5Round(snapshot.round,body.actions,{cpuMode:'normal'});}
          catch{return reply({ error: 'invalid_round' }, 409);}
        }
        return reply(await rpc('settle', { p_round: body.round_id, p_gold: verified.gold, p_first: verified.first, p_carry: verified.carry }));
      }
      if (body.action === 'refill') return reply(await rpc('refill', { p_request: body.request_id, p_paid: body.paid }));
      if(body.action==='stake')return reply(await rpc('stake',{p_rate:body.rate,p_accept:body.accept}));
      return reply(await rpc(body.action==='start'&&body.stakes_version===1?'start_stakes':body.action));
    } catch (error) {
      const code = publicErrors.has(error.message) ? error.message : 'unavailable';
      return reply({ error: code }, code === 'unavailable' ? 503 : 409);
    }
  };
}
