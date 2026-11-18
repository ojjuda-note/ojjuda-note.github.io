export async function readLocationCell() {
  if (!navigator.geolocation) throw Error('이 브라우저에서 위치를 사용할 수 없어요.');
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, error => {
      reject(Error(error.code === 1
        ? '브라우저의 사이트 권한에서 위치를 허용해 주세요.'
        : '현재 위치를 확인하지 못했어요. 위치 서비스를 켜고 다시 시도해 주세요.'));
    }, {enableHighAccuracy:false, timeout:13000, maximumAge:300000});
  });
  const {latitude, longitude, accuracy} = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) ||
      Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy>2000) {
    throw Error('위치 오차가 커요. 위치를 더 잘 잡을 수 있는 곳에서 다시 시도해 주세요.');
  }
  return {latCell:Math.round(latitude*100), lonCell:Math.round(longitude*100)};
}

export async function prepareLocation(state, db, accountId) {
  if (state.locationEnabled === false || state.locationChecked) return state;
  const entryFrame=window.frameElement;
  const caption = document.querySelector('#gate .flight-caption');
  if (caption) caption.textContent = '주변 인연을 찾기 위해 위치를 확인하고 있어요.';
  try {
    const cell = await readLocationCell();
    if(entryFrame&&!entryFrame.isConnected)return state;
    const {data:{session}} = await db.auth.getSession();
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
    return {...state, locationChecked:true, locationNotice:error.message};
  } finally {
    if (caption) caption.textContent = '파장을 열고 있어요.';
  }
}
