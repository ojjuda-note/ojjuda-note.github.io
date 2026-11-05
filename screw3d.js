import { createPremiumModels } from './screw3d-premium-models.js?v=20261105-screwbox-sculpted-gates1';
import { applyClassicStyle } from './screw3d-classic-styles.js?v=20261105-classic1';
import { createSoftCubeGeometry } from './screw3d-soft-cubes.js?v=20261105-rounded-physics1';
import { createReplacementModels } from './screw3d-replacement-models.js?v=20261106-screwbox-eye-fix1';
import { applySculptedSkins } from './screw3d-sculpted-skins.js?v=20261105-screwbox-solid-depth2';
import { createScrewDepthRenderer } from './screw3d-depth-renderer.js?v=20261105-screwbox-solid-depth2';
// 3D 나사 풀기: 나무 블럭을 쌓아 만든 큐브·집·자동차·주전자를 손가락으로 돌려 가며 나사를 빼서 분해해요.
// 블럭끼리는 평평한 판으로 이어져 있고(판마다 블럭 하나에 나사 하나), 판이 하나도 안 남은 블럭은 떨어져요. 마지막 나사까지 빼면 아무것도 남지 않아요.
// 나사도 3D(머리 원기둥 + 십자 홈)로 그려서 다른 조각 뒤에 있으면 가려지고, 누를 땐 손가락 아래 가장 앞에 보이는 것을 골라요.
// 물건마다 '풀리는 순서'를 먼저 확인하고 그 순서대로 3개씩 같은 색을 칠해서, 막혀서 못 푸는 판이 없어요.
const W = 360, H = 540, CX = 180, CY = 392, SC = 150, F = 7;
const SCENE_TOP=232,SCENE_BOTTOM=510;
// The first twelve familiar screw colors stay unchanged. Later stages add
// eight unmistakable two-tone heads; each pair is unique even when rotated.
const COLORS = ['#F0679A', '#2FB99A', '#5B8DEF', '#F2B84B', '#9B7BF0', '#FF8A5B', '#8BC34A', '#A0714F', '#E4554B', '#1FB5C9', '#3A3F66', '#9AA0A6',
  '#F0679A', '#2FB99A', '#5B8DEF', '#9B7BF0', '#E4554B', '#A0714F', '#3A3F66', '#9AA0A6'];
const SECOND_COLORS = [null, null, null, null, null, null, null, null, null, null, null, null,
  '#3A3F66', '#FF8A5B', '#F2B84B', '#8BC34A', '#1FB5C9', '#2FB99A', '#F2B84B', '#F0679A'];
const BOX_Y = 52, BOX_W = 150, BOX_H = 64, BUF_Y = 138, BUF_N = 5;
const BOX_MAX = 4, BUF_MAX = BUF_N + 3, BUY_W = 50;   // 색상 상자는 최대 4개, 보관 칸은 최대 8칸 (살 수 있어요)
function boxLay(nb, buy) { const area = 328 - (buy ? BUY_W + 6 : 0), gap = 8, w = (area - gap * (nb - 1)) / nb, sp = Math.min(42, (w - 14) / 3); return { w, sp, x: i => 16 + i * (w + gap) }; }
const boxHole = (bi, k, nb = 2, buy = false) => { const L = boxLay(nb, buy); return { x: L.x(bi) + L.w / 2 + (k - 1) * L.sp, y: BOX_Y + 38 }; };
function bufLay(n, buy) { const x0 = 24, x1 = 336 - (buy ? BUY_W : 0), sp = Math.min(58, (x1 - x0 - 12) / n); return { sp, cx: (x0 + x1) / 2 }; }
const bufHole = (k, n = BUF_N, buy = false) => { const L = bufLay(n, buy); return { x: L.cx + (k - (n - 1) / 2) * L.sp, y: BUF_Y + 25 }; };
const ease = t => 1 - Math.pow(1 - t, 3);
// ---------- 벡터·행렬 ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const mm = (A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return r; };
const tr = M => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rx = a => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const ry = a => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rz = a => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
function axisRot(a, t) { const [x, y, z] = a, c = Math.cos(t), s = Math.sin(t), C = 1 - c; return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C]; }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }


function boxGeom(h) {
  const v = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * h[0], y * h[1], z * h[2]]);
  const f = [[[0, 1, 3, 2], [-1, 0, 0]], [[4, 6, 7, 5], [1, 0, 0]], [[0, 4, 5, 1], [0, -1, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[0, 2, 6, 4], [0, 0, -1]], [[1, 5, 7, 3], [0, 0, 1]]];
  return { verts: v, faces: f.map(([idx, n]) => ({ idx, n })), half: h };
}
function cylGeom(r, hh, seg = 14) {   // 세로(y) 원기둥
  const v = [], faces = [];
  for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * r, hh, Math.sin(a) * r]); v.push([Math.cos(a) * r, -hh, Math.sin(a) * r]); }
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg, a = (i + 0.5) / seg * Math.PI * 2; faces.push({ idx: [i * 2, j * 2, j * 2 + 1, i * 2 + 1], n: [Math.cos(a), 0, Math.sin(a)] }); }
  faces.push({ idx: [...Array(seg).keys()].map(i => i * 2).reverse(), n: [0, 1, 0] });
  faces.push({ idx: [...Array(seg).keys()].map(i => i * 2 + 1), n: [0, -1, 0] });
  return { verts: v, faces, half: [r, hh, r] };
}

function prismGeom(h) {   // 세모 지붕: 앞뒤(z)가 세모, 꼭대기가 y
  const [a, b, c] = h, v = [[-a, -b, c], [a, -b, c], [0, b, c], [-a, -b, -c], [a, -b, -c], [0, b, -c]];
  const sl = norm([2 * b, a, 0]), sr = norm([-2 * b, a, 0]);
  return { verts: v, faces: [{ idx: [0, 1, 2], n: [0, 0, 1] }, { idx: [5, 4, 3], n: [0, 0, -1] }, { idx: [3, 4, 1, 0], n: [0, -1, 0] }, { idx: [1, 4, 5, 2], n: [-sr[0], sr[1], 0] }, { idx: [3, 0, 2, 5], n: [-sl[0], sl[1], 0] }], half: h };
}
// ---------- 블럭·판·나사 ----------
const GRID = 0.42, T = 0.05;   // 블럭 한 칸, 판 두께
const WOOD = ['#F4C28F', '#F9C9D8', '#C6E6FF', '#FFE3A6', '#CDEFD9', '#E0D4FF', '#E9B07A', '#FFD3C4'];
const PLATE = '#D9DEEE';
function el(kind, geom, c, R, color, o = {}) { return { kind, geom, c, R: R || I3, color, state: 'on', hinge: null, fall: null, ...o }; }
function cube(x, y, z, color) { return el('block', SOFT_CUBE, [(x + 0.5) * GRID, (y + 0.5) * GRID, (z + 0.5) * GRID], I3, color, { cell: [x, y, z], material:'paint' }); }
function frame(n, u) { const w = cross(u, n); return [u[0], n[0], w[0], u[1], n[1], w[1], u[2], n[2], w[2]]; }   // 로컬 x→u, y→n(바깥), z→w
function mkScrew(M, thru, into, p, a) { const s = { p, a, thru, into, color: 0, state: 'in', t: 0 }; M.screws.push(s); return s; }
const face = (b, n) => add(b.c, mul(n, GRID / 2));
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CUBE_FACE_DIRS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]; // boxGeom face order
const SOFT_CUBE = createSoftCubeGeometry(GRID / 2, true);
const SOFT_CUBE_FAST = createSoftCubeGeometry(GRID / 2, false);
const FABRIC_WASHER = cylGeom(.086, .014, 10);
const SOFT_RADIUS = GRID / 2 * 0.29;
// ---------- 새 블럭 모양: 피자 조각(부채꼴), 원뿔, 곡선 튜브(여러 마디) ----------
function wedgeGeom(r, hh, a0, a1, seg = 6) {
  const v = [[0, hh, 0], [0, -hh, 0]];
  for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; v.push([Math.cos(a) * r, hh, Math.sin(a) * r], [Math.cos(a) * r, -hh, Math.sin(a) * r]); }
  const top = [], bot = []; for (let i = 0; i <= seg; i++) { top.push(2 + 2 * i); bot.push(3 + 2 * i); }
  const faces = [{ idx: [0, ...top.reverse()], n: [0, 1, 0] }, { idx: [1, ...bot], n: [0, -1, 0] },
    { idx: [0, 1, 3, 2], n: [Math.sin(a0), 0, -Math.cos(a0)] }, { idx: [0, 2 + 2 * seg, 3 + 2 * seg, 1], n: [-Math.sin(a1), 0, Math.cos(a1)] }];
  for (let i = 0; i < seg; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / seg; faces.push({ idx: [2 + 2 * i, 4 + 2 * i, 5 + 2 * i, 3 + 2 * i], n: [Math.cos(a), 0, Math.sin(a)] }); }
  const xs = v.map(q => q[0]), zs = v.map(q => q[2]);
  return { verts: v, faces, half: [(Math.max(...xs) - Math.min(...xs)) / 2, hh, (Math.max(...zs) - Math.min(...zs)) / 2], cen: [(Math.max(...xs) + Math.min(...xs)) / 2, 0, (Math.max(...zs) + Math.min(...zs)) / 2] };
}
function coneGeom(r, hh, seg = 14) {
  const v = [[0, hh, 0]]; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * r, -hh, Math.sin(a) * r]); }
  const faces = []; for (let i = 0; i < seg; i++) { const a = (i + 0.5) / seg * Math.PI * 2; faces.push({ idx: [0, 1 + ((i + 1) % seg), 1 + i], n: norm([Math.cos(a) * 2 * hh, r, Math.sin(a) * 2 * hh]) }); }
  faces.push({ idx: [...Array(seg).keys()].map(i => 1 + i), n: [0, -1, 0] });
  return { verts: v, faces, half: [r, hh, r] };
}
function archParts(R, rt, seg, colors) {   // 반원 곡선 튜브: 가운데(0,0,0)에서 왼쪽(-R,0)→꼭대기(0,R)→오른쪽(R,0), 마디마다 원기둥
  const parts = [];
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI - Math.PI * i / seg, a1 = Math.PI - Math.PI * (i + 1) / seg, p0 = [Math.cos(a0) * R, Math.sin(a0) * R, 0], p1 = [Math.cos(a1) * R, Math.sin(a1) * R, 0];
    const t = norm(sub(p1, p0)), len = Math.hypot(...sub(p1, p0));
    parts.push({ geom: cylGeom(rt, len / 2 + rt * 0.35, 10), pc: mul(add(p0, p1), 0.5), pR: frame(t, [0, 0, 1]), color: colors[i % colors.length] });
  }
  return parts;
}
function boundOf(parts) {   // 여러 조각의 전체 상자
  const pts = parts.flatMap(p => p.geom.verts.map(v => add(p.pc, mv(p.pR, v)))), lo = [0, 1, 2].map(i => Math.min(...pts.map(q => q[i]))), hi = [0, 1, 2].map(i => Math.max(...pts.map(q => q[i])));
  return { verts: [], faces: [], half: mul(sub(hi, lo), 0.5), cen: mul(add(hi, lo), 0.5) };
}
// ---------- 판 놓기 규칙 ----------
// 판은 모두 면에 딱 붙어요(떠 있는 판 없음). 같은 면에서 판끼리 겹치지 않고, 판은 다른 나사(판 밑으로 지나가는 나사대 포함)를 덮지 않아요. 나사 머리끼리도 떨어져 있어요.
// 블럭 밑(쌓인 블럭 사이 면)에는 판과 나사가 깔려도 돼요: 위 블럭을 떼어내야 보이고 뺄 수 있어요.
const GAP = 0.14, MARG = 0.012;
const samePlane = (n1, c1, n2, c2) => dot(n1, n2) > 0.99 && Math.abs(dot(sub(c1, c2), n1)) < 0.02;
function rectOverlap(A, B) { const d = sub(B.c, A.c); for (const L of [A.u, A.v, B.u, B.v]) { const ra = A.hu * Math.abs(dot(A.u, L)) + A.hv * Math.abs(dot(A.v, L)), rb = B.hu * Math.abs(dot(B.u, L)) + B.hv * Math.abs(dot(B.v, L)); if (Math.abs(dot(d, L)) >= ra + rb + MARG) return false; } return true; }
function inRect(R, q, pad) { const d = sub(q, R.c); return Math.abs(dot(d, R.u)) <= R.hu + pad && Math.abs(dot(d, R.v)) <= R.hv + pad; }
const pinsOf = M => M.screws.map(z => ({ p: z.p, a: z.a })).concat(M.hold.map(h => ({ p: h.p, a: h.n })));
// 판이 덮으면 안 되는 나사: 같은 방향이고 나사대가 지나가는 높이(0.3)까지 (한 칸 위층 나사는 상관없어요)
function rectFree(M, R) {
  for (const Q of M.rects) if (samePlane(R.n, R.c, Q.n, Q.c) && rectOverlap(R, Q)) return false;
  for (const s of pinsOf(M)) { if (dot(s.a, R.n) < 0.99) continue; const up = dot(sub(s.p, R.c), R.n); if (up < -0.01 || up > 0.3) continue; if (inRect(R, sub(s.p, mul(R.n, up)), HEAD_R + 0.01)) return false; }
  return true;
}
function spotFree(M, q, n, extra = []) {
  for (const s of pinsOf(M).concat(extra.map(p => ({ p, a: n })))) {
    if (dot(s.a, n) < 0.99) continue; const d = sub(s.p, q), al = dot(d, n); if (Math.abs(al) > 0.35) continue;
    const ip = sub(d, mul(n, al)); if (Math.hypot(ip[0], ip[1], ip[2]) < GAP) return false;
  }
  return true;
}
const rect = (c, n, u, hu, hv) => ({ c, n, u, v: cross(u, n), hu, hv });
function place(M, R, color, ps, o = {}) {   // 판 하나: 면 위 네모 R, 나사 자리 ps([{q, into}]). 겹치거나 덮으면 안 놓아요
  if (!rectFree(M, R)) return null;
  const got = []; for (const pn of ps) { if (!inRect(R, pn.q, -HEAD_R + 0.002) || !spotFree(M, pn.q, R.n, got.map(g => g.q))) return null; got.push(pn); }
  const P = el('plate', boxGeom([R.hu, T / 2, R.hv]), add(R.c, mul(R.n, T / 2)), frame(R.n, R.u), color, { flat: true, ...o }); M.els.push(P); M.rects.push(R);
  if (R.hu >= 0.14) P.parts = [-1, 1].map(sg => ({ geom: boxGeom([R.hu / 2, T / 2, R.hv]), pc: [sg * R.hu / 2, 0, 0], pR: I3 }));   // 긴 판은 두 쪽으로 그려요
  for (const pn of got) mkScrew(M, P, pn.into, add(pn.q, mul(R.n, T)), R.n);
  return P;
}
function pin(M, thru, into, p, a) {
  // A sculpted ear/tail can extend past the old primitive's nominal radius.
  // Seat its fastener on the ACTUAL attached mesh before solving the puzzle,
  // so drawing, picking and the extraction collision all use the same point.
  // Never draw a buried fastener over its own opaque part as a workaround.
  if (thru.faceFeature) p = featureFastenerPoint(thru, p, a);
  M.hold.push({ p, n: a }); return mkScrew(M, thru, into, p, a);
}   // 조각을 뚫고 박는 나사(뚜껑·원기둥 등)
function bridge(M, A, B, n) {   // 이웃한 두 블럭을 같은 면 위의 판으로 (판마다 블럭 하나에 나사 하나)
  const u = norm(sub(B.c, A.c)), v = cross(u, n), fa = face(A, n), fb = face(B, n), mid = mul(add(fa, fb), 0.5);
  for (const o of [0, 0.1, -0.1]) for (const t of [0.07, 0.12]) {
    const P = place(M, rect(add(mid, mul(v, o)), n, u, GRID / 2 + 0.01, 0.075), PLATE, [{ q: add(add(fa, mul(u, t)), mul(v, o)), into: A }, { q: add(sub(fb, mul(u, t)), mul(v, o)), into: B }]);
    if (P) return P;
  }
  return null;
}
function finish(M, spots, minS = 0) {   // 나사 수를 3의 배수로(그리고 minS 이상, 작은 판), 모든 조각이 나사로 고정됐는지 확인, 가운데로
  for (let tries = 0; (M.screws.length % 3 || M.screws.length < minS) && tries < 90 && spots.length; tries++) {
    const s = spots[Math.floor(Math.random() * spots.length)];
    place(M, rect(s.q, s.n, s.u, 0.07, 0.07), '#B9A6F0', [{ q: s.q, into: s.into }], { badge: true });
  }
  if (M.screws.length % 3) throw new Error('나사 수를 못 맞췄어요');
  if (M.els.some(e => !M.screws.some(z => z.thru === e || z.into === e))) throw new Error('고정 안 된 조각');
  const all = M.els.map(e => add(e.c, mv(e.R, e.geom.cen || [0, 0, 0]))), lo = [0, 1, 2].map(i => Math.min(...all.map(c => c[i]))), hi = [0, 1, 2].map(i => Math.max(...all.map(c => c[i]))), mid = mul(add(lo, hi), 0.5);
  M.els.forEach(e => { e.c = sub(e.c, mid); }); M.screws.forEach(z => { z.p = sub(z.p, mid); }); M.rects.forEach(r => { r.c = sub(r.c, mid); }); M.hold.forEach(h => { h.p = sub(h.p, mid); });
  M.mid = add(M.mid || [0, 0, 0], mid);
  return M;
}
// 숨은 판은 블럭 윗면(위 블럭이 덮는 곳)에만 붙여요: 위에서부터 떼어내며 찾아가요 (아랫면에도 붙이면 서로 막는 고리가 생겨요)
// 블럭 목록으로 물건 만들기: pre(먼저 놓을 것) → 이웃을 무작위로 판으로 이어 연결(드러난 면끼리, 또는 둘 다 블럭 밑에 깔린 면끼리) → extra → 마무리
function assemble(name, blocks, { pre, extra, reserved = [], cover = [], els = [], minS = 0, noUnder = null } = {}) {   // noUnder(x,y,z): 이 칸에는 윗면 숨은 판을 안 붙여요
  const M = { name, els: [...blocks, ...els], screws: [], rects: [], hold: [] }, at = new Map(blocks.filter(b => b.cell).map(b => [b.cell.join(','), b]));
  const rs = new Set(reserved.map(c => c.join(','))), cv = new Set(cover.map(c => c.join(',')));
  const kind = (x, y, z) => { const k = [x, y, z].join(','); return rs.has(k) ? 'res' : at.has(k) || cv.has(k) ? 'under' : 'open'; };
  if (pre) pre(M);
  const cands = [];
  for (const A of blocks) { if (!A.cell) continue; const [x, y, z] = A.cell;
    for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const B = at.get([x + d[0], y + d[1], z + d[2]].join(',')); if (!B) continue;
      for (const n of DIRS) { if (dot(n, d) !== 0) continue; const ka = kind(x + n[0], y + n[1], z + n[2]), kb = kind(x + d[0] + n[0], y + d[1] + n[1], z + d[2] + n[2]); if (ka === 'res' || ka !== kb) continue; if (ka === 'under' && (n[1] !== 1 || (noUnder && (noUnder(x, y, z) || noUnder(x + d[0], y + d[1], z + d[2]))))) continue; cands.push([A, B, n, ka]); } } }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  cands.forEach(c => { c.key = (c[3] === 'under' ? 0 : 1) + Math.random() * 1.3; }); cands.sort((a, b) => a.key - b.key);   // 블럭 사이(숨은 자리)를 먼저: 숨은 판과 나사를 찾는 재미
  const root = new Map(blocks.map(b => [b, b])), find = b => (root.get(b) === b ? b : find(root.get(b))), spare = [];
  for (const cnd of cands) { const [A, B, n] = cnd, ra = find(A), rb = find(B); if (ra !== rb) { if (bridge(M, A, B, n)) root.set(ra, rb); } else spare.push(cnd); }
  const cells = blocks.filter(b => b.cell);   // 모든 칸이 한 덩어리일 필요는 없어요: 안쪽 칸끼리 숨은 판으로 박혀 있으면 돼요 (모든 블럭에 나사가 있는지는 마무리에서 확인)
  let more = 2 + Math.floor(Math.random() * 2); for (const [A, B, n, kd] of spare) { if (more <= 0) break; if (kd === 'under' && bridge(M, A, B, n)) more--; }   // 숨은 판을 몇 개 더
  if (extra) extra(M);
  let k = 0; while (M.screws.length % 3 === 2 && k < spare.length) { const [A, B, n] = spare[k++]; bridge(M, A, B, n); }
  const spots = []; for (const A of cells) { const [x, y, z] = A.cell; for (const n of DIRS) if (kind(x + n[0], y + n[1], z + n[2]) === 'open') { const u = Math.abs(n[1]) ? [1, 0, 0] : [0, 1, 0], v = cross(u, n);
    for (const a of [-0.12, 0, 0.12]) for (const b2 of [-0.12, 0, 0.12]) spots.push({ q: add(face(A, n), add(mul(u, a), mul(v, b2))), n, u, into: A }); } }
  // Large sculpted models may have an exposed voxel that the spanning plates miss.
  // Give it its own fastener so it can always be dismantled, rather than trapping it.
  for (const A of cells) {
    if (M.screws.some(z => z.thru === A || z.into === A)) continue;
    for (const p of spots) {
      if (p.into !== A) continue;
      if (place(M, rect(p.q, p.n, p.u, 0.07, 0.07), PLATE,
        [{ q: p.q, into: A }], { badge: true })) break;
    }
  }
  // Sometimes a fully enclosed pedestal cube has no exposed position for a
  // normal connecting plate. Secure it through its top face into the block
  // underneath; the screw becomes reachable as the upper layer is removed.
  // The standard level solver still rejects any cyclic or blocked layout.
  for (const A of cells) {
    if (M.screws.some(z => z.thru === A || z.into === A)) continue;
    const [x, y, z] = A.cell, B = at.get([x, y - 1, z].join(','));
    if (!B) continue;
    for (const [dx, dz] of [[0, 0], [-0.11, -0.11], [0.11, 0.11], [-0.11, 0.11], [0.11, -0.11]]) {
      const q = add(face(A, [0, 1, 0]), [dx, 0, dz]);
      if (!spotFree(M, q, [0, 1, 0])) continue;
      pin(M, A, B, q, [0, 1, 0]);
      break;
    }
  }
  return finish(M, spots, minS);
}
function modelTeapot(t = 0) {   // 주전자: 몸통이 넓어져요(2→3칸)
  const nx = 2 + Math.min(t, 1), b = []; for (let x = 0; x < nx; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) b.push(cube(x, y, z, y ? '#C6E6FF' : '#9FD8F5'));
  const at = (x, y, z) => b.find(q => q.cell[0] === x && q.cell[1] === y && q.cell[2] === z), Y = 2 * GRID, cx = nx / 2 * GRID;
  const cell = v => Math.min(nx - 1, Math.max(0, Math.floor(v / GRID)));
  return assemble('주전자', b, { pre: M => {
    const lid = el('wheel', cylGeom(0.3, 0.05, 16), [cx, Y + 0.05, GRID], I3, '#F9C9D8'); M.els.push(lid);
    M.rects.push(rect([cx, Y, GRID], [0, 1, 0], [1, 0, 0], 0.3, 0.3));
    for (const [dx, dz] of [[-0.16, -0.16], [0.16, 0.16]]) pin(M, lid, at(cell(cx + dx), 1, dz < 0 ? 0 : 1), [cx + dx, Y + 0.1, GRID + dz], [0, 1, 0]);
    const knob = el('wheel', cylGeom(0.08, 0.06, 10), [cx, Y + 0.16, GRID], I3, '#F0679A'); M.els.push(knob);
    mkScrew(M, knob, lid, [cx, Y + 0.22, GRID], [0, 1, 0]);
    const spout = el('plate', boxGeom([0.15, 0.055, 0.075]), [nx * GRID + 0.14, GRID * 0.95, GRID * 1.3], rz(0.3), '#F2B84B'); M.els.push(spout);
    mkScrew(M, spout, at(nx - 1, 0, 1), add(spout.c, mv(spout.R, [0.15, 0, 0])), mv(spout.R, [1, 0, 0]));
    const handle = el('plate', boxGeom([0.07, 0.36, 0.15]), [-0.07, GRID, GRID], I3, '#F0679A'); M.els.push(handle);
    mkScrew(M, handle, at(0, 0, 0), [-0.14, GRID * 0.55, GRID * 0.75], [-1, 0, 0]); mkScrew(M, handle, at(0, 1, 1), [-0.14, GRID * 1.45, GRID * 1.25], [-1, 0, 0]);
  }, reserved: [[-1, 0, 0], [-1, 1, 0], [-1, 0, 1], [-1, 1, 1], [nx, 0, 1]] });
}
function modelPizza(t = 0) {   // 피자: 조각이 늘고(6→10), 2층 케이크가 되면 층 사이에 숨은 판
  const N = 6 + 2 * Math.min(t, 2), LY = t >= 2 ? 2 : 1, R0 = 0.6 + 0.05 * Math.min(t, 2), HH = 0.08, up = [0, 1, 0], dn = [0, -1, 0];
  const M = { name: LY > 1 ? '2층 피자' : '피자', els: [], screws: [], rects: [], hold: [] };
  const sl = [], pol = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let li = 0; li < LY; li++) { sl.push([]); for (let k = 0; k < N; k++) { const a0 = k * Math.PI * 2 / N, a1 = (k + 1) * Math.PI * 2 / N;
    const E = el('block', wedgeGeom(R0, HH, a0, a1), [0, li * 2 * HH, 0], I3, li ? (k % 2 ? '#F9C9D8' : '#FFD3E0') : (k % 2 ? '#F2B84B' : '#F7C873')); sl[li].push(E); M.els.push(E); } }
  const seams = []; for (let li = 0; li < LY; li++) for (let k = 0; k < N; k++) { if (li === LY - 1 || true) { seams.push([li, k, up]); } if (li === 0) seams.push([li, k, dn]); }
  for (let i = seams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seams[i], seams[j]] = [seams[j], seams[i]]; }
  seams.sort((a, b) => (a[0] < LY - 1 && a[2] === up ? 0 : 1) + Math.random() - (b[0] < LY - 1 && b[2] === up ? 0 : 1) - Math.random());   // 층 사이(숨은 자리)를 먼저
  const pinned = new Set(); let links = 0;
  for (const [li, k, n] of seams) {   // 조각 k와 k+1 사이 틈을 가로지르는 판
    if (links >= N + 1 && sl.flat().every(E => pinned.has(E))) break;
    const th = (k + 1) * Math.PI * 2 / N, A = sl[li][k], B = sl[li][(k + 1) % N], u = [-Math.sin(th), 0, Math.cos(th)], y = li * 2 * HH + n[1] * HH;
    for (const r of [0.3, 0.44, 0.2]) { const c = pol(r, th, y); if (place(M, rect(c, n, u, 0.16, 0.07), PLATE, [{ q: sub(c, mul(u, 0.09)), into: A }, { q: add(c, mul(u, 0.09)), into: B }])) { pinned.add(A); pinned.add(B); links++; break; } }
  }
  let tops = 0; const topY = (LY - 1) * 2 * HH + HH, TL = sl[LY - 1];
  for (const k of [...Array(N).keys()].sort(() => Math.random() - 0.5)) {   // 토핑(원형 블럭)
    if (tops >= 3 + Math.min(t, 2)) break; let done = false;
    for (const r of [0.47, 0.4, 0.32, 0.25]) for (const da of [0, 0.22, -0.22]) { if (done) break; const a = (k + 0.5) * Math.PI * 2 / N + da * (0.3 / r); if (a <= k * Math.PI * 2 / N + 0.12 || a >= (k + 1) * Math.PI * 2 / N - 0.12) continue;
      const f = pol(r, a, topY), R = rect(f, up, [1, 0, 0], 0.085, 0.085), q = add(f, [0, 0.06, 0]);
      if (!rectFree(M, R) || !spotFree(M, q, up)) continue;
      const top = el('wheel', cylGeom(0.075, 0.03, 12), add(f, [0, 0.03, 0]), I3, ['#F0679A', '#2FB99A', '#9B7BF0', '#FF8A5B'][tops % 4]); M.els.push(top); M.rects.push(R); pin(M, top, TL[k], q, up); tops++; done = true; }
  }
  const spots = []; for (let k = 0; k < N; k++) { const a = (k + 0.5) * Math.PI * 2 / N; for (const r of [0.22, 0.36, 0.5]) { spots.push({ q: pol(r, a, topY), n: up, u: [1, 0, 0], into: TL[k] }); spots.push({ q: pol(r, a, -HH), n: dn, u: [1, 0, 0], into: sl[0][k] }); } }
  return finish(M, spots);
}
function modelBridge(t = 0) {   // 무지개 다리: 더 길고(4→6칸) 기둥이 높게(1→3층)
  const Lb = 4 + Math.min(t, 2), Ph = 1 + Math.min(t, 2), b = []; for (let x = 0; x < Lb; x++) b.push(cube(x, 0, 0, '#CDEFD9'));
  const pil = []; for (let y = 1; y <= Ph; y++) { const a = cube(0, y, 0, '#F4C28F'), c = cube(Lb - 1, y, 0, '#F4C28F'); b.push(a, c); if (y === Ph) pil.push(a, c); }
  const R = (Lb - 1) / 2 * GRID, rt = 0.075, Yb = (Ph + 1) * GRID, fl = 0.03;
  const arch = el('arch', null, [Lb / 2 * GRID, Yb + 2 * fl, 0.5 * GRID], I3, '#F0679A');
  const parts = archParts(R, rt, 10 + 2 * Math.min(t, 2), ['#F0679A', '#FF8A5B', '#F2B84B', '#2FB99A', '#5B8DEF', '#9B7BF0']);
  for (const x of [-R, R]) parts.push({ geom: boxGeom([0.21, fl, 0.225]), pc: [x, -fl, 0], pR: I3, color: '#8E93B8' });
  arch.parts = parts; arch.geom = boundOf(parts);
  const ball = el('wheel', cylGeom(0.09, 0.05, 12), [Lb / 2 * GRID, Yb + 2 * fl + R + rt + 0.05, 0.5 * GRID], I3, '#FFD66B');
  return assemble('무지개 다리', b, { els: [arch, ball], pre: M => {
    for (const P of pil) { const tp = face(P, up3); M.rects.push(rect(tp, up3, [1, 0, 0], 0.21, 0.225)); for (const dz of [-0.16, 0.16]) pin(M, arch, P, add(tp, [0, 2 * fl, dz]), up3); }
    pin(M, ball, arch, add(ball.c, [0, 0.05, 0]), up3);
  } });
}
const up3 = [0, 1, 0];
function modelLighthouse(t = 0) {   // 등대: 원형 블럭을 더 높이(2→4단) 쌓아요. 아래 원기둥 나사는 위 원기둥이 덮어요
  const b = []; for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) b.push(cube(x, 0, z, '#C6E6FF'));
  const nC = 2 + Math.min(t, 2), cyls = [];
  for (let k = 0; k < nC; k++) cyls.push(el('wheel', cylGeom(0.32 - k * 0.025, GRID / 2, 16), [GRID, GRID * (k + 1.5), GRID], I3, k % 2 ? '#FFF6EC' : '#F0679A', { round: true }));
  const topY = GRID * (nC + 1), lamp = el('wheel', cylGeom(0.22, 0.11, 16), [GRID, topY + 0.11, GRID], I3, '#FFD66B');
  const cone = el('wheel', coneGeom(0.3, 0.14), [GRID, topY + 0.22 + 0.14, GRID], I3, '#3A3F66'), ball = el('wheel', cylGeom(0.05, 0.04, 10), [GRID, topY + 0.22 + 0.28 + 0.04, GRID], I3, '#F0679A');
  const at = (x, z) => b.find(q => q.cell[0] === x && q.cell[2] === z);
  return assemble('등대', b, { els: [...cyls, lamp, cone, ball], pre: M => {
    M.rects.push(rect([GRID, GRID, GRID], up3, [1, 0, 0], 0.33, 0.33));
    const cap = (E, into, d) => { const y = E.c[1] + E.geom.half[1]; for (const [dx, dz, B] of into) pin(M, E, B, [GRID + dx * d, y, GRID + dz * d], up3); };
    cap(cyls[0], [[-1, -1, at(0, 0)], [1, 1, at(1, 1)]], 0.13);
    for (let k = 1; k < nC; k++) cap(cyls[k], k % 2 ? [[1, 0, cyls[k - 1]], [-1, 0, cyls[k - 1]]] : [[-1, -1, cyls[k - 1]], [1, 1, cyls[k - 1]]], k % 2 ? 0.19 : 0.13);   // 층마다 엇갈려요
    cap(lamp, [[0, -1, cyls[nC - 1]], [0, 1, cyls[nC - 1]]], 0.1);
    for (const a of [0.8, 0.8 + Math.PI]) { const r = 0.3 * 0.55, y = cone.c[1] - 0.14 + 0.28 * 0.45, n = norm([Math.cos(a) * 0.28, 0.3, Math.sin(a) * 0.28]); pin(M, cone, lamp, [GRID + Math.cos(a) * r, y, GRID + Math.sin(a) * r], n); }
    pin(M, ball, cone, add(ball.c, [0, 0.04, 0]), up3);
  } });
}
// ---------- 더 많은 블럭 모양: 원뿔대(위아래 굵기가 다른 원기둥), 꺾인 튜브 ----------
function frustumGeom(r0, r1, hh, seg = 16) {   // 아래 반지름 r0, 위 반지름 r1
  const v = []; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * r1, hh, Math.sin(a) * r1]); v.push([Math.cos(a) * r0, -hh, Math.sin(a) * r0]); }
  const faces = [], sl = (r0 - r1) / (2 * hh);
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg, a = (i + 0.5) / seg * Math.PI * 2; faces.push({ idx: [i * 2, j * 2, j * 2 + 1, i * 2 + 1], n: norm([Math.cos(a), sl, Math.sin(a)]) }); }
  faces.push({ idx: [...Array(seg).keys()].map(i => i * 2).reverse(), n: [0, 1, 0] }); faces.push({ idx: [...Array(seg).keys()].map(i => i * 2 + 1), n: [0, -1, 0] });
  return { verts: v, faces, half: [Math.max(r0, r1), hh, Math.max(r0, r1)] };
}
function tubeParts(pts, rt, colors) {   // 점들을 잇는 꺾인 튜브(마디마다 원기둥)
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i], p1 = pts[i + 1], t = norm(sub(p1, p0)), len = Math.hypot(...sub(p1, p0)), side = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    parts.push({ geom: cylGeom(rt, len / 2 + rt * 0.3, 10), pc: mul(add(p0, p1), 0.5), pR: frame(t, norm(cross(side, t))), color: colors[i % colors.length] }); }
  return parts;
}
const Yax = [0, 1, 0];
const newM = name => ({ name, els: [], screws: [], rects: [], hold: [] });
const cylE = (r, hh, c, color, R = I3) => el('wheel', cylGeom(r, hh, 16), c, R, color);
const boxE = (h, c, color, R = I3) => el('block', boxGeom(h), c, R, color);
const topOfE = E => E.c[1] + E.geom.half[1], botOfE = E => E.c[1] - E.geom.half[1];
const ring = (c, y, r, n, a0 = 0) => [...Array(n).keys()].map(i => { const a = a0 + i / n * Math.PI * 2; return [c[0] + Math.cos(a) * r, y, c[2] + Math.sin(a) * r]; });
function addAll(M, ...els) { M.els.push(...els); }
function pins(M, thru, into, pts, a) { for (const p of pts) pin(M, thru, into, p, a); }
function fixCount(M, extras) {   // 나사 수를 3의 배수로: 여분 자리에 나사를 더해요
  for (const x of extras) { if (M.screws.length % 3 === 0) break; if (spotFree(M, x.p, x.a)) pin(M, x.thru, x.into, x.p, x.a); }
  if (M.screws.length % 3) throw new Error('나사 수를 못 맞췄어요');
}
const ex = (thru, into, pts, a) => pts.map(p => ({ thru, into, p, a }));
// 원기둥 윗면(또는 아랫면) 고리 위 나사 자리
const capRing = (E, r, n, a0 = 0, bottom = false) => ring(E.c, bottom ? botOfE(E) : topOfE(E), r, n, a0);

