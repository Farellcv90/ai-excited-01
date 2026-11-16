// ai-excited-01: "Aurora Phoenix" — a deterministic, stdlib-only procedural painting.
// Node 22, no dependencies, no network. Renders a 1024x1024 scene to
// /output/entry.png (or $MAKEFUN_OUTPUT_DIR): a fire-phoenix bursting out of
// a mountain lake under vivid aurora ribbons, stars, and a glowing comet tail.
// The same seed always produces the same bytes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT = join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png');

// ---- deterministic RNG (mulberry32) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261116);

// ---- float framebuffer ----
const px = new Float32Array(W * H * 3);
const idx = (x, y) => (y * W + x) * 3;

function add(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = idx(x | 0, y | 0);
  px[i] += r; px[i + 1] += g; px[i + 2] += b;
}
function set(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = idx(x | 0, y | 0);
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
}

// Soft radial glow, additive.
function glow(cx, cy, radius, r, g, b, strength) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / radius;
      const dy = (y - cy) / radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const f = strength * (1 - d2) * (1 - d2);
      const i = idx(x, y);
      px[i] += r * f; px[i + 1] += g * f; px[i + 2] += b * f;
    }
  }
}

// Distance from point to segment.
function segDist(pxx, pyy, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((pxx - ax) * dx + (pyy - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(pxx - cx, pyy - cy);
}

// Tapered glowing stroke along a polyline.
function stroke(points, width, r, g, b, strength) {
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x - width); maxX = Math.max(maxX, x + width);
    minY = Math.min(minY, y - width); maxY = Math.max(maxY, y + width);
  }
  minX = Math.max(0, Math.floor(minX)); maxX = Math.min(W - 1, Math.ceil(maxX));
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let d = Infinity;
      for (let s = 0; s < points.length - 1; s++) {
        d = Math.min(d, segDist(x + 0.5, y + 0.5, points[s][0], points[s][1], points[s + 1][0], points[s + 1][1]));
      }
      if (d > width) continue;
      const f = strength * (1 - (d / width) * (d / width));
      const i = idx(x, y);
      px[i] += r * f; px[i + 1] += g * f; px[i + 2] += b * f;
    }
  }
}

// Tapered plume: overlapping glows shrinking along the path, like a feather of fire.
function feather(points, w0, r, g, b, strength) {
  const n = points.length;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const w = w0 * (1 - t * 0.85);
    if (w < 0.6) continue;
    glow(points[k][0], points[k][1], w, r, g, b, strength * (1 - t * 0.4));
  }
}

// One curved feather fanning out from the core at `angle`, bending sideways by `bend`.
function plume(angle, len, w0, r, g, b, bend) {
  const ex = FX + Math.cos(angle) * len;
  const ey = FY + Math.sin(angle) * len;
  const mx = FX + Math.cos(angle) * len * 0.55 + Math.cos(angle + Math.PI / 2) * bend;
  const my = FY + Math.sin(angle) * len * 0.55 + Math.sin(angle + Math.PI / 2) * bend;
  feather(bezier([FX, FY], [mx, my], [mx, my], [ex, ey], 90), w0, r, g, b, 0.9);
}
function bezier(p0, p1, p2, p3, n) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

// ---- 1. Night sky: deep indigo -> violet -> teal horizon ----
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = 8 + 26 * t + 30 * t * t;
  const g = 6 + 30 * t * t + 46 * Math.pow(t, 3);
  const b = 42 + 78 * t - 20 * t * t;
  for (let x = 0; x < W; x++) set(x, y, r, g, b);
}

// ---- 2. Nebula clouds (soft additive blobs) ----
const nebulae = [
  [180, 180, 260, 90, 40, 130, 0.55],
  [880, 140, 220, 130, 50, 110, 0.45],
  [520, 90, 300, 60, 90, 150, 0.4],
  [760, 620, 200, 40, 60, 120, 0.35],
];
for (const [cx, cy, rad, r, g, b, s] of nebulae) glow(cx, cy, rad, r, g, b, s);

// ---- 3. Stars ----
for (let s = 0; s < 420; s++) {
  const x = rand() * W;
  const y = rand() * 640;
  const br = 0.35 + rand() * 0.65;
  const warm = rand();
  const r = 255 * br, g = (200 + 55 * warm) * br, b = (170 + 85 * (1 - warm)) * br;
  set(Math.floor(x), Math.floor(y), r, g, b);
  if (rand() < 0.12) {
    // bright star with tiny cross flare
    glow(x, y, 7, r * 0.5, g * 0.5, b * 0.5, 0.5);
    for (let k = -6; k <= 6; k++) {
      add(x + k, y, r * 0.12, g * 0.12, b * 0.12);
      add(x, y + k, r * 0.12, g * 0.12, b * 0.12);
    }
  }
}

