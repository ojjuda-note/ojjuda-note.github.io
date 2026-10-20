/* Calendar themes use Korea Standard Time, independently of the device time zone.
   Lunar dates: KoreanLunarCalendar 0.3.1, normal (not leap) month; 2026–2050.
   2026/2027 fixtures verified against KASI calendarData. See docs/design-system.md. */
(()=>{'use strict';
const STORAGE='ojjuda-world-theme-v1',DAY=86400000,KST=9*3600000;
const catalog={
 classic:{name:'기본',copy:'잠깐 쉬어가도 좋은 곳.',period:'언제나'},
 spring:{name:'봄',copy:'마음에도 봄이 왔어요.',period:'3–5월'},
 summer:{name:'여름',copy:'시원하게 쉬어가는 시간.',period:'6–8월'},
 autumn:{name:'가을',copy:'차 한 잔 같은 여유.',period:'9–11월'},
 winter:{name:'겨울',copy:'우리의 작은 온기.',period:'12–2월'},
 newyear:{name:'새해',copy:'새로운 하루, 새로운 마음.',period:'1월 1일',date:'01-01'},
 seollal:{name:'설날',copy:'복이 가득한 한 해 되세요.',period:'음력 1월 1일 전후 3일'},
 valentine:{name:'발렌타인데이',copy:'달콤한 마음을 전해요.',period:'2월 14일',date:'02-14'},
 white:{name:'화이트데이',copy:'마음을 담은 작은 선물.',period:'3월 14일',date:'03-14'},
 children:{name:'어린이날',copy:'오늘은 마음껏 즐거워요.',period:'5월 5일',date:'05-05'},
 parents:{name:'어버이날',copy:'고맙고, 또 사랑합니다.',period:'5월 8일',date:'05-08'},
 teachers:{name:'스승의날',copy:'배움의 길에 감사한 마음.',period:'5월 15일',date:'05-15'},
 buddha:{name:'부처님오신날',copy:'마음에 다정한 등불 하나.',period:'음력 4월 8일'},
 liberation:{name:'광복절',copy:'기억하고, 함께 이어가요.',period:'8월 15일',date:'08-15'},
 chuseok:{name:'추석',copy:'보름달처럼 넉넉한 마음.',period:'음력 8월 15일 전후 3일'},
 hangeul:{name:'한글날',copy:'우리말로 전하는 다정함.',period:'10월 9일',date:'10-09'},
 halloween:{name:'할로윈',copy:'조금 특별한 오늘의 놀이.',period:'10월 31일',date:'10-31'},
 pepero:{name:'빼빼로데이',copy:'작은 나눔, 길어지는 웃음.',period:'11월 11일',date:'11-11'},
 christmas:{name:'크리스마스',copy:'따뜻한 마음이 모이는 날.',period:'12월 25일',date:'12-25'}
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
function resolve(value=new Date()){
 const events=eventsOn(value);if(events.length)return events[0];
 const {month}=koreaDate(value);return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
}
// Older devices may still have a manual choice saved; calendar selection always wins.
try{localStorage.removeItem(STORAGE);}catch{}
let timer=0,current='';
function apply(){
 current=resolve();document.documentElement.dataset.worldTheme=current;
 document.querySelectorAll('[data-theme-greeting]').forEach(n=>{n.textContent=catalog[current].copy;});
}
function schedule(){
 clearTimeout(timer);const now=Date.now(),next=(Math.floor((now+KST)/DAY)+1)*DAY-KST;
 timer=setTimeout(()=>{apply();schedule();},Math.max(1000,next-now+100));
}
function sync(){apply();schedule();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
window.addEventListener('pageshow',sync);
window.OjjudaThemes=Object.freeze({catalog,order,koreaDate,eventsOn,resolve,getMode:()=>"auto",getCurrent:()=>current,sync,scheduleFor(year){return order.filter(k=>catalog[k].date||lunar[year]?.[k]).map(k=>({key:k,name:catalog[k].name,date:lunar[year]?.[k]||year+'-'+catalog[k].date,period:catalog[k].period})).sort((a,b)=>a.date.localeCompare(b.date));}});
sync();
})();
