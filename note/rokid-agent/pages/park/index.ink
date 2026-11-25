<script setup>
const configUrl = 'https://ojjuda.kr/park/even-public.json';
const empty = {
  mode: 'feed', firstBody: '', firstDistance: '', secondBody: '', secondDistance: '',
  readerBody: '', readerDistance: '', readerHeading: '', status: '공개 카드 불러오는 중',
  clock: '', battery: '—%', speed: '— km/h', weather: '현재 위치 확인 중'
};
const rounded = n => Math.round(n * 1000) / 1000;
const two = n => String(n).padStart(2, '0');
function distance(band) {
  if (band === '근처') return '1km 이내';
  return /^[1-9]\d{0,4}km$/.test(band || '') ? band + ' 이내' : '';
}
function visibleCard(row, kind) {
  return row && row.kind === kind && typeof row.id === 'string' && typeof row.body === 'string' &&
    row.body.trim().length > 0 && !(row.tags || []).includes('19금');
}
function clip(body) {
  const chars = Array.from((body || '').replace(/\s+/g,' ').trim());
  return chars.length > 17 ? chars.slice(0,16).join('') + '…' : chars.join('');
}
function chunks(text) {
  // Three short lines leave space for a reply count, distance and navigation.
  const chars = Array.from(text.replace(/\s+/g,' ').trim()), pages = [];
  for (let i=0; i<chars.length; i+=54) pages.push(chars.slice(i,i+54).join(''));
  return pages.length ? pages : [''];
}
function weatherCell(lat, lon) {
  if (lat <= -90 || lat >= 90) return null;
  const rad=Math.PI/180, re=6371.00877/5, lat1=30*rad, lat2=60*rad;
  const t=latitude=>Math.tan(Math.PI/4+latitude*rad/2);
  const sn=Math.log(Math.cos(lat1)/Math.cos(lat2))/Math.log(t(60)/t(30));
  const sf=Math.pow(t(30),sn)*Math.cos(lat1)/sn;
  const ra=re*sf/Math.pow(t(lat),sn), ro=re*sf/Math.pow(t(38),sn);
  const theta=(((lon-126+540)%360)-180)*rad*sn;
  const x=Math.floor(ra*Math.sin(theta)+43.5), y=Math.floor(ro-ra*Math.cos(theta)+136.5);
  return x>=1 && x<=149 && y>=1 && y<=253 ? x+','+y : null;
}
async function request(url, options, signal) {
  const reply = await fetch(url, {...options, signal, timeout: 12000});
  if (!reply.ok) throw Error('Request failed');
  return reply.json();
}
function rest(s, path, body) {
  const headers = {'apikey':s.config.supabaseKey,'Accept-Profile':'ojjuda_note'};
  if (body) {
    headers['Content-Type']='application/json';
    headers['Content-Profile']='ojjuda_note';
  }
  return request(s.config.supabaseUrl+'/rest/v1/'+path,
    body ? {method:'POST',headers,body:JSON.stringify(body)} : {headers},s.stop.signal);
}
export default {
  data: {...empty},
  onShow() {
    if (this.session) return;
    const s={stop:new AbortController(),rows:[],at:0,stack:[],fix:null,grid:null,
      order:'recent',feedRun:0,replyRun:0,nextFeed:0,weatherUntil:0,speedUntil:0};
    this.session=s;
    this.setData({...empty});
    this.tick(s);
    s.timer=setInterval(()=>this.tick(s),5000);
    if (typeof navigator.getBattery === 'function') {
      navigator.getBattery().then(b=>{
        if (this.session!==s || !b) return;
        s.battery=b; this.tick(s);
      }).catch(()=>{});
    }
    request(configUrl,{},s.stop.signal).then(config=>{
      if(this.session!==s) return;
      if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) || !config.supabaseKey) throw Error('config');
      s.config=config;
      this.feed(s,null);
      this.locate(s);
    }).catch(()=>{if(this.session===s)this.setData({status:'연결 실패 · 탭해 다시 시도',weather:'날씨 —'});});
  },
  tick(s) {
    if(this.session!==s) return;
    const now=new Date(), b=s.battery, level=b && b.level;
    this.setData({clock:two(now.getHours())+':'+two(now.getMinutes()),
      battery:Number.isFinite(level)&&level>=0&&level<=1 ? Math.round(level*100)+'%'+(b.charging?' ⚡':'') : '—%',
      speed:Date.now()<s.speedUntil ? s.speed : '— km/h'});
    if (s.weatherUntil && Date.now()>=s.weatherUntil) {
      s.weatherUntil=0; this.setData({weather:'날씨 갱신 중'});
    }
  },
  locate(s) {
    if(this.session!==s) return;
    const later=()=>{s.locationTimer=setTimeout(()=>this.locate(s),12000);};
    const lost=(error)=>{
      if(this.session!==s) return;
      const hadFix=!!s.fix;
      s.fix=null; s.grid=null; s.weatherUntil=0; s.speedUntil=0; s.nextFeed=0;
      this.setData({weather:error && error.code===1?'위치 권한 필요':'현재 위치 확인 필요',speed:'— km/h'});
      if(hadFix) {
        s.stack.forEach(f=>{f.rows.forEach(r=>{r.distance_band=null;});});
        s.rows.forEach(r=>{r.distance_band=null;});
        this.draw(s); this.feed(s,null);
      }
      if(error && error.code!==1) later();
    };
    try {
      if (!navigator.geolocation) { lost(null); return; }
      navigator.geolocation.getCurrentPosition(pos=>{
        if(this.session!==s) return;
        const c=pos && pos.coords, at=pos && pos.timestamp;
        if(!c || !Number.isFinite(c.latitude)||Math.abs(c.latitude)>90 ||
          !Number.isFinite(c.longitude)||Math.abs(c.longitude)>180 || !Number.isFinite(at) ||
          at<Date.now()-30000 || at>Date.now()+2000 ||
          (c.accuracy!=null && (!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>5000))) {lost({code:2});return;}
        s.fix={latitude:rounded(c.latitude),longitude:rounded(c.longitude)};
        s.speed=Number.isFinite(c.speed)&&c.speed>=0 ? Math.round(c.speed*36)/10+' km/h' : '— km/h';
        s.speedUntil=at+15000; this.tick(s);
        if(Date.now()>=s.nextFeed) {s.nextFeed=Date.now()+60000;this.feed(s,s.fix);}
        this.loadWeather(s,weatherCell(c.latitude,c.longitude)); later();
      },lost,{enableHighAccuracy:true,maximumAge:0,timeout:10000});
    } catch {lost({code:2});}
  },
  async loadWeather(s,grid) {
    if(!grid) {s.grid=null;s.weatherUntil=0;this.setData({weather:'국내 관측 지역 밖'});return;}
    if(s.grid===grid && (s.weatherPending===grid || Date.now()<s.weatherUntil || Date.now()<s.weatherRetry)) return;
    s.grid=grid; s.weatherPending=grid; s.weatherUntil=0; s.weatherRetry=Date.now()+30000;
    this.setData({weather:'날씨 확인 중'});
    try {
      const w=await request(s.config.supabaseUrl+'/functions/v1/theme-weather?cell='+encodeURIComponent(grid),
        {headers:{apikey:s.config.supabaseKey}},s.stop.signal);
      if(this.session!==s||s.grid!==grid) return;
      if (!w || w.source!=='kma' || !(w.expiresAt>Date.now()) || (!Number.isFinite(w.temperature)&&!w.label)) throw Error('weather');
      s.weatherUntil=w.expiresAt;
      this.setData({weather:[Number.isFinite(w.temperature)?w.temperature+'°C':'',w.label].filter(Boolean).join(' · ')});
    } catch {if(this.session===s&&s.grid===grid)this.setData({weather:'날씨 응답 대기'});}
    finally {if(s.weatherPending===grid)s.weatherPending=null;}
  },
  async feed(s,fix,note='') {
    const run=++s.feedRun, sort=fix?'nearby':'recent', rows=[], snapshot=new Date().toISOString();
    try {
      for(let offset=0;offset<=5000 && rows.length<30;offset+=30) {
        const batch=await rest(s,'rpc/list_cards',{p_sort:sort,p_lat:fix?fix.latitude:null,p_lon:fix?fix.longitude:null,
          p_radius_m:30000,p_limit:30,p_cursor:{offset,snapshot}});
        if(this.session!==s||s.feedRun!==run)return;
        if(!Array.isArray(batch))throw Error('cards');
        rows.push(...batch.filter(row=>visibleCard(row,'memo')));
        if(batch.length<30)break;
      }
      if(fix&&!rows.length) {this.feed(s,null,'30km 이내 카드 없음 · ');return;}
      const old=s.rows[s.at];
      s.rows=rows.slice(0,30); s.order=sort;
      s.at=old ? Math.max(0,s.rows.findIndex(r=>r.id===old.id)) : 0;
      s.label=rows.length ? note+(fix?'가까운 순':'최신 공개 카드') : '공개 카드 없음';
      this.draw(s);
    } catch {
      if(this.session!==s||run!==s.feedRun)return;
      if(fix) {this.feed(s,null,'주변 조회 지연 · ');return;}
      s.label='카드 조회 실패 · 탭해 다시 시도'; this.draw(s);
    }
  },
  draw(s) {
    const f=s.stack[s.stack.length-1], a=s.rows[s.at], b=s.rows[s.at+1];
    if(!f) {
      this.setData({mode:'feed',firstBody:clip(a && a.body),secondBody:clip(b && b.body),
        firstDistance:s.order==='nearby' && a ? distance(a.distance_band) : '',
        secondDistance:s.order==='nearby' && b ? distance(b.distance_band) : '',
        status:s.label||'공개 카드 불러오는 중'});return;
    }
    const card=f.rows[f.at], pages=chunks(card.body);
    const heading=s.stack.length===1?'원글':'답카드 '+(f.at+1);
    this.setData({mode:'reader',readerBody:pages[f.sheet],readerDistance:s.stack.length===1&&s.fix?distance(card.distance_band):'',
      readerHeading:heading+(pages.length>1?' · '+(f.sheet+1)+'/'+pages.length:''),
      status:f.message || (card.reply_count===0?'답카드 없음':'탭해 답카드 보기')});
  },
  async replies(s,parent) {
    if(parent.busy)return;
    parent.busy=true; parent.message='답카드 확인 중';this.draw(s);
    const run=++s.replyRun, card=parent.rows[parent.at];
    const current=()=>this.session===s && s.replyRun===run && s.stack[s.stack.length-1]===parent;
    try {
      const confirmed=await rest(s,'rpc/get_card',{p_id:card.id});
      if(!current())return;
      if(!visibleCard(confirmed,s.stack.length===1?'memo':'comment')) {
        parent.rows.splice(parent.at,1);
        if(!parent.rows.length)s.stack.pop();
        else {parent.at=Math.min(parent.at,parent.rows.length-1);parent.sheet=0;parent.message='공개가 끝난 카드';}
        s.rows=s.rows.filter(r=>r.id!==card.id);
        s.at=Math.max(0,Math.min(s.at,s.rows.length-1));
        s.label='공개가 끝난 카드';
        return;
      }
      const f={rows:[],at:0,sheet:0,parentId:card.id,snapshot:new Date().toISOString(),more:true};
      const rows=await this.replyBatch(s,f);
      if(!current())return;
      if(!rows.length) {card.reply_count=0;parent.message='답카드 없음';return;}
      parent.message='';f.rows=rows;s.stack.push(f);
    } catch {if(current())parent.message='답카드 조회 실패 · 탭해 재시도';}
    finally {parent.busy=false;if(this.session===s)this.draw(s);}
  },
  async replyBatch(s,f) {
    let path='public_cards?select=id,body,kind,tags,created_at,reply_count&kind=eq.comment&tags=not.cs.'+
      encodeURIComponent('{19금}')+'&parent_id=eq.'+encodeURIComponent(f.parentId)+
      '&created_at=lte.'+encodeURIComponent(f.snapshot)+'&order=created_at.desc,id.desc&limit=21';
    if(f.rows.length) {
      const last=f.rows[f.rows.length-1];
      path+='&or='+encodeURIComponent('(created_at.lt.'+last.created_at+',and(created_at.eq.'+last.created_at+',id.lt.'+last.id+'))');
    }
    const batch=await rest(s,path);
    if(!Array.isArray(batch))throw Error('replies');
    f.more=batch.length>20;
    return batch.slice(0,20).filter(row=>visibleCard(row,'comment'));
  },
  async move(s,delta) {
    const f=s.stack[s.stack.length-1];
    if(!f) {s.at=Math.max(0,Math.min(s.at+delta,s.rows.length-1));this.draw(s);return;}
    if(f.busy)return;
    const pages=chunks(f.rows[f.at].body);
    if(f.sheet+delta>=0 && f.sheet+delta<pages.length) {f.sheet+=delta;this.draw(s);return;}
    if(delta>0 && f.at===f.rows.length-1 && f.more) {
      f.busy=true;
      try {
        const more=await this.replyBatch(s,f);
        if(this.session!==s||s.stack[s.stack.length-1]!==f)return;
        f.rows.push(...more);
      } catch {if(this.session===s){f.message='다음 답카드 조회 실패 · 다시 넘기기';this.draw(s);}return;}
      finally {f.busy=false;}
    }
    if(f.at+delta<0 || f.at+delta>=f.rows.length)return;
    f.at+=delta;f.sheet=delta<0?chunks(f.rows[f.at].body).length-1:0;f.message='';this.draw(s);
  },
  onKeyUp(e) {
    const s=this.session;if(!s)return;
    if(e.code==='Backspace') {
      if(!s.stack.length)return;
      e.preventDefault();++s.replyRun;s.stack.pop();this.draw(s);return;
    }
    if(e.code==='ArrowDown'||e.code==='ArrowUp') {e.preventDefault();this.move(s,e.code==='ArrowDown'?1:-1);return;}
    if(e.code!=='Enter')return;
    e.preventDefault();
    const f=s.stack[s.stack.length-1];
    if(f) {this.replies(s,f);return;}
    const card=s.rows[s.at];
    if(!card){this.onHide();this.onShow();return;}
    s.stack.push({rows:[card],at:0,sheet:0});this.draw(s);
  },
  onHide() {
    const s=this.session;if(!s)return;
    this.session=null;s.stop.abort();
    clearInterval(s.timer);clearTimeout(s.locationTimer);
    this.setData({...empty});
  },
  onUnload() {this.onHide();}
};
</script>
<page>
  <view class="hud">
    <view class="row"><text>{{clock}}</text><text>{{battery}}</text></view>
    <view wx:if="{{mode === 'feed'}}" class="feed">
      <view class="cards">
        <view class="card"><text class="line">{{firstBody}}</text><text class="distance">{{firstDistance}}</text></view>
        <view wx:if="{{secondBody}}" class="card"><text class="line">{{secondBody}}</text><text class="distance">{{secondDistance}}</text></view>
      </view>
    </view>
    <view wx:else class="reader">
      <text class="heading">{{readerHeading}}</text><text class="body">{{readerBody}}</text><text class="distance">{{readerDistance}}</text>
    </view>
    <text class="status">{{status}}</text>
    <view class="row"><text>{{weather}}</text><text>{{speed}}</text></view>
  </view>
</page>
<style>
.hud { width: 480px; height: 352px; padding: 12px 16px; box-sizing: border-box; display: flex; flex-direction: column; background-color: #000; color: #9eff99; font-size: 18px; }
.row { display: flex; flex-direction: row; justify-content: space-between; height: 28px; }
.feed { flex: 1; display: flex; flex-direction: row; justify-content: flex-end; align-items: center; }
.cards { width: 310px; display: flex; flex-direction: column; }
.card { display: flex; flex-direction: column; height: 80px; justify-content: space-between; padding: 6px 10px; margin-bottom: 6px; border: 1px solid #9eff99; }
.line { font-size: 18px; }
.distance { align-self: flex-end; font-size: 15px; }
.reader { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.heading,.status { font-size: 16px; }
.body { font-size: 22px; line-height: 30px; margin: 8px 0; }
.status { height: 24px; }
</style>
