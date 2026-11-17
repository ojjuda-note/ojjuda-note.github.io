export const radarLimits = [1, 3, 7, 15] as const;
export type RadarBand = typeof radarLimits[number];
export type RadarCell = { latCell: number; lonCell: number };

export const rangeNames: Record<RadarBand, string> = {
  1: "약 1km 이내", 3: "약 1~3km", 7: "약 3~7km", 15: "약 7~15km",
};

// The browser sends integer cells only. One latitude step is about 1.1 km.
export function coarseCell(latitude: number, longitude: number): RadarCell {
  return {latCell: Math.round(latitude * 100), lonCell: Math.round(longitude * 100)};
}

export function isCell(value: RadarCell): boolean {
  return Number.isInteger(value.latCell) && Math.abs(value.latCell) <= 9000
    && Number.isInteger(value.lonCell) && Math.abs(value.lonCell) <= 18000;
}

export function distanceBand(a: RadarCell, b: RadarCell): RadarBand | undefined {
  const rad = Math.PI / 18000;
  const halfLat = (a.latCell - b.latCell) * rad / 2;
  const halfLon = (a.lonCell - b.lonCell) * rad / 2;
  const h = Math.sin(halfLat) ** 2 +
    Math.cos(a.latCell * rad) * Math.cos(b.latCell * rad) * Math.sin(halfLon) ** 2;
  const km = 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  return radarLimits.find(limit => km <= limit);
}

export function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function directionName(bearing: number): string {
  return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(wrapDegrees(bearing) / 45) % 8];
}

// Only an eight-way sector leaves the server. A shared cell has no bearing.
export function bearingSector(from: RadarCell, to: RadarCell): number | undefined {
  if (from.latCell === to.latCell && from.lonCell === to.lonCell) return undefined;
  const rad = Math.PI / 18000;
  const a = from.latCell * rad, b = to.latCell * rad, lon = (to.lonCell - from.lonCell) * rad;
  const east = Math.sin(lon) * Math.cos(b);
  const north = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(lon);
  if (Math.hypot(east, north) < 1e-10) return undefined;
  return wrapDegrees(Math.round(Math.atan2(east, north) * 180 / Math.PI / 45) * 45);
}

export function radarPosition(bearing: number, heading: number, radius: number) {
  const angle = (bearing - heading) * Math.PI / 180;
  return {x: 50 + Math.sin(angle) * radius / 4, y: 50 - Math.cos(angle) * radius / 4};
}
