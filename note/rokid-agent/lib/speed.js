const radians = Math.PI / 180;

function distance(a, b) {
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) *
    Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Keep a short history in this viewing session only. Speeds are in m/s internally.
export function createSpeedMeter(maxAge = 8000) {
  let history = [], lastSeen = -Infinity, measuredAt = -Infinity, speed = null;
  function clear() {
    history = [];
    speed = null;
    measuredAt = -Infinity;
  }
  function update({latitude, longitude, accuracy, speed: nativeSpeed, timestamp}, now) {
    if (!Number.isFinite(timestamp) || timestamp <= lastSeen || timestamp > now + 2000 ||
        now - timestamp >= maxAge) return;
    if (timestamp - lastSeen >= maxAge) clear();
    lastSeen = timestamp;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) ||
        Math.abs(longitude) > 180 || (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50))) {
      clear();
      return;
    }

    const point = {latitude, longitude, accuracy, timestamp};
    const hasNative = Number.isFinite(nativeSpeed) && nativeSpeed >= 0;
    const previous = history[history.length - 1];
    history = history.filter(p => timestamp - p.timestamp <= 20000);
    if (previous && Number.isFinite(accuracy) && Number.isFinite(previous.accuracy)) {
      const dt = (timestamp - previous.timestamp) / 1000;
      // An isolated coordinate jump must not become either endpoint of a speed estimate.
      if (distance(previous, point) > 100 * dt + accuracy + previous.accuracy) {
        clear();
        return;
      }
    }
    let reading = hasNative ? nativeSpeed : null;
    if (Number.isFinite(accuracy) && accuracy <= 25) {
      if (!hasNative) {
        // Prefer a short baseline for stops, then allow a longer one for slow walking.
        for (let i = history.length - 1; i >= 0; i--) {
          const start = history[i], dt = (timestamp - start.timestamp) / 1000;
          if (dt < 4) continue;
          const moved = distance(start, point);
          const noise = Math.max(2, Math.hypot(accuracy, start.accuracy) * 0.7);
          reading = moved > noise ? moved / dt : 0;
          if (reading > 0 || (moved < 1 && dt >= 4)) break;
        }
      }
      history.push(point);
    } else {
      history = [];
    }
    if (reading == null) {
      speed = null;
      return;
    }
    const dt = (timestamp - measuredAt) / 1000;
    if (speed != null && dt > 0 && reading > speed + 8 * dt + 4) return;
    if (reading < (speed > 0 ? 0.25 : 0.45)) speed = 0;
    else if (speed == null || dt >= maxAge / 1000) speed = reading;
    else speed += (reading - speed) * (1 - Math.exp(-dt / 1.5));
    measuredAt = Math.min(timestamp, now);
  }
  return {update, read(now) {
    return speed != null && now - measuredAt < maxAge ? Math.round(speed * 36) / 10 : null;
  }};
}
