import '../../shared/location/location.js?v=20261119-auto-theme1';

export async function readLocationCell(options={}) {
  const {latitude,longitude}=await globalThis.OjjudaLocation.readPosition({...options,coarseCache:true});
  return {latCell:Math.round(latitude*100),lonCell:Math.round(longitude*100)};
}

export async function prepareLocation(state, db, accountId, {signal,onProgress}={}) {
  if(signal?.aborted)return state;
  globalThis.OjjudaLocation.acceptPreference(accountId,{enabled:state.locationEnabled!==false,version:state.locationVersion??0},true);
  if (state.locationEnabled === false || state.locationChecked) return state;
  const entryFrame=window.frameElement;
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  window.addEventListener('pagehide',cancel,{once:true});
  try {
    const cell = await readLocationCell({db,accountId,signal:controller.signal,preciseTimeout:12000,
      onProgress});
    if(controller.signal.aborted||(entryFrame&&!entryFrame.isConnected))return state;
    const {data:{session}} = await db.auth.getSession();
    if(controller.signal.aborted||(entryFrame&&!entryFrame.isConnected))return state;
    if (session?.user?.id !== accountId || session.user.is_anonymous) throw Error('회원 정보를 다시 확인해 주세요.');
    if (!state.joined && !state.me) return {...state, locationChecked:true};
    const {data, error} = await db.rpc('pajang_member', {p_action:'radar-enable', p_data:{
      ...cell, accountId, consent:true, shareBearing:true, automatic:true,
      locationVersion:state.locationVersion
    }});
    if(controller.signal.aborted)return state;
    if (error) throw Error('위치 설정을 확인하지 못했어요. 레이더에서 다시 시도해 주세요.');
    return {
      ...(state.me ? data : {...state, locationEnabled:data.locationEnabled, locationVersion:data.locationVersion}),
      locationChecked:true
    };
  } catch (error) {
    if(error.name==='AbortError')return state;
    return {...state, locationChecked:true, locationNotice:error.message};
  } finally {
    window.removeEventListener('pagehide',cancel);
    signal?.removeEventListener('abort',cancel);
    controller.abort();
  }
}