// ---- 4. Aurora ribbons (diagonal, curtain-like) ----
function aurora(yBase, amp, phase, r, g, b, thick, strength) {
  for (let x = 0; x < W; x += 2) {
    const yc = yBase + amp * Math.sin(x * 0.004 + phase) + 26 * Math.sin(x * 0.011 + phase * 2);
    for (let y = Math.max(0, Math.floor(yc - thick)); y < Math.min(H, yc + thick); y++) {
      const d = Math.abs(y - yc) / thick;
      if (d >= 1) continue;
      // curtain rays: brightness varies along x
      const ray = 0.65 + 0.35 * Math.sin(x * 0.05 + y * 0.02 + phase);
      const f = strength * (1 - d) * (1 - d) * ray;
      const i = idx(x, y);
      px[i] += r * f; px[i + 1] += g * f; px[i + 2] += b * f;
      const i2 = idx(x + 1, y);
      px[i2] += r * f; px[i2 + 1] += g * f; px[i2 + 2] += b * f;
    }
  }
}
aurora(150, 70, 0.0, 40, 230, 170, 90, 0.55);   // teal-green
aurora(260, 90, 2.1, 200, 60, 220, 70, 0.45);   // magenta-violet
aurora(90, 50, 4.0, 60, 180, 255, 55, 0.4);     // cyan

// ---- 5. The phoenix burst: focal point at (690, 400) ----
const FX = 690, FY = 400;
glow(FX, FY, 320, 255, 150, 40, 0.9);   // huge golden halo
glow(FX, FY, 150, 255, 210, 90, 1.0);   // hot core
glow(FX, FY, 60, 255, 250, 220, 1.2);   // white-hot heart

// Radiant rays
for (let k = 0; k < 26; k++) {
  const a = (k / 26) * Math.PI * 2 + 0.13;
  const len = 120 + rand() * 260;
  const pts = [[FX, FY], [FX + Math.cos(a) * len, FY + Math.sin(a) * len]];
  stroke(pts, 2.5 + rand() * 2, 255, 190, 80, 0.35);
}

// Wings: fans of tapering fire-feathers bursting from the core, gold above,
// magenta below, with one teal accent feather for contrast — a phoenix,
// not a beam.
for (let k = 0; k < 8; k++) {
  const t = k / 7;
  const angle = -2.65 + t * 0.75;                    // up-left fan
  const len = 560 - t * 220 + rand() * 40;
  const hot = 1 - t;
  plume(angle, len, 15 + rand() * 9, 255, 110 + 90 * hot, 40 + 40 * t, -70 + t * 120);
  plume(angle, len * 0.7, 8, 255, 210, 90, -50 + t * 90); // hot inner core
}
for (let k = 0; k < 6; k++) {
  const t = k / 5;
  const angle = 0.35 + t * 0.65;                     // down-right fan
  const len = 430 - t * 150 + rand() * 30;
  plume(angle, len, 13 + rand() * 7, 255, 60 + 60 * t, 120 - 60 * t, 60 - t * 100);
}
plume(-1.25, 400, 11, 60, 220, 200, 80);             // teal accent feather

// Tail streamers trailing down-left with ember sparks
const tail = bezier([FX, FY], [520, 560], [380, 700], [240, 820], 48);
stroke(tail, 16, 255, 110, 40, 0.85);
stroke(tail, 7, 255, 220, 120, 0.95);
for (let s = 0; s < 90; s++) {
  const t = rand();
  const bx = (1 - t) * (1 - t) * (1 - t) * FX + 3 * (1 - t) * (1 - t) * t * 520 + 3 * (1 - t) * t * t * 380 + t * t * t * 240;
  const by = (1 - t) * (1 - t) * (1 - t) * FY + 3 * (1 - t) * (1 - t) * t * 560 + 3 * (1 - t) * t * t * 700 + t * t * t * 820;
  const jx = bx + (rand() - 0.5) * 70, jy = by + (rand() - 0.5) * 70;
  glow(jx, jy, 3 + rand() * 6, 255, 140 + rand() * 80, 40, 0.9);
}

// ---- 6. Mountain silhouettes (smooth ridgelines) ----
// Random control points, cosine-interpolated, so peaks read as mountains,
// not a skyline. Returns the ridge height function.
function ridge(seedOff, baseY, amp, col) {
  const n = 16;
  const cps = [];
  for (let k = 0; k <= n; k++) {
    cps.push(baseY + (rand() - 0.5) * amp + Math.sin(k * 0.9 + seedOff) * amp * 0.28);
  }
  const ridgeY = (x) => {
    const t = (x / W) * n;
    const k = Math.min(n - 1, Math.floor(t));
    const f = t - k;
    const s = (1 - Math.cos(f * Math.PI)) / 2;
    return cps[k] * (1 - s) + cps[k + 1] * s;
  };
  for (let x = 0; x < W; x++) {
    const yTop = ridgeY(x);
    for (let y = Math.max(0, Math.floor(yTop)); y < H; y++) set(x, y, col[0], col[1], col[2]);
  }
  // snow-lit rim along the ridge
  for (let x = 0; x < W; x++) {
    const yTop = Math.floor(ridgeY(x));
    for (let d = 0; d < 2; d++) {
      const i = idx(x, Math.min(H - 1, yTop + d));
      px[i] = Math.min(255, px[i] + 80 - d * 30);
      px[i + 1] = Math.min(255, px[i + 1] + 60 - d * 22);
      px[i + 2] = Math.min(255, px[i + 2] + 55 - d * 18);
    }
  }
  return ridgeY;
}
const farRidgeY = ridge(1.7, 640, 150, [16, 14, 44]);   // far ridge
const nearRidgeY = ridge(4.2, 760, 120, [9, 8, 28]);    // near ridge

