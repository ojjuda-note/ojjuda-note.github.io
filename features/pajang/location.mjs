const notices = {
  denied:'위치 권한이 막혀 있어요. 휴대폰 설정에서 브라우저의 위치 권한과 오쭈다 사이트의 위치 허용을 확인해 주세요.',
  unavailable:'위치 신호를 받지 못했어요. 휴대폰의 위치 기능과 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  timeout:'위치 확인 시간이 초과됐어요. 창가나 실외에서 다시 확인해 주세요.',
  inaccurate:'위치 오차가 커요. 정밀 위치를 허용하거나 창가·실외에서 다시 확인해 주세요.',
  unsupported:'이 화면에서는 위치를 사용할 수 없어요. Chrome이나 Safari에서 오쭈다를 직접 열어 주세요.'
};
function failure(code) { return Object.assign(Error(notices[code]),{code}); }
function locationError(error) {
  return failure(error?.code===1||error?.name==='SecurityError'?'denied':error?.code===3?'timeout':'unavailable');
}
function cellFrom(position) {
  const {latitude,longitude,accuracy}=position.coords||{};
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||
      Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||accuracy>2000)return null;
  return {latCell:Math.round(latitude*100),lonCell:Math.round(longitude*100)};
}
function locate(geo,{signal,precise,timeout,fresh}) {
  return new Promise((resolve,reject)=>{
    let done=false,watchId=null,timer;
    let lastError=failure('timeout');
    function finish(error,cell) {
      if(done)return;
      done=true;clearTimeout(timer);
      if(watchId!==null)geo.clearWatch(watchId);
      signal?.removeEventListener('abort',cancel);
      error?reject(error):resolve(cell);
    }
    function cancel(){finish(new DOMException('위치 확인을 취소했어요.','AbortError'));}
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    function success(position) {
      const cell=cellFrom(position);
      if(cell){finish(null,cell);return;}
      lastError=failure('inaccurate');
      if(!precise)finish(lastError);
    }
    function error(reason) {
      lastError=locationError(reason);
      if(!precise||lastError.code==='denied')finish(lastError);
    }
    const options={enableHighAccuracy:precise,timeout,maximumAge:precise||fresh?0:30000};
    try {
      if(precise) {
        // A first coarse fix can improve. Stop as soon as one usable fix arrives.
        timer=setTimeout(()=>finish(lastError),timeout);
        watchId=geo.watchPosition(success,error,options);
        if(done)geo.clearWatch(watchId);
      }else geo.getCurrentPosition(success,error,options);
    }catch(reason){finish(locationError(reason));}
  });
}

export async function readLocationCell({signal,onProgress,fresh=false,preciseTimeout=20000}={}) {
  if(!navigator.geolocation||globalThis.isSecureContext===false)throw failure('unsupported');
  onProgress?.('위치를 확인하고 있어요.');
  try {
    return await locate(navigator.geolocation,{signal,precise:false,timeout:4000,fresh});
  }catch(error){
    if(error.name==='AbortError'||error.code==='denied')throw error;
  }
  onProgress?.('더 정확한 위치를 확인하고 있어요.');
  return locate(navigator.geolocation,{signal,precise:true,timeout:preciseTimeout,fresh:true});
}

export async function prepareLocation(state, db, accountId) {
  if (state.locationEnabled === false || state.locationChecked) return state;
  const entryFrame=window.frameElement;
  const caption = document.querySelector('#gate .flight-caption');
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  window.addEventListener('pagehide',cancel,{once:true});
  try {
    const cell = await readLocationCell({signal:controller.signal,preciseTimeout:12000,
      onProgress:message=>{if(caption)caption.textContent=message;}});
    if(controller.signal.aborted||(entryFrame&&!entryFrame.isConnected))return state;
    const {data:{session}} = await db.auth.getSession();
    if(controller.signal.aborted||(entryFrame&&!entryFrame.isConnected))return state;
    if (session?.user?.id !== accountId || session.user.is_anonymous) throw Error('회원 정보를 다시 확인해 주세요.');
    if (!state.joined && !state.me) return {...state, locationChecked:true};
    const {data, error} = await db.rpc('pajang_member', {p_action:'radar-enable', p_data:{
      ...cell, accountId, consent:true, shareBearing:true, automatic:true,
      locationVersion:state.locationVersion
    }});
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
    controller.abort();
    if (caption) caption.textContent = '파장을 열고 있어요.';
  }
}
