// Cut out existing picture pixels at their native resolution. This module does
// not generate, recolor, resize, or reconstruct any part of the furniture.
const EPSILON = 1e-8;

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

function openPolygon(polygon) {
  const points = polygon.slice();
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  return points;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < EPSILON &&
    p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON &&
    p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsMeet(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** True for a finite, non-zero-area polygon without crossings or repeated vertices. */
export function validatePolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const points = openPolygon(polygon);
  if (points.length < 3) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (samePoint(a, b)) return false;
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < points.length; j++) {
      if (samePoint(a, points[j])) return false;
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsMeet(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return Math.abs(area) > EPSILON;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawPolygonMask(context, points, width, height) {
  context.fillStyle = '#fff';
  if (!points.length) {
    context.fillRect(0, 0, width, height);
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => context.lineTo(p.x, p.y));
  context.closePath();
  context.fill();
}

function drawBrush(context, stroke) {
  if (!stroke || !Array.isArray(stroke.points) || !Number.isFinite(stroke.radius) || stroke.radius <= 0) return;
  // Invalid points separate brush paths instead of connecting across missing data.
  const points = stroke.points;
  context.globalCompositeOperation = stroke.restore ? 'source-over' : 'destination-out';
  context.strokeStyle = context.fillStyle = '#fff';
  context.lineCap = context.lineJoin = 'round';
  context.lineWidth = stroke.radius * 2;
  let previous = null;
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      previous = null;
      continue;
    }
    if (previous) {
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(point.x, point.y, stroke.radius, 0, Math.PI * 2);
      context.fill();
    }
    previous = point;
  }
}

/**
 * image: decoded HTMLImageElement, ImageBitmap, or canvas.
 * polygon: native image pixel coordinates; [] retains the whole image.
 * strokes: ordered { points: [{x,y}], radius, restore } entries in image pixels.
 * Restoring reveals only original pixels inside the selected polygon.
 */
export function createCutout(image, polygon = [], strokes = []) {
  if (!image) throw new TypeError('원본 그림을 먼저 불러오세요.');
  const width = image.naturalWidth ?? image.videoWidth ?? image.width;
  const height = image.naturalHeight ?? image.videoHeight ?? image.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError('원본 그림을 읽지 못했습니다.');
  }
  if (!Array.isArray(polygon) || (polygon.length && !validatePolygon(polygon))) {
    throw new TypeError('가구의 테두리를 겹치지 않게 세 점 이상 찍어 주세요.');
  }
  if (!Array.isArray(strokes)) throw new TypeError('브러시 기록이 올바르지 않습니다.');
  const points = openPolygon(polygon);
  const baseMask = makeCanvas(width, height);
  drawPolygonMask(baseMask.getContext('2d'), points, width, height);
  const mask = makeCanvas(width, height);
  const maskContext = mask.getContext('2d');
  // Brush coverage starts opaque independently of the outline. Starting with
  // baseMask and applying it again would square its antialiased boundary alpha
  // whenever any brush stroke exists, changing untouched furniture edges.
  drawPolygonMask(maskContext, [], width, height);
  strokes.forEach(stroke => drawBrush(maskContext, stroke));
  // Apply the outline exactly once. Restore strokes can never reveal pixels
  // beyond it, while untouched partly transparent boundary pixels stay intact.
  if (points.length) {
    maskContext.globalCompositeOperation = 'destination-in';
    maskContext.drawImage(baseMask, 0, 0);
  }
  const result = makeCanvas(width, height);
  const context = result.getContext('2d');
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-over';
  return result;
}

/** Native-pixel bounds of all nontransparent pixels; null when fully erased. */
export function alphaBounds(canvas) {
  if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = y;
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