function modelTeapotRound(t = 0) {   // 둥근 주전자: 받침·몸통(아래·위)·뚜껑·꼭지 + 휘어진 주둥이 + 둥근 손잡이
  const M = newM('주전자'), s = 1 + 0.08 * Math.min(t, 2);
  const base = cylE(0.46 * s, 0.045, [0, 0.045, 0], '#8FA7D9'), low = cylE(0.62 * s, 0.22, [0, 0.31, 0], '#9FD8F5'), up = cylE(0.5 * s, 0.12, [0, 0.65, 0], '#C6E6FF');
  const lid = cylE(0.34 * s, 0.045, [0, 0.815, 0], '#F9C9D8'), knob = cylE(0.085, 0.06, [0, 0.92, 0], '#F0679A');
  const spout = el('arch', null, [0, 0, 0], I3, '#F2B84B'); spout.parts = tubeParts([[0.58 * s, 0.28, 0], [0.8 * s, 0.4, 0], [0.93 * s, 0.56, 0], [1.0 * s, 0.7, 0]], 0.065, ['#F2B84B', '#F7C873']); spout.geom = boundOf(spout.parts);
  const handle = el('arch', null, [-0.64 * s, 0.4, 0], I3, '#F0679A'); handle.parts = archParts(0.2, 0.05, 8, ['#F0679A', '#F9A8C4']).map(p => ({ ...p, pc: mv(rz(Math.PI / 2), p.pc), pR: mm(rz(Math.PI / 2), p.pR) })); handle.geom = boundOf(handle.parts);
  addAll(M, base, low, up, lid, knob, spout, handle);
  pins(M, base, low, ring(base.c, botOfE(base), 0.26 * s, 3, 0.4), [0, -1, 0]);   // 받침 밑면(뒤집어야 보여요)
  pins(M, low, base, capRing(low, 0.56 * s, 3, 0.9), Yax);                       // 아래 몸통 윗면 고리
  pins(M, up, low, capRing(up, 0.42 * s, 3, 0.2), Yax);
  pins(M, lid, up, capRing(lid, 0.22 * s, 2, 1.2), Yax);
  pin(M, knob, lid, [0, topOfE(knob), 0], Yax);
  const sp = spout.parts, lastP = sp[sp.length - 1], tipT = mv(lastP.pR, [0, 1, 0]); pin(M, spout, low, add(lastP.pc, mul(tipT, lastP.geom.half[1])), tipT);
  const mp = sp[1], nrm = norm(cross([0, 0, 1], mv(mp.pR, [0, 1, 0]))); pin(M, spout, low, add(mp.pc, mul(nrm, 0.065)), nrm);
  const hp = handle.parts[Math.floor(handle.parts.length / 2)]; pin(M, handle, low, add(add(handle.c, hp.pc), [-0.05, 0, 0]), [-1, 0, 0]);
  fixCount(M, [...ex(low, base, capRing(low, 0.56 * s, 6, 0.3), Yax), ...ex(up, low, capRing(up, 0.42 * s, 6, 0.7), Yax), ...ex(base, low, ring(base.c, botOfE(base), 0.26 * s, 6, 1.5), [0, -1, 0])]);
  return finish(M, []);
}
function modelHat(t = 0) {   // 모자: 챙·리본 띠·몸통·꼭대기 꽃·나비 리본. 챙 밑면에 숨은 나사가 있어요
  const M = newM('모자'), s = 1 + 0.08 * Math.min(t, 2), col = ['#3A3F66', '#9B7BF0', '#2FB99A'][t % 3];
  const brim = cylE(0.66 * s, 0.035, [0, 0.035, 0], col), band = cylE(0.35 * s, 0.06, [0, 0.13, 0], '#F0679A'), crown = cylE(0.34 * s, 0.26, [0, 0.45, 0], col);
  const flower = cylE(0.09, 0.03, [0, 0.74, 0], '#FFD66B'), bow = boxE([0.05, 0.05, 0.1], [0, 0.13, 0.35 * s + 0.05], '#F9C9D8');
  addAll(M, brim, band, crown, flower, bow);
  pins(M, brim, band, ring(brim.c, 0, 0.2 * s, 3, 0.3), [0, -1, 0]);              // 챙 밑면: 뒤집어야 보여요
  pins(M, crown, band, capRing(crown, 0.22 * s, 3, 0.6), Yax);
  pin(M, flower, crown, [0, topOfE(flower), 0], Yax);
  pin(M, bow, band, [0, 0.13, bow.c[2] + 0.05], [0, 0, 1]);
  fixCount(M, [...ex(crown, band, capRing(crown, 0.22 * s, 6, 1.1), Yax), ...ex(brim, band, ring(brim.c, 0, 0.2 * s, 6, 1.6), [0, -1, 0])]);
  return finish(M, []);
}
function modelFan(t = 0) {   // 선풍기: 받침·기둥·모터·날개·가운데 캡·버튼
  const M = newM('선풍기'), nb = 3 + Math.min(t, 2);
  const base = cylE(0.42, 0.05, [0, 0.05, 0], '#C6E6FF'), collar = cylE(0.13, 0.05, [0, 0.15, 0], '#8FA7D9'), pole = boxE([0.05, 0.42, 0.05], [0, 0.62, 0], '#E0D4FF');
  const motor = cylE(0.17, 0.15, [0, 1.2, -0.02], '#8FA7D9', rx(Math.PI / 2)), hub = cylE(0.08, 0.04, [0, 1.2, 0.17], '#F0679A', rx(Math.PI / 2));
  addAll(M, base, collar, pole, motor, hub);
  pins(M, collar, base, capRing(collar, 0.0, 1), Yax);
  const bl = []; for (let i = 0; i < nb; i++) { const a = Math.PI / 2 + i / nb * Math.PI * 2, R = rz(a - Math.PI / 2), d = [Math.cos(a), Math.sin(a), 0];
    const B = el('plate', boxGeom([0.1, 0.19, 0.012]), add([0, 1.2, 0.2], mul(d, 0.27)), R, ['#9FD8F5', '#CDEFD9', '#FFE3A6', '#F9C9D8', '#E0D4FF'][i % 5]); bl.push(B); M.els.push(B);
    pin(M, B, hub, add(add([0, 1.2, 0.2], mul(d, 0.17)), [0, 0, 0.012]), [0, 0, 1]); }
  pin(M, hub, motor, [0, 1.2, 0.21], [0, 0, 1]);
  pin(M, motor, pole, [0, 1.37, -0.02], Yax); pin(M, motor, pole, [0, 1.2, -0.17], [0, 0, -1]);
  pin(M, pole, collar, [0, 0.3, 0.05], [0, 0, 1]); pin(M, pole, collar, [0, 0.3, -0.05], [0, 0, -1]);
  for (const [x, col] of [[-0.24, '#F0679A'], [0.24, '#2FB99A']]) { const k = cylE(0.06, 0.02, [x, 0.12, 0.2], col); M.els.push(k); pin(M, k, base, [x, 0.14, 0.2], Yax); }
  fixCount(M, [...ex(base, collar, ring(base.c, 0, 0.3, 6, 0.5), [0, -1, 0]), ...ex(motor, pole, [[0, 1.2, -0.17]], [0, 0, -1])]);
  return finish(M, []);
}
function modelEiffel(t = 0) {   // 에펠탑: 받침판·비스듬한 다리(1층·2층)·전망대 2개·꼭대기 탑·뾰족 지붕·안테나
  const M = newM('에펠탑'), br = ['#A0714F', '#B8875B'], s = 1 + 0.06 * Math.min(t, 2);
  const slab = boxE([0.66 * s, 0.03, 0.66 * s], [0, 0.03, 0], '#CDEFD9'); M.els.push(slab);
  const leg = (p0, p1, w, color) => { const d = sub(p1, p0), L = Math.hypot(...d), t2 = norm(d), side = Math.abs(t2[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const E = el('block', boxGeom([w, L / 2, w]), mul(add(p0, p1), 0.5), frame(t2, norm(cross(t2, cross(side, t2)))), color); M.els.push(E); return E; };
  const P1y = 0.62, P2y = 1.12, c4 = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const legs0 = c4.map(([a, b]) => leg([a * 0.5 * s, 0.06, b * 0.5 * s], [a * 0.3 * s, P1y, b * 0.3 * s], 0.055, br[0]));
  const p1 = boxE([0.4 * s, 0.04, 0.4 * s], [0, P1y + 0.04, 0], '#F2B84B'); M.els.push(p1);
  const legs1 = c4.map(([a, b]) => leg([a * 0.2 * s, P1y + 0.08, b * 0.2 * s], [a * 0.1 * s, P2y, b * 0.1 * s], 0.04, br[1]));
  const p2 = boxE([0.2 * s, 0.035, 0.2 * s], [0, P2y + 0.035, 0], '#F2B84B'); M.els.push(p2);
  const tower = boxE([0.07, 0.3, 0.07], [0, P2y + 0.07 + 0.3, 0], br[0]); M.els.push(tower);
  const spire = el('wheel', coneGeom(0.1, 0.16, 4), [0, P2y + 0.07 + 0.6 + 0.16, 0], ry(Math.PI / 4), '#8E7BD6'); M.els.push(spire);
  const ant = cylE(0.025, 0.08, [0, topOfE(spire) + 0.08, 0], '#F0679A'); M.els.push(ant);
  legs0.forEach((L0, i) => { const [a, b] = c4[i]; pin(M, slab, L0, [a * 0.5 * s, 0, b * 0.5 * s], [0, -1, 0]); pin(M, p1, L0, [a * 0.33 * s, P1y + 0.08, b * 0.33 * s], Yax); });
  legs1.forEach((L1, i) => { const [a, b] = c4[i]; pin(M, p2, L1, [a * 0.13 * s, P2y + 0.07, b * 0.13 * s], Yax); });
  pin(M, p1, legs1[0], [0.2 * s, P1y, -0.06], [0, -1, 0]); pin(M, p1, legs1[3], [-0.2 * s, P1y, 0.06], [0, -1, 0]);
  pin(M, p2, tower, [0.0, P2y, 0.12 * s], [0, -1, 0]); pin(M, tower, p2, [0, P2y + 0.35, 0.07], [0, 0, 1]);
  const sn = norm([0.16 * 2, 0.1, 0]); pin(M, spire, tower, add(spire.c, [0.05, -0.05, 0]), mv(ry(Math.PI / 4), mv(ry(-Math.PI / 4), sn)));
  pin(M, ant, spire, [0, topOfE(ant), 0], Yax);
  fixCount(M, [...ex(p1, legs1[1], [[0.2 * s, P1y, 0.06]], [0, -1, 0]), ...ex(p1, legs1[2], [[-0.2 * s, P1y, -0.06]], [0, -1, 0]), ...ex(tower, p2, [[0, P2y + 0.2, -0.07]], [0, 0, -1]), ...ex(tower, p2, [[0.07, P2y + 0.25, 0]], [1, 0, 0])]);
  return finish(M, []);
}
function modelRocket(t = 0) {   // 로켓: 원기둥 몸통(층층이)·뾰족 머리·날개 4장·둥근 창·분사구
  const M = newM('로켓'), n = 2 + Math.min(t, 2), r = 0.28;
  const noz = el('wheel', frustumGeom(0.2, 0.14, 0.08), [0, 0.08, 0], I3, '#8E93B8'); M.els.push(noz);
  const body = []; for (let i = 0; i < n; i++) { const E = cylE(r, 0.2, [0, 0.16 + 0.2 + i * 0.4, 0], i % 2 ? '#FFF6EC' : '#F0679A'); body.push(E); M.els.push(E); }
  const topY = 0.16 + n * 0.4, nose = el('wheel', coneGeom(r, 0.26), [0, topY + 0.26, 0], I3, '#F0679A'); M.els.push(nose);
  pins(M, body[0], noz, ring(body[0].c, botOfE(body[0]), 0.22, 2, 0.8), [0, -1, 0]);
  for (let i = 1; i < n; i++) pins(M, body[i], body[i - 1], capRing(body[i], 0.18, 2, i % 2 ? 0 : Math.PI / 2), Yax);
  pins(M, body[0], noz, [], Yax);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, d = [Math.cos(a), 0, Math.sin(a)], F = el('plate', boxGeom([0.14, 0.17, 0.02]), add([0, 0.34, 0], mul(d, r + 0.14)), ry(-a), ['#5B8DEF', '#FFD66B'][i % 2]); M.els.push(F);
    const tg = [-Math.sin(a), 0, Math.cos(a)]; pin(M, F, body[0], add(add([0, 0.36, 0], mul(d, r + 0.1)), mul(tg, 0.02)), tg); }
  const win = cylE(0.09, 0.02, [0, body[n - 1].c[1], r + 0.02], '#9FD8F5', rx(Math.PI / 2)); M.els.push(win); pin(M, win, body[n - 1], [0, body[n - 1].c[1], r + 0.04], [0, 0, 1]);
  for (const a of [0.7, 0.7 + Math.PI]) { const y = nose.c[1] - 0.26 + 0.52 * 0.35, rr2 = r * 0.65, nn = norm([Math.cos(a) * 0.52, r, Math.sin(a) * 0.52]); pin(M, nose, body[n - 1], [Math.cos(a) * rr2, y, Math.sin(a) * rr2], nn); }
  pins(M, noz, body[0], [[0, 0, 0]], [0, -1, 0]);
  fixCount(M, [...ex(body[0], noz, ring(body[0].c, botOfE(body[0]), 0.22, 6, 0.2), [0, -1, 0]), ...ex(noz, body[0], ring([0, 0, 0], 0, 0.1, 4, 0.5), [0, -1, 0])]);
  return finish(M, []);
}
function modelTree(t = 0) {   // 크리스마스트리: 화분·줄기·3단 잎·장식 공·꼭대기 별
  const M = newM('크리스마스트리'), n = 3 + Math.min(t, 1);
  const pot = el('wheel', frustumGeom(0.2, 0.26, 0.12), [0, 0.12, 0], I3, '#F0679A'), trunk = cylE(0.08, 0.1, [0, 0.34, 0], '#A0714F'); addAll(M, pot, trunk);
  const tiers = []; let y = 0.44;
  for (let i = 0; i < n; i++) { const r0 = 0.6 - i * 0.13, r1 = 0.28 - i * 0.07, hh = 0.16; const E = el('wheel', frustumGeom(r0, Math.max(0.06, r1), hh), [0, y + hh, 0], I3, ['#2FB99A', '#3FC7A6', '#56D3B2', '#6BDDBE'][i]); tiers.push(E); M.els.push(E); y += 2 * hh; }
  const star = el('wheel', coneGeom(0.1, 0.09, 5), [0, y + 0.09, 0], I3, '#FFD66B'); M.els.push(star);
  pins(M, pot, trunk, capRing(pot, 0.19, 2, 0.4), Yax);
  pins(M, tiers[0], trunk, ring(tiers[0].c, botOfE(tiers[0]), 0.3, 2, 1.2), [0, -1, 0]);   // 잎 밑면: 올려다봐야 보여요
  for (let i = 1; i < n; i++) pins(M, tiers[i], tiers[i - 1], capRing(tiers[i], Math.max(0.1, 0.2 - i * 0.05), 1, i), Yax);
  pin(M, star, tiers[n - 1], add(star.c, [0.04, -0.03, 0]), norm([0.18, 0.1, 0]));
  const cols = ['#F0679A', '#5B8DEF', '#FFD66B', '#9B7BF0', '#FF8A5B'];
  tiers.forEach((E, i) => { const hh = E.geom.half[1], r0 = 0.6 - i * 0.13, r1 = Math.max(0.06, 0.28 - i * 0.07); for (const a of [0.3 + i, 2.4 + i, 4.4 + i]) {
    const rr2 = (r0 + r1) / 2 + 0.03, ball = cylE(0.055, 0.03, [Math.cos(a) * rr2, E.c[1], Math.sin(a) * rr2], cols[(i * 3 + a * 7 | 0) % cols.length], frame(norm([Math.cos(a), (r0 - r1) / (2 * hh), Math.sin(a)]), norm([-Math.sin(a), 0, Math.cos(a)])));
    if (!spotFree(M, ball.c, mv(ball.R, [0, 1, 0]))) continue; M.els.push(ball); pin(M, ball, E, add(ball.c, mv(ball.R, [0, 0.03, 0])), mv(ball.R, [0, 1, 0])); } });
  fixCount(M, [...ex(pot, trunk, capRing(pot, 0.19, 6, 1.0), Yax), ...ex(tiers[0], trunk, ring(tiers[0].c, botOfE(tiers[0]), 0.3, 6, 0.2), [0, -1, 0])]);
  return finish(M, []);
}
function modelCake(t = 0) {   // 케이크: 2~3단 + 초 + 체리. 아래 단 윗면 나사는 위 단이 덮어요
  const M = newM('케이크'), n = 2 + Math.min(t, 1), cols = ['#F9C9D8', '#FFF6EC', '#FFE3A6'];
  const plate0 = cylE(0.72, 0.025, [0, 0.025, 0], '#D9DEEE'); M.els.push(plate0);
  const tiers = []; let y = 0.05; for (let i = 0; i < n; i++) { const E = cylE(0.6 - i * 0.16, 0.13, [0, y + 0.13, 0], cols[i]); tiers.push(E); M.els.push(E); y += 0.26; }
  pins(M, plate0, tiers[0], ring(plate0.c, 0, 0.3, 3, 0.5), [0, -1, 0]);
  for (let i = 1; i < n; i++) { pins(M, tiers[i - 1], plate0, capRing(tiers[i - 1], 0.2 - i * 0.04, 2, i), Yax); pins(M, tiers[i], tiers[i - 1], capRing(tiers[i], 0.6 - i * 0.16 - 0.08, 2, 0.5 + i), Yax); }
  const top = tiers[n - 1], R = 0.6 - (n - 1) * 0.16;
  for (const a of [0.9, 3.0, 5.1]) { const c = [Math.cos(a) * R * 0.45, topOfE(top) + 0.12, Math.sin(a) * R * 0.45], cand = cylE(0.065, 0.12, c, ['#9FD8F5', '#CDEFD9', '#E0D4FF'][Math.round(a) % 3]); const fl = el('wheel', coneGeom(0.045, 0.06), [c[0], c[1] + 0.18, c[2]], I3, '#FFB347');
    M.els.push(cand, fl); pin(M, cand, top, [c[0] + Math.cos(a) * 0.065, c[1], c[2] + Math.sin(a) * 0.065], [Math.cos(a), 0, Math.sin(a)]); pin(M, fl, cand, [c[0], c[1] + 0.12 + 0.04, c[2] + 0.02], norm([0, 0.3, 0.6])); }
  const lowR = 0.6; for (const a of [0.3, 2.4, 4.5]) { const c = [Math.cos(a) * (lowR - 0.1), topOfE(tiers[0]) + 0.04, Math.sin(a) * (lowR - 0.1)], ch = cylE(0.065, 0.04, c, '#F0679A'); if (!rectFree(M, rect([c[0], topOfE(tiers[0]), c[2]], Yax, [1, 0, 0], 0.07, 0.07))) continue; M.els.push(ch); pin(M, ch, tiers[0], [c[0], c[1] + 0.04, c[2]], Yax); }
  fixCount(M, [...ex(plate0, tiers[0], ring(plate0.c, 0, 0.3, 6, 0.1), [0, -1, 0]), ...ex(top, tiers[n - 2], capRing(top, 0.12, 4, 0.2), Yax)]);
  return finish(M, []);
}

function modelCube(t = 0, minS = 0) {   // 큐브: 2×2×2 → 3×2×2 → 3×3×2 → 3×3×3 → 4×3×3 … 끝없이
  const base = 2 + Math.floor(t / 3), ex = t % 3, nx = base + (ex > 0 ? 1 : 0), ny = base + (ex > 1 ? 1 : 0), nz = base;
  const b = []; let i = 0; for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) b.push(cube(x, y, z, WOOD[i++ % 6]));
  return assemble('큐브', b, { minS });
}
modelCube.blocks = t => { const base = 2 + Math.floor(t / 3), ex = t % 3; return (base + (ex > 0 ? 1 : 0)) * (base + (ex > 1 ? 1 : 0)) * base; };
function modelHouse(t = 0, minS = 0) {   // 집: 옆(3→)·위(2→)·뒤(1→)로 커지고, 층마다 창문이 늘어요
  const W = 3 + t, Hh = 2 + Math.floor(t / 2), D = 1 + Math.floor(t / 3), top = Hh - 1, mid = Math.floor(W / 2), F0 = D - 1;
  const b = []; for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) for (let z = 0; z < D; z++) b.push(cube(x, y, z, x % 2 ? '#FFE3A6' : '#F4C28F'));
  const roof = el('block', prismGeom([W / 2 * GRID, 0.5 * GRID, D / 2 * GRID]), [W / 2 * GRID, (Hh + 0.5) * GRID, D / 2 * GRID], I3, '#F0679A');
  const wall = (x, y, z = F0) => b.find(q => q.cell[0] === x && q.cell[1] === y && q.cell[2] === z), fz = [0, 0, 1], cover = [];
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) cover.push([x, Hh, z]);
  return assemble('집', b, { els: [roof], cover, minS, pre: M => {
    const fr = (Wb, zs, dx) => { const n = [0, 0, zs], fa = face(Wb, n), q1 = add(fa, [dx, 0.04, 0]), q2 = [fa[0] + dx, Hh * GRID + 0.08, fa[2]], c0 = mul(add(q1, q2), 0.5);
      return place(M, rect(c0, n, [0, 1, 0], (q2[1] - q1[1]) / 2 + 0.075, 0.075), PLATE, [{ q: q1, into: Wb }, { q: q2, into: roof }]); };
    fr(wall(mid, top), 1, W % 2 ? 0 : -0.1);
    if (W >= 4) { fr(wall(1, top, 0), -1, 0); fr(wall(W - 2, top, 0), -1, 0); } else { fr(wall(0, top, 0), -1, 0.12); fr(wall(W - 1, top, 0), -1, -0.12); }
    const door = face(wall(mid, 0), fz); place(M, rect(add(door, [0, -0.03, 0]), fz, [1, 0, 0], 0.1, 0.15), '#C98A5A', [{ q: add(door, [-0.035, 0.05, 0]), into: wall(mid, 0) }, { q: add(door, [0.035, -0.11, 0]), into: wall(mid, 0) }]);
    const step = boxE([0.23, 0.03, 0.09], add(door, [0, -GRID / 2 + 0.03, 0.09]), '#B9AFA0'); M.els.push(step); M.rects.push(rect(add(door, [0, -GRID / 2 + 0.03, 0]), fz, [1, 0, 0], 0.23, 0.03)); pin(M, step, wall(mid, 0), add(door, [-0.15, -GRID / 2 + 0.06, 0.09]), Yax);   // 문 나사와 서로 길을 막지 않게
    for (let y = 0; y <= top; y++) for (let x = 0; x < W; x += 2) { if (y === 0 && Math.abs(x - mid) < 1) continue; if (y < top && y > 0 && (x + y) % 4) continue;   // 창문: 층마다
      const w = face(wall(x, y), fz); if (!place(M, rect(w, fz, [1, 0, 0], 0.11, 0.11), '#9FD8F5', [{ q: w, into: wall(x, y) }])) continue;
      const sill = boxE([0.14, 0.022, 0.07], add(w, [0, -0.15, 0.07]), '#FFF6EC'); M.els.push(sill); M.rects.push(rect(add(w, [0, -0.15, 0]), fz, [1, 0, 0], 0.14, 0.03)); pin(M, sill, wall(x, y), add(w, [0, -0.128, 0.07]), Yax); }
    const gw = cylE(0.09, 0.02, [W / 2 * GRID, Hh * GRID + 0.27, D * GRID + 0.02], '#FFD66B', rx(Math.PI / 2)); M.els.push(gw); pin(M, gw, roof, [W / 2 * GRID, Hh * GRID + 0.27, D * GRID + 0.04], fz);
    if (!M.screws.some(z => z.into === roof)) throw new Error('지붕을 못 붙였어요');
  } });
}
modelHouse.blocks = t => (3 + t) * (2 + Math.floor(t / 2)) * (1 + Math.floor(t / 3));
function modelCar(t = 0, minS = 0) {   // 자동차: 길고(4→) 넓게(2→) 커져요
  const Lc = 4 + t, Wc = 2 + Math.floor(t / 3), b = [];
  for (let x = 0; x < Lc; x++) for (let z = 0; z < Wc; z++) b.push(cube(x, 0, z, x === 0 || x === Lc - 1 ? '#C6E6FF' : '#5B8DEF'));
  for (let x = 1; x < Lc - 1; x++) for (let z = 0; z < Wc; z++) b.push(cube(x, 1, z, '#FFE3A6'));
  const at = (x, y, z) => b.find(q => q.cell[0] === x && q.cell[1] === y && q.cell[2] === z), px = [1, 0, 0], nx = [-1, 0, 0], pz = [0, 0, 1], nz = [0, 0, -1], Z1 = Wc - 1;
  return assemble('자동차', b, { minS, pre: M => {
    const glass = '#9FD8F5';
    for (const [n, x] of [[px, Lc - 2], [nx, 1]]) { const f0 = face(at(x, 1, 0), n), f1 = face(at(x, 1, Z1), n), c = mul(add(f0, f1), 0.5);   // 앞유리·뒷유리
      place(M, rect(c, n, [0, 0, 1], Wc * GRID / 2 - 0.09, 0.12), glass, [{ q: add(f0, [0, 0, 0.03]), into: at(x, 1, 0) }, { q: add(f1, [0, 0, -0.03]), into: at(x, 1, Z1) }]); }
    for (const [n, z] of [[pz, Z1], [nz, 0]]) for (let x = 1; x < Lc - 1; x++) { const f = add(face(at(x, 1, z), n), [0, 0.1, 0]); place(M, rect(f, n, [1, 0, 0], 0.15, 0.07), glass, [{ q: f, into: at(x, 1, z) }]); }
    for (const [n, x, col] of [[px, Lc - 1, '#FFE39A'], [nx, 0, '#F0679A']]) {   // 전조등·후미등 + 범퍼
      for (const z of [0, Z1]) { const B = at(x, 0, z), f = face(B, n), lc = add(f, [0, 0.06, z ? -0.08 : 0.08]), L = cylE(0.075, 0.018, add(lc, mul(n, 0.018)), col, rz(n[0] > 0 ? -Math.PI / 2 : Math.PI / 2));
        M.els.push(L); M.rects.push(rect(lc, n, [0, 0, 1], 0.075, 0.075)); pin(M, L, B, add(lc, mul(n, 0.036)), n); }
      const f0 = face(at(x, 0, 0), n), f1 = face(at(x, 0, Z1), n), bc = add(mul(add(f0, f1), 0.5), [0, -0.14, 0]), hw = Wc * GRID / 2 - 0.03, bum = boxE([0.035, 0.05, hw], add(bc, mul(n, 0.035)), '#3A3F66');
      M.els.push(bum); M.rects.push(rect(bc, n, [0, 0, 1], hw, 0.05)); pin(M, bum, at(x, 0, 0), add(add(f0, [0, -0.14, 0]), mul(n, 0.07)), n); pin(M, bum, at(x, 0, Z1), add(add(f1, [0, -0.14, 0]), mul(n, 0.07)), n);
    }
  }, extra: M => {
    for (const [x, z, zn] of [[0, 0, -1], [Lc - 1, 0, -1], [0, Z1, 1], [Lc - 1, Z1, 1]]) {   // 바퀴(원형 블럭)
      const B0 = at(x, 0, z), wz = B0.c[2] + zn * (GRID / 2 + 0.06), Wh = el('wheel', cylGeom(0.17, 0.06, 14), [B0.c[0], B0.c[1] - 0.06, wz], rx(Math.PI / 2), '#2E3358'); M.els.push(Wh);
      mkScrew(M, Wh, B0, [B0.c[0], B0.c[1] - 0.06, wz + zn * 0.06], [0, 0, zn]);
    }
  }, reserved: [[0, 0, -1], [Lc - 1, 0, -1], [0, 0, Wc], [Lc - 1, 0, Wc]] });
}
modelCar.blocks = t => { const Lc = 4 + t, Wc = 2 + Math.floor(t / 3); return Lc * Wc + (Lc - 2) * Wc; };
function modelCastle(t = 0, minS = 0) {   // 성: 넓고(4→) 높게(1→) 커져요. 성가퀴·모서리 탑·성문
  const N = 4 + t, Hc = 1 + Math.floor(t / 2), b = [], isEdge = (x, z) => x === 0 || z === 0 || x === N - 1 || z === N - 1, corner = (x, z) => (x === 0 || x === N - 1) && (z === 0 || z === N - 1), TY = Hc - 1;
  for (let y = 0; y < Hc; y++) for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) if (isEdge(x, z)) b.push(cube(x, y, z, (x + z + y) % 2 ? '#D9D2C5' : '#C9C0B0'));
  const at = (x, y, z) => b.find(q => q.cell[0] === x && q.cell[1] === y && q.cell[2] === z);
  return assemble('성', b, { minS, pre: M => {
    for (const q of b.filter(q => q.cell[1] === TY)) { const [x, , z] = q.cell, top = face(q, Yax), Y0 = Hc * GRID;
      if (corner(x, z)) { const Tw = cylE(0.23, 0.26, [q.c[0], Y0 + 0.26, q.c[2]], '#E0D4FF'), C = el('wheel', coneGeom(0.27, 0.2), [q.c[0], Y0 + 0.52 + 0.2, q.c[2]], I3, '#5B8DEF');
        M.els.push(Tw, C); M.rects.push(rect(top, Yax, [1, 0, 0], 0.23, 0.23)); pins(M, Tw, q, capRing(Tw, 0.12, 2, x + z), Yax);
        for (const a of [0.6, 0.6 + Math.PI]) { const r = 0.27 * 0.6, y = C.c[1] - 0.2 + 0.4 * 0.4; pin(M, C, Tw, [q.c[0] + Math.cos(a) * r, y, q.c[2] + Math.sin(a) * r], norm([Math.cos(a) * 0.4, 0.27, Math.sin(a) * 0.4])); }
      } else if ((x + z) % 2 === 0) { const K = boxE([0.11, 0.1, 0.11], [q.c[0], Y0 + 0.1, q.c[2]], '#B9AFA0'); M.els.push(K); M.rects.push(rect(top, Yax, [1, 0, 0], 0.11, 0.11)); pin(M, K, q, [q.c[0], Y0 + 0.2, q.c[2]], Yax); }
    }
    const fz = [0, 0, -1], g = Math.floor(N / 2) - 1, d1 = at(g, 0, 0), d2 = at(g + 1, 0, 0), dc = add(mul(add(face(d1, fz), face(d2, fz)), 0.5), [0, -0.08, 0]);   // 성문
    place(M, rect(dc, fz, [1, 0, 0], 0.2, 0.12), '#A0714F', [{ q: add(dc, [-0.12, 0, 0]), into: d1 }, { q: add(dc, [0.12, 0, 0]), into: d2 }]);
  } });
}
modelCastle.blocks = t => { const N = 4 + t, Hc = 1 + Math.floor(t / 2); return (4 * N - 4) * Hc; };

