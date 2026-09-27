// Integration source for a future Even Hub package. This module is not loaded
// by glasses.html: it must be bundled with @evenrealities/even_hub_sdk inside
// an Even Hub WebView, then connected to OJJUDA_GLASS_PREVIEW after glasses.js.
// It has not been verified on G2 hardware.
import {
  AppLocationAccuracy,
  OsEventTypeList,
  waitForEvenAppBridge
} from '@evenrealities/even_hub_sdk';

function shortLine(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  return chars.length > 12 ? `${chars.slice(0, 12).join('')}…` : clean;
}

function page(model) {
  const card = model.card;
  const status = `${model.time || '--:--'}   배터리 ${model.battery == null ? '—' : `${model.battery}%`}`;
  const summary = card
    ? `${card.distance}  ${shortLine(card.oneLine)}`
    : '가까운 카드를 찾는 중';
  const full = card ? `${card.distance}  ${card.index}/${card.count}\n${card.body}` : summary;
  const open = !!model.expanded && !!card;
  return {
    containerTotalNum: 2,
    textObject: [
      {
        xPosition: 205, yPosition: 17, width: 330, height: 26,
        containerID: 1, containerName: 'status', content: status,
        isEventCapture: 0
      },
      {
        xPosition: open ? 95 : 205,
        yPosition: open ? 49 : 65,
        width: open ? 430 : 330,
        height: open ? 188 : 60,
        borderWidth: 1, borderColor: 8, borderRadius: 6,
        paddingLength: 7,
        containerID: 2, containerName: 'card',
        content: open ? full : summary,
        isEventCapture: 1
      }
    ]
  };
}

export async function attachEvenG2(preview = window.OJJUDA_GLASS_PREVIEW) {
  if (!preview) throw new Error('glasses.js must load before the Even G2 adapter');
  const bridge = await waitForEvenAppBridge();
  const result = await bridge.createStartUpPageContainer(page(preview.getView()));
  if (result !== 0) throw new Error('Even G2 display initialization failed');

  let alive = true;
  let pending = Promise.resolve();
  const redraw = () => {
    if (!alive) return;
    // Avoid concurrent BLE redraws. The HUD keeps the middle of the view clear.
    pending = pending.then(() => bridge.rebuildPageContainer(page(preview.getView())));
    pending = pending.catch(() => {});
  };
  const onView = () => redraw();
  window.addEventListener('ojjuda:glasses-view', onView);
  const offEvents = bridge.onEvenHubEvent(event => {
    const type = event.textEvent?.eventType;
    if (!event.textEvent) return;
    if (type === OsEventTypeList.CLICK_EVENT || type === undefined) preview.select();
    else if (!preview.getView().expanded && type === OsEventTypeList.SCROLL_TOP_EVENT) preview.move(-1);
    else if (!preview.getView().expanded && type === OsEventTypeList.SCROLL_BOTTOM_EVENT) preview.move(1);
  });
  const offDevice = bridge.onDeviceStatusChanged(value => {
    preview.setBattery(value?.batteryLevel);
  });
  const info = await bridge.getDeviceInfo();
  preview.setBattery(info?.status?.batteryLevel);

  const offLocation = bridge.onAppLocationChanged(loc => {
    // The preview sends coordinates by POST to the protected nearby RPC only.
    // This adapter never renders, stores, or logs them.
    void preview.setLocation(loc);
  });
  const first = await bridge.getAppLocation({ accuracy: AppLocationAccuracy.High, timeoutMs: 12000 });
  if (first) await preview.setLocation(first);
  await bridge.startAppLocationUpdates({
    accuracy: AppLocationAccuracy.Medium, intervalMs: 60000, distanceFilter: 250
  });
  redraw();

  return async () => {
    alive = false;
    window.removeEventListener('ojjuda:glasses-view', onView);
    offEvents(); offDevice(); offLocation();
    await bridge.stopAppLocationUpdates();
  };
}