// A tiny watcher on the near ridge, arms raised at the burst — scale and awe.
(function watcher() {
  const wx = 330;
  const feetY = Math.floor(nearRidgeY(wx));
  const dark = [4, 4, 10];
  // legs + body + head, silhouetted against the sky glow
  for (let y = feetY - 26; y <= feetY; y++) {
    const wdt = y > feetY - 8 ? 5 : y > feetY - 18 ? 4 : 3;
    for (let x = wx - wdt; x <= wx + wdt; x++) set(x, y, dark[0], dark[1], dark[2]);
  }
  glow(wx, feetY - 30, 5, 4, 4, 10, 1.0); // head
  // raised arms
  stroke([[wx - 3, feetY - 22], [wx - 16, feetY - 36]], 2, 4, 4, 10, 1.0);
  stroke([[wx + 3, feetY - 22], [wx + 16, feetY - 36]], 2, 4, 4, 10, 1.0);
  glow(wx + 24, feetY - 40, 7, 255, 190, 90, 0.8); // tiny lantern in hand
})();

// ---- 7. Lake: mirror of the burst + aurora, bottom band ----
for (let y = 860; y < H; y++) {
  const t = (y - 860) / (H - 860);
  for (let x = 0; x < W; x++) {
    // sample the sky mirrored, blurred by horizontal streaks
    const sy = Math.floor(860 - (y - 860) * 0.55 + Math.sin(x * 0.02 + y * 0.11) * 6);
    const si = idx(x, Math.max(0, Math.min(H - 1, sy)));
    const fade = (1 - t) * 0.9 + 0.15;
    const streak = 0.85 + 0.3 * Math.sin(x * 0.09 + y * 0.35);
    const i = idx(x, y);
    px[i] = px[si] * fade * streak + 10;
    px[i + 1] = px[si + 1] * fade * streak + 10;
    px[i + 2] = px[si + 2] * fade * streak + 22;
  }
}
// golden reflection column under the phoenix
for (let y = 860; y < H; y++) {
  for (let x = FX - 90; x < FX + 90; x++) {
    const d = Math.abs(x - FX) / 90;
    const wob = Math.sin(y * 0.22 + x * 0.05) * 14;
    if (Math.abs(x + wob - FX) / 90 > 1) continue;
    const f = (1 - d) * 0.55 * (1 - (y - 860) / 200);
    const i = idx(x, y);
    px[i] += 255 * f; px[i + 1] += 170 * f; px[i + 2] += 60 * f;
  }
}

// ---- 8. Vignette + gentle saturation lift ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
    const v = 1 - 0.28 * (dx * dx + dy * dy) * 0.5;
    const i = idx(x, y);
    const r = px[i] * v, g = px[i + 1] * v, b = px[i + 2] * v;
    const avg = (r + g + b) / 3;
    px[i] = avg + (r - avg) * 1.15;
    px[i + 1] = avg + (g - avg) * 1.15;
    px[i + 2] = avg + (b - avg) * 1.15;
  }
}

// ---- PNG encode (adaptive per-row filter, zlib) ----
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const row = Buffer.alloc(W * 3);
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    row[x * 3] = Math.max(0, Math.min(255, Math.round(px[i])));
    row[x * 3 + 1] = Math.max(0, Math.min(255, Math.round(px[i + 1])));
    row[x * 3 + 2] = Math.max(0, Math.min(255, Math.round(px[i + 2])));
  }
  const prev = y === 0 ? Buffer.alloc(W * 3) : raw.subarray((y - 1) * (1 + W * 3) + 1, y * (1 + W * 3));
  // try filters 0,1,2,3,4; keep the one with the smallest sum of |signed byte|
  let bestType = 0, bestScore = Infinity, bestRow = row;
  for (let f = 0; f <= 4; f++) {
    const out = Buffer.alloc(W * 3);
    let score = 0;
    for (let x = 0; x < W * 3; x++) {
      const left = x >= 3 ? row[x - 3] : 0;
      const up = prev[x];
      const upLeft = x >= 3 ? prev[x - 3] : 0;
      let pred = 0;
      if (f === 1) pred = left;
      else if (f === 2) pred = up;
      else if (f === 3) pred = (left + up) >> 1;
      else if (f === 4) pred = paeth(left, up, upLeft);
      const v = (row[x] - pred) & 0xff;
      out[x] = v;
      score += v < 128 ? v : 256 - v;
    }
    if (score < bestScore) { bestScore = score; bestType = f; bestRow = out; }
  }
  raw[y * (1 + W * 3)] = bestType;
  bestRow.copy(raw, y * (1 + W * 3) + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', { recursive: true });
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes, ${W}x${H})`);