const [modelSportsCar, modelTitanic, modelWatermelon, modelPig, modelCow, modelRabbit] = createPremiumModels({ modelCar, boxE, GRID, finish, pin, topOfE, Yax, cube, assemble, face, el, cylGeom, I3, boundOf, cylE, rx, add, mul, rz, coneGeom });
const { modelRobot, modelFireTruck, modelFerrisWheel, modelPenguin, modelHelicopter } = createReplacementModels({
  cube, assemble, modelCar, boxE, cylE, el, pin, add, mul, face, GRID,
  I3, Yax, rx, rz, cylGeom, boxGeom, boundOf, tubeParts
});
const MODELS = [modelRobot, modelHouse, modelPizza, modelFireTruck, modelPenguin, modelFerrisWheel, modelTeapotRound, modelHelicopter, modelRocket, modelCake, modelLighthouse, modelTree, modelCastle, modelEiffel, modelSportsCar, modelTitanic, modelWatermelon, modelPig, modelCow, modelRabbit];

// ---------- 지금 모양 (흔들림·떨어짐) ----------
function pose(E) {
  if (E.dyn) return { R: E.dyn.R, c: E.dyn.c };   // 떨어지며 움직이는 조각
  let R = E.R, c = E.c;
  if (E.hinge) { const Q = axisRot(E.hinge.a, E.hinge.th); R = mm(Q, R); c = add(E.hinge.p, mv(Q, sub(c, E.hinge.p))); }
  if (E.fall) { R = mm(axisRot(E.fall.ax, E.fall.ang), R); c = add(c, E.fall.off); }
  return { R, c };
}
const held = (E, screws) => screws.some(s => s.state === 'in' && (s.thru === E || s.into === E));
// 여러 조각으로 된 블럭(곡선 튜브 등)은 E.parts = [{ geom, pc, pR, color }], 한 덩어리면 geom 하나
function shapes(E) { const q = pose(E); if (!E.parts) return [{ geom: E.geom, R: q.R, c: q.c, color: E.color }]; return E.parts.map(p => ({ geom: p.geom, R: mm(q.R, p.pR), c: add(q.c, mv(q.R, p.pc)), color: p.color || E.color })); }
const obbs = E => shapes(E).map(sh => ({ c: add(sh.c, mv(sh.R, sh.geom.cen || [0, 0, 0])), R: sh.R, h: sh.geom.half, rounding: sh.geom.soft ? SOFT_RADIUS : 0 }));
const planeCache = new WeakMap();
function geomPlanes(geom) {
  if (!planeCache.has(geom)) planeCache.set(geom, geom.faces.map(f => {
    const p = geom.verts[f.idx[0]], v = geom.verts[f.idx[1]], w = geom.verts[f.idx[2]];
    let n = norm(cross(sub(v, p), sub(w, p))); if (dot(n, f.n) < 0) n = mul(n, -1);
    return { n, p };
  }));
  return planeCache.get(geom);
}
function featureFastenerPoint(E, point, axis) {
  let exit = -Infinity;
  for (const sh of shapes(E)) {
    const Rt = tr(sh.R), p = mv(Rt, sub(point, sh.c)), a = mv(Rt, axis);
    let lo = -Infinity, hi = Infinity;
    for (const f of geomPlanes(sh.geom)) {
      const dist = dot(f.n, sub(p, f.p)), slope = dot(f.n, a);
      if (Math.abs(slope) < 1e-9) {
        if (dist > 1e-7) { hi = -Infinity; break; }
      } else if (slope < 0) lo = Math.max(lo, -dist / slope);
      else hi = Math.min(hi, -dist / slope);
    }
    if (hi >= lo - 1e-7 && Number.isFinite(hi)) exit = Math.max(exit, hi);
  }
  if (!Number.isFinite(exit)) throw new Error('조형 부품의 나사 접점을 찾지 못했어요');
  return add(point, mul(axis, exit + 0.002));
}
// 실제로 그린 볼록한 면과 교차하는 구간. 원·원뿔·지붕의 빈 모서리는 막지 않아요.
function shapeHit(o, d, len, sh, inset = 0) {
  const Rt = tr(sh.R), p = mv(Rt, sub(o, sh.c)), a = mv(Rt, d);
  let lo = 0, hi = len;
  for (const f of geomPlanes(sh.geom)) {
    const dist = dot(f.n, sub(p, f.p)) + inset, slope = dot(f.n, a);
    if (Math.abs(slope) < 1e-9) { if (dist > 1e-7) return false; continue; }
    const t = -dist / slope;
    if (slope < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi + 1e-7) return false;
  }
  return sh.geom.faces.length > 0;
}
function rayHit(o, d, len, els, skip) {
  for (const Q of els) {
    if (skip.includes(Q) || Q.state !== 'on') continue;
    for (const sh of shapes(Q)) if (shapeHit(o, d, len, sh)) return Q;
  }
  return null;
}
const HEAD_H = 0.035, HEAD_R = 0.062;
// Detached parts keep falling for four seconds, then fade gently for one.
const DETACHED_FADE_START = 4, DETACHED_FADE_TIME = 1;
function pieceOpacity(E) {
  if (!E.dyn) return E.fall ? Math.max(0, 1 - E.fall.t / 1.3) : 1;
  const age = E.dyn.age ?? 0;
  return Math.max(0, Math.min(1, (DETACHED_FADE_START + DETACHED_FADE_TIME - age) / DETACHED_FADE_TIME));
}
// Visual heads are intentionally smaller than their unchanged collision
// radius, making the enlarged sculpted models feel like the main subject.
const DRAW_HEAD_H = 0.029, DRAW_HEAD_R = 0.051;
// ---------- 부딪힘: 떨어지는 조각 ↔ 박혀 있는 조각 (네모 상자끼리 겹침 판정) ----------
const axesOf = R => [[R[0], R[3], R[6]], [R[1], R[4], R[7]], [R[2], R[5], R[8]]];
function obbHit(A, B) {   // 겹치면 { n: B→A 쪽 방향, d: 깊이, p: 닿은 점 }
  const a = axesOf(A.R), b = axesOf(B.R), T = sub(A.c, B.c); let best = null;
  const test = L => {
    const l = Math.hypot(L[0], L[1], L[2]); if (l < 1e-6) return true; L = mul(L, 1 / l);
    const rA = A.rounding || 0, rB = B.rounding || 0;
    const ra = rA + Math.max(0,A.h[0]-rA)*Math.abs(dot(a[0],L)) + Math.max(0,A.h[1]-rA)*Math.abs(dot(a[1],L)) + Math.max(0,A.h[2]-rA)*Math.abs(dot(a[2],L));
    const rb = rB + Math.max(0,B.h[0]-rB)*Math.abs(dot(b[0],L)) + Math.max(0,B.h[1]-rB)*Math.abs(dot(b[1],L)) + Math.max(0,B.h[2]-rB)*Math.abs(dot(b[2],L));
    const d = dot(T, L), ov = ra + rb - Math.abs(d); if (ov <= 0) return false;
    if (!best || ov < best.d) best = { n: d < 0 ? mul(L, -1) : L, d: ov }; return true;
  };
  for (const L of a) if (!test(L)) return null;
  for (const L of b) if (!test(L)) return null;
  for (const x of a) for (const y of b) if (!test(cross(x, y))) return null;
  const inside = (P, Pax, Q, Qax) => { const pts = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = add(P.c, add(add(mul(Pax[0], sx * P.h[0]), mul(Pax[1], sy * P.h[1])), mul(Pax[2], sz * P.h[2]))), l = sub(v, Q.c);
    if (Math.abs(dot(l, Qax[0])) <= Q.h[0] + 1e-3 && Math.abs(dot(l, Qax[1])) <= Q.h[1] + 1e-3 && Math.abs(dot(l, Qax[2])) <= Q.h[2] + 1e-3) pts.push(v); } return pts; };
  let pts = inside(A, a, B, b); if (!pts.length) pts = inside(B, b, A, a);
  best.p = pts.length ? mul(pts.reduce((q, v) => add(q, v), [0, 0, 0]), 1 / pts.length) : mul(add(A.c, B.c), 0.5);
  if ((A.rounding || 0) || (B.rounding || 0)) {
    // Closest points of the inner OBB cores. Rounded cuboids are exactly
    // those cores inflated by their corner radii: no phantom corner hits.
    const closest = (Q, p) => {
      const axes = axesOf(Q.R), d = sub(p,Q.c), rad = Q.rounding || 0;
      let out = Q.c;
      for(let i=0;i<3;i++) {
        const q=dot(axes[i],d), half=Math.max(0,Q.h[i]-rad);
        out=add(out,mul(axes[i],Math.max(-half,Math.min(half,q))));
      }
      return out;
    };
    let pa=closest(A,B.c), pb=closest(B,pa);
    for(let i=0;i<12;i++) {
      const nextA=closest(A,pb), nextB=closest(B,nextA);
      const delta=dot(sub(nextA,pa),sub(nextA,pa))+dot(sub(nextB,pb),sub(nextB,pb));
      pa=nextA;pb=nextB;
      if(delta<1e-12) break;
    }
    const v=sub(pa,pb), distance=Math.hypot(...v), combined=(A.rounding||0)+(B.rounding||0);
    if(distance>0 && distance>=combined-1e-6) return null;
    if(distance>1e-7){
      best.n=mul(v,1/distance);
      best.d=Math.max(1e-5,combined-distance);
      const contactA=add(pa,mul(best.n,-(A.rounding||0)));
      const contactB=add(pb,mul(best.n, B.rounding||0));
      best.p=mul(add(contactA,contactB),0.5);
    }
  }
  return best;
}
const box = E => { const q = pose(E); return { c: add(q.c, mv(q.R, E.geom.cen || [0, 0, 0])), R: q.R, h: E.geom.half, rounding: E.geom.soft ? SOFT_RADIUS : 0 }; };
const hitAny = (A, Q) => { for (const b of obbs(Q)) { const h = obbHit(A, b); if (h) return h; } return null; };
function stepDyn(E, others, g, h) {   // 중력으로 떨어지고, 박힌 조각에 부딪히면 밀려나고 튕기고 미끄러져요
  const D = E.dyn; D.t += h; if (D.sleep > 0.6) return;
  D.v = add(D.v, mul(g, h)); D.c = add(D.c, mul(D.v, h));
  const wl = Math.hypot(D.w[0], D.w[1], D.w[2]); if (wl > 1e-6) D.R = mm(axisRot(mul(D.w, 1 / wl), wl * h), D.R);
  D.w = mul(D.w, 1 - 0.6 * h); let touch = false;
  for (const Q of others) {
    if (Q === E) continue;
    const rq = Q.rad || (Q.rad = Math.hypot(...Q.geom.half) + Math.hypot(...(Q.geom.cen || [0, 0, 0]))), re = E.rad || (E.rad = Math.hypot(...E.geom.half) + Math.hypot(...(E.geom.cen || [0, 0, 0]))), qc = pose(Q).c;
    const dx = qc[0] - D.c[0], dy = qc[1] - D.c[1], dz = qc[2] - D.c[2];
    if (dx * dx + dy * dy + dz * dz > (rq + re) * (rq + re)) continue;
    const hit = hitAny({ c: add(D.c, mv(D.R, E.geom.cen || [0, 0, 0])), R: D.R, h: E.geom.half, rounding: E.geom.soft ? SOFT_RADIUS : 0 }, Q); if (!hit) continue;
    touch = true; const n = hit.n, r = sub(hit.p, D.c); D.c = add(D.c, mul(n, hit.d * 0.8 + 0.0005));
    const vr = add(D.v, cross(D.w, r)), vn = dot(vr, n);
    if (vn < 0) {
      const rn = cross(r, n), j = -1.15 * vn / (1 / D.m + dot(rn, rn) / D.I); D.v = add(D.v, mul(n, j / D.m)); D.w = add(D.w, mul(rn, j / D.I));
      const v2 = add(D.v, cross(D.w, r)), vt = sub(v2, mul(n, dot(v2, n))), tl = Math.hypot(vt[0], vt[1], vt[2]);
      if (tl > 1e-5) { const t = mul(vt, 1 / tl), rt = cross(r, t); const jt = Math.max(-0.5 * j, Math.min(0.5 * j, -dot(v2, t) / (1 / D.m + dot(rt, rt) / D.I))); D.v = add(D.v, mul(t, jt / D.m)); D.w = add(D.w, mul(rt, jt / D.I)); }
    }
  }
  if (touch && Math.hypot(D.v[0], D.v[1], D.v[2]) < 0.06 && Math.hypot(D.w[0], D.w[1], D.w[2]) < 0.25) D.sleep += h; else D.sleep = 0;
}
const cellKey = (p, mid) => [0, 1, 2].map(i => Math.floor((p[i] + mid[i]) / GRID)).join(',');
function mapLevel(M) {   // 칸 지도: 칸 → 블럭, 특별한 조각 목록
  M.mid = M.mid || [0, 0, 0]; M.grid = new Map();
  for (const e of M.els) if (e.kind === 'block' && e.cell && e.cell.every((n, i) => Math.abs(e.c[i] + M.mid[i] - (n + 0.5) * GRID) < 1e-6)) M.grid.set(e.cell.join(','), e);
  M.gridEls = new Set(M.grid.values()); M.special = M.els.filter(e => !M.gridEls.has(e));
  M.refs = new Map(M.els.map(e => [e, []])); for (const z of M.screws) { M.refs.get(z.thru).push(z); M.refs.get(z.into).push(z); }
  // The generator starts with static pieces. Cache shortlists only for that
  // initial solvability pass, not for live falling/hinged pieces.
  const extents = M.special.map(E => {
    const h = E.geom.half, c = E.geom.cen || [0, 0, 0];
    // Conservatively enclose every possible vertex under arbitrary rotation.
    return Math.hypot(Math.abs(c[0]) + h[0], Math.abs(c[1]) + h[1], Math.abs(c[2]) + h[2]) + 0.32;
  });
  M.staticSpecialNear = new Map(); M.staticScrewsNear = new Map();
  // X-axis spatial buckets discard distant candidates without changing the
  // exact collision rules. Original ordering is preserved for blocker choice.
  const BIN = 0.65, cell = x => Math.floor(x / BIN);
  const partBins = new Map(), screwBins = new Map();
  const addBin = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  M.special.forEach((E, i) => {
    const r = extents[i];
    for (let x = cell(E.c[0] - r); x <= cell(E.c[0] + r); x++)
      addBin(partBins, x, { E, r });
  });
  M.screws.forEach((z, i) => addBin(screwBins, cell(z.p[0]), { z, i }));
  for (const s of M.screws) {
    const x = cell(s.p[0]);
    M.staticSpecialNear.set(s, (partBins.get(x) || []).filter(({ E, r }) => {
      const dx = E.c[0] - s.p[0], dy = E.c[1] - s.p[1], dz = E.c[2] - s.p[2];
      return dx * dx + dy * dy + dz * dz <= r * r;
    }).map(item => item.E));
    const close = [];
    for (let k = x - 1; k <= x + 1; k++) close.push(...(screwBins.get(k) || []));
    close.sort((a, b) => a.i - b.i);
    M.staticScrewsNear.set(s, close.filter(({ z }) => {
      const dx = z.p[0] - s.p[0], dy = z.p[1] - s.p[1], dz = z.p[2] - s.p[2];
      return dx * dx + dy * dy + dz * dz <= 0.65 * 0.65;
    }).map(item => item.z));
  }
  return M;
}
function gridHit(lvl, o, d, len, skip) {
  const p = add(o, lvl.mid), cell = p.map(v => Math.floor(v / GRID)), step = d.map(Math.sign);
  const delta = d.map(v => Math.abs(v) < 1e-9 ? Infinity : GRID / Math.abs(v));
  const next = d.map((v, i) => Math.abs(v) < 1e-9 ? Infinity : ((cell[i] + (v > 0 ? 1 : 0)) * GRID - p[i]) / v);
  for (let t = 0; t <= len;) {
    const b = lvl.grid.get(cell.join(','));
    if (b && b.state === 'on' && !b.dyn && !b.fall && !skip.includes(b) && rayHit(o, d, len, [b], skip)) return b;
    t = Math.min(...next); if (!Number.isFinite(t)) break;
    for (let k = 0; k < 3; k++) if (next[k] <= t + 1e-9) { cell[k] += step[k]; next[k] += delta[k]; }
  }
  return null;
}
function screwPose(s) {
  const E = s.thru;
  if (!E.hinge) return { p: s.p, a: s.a };
  const Q = axisRot(E.hinge.a, E.hinge.th);
  return { p: add(E.hinge.p, mv(Q, sub(s.p, E.hinge.p))), a: mv(Q, s.a) };
}
function visibleScrewPose(s) {
  // Cosmetic cloth buttons do not jump back to their old cubical position
  // when their hidden fastening plate starts swinging or falling.
  return s.skinMount || screwPose(s);
}
function screwHit(s, L, o, a, len) {   // 앞의 나사 머리가 이 나사를 빼는 길을 막나요?
  const radius2 = (HEAD_R * 2 - 0.002) ** 2, half = HEAD_H / 2 + HEAD_R - 0.002;
  // Buckets are valid at the original position, but hinged / falling pieces
  // must also be considered at their current positions.
  const moving = s.thru.hinge || s.thru.dyn || s.thru.fall;
  const near = moving ? L.screws : (L.staticScrewsNear?.get(s) || L.screws);
  const candidates = L.generating ? near :
    [...new Set([...near, ...L.screws.filter(z => z.thru.hinge || z.thru.dyn || z.thru.fall)])];
  for (const z of candidates) {
    if (z === s || z.state !== 'in' && z.state !== 'out') continue;
    const q = screwPose(z), rise = z.state === 'out' ? Math.min(1, z.t / 0.34) * 0.22 : 0;
    // Opposing heads create impossible mutual locks; allow them to disengage.
    if (dot(a, q.a) < -0.9) continue;
    const v = sub(o, add(q.p, mul(q.a, HEAD_H / 2 + rise))), along = dot(v, q.a), slope = dot(a, q.a);
    let lo = 0, hi = len;
    if (Math.abs(slope) < 1e-9) { if (Math.abs(along) > half) continue; }
    else { const t0 = (-half - along) / slope, t1 = (half - along) / slope; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); if (lo > hi) continue; }
    const vr = sub(v, mul(q.a, along)), ar = sub(a, mul(q.a, slope)), ar2 = dot(ar, ar);
    const t = ar2 > 1e-9 ? Math.max(lo, Math.min(hi, -dot(vr, ar) / ar2)) : lo;
    const d = add(vr, mul(ar, t));
    if (dot(d, d) < radius2) return z;
  }
  return null;
}
function blocked(s, L) {   // 나사 앞(바깥쪽)을 다른 조각이나 나사가 막고 있나요?
  const { p, a } = screwPose(s), o = add(p, mul(a, HEAD_H + 0.01));
  const skip = [s.thru, s.into], travel = 0.24;   // 실제 풀림 이동(0.22) + 여유. 멀리 떨어진 물체는 막지 않아요.
  if (Array.isArray(L)) return rayHit(o, a, travel, L, skip);
  const moving = s.thru.hinge || s.thru.dyn || s.thru.fall;
  const near = moving ? L.special : (L.staticSpecialNear?.get(s) || L.special);
  const candidates = L.generating ? near :
    [...new Set([...near, ...L.special.filter(e => e.dyn || e.hinge || e.fall)])];
  return gridHit(L, o, a, travel, skip) || rayHit(o, a, travel, candidates, skip)
    || (L.generating ? null : rayHit(o, a, travel, L.els.filter(e => L.gridEls.has(e) && (e.dyn || e.fall)), skip)) || screwHit(s, L, o, a, travel);
}
const STAGES = 1000;
// 1~500 retain their established progression; new levels keep growing without a sudden jump.
// Scale puzzle complexity gradually while keeping scenes comfortable on phones.
// The 1-3 stage tutorial stays unchanged. The target (not a strict count)
// rises from about 138 screws at stage 30 to 400 at 500 and 540 at 1000.
const targetScrews = L => L <= 3 ? 12 + (L - 1) * 6
  : L <= 30 ? Math.round(48 + 952 * Math.pow((L - 4) / 496, 0.8))
  : L <= 500 ? Math.round(138 + 262 * Math.pow((L - 30) / 470, 0.85))
  : Math.round(400 + 140 * Math.pow((L - 500) / 500, 0.90));
