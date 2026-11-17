import { wrapDegrees } from "./radar";

export type OrientationSample = Pick<DeviceOrientationEvent, "alpha"|"beta"|"gamma"|"absolute"|"type"> & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

export function screenHeading(event: OrientationSample, screenAngle: number): number | null {
  const apple = event.webkitCompassHeading;
  const rad = Math.PI / 180;
  const angle = screenAngle * rad;
  const beta = (event.beta ?? 0) * rad, gamma = (event.gamma ?? 0) * rad;

  // Project the displayed screen's top edge onto the horizontal plane using
  // the device-orientation Z-X-Y rotation (in its natural screen orientation).
  const x = Math.sin(angle) * Math.cos(gamma);
  const y = Math.sin(angle) * Math.sin(beta) * Math.sin(gamma) + Math.cos(angle) * Math.cos(beta);
  if (Math.hypot(x,y) < 0.05) return null;
  const azimuth = Math.atan2(x,y) / rad;
  if (typeof apple === "number" && Number.isFinite(apple) && apple >= 0 && apple <= 360) {
    if (typeof event.webkitCompassAccuracy === "number" && event.webkitCompassAccuracy < 0) return null;
    // WebKit already reports a north-referenced heading for the natural top.
    return wrapDegrees(apple + azimuth - (Math.cos(beta) < 0 ? 180 : 0));
  }
  if ((!event.absolute && event.type !== "deviceorientationabsolute") ||
      typeof event.alpha !== "number" || !Number.isFinite(event.alpha)) return null;
  return wrapDegrees(azimuth - event.alpha);
}
