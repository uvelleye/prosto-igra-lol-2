/* Beatmap generator: random patterns locked to the 16th-note grid */
(function () {
  "use strict";
  const P = (window.PIL2 = window.PIL2 || {});

  const MARGIN = { x0: 0.085, x1: 0.915, y0: 0.072, y1: 0.678 };

  P.DIFFICULTIES = {
    easy: {
      key: "easy",
      name: "ЛЁГКИЙ",
      label: "EASY",
      stars: 2.2,
      starStr: "★★☆☆☆",
      desc: "РАЗОГРЕВ · МЕДЛЕННЫЕ ПРЫЖКИ",
      radius: 0.066,
      approach: 1180,
      w300: 88,
      w100: 155,
      w50: 220,
      missWindow: 255,
      sliderChance: 0.16,
      sliderBeats: [2, 4, 4],
      minGapBeats: 0.66,
      gapAfterSlider: 0.36,
      jumpMin: 0.16,
      jumpMax: 0.33,
      turn: 1.55,
      separation: 0.145,
      followScale: 1.95,
    },
    medium: {
      key: "medium",
      name: "СРЕДНИЙ",
      label: "MEDIUM",
      stars: 4.1,
      starStr: "★★★★☆",
      desc: "РИТМ УЛИЦ · 1/4 И 1/8",
      radius: 0.057,
      approach: 880,
      w300: 76,
      w100: 138,
      w50: 200,
      missWindow: 230,
      sliderChance: 0.13,
      sliderBeats: [1, 2, 3],
      minGapBeats: 0.22,
      gapAfterSlider: 0.26,
      jumpMin: 0.12,
      jumpMax: 0.38,
      turn: 2.1,
      separation: 0.125,
      followScale: 1.85,
    },
    hard: {
      key: "hard",
      name: "СЛОЖНЫЙ",
      label: "HARD",
      stars: 5.8,
      starStr: "★★★★★",
      desc: "НАСТОЯЩИЙ FOOTWORK · СТРИМЫ",
      radius: 0.049,
      approach: 670,
      w300: 64,
      w100: 120,
      w50: 178,
      missWindow: 205,
      sliderChance: 0.07,
      sliderBeats: [1, 2],
      minGapBeats: 0.1,
      gapAfterSlider: 0.22,
      jumpMin: 0.14,
      jumpMax: 0.44,
      turn: 2.55,
      separation: 0.108,
      followScale: 1.75,
    },
  };

  P.DIFF_ORDER = ["easy", "medium", "hard"];

  const PATTERNS = {
    easy: {
      intro: [[0, 8], [0]],
      A: [[0, 8], [0, 4, 8, 12], [0, 6, 8, 12], [0, 8, 12]],
      B: [[0, 4, 8, 12], [0, 8, 12], [0, 4, 8]],
      break: [[0, 8]],
      C: [[0, 4, 8, 12], [0, 8], [0, 6, 8, 12]],
    },
    medium: {
      intro: [[0, 8]],
      A: [
        [0, 4, 8, 12],
        [0, 4, 6, 8, 12],
        [0, 2, 4, 8, 12],
        [0, 4, 8, 10, 12],
        [0, 2, 4, 8, 10, 12],
      ],
      B: [
        [0, 4, 6, 8, 12, 14],
        [0, 2, 4, 8, 10, 12],
        [0, 4, 8, 12, 14],
        [0, 2, 4, 6, 8, 12],
      ],
      break: [[0, 8], [0, 4, 8, 12]],
      C: [
        [0, 4, 6, 8, 12, 14],
        [0, 2, 4, 8, 12],
        [0, 4, 8, 10, 12, 14],
        [0, 2, 4, 6, 8, 12],
      ],
    },
    hard: {
      intro: [[0, 4, 8, 12]],
      A: [
        [0, 2, 4, 6, 8, 10, 12, 14],
        [0, 1, 4, 6, 8, 10, 12, 14],
        [0, 2, 4, 6, 7, 8, 10, 12, 14],
        [0, 2, 4, 6, 8, 10, 11, 12, 14],
      ],
      B: [
        [0, 2, 4, 6, 8, 10, 12, 14, 15],
        [0, 1, 4, 6, 8, 10, 12, 14],
        [0, 2, 4, 6, 8, 9, 10, 12, 14],
      ],
      break: [[0, 4, 8, 12], [0, 8, 12]],
      C: [
        [0, 2, 4, 6, 8, 10, 12, 14],
        [0, 1, 4, 6, 8, 10, 12, 13, 14],
        [0, 2, 4, 6, 8, 10, 11, 12, 14, 15],
      ],
    },
  };

  function clampPoint(pt) {
    return {
      x: P.clamp(pt.x, MARGIN.x0, MARGIN.x1),
      y: P.clamp(pt.y, MARGIN.y0, MARGIN.y1),
    };
  }

  function makeSliderPath(start, heading, rng, cfg) {
    const control = [{ x: start.x, y: start.y }];
    let cur = control[0];
    let ang = heading + (rng() - 0.5) * 1.1;
    const segments = rng() < 0.42 ? 2 : 1;

    for (let i = 0; i < segments; i++) {
      ang += (rng() - 0.5) * 1.8;
      const len = P.randRange(rng, 0.1, 0.2);
      let nx = cur.x + Math.cos(ang) * len;
      let ny = cur.y + Math.sin(ang) * len * 0.82;

      if (nx < MARGIN.x0 || nx > MARGIN.x1) {
        ang = Math.PI - ang;
        nx = cur.x + Math.cos(ang) * len;
      }
      if (ny < MARGIN.y0 || ny > MARGIN.y1) {
        ang = -ang;
        ny = cur.y + Math.sin(ang) * len;
      }
      const next = clampPoint({ x: nx, y: ny });
      if (P.dist(next.x, next.y, cur.x, cur.y) < 0.055) break;
      control.push(next);
      cur = next;
    }

    let sampled = P.catmullRom(control, 16).map(clampPoint);
    if (sampled.length < 2) {
      sampled = [
        { x: start.x, y: start.y },
        { x: P.clamp(start.x + 0.12, MARGIN.x0, MARGIN.x1), y: start.y },
      ];
    }
    return sampled;
  }

  P.buildChart = function (song, diffKey, seed) {
    const cfg = P.DIFFICULTIES[diffKey] || P.DIFFICULTIES.medium;
    const rng = P.mulberry32((seed || 1) >>> 0);
    const beatMs = (60 / song.bpm) * 1000;
    const barMs = beatMs * 4;
    const stepMs = beatMs / 4;
    const chartStart = 3 * barMs;
    const chartEnd = (song.bars - 2) * barMs;

    const notes = [];
    const recent = [];
    const flow = { heading: rng() * P.TAU };
    let prev = { x: 0.5, y: 0.38 };
    let occupiedUntil = -Infinity;
    let lastWasSlider = false;

    const patterns = PATTERNS[diffKey] || PATTERNS.medium;

    function clearance(x, y, time) {
      let min = Infinity;
      for (const r of recent) {
        const dt = time - r.t;
        if (dt < 0 || dt > 950) continue;
        const d = P.dist(x, y, r.x, r.y);
        if (d < min) min = d;
      }
      return min;
    }

    function nextPosition(time) {
      let best = null;
      let bestClear = -Infinity;

      for (let attempt = 0; attempt < 18; attempt++) {
        flow.heading += (rng() - 0.5) * cfg.turn;
        let jump = P.randRange(rng, cfg.jumpMin, cfg.jumpMax);
        if (rng() < 0.16) jump *= 1.22;

        let x = prev.x + Math.cos(flow.heading) * jump;
        let y = prev.y + Math.sin(flow.heading) * jump * 0.82;

        if (x < MARGIN.x0 || x > MARGIN.x1) {
          flow.heading = Math.PI - flow.heading;
          x = prev.x + Math.cos(flow.heading) * jump;
        }
        if (y < MARGIN.y0 || y > MARGIN.y1) {
          flow.heading = -flow.heading;
          y = prev.y + Math.sin(flow.heading) * jump;
        }

        x = P.clamp(x, MARGIN.x0, MARGIN.x1);
        y = P.clamp(y, MARGIN.y0, MARGIN.y1);

        const d = P.dist(prev.x, prev.y, x, y);
        const minD = cfg.jumpMin * 0.55;
        if (d < minD) continue;

        const clear = clearance(x, y, time);
        if (clear >= cfg.separation) return { x: x, y: y };
        if (clear > bestClear) {
          bestClear = clear;
          best = { x: x, y: y };
        }
      }

      if (best) return best;
      return {
        x: P.randRange(rng, MARGIN.x0, MARGIN.x1),
        y: P.randRange(rng, MARGIN.y0, MARGIN.y1),
      };
    }

    for (let b = 3; b < song.bars - 2; b++) {
      const section = P.sectionAtBar(b, song.bars);
      const list = patterns[section] || patterns.A;
      let pattern = P.pick(rng, list);

      // occasional variation: drop one note for breathing room
      if (pattern.length > 4 && rng() < 0.1) {
        pattern = pattern.slice(0, pattern.length - 1);
      }

      const barStart = b * barMs;

      for (let i = 0; i < pattern.length; i++) {
        const t = barStart + pattern[i] * stepMs;
        if (t < chartStart - 1 || t > chartEnd) continue;
        if (t < occupiedUntil) continue;

        const isSlider = !lastWasSlider && rng() < cfg.sliderChance && t < chartEnd - beatMs * 2;
        const pos = nextPosition(t);
        const clamped = clampPoint(pos);

        if (isSlider) {
          let beats = P.pick(rng, cfg.sliderBeats);
          if (section === "break" && rng() < 0.6) beats = Math.max(beats, 4);
          const endTime = t + beats * beatMs;
          if (endTime > chartEnd + beatMs) continue;

          const sampled = makeSliderPath(clamped, flow.heading, rng, cfg);
          const info = P.preparePath(sampled);
          const end = sampled[sampled.length - 1];
          const tickFracs = [];
          for (let k = 1; k < beats; k++) tickFracs.push(k / beats);

          notes.push({
            type: "slider",
            time: t,
            x: clamped.x,
            y: clamped.y,
            endX: end.x,
            endY: end.y,
            endTime: endTime,
            beats: beats,
            path: info,
            tickFracs: tickFracs,
            state: "pending",
          });
          recent.push({ x: clamped.x, y: clamped.y, t: t });
          recent.push({ x: end.x, y: end.y, t: endTime });

          occupiedUntil = endTime + cfg.gapAfterSlider * beatMs;
          lastWasSlider = true;
        } else {
          notes.push({
            type: "circle",
            time: t,
            x: clamped.x,
            y: clamped.y,
            state: "pending",
          });
          recent.push({ x: clamped.x, y: clamped.y, t: t });
          occupiedUntil = t + cfg.minGapBeats * beatMs;
          lastWasSlider = false;
        }

        prev = clamped;
      }
    }

    notes.sort((a, b) => a.time - b.time);

    // combo numbering + colour groups, like an osu skin would
    notes.forEach((n, i) => {
      n.num = (i % 5) + 1;
      n.group = Math.floor(i / 5) % 2;
      n.id = i;
    });

    return {
      song: song,
      diff: cfg,
      diffKey: diffKey,
      seed: seed,
      notes: notes,
      total: notes.length,
      chartStartMs: chartStart,
      chartEndMs: chartEnd,
      beatMs: beatMs,
    };
  };
})();