// Difficulty now follows the reduced model and screw counts.
// Tutorial: 2 colors; higher stages introduce one new color at key milestones.
const difficultyTier = L => L <= 3 ? 0 : L <= 30 ? 1 : L <= 100 ? 2
  : L <= 250 ? 3 : L <= 500 ? 4 : L <= 750 ? 5 : 6;
// Higher stages add new screw colors without changing the 3-of-a-kind rule.
// A correct route still needs only the two default boxes; detours use storage.
// Tutorial uses 2 kinds; then add 1 kind per 15-stage band:
// 4-15: 3, 16-30: 4, 31-45: 5, ... 256-270: 20 (cap thereafter).
const colorCount = L => L <= 3 ? 2 : Math.min(20, 3 + Math.floor((L - 1) / 15));
function tutorialModel(L) {   // 처음 세 판은 작은 물건과 두 색으로 회전·분해를 익혀요.
  const cells = L === 1 ? [[0, 0, 0], [1, 0, 0]] : L === 2 ? [[0, 0, 0], [1, 0, 0], [2, 0, 0]] : [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]];
  return assemble(['작은 블럭', '블럭 기차', '네모 블럭'][L - 1], cells.map((p, i) => cube(...p, WOOD[i])), { minS: targetScrews(L) });
}
function makeLevel(L) {   // 빈자리가 모자라거나 풀 수 없는 모양이면 다시 만들어요
  for (let tries = 0; ; tries++) { try { return buildLevel(L, tries > 14); } catch (e) { if (tries > 30) throw e; } }   // 계속 안 되면 같은 나사 수의 큐브로 대신
}
function sizedModel(L, alt = false) {   // 단계에 맞는 크기의 물건: 커지는 물건은 크기를 키우고, 작은 물건은 블럭 전시대 위에
  const T = targetScrews(L), f = alt ? modelRobot : MODELS[(L - 1) % MODELS.length];
  if (L <= 3) return tutorialModel(L);
  const ms = Math.ceil(T * 0.85 / 3) * 3;
  if (f.blocks) { let t = 0; while (t < 60 && f.blocks(t) * (L <= 30 ? 2.2 : 2.45) < T) t++; const A = f(t, ms); if (t > 0 && A.screws.length > T * 1.3) { const B2 = f(t - 1, ms); if (Math.abs(B2.screws.length - T) < Math.abs(A.screws.length - T)) return B2; } return A; }
  return withPedestal(f(Math.min(2, Math.floor((L - 1) / MODELS.length))), T);
}
// Place functional 45-degree screws on rounded-cube bevels in EVERY stage,
// including the three tutorials. Normal collision and solvability rules apply.
function addAngledScrews(M, L) {
  const cubes=M.els.filter(e => e.kind==='block' && e.cell && e.geom.soft);
  // Use actual world centres because a pedestal may shift its sculpted model
  // while the original cell coordinates remain unchanged.
  const key=v=>v.map(q=>Math.round(q*100000)).join(',');
  const occupied=new Map(cubes.map(e=>[key(e.c),e])),candidates=[];
  const outer=GRID/2-SOFT_RADIUS+SOFT_RADIUS/Math.SQRT2;
  const dirs=[[0,2],[0,1],[1,2]]; // XZ bevels, XY bevels, then YZ bevels
  for(const E of cubes)for(const [i,j] of dirs)for(const si of [-1,1])for(const sj of [-1,1]){
    const offsetI=[0,0,0],offsetJ=[0,0,0];
    offsetI[i]=si*GRID;offsetJ[j]=sj*GRID;
    // Both adjacent sides must be unoccupied, so the entire bevel is real
    // exterior surface rather than an invisible inter-block seam.
    if(occupied.has(key(add(E.c,offsetI)))||occupied.has(key(add(E.c,offsetJ))))continue;
    const normal=[0,0,0],point=[0,0,0],up=[0,0,0];
    normal[i]=si;normal[j]=sj;
    point[i]=si*outer;point[j]=sj*outer;
    up[3-i-j]=1; // perpendicular to the screw's 45-degree direction
    const a=norm(normal),p=add(E.c,point);
    const priority=E.c[1]+(i===0&&j===2 ? .16 : i===0 ? .09 : .03);
    candidates.push({E,a,p,up,priority});
  }
  candidates.sort((a,b)=>b.priority-a.priority);
  const chosen=new Set(),limit=L>=250?6:3;
  let done=0;
  for(const {E,a,p,up} of candidates){
    if(done>=limit)break;
    if(L>3&&chosen.has(E))continue;
    // Keep the head and washer clear of existing fasteners and solid parts.
    if(M.screws.some(s=>Math.hypot(...sub(s.p,p))<.14))continue;
    if(rayHit(add(p,mul(a,.06)),a,.15,M.els,[E]))continue;
    const washer=el('plate',cylGeom(.077,.018,10),add(p,mul(a,.018)),
      frame(a,up),'#C1D2DD',{badge:true,diagonal:true,material:'metal'});
    M.els.push(washer);
    const screw=pin(M,washer,E,add(p,mul(a,.036)),a);
    screw.diagonal=true;
    chosen.add(E);done++;
  }
  // Extra screws must always complete a trio, including the tutorial levels.
  for(let k=0;k<done%3;k++){
    const screw=M.screws.pop();
    M.els.splice(M.els.indexOf(screw.thru),1);
    M.hold.pop();
  }
  if(done-(done%3)<3)throw new Error('대각선 나사 설치 공간이 부족해요');
}
// Harder missions use real, detachable guard straps: the screw under a strap
// cannot be extracted until the strap's own three fasteners are removed.
// Orientation alternates among vertical, horizontal and 45-degree screws.
// Every proposed obstacle is checked with the exact existing blocker logic;
// the full level solver below still rejects all impossible assemblies.
function addObstacleGates(M,L) {
  if(L<31)return;
  const gates=L>=500?3:L>=100?2:1, used=new Set();
  const orientation=s=>{
    const a=s.a, diagonal=[0,1,2].filter(i=>Math.abs(a[i])>.25).length>=2;
    return diagonal?'diagonal':Math.abs(a[1])>.9?'vertical':'horizontal';
  };
  const order=['vertical','horizontal','diagonal'];
  for(let g=0;g<gates;g++){
    const preferred=order[(L+g)%3];
    const candidates=M.screws.filter(s=>!used.has(s)&&s.state==='in'&&s.into?.kind==='block'
      &&s.thru?.kind==='plate'&&!rayHit(add(s.p,mul(s.a,HEAD_H+.01)),s.a,.24,M.els,[s.thru,s.into]));
    candidates.sort((a,b)=>(orientation(a)===preferred?-1:1)-(orientation(b)===preferred?-1:1)
      ||b.p[1]-a.p[1]);
    let placed=false;
    for(const target of candidates.slice(0,60)){
      const a=target.a,u=norm(cross(a,Math.abs(a[1])>.85?[0,0,1]:[0,1,0]));
      const R=frame(a,u),c=add(target.p,mul(a,.127));
      const gate=el('plate',boxGeom([.205,.026,.095]),c,R,'#9DAEBA',
        {badge:true,material:'metal',guard:true,guardTarget:target});
      if(M.els.some(o=>o!==target.thru&&o!==target.into&&o.state==='on'&&hitAny(box(gate),o)))continue;
      const newS=[-.15,0,.15].map(offset=>({
        p:add(add(c,mul(a,.032)),mul(u,offset)),a,thru:gate,into:target.into,
        color:0,state:'in',t:0,guard:true
      }));
      if(newS.some(s=>M.screws.some(z=>z!==target&&Math.hypot(...sub(s.p,z.p))<.135)))continue;
      const trial=mapLevel({name:M.name,els:[...M.els,gate],screws:[...M.screws,...newS]});
      trial.generating=true;
      if(newS.some(s=>blocked(s,trial))||blocked(target,trial)!==gate)continue;
      M.els.push(gate);M.screws.push(...newS);
      for(const s of newS)M.hold.push({p:s.p,n:a});
      used.add(target);placed=true;break;
    }
    if(!placed)break; // Never add an unverified obstacle.
  }
}
// During level creation, a screw is usable only if its extraction axis
// reaches the outside of the assembled toy. A 0.24-unit clearance test alone
// misses fasteners sealed behind a second, more distant plate or brick.
function exteriorHidden(s, M) {
  const {p,a}=screwPose(s), o=add(p,mul(a,HEAD_H+0.01)), skip=[s.thru,s.into];
  if (!M.exteriorReach) M.exteriorReach = 2.1 * Math.max(2,...M.els.map(e=>Math.hypot(...e.c)+Math.hypot(...e.geom.half)+Math.hypot(...(e.geom.cen||[0,0,0]))));
  if (gridHit(M,o,a,M.exteriorReach,skip)) return true;
  if (!M.exteriorSpecialNear) M.exteriorSpecialNear=new Map();
  let near=M.exteriorSpecialNear.get(s);
  if (!near) {
    near=M.special.filter(E=>{
      const v=sub(E.c,o), along=dot(v,a);
      const partsRadius=E.parts?.length?Math.max(...E.parts.map(part=>Math.hypot(...part.pc)+Math.hypot(...part.geom.half)+Math.hypot(...(part.geom.cen||[0,0,0])))):0;
      const r=Math.max(partsRadius,Math.hypot(...E.geom.half)+Math.hypot(...(E.geom.cen||[0,0,0])))+0.03;
      return along+r>=0&&along-r<=M.exteriorReach&&dot(v,v)-along*along<=r*r;
    });
    M.exteriorSpecialNear.set(s,near);
  }
  return !!rayHit(o,a,M.exteriorReach,near,skip);
}
function buildLevel(L, alt = false) {
  const raw=applyClassicStyle(sizedModel(L,alt));
  addAngledScrews(raw,L);
  addObstacleGates(raw,L);
  const M=mapLevel(raw), K=colorCount(L);   // 색상 수는 단계별 난이도 구간에 맞게 서서히 증가
  M.generating = true; // no falling or hinged parts during the solvability simulation
  const order = [], left = new Set(M.screws);
  while (left.size) {   // 지금 뺄 수 있는 나사를 한꺼번에(순서는 섞어서)
    const av = [...left].filter(s => !blocked(s, M) && !exteriorHidden(s, M));
    if (!av.length) throw new Error(M.name + ': 풀 수 없는 모양');
    for (let i = av.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [av[i], av[j]] = [av[j], av[i]]; }
    for (const s of av) { left.delete(s); order.push(s); s.state = 'sim'; }
    for (const s of av) for (const E of [s.thru, s.into]) if (E.state !== 'sim' && !M.refs.get(E).some(z => z.state === 'in')) E.state = 'sim';
  }
  M.els.forEach(e => { e.state = 'on'; }); M.screws.forEach(s => { s.state = 'in'; });
  const queue = [];
  for (let t = 0; t < order.length / 3; t++) { let c; do { c = t < K || L <= 3 ? t % K : Math.floor(Math.random() * K); } while (t >= 2 && c === queue[t - 1] && c === queue[t - 2]); queue.push(c); }
  order.forEach((s, i) => { s.color = queue[Math.floor(i / 3)]; s.solutionOrder = i + 1; });
  return applySculptedSkins({ name: M.name, els: M.els, screws: M.screws, queue, solution: order,
    grid: M.grid, gridEls: M.gridEls, special: M.special, mid: M.mid, refs: M.refs,
    staticSpecialNear: M.staticSpecialNear, staticScrewsNear: M.staticScrewsNear }, GRID);
}
// 작은 물건은 계단식 블럭 전시대 위에 올려서 나사 수를 맞춰요 (전시대도 블럭 사이에 판과 나사가 숨은 퍼즐)
function withPedestal(obj, T) {
  const drop = new Set(obj.screws.filter(z => z.a[1] < -0.9)); obj.screws = obj.screws.filter(z => !drop.has(z));
  obj.hold = obj.hold.filter(h => ![...drop].some(z => Math.hypot(...sub(z.p, h.p)) < 1e-6));
  obj.els = obj.els.filter(e => e.kind !== 'plate' || !e.flat || obj.screws.some(z => z.thru === e || z.into === e));
  const need = Math.max(8, T - obj.screws.length), nb = Math.max(4, Math.round(need / 2.6));
  let fp = 0; for (const e of obj.els) { const c = add(e.c, mv(e.R, e.geom.cen || [0, 0, 0])); fp = Math.max(fp, Math.hypot(c[0], c[2]) + Math.max(e.geom.half[0], e.geom.half[2]) * 0.8); }
  const k = 2; let m = 1, cnt = k * k; while (cnt < nb) { cnt += (k + 2 * m) * (k + 2 * m); m++; }   // 맨 위층은 2×2 (넓은 물건은 살짝 튀어나와요)
  const S = k + 2 * (m - 1), b = [];
  for (let j = 0; j < m; j++) { const sz = k + 2 * (m - 1 - j), o = (S - sz) / 2; for (let x = 0; x < sz; x++) for (let z = 0; z < sz; z++) b.push(cube(o + x, j, o + z, WOOD[(x + z + j) % 6])); }   // 가운데가 높은 계단 모양
  const topY = m * GRID, cx = S / 2 * GRID; let lo = Infinity; for (const e of obj.els) lo = Math.min(lo, e.c[1] + (e.geom.cen ? e.geom.cen[1] : 0) - e.geom.half[1]);
  const sh = [cx, topY - lo, cx]; obj.els.forEach(e => { e.c = add(e.c, sh); }); obj.screws.forEach(z => { z.p = add(z.p, sh); }); obj.rects.forEach(r => { r.c = add(r.c, sh); }); obj.hold.forEach(h => { h.p = add(h.p, sh); });
  const base = obj.els.reduce((a, e) => (e.c[1] - e.geom.half[1] < a.c[1] - a.geom.half[1] ? e : a));
  const cellAt = p => b.find(q => Math.floor(p[0] / GRID) === q.cell[0] && q.cell[1] === m - 1 && Math.floor(p[2] / GRID) === q.cell[2]);
  return assemble(obj.name, b, { els: obj.els, pre: M => {
    M.screws.push(...obj.screws); M.hold.push(...obj.hold); M.rects.push(...obj.rects, rect([cx, topY, cx], Yax, [1, 0, 0], Math.min(fp, GRID), Math.min(fp, GRID)));
    const inside = (E, pt) => { if (E.parts) return false; const l = mv(tr(E.R), sub(pt, E.c)); return E.geom.faces.every(f => dot(f.n, sub(l, E.geom.verts[f.idx[0]])) <= 1e-4); };   // 물건 맨 아래에 깔린 조각을 전시대에 박아요: 위가 트인 자리에
    const solidEls = obj.els.filter(e => e.kind !== 'plate' && !e.parts), cands = []; let linked = 0;   // 위에서 내려다봤을 때 처음 보이는 조각을 뚫고 전시대까지 박아요 (낮은 조각부터)
    const topAt = (E, x, z) => { const lo2 = E.c[1] - E.geom.half[1] + (E.geom.cen ? E.geom.cen[1] : 0), hi2 = lo2 + 2 * E.geom.half[1]; let y = null; for (let yy = lo2 + 0.005; yy <= hi2; yy += 0.01) if (inside(E, [x, yy, z])) y = yy; return y; };
    for (let dx = -0.34; dx <= 0.341; dx += 0.085) for (let dz = -0.34; dz <= 0.341; dz += 0.085) { const x = cx + dx, z = cx + dz;
      let best = null; for (const E of solidEls) { const y = topAt(E, x, z); if (y !== null && (!best || y > best.y)) best = { E, y }; }
      if (best) cands.push({ x, z, E: best.E, y: best.y + 0.005, r: Math.hypot(dx, dz) }); }
    cands.sort((a, c) => a.y - c.y || c.r - a.r);
    for (const cd of cands) { if (linked >= 2) break; const q = [cd.x, cd.y, cd.z], B = cellAt(q);
      if (!B || !spotFree(M, q, Yax) || rayHit(add(q, [0, 0.05, 0]), Yax, 3, obj.els.filter(e => e !== cd.E), [])) continue; pin(M, cd.E, B, q, Yax); linked++; }
    if (!linked) throw new Error('전시대에 못 붙였어요');
    for (const E of solidEls) {   // 고정이 풀린 조각: 드러난 면을 찾아 다시 박아요 (아래 전시대 칸, 없으면 닿아 있는 조각에)
      if (M.screws.some(z => z.thru === E || z.into === E)) continue;
      const others = obj.els.filter(e => e !== E); let done = false;
      for (const f of E.geom.faces) { if (done) break; const n = mv(E.R, f.n); if (n[1] < -0.5) continue;
        const c0 = mul(f.idx.reduce((a, i) => add(a, mv(E.R, E.geom.verts[i])), [0, 0, 0]), 1 / f.idx.length), q = add(E.c, c0);
        if (!spotFree(M, q, n) || rayHit(add(q, mul(n, 0.05)), n, 3, others, [])) continue;
        const B = cellAt([q[0], topY - 0.01, q[2]]) || others.filter(e => e.kind !== 'plate').sort((a, c) => Math.hypot(...sub(a.c, E.c)) - Math.hypot(...sub(c.c, E.c)))[0];
        if (B) { pin(M, E, B, q, n); done = true; } }
    }
  } });
}

