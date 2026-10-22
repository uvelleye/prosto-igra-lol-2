/* Small shared helpers for prosto igra lol 2 */
(function () {
  "use strict";
  const P = (window.PIL2 = window.PIL2 || {});
  const TAU = Math.PI * 2;

  P.TAU = TAU;

  P.clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };

  P.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  P.smooth = function (t) {
    t = P.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  P.dist2 = function (ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };

  P.dist = function (ax, ay, bx, by) {
    return Math.sqrt(P.dist2(ax, ay, bx, by));
  };

  P.midiToFreq = function (m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  };

  P.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  P.randRange = function (rng, a, b) {
    return a + rng() * (b - a);
  };

  P.pick = function (rng, arr) {
    return arr[Math.floor(rng() * arr.length) % arr.length];
  };

  P.formatScore = function (n) {
    n = Math.max(0, Math.round(n));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  P.formatTime = function (seconds) {
    seconds = Math.max(0, seconds);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  };

  P.formatTimePrecise = function (seconds) {
    seconds = Math.max(0, seconds);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
  };

  /* ---------- path sampling ---------- */

  P.preparePath = function (points) {
    const cum = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += P.dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      cum.push(total);
    }
    return { points: points, cum: cum, total: total };
  };

  P.pointAtProgress = function (path, frac) {
    frac = P.clamp(frac, 0, 1);
    const pts = path.points;
    if (pts.length === 1) return pts[0];
    const target = frac * path.total;
    // binary-ish linear walk (paths are short)
    let i = 0;
    while (i < path.cum.length - 2 && path.cum[i + 1] < target) i++;
    const seg = path.cum[i + 1] - path.cum[i] || 1;
    const t = (target - path.cum[i]) / seg;
    return {
      x: P.lerp(pts[i].x, pts[i + 1].x, t),
      y: P.lerp(pts[i].y, pts[i + 1].y, t),
    };
  };

  /* Catmull-Rom through control points, returns dense polyline */
  P.catmullRom = function (points, perSegment) {
    perSegment = perSegment || 14;
    if (!points || points.length === 0) return [];
    if (points.length === 1) return [{ x: points[0].x, y: points[0].y }];
    const p = [points[0], ...points, points[points.length - 1]];
    const out = [];
    for (let i = 1; i < p.length - 2; i++) {
      const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
      for (let j = 0; j < perSegment; j++) {
        const t = j / perSegment;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
    return out;
  };

  /* ---------- local storage ---------- */
  P.bestKey = function (songId, diffKey) {
    return "pil2.best." + songId + "." + diffKey;
  };

  P.loadBest = function (songId, diffKey) {
    try {
      const raw = localStorage.getItem(P.bestKey(songId, diffKey));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  P.saveBest = function (songId, diffKey, data) {
    try {
      localStorage.setItem(P.bestKey(songId, diffKey), JSON.stringify(data));
    } catch (e) { /* private mode / file:// restrictions */ }
  };
})();
