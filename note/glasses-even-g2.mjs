import {AppLocationAccuracy, OsEventTypeList, waitForEvenAppBridge} from '@evenrealities/even_hub_sdk';

function box(id, name, x, y, w, h, content, capture = 0, border = 0) {
  return {containerID:id, containerName:name, xPosition:x, yPosition:y, width:w, height:h,
    content, isEventCapture:capture, borderWidth:border, borderColor:10, paddingLength:border ? 4 : 0};
}

export function g2Page(view) {
  if (view.paused) return {containerTotalNum:1,textObject:[box(1,'standby',0,0,576,288,' ',1)]};
  const cards = view.cards;
  const fields = [
    box(1,'clock',12,6,150,32,view.time),
    box(2,'battery',454,6,118,32,(view.battery ?? '—') + '%' + (view.charging ? ' ⚡' : '')),
    box(3,'weather',12,248,325,36,view.weather),
    box(4,'speed',426,248,146,36,(view.speed ?? '—') + ' km/h')
  ];
  if (view.reader) {
    const reader=view.reader;
    fields.push(box(5,'full',118,48,448,180,'',0,1),
      box(6,'reader',125,52,431,138,(reader.title+'\n'+reader.body).slice(0,950),1),
      box(7,'fulldist',441,194,119,30,reader.distance));
  } else {
    const summary = card => (view.sample ? '예시 · ' : '') + card.oneLine;
    fields.push(box(5,'first',348,48,218,84,cards[0] ? summary(cards[0]) : '근처 카드 —',1,1),
      box(6,'second',348,143,218,84,cards[1] ? summary(cards[1]) : '—',0,1),
      box(7,'firstdist',443,100,118,29,cards[0]?.distance ?? ''),
      box(8,'seconddist',443,195,118,29,cards[1]?.distance ?? ''));
  }
  return {containerTotalNum:fields.length,textObject:fields};
}

export async function attachEvenG2(hud) {
  const bridge = await waitForEvenAppBridge();
  let page = g2Page(hud.getView());
  if (await bridge.createStartUpPageContainer(page) !== 0) throw Error('G2 display unavailable');
  let alive = true, drawing = false, dirty = false, listener, generation = 0;
  let locWork = Promise.resolve();
  async function paint() {
    dirty = true;
    if (drawing) return;
    drawing = true;
    try {
      while (alive && dirty) {
        dirty = false;
        const next = g2Page(hud.getView());
        if (page.containerTotalNum !== next.containerTotalNum) {
          if (await bridge.rebuildPageContainer(next)) page = next;
        } else {
          for (let i=0;i<next.textObject.length && alive;i++) {
            const {containerID,containerName,content} = next.textObject[i];
            if (page.textObject[i].content !== content &&
                await bridge.textContainerUpgrade({containerID,containerName,content})) page.textObject[i].content=content;
          }
        }
      }
    } catch { /* A later device or clock event retries the latest view. */ }
    finally { drawing = false; }
  }
  const redraw = () => { void paint(); };
  window.addEventListener('ojjuda:glasses-view',redraw);
  const offEvents = bridge.onEvenHubEvent(event => {
    const envelope = event.sysEvent || event.textEvent;
    if (!envelope) return;
    const type = envelope.eventType ?? OsEventTypeList.CLICK_EVENT;
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) { void bridge.shutDownPageContainer(1); return; }
    if (type === OsEventTypeList.CLICK_EVENT) hud.select();
    else if (type === OsEventTypeList.SCROLL_TOP_EVENT) hud.move(-1);
    else if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) hud.move(1);
  });
  let deviceRev = 0;
  const battery = state => { if (alive) hud.setBattery(state?.batteryLevel,state?.isCharging); };
  const offDevice = bridge.onDeviceStatusChanged(state => { deviceRev++; battery(state); });
  void bridge.getDeviceInfo().then(info => { if (!deviceRev) battery(info?.status); }).catch(() => {});
  const offLocation = bridge.onAppLocationChanged(fix => listener?.(fix));
  const schedule = job => { locWork = locWork.catch(() => {}).then(job); return locWork; };
  function stopLocation() {
    ++generation; listener = undefined;
    return schedule(() => bridge.stopAppLocationUpdates());
  }
  function startLocation(receive) {
    const run = ++generation; listener = receive;
    return schedule(async () => {
      if (!alive || generation !== run) return;
      const enabled = await bridge.startAppLocationUpdates({accuracy:AppLocationAccuracy.High,
        intervalMs:4000, distanceFilter:0});
      if (generation !== run) return;
      if (!enabled) throw Error('Even 앱에서 위치 사용을 허용해 주세요.');
      const first = await bridge.getAppLocation({accuracy:AppLocationAccuracy.High,timeoutMs:10000});
      if (generation === run && first) receive(first);
    });
  }
  redraw();
  return {startLocation,stopLocation,dispose() {
    alive=false;
    window.removeEventListener('ojjuda:glasses-view',redraw);
    offEvents(); offDevice(); offLocation();
    if (listener) void stopLocation().catch(() => {});
  }};
}