const HEAD_GEOM = cylGeom(DRAW_HEAD_R, DRAW_HEAD_H / 2, 12);
const SOCKET_GEOM = cylGeom(DRAW_HEAD_R*1.24, .010, 10);
const screwMeshes=new Map([[1,{head:HEAD_GEOM,seat:SOCKET_GEOM}]]);
// Divide the actual 3D cylinder surface into two solid-color halves.
// A rotated camera cannot make a rear color shine through the front face.
function twoToneHead(geom, second) {
  const sides=geom.faces.slice(0,12).map((f,i)=>i<6?{...f,paint:second}:f);
  return {...geom,faces:[...sides,
    {idx:[12,10,8,6,4,2,0],n:[0,1,0],paint:second},
    {idx:[0,22,20,18,16,14,12],n:[0,1,0]},
    {idx:[1,3,5,7,9,11,13],n:[0,-1,0],paint:second},
    {idx:[13,15,17,19,21,23,1],n:[0,-1,0]}]};
}
function screwMesh(scale,colorIndex){
  if(!screwMeshes.has(scale))screwMeshes.set(scale,{head:cylGeom(DRAW_HEAD_R*scale,DRAW_HEAD_H/2,12),seat:cylGeom(DRAW_HEAD_R*1.24*scale,.010,10)});
  const mesh=screwMeshes.get(scale),second=SECOND_COLORS[colorIndex];
  if(!second)return mesh;
  if(!mesh.twoTone)mesh.twoTone=new Map();
  if(!mesh.twoTone.has(colorIndex))mesh.twoTone.set(colorIndex,twoToneHead(mesh.head,second));
  return {head:mesh.twoTone.get(colorIndex),seat:mesh.seat};
}
const skinViewCache=new WeakMap();
function visibleSkinMesh(geom,owner){
  let saved=skinViewCache.get(geom);
  if(!saved){saved={neighbors:[...new Set(geom.faces.map(f=>f.boundary).filter(Boolean))]};skinViewCache.set(geom,saved);}
  const moving=!!(owner.dyn||owner.fall),hidden=saved.neighbors.map(e=>!moving&&e.state==='on'&&!e.dyn&&!e.fall);
  const stamp=hidden.map(Number).join('');if(saved.stamp===stamp)return saved.mesh;
  const hiddenParts=new Set(saved.neighbors.filter((_,i)=>hidden[i]));
  const verts=[],normals=[],map=new Map(),faces=[];
  for(const f of geom.faces){
    if(f.boundary&&hiddenParts.has(f.boundary))continue;
    const idx=f.idx.map(old=>{if(map.has(old))return map.get(old);const id=verts.length;
      map.set(old,id);verts.push(geom.verts[old]);if(geom.normals)normals.push(geom.normals[old]);return id;});
    faces.push({...f,idx});
  }
  saved.stamp=stamp;saved.mesh={...geom,verts,faces,normals:geom.normals?normals:null};return saved.mesh;
}
// 그리는 순서: 두 볼록한 도형 A, B가 겹쳐 보이면, A의 한 면(또는 B의 한 면)을 기준으로 상대가 통째로 바깥쪽에 있는지 보고
// 내 눈(카메라)이 어느 쪽에 있는지로 앞뒤를 정해요. 그 관계대로 뒤에서 앞으로 그리고, 정해지지 않으면 거리로 정해요.
function sepFront(A, B, cam) {   // 1: A가 앞, -1: B가 앞, 0: 모름
  for (const [n, p] of A.planes) { if (B.wv.every(v => dot(sub(v, p), n) >= -3e-4)) return dot(sub(cam, p), n) > 0 ? -1 : 1; }
  for (const [n, p] of B.planes) { if (A.wv.every(v => dot(sub(v, p), n) >= -3e-4)) return dot(sub(cam, p), n) > 0 ? 1 : -1; }
  return 0;
}
function hull2d(pts) {   // 화면에 비친 모양(볼록 껍질)
  const p = pts.map(q => [q.x, q.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function hullsOverlap(A, B) {   // 두 볼록 다각형이 화면에서 실제로 겹치나요? (0.5px 넘게)
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = a[1] - b[1], ny = b[0] - a[0], L = Math.hypot(nx, ny) || 1;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const q of A) { const d = (q[0] * nx + q[1] * ny) / L; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const q of B) { const d = (q[0] * nx + q[1] * ny) / L; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + 0.5 || b1 <= a0 + 0.5) return false;
  }
  return true;
}
const rankOf = it => (it.owner.p ? 2 : it.owner.kind === 'block' || it.owner.kind === 'arch' ? 0 : 1);   // 나사 > 판·바퀴 > 블럭
function paintOrder(items, cam) {
  for (const it of items) if (!it.hull) it.hull = hull2d(it.pv || it.polys.flatMap(pg => pg.pts));   // 빠른 그리기에서 넘어온 판: 필요할 때 계산
  const n = items.length, after = items.map(() => []), deg = new Array(n).fill(0);   // after[i]: i보다 나중(앞)에 그릴 것들
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = items[i].bb, b = items[j].bb; if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
    if (!hullsOverlap(items[i].hull, items[j].hull)) continue;   // 화면에서 안 겹치면 순서가 상관없어요
    let f = sepFront(items[i], items[j], cam); if (!f) { const ra = rankOf(items[i]), rb = rankOf(items[j]); f = ra !== rb ? (ra > rb ? 1 : -1) : (items[i].z >= items[j].z ? 1 : -1); }
    if (f > 0) { after[j].push(i); deg[i]++; } else { after[i].push(j); deg[j]++; }
  }
  const out = [], ready = [], done = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (!deg[i]) ready.push(i);
  while (out.length < n) {
    if (!ready.length) { let k = -1; for (let i = 0; i < n; i++) if (!done[i] && (k < 0 || deg[i] < deg[k] || (deg[i] === deg[k] && rankOf(items[i]) < rankOf(items[k])))) k = i; ready.push(k); deg[k] = 0; }   // 고리가 생기면 순서를 가장 적게 어기는 것부터(매번 같은 방식)
    ready.sort((x, y) => items[y].z - items[x].z); const i = ready.pop(); if (done[i]) continue; done[i] = true; out.push(items[i]);
    for (const j of after[i]) if (!done[j] && --deg[j] === 0) ready.push(j);
  }
  return out;
}
// 화면의 같은 점에서 면까지의 역거리. 값이 큰 면이 가까워요.
function screenDepth(n, p, V, sc, zm, pan) {
  const nv = mv(V, n), pv = mv(V, p), s = SC * zm / sc, cz = F * sc;
  const den = dot(nv, sub(pv, [0, 0, cz]));
  if (Math.abs(den) < 1e-9) return null;
  return [nv[0] / (s * den), -nv[1] / (s * den), (-nv[0] * (CX + pan[0]) / s + nv[1] * (CY + pan[1]) / s - nv[2] * cz) / den];
}
const depthAt = (d, p) => d[0] * p.x + d[1] * p.y + d[2];
const polyArea = p => p.reduce((v, q, i) => { const r = p[(i + 1) % p.length]; return v + q.x * r.y - q.y * r.x; }, 0);
function clipHalf(poly, distance) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}
function subtractPoly(poly, cut) {
  if (cut.length < 3 || Math.abs(polyArea(cut)) < 0.001) return [poly];
  const sign = Math.sign(polyArea(cut)), out = []; let rest = poly;
  for (let i = 0; i < cut.length && rest.length >= 3; i++) {
    const a = cut[i], b = cut[(i + 1) % cut.length], dist = p => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const outside = clipHalf(rest, p => -dist(p)); if (outside.length >= 3 && Math.abs(polyArea(outside)) > 0.001) out.push(outside);
    rest = clipHalf(rest, dist);
  }
  return out;
}
const bounds2 = p => [Math.min(...p.map(q => q.x)), Math.min(...p.map(q => q.y)), Math.max(...p.map(q => q.x)), Math.max(...p.map(q => q.y))];
const boundsOverlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function maskScrews(items, xrayOn, masks = [], rotationPreview = false) {
  // Screen-space buckets avoid checking every visible face for every screw.
  const faces = items.concat(masks).filter(it => !it.owner.p && !it.isSkin && it.owner !== xrayOn && it.alpha > 0.5)
    .flatMap(it => it.polys.filter(pg => pg.depth).map(pg => ({ pg, bb: bounds2(pg.pts),owner:it.owner })));
  const TILE = 48, cols = Math.ceil(W / TILE), rows = Math.ceil(H / TILE);
  const tiles = Array.from({ length: cols * rows }, () => []);
  const tileRange = bb => {
    if (bb[2] < 0 || bb[0] > W || bb[3] < 0 || bb[1] > H) return null;
    return [Math.max(0, Math.floor(bb[0] / TILE)), Math.min(cols - 1, Math.floor(bb[2] / TILE)),
      Math.max(0, Math.floor(bb[1] / TILE)), Math.min(rows - 1, Math.floor(bb[3] / TILE))];
  };
  faces.forEach((f, i) => {
    const box = tileRange(f.bb); if (!box) return;
    for (let y = box[2]; y <= box[3]; y++) for (let x = box[0]; x <= box[1]; x++)
      tiles[y * cols + x].push(i);
  });
  for (const it of items) if (it.owner.p) for (const pg of it.polys) {
    pg.visible = [pg.pts]; if (!pg.depth) continue;
    const bb = bounds2(pg.pts), box = tileRange(bb); if (!box) continue;
    if(rotationPreview){
      // On very dense levels, while the camera is *moving* and the tiny
      // screw heads cannot be selected, keep their centre occlusion exact.
      // Releasing the drag immediately restores full polygon clipping for
      // picking and partially exposed screw heads.
      const center={x:pg.pts.reduce((v,p)=>v+p.x,0)/pg.pts.length,
        y:pg.pts.reduce((v,p)=>v+p.y,0)/pg.pts.length};
      const ix=Math.floor(center.x/TILE),iy=Math.floor(center.y/TILE);
      if(ix>=0&&ix<cols&&iy>=0&&iy<rows){
        const depth=depthAt(pg.depth,center);
        for(const id of tiles[iy*cols+ix]){
          const other=faces[id],p=other.pg.pts;
          // Sculpted mounts sit on the actual curved silhouette, sometimes
          // *inside* the old cubic collider. That invisible collider must not
          // erase a visible surface screw; guard straps still occlude it.
          if(it.owner.skinMount&&(other.owner.skinGeom||other.owner.kind==='plate'&&!other.owner.guard))continue;
          if(center.x<other.bb[0]||center.x>other.bb[2]||center.y<other.bb[1]||center.y>other.bb[3])continue;
          if(depthAt(other.pg.depth,center)<=depth+1e-6)continue;
          let inside=false;
          for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>center.y)!==(p[j].y>center.y)
            &&center.x<(p[j].x-p[i].x)*(center.y-p[i].y)/(p[j].y-p[i].y)+p[i].x)inside=!inside;
          if(inside){pg.visible=[];break;}
        }
      }
      continue;
    }
    const neighbors = new Set();
    for (let y = box[2]; y <= box[3]; y++) for (let x = box[0]; x <= box[1]; x++)
      for (const id of tiles[y * cols + x]) neighbors.add(id);
    for (const i of [...neighbors].sort((a, b) => a - b)) {
      const other = faces[i]; if (!boundsOverlap(bb, other.bb)) continue;
      if(it.owner.skinMount&&(other.owner.skinGeom||other.owner.kind==='plate'&&!other.owner.guard))continue;
      const d = other.pg.depth.map((v, j) => v - pg.depth[j]);
      if(pg.pts.every(p=>depthAt(d,p)<=1e-6))continue;
      const fullFront=other.pg.pts.every(p=>depthAt(d,p)>1e-6);
      const front = fullFront?other.pg.pts:clipHalf(other.pg.pts, p => depthAt(d, p) - 1e-6);
      if (front.length < 3) continue;
      pg.visible = pg.visible.flatMap(p => subtractPoly(p, front)); if (!pg.visible.length) break;
    }
  }
}
// The animal's face, ears and tail are separate curved objects. Rendering
// them after the body without a depth test exposes their *back* surfaces.
// Clip only these details and screw heads against the nearer body triangles;
// the body remains batched for fast Canvas drawing on mobile devices.
function maskSculptDetails(items, xrayOn) {
  const details=items.filter(it=>it.owner.faceFeature||it.owner.p);
  if(!details.length)return;
  const TILE=48,cols=Math.ceil(W/TILE),rows=Math.ceil(H/TILE);
  const tiles=Array.from({length:cols*rows},()=>[]),faces=[];
  const range=bb=>bb[2]<0||bb[0]>W||bb[3]<0||bb[1]>H?null:[
    Math.max(0,Math.floor(bb[0]/TILE)),Math.min(cols-1,Math.floor(bb[2]/TILE)),
    Math.max(0,Math.floor(bb[1]/TILE)),Math.min(rows-1,Math.floor(bb[3]/TILE))];
  for(const it of items){
    if(!it.isSkin||it.owner===xrayOn||it.alpha<=0.5)continue;
    for(const pg of it.polys){
      if(!pg.depth)continue;
      const bb=bounds2(pg.pts),r=range(bb);if(!r)continue;
      const id=faces.length;faces.push({pg,bb});
      for(let y=r[2];y<=r[3];y++)for(let x=r[0];x<=r[1];x++)tiles[y*cols+x].push(id);
    }
  }
  for(const it of details)for(const pg of it.polys){
    if(it.owner.faceFeature)pg.visible=[pg.pts];
    if(!pg.depth||!pg.visible?.length)continue;
    const bb=bounds2(pg.pts),r=range(bb);if(!r)continue;
    const seen=new Set();
    for(let y=r[2];y<=r[3];y++)for(let x=r[0];x<=r[1];x++)
      for(const id of tiles[y*cols+x])seen.add(id);
    for(const id of seen){
      const other=faces[id];if(!boundsOverlap(bb,other.bb))continue;
      // Inverse screen depth is larger for the surface closer to the eye.
      // Split crossing triangles at the actual depth intersection instead
      // of hiding an entire ear, eye or screw when only its rear is covered.
      const delta=other.pg.depth.map((v,i)=>v-pg.depth[i]);
      if(pg.pts.every(p=>depthAt(delta,p)<=1e-6))continue;
      const cut=other.pg.pts.every(p=>depthAt(delta,p)>1e-6)
        ?other.pg.pts:clipHalf(other.pg.pts,p=>depthAt(delta,p)-1e-6);
      if(cut.length<3)continue;
      pg.visible=pg.visible.flatMap(p=>subtractPoly(p,cut));
      if(!pg.visible.length)break;
    }
  }
}
const LENS_R = 80;   // 투시 돋보기 반지름(px)
function circleHitsHull(cx, cy, r, H) {   // 원이 볼록 다각형과 겹치나요?
  let inside = true;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1;
    if (ex * (cy - a[1]) - ey * (cx - a[0]) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((cx - a[0]) * ex + (cy - a[1]) * ey) / L2));
    if (Math.hypot(cx - (a[0] + ex * t), cy - (a[1] + ey * t)) < r) return true;
  }
  return inside;
}
const inHull = (x, y, H) => { for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -0.5) return false; } return true; };
// ---------- 미션: 판마다 하나, 성공하면 보너스 ----------
function pickMission(L, lvl) {
  const tier = difficultyTier(L);
  const hid = lvl.screws.reduce((n, s) => n + !!blocked(s, lvl), 0);
  const n = lvl.screws.length;
  // Optional bonus goals also ramp up slowly. No mission requires buying ZU.
  const pool = ['nobuf', 'time', 'nomiss'];
  if (tier >= 2) pool.push('turns');
  if (tier >= 1 && hid >= 2) pool.push('find');
  if (tier >= 5 && hid >= 2) pool.push('find');
  const id = L === 1 ? (hid ? 'find' : 'nobuf') : tier === 0 ? 'nobuf'
    : pool[Math.floor(Math.random() * pool.length)];
  const findTarget = [1, 1, 2, 2, 3, 3, 4][tier];
  const timePerScrew = [7, 6, 5.7, 5.3, 5.0, 4.8, 4.6][tier];
  const rotationDivisor = [3, 3.3, 3.6, 4.0, 4.5, 4.8, 5.2][tier];
  const need = id === 'find' ? Math.min(hid, findTarget)
    : id === 'time' ? Math.max(45, Math.round(n * timePerScrew))
    : id === 'turns' ? Math.max(8, Math.round(6 + lvl.els.length / rotationDivisor)) : 0;
  return { id, need, t: 0, bad: false, found: new Set(), turns: 0, bonus: 15 + L * 3 };
}
function missionText(ms) {
  if (ms.id === 'find') return `🔍 숨은 나사 ${ms.need}개를 투시로 찾기 (${Math.min(ms.found.size, ms.need)}/${ms.need})`;
  if (ms.id === 'nobuf') return `🧺 보관 칸을 쓰지 않고 깨기 ${ms.bad ? '✗' : '✓'}`;
  if (ms.id === 'time') return `⏱ ${ms.need}초 안에 깨기 · ${Math.max(0, Math.ceil(ms.need - ms.t))}초 남음`;
  if (ms.id === 'nomiss') return `🎯 막힌·가려진 나사를 누르지 않고 깨기 ${ms.bad ? '✗' : '✓'}`;
  return `🔄 ${ms.need}번 이하로 돌려서 깨기 · ${ms.turns}번 돌림`;
}
const missionOk = ms => (ms.id === 'find' ? ms.found.size >= ms.need : ms.id === 'time' ? ms.t <= ms.need : ms.id === 'turns' ? ms.turns <= ms.need : !ms.bad);
// Versioned, member-scoped stage keys reset only box stages to 1. Old scores stay untouched.
const STAGE_KEY = 'ojjuda-screw-box-stage-v2';
const RESUME_KEY = 'ojjuda-screw-box-last-stage-v2';
const PURCHASE_KEY = 'ojjuda-screw-purchases-v2';
const ATTEMPT_KEY = 'ojjuda-screw-active-attempt-v1';
function stageStorageKey(prefix,api) { return prefix + ':' + String(api.getUserId?.() || 'guest'); }
function loadStage(api) { try { const v = Number(localStorage.getItem(stageStorageKey(STAGE_KEY,api))); return Number.isInteger(v) && v >= 1 && v <= STAGES ? v : 1; } catch (_) { return 1; } }
function saveStage(api,L) { try { localStorage.setItem(stageStorageKey(STAGE_KEY,api),String(Math.max(loadStage(api),L))); } catch (_) { /* 저장 못 해도 괜찮아요 */ } }
// Keep the last played level separate from the highest unlocked milestone.
function loadResumeStage(api) { try { const v = Number(localStorage.getItem(stageStorageKey(RESUME_KEY,api))); if (Number.isInteger(v) && v >= 1 && v <= STAGES) return Math.min(v,loadStage(api)); } catch (_) {} return loadStage(api); }
function saveResumeStage(api,L) { try { localStorage.setItem(stageStorageKey(RESUME_KEY,api),String(L)); } catch (_) { /* 저장 못 해도 괜찮아요 */ } }
function screw3d(api,startStage) {
  const initialStage = startStage === undefined ? loadResumeStage(api) : startStage;
  const depthRenderer=createScrewDepthRenderer();
  const st = { L: Number.isInteger(initialStage)&&initialStage>=1&&initialStage<=STAGES?Math.min(initialStage,loadStage(api)):1, attemptId:null, score: 0, lvl: null, qi: 0, boxes: [null, null], buf: Array(BUF_N).fill(null), fly: [], msg: '', msgT: 0, shake: null, over: 0, next: 0,
    yaw: 0.65, pitch: 0.45, drag: null, drawn: [], heads: new Map(), t: 0, lens: null, lensHold: false, revealed: [], zm: 1, pan: [0, 0], sc: 1, ptrs: new Map(), pinch: null, big: false };
  let buying = false, destroyed = false, ended = false;
  let restoreBlocked = false, retryAt = 0;
  let warmWorker = null, warmLevel = null;
  function prepareNextLevel(L) {
    if(L>STAGES||typeof Worker!=='function'||typeof setTimeout!=='function')return;
    setTimeout(()=>{
      if(destroyed||st.L!==L-1||warmWorker||warmLevel?.stage===L)return;
      try {
        const worker = new Worker('/screw3d-stage-worker.js?v=20261106-screwbox-exterior-path1',{type:'module'});
        warmWorker=worker;
        worker.onmessage=event=>{
          if(!destroyed&&st.L===L-1&&event.data?.stage===L&&event.data.level)
            warmLevel={stage:L,level:event.data.level};
          worker.terminate();if(warmWorker===worker)warmWorker=null;
        };
        worker.onerror=()=>{worker.terminate();if(warmWorker===worker)warmWorker=null;};
        worker.postMessage({stage:L});
      }catch(_) { /* unsupported browser: use the synchronous safe fallback */ }
    },1500);
  }
  const walletUser = api.getUserId?.() || null;
  const sameWallet = () => !destroyed && walletUser && api.getUserId?.() === walletUser;

  const activeAttemptKey = walletUser ? `${ATTEMPT_KEY}:${walletUser}` : null;
  function finishAttempt() {
    if(!activeAttemptKey||!st.attemptId)return;
    try{const record=JSON.parse(localStorage.getItem(activeAttemptKey)||'null');if(record?.id===st.attemptId)localStorage.setItem(activeAttemptKey,JSON.stringify({...record,done:true}));}catch(_){}
  }
  function selectAttempt(L,fresh=false) {
    const id=crypto.randomUUID();
    if(!activeAttemptKey)return id;
    try{
      const record=JSON.parse(localStorage.getItem(activeAttemptKey)||'null');
      if(!fresh&&record?.stage===L&&record?.done!==true&&uuid(record.id))return record.id;
      localStorage.setItem(activeAttemptKey,JSON.stringify({id,stage:L,done:false}));
    }catch(_){}
    return id;
  }
  const purchaseKey = L => walletUser ? `${PURCHASE_KEY}:${walletUser}:${L}:${st.attemptId}` : null;
  const uuid = s => typeof s === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
  function loadPurchases(L) {
    const empty = { paid: [], pending: {} }, key = purchaseKey(L);
    if (!key) return empty;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '{}'), seen = new Set();
      if (Array.isArray(raw.paid)) for (const p of raw.paid) {
        if ((p.kind !== 'box' && p.kind !== 'buffer') || !uuid(p.id) || seen.has(p.id)) continue;
        if (empty.paid.filter(q => q.kind === p.kind).length >= (p.kind === 'box' ? BOX_MAX - 2 : BUF_MAX - BUF_N)) continue;
        empty.paid.push({ kind: p.kind, id: p.id }); seen.add(p.id);
      }
      for (const kind of ['box', 'buffer']) if (uuid(raw.pending?.[kind]) && !seen.has(raw.pending[kind])) empty.pending[kind] = raw.pending[kind];
    } catch (_) { /* 저장 기록이 없으면 빈 상태에서 시작해요 */ }
    return empty;
  }
  function savePurchases() {
    const key = purchaseKey(st.L);
    if (!key) return false;
    try { localStorage.setItem(key, JSON.stringify(st.purchases)); return true; } catch (_) { return false; }
  }
  if (typeof window !== 'undefined') { window.__ojjScrew3d = st; window.__ojjS3d = { rayHit, pose, F, sepFront, LENS_R }; }   // 시험용
  // A freely rearranged color box keeps the screws already inside it. We
  // reserve each 3-screw group once, even if it is brought forward out of order.
  const newBox = () => {
    if (st.parkedBoxes?.length) return st.parkedBoxes.shift();
    while (st.qi < st.lvl.queue.length && st.takenGroups?.has(st.qi)) st.qi++;
    if (st.qi >= st.lvl.queue.length) return null;
    const q = st.qi++; st.takenGroups?.add(q);
    return { c: st.lvl.queue[q], q, n: 0, res: 0, close: 0 };
  };
  function say(m, t) { st.msg = m; st.msgT = t; }
  // Use the arcade's existing sound setting and sound engine.
  const sound = type => { try { api.playSfx?.(type); } catch (_) { /* audio is optional */ } };
  function start(L) { const fresh=!!st.attemptId; if(fresh)finishAttempt(); st.attemptId=selectAttempt(L,fresh); ended = false; st.over = 0; st.L = L;
    st.lvl = warmLevel?.stage === L ? warmLevel.level : makeLevel(L);
    if(['토끼','돼지','소'].includes(st.lvl.name)) {st.yaw=-0.67;st.pitch=.29;}
    warmLevel = null;
    if(warmWorker) {warmWorker.terminate();warmWorker=null;}
    st.ms = pickMission(L, st.lvl); saveResumeStage(api,L);
    // Start big objects in fast mode so the first rendered frame does not lag.
    st.big = st.lvl.screws.length + st.lvl.els.length > 100;
    let R = 0.5; for (const e of st.lvl.els) R = Math.max(R,
      Math.hypot(...add(e.c, e.geom.cen || [0, 0, 0])) + Math.max(...e.geom.half),
      e.skinFastGeom ? Math.hypot(...e.c) + Math.max(...e.skinFastGeom.half) : 0);
    st.modelRadius=R;
    st.sc = Math.max(1, R * SC / 135); st.zm = 1; st.pan = [0, st.sc > 1.05 ? -36 : 0]; st.qi = 0; st.parkedBoxes = []; st.takenGroups = new Set();
    st.sorting = 0; st.sorts = 0; st.detours = 0;
    st.boxes = [newBox(), newBox()]; st.buf = Array(BUF_N).fill(null); st.fly = []; st.next = 0; st.purchases = loadPurchases(L); st.appliedPurchaseIds = new Set(); restoreBlocked = false; say(`${L} / ${STAGES}단계 · ${st.lvl.name}`, 1.4);
    if (st.purchases.paid.length || Object.keys(st.purchases.pending).length) void verifyPurchases(false);
    prepareNextLevel(L+1);
  }
  // Keep numerical angles bounded, while allowing any number of full 360° turns in either direction.
  const wrapTurn = a => a % (Math.PI * 2);
  const view = () => mm(rx(st.pitch), ry(st.yaw));
  function project(p, V) { const q = mv(V, p), sc = st.sc, k = F / (F - q[2] / sc), s = SC * st.zm / sc; return { x: CX + st.pan[0] + q[0] * s * k, y: CY + st.pan[1] - q[1] * s * k, z: q[2], k }; }
  function zoomAt(f, x, y) { const z1 = Math.max(0.6, Math.min(9, st.zm * f)), vx = (x - CX - st.pan[0]) / st.zm, vy = (y - CY - st.pan[1]) / st.zm; st.pan = [x - CX - vx * z1, y - CY - vy * z1]; st.zm = z1; }
  const BTN = [{ x: 336, y: 406, t: '+', f: () => zoomAt(1.4, CX, CY) }, { x: 336, y: 444, t: '−', f: () => zoomAt(1 / 1.4, CX, CY) }, { x: 336, y: 482, t: '⤢', f: () => { st.zm = 1; st.pan = [0, st.sc > 1.05 ? -36 : 0]; } }];
  const canvasScale = () => { const n = Number(api.getCanvasScale?.()); return Number.isFinite(n) && n > 0 ? n : 1; };
  // Keep taps comfortable on narrow displays without widening a hit across a hidden screw.
  const touchRadius = () => Math.min(44, Math.max(20, 22 / Math.max(0.4, canvasScale())));
  const zoomBtn = (x, y) => {
    const reach = Math.min(45, Math.max(19, 22 / Math.max(0.4, canvasScale())));
    // Nearest control wins where 44px touch regions overlap.
    const b = BTN.filter(q => Math.abs(x - q.x) < reach && Math.abs(y - q.y) < reach)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
    return b && b.f;
  };
  const coins = () => { const n = api.getCoins?.(); return Number.isFinite(n) ? n : null; };
  function grantUpgrade(kind, id) {
    if (st.appliedPurchaseIds.has(id)) return;
    st.appliedPurchaseIds.add(id);
    if (kind === 'box' && st.boxes.length < BOX_MAX) { st.boxes.push(newBox()); pullFromBuffer(); }
    if (kind === 'buffer' && st.buf.length < BUF_MAX) st.buf.push(null);
  }
  function confirmPurchase(kind, id) {
    if (!st.purchases.paid.some(p => p.id === id)) st.purchases.paid.push({ kind, id });
    if (st.purchases.pending[kind] === id) delete st.purchases.pending[kind];
    savePurchases();
    grantUpgrade(kind, id);
  }
  async function verifyPurchases(settlePending) {
    if (buying || !api.buyScrew || !sameWallet()) return;
    buying = true; restoreBlocked = false;
    const L = st.L, purchases = st.purchases;
    try {
      for (const p of [...purchases.paid]) {
        let r;
        try { r = await api.buyScrew(p.kind, p.id, L, true, st.attemptId); } catch (_) { r = { reason: 'server_error' }; }
        if (!sameWallet()) { restoreBlocked = true; return; }
        if (r?.ok && r.stage === L && r.attempt_id === st.attemptId) grantUpgrade(p.kind, p.id);
        else if (['not_found', 'request_conflict', 'invalid'].includes(r?.reason)) { purchases.paid = purchases.paid.filter(q => q.id !== p.id); savePurchases(); }
        else restoreBlocked = true;
      }
      for (const kind of ['box', 'buffer']) {
        const id = purchases.pending[kind]; if (!id) continue;
        let r;
        try { r = await api.buyScrew(kind, id, L, true, st.attemptId); } catch (_) { r = { reason: 'server_error' }; }
        if (!sameWallet()) { restoreBlocked = true; return; }
        if (r?.ok && r.stage === L && r.attempt_id === st.attemptId) confirmPurchase(kind, id);
        else if (r?.reason === 'not_found') { if (settlePending) { delete purchases.pending[kind]; savePurchases(); } }
        else if (['request_conflict', 'invalid'].includes(r?.reason)) { delete purchases.pending[kind]; savePurchases(); }
        else restoreBlocked = true;
      }
    } finally { buying = false; retryAt = Date.now() + 3000; if (restoreBlocked) say('구매 내역을 확인하는 중이에요', 3); }
  }
  async function spend(kind, price) {
    if (buying || restoreBlocked) return false;
    const balance = coins();
    if (!sameWallet() || !api.buyScrew || (balance === null && !st.purchases.pending[kind])) { say('ZU 지갑이 연결되면 구매할 수 있어요', 1.4); return false; }
    if (balance < price && !st.purchases.pending[kind]) { say(`${price} ZU가 필요해요`, 1.2); return false; }
    if (!st.purchases.pending[kind]) {
      if (typeof globalThis.confirm === 'function' && !globalThis.confirm(`${price} ZU로 ${kind === 'box' ? '색상 상자' : '보관칸'}를 추가할까요? 현재 단계에서 사용할 수 있어요.`)) return false;
      st.purchases.pending[kind] = crypto.randomUUID();
      if (!savePurchases()) { delete st.purchases.pending[kind]; say('구매 기록을 저장할 수 없어요', 1.4); return false; }
    }
    buying = true; say('구매 중…', 2);
    try {
      const id = st.purchases.pending[kind], r = await api.buyScrew(kind, id, st.L, false, st.attemptId);
      if (!sameWallet()) { say('계정이 바뀌었어요. 게임을 다시 열어 주세요', 2); return false; }
      if (!r?.ok || r.stage !== st.L || r.attempt_id !== st.attemptId) {
        if (['coins', 'request_conflict', 'invalid'].includes(r?.reason)) { delete st.purchases.pending[kind]; savePurchases(); }
        say(r?.reason === 'coins' ? `${price} ZU가 필요해요` : '지금은 구매할 수 없어요', 1.4); return false;
      }
      confirmPurchase(kind, id);
      return true;
    } catch (_) { say('구매를 완료하지 못했어요', 1.4); return false; }
    finally { buying = false; }
  }
  async function buyBox() {   // 색상 상자 +1 (3 ZU, 해당 단계만)
    if (buying || restoreBlocked || st.over || st.next || st.boxes.length >= BOX_MAX) return;
    if (st.qi >= st.lvl.queue.length) { say('더 나올 색이 없어요', 1.1); return; }
    if (!await spend('box', 3)) return;
    say('색상 상자 +1 (3 ZU)', 0.9);
  }
  async function buyBuf() {   // 보관 칸 +1 (1 ZU, 해당 단계만)
    if (buying || restoreBlocked || st.over || st.next || st.buf.length >= BUF_MAX || !await spend('buffer', 1)) return;
    say('보관 칸 +1 (1 ZU)', 0.9);
  }
  const shopBtn = (x, y) => (st.boxes.length < BOX_MAX && x >= 344 - BUY_W && x <= 344 && y >= BOX_Y && y <= BOX_Y + BOX_H ? buyBox : st.buf.length < BUF_MAX && x >= 336 - BUY_W && x <= 336 && y >= BUF_Y && y <= BUF_Y + 50 ? buyBuf : null);
  function bestBox(color) {   // 같은 색 상자가 여럿이면 더 많이 찬 상자부터 채워요
    let bi = -1; st.boxes.forEach((b, i) => { if (b && !b.close && b.c === color && b.n + b.res < 3 && (bi < 0 || b.n + b.res > st.boxes[bi].n + st.boxes[bi].res)) bi = i; }); return bi;
  }
  function send(s, fx, fy) {
    const bi = bestBox(s.color); let to;
    if (bi >= 0) { const b = st.boxes[bi]; to = { kind: 'box', bi, ...boxHole(bi, b.n + b.res, st.boxes.length, st.boxes.length < BOX_MAX) }; b.res++; }
    else { const k = st.buf.indexOf(null); if (k < 0) return false; st.buf[k] = 'res'; to = { kind: 'buf', k, ...bufHole(k, st.buf.length, st.buf.length < BUF_MAX) }; if (st.ms.id === 'nobuf') st.ms.bad = true; st.detours++; }
    st.fly.push({ s, fx, fy, to, t: 0, wait: 0.34 }); return true;
  }
  function pullFromBuffer() {
    st.buf.forEach((s, k) => { if (!s || s === 'res') return; const bi = bestBox(s.color); if (bi < 0) return;
      const b = st.boxes[bi], h = bufHole(k, st.buf.length, st.buf.length < BUF_MAX); st.buf[k] = null; s.state = 'fly'; st.fly.push({ s, fx: h.x, fy: h.y, to: { kind: 'box', bi, ...boxHole(bi, b.n + b.res, st.boxes.length, st.boxes.length < BOX_MAX) }, t: 0, wait: 0 }); b.res++; });
  }
  // Wrong color order is allowed. If a player fills the temporary tray, a
  // no-ZU recovery swaps one current box with a future color group, preserving
  // partial boxes. Paid upgrades merely save the time spent rearranging.
  const SORT_X = 21, SORT_Y = 198, SORT_W = 122, SORT_H = 29;
  function chooseSort() {
    if (!st.buf?.some(v => v && v !== 'res') || !st.lvl) return null;
    const colors = new Map();
    for (const screw of st.buf) if (screw && screw !== 'res')
      colors.set(screw.color,(colors.get(screw.color)||0)+1);
    const candidates = [];
    // Bring back an already-started box if one of its colors is waiting.
    st.parkedBoxes.forEach((box,j) => {
      if (box && !box.close && box.n + box.res < 3 && colors.has(box.c))
        candidates.push({kind:'parked', j, c:box.c, priority:colors.get(box.c)*1000-box.q});
    });
    for(let j=st.qi;j<st.lvl.queue.length;j++){
      if (st.takenGroups.has(j)) continue;
      const c=st.lvl.queue[j];if(!colors.has(c))continue;
      candidates.push({kind:'future',j,c,priority:colors.get(c)*1000-j});
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    if(!candidates.length)return null;
    const slots=st.boxes.map((box,i)=>({box,i}))
      .filter(({box})=>box&&!box.close&&box.res===0)
      .sort((a,b)=>(a.box.n-b.box.n)||(b.box.q-a.box.q));
    if(!slots.length)return null;
    return {target:candidates[0],index:slots[0].i};
  }
  function completeSort() {
    const action=chooseSort();
    if(!action) { say('정리할 색상 상자가 없어요 · 다른 나사를 확인해 보세요',2);return; }
    const {target,index}=action, old=st.boxes[index];
    st.parkedBoxes.push(old);
    if(target.kind==='parked'){
      st.boxes[index]=st.parkedBoxes.splice(target.j,1)[0];
    } else {
      st.takenGroups.add(target.j);
      st.boxes[index]={c:target.c,q:target.j,n:0,res:0,close:0};
    }
    st.sorts++; pullFromBuffer();
    say('상자 색상을 바꿨어요 · 기존 나사는 보관돼요',2);
  }
  function organize() {
    if(st.sorting>0)return;
    if(!chooseSort()){ say('정리할 색상 나사를 보관칸에 먼저 모아 주세요',1.7);return; }
    st.sorting=8; say('색상 상자 정리 중 · 8초 소요',1.6);
  }
  const organizeBtn=(x,y)=> x>=SORT_X&&x<=SORT_X+SORT_W&&y>=SORT_Y&&y<=SORT_Y+SORT_H
    ? organize : null;
  function release(E) {   // 나사가 빠진 뒤: 판은 1개 남으면 그 나사로 매달리고, 하나도 없으면(블럭도) 떨어져요
    const left = (st.lvl.refs?.get(E) || st.lvl.screws).filter(s => s.state === 'in' && (s.thru === E || s.into === E));
    if (!left.length) {
      const q = pose(E), h = E.geom.half, m = 8 * h[0] * h[1] * h[2] + 1e-4;
      E.dyn = { c: q.c, R: q.R, v: mul(norm(q.c), 0.35), w: [(Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5], m, I: m * (h[0] * h[0] + h[1] * h[1] + h[2] * h[2]) / 3, sleep: 0, t: 0, age: 0 };
      E.hinge = null; st.lvl.els.forEach(o => { if (o.dyn) o.dyn.sleep = 0; });   // 받치던 게 빠졌을 수 있으니 모두 깨워요
    } else if (left.length === 1 && E.kind === 'plate' && !E.badge && !E.hinge && left[0].thru === E) {
      E.hinge = { p: left[0].p, a: left[0].a, th: 0, w: 0, ign: new Set(st.lvl.els.filter(o => o !== E && o.state === 'on' && !o.dyn && hitAny(box(E), o))) };
    }
  }
  function inPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
  const topAt = (x, y) => {
    if(x<0||x>W||y<SCENE_TOP||y>SCENE_BOTTOM)return null;
    let owner=null,nearest=-Infinity;
    // Use the same inverse eye depth as the pixel depth buffer. Object/type
    // painter order is not a picking rule, particularly at high zoom.
    for(const it of st.order||[]){
      if(it.alpha<=.5||it.owner===st.xrayOn||x<it.bb[0]||x>it.bb[2]||y<it.bb[1]||y>it.bb[3])continue;
      for(const pg of it.polys){
        if(!pg.depth||!(pg.visible||[pg.pts]).some(pts=>inPoly(x,y,pts)))continue;
        const depth=depthAt(pg.depth,{x,y});
        if(depth>nearest){nearest=depth;owner=it.owner;}
      }
    }
    return owner;
  };
  function pick(x, y) {   // 손가락 아래 가장 앞에 보이는 것, 조금 빗나가면 가까운 보이는 나사 (돋보기로 드러난 나사가 먼저)
    if(x<0||x>W||y<SCENE_TOP||y>SCENE_BOTTOM)return null;
    const o = topAt(x, y); if (o && o.p) return o;
    let best = null, bd = touchRadius();
    for (const [s, h] of st.heads) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd && topAt(h.x, h.y) === s) { bd = d; best = s; }
    }
    return best;
  }
  function tap(x, y) {
    if (buying || restoreBlocked || (walletUser && !sameWallet()) || st.over || st.next) return;
    const s = pick(x, y);
    if (!s || s.state !== 'in') {   // 조각 뒤에 가려진 나사를 누르면 알려만 줘요
      const V = view(), hid = st.lvl.screws.some(z => z.state === 'in' && (() => { const hp = headPoint(z, V); return Math.hypot(hp.x - x, hp.y - y) < 22; })());
      if (hid) { sound('blocked'); say('물체가 가리고 있어서 뺄 수 없어요', 1.1); if (st.ms.id === 'nomiss') st.ms.bad = true; } return;
    }
    const blocker = blocked(s, st.lvl);
    if (blocker) { st.shake = { s, t: 0.35 }; sound('blocked'); say(blocker.p ? '앞의 나사를 먼저 풀어 주세요' : '다른 조각이 막고 있어요', 0.9); if (st.ms.id === 'nomiss') st.ms.bad = true; return; }
    const h = st.heads.get(s) || { x, y };
    if (!send(s, h.x, h.y)) {
      const balance = coins(), canBuf = st.buf.length < BUF_MAX && balance >= 1, canBox = st.boxes.length < BOX_MAX && balance >= 3 && st.qi < st.lvl.queue.length;
      if (canBuf || canBox) { st.shake = { s, t: 0.35 }; say(canBuf ? '보관 칸이 가득 찼어요 · 칸을 사서 이어 가요 (1 ZU)' : '보관 칸이 가득 찼어요 · 상자를 사서 이어 가요 (3 ZU)', 1.8); return; }   // 살 수 있으면 끝내지 않아요
      // A bad move is not an immediate loss. The player may rearrange boxes
      // for free (8 seconds), purchase storage, or find another playable screw.
      sound('blocked');
      say('보관칸이 가득 찼어요 · 상자 정리(무료) 또는 아이템', 2.1);
      return;
    }
    s.state = 'out'; s.t = 0; sound('tap'); release(s.thru); release(s.into);
  }
  function headPoint(s, V) { const q=visibleScrewPose(s); return project(add(q.p,mul(q.a,DRAW_HEAD_H)),V); }
  start(st.L);
  return {
    get stage() { return st.L; },
    get levels() { return STAGES; },
    get unlockedStage() { return loadStage(api); },
    get stageCleared() { return !!st.next; },
    get stageFailed() { return ended && !st.next; },
    async prepareStageChoice() {
      if (destroyed || buying || (walletUser && !sameWallet())) return false;
      if (restoreBlocked || Object.keys(st.purchases.pending).length) await verifyPurchases(true);
      return !destroyed && !buying && !restoreBlocked && !(walletUser && !sameWallet()) && !Object.keys(st.purchases.pending).length;
    },
    continueStage(next) {
      if (destroyed || buying || restoreBlocked || (walletUser && !sameWallet()) || Object.keys(st.purchases.pending).length || !st.next || next !== st.L + 1 || next > STAGES) return false;
      saveStage(api,next); start(next); return true;
    },
    destroy() { finishAttempt(); destroyed = true; depthRenderer.destroy();if(warmWorker)warmWorker.terminate();warmWorker=null;warmLevel=null;
      st.drag = null; st.ptrs.clear(); st.pinch = null; st.lens = null; },
    onDown(x, y, id = 0) {
      st.ptrs.set(id, { x, y });
      if (st.ptrs.size >= 2) { const [a, b] = [...st.ptrs.values()]; st.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, zm0: st.zm, m0: [(a.x + b.x) / 2, (a.y + b.y) / 2], pan0: st.pan.slice() }; st.drag = null; st.lensHold = false; st.lens = null; return; }   // 두 손가락: 벌려서 확대, 끌어서 이동
      st.drag = { id, x, y, x0: x, y0: y, moved: false, t0: st.t }; if (st.lens && !st.lens.hold) st.lens = { x, y, hold: false, t: st.t };
    },
    onMove(x, y, id = 0) {
      if (st.ptrs.has(id)) st.ptrs.set(id, { x, y });
      if (st.pinch) { if (st.ptrs.size >= 2) { const [a, b] = [...st.ptrs.values()], d2 = Math.hypot(a.x - b.x, a.y - b.y), m = [(a.x + b.x) / 2, (a.y + b.y) / 2]; st.zm = Math.max(0.6, Math.min(9, st.pinch.zm0 * d2 / st.pinch.d0)); st.pan = [st.pinch.pan0[0] + m[0] - st.pinch.m0[0], st.pinch.pan0[1] + m[1] - st.pinch.m0[1]]; st.touched = true; } return; }
      const d = st.drag;
      if (d && d.id !== id) return; // another pointer cannot rotate this camera
      if (!d) { if (y > 196) st.lens = { x, y, hold: false, t: st.t }; else st.lens = null; return; }   // 마우스를 올리면 투시 돋보기
      if (st.lensHold) { st.lens = { x, y, hold: true, t: st.t }; d.x = x; d.y = y; return; }   // 꾹 누른 채 밀면 돋보기가 따라와요
      if (!d.moved && Math.hypot(x - d.x0, y - d.y0) > 7) { d.moved = true; st.lens = null; if (st.ms && !st.next) st.ms.turns++; }
      if (d.moved) { st.touched = true; st.yaw = wrapTurn(st.yaw + (x - d.x) * 0.011); st.pitch = wrapTurn(st.pitch + (y - d.y) * 0.011); } d.x = x; d.y = y;
    },
    onUp(x, y, id = 0) {
      if (!st.ptrs.has(id)) return; // ignore unrelated/repeated pointer-up events
      st.ptrs.delete(id);
      if (st.pinch) { if (!st.ptrs.size) st.pinch = null; st.drag = null; return; }
      const d = st.drag; st.drag = null;
      if (st.lensHold) { st.lensHold = false; st.lens = null; return; }   // 꾹 누르기는 보기만 해요
      if (d && !d.moved) { const sb = shopBtn(x, y); if (sb) { sb(); return; } const org = organizeBtn(x, y); if(org) { org(); return; } const bt = zoomBtn(x, y); if (bt) { bt(); st.touched = true; return; } tap(x, y); }
    },
    onCancel(id = 0) {
      // A cancelled touch must never count as a tap or trigger a ZU purchase.
      // Clear the entire gesture so the remaining pointer cannot accidentally tap.
      st.ptrs.clear(); st.pinch = null; st.drag = null;
      st.lensHold = false; st.lens = null;
    },
    onWheel(dy, x, y) { zoomAt(Math.exp(-dy * 0.0015), x, y); st.touched = true; },
    zoomControl(action) {
      if (destroyed || ended) return false;
      if (action === 'in') zoomAt(1.4, CX, CY);
      else if (action === 'out') zoomAt(1 / 1.4, CX, CY);
      else if (action === 'reset') { st.zm = 1; st.pan = [0, st.sc > 1.05 ? -36 : 0]; }
      else return false;
      st.touched = true;
      return true;
    },
    update(dt) {
      if (destroyed || ended || buying || st.next) return;
      if (walletUser && !sameWallet()) { restoreBlocked = true; say('계정이 바뀌었어요. 게임을 다시 열어 주세요', 3); return; }
      if (restoreBlocked) { if (Date.now() >= retryAt) void verifyPurchases(false); return; }
      st.t += dt; if (st.msgT > 0) st.msgT -= dt; if (st.shake && (st.shake.t -= dt) <= 0) st.shake = null;
      if (st.over) { st.over -= dt; if (st.over <= 0) { ended = true; sound('lose'); api.end(st.score, {outcome:'failure'}); } return; }
      if(st.sorting>0) { st.sorting=Math.max(0,st.sorting-dt); if(st.sorting===0)completeSort(); }
      if (st.drag && !st.drag.moved && !st.lensHold && st.t - st.drag.t0 > 0.3 && st.drag.y0 > 196) { st.lensHold = true; st.lens = { x: st.drag.x, y: st.drag.y, hold: true, t: st.t }; if (!st.lensTold) { st.lensTold = true; say('손 댄 조각이 투명해져요 · 가려진 나사는 돌려서 빼요', 1.9); } }
      if (st.lens && !st.lens.hold && st.t - st.lens.t > 2) st.lens = null;
      // The toy rotates relative to the room. Keep physical gravity directed
      // toward the visible floor, even when the model is turned upside down.
      // Convert world/screen down into the model's local physics coordinates.
      const g = mv(tr(view()), [0,-1,0]);
      const fixed = st.lvl.els.filter(o => o.state === 'on' && !o.dyn);
      for (const E of st.lvl.els) {
        if (E.state !== 'on') continue;
        if (E.hinge) {
          const r = sub(pose(E).c, E.hinge.p), tq = dot(E.hinge.a, cross(r, g)), I = dot(r, r) + 0.02, th0 = E.hinge.th;
          E.hinge.w += tq * 9 / I * dt; E.hinge.w *= 1 - 1.8 * dt; E.hinge.th += E.hinge.w * dt;
          const me = box(E);
          for (const o of fixed) { if (o === E || E.hinge.ign.has(o) || Math.hypot(...sub(o.c, me.c)) > Math.hypot(...o.geom.half) + Math.hypot(...(o.geom.cen || [0, 0, 0])) + Math.hypot(...E.geom.half)) continue; if (hitAny(me, o)) { E.hinge.th = th0; E.hinge.w *= -0.25; break; } }   // 다른 조각에 닿으면 되튕겨요
        }
      }
      const obstacles = fixed.concat(st.lvl.els.filter(o => o.state === 'on' && o.dyn && o.dyn.sleep > 0.6));
      const gravity = mul(g, 4.2);
      const physicsDt = Math.min(Math.max(dt, 0), 0.05); // no large hidden-tab collision leap
      let nearby = () => obstacles;
      if (obstacles.length > 75 && st.lvl.els.some(e => e.state === 'on' && e.dyn && e.dyn.sleep <= 0.6)) {
        // Broadphase: the X-interval of every obstacle is indexed once per
        // frame; only overlapping bins reach the original exact OBB test.
        const size = 0.8, bins = new Map(), index = new Map(obstacles.map((o,i) => [o,i]));
        for (const o of obstacles) {
          const r = o.rad || (o.rad = Math.hypot(...o.geom.half) + Math.hypot(...(o.geom.cen || [0,0,0])));
          const x = pose(o).c[0];
          for (let i = Math.floor((x-r)/size); i <= Math.floor((x+r)/size); i++) {
            if (!bins.has(i)) bins.set(i, []);
            bins.get(i).push(o);
          }
        }
        nearby = E => {
          const r = E.rad || (E.rad = Math.hypot(...E.geom.half) + Math.hypot(...(E.geom.cen || [0,0,0])));
          const extra = Math.hypot(...E.dyn.v) * physicsDt + 0.08;
          const x = E.dyn.c[0], seen = new Set();
          for (let i = Math.floor((x-r-extra)/size); i <= Math.floor((x+r+extra)/size); i++)
            for (const o of bins.get(i) || []) seen.add(o);
          return [...seen].sort((a,b) => index.get(a)-index.get(b));
        };
      }
      for (const E of st.lvl.els) {
        if (E.state !== 'on' || !E.dyn) continue;
        E.dyn.age = (E.dyn.age || 0) + Math.max(0, dt);
        if (E.dyn.age >= DETACHED_FADE_START + DETACHED_FADE_TIME) { E.state = 'gone'; continue; }
        const candidates = nearby(E);
        for (let k = 0; k < 3; k++) stepDyn(E, candidates, gravity, physicsDt / 3);
        if (Math.hypot(...E.dyn.c)>Math.max(4,st.modelRadius*3)||E.dyn.age>=DETACHED_FADE_START+DETACHED_FADE_TIME) E.state='gone';
      }
      for (const s of st.lvl.screws) if (s.state === 'out') { s.t += dt; if (s.t >= 0.34) s.state = 'fly'; }
      let landedInBuffer = false, matchedBox = false;
      for (const f of st.fly) {
        if (f.wait > 0) { f.wait -= dt; const h = st.heads.get(f.s); if (h) { f.fx = h.x; f.fy = h.y; } continue; }
        f.t += dt / 0.4; if (f.t < 1) continue;
        const s = f.s;
        if (f.to.kind === 'box') { const b = st.boxes[f.to.bi]; b.n++; b.res--; s.state = 'done'; st.score += 1; api.setScore(st.score); if (b.n === 3) { b.close = 0.0001; matchedBox = true; } }
        else { st.buf[f.to.k] = s; s.state = 'buf'; landedInBuffer = true; }
      }
      st.fly = st.fly.filter(f => f.wait > 0 || f.t < 1);
      if (matchedBox) sound('match');
      if (landedInBuffer) pullFromBuffer();   // 도착 전 예약 중에 같은 색 상자가 열렸을 수 있어요
      st.boxes.forEach((b, i) => { if (b && b.close) { b.close += dt / 0.45; if (b.close >= 1) { st.boxes[i] = newBox(); pullFromBuffer(); } } });
      if (!st.next) st.ms.t += dt;
      if (!st.next && st.lvl.screws.every(s => s.state === 'done') && !st.fly.length && st.lvl.els.every(e => e.state === 'gone')) {
        const ok = missionOk(st.ms); st.score += st.L * 10 + (ok ? st.ms.bonus : 0); api.setScore(st.score); api.saveScore?.(st.score); st.missions = (st.missions || 0) + (ok ? 1 : 0);
        st.next = 1; sound('win'); saveStage(api,Math.min(STAGES, st.L + 1)); finishAttempt();
        api.stageClear?.(st.score);
        return;
      }
      if (!st.touched) st.yaw = wrapTurn(st.yaw + dt * 0.25);   // 처음엔 천천히 돌며 보여 줘요
    },
    draw(c) {
      const changing = st.lvl.els.some(e => e.state === 'on' && (e.dyn || e.hinge || e.fall))
        || st.fly.length > 0 || st.drag || st.pinch || st.lens || st.shake
        || st.msgT > 0 || st.sorting > 0 || st.over > 0
        || st.boxes.some(b => b?.close) || !st.touched;
      const canvasW = c.canvas?.width, canvasH = c.canvas?.height;
      const stamp = [st.L, st.yaw, st.pitch, st.zm, ...st.pan, st.score,
        st.boxes.length, st.buf.length, st.next, coins(),
        Math.floor(st.ms?.t || 0), canvasW, canvasH, changing].join('|');
      // Arcade owns this persistent Canvas and never clears it between
      // draw() calls. Static scenes need no geometry work at all.
      if (!changing && st.lastPaintStamp === stamp && st.t - st.lastPaintT < 2) return;
      st.lastPaintStamp = stamp; st.lastPaintT = st.t;
      // Fullscreen/tablet canvas may have been reallocated by a resize or
      // browser graphics reset. Always restore the 360x540 logical scale
      // before clearing. Otherwise the HUD covers only the top-left quarter
      // and old 3D frames remain visible outside the painted background.
      if (c.canvas && c.canvas.width > 0 && c.canvas.height > 0 && typeof c.setTransform === 'function') {
        c.setTransform(c.canvas.width / W, 0, 0, c.canvas.height / H, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, W, H);
      }
      st.coins = coins();
      if (!st.bg) { st.bg = c.createLinearGradient(0, 0, 0, H); st.bg.addColorStop(0, '#FBF3EA'); st.bg.addColorStop(0.55, '#F6E9DD'); st.bg.addColorStop(1, '#EFDFD0'); } c.fillStyle = st.bg; c.fillRect(0, 0, W, H);
      const remaining = st.lvl.screws.reduce((n, screw) => n + (screw.state === 'in' ? 1 : 0), 0);
      c.fillStyle = '#23264A'; c.font = 'bold 16px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(`${st.L}단계 · ${st.lvl.name}`, 20, 28);
      c.textAlign = 'right'; c.fillStyle = '#626894'; c.font = '13px sans-serif'; c.fillText(`🔩 ${remaining}${st.hiddenN ? ` · 숨은 ${st.hiddenN}` : ''}`, 340, 28);
      // Thin progress track sits between the title and the color-box area.
      c.fillStyle = 'rgba(75,89,130,0.13)'; c.fillRect(20, 43, 320, 4);
      const completedFraction = 1 - remaining / Math.max(1, st.lvl.screws.length);
      if (completedFraction > 0) { c.fillStyle = '#4B9D9A'; c.fillRect(20, 43, 320 * completedFraction, 4); }
      drawBoxes(c, st); drawBuffer(c, st);

      // Zoom/pan belongs to the play field, never the boxes, storage or HUD.
      c.save();c.beginPath();c.rect(0,SCENE_TOP,W,SCENE_BOTTOM-SCENE_TOP);c.clip();
      { const k2 = st.zm / st.sc; c.save(); c.translate(CX + st.pan[0], CY + st.pan[1] + 128 * k2); c.scale(1, 0.17); const g4 = c.createRadialGradient(0, 0, 0, 0, 0, 130 * k2); g4.addColorStop(0, 'rgba(35,38,74,0.20)'); g4.addColorStop(0.7, 'rgba(35,38,74,0.07)'); g4.addColorStop(1, 'rgba(35,38,74,0)'); c.fillStyle = g4; c.beginPath(); c.arc(0, 0, 130 * k2, 0, Math.PI * 2); c.fill(); c.restore(); }   // 부드러운 바닥 그림자
      const V = view(), camera=mv(tr(V),[0,0,F*st.sc]), Lg = norm([-0.35, 0.55, 0.75]), items = [], maskItems = [];
      const solid = (geom, R, pc, color, alpha, owner, bias, out, exposedFaces = null) => {   // 볼록한 도형 하나: 보이는 면만
        if(geom.closed)geom=visibleSkinMesh(geom,owner);
        if(!geom.faces.length)return;
        const VR = mm(V, R), wv = geom.verts.map(v => add(pc, mv(R, v))), pv = wv.map(w => project(w, V)), polys = [], planes = [];
        const planesGeom=geomPlanes(geom),plush=geom.sculpted||owner.material==='fabric';
        const vertexLight=geom.normals?.map(n=>Math.max(0,dot(mv(VR,n),Lg)));
        for (const [fi, f] of geom.faces.entries()) {
          if(f.boundary&&f.boundary.state==='on'&&!f.boundary.dyn&&!f.boundary.fall
            &&!owner.dyn&&!owner.fall)continue;
          if (exposedFaces && !(f.sides || [fi]).some(side => exposedFaces[side])) continue;
          const normal = planesGeom[fi].n, nw = mv(R, normal);
          if (!geom.sculpted||f.boundary) planes.push([nw, wv[f.idx[0]]]);
          const n = mv(VR, normal); if (dot(nw,sub(camera,wv[f.idx[0]])) <= 1e-7) continue;
          if (st.big && owner.flat && Math.abs(normal[1]) < 0.9) continue;
          const paint = f.paint || color, lit = Math.max(0, dot(n, Lg));
          const shadeK = -(1 - (plush ? (f.boundary ? .73+.27*lit : .90+.10*lit) : (0.69 + 0.31 * lit)));
          polys.push({ pts: f.idx.map(i => pv[i]), depth: screenDepth(nw, wv[f.idx[0]], V, st.sc, st.zm, st.pan), fill: shade(paint, geom.sculpted ? Math.round(shadeK*32)/32 : shadeK),
            colors:vertexLight&&!f.boundary?f.idx.map(i=>shade(paint,-.10+.10*vertexLight[i])):null,
            base:owner.faceFeature?paint:null, line: plush ? null : shade(paint, -0.28), up: nw[1], lit, soft: !!geom.soft, softCenter: !!f.center });
        }
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of pv) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        if (!polys.length) return; // nothing visible; skip sorting and painting entirely
        out.push({ z: project(pc, V).z + bias, polys, alpha, owner, wv: geom.sculpted&&!geom.closed ? [] : wv,
          planes, bb: [x0, y0, x1, y1], pv: geom.sculpted ? [] : pv, isSkin: !!geom.sculpted,
          hull: st.big ? null : hull2d(geom.sculpted ? [
            {x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}
          ] : pv) });
      };
      st.heads = new Map();
      const lv = st.lvl, alive = b => b && b.state === 'on' && !b.dyn;
      const covers = lv.els.filter(o => o.state === 'on' && !o.flat && (!lv.gridEls.has(o) || o.dyn || o.fall)).flatMap(o => shapes(o).map(sh => {
        const c = add(sh.c, mv(sh.R, sh.geom.cen || [0, 0, 0])), h = sh.geom.half;
        const span = [0, 1, 2].map(i => Math.abs(sh.R[i * 3]) * h[0] + Math.abs(sh.R[i * 3 + 1]) * h[1] + Math.abs(sh.R[i * 3 + 2]) * h[2]);
        return { sh, o, c, span };
      }));   // 움직이는 조각도 현재의 실제 모양으로 가려요
      const coverOf = (pt, ...ignore) => { const res = [], g = lv.grid && lv.grid.get(cellKey(pt, lv.mid)); if (alive(g) && !ignore.includes(g)) { const l = sub(pt, g.c); if (Math.abs(l[0]) < GRID / 2 - 0.003 && Math.abs(l[1]) < GRID / 2 - 0.003 && Math.abs(l[2]) < GRID / 2 - 0.003) res.push(g); }
        for (const { sh, o, c, span } of covers) { if (!ignore.includes(o) && Math.abs(pt[0] - c[0]) <= span[0] && Math.abs(pt[1] - c[1]) <= span[1] && Math.abs(pt[2] - c[2]) <= span[2] && shapeHit(pt, [0, 0, 0], 0, sh, 0.003)) res.push(o); } return res; };
      let hiddenN = 0; const found = new Set();   // 투시로 드러난 숨은 판·나사
      const fwd = mv(tr(V), [0, 0, 1]);
      for (const E of st.lvl.els) {
        if (E.state === 'gone') continue;
        if (E.visualMountOnly) continue;
        // Only prepare graphics for exposed cube faces; interior puzzle state
        // still exists for collision, screw order and scoring. When a neighbouring
        // cube falls, its previously hidden faces appear on the following frame.
        const exposedFaces = lv.gridEls.has(E) && !E.dyn && !E.fall && !E.hinge && E.cell
          ? CUBE_FACE_DIRS.map(n => !alive(lv.grid.get([E.cell[0] + n[0], E.cell[1] + n[1], E.cell[2] + n[2]].join(','))))
          : null;
        if (exposedFaces && !exposedFaces.some(Boolean)) continue;
        for (const sh of shapes(E)) {
          if(E.visualOffset)sh.c=add(sh.c,E.visualOffset);
          // Outside fragments are one continuous sculpted surface, shared by
          // adjoining removable bricks. Newly uncovered interior faces retain
          // their precise physical shape after another brick falls away.
          if (E.skinGeom && !E.hinge) {
            const skin = st.big ? E.skinFastGeom : E.skinGeom;
            if (skin.faces.length) solid(skin, sh.R, sh.c, sh.color, pieceOpacity(E), E,
              E.kind === 'block' ? 0 : 0.012, items);
            // A few physical cube faces are sufficient for exact screw
            // visibility; the hundreds of decorative skin triangles need not
            // participate in expensive per-screw polygon subtraction.
            continue;
          }
          if (E.kind === 'plate' && !E.dyn) {   // 블럭 밑에 깔린 판(쪽마다): 네 모서리 쪽 점이 모두 블럭 안이면 숨어요. 덮은 블럭을 투시하면 드러나요
            const u = [sh.R[0], sh.R[3], sh.R[6]], w = [sh.R[2], sh.R[5], sh.R[8]], hh = sh.geom.half, cs = [];
            for (const a of [0.6, -0.6]) for (const b2 of [0.5, -0.5]) cs.push(coverOf(add(sh.c, add(mul(u, a * hh[0]), mul(w, b2 * hh[2]))), E));
            if (cs.every(cv => cv.length)) { if (!(st.xrayOn && cs.some(cv => cv.every(o => o === st.xrayOn)))) continue; found.add(E); }
          }
          const geom = E.skinPlate && sh.geom === E.geom ? FABRIC_WASHER
            : E.geom.soft && sh.geom === E.geom && st.big ? SOFT_CUBE_FAST : sh.geom;
          solid(geom, sh.R, sh.c, E.skinPlate ? E.skinPlateColor : sh.color,
            pieceOpacity(E), E,
            E.kind === 'block' ? 0 : 0.012, items, exposedFaces);
        }
      }
      for (const s of st.lvl.screws) {   // 나사: 3D 머리(원기둥) + 십자 홈, 빠질 때는 돌며 솟아오르고 나삿대가 보여요
        if (s.state !== 'in' && s.state !== 'out') continue;
        const E = s.thru, rise = s.state === 'out' ? Math.min(1, s.t / 0.34) * 0.22 : 0, spin = s.state === 'out' ? s.t * 22 : 0;
        const {p,a}=visibleScrewPose(s);
        const headScale=s.skinMount?.drawScale||1,headRadius=DRAW_HEAD_R*headScale,headMesh=screwMesh(headScale,s.color);
        const u0 = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), R = mm(frame(a, u0), ry(spin + 0.6));
        const hc = add(p, mul(a, DRAW_HEAD_H / 2 + rise)), sh = st.shake && st.shake.s === s ? Math.sin(st.shake.t * 60) * 0.012 : 0;
        const hcs = add(hc, mul(u0, sh));
        const covering = s.state === 'in' ? coverOf(add(p,mul(a,DRAW_HEAD_H)),s.thru,s.into) : [];
        if (covering.length) hiddenN++;
        if (covering.length && !(st.xrayOn && covering.every(o => o === st.xrayOn))) continue;   // 블럭 밑에 깔린 나사
        if (s.state === 'in' && dot(a,norm(sub(mv(tr(V),[0,0,F*st.sc]),p))) <= .04) continue;
        if (covering.length) found.add(s);
        if(s.skinMount&&s.state==='in'&&!s.guard&&!st.big){
          const seat=add(p,mul(a,-.006));
          solid(headMesh.seat,frame(a,u0),seat,E.skinPlateColor||'#C9C5BE',1,s,0.025,items);
        }
        if (st.big && s.state === 'in') {   // 조각이 많으면 나사 머리를 팔각형 하나로 (빠르게)
          const ctr = add(hcs, mul(a, DRAW_HEAD_H / 2)), w0 = mv(R, [1, 0, 0]), w1 = mv(R, [0, 0, 1]), pts = [];
          for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; pts.push(project(add(ctr, add(mul(w0, Math.cos(an) * headRadius), mul(w1, Math.sin(an) * headRadius))), V)); }
          const col = COLORS[s.color], second=SECOND_COLORS[s.color], depth=screenDepth(a,ctr,V,st.sc,st.zm,st.pan);
          // Fast mode also has two genuine colored halves, not a translucent overlay.
          const headPolys = second
            ? [{pts:pts.slice(0,5),depth,fill:col,line:shade(col,-0.35)},
               {pts:pts.slice(4).concat(pts[0]),depth,fill:second,line:shade(second,-0.35)}]
            : [{pts,depth,fill:col,line:shade(col,-0.35)}];
          const it2 = { z: project(ctr, V).z + 0.03, polys: headPolys, alpha: 1, owner: s, wv: [], planes: [], bb: bounds2(pts), hull: null };
          if (dot(a, fwd) > 0.05) it2.cross = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([ux, uz]) => project(add(ctr, add(mul(w0, ux * headRadius * 0.62), mul(w1, uz * headRadius * 0.62))), V));
          items.push(it2); const hp = project(ctr, V); if (dot(a, fwd) > 0.12) st.heads.set(s, hp); continue;
        }
        const beforeHead=items.length;
        solid(headMesh.head, R, hcs, COLORS[s.color], 1, s, 0.03, items);
        if(items.length===beforeHead)continue;
        const it = items[items.length-1], top = mv(mm(V, R), [0, 1, 0]);
        if (top[2] > 0.05) { const e = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([ux, uz]) => project(add(hcs, mv(R, [ux * headRadius * 0.62, DRAW_HEAD_H / 2 + 0.001, uz * headRadius * 0.62])), V)); it.cross = e; }
        if (rise > 0) it.shaft = [project(p, V), project(add(p, mul(a, rise)), V)];
        const hp = project(add(hcs, mul(a, DRAW_HEAD_H / 2)), V); if (s.state === 'in' && top[2] > 0.12) st.heads.set(s, hp); else if (s.state === 'out') st.heads.set(s, hp);
      }
      // 조각이 많으면(340개 넘으면 켜고 290개 아래면 꺼요: 오가며 깜빡이지 않게) 거리순으로 빠르게 그려요
      const activePieces = lv.els.reduce((n,e) => n + (e.state === 'on'), 0)
        + lv.screws.reduce((n,s) => n + (s.state === 'in' || s.state === 'out'), 0);
      st.big = activePieces > 100 || (st.big ? items.length > 75 : items.length > 85); const order = st.big ? items.sort((a, b) => a.z - b.z) : paintOrder(items, mv(tr(V), [0, 0, F * st.sc])); st.drawn = []; st.order = order; st.cam = mv(tr(V), [0, 0, F * st.sc]); st.hiddenN = hiddenN; st.foundN = found.size; for (const f of found) if (f.p && st.ms) st.ms.found.add(f);
      const lens = st.lens; let target = null;
      if (lens) { let nearest = -Infinity, front = null; for (const it of order) for (const pg of it.polys) if (pg.depth && inPoly(lens.x, lens.y, pg.pts)) { const z = depthAt(pg.depth, lens); if (z > nearest) { nearest = z; front = it; } } if (front && !front.owner.p && !front.owner.dyn) target = front; }   // 실제 가장 앞에 있는 조각 하나만
      const tg = target ? target.owner : null; if (!st.xr || st.xr.o !== tg) st.xr = { o: tg, t0: st.t };
      const dwell = st.lens && st.lens.hold ? 0 : 0.3, xa = tg ? Math.min(1, Math.max(0, (st.t - st.xr.t0 - dwell) / 0.18)) : 0;   // 마우스는 잠깐 멈춰야 투시가 켜지고 서서히 바뀌어요
      st.xrayOn = xa > 0.5 ? tg : null; if (xa <= 0) target = null;
      maskScrews(order, st.xrayOn, maskItems,
        st.big && st.zm<1.5 && lv.screws.length>280 && (!st.touched||st.drag?.moved));
      // 나사는 앞면이 가린 영역을 잘라서 그려요. 조각 수·낙하·거리 정렬과 무관하게 같은 판정이에요.
      const plushToy=['토끼','돼지','소','펭귄'].includes(lv.name);
      if(order.some(it=>it.isSkin))maskSculptDetails(order,st.xrayOn);
      const depthPainted=depthRenderer.draw(c,order,target?.owner,1-.82*xa,SCENE_TOP,SCENE_BOTTOM);
      const opaqueItems=order.filter(q=>!q.owner.p);
      const paintLayers=plushToy?[
        ...opaqueItems.filter(q=>!q.isSkin&&!q.owner.guard&&!q.owner.faceFeature),
        ...opaqueItems.filter(q=>q.isSkin),
        ...opaqueItems.filter(q=>q.owner.faceFeature),
        ...opaqueItems.filter(q=>q.owner.guard)
      ]:opaqueItems;
      for (const it of [...paintLayers, ...order.filter(q => q.owner.p)]) {
        c.save(); c.globalAlpha = it.alpha * (target && it.owner === target.owner ? 1 - 0.82 * xa : 1);
        if (it.shaft) { c.strokeStyle = '#8C93B8'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(it.shaft[0].x, it.shaft[0].y); c.lineTo(it.shaft[1].x, it.shaft[1].y); c.stroke(); }
        if (it.owner.p) { c.beginPath(); for (const pg of it.polys) for (const pts of pg.visible) { pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); } c.clip(); }
        if(depthPainted){
          if(it.alpha>.5)for(const pg of it.polys)for(const pts of pg.visible||[pg.pts])
            st.drawn.push({pts,owner:it.owner});
          if(!it.owner.p){c.restore();continue;}
        }
        if (it.isSkin&&!depthPainted) {
          // Convex sculpt fragments don't self-overlap: paint every same-tone
          // triangle in one batch and avoid a Canvas fill/stroke per facet.
          const groups = new Map();
          for (const pg of it.polys) {
            if (!groups.has(pg.fill)) groups.set(pg.fill, []);
            groups.get(pg.fill).push(pg);
            if (it.alpha > 0.5) st.drawn.push({pts:pg.pts,owner:it.owner});
          }
          for (const [fill, polygons] of groups) {
            c.beginPath();
            for (const pg of polygons) { pg.pts.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y)); c.closePath(); }
            c.fillStyle = fill; c.fill();
          }
          c.restore();
          continue;
        }
        if(it.owner.faceFeature){
          // Fill a curved ear/cheek/eye as a *single* soft shape. Hundreds of
          // individually antialiased triangles leave distracting pink mesh
          // seams even when their wireframe stroke has been disabled.
          const groups=new Map();
          for(const pg of it.polys)for(const pts of pg.visible||[pg.pts]){
            const base=pg.base||pg.fill;
            if(!groups.has(base))groups.set(base,[]);
            groups.get(base).push(pts);
            if(it.alpha>0.5)st.drawn.push({pts,owner:it.owner});
          }
          for(const [base,parts] of groups){
            c.beginPath();
            for(const pts of parts){pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
            const g=c.createLinearGradient(it.bb[0],it.bb[1],it.bb[2],it.bb[3]);
            g.addColorStop(0,shade(base,.11));g.addColorStop(.5,base);g.addColorStop(1,shade(base,-.12));
            c.fillStyle=g;c.fill();
          }
          c.restore();continue;
        }
        for (const pg of depthPainted?[]:it.polys) {
          c.beginPath(); pg.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
          c.fillStyle = pg.fill; c.fill();
          // Fine surface cues for the original models. Gameplay and hit boxes
          // remain unchanged; avoid extra strokes in fast high-level scenes.
          const mat = it.owner.material;
          if (!st.big && mat && (!pg.soft || pg.softCenter) && pg.pts.length === 4 && pg.lit > 0.18) {
            const [p0, p1, p2, p3] = pg.pts;
            const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
            const strokeDetail = (col, x, y, xx, yy, width = 1) => {
              c.strokeStyle = col; c.lineWidth = width; c.beginPath();
              c.moveTo(x.x, x.y); c.lineTo(y.x, y.y); c.moveTo(xx.x, xx.y); c.lineTo(yy.x, yy.y); c.stroke();
            };
            if (mat === 'stone') {
              strokeDetail('rgba(68,58,49,0.10)', mix(p0,p3,.36),mix(p1,p2,.36),mix(p0,p1,.53),mix(p3,p2,.53));
            } else if (mat === 'fabric' || mat === 'leaf') {
              strokeDetail(mat === 'leaf' ? 'rgba(225,255,205,0.25)' : 'rgba(255,255,255,0.15)',
                mix(p0,p1,.18),mix(p3,p2,.72),mix(p0,p3,.73),mix(p1,p2,.25));
            } else if (mat === 'icing') {
              c.strokeStyle = 'rgba(255,255,255,0.36)'; c.lineWidth = 1.45;
              c.beginPath(); c.moveTo(p0.x,p0.y); c.lineTo(p1.x,p1.y); c.stroke();
            }
          }
          // Soft lacquer highlights on the detailed collections; keep high-poly stages fast.
          const material = it.owner.material;
          const showGloss = !st.big && (
            material === 'paint' || material === 'polished' ||
            material === 'glass' || material === 'ceramic' || material === 'metal' ||
            /스포츠카|타이타닉호|수박|돼지|소|토끼/.test(st.lvl.name));
          if (showGloss && (!pg.soft || pg.softCenter) && pg.lit > 0.4 && pg.pts.length >= 3 && it.owner.kind !== 'plate') {
            const p0 = pg.pts[0], p1 = pg.pts[Math.floor(pg.pts.length / 2)];
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1) {
              const g = c.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
              g.addColorStop(0, 'rgba(255,255,255,0.22)');
              g.addColorStop(0.55, 'rgba(255,255,255,0.04)');
              g.addColorStop(1, 'rgba(23,32,65,0.07)');
              c.fillStyle = g; c.fill();
            }
          }
          if (!st.big && it.owner.flat && pg.up !== undefined && pg.pts.length === 4 && pg.lit > 0.2) {   // 판: 금속 빛 번짐
            const g2 = c.createLinearGradient(pg.pts[0].x, pg.pts[0].y, pg.pts[2].x, pg.pts[2].y); g2.addColorStop(0, 'rgba(255,255,255,0.45)'); g2.addColorStop(0.5, 'rgba(255,255,255,0)'); g2.addColorStop(1, 'rgba(90,100,140,0.18)'); c.fillStyle = g2; c.fill(); }
          if(pg.line){c.lineWidth = pg.soft ? 0.5 : 1;c.strokeStyle=pg.soft?pg.fill:pg.line;c.stroke();}
          if (!st.big && (!pg.soft || pg.softCenter) && (!it.owner.material || it.owner.material === 'wood') && pg.up > 0.7 && it.owner.kind === 'block') {   // 블럭 윗면: 밝은 모서리 + 옅은 나뭇결
            c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = 1.2; c.stroke();
            if (pg.pts.length === 4) { const [p0, p1, p2, p3] = pg.pts; c.strokeStyle = 'rgba(120,80,40,0.09)'; c.lineWidth = 1; c.beginPath();
              for (const tt of [0.27, 0.5, 0.74]) { c.moveTo(p0.x + (p1.x - p0.x) * tt, p0.y + (p1.y - p0.y) * tt); c.lineTo(p3.x + (p2.x - p3.x) * (tt + 0.04), p3.y + (p2.y - p3.y) * (tt + 0.04)); } c.stroke(); } }
          if (it.alpha > 0.5) for (const pts of pg.visible || [pg.pts]) st.drawn.push({ pts, owner: it.owner });
        }
        if (it.cross && !st.big) { const cxh = (it.cross[0].x + it.cross[1].x) / 2, cyh = (it.cross[0].y + it.cross[1].y) / 2, rh = Math.hypot(it.cross[0].x - it.cross[1].x, it.cross[0].y - it.cross[1].y) / 1.24;   // 나사 머리 광택
          const g3 = c.createRadialGradient(cxh - rh * 0.35, cyh - rh * 0.4, 0, cxh, cyh, rh * 1.05); g3.addColorStop(0, 'rgba(255,255,255,0.55)'); g3.addColorStop(0.45, 'rgba(255,255,255,0.08)'); g3.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g3; c.beginPath(); c.arc(cxh, cyh, rh, 0, Math.PI * 2); c.fill();
          c.strokeStyle = 'rgba(30,30,60,0.28)'; c.lineWidth = 3.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(it.cross[0].x, it.cross[0].y); c.lineTo(it.cross[1].x, it.cross[1].y); c.moveTo(it.cross[2].x, it.cross[2].y); c.lineTo(it.cross[3].x, it.cross[3].y); c.stroke(); }
        if (it.cross) { c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = Math.min(2.4,Math.max(.45,Math.hypot(it.cross[0].x-it.cross[1].x,it.cross[0].y-it.cross[1].y)*.23)); c.lineCap = 'round'; c.beginPath(); c.moveTo(it.cross[0].x, it.cross[0].y); c.lineTo(it.cross[1].x, it.cross[1].y); c.moveTo(it.cross[2].x, it.cross[2].y); c.lineTo(it.cross[3].x, it.cross[3].y); c.stroke(); }
        c.restore();
      }
      c.restore();
      // Hit polygons have the same viewport clipping as the actual pixels.
      st.drawn=st.drawn.flatMap(pg=>{
        let pts=pg.pts;
        for(const distance of [p=>p.x,p=>W-p.x,p=>p.y-SCENE_TOP,p=>SCENE_BOTTOM-p.y])
          pts=clipHalf(pts,distance);
        return pts.length>=3?[{pts,owner:pg.owner}]:[];
      });
      // Color management difficulty and a free time-costly escape from a full tray.
      const sortable=chooseSort();
      c.save();
      rr(c,SORT_X,SORT_Y,SORT_W,SORT_H,11);
      c.fillStyle=st.sorting>0?'#D6DEE5':sortable?'#D9ECE8':'#EEE6DF';c.fill();
      c.lineWidth=1;c.strokeStyle=sortable?'#5AA59C':'#C9BFB5';c.stroke();
      c.fillStyle=sortable?'#246C63':'#7C7B82';c.font='bold 11px sans-serif';c.textAlign='center';c.textBaseline='middle';
      c.fillText(st.sorting>0?`정리 ${Math.ceil(st.sorting)}초`:'상자 정리 · 무료',SORT_X+SORT_W/2,SORT_Y+SORT_H/2);
      c.fillStyle='#586178';c.font='bold 11px sans-serif';c.textAlign='right';
      c.fillText(`색상 ${colorCount(st.L)}종 · 우회 ${st.detours}회`,336,SORT_Y+SORT_H/2);
      c.restore();
      for (const bt of BTN) { c.beginPath(); c.arc(bt.x, bt.y, 15, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(35,38,74,0.25)'; c.stroke(); c.fillStyle = '#4A4F7A'; c.font = 'bold 17px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bt.t, bt.x, bt.y + 1); }   // 확대·축소·가운데로
      for (const f of st.fly) {
        if (f.wait > 0) continue;
        const t = ease(Math.min(1, f.t)), x = f.fx + (f.to.x - f.fx) * t, y = f.fy + (f.to.y - f.fy) * t - Math.sin(Math.PI * t) * 46;
        drawScrew(c, x, y, f.s.color, f.t * 9, 1 + Math.sin(Math.PI * t) * 0.3);
      }
      if (st.msgT > 0 && st.msg) { c.save(); c.globalAlpha = Math.min(1, st.msgT * 3); c.font = 'bold 16px sans-serif'; const w = Math.max(200, c.measureText(st.msg).width + 60); rr(c, 180 - w / 2, 198, w, 44, 22); c.fillStyle = 'rgba(35,38,74,0.86)'; c.fill(); c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.fillText(st.msg, 180, 220); c.restore(); }
      if (!st.touched) { c.fillStyle = '#A38F7C'; c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillText('같은 색 3개씩 먼저 · 순서가 어긋나면 보관이 어려워요', 180, 504); }
      if (st.ms) { const ok = missionOk(st.ms), fail = (st.ms.id === 'nobuf' || st.ms.id === 'nomiss') && st.ms.bad || st.ms.id === 'time' && st.ms.t > st.ms.need || st.ms.id === 'turns' && st.ms.turns > st.ms.need;
        c.font = 'bold 12.5px sans-serif'; c.textAlign = 'center'; const txt = missionText(st.ms), w = c.measureText(txt).width + 24;
        rr(c, 180 - w / 2, 512, w, 22, 11); c.fillStyle = fail ? 'rgba(240,103,154,0.16)' : ok ? 'rgba(47,185,154,0.16)' : 'rgba(35,38,74,0.07)'; c.fill();
        c.fillStyle = fail ? '#C94C7C' : ok ? '#1F8F74' : '#4A4F7A'; c.fillText(txt, 180, 524); }
      c.textBaseline = 'alphabetic';
    }
  };
}

