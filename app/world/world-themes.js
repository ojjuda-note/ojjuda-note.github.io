/* Calendar themes use Korea Standard Time, independently of the device time zone.
   Lunar dates: KoreanLunarCalendar 0.3.1, normal (not leap) month; 2026–2050.
   2026/2027 fixtures verified against KASI calendarData. See docs/design-system.md. */
(()=>{'use strict';
const STORAGE='ojjuda-world-theme-v1',DAY=86400000,KST=9*3600000;
const catalog={
 classic:{name:'기본',headline:['오늘도','잘 왔어!'],copy:'오쭈다에서 잠깐 쉬다가, 한 판 놀다 가요.',period:'언제나'},
 spring:{name:'봄',headline:['우리 사이에','봄이 왔어.'],copy:'꽃처럼 피어나는 안부, 오쭈다에서 나눠요.',period:'3–5월'},
 summer:{name:'여름',headline:['여름엔','쉬어 가도 돼.'],copy:'무더운 하루에도 오쭈다는 작은 그늘이 돼요.',period:'6–8월'},
 autumn:{name:'가을',headline:['오늘은','여유 한 잔.'],copy:'오쭈다에서 가을빛 안부를 천천히 나눠요.',period:'9–11월'},
 winter:{name:'겨울',headline:['추울수록','가까이.'],copy:'오쭈다의 작은 온기가 하루를 데워요.',period:'12–2월'},
 newyear:{name:'새해',headline:['새해도','우리답게.'],copy:'새로운 시작, 오쭈다에서 첫 안부를 나눠요.',period:'1월 1일',date:'01-01'},
 seollal:{name:'설날',headline:['복 많이','나누는 날.'],copy:'설날의 따뜻한 인사, 오쭈다에도 가득.',period:'음력 1월 1일 전후 3일'},
 valentine:{name:'발렌타인데이',headline:['오늘은','더 다정하게.'],copy:'초콜릿보다 오래 남을 마음, 오쭈다에서.',period:'2월 14일',date:'02-14'},
 white:{name:'화이트데이',headline:['고마움도','선물이 돼.'],copy:'화이트데이, 오쭈다에서 마음을 전해요.',period:'3월 14일',date:'03-14'},
 children:{name:'어린이날',headline:['웃음엔','나이가 없어.'],copy:'어른도 아이도 오쭈다에선 마음껏 웃어요.',period:'5월 5일',date:'05-05'},
 parents:{name:'어버이날',headline:['고마움이','꽃피는 날.'],copy:'어버이날, 오쭈다에서 사랑을 한 번 더 말해요.',period:'5월 8일',date:'05-08'},
 teachers:{name:'스승의날',headline:['배움은','오래 남아요.'],copy:'스승의 날, 오쭈다에서 감사한 마음을 전해요.',period:'5월 15일',date:'05-15'},
 buddha:{name:'부처님오신날',headline:['마음에','등불 하나.'],copy:'부처님오신날, 오쭈다에서 평온을 나눠요.',period:'음력 4월 8일'},
 liberation:{name:'광복절',headline:['기억을','이어 가는 날.'],copy:'광복의 뜻을 기억하며, 오쭈다에서 함께해요.',period:'8월 15일',date:'08-15'},
 chuseok:{name:'추석',headline:['보름달처럼','넉넉하게.'],copy:'멀리 있어도 오쭈다에서 안부를 나눠요.',period:'음력 8월 15일 전후 3일'},
 hangeul:{name:'한글날',headline:['우리말로','더 가까이.'],copy:'오쭈다에서 다정한 한마디를 나눠요.',period:'10월 9일',date:'10-09'},
 halloween:{name:'할로윈',headline:['오늘은','조금 색다르게.'],copy:'오쭈다에서 장난기 어린 웃음을 나눠요.',period:'10월 31일',date:'10-31'},
 pepero:{name:'빼빼로데이',headline:['달콤한','안부 하나.'],copy:'빼빼로 하나, 마음 한 조각. 오쭈다에서 나눠요.',period:'11월 11일',date:'11-11'},
 christmas:{name:'크리스마스',headline:['함께라서','더 따뜻해.'],copy:'오쭈다에 모인 마음이 오늘의 선물이에요.',period:'12월 25일',date:'12-25'}
};
const lunar={"2026":{"seollal":"2026-02-17","chuseok":"2026-09-25","buddha":"2026-05-24"},"2027":{"seollal":"2027-02-07","chuseok":"2027-09-15","buddha":"2027-05-13"},"2028":{"seollal":"2028-01-27","chuseok":"2028-10-03","buddha":"2028-05-02"},"2029":{"seollal":"2029-02-13","chuseok":"2029-09-22","buddha":"2029-05-20"},"2030":{"seollal":"2030-02-03","chuseok":"2030-09-12","buddha":"2030-05-09"},"2031":{"seollal":"2031-01-23","chuseok":"2031-10-01","buddha":"2031-05-28"},"2032":{"seollal":"2032-02-11","chuseok":"2032-09-19","buddha":"2032-05-16"},"2033":{"seollal":"2033-01-31","chuseok":"2033-09-08","buddha":"2033-05-06"},"2034":{"seollal":"2034-02-19","chuseok":"2034-09-27","buddha":"2034-05-25"},"2035":{"seollal":"2035-02-08","chuseok":"2035-09-16","buddha":"2035-05-15"},"2036":{"seollal":"2036-01-28","chuseok":"2036-10-04","buddha":"2036-05-03"},"2037":{"seollal":"2037-02-15","chuseok":"2037-09-24","buddha":"2037-05-22"},"2038":{"seollal":"2038-02-04","chuseok":"2038-09-13","buddha":"2038-05-11"},"2039":{"seollal":"2039-01-24","chuseok":"2039-10-02","buddha":"2039-04-30"},"2040":{"seollal":"2040-02-12","chuseok":"2040-09-21","buddha":"2040-05-18"},"2041":{"seollal":"2041-02-01","chuseok":"2041-09-10","buddha":"2041-05-07"},"2042":{"seollal":"2042-01-22","chuseok":"2042-09-28","buddha":"2042-05-26"},"2043":{"seollal":"2043-02-10","chuseok":"2043-09-17","buddha":"2043-05-16"},"2044":{"seollal":"2044-01-30","chuseok":"2044-10-05","buddha":"2044-05-05"},"2045":{"seollal":"2045-02-17","chuseok":"2045-09-25","buddha":"2045-05-24"},"2046":{"seollal":"2046-02-06","chuseok":"2046-09-15","buddha":"2046-05-13"},"2047":{"seollal":"2047-01-26","chuseok":"2047-10-04","buddha":"2047-05-02"},"2048":{"seollal":"2048-02-14","chuseok":"2048-09-22","buddha":"2048-05-20"},"2049":{"seollal":"2049-02-02","chuseok":"2049-09-11","buddha":"2049-05-09"},"2050":{"seollal":"2050-01-23","chuseok":"2050-09-30","buddha":"2050-05-28"}};
const order=['classic','spring','summer','autumn','winter','newyear','seollal','valentine','white','children','parents','teachers','buddha','liberation','chuseok','hangeul','halloween','pepero','christmas'];
function koreaDate(value=new Date()){
 const d=new Date(new Date(value).getTime()+KST);
 if(!Number.isFinite(d.getTime()))throw new TypeError('Invalid date');
 return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),stamp:d.toISOString().slice(0,10)};
}
function eventsOn(value=new Date()){
 const {year,stamp}=koreaDate(value),md=stamp.slice(5),events=[];
 const noon=Date.parse(stamp+'T12:00:00Z');
 for(const [key,date] of Object.entries(lunar[year]||{})){
  const days=Math.abs(noon-Date.parse(date+'T12:00:00Z'))/DAY;
  if(days<=(key==='buddha'?0:1))events.push(key);
 }
 for(const key of order)if(catalog[key].date===md)events.push(key);
 return events;
}
// Welcome each occasion a week early. When windows overlap, the closest
// upcoming occasion wins; the actual day (and lunar holiday leave) wins first.
function eventInSeason(value=new Date()){
 const {year,stamp}=koreaDate(value),today=Date.parse(stamp+'T12:00:00Z'),nearby=[];
 for(const y of [year-1,year,year+1])for(const key of order){
  const date=lunar[y]?.[key]||(catalog[key].date?y+'-'+catalog[key].date:null);
  if(!date)continue;
  const days=(Date.parse(date+'T12:00:00Z')-today)/DAY;
  if(days>=-(['seollal','chuseok'].includes(key)?1:0)&&days<=7)nearby.push({key,days});
 }
 nearby.sort((a,b)=>{
  const aLive=a.days<=0,bLive=b.days<=0;
  if(aLive!==bLive)return aLive?-1:1;
  return aLive?b.days-a.days:a.days-b.days;
 });
 return nearby[0]?.key||null;
}
function seasonFor(value=new Date()){
 const {year,month,stamp}=koreaDate(value),today=Date.parse(stamp+'T12:00:00Z');
 for(const [date,key] of [['03-01','spring'],['06-01','summer'],['09-01','autumn'],['12-01','winter']]){
  const days=(Date.parse(year+'-'+date+'T12:00:00Z')-today)/DAY;
  if(days>=0&&days<=7)return key;
 }
 return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
}
function resolve(value=new Date()){
 const event=eventInSeason(value);if(event)return event;
 return seasonFor(value);
}
// Older devices may still have a manual choice saved; calendar selection always wins.
try{localStorage.removeItem(STORAGE);}catch{}
let timer=0,current='';
const colorMode=window.matchMedia?.('(prefers-color-scheme: dark)');
function syncAppearance(){
 const root=document.documentElement;
 root.dataset.accent='pink';
 if(colorMode?.matches)root.dataset.theme='dark';else delete root.dataset.theme;
}
colorMode?.addEventListener?.('change',syncAppearance);
function apply(){
 syncAppearance();
 const previous=current;
 current=resolve();document.documentElement.dataset.worldTheme=current;
 document.querySelectorAll('[data-theme-greeting]').forEach(n=>{n.textContent=catalog[current].copy;});
 if(previous!==current)window.dispatchEvent(new Event('ojjuda:themechange'));
}
function schedule(){
 clearTimeout(timer);const now=Date.now(),next=(Math.floor((now+KST)/DAY)+1)*DAY-KST;
 timer=setTimeout(()=>{apply();schedule();},Math.max(1000,next-now+100));
}
function sync(){apply();schedule();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
window.addEventListener('pageshow',sync);
window.OjjudaThemes=Object.freeze({catalog,order,koreaDate,eventsOn,eventInSeason,seasonFor,resolve,getMode:()=>"auto",getCurrent:()=>current,sync,syncAppearance,scheduleFor(year){return order.filter(k=>catalog[k].date||lunar[year]?.[k]).map(k=>({key:k,name:catalog[k].name,date:lunar[year]?.[k]||year+'-'+catalog[k].date,period:catalog[k].period})).sort((a,b)=>a.date.localeCompare(b.date));}});
sync();
})();
