/* Everyday tools: calendar, weather, news, cloud ledger and calculator. */
(function(){
 'use strict';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 const link=(text,url)=>{const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const cities=[['서울',37.57,126.98],['부산',35.18,129.08],['대구',35.87,128.60],['인천',37.46,126.71],['광주',35.16,126.85],['대전',36.35,127.38],['울산',35.54,129.31],['세종',36.48,127.29],['수원',37.26,127.03],['춘천',37.88,127.73],['강릉',37.75,128.90],['청주',36.64,127.49],['천안',36.82,127.15],['전주',35.82,127.15],['목포',34.81,126.39],['포항',36.02,129.34],['창원',35.23,128.68],['제주',33.50,126.53]];
 const weatherText=symbol=>{const code=String(symbol||'');return code.includes('thunder')?'⛈️ 뇌우':code.includes('snow')?'🌨️ 눈':code.includes('sleet')?'🌨️ 진눈깨비':code.includes('rain')?'🌧️ 비':code.includes('fog')?'🌫️ 안개':code.startsWith('clearsky')?'☀️ 맑음':code.startsWith('fair')||code.startsWith('partlycloudy')?'🌤️ 구름 조금':code.startsWith('cloudy')?'☁️ 흐림':'날씨 정보';};
 const normalizeWeather=payload=>{
  const series=payload?.properties?.timeseries;if(!Array.isArray(series)||!series.length)throw Error('weather');
  const now=Date.now(),nearest=series.reduce((a,b)=>Math.abs(Date.parse(b.time)-now)<Math.abs(Date.parse(a.time)-now)?b:a,series[0]);
  const read=row=>({time:row.time,temp:row.data?.instant?.details?.air_temperature,symbol:(row.data?.next_1_hours||row.data?.next_6_hours||row.data?.next_12_hours)?.summary?.symbol_code});
  const current=read(nearest);if(!Number.isFinite(current.temp)||!Number.isFinite(Date.parse(current.time)))throw Error('weather');
  return {current,forecast:series.filter(row=>Date.parse(row.time)>Date.parse(current.time)).slice(0,3).map(read)};
 };
 const states=new Map();let mounted=null,mountedOwner=null,dispose=null;
 function mount(host,{owner,client,authorized=()=>true}={}){
  owner=owner||null;
  if(!host){dispose?.();dispose=null;mounted=null;mountedOwner=null;return;}
  if(mounted===host&&mountedOwner===owner)return;dispose?.();mounted=host;mountedOwner=owner;
  const state=states.get(owner)||{open:{calendar:true},month:today().slice(0,7),selected:today(),city:0};states.set(owner,state);
  let alive=true,closeLedger=null,schedule=null,calendarCounts={},request=null,requestNumber=0,locating=0;
  const active=()=>alive&&host.isConnected&&authorized();
  host.replaceChildren(el('h2','생활'));
  function section(key,title){
   const box=el('details','','life-tool');box.dataset.lifeTool=key;box.open=!!state.open[key];box.ontoggle=()=>state.open[key]=box.open;
   const summary=el('summary'),copy=el('span');copy.append(el('strong',title));summary.append(copy,el('span','＋','life-toggle'));box.append(summary);const body=el('div','','life-tool-body');box.append(body);host.append(box);return body;
  }
  const calendar=section('calendar','스케줄 달력'),calendarNav=el('div','','life-calendar-nav'),monthTitle=el('strong'),calendarGrid=el('div','','life-calendar-grid'),selectedLabel=el('p','','life-calendar-selected');
  calendarNav.dataset.worldSwipe='off';calendarGrid.dataset.worldSwipe='off';monthTitle.setAttribute('aria-live','polite');selectedLabel.setAttribute('aria-live','polite');
  function shiftMonth(amount){const [y,m]=state.month.split('-').map(Number),d=new Date(y,m-1+amount,1);if(d.getFullYear()<1900||d.getFullYear()>2200)return;state.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;renderCalendar();}
  const previousMonth=btn('‹',()=>shiftMonth(-1)),next=btn('›',()=>shiftMonth(1));previousMonth.setAttribute('aria-label','이전 달');next.setAttribute('aria-label','다음 달');
  calendarNav.append(previousMonth,monthTitle,next,btn('오늘',()=>{state.month=today().slice(0,7);state.selected=today();renderCalendar();}));calendar.append(calendarNav,calendarGrid,selectedLabel);
  function renderCalendar(){
   const [year,month]=state.month.split('-').map(Number),start=new Date(year,month-1,1).getDay(),days=new Date(year,month,0).getDate();
   monthTitle.textContent=`${year}년 ${month}월`;calendarGrid.replaceChildren();
   for(const [i,day] of ['일','월','화','수','목','금','토'].entries()){const name=el('span',day,'life-calendar-weekday');if(i===0)name.classList.add('is-sunday');if(i===6)name.classList.add('is-saturday');calendarGrid.append(name);}
   for(let i=0;i<start;i++){const blank=el('span');blank.setAttribute('aria-hidden','true');calendarGrid.append(blank);}
   for(let day=1;day<=days;day++){
    const date=`${state.month}-${String(day).padStart(2,'0')}`,weekday=(start+day-1)%7;
    const b=btn(String(day),()=>{state.selected=date;renderCalendar();calendarGrid.querySelector(`[data-date="${date}"]`)?.focus();});b.dataset.date=date;b.setAttribute('aria-label',`${year}년 ${month}월 ${day}일`);b.setAttribute('aria-pressed',String(date===state.selected));
    if(calendarCounts[date]){b.classList.add('has-schedule');b.setAttribute('aria-label',`${year}년 ${month}월 ${day}일, 일정 ${calendarCounts[date]}개`);}if(date===today()){b.classList.add('is-today');b.setAttribute('aria-current','date');}if(weekday===0)b.classList.add('is-sunday');if(weekday===6)b.classList.add('is-saturday');calendarGrid.append(b);
   }
   const date=new Date(state.selected+'T12:00:00');selectedLabel.textContent=date.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});schedule?.setView(state.month,state.selected);
  }renderCalendar();
  const scheduleHost=el('div','','life-schedule');calendar.append(scheduleHost);
  if(window.OjjudaSchedule)schedule=window.OjjudaSchedule.mount(scheduleHost,{owner,client,authorized:active,month:state.month,selected:state.selected,onChange:counts=>{calendarCounts=counts;renderCalendar();},onNavigate:date=>{state.month=date.slice(0,7);state.selected=date;renderCalendar();}});
  else scheduleHost.append(el('p','스케줄 달력을 불러오지 못했어요. 새로고침해 주세요.','life-empty'));
  const weather=section('weather','날씨'),weatherControls=el('div','','life-weather-controls'),cityLabel=el('label','지역'),citySelect=el('select'),weatherResult=el('div','','life-weather-result'),weatherStatus=el('p','지역을 선택해 날씨를 확인해 보세요.','life-status');
  cities.forEach(([name],i)=>{const option=el('option',name);option.value=String(i);citySelect.append(option);});citySelect.setAttribute('aria-label','지역');citySelect.value=String(state.city);cityLabel.append(citySelect);weatherControls.dataset.worldSwipe='off';weatherStatus.setAttribute('role','status');
  let selectedPlace=cities[state.city];
  const locate=btn('내 위치',()=>{
   if(!navigator.geolocation){weatherStatus.textContent='위치를 사용할 수 없어요. 지역을 선택해 주세요.';return;}
   const token=++locating;weatherStatus.textContent='현재 위치를 확인하고 있어요.';
   navigator.geolocation.getCurrentPosition(position=>{
    if(!active()||token!==locating)return;const lat=Math.round(position.coords.latitude*100)/100,lon=Math.round(position.coords.longitude*100)/100;
    let option=citySelect.querySelector('[value="here"]');if(!option){option=el('option','내 위치');option.value='here';citySelect.append(option);}citySelect.value='here';selectedPlace=['내 위치',lat,lon];loadWeather(true);
   },()=>{if(active()&&token===locating)weatherStatus.textContent='위치 권한을 확인하거나 지역을 직접 선택해 주세요.';},{enableHighAccuracy:false,timeout:8000,maximumAge:600000});
  });
  citySelect.onchange=()=>{locating++;if(citySelect.value==='here')return;citySelect.querySelector('[value="here"]')?.remove();state.city=Number(citySelect.value);selectedPlace=cities[state.city];loadWeather(true);};
  weatherControls.append(cityLabel,locate,btn('새로고침',()=>loadWeather(true)));weather.append(weatherControls,weatherStatus,weatherResult);
  const source=el('p','','life-weather-source');source.append('예보 기반 현재 날씨 · ',link('MET Norway','https://www.met.no/'),' · ',link('CC BY 4.0','https://creativecommons.org/licenses/by/4.0/'),' · ',link('기상청 상세 날씨','https://www.weather.go.kr/w/index.do'));weather.append(source);
  function showWeather(data,name){
   const current=data.current,temperature=Number.isFinite(current.temp)?Math.round(current.temp)+'°':'—';
   const localTime=time=>new Date(time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
   weatherResult.replaceChildren();const currentBox=el('div','','life-weather-now');currentBox.append(el('strong',temperature),el('span',name+' · '+weatherText(current.symbol)));weatherResult.append(currentBox);
   const forecast=el('div','','life-weather-days');for(const row of data.forecast){
    const item=el('div');item.append(el('span',localTime(row.time)),el('span',weatherText(row.symbol)),el('strong',Number.isFinite(row.temp)?Math.round(row.temp)+'°':'—'));forecast.append(item);
   }weatherResult.append(forecast);weatherStatus.textContent=localTime(current.time)+' 기준 · 한국 시간';
  }
  async function loadWeather(force=false){
   if(!active())return;const [name,lat,lon]=selectedPlace,key=`${lat},${lon}`;request?.abort();const sequence=++requestNumber;
   if(!force&&state.weather?.key===key&&Date.now()-state.weather.at<3600000){showWeather(state.weather.data,name);return;}
   request=new AbortController();const controller=request,timeout=setTimeout(()=>controller.abort(),10000);weatherStatus.textContent=name+' 날씨를 불러오고 있어요.';weatherResult.replaceChildren();
   try{
    const params=new URLSearchParams({lat:String(lat),lon:String(lon)});
    const response=await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?'+params,{signal:controller.signal,credentials:'omit'});if(!response.ok)throw Error('weather');const data=normalizeWeather(await response.json());
    if(!active()||sequence!==requestNumber)return;state.weather={key,at:Date.now(),data};showWeather(data,name);
   }catch{if(active()&&sequence===requestNumber)weatherStatus.textContent='날씨를 불러오지 못했어요. 새로고침하거나 기상청 상세 날씨를 확인해 주세요.';}finally{clearTimeout(timeout);}
  }
  weather.parentElement.addEventListener('toggle',()=>{if(weather.parentElement.open)loadWeather();else{requestNumber++;request?.abort();}});if(weather.parentElement.open)loadWeather();
  const news=section('news','뉴스');news.append(el('p','보고 싶은 분야를 누르면 구글 뉴스가 새 창에서 열려요.','life-storage'));
  const newsGrid=el('div','','life-news-grid');
  const googleNews='https://news.google.com/',googleLocale='hl=ko&gl=KR&ceid=KR:ko';
  for(const [name,query] of [['주요 뉴스',''],['사회','한국 사회'],['경제','경제'],['생활·문화','생활 문화'],['세계','국제 세계'],['IT·과학','IT 과학'],['정치','한국 정치'],['스포츠','스포츠']]){const url=query?googleNews+'search?q='+encodeURIComponent(query)+'&'+googleLocale:googleNews+'?'+googleLocale;const a=link(name+' ↗',url);a.setAttribute('aria-label',name+' 구글 뉴스 (새 창)');newsGrid.append(a);}news.append(newsGrid);
  const ledger=section('ledger','가계부');
  if(window.OjjudaDonflow)closeLedger=window.OjjudaDonflow.mount(ledger,{owner,client,authorized:active});
  else ledger.append(el('p','가계부를 불러오지 못했어요. 새로고침해 주세요.','life-empty'));
  const calculator=section('calculator','계산기'),display=el('output','0','life-calc-display'),keys=el('div','','life-calc-keys');display.setAttribute('aria-label','계산 결과');display.setAttribute('aria-live','polite');keys.dataset.worldSwipe='off';
  let value='0',previous=null,operator=null,fresh=true;const compute=(a,b,op)=>op==='+'?a+b:op==='−'?a-b:op==='×'?a*b:b===0?NaN:a/b;
  function press(key){if(!active())return;
   if(key==='C'){value='0';previous=null;operator=null;fresh=true;}
   else if(key==='⌫'){value=fresh?'0':value.slice(0,-1)||'0';if(value==='-')value='0';fresh=false;}
   else if(key==='±'){if(Number.isFinite(Number(value))&&value!=='0')value=value.startsWith('-')?value.slice(1):'-'+value;}
   else if(key==='%'){if(Number.isFinite(Number(value)))value=String(Number(value)/100);}
   else if(['+','−','×','÷','='].includes(key)){const next=Number(value);if(previous!==null&&operator&&!fresh){const result=compute(previous,next,operator);value=Number.isFinite(result)?String(Number.isSafeInteger(result)?result:Number(result.toPrecision(12))):'계산할 수 없어요';previous=Number.isFinite(result)?Number(value):null;}else previous=Number.isFinite(next)?next:null;operator=key==='='?null:key;fresh=true;}
   else{if(fresh||!Number.isFinite(Number(value))){value=key==='.'?'0.':key;fresh=false;}else if(value.length<16){if(key!=='.'||!value.includes('.'))value=value==='0'&&key!=='.'?key:value+key;}}
   display.textContent=value;
  }
  for(const key of ['C','⌫','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','±','0','.','='])keys.append(btn(key,()=>press(key)));calculator.append(display,keys);
  const watcher=setInterval(()=>{if(alive&&!authorized()){host.replaceChildren();dispose?.();}},400);
  dispose=()=>{alive=false;locating++;requestNumber++;request?.abort();schedule?.destroy();closeLedger?.();clearInterval(watcher);};
 }
 window.OjjudaLife={mount};
})();