function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function drawScrew(c, x, y, colorIndex, rot, scale) {
  const color=COLORS[colorIndex],second=SECOND_COLORS[colorIndex];
  c.save(); c.translate(x, y); c.scale(scale, scale); c.rotate(rot);
  circ(c, 0, 1.5, 13.5); c.fillStyle = 'rgba(35,38,74,0.22)'; c.fill();
  circ(c, 0, 0, 13.5); c.fillStyle = shade(color, -0.28); c.fill();
  circ(c, 0, 0, 11); c.fillStyle = color; c.fill();
  if(second){
    c.beginPath();c.moveTo(0,-11);c.arc(0,0,11,-Math.PI/2,Math.PI/2);c.closePath();
    c.fillStyle=second;c.fill();
    c.beginPath();c.moveTo(0,-10);c.lineTo(0,10);c.strokeStyle='rgba(255,255,255,0.35)';c.lineWidth=1;c.stroke();
  }
  c.beginPath(); c.ellipse(-4, -5, 5, 3, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.moveTo(0, -6); c.lineTo(0, 6); c.stroke();
  c.restore();
}
function drawBoxes(c, st) {
  const nb = st.boxes.length, buy = nb < BOX_MAX, L = boxLay(nb, buy), sc = Math.min(0.92, L.sp / 42 * 0.95), hr = Math.min(14.5, L.sp * 0.36);
  c.save();c.beginPath();c.rect(0,BOX_Y-2,W,BOX_H+4);c.clip();
  st.boxes.forEach((b, i) => {
    const x = L.x(i), y = BOX_Y + (b && b.close ? -ease(b.close) * 26 : 0), a = b && b.close ? 1 - b.close : 1;
    c.save(); c.globalAlpha = a; rr(c, x, y, L.w, BOX_H, 16); c.fillStyle = b ? shade(COLORS[b.c], 0.78) : '#EADFD3'; c.fill();
    if(b && SECOND_COLORS[b.c]){
      c.save();rr(c,x,y,L.w,BOX_H,16);c.clip();
      c.fillStyle=shade(SECOND_COLORS[b.c],0.78);c.fillRect(x+L.w/2,y,L.w/2,BOX_H);
      c.restore();
    }
    c.lineWidth = 3; c.strokeStyle = b ? shade(COLORS[b.c], -0.08) : '#DCCFC2'; c.stroke();
    for (let k = 0; k < 3; k++) { const h = boxHole(i, k, nb, buy); circ(c, h.x, h.y + (y - BOX_Y), hr); c.fillStyle = 'rgba(35,38,74,0.14)'; c.fill(); }
    if (b) for (let k = 0; k < b.n; k++) { const h = boxHole(i, k, nb, buy); drawScrew(c, h.x, h.y + (y - BOX_Y), b.c, 0, sc); }
    if (b && b.close) { rr(c, x, y, L.w, 14 + ease(b.close) * (BOX_H - 14), 16); c.fillStyle = shade(COLORS[b.c], 0.2); c.fill(); }
    c.restore();
  });
  if (buy) { const bx = 344 - BUY_W; rr(c, bx, BOX_Y, BUY_W, BOX_H, 14); c.fillStyle = '#FFF0F1'; c.fill(); c.setLineDash([5, 4]); c.lineWidth = 2; c.strokeStyle = '#EDBDC4'; c.stroke(); c.setLineDash([]);   // 상자 사기 (3 ZU)
    c.fillStyle = '#A72E40'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 20px sans-serif'; c.fillText('+', bx + BUY_W / 2, BOX_Y + 22); c.font = 'bold 11px sans-serif'; c.fillText('상자', bx + BUY_W / 2, BOX_Y + 41); c.fillStyle = st.coins >= 3 ? '#A72E40' : '#93646D'; c.fillText('3 ZU', bx + BUY_W / 2, BOX_Y + 54); }
  c.restore();
}
function drawBuffer(c, st) {
  const n = st.buf.length, buy = n < BUF_MAX, L = bufLay(n, buy), sc = Math.min(0.92, L.sp / 58 * 1.05), hr = Math.min(15.5, L.sp * 0.3);
  rr(c, 24, BUF_Y, 312, 50, 25); c.fillStyle = '#E7D9CB'; c.fill();
  c.fillStyle = '#A38F7C'; c.font = '11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(`보관 칸 ${n}칸`, 180, BUF_Y - 9);
  c.textAlign = 'right'; c.fillStyle = '#8A6FB8'; c.font = 'bold 11px sans-serif'; c.fillText(`🪙 ${st.coins === null ? '지갑 연결 필요' : `${st.coins} ZU`}`, 336, BUF_Y - 9);
  const full = st.buf.filter(Boolean).length;
  for (let k = 0; k < n; k++) { const h = bufHole(k, n, buy); circ(c, h.x, h.y, hr); c.fillStyle = full >= n - 1 && !st.buf[k] ? 'rgba(240,103,154,0.28)' : 'rgba(35,38,74,0.14)'; c.fill(); const s = st.buf[k]; if (s && s !== 'res') drawScrew(c, h.x, h.y, s.color, 0, sc); }
  if (buy) { const bx = 336 - BUY_W; rr(c, bx + 3, BUF_Y + 5, BUY_W - 8, 40, 20); c.fillStyle = '#FFF0F1'; c.fill(); c.setLineDash([4, 3]); c.lineWidth = 1.6; c.strokeStyle = '#EDBDC4'; c.stroke(); c.setLineDash([]);   // 보관 칸 사기 (1 ZU)
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#A72E40'; c.font = 'bold 11px sans-serif'; c.fillText('+칸', bx + BUY_W / 2 - 1, BUF_Y + 18); c.fillStyle = st.coins >= 1 ? '#A72E40' : '#93646D'; c.fillText('1 ZU', bx + BUY_W / 2 - 1, BUF_Y + 32); }
  c.textBaseline = 'alphabetic';
}



export { MODELS, blocked, makeLevel, screw3d };
