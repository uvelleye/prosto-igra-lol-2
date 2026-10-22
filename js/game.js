/* Game loop, input, rendering and menu wiring */
(function () {
  "use strict";
  const P = window.PIL2;
  const $ = (sel) => document.querySelector(sel);
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const engine = new P.AudioEngine();

  const COLORS = [
    { main: "#ff2e63", light: "#ff7e99", dark: "#a80a38", rgb: "255,46,99" },
    { main: "#2f7dff", light: "#8bb9ff", dark: "#0d3fb0", rgb: "47,125,255" },
  ];

  const JUDGE_COLOR = {
    300: "#8fe0ff",
    100: "#8fe6c0",
    50: "#ffd166",
    miss: "#ff7191",
  };

  const state = {
    mode: "menu",
    songIndex: 0,
    diffKey: "medium",
    song: null,
    music: null,
    chart: null,
    time: 0,
    layout: { w: 0, h: 0, fieldW: 0, fieldH: 0, fx: 0, fy: 0 },
    dpr: 1,
    radius: 34,
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { 300: 0, 100: 0, 50: 0, miss: 0 },
    resolved: 0,
    hp: 1,
    activeSlider: null,
    particles: [],
    ripples: [],
    popups: [],
    cursor: { x: 0.5, y: 0.375, sx: 0, sy: 0, inside: false, has: false, trail: [] },
    input: { mouse: false, keys: new Set(), down: false },
    lastHitError: null,
    lastHitAt: -99999,
    comboPop: 0,
    countdownIdx: -1,
    lastFrame: 0,
    starting: false,
    resultShown: false,
  };

  /* =========================================================
     MENU
     ========================================================= */

  function buildMenu() {
    const songList = $("#song-list");
    songList.innerHTML = "";
    P.SONGS.forEach((song, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song-card";
      btn.dataset.index = String(i);
      btn.setAttribute("role", "option");
      btn.innerHTML =
        '<span class="song-num">A' + (i + 1) + "</span>" +
        '<span class="song-info"><b>' + song.title + "</b><small>DJ NATE TRIBUTE · " +
        song.key + " · " + song.bpm + " BPM</small></span>" +
        '<span class="song-badge">FOOTWORK</span>' +
        '<span class="song-len">' + P.formatTime(P.songDuration(song)) + "</span>";
      btn.addEventListener("click", () => selectSong(i));
      btn.addEventListener("dblclick", () => startGame());
      songList.appendChild(btn);
    });

    const diffList = $("#diff-list");
    diffList.innerHTML = "";
    const widths = { easy: 30, medium: 62, hard: 92 };
    const keys = { easy: "1", medium: "2", hard: "3" };
    P.DIFF_ORDER.forEach((key) => {
      const d = P.DIFFICULTIES[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diff-btn " + key;
      btn.dataset.diff = key;
      btn.setAttribute("role", "radio");
      btn.innerHTML =
        '<span class="diff-top"><b>' + d.name + '</b><span class="diff-stars">' +
        d.starStr + "</span></span>" +
        '<span class="diff-sub">' + d.desc + "</span>" +
        '<span class="diff-bar"><i style="width:' + widths[key] + '%"></i></span>' +
        '<span class="diff-key">' + keys[key] + "</span>";
      btn.addEventListener("click", () => selectDiff(key));
      diffList.appendChild(btn);
    });

    const vol = $("#volume");
    let savedVol = 80;
    try {
      const raw = localStorage.getItem("pil2.volume");
      if (raw != null) savedVol = P.clamp(parseInt(raw, 10) || 0, 0, 100);
    } catch (e) { /* ignore */ }
    vol.value = String(savedVol);
    engine.setVolume(savedVol / 100);
    $("#volume-val").textContent = String(savedVol);
    vol.addEventListener("input", () => {
      const v = P.clamp(parseInt(vol.value, 10) || 0, 0, 100);
      $("#volume-val").textContent = String(v);
      engine.setVolume(v / 100);
      try { localStorage.setItem("pil2.volume", String(v)); } catch (e) { /* ignore */ }
    });

    selectSong(0);
    selectDiff("medium");

    $("#play-btn").addEventListener("click", startGame);
    $("#resume-btn").addEventListener("click", resumeGame);
    $("#retry-pause-btn").addEventListener("click", restartGame);
    $("#menu-pause-btn").addEventListener("click", goMenu);
    $("#retry-btn").addEventListener("click", restartGame);
    $("#menu-btn").addEventListener("click", goMenu);

    document.addEventListener("pointerdown", unlockOnce, { once: true });
  }

  function unlockOnce() {
    engine.unlock();
  }

  function selectSong(index) {
    state.songIndex = P.clamp(index, 0, P.SONGS.length - 1);
    document.querySelectorAll(".song-card").forEach((card) => {
      const on = parseInt(card.dataset.index, 10) === state.songIndex;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-selected", on ? "true" : "false");
    });
    engine.sfxUI();
    updateBestLine();
  }

  function selectDiff(key) {
    if (!P.DIFFICULTIES[key]) return;
    state.diffKey = key;
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      const on = btn.dataset.diff === key;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    engine.sfxUI();
    updateBestLine();
  }

  function updateBestLine() {
    const song = P.SONGS[state.songIndex];
    const best = P.loadBest(song.id, state.diffKey);
    const el = $("#best-value");
    if (best) {
      el.innerHTML =
        '<span class="rank-mini">' + best.rank + "</span>" +
        P.formatScore(best.score) +
        ' · <span style="color:#7f8bab">' + (best.acc != null ? best.acc.toFixed(2) : "0.00") + "%</span>";
    } else {
      el.textContent = "—";
    }
  }

  /* =========================================================
     GAME FLOW
     ========================================================= */

  async function startGame() {
    if (state.starting) return;
    state.starting = true;
    try {
      await engine.unlock();
      engine.sfxUI();

      const song = P.SONGS[state.songIndex];
      const diffKey = state.diffKey;

      state.song = song;
      state.diffKey = diffKey;
      state.music = P.buildMusic(song);
      state.chart = P.buildChart(song, diffKey, (Math.random() * 0xffffffff) >>> 0);
      state.score = 0;
      state.combo = 0;
      state.maxCombo = 0;
      state.counts = { 300: 0, 100: 0, 50: 0, miss: 0 };
      state.resolved = 0;
      state.hp = 1;
      state.activeSlider = null;
      state.particles = [];
      state.ripples = [];
      state.popups = [];
      state.lastHitError = null;
      state.lastHitAt = -99999;
      state.comboPop = 0;
      state.countdownIdx = -1;
      state.time = 0;
      state.resultShown = false;
      state.input.mouse = false;
      state.input.keys.clear();
      state.input.down = false;
      state.cursor.trail = [];
      state.cursor.inside = false;
      state.cursor.has = false;

      $("#menu").classList.add("hidden");
      $("#game").classList.remove("hidden");
      $("#pause-overlay").classList.add("hidden");
      $("#results-overlay").classList.add("hidden");

      resizeCanvas();
      state.time = 0;
      state.mode = "playing";
      engine.playMusic(state.music.events, 0.22);
      state.lastFrame = performance.now();
    } finally {
      state.starting = false;
    }
  }

  function restartGame() {
    if (state.starting) return;
    engine.stopMusic(0.05);
    state.mode = "menu";
    $("#pause-overlay").classList.add("hidden");
    $("#results-overlay").classList.add("hidden");
    startGame();
  }

  function goMenu() {
    engine.stopMusic(0.12);
    state.mode = "menu";
    state.activeSlider = null;
    state.input.mouse = false;
    state.input.keys.clear();
    state.input.down = false;
    $("#pause-overlay").classList.add("hidden");
    $("#results-overlay").classList.add("hidden");
    $("#game").classList.add("hidden");
    $("#menu").classList.remove("hidden");
    updateBestLine();
  }

  function pauseGame() {
    if (state.mode !== "playing") return;
    state.mode = "paused";
    engine.pauseMusic();
    $("#pause-score").textContent = P.formatScore(state.score);
    $("#pause-combo").textContent = state.combo + "x";
    $("#pause-time").textContent = P.formatTime(Math.max(0, state.time) / 1000);
    $("#pause-overlay").classList.remove("hidden");
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    $("#pause-overlay").classList.add("hidden");
    state.mode = "playing";
    state.lastFrame = performance.now();
    if (state.activeSlider) {
      state.activeSlider.breakTimer = 0;
      state.activeSlider.grace = 0.45;
    }
    engine.resumeMusic();
  }

  function endGame() {
    if (state.mode !== "playing") return;
    state.mode = "results";
    state.resultShown = true;
    engine.stopMusic(0.5);

    const acc = accuracy();
    const rank = calcRank(acc);
    const song = state.song;
    const diff = state.chart.diff;
    const prev = P.loadBest(song.id, state.diffKey);
    const isRecord = !prev || state.score > prev.score;

    if (isRecord) {
      P.saveBest(song.id, state.diffKey, {
        score: state.score,
        acc: acc,
        rank: rank,
        maxCombo: state.maxCombo,
        date: Date.now(),
      });
    }
    const best = P.loadBest(song.id, state.diffKey);

    const rankEl = $("#res-rank");
    rankEl.textContent = rank;
    rankEl.className = "rank grade-" + rank.toLowerCase();

    $("#res-record").classList.toggle("hidden", !isRecord);
    $("#res-song-title").textContent = song.title;
    $("#res-song-meta").textContent =
      "DJ NATE TRIBUTE · " + diff.name + " · " + song.bpm + " BPM";
    $("#res-score").textContent = P.formatScore(state.score);
    $("#res-acc").textContent = acc.toFixed(2) + "%";
    $("#res-combo").textContent = state.maxCombo + "x";
    $("#res-300").textContent = String(state.counts[300]);
    $("#res-100").textContent = String(state.counts[100]);
    $("#res-50").textContent = String(state.counts[50]);
    $("#res-miss").textContent = String(state.counts.miss);
    $("#res-total").textContent = String(state.chart.total);
    $("#res-best").textContent = best
      ? "ЛУЧШИЙ: " + P.formatScore(best.score) + " · " + best.rank + " · " + best.acc.toFixed(2) + "%"
      : "ЛУЧШИЙ: —";

    $("#results-overlay").classList.remove("hidden");
  }

  function accuracy() {
    const judged = state.counts[300] + state.counts[100] + state.counts[50] + state.counts.miss;
    if (judged <= 0) return 100;
    const value = state.counts[300] * 300 + state.counts[100] * 100 + state.counts[50] * 50;
    return (value / (judged * 300)) * 100;
  }

  function calcRank(acc) {
    if (acc >= 99.995 && state.counts[50] === 0 && state.counts.miss === 0) return "SS";
    if (acc >= 95) return "S";
    if (acc >= 90) return "A";
    if (acc >= 80) return "B";
    if (acc >= 70) return "C";
    return "D";
  }

  /* =========================================================
     LAYOUT / INPUT
     ========================================================= */

  function resizeCanvas() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    state.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    let fieldH = h * 0.94;
    let fieldW = fieldH * (4 / 3);
    if (fieldW > w * 0.95) {
      fieldW = w * 0.95;
      fieldH = fieldW * 0.75;
    }
    state.layout = {
      w: w,
      h: h,
      fieldW: fieldW,
      fieldH: fieldH,
      fx: (w - fieldW) / 2,
      fy: (h - fieldH) / 2,
    };
    state.radius = state.chart ? fieldW * state.chart.diff.radius : fieldW * 0.055;

    if (!state.cursor.has) {
      state.cursor.sx = stageX(state.cursor.x);
      state.cursor.sy = stageY(state.cursor.y);
    }
  }

  function stageX(x) {
    return state.layout.fx + x * state.layout.fieldW;
  }
  function stageY(y) {
    return state.layout.fy + y * state.layout.fieldW;
  }

  function updateCursorFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const L = state.layout;
    if (!L.fieldW) return;
    state.cursor.sx = px;
    state.cursor.sy = py;
    state.cursor.x = (px - L.fx) / L.fieldW;
    state.cursor.y = (py - L.fy) / L.fieldW;
    state.cursor.inside = px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;
    state.cursor.has = true;
  }

  function pointerDown(e) {
    if (state.mode !== "playing") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    updateCursorFromEvent(e);
    state.input.mouse = true;
    state.input.down = true;
    if (engine.ctx === null) engine.unlock();
    tryHit();
  }

  function pointerMove(e) {
    if (state.mode !== "playing" && state.mode !== "paused") return;
    updateCursorFromEvent(e);
  }

  function pointerUp() {
    state.input.mouse = false;
    state.input.down = state.input.keys.size > 0;
  }

  function keyDown(e) {
    if (e.code === "Escape") {
      if (state.mode === "playing") {
        e.preventDefault();
        pauseGame();
      } else if (state.mode === "paused") {
        e.preventDefault();
        resumeGame();
      } else if (state.mode === "results") {
        e.preventDefault();
        goMenu();
      }
      return;
    }

    if (state.mode === "menu") {
      if (e.code === "Enter") {
        e.preventDefault();
        startGame();
      } else if (e.code === "Digit1") {
        selectDiff("easy");
      } else if (e.code === "Digit2") {
        selectDiff("medium");
      } else if (e.code === "Digit3") {
        selectDiff("hard");
      }
      return;
    }

    if (state.mode === "playing" && (e.code === "KeyZ" || e.code === "KeyX")) {
      e.preventDefault();
      if (!state.input.keys.has(e.code)) {
        state.input.keys.add(e.code);
        state.input.down = true;
        tryHit();
      }
    }
  }

  function keyUp(e) {
    if (e.code === "KeyZ" || e.code === "KeyX") {
      state.input.keys.delete(e.code);
      state.input.down = state.input.mouse || state.input.keys.size > 0;
    }
  }

  /* =========================================================
     GAMEPLAY
     ========================================================= */

  function followRadiusField() {
    if (!state.chart) return 0.1;
    return (state.radius * state.chart.diff.followScale) / state.layout.fieldW;
  }

  function tryHit() {
    if (state.mode !== "playing" || !state.chart) return;
    if (state.activeSlider) return;

    const t = state.time;
    const cfg = state.chart.diff;
    const hitR = (state.radius * 1.16) / state.layout.fieldW;
    let best = null;
    let bestAbs = Infinity;
    let bestDelta = 0;

    for (const n of state.chart.notes) {
      if (n.state !== "pending") continue;
      const delta = t - n.time;
      if (Math.abs(delta) > cfg.missWindow) continue;
      const d = P.dist(state.cursor.x, state.cursor.y, n.x, n.y);
      if (d > hitR) continue;
      const abs = Math.abs(delta);
      if (abs < bestAbs) {
        bestAbs = abs;
        best = n;
        bestDelta = delta;
      }
    }
    if (!best) return;

    const judgment = bestAbs <= cfg.w300 ? 300 : bestAbs <= cfg.w100 ? 100 : bestAbs <= cfg.w50 ? 50 : 0;
    if (!judgment) return;

    if (best.type === "slider") {
      hitSliderHead(best, judgment, bestDelta);
    } else {
      hitCircle(best, judgment, bestDelta);
    }
  }

  function multiplier() {
    return 1 + Math.min(state.combo, 100) * 0.01;
  }

  function addCombo() {
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.comboPop = 1;
  }

  function hitCircle(note, judgment, delta) {
    note.state = "hit";
    state.resolved++;
    state.counts[judgment]++;
    addCombo();
    state.score += Math.round(judgment * multiplier());
    state.hp = Math.min(1, state.hp + (judgment === 300 ? 0.024 : 0.013));
    state.lastHitError = delta;
    state.lastHitAt = state.time;

    addBurst(note.x, note.y, note.group, judgment === 300 ? 11 : 7);
    addRipple(note.x, note.y, JUDGE_COLOR[judgment], 1);
    addPopup(note.x, note.y, String(judgment), JUDGE_COLOR[judgment], 1);
    engine.sfxHit(judgment);
  }

  function hitSliderHead(note, judgment, delta) {
    note.state = "active";
    state.activeSlider = {
      note: note,
      headJudge: judgment,
      breakTimer: 0,
      nextTick: 0,
      progress: 0,
      grace: 0,
      trail: [],
      ball: { x: note.x, y: note.y },
    };
    addCombo();
    state.score += Math.round(110 * multiplier());
    state.hp = Math.min(1, state.hp + 0.02);
    state.lastHitError = delta;
    state.lastHitAt = state.time;

    addBurst(note.x, note.y, note.group, 8);
    addRipple(note.x, note.y, JUDGE_COLOR[judgment], 0.9);
    addPopup(note.x, note.y, String(judgment), JUDGE_COLOR[judgment], 0.9);
    engine.sfxHit(judgment);
  }

  function missNote(note) {
    if (note.state !== "pending") return;
    note.state = "missed";
    state.resolved++;
    state.counts.miss++;
    state.combo = 0;
    state.hp = Math.max(0.02, state.hp - 0.075);
    addRipple(note.x, note.y, JUDGE_COLOR.miss, 1.2);
    addPopup(note.x, note.y, "MISS", JUDGE_COLOR.miss, 1.1);
    engine.sfxMiss();
  }

  function updateActiveSlider(dt, t) {
    const s = state.activeSlider;
    if (!s) return;
    const n = s.note;
    const dur = Math.max(1, n.endTime - n.time);
    const prog = P.clamp((t - n.time) / dur, 0, 1);
    s.progress = prog;

    const ball = P.pointAtProgress(n.path, prog);
    s.ball = ball;

    s.trail.push({ x: ball.x, y: ball.y, life: 1 });
    if (s.trail.length > 11) s.trail.shift();
    for (const p of s.trail) p.life -= dt * 2.4;

    // slider ticks (score + combo, no accuracy penalty for a missed tick)
    while (s.nextTick < n.tickFracs.length && prog >= n.tickFracs[s.nextTick]) {
      const frac = n.tickFracs[s.nextTick];
      const tickPos = P.pointAtProgress(n.path, frac);
      if (state.input.down) {
        const d = P.dist(state.cursor.x, state.cursor.y, tickPos.x, tickPos.y);
        if (d <= followRadiusField() * 1.15) {
          state.combo++;
          if (state.combo > state.maxCombo) state.maxCombo = state.combo;
          state.score += Math.round(30 * multiplier());
          state.comboPop = Math.max(state.comboPop, 0.55);
          addBurst(tickPos.x, tickPos.y, n.group, 3, 0.55);
          engine.sfxTick();
        }
      }
      s.nextTick++;
    }

    if (s.grace > 0) {
      s.grace -= dt;
    } else if (!state.input.down) {
      breakSlider(s, "release");
      return;
    } else {
      const d = P.dist(state.cursor.x, state.cursor.y, ball.x, ball.y);
      if (d > followRadiusField()) {
        s.breakTimer += dt;
        if (s.breakTimer > 0.25) {
          breakSlider(s, "follow");
          return;
        }
      } else {
        s.breakTimer = Math.max(0, s.breakTimer - dt * 2.8);
      }
    }

    if (prog >= 0.999 || (prog >= 0.965 && !state.input.down)) {
      completeSlider(s);
      return;
    }
    if (t > n.endTime + 350) {
      breakSlider(s, "timeout");
    }
  }

  function awardSliderEnd(s) {
    const n = s.note;
    n.state = "done";
    state.activeSlider = null;
    state.resolved++;
    state.counts[s.headJudge]++;
    addCombo();
    state.score += Math.round(230 * multiplier() + 40);
    state.hp = Math.min(1, state.hp + 0.026);
    state.lastHitError = 0;
    state.lastHitAt = state.time;

    addBurst(n.endX, n.endY, n.group, 9);
    addRipple(n.endX, n.endY, JUDGE_COLOR[s.headJudge], 1);
    addPopup(n.endX, n.endY, String(s.headJudge), JUDGE_COLOR[s.headJudge], 0.9);
    engine.sfxHit(s.headJudge);
  }

  function completeSlider(s) {
    if (state.activeSlider !== s) return;
    awardSliderEnd(s);
  }

  function breakSlider(s, reason) {
    if (state.activeSlider !== s) return;
    const n = s.note;
    n.state = "missed";
    state.activeSlider = null;
    state.resolved++;
    state.counts.miss++;
    state.combo = 0;
    state.hp = Math.max(0.02, state.hp - 0.07);

    const pos = s.ball || { x: n.x, y: n.y };
    addRipple(pos.x, pos.y, JUDGE_COLOR.miss, 1.3);
    addPopup(pos.x, pos.y, "MISS", JUDGE_COLOR.miss, 1.1);
    addBurst(pos.x, pos.y, n.group, 5, 0.5);
    engine.sfxMiss();
  }

  function updateGame(dt, t) {
    state.comboPop = Math.max(0, state.comboPop - dt * 5.2);
    state.hp = P.clamp(state.hp - dt * 0.005, 0.02, 1);

    // countdown beeps
    if (t >= 500 && t < 4500) {
      const idx = Math.floor((t - 500) / 1000);
      if (idx !== state.countdownIdx && idx >= 0 && idx <= 3) {
        state.countdownIdx = idx;
        engine.sfxCountdown(idx === 3);
      }
    }

    updateActiveSlider(dt, t);

    const cfg = state.chart.diff;
    for (const n of state.chart.notes) {
      if (n.state === "pending" && t > n.time + cfg.missWindow) {
        missNote(n);
      }
    }

    updateEffects(dt);

    if (t >= state.music.durationMs + 350) {
      endGame();
    }
  }

  function updateEffects(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 3.2);
      p.vy *= Math.max(0, 1 - dt * 3.2);
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    for (const r of state.ripples) r.life -= dt;
    state.ripples = state.ripples.filter((r) => r.life > 0);

    for (const p of state.popups) p.life -= dt;
    state.popups = state.popups.filter((p) => p.life > 0);

    const c = state.cursor;
    const last = c.trail[c.trail.length - 1];
    if (!last || P.dist(last.x, last.y, c.x, c.y) > 0.0025) {
      c.trail.push({ x: c.x, y: c.y, life: 1 });
    }
    for (const p of c.trail) p.life -= dt * 4.2;
    c.trail = c.trail.filter((p) => p.life > 0).slice(-16);
  }

  function addBurst(x, y, group, count, power) {
    const col = COLORS[group % COLORS.length];
    power = power || 1;
    const n = count || 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * P.TAU;
      const speed = (0.05 + Math.random() * 0.22) * power;
      const life = 0.35 + Math.random() * 0.35;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: life,
        max: life,
        size: 0.0025 + Math.random() * 0.0055,
        color: i % 3 === 0 ? "#ffffff" : col.main,
      });
    }
  }

  function addRipple(x, y, color, power) {
    const base = (state.radius * 0.9) / state.layout.fieldW;
    state.ripples.push({
      x: x,
      y: y,
      start: base,
      end: base * (2.3 + (power || 1) * 0.7),
      life: 0.34,
      max: 0.34,
      color: color,
    });
  }

  function addPopup(x, y, text, color, scale) {
    state.popups.push({
      x: x,
      y: y,
      text: text,
      color: color,
      life: 0.7,
      max: 0.7,
      scale: scale || 1,
    });
  }

  /* =========================================================
     RENDER
     ========================================================= */

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawGame() {
    const L = state.layout;
    if (!L.w) {
      resizeCanvas();
      if (!state.layout.w) return;
    }
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);

    drawBackground(state.time);
    drawFieldFrame();
    drawSliderBodies(state.time);
    drawHitObjects(state.time);
    drawEffects();
    drawHUD(state.time);
    drawCursor();
  }

  function drawBackground(t) {
    const L = state.layout;
    const grad = ctx.createLinearGradient(0, 0, L.w, L.h);
    grad.addColorStop(0, "#070b16");
    grad.addColorStop(0.52, "#0a1122");
    grad.addColorStop(1, "#04060e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, L.w, L.h);

    let pulse = 0;
    if (state.song) {
      const phase = ((t / 1000) * (state.song.bpm / 60)) % 1;
      pulse = Math.pow(1 - Math.max(0, phase), 3);
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const red = ctx.createRadialGradient(
      L.fx + L.fieldW * 0.18, L.fy + L.fieldH * 0.24, 0,
      L.fx + L.fieldW * 0.18, L.fy + L.fieldH * 0.24, L.fieldW * 0.75
    );
    red.addColorStop(0, "rgba(255,46,99," + (0.09 + pulse * 0.055) + ")");
    red.addColorStop(0.55, "rgba(255,46,99,0.025)");
    red.addColorStop(1, "rgba(255,46,99,0)");
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, L.w, L.h);

    const blue = ctx.createRadialGradient(
      L.fx + L.fieldW * 0.84, L.fy + L.fieldH * 0.78, 0,
      L.fx + L.fieldW * 0.84, L.fy + L.fieldH * 0.78, L.fieldW * 0.8
    );
    blue.addColorStop(0, "rgba(47,125,255," + (0.08 + pulse * 0.05) + ")");
    blue.addColorStop(0.6, "rgba(47,125,255,0.02)");
    blue.addColorStop(1, "rgba(47,125,255,0)");
    ctx.fillStyle = blue;
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.restore();

    // subtle beat rings in the middle of the field
    if (state.song) {
      const cx = L.fx + L.fieldW * 0.5;
      const cy = L.fy + L.fieldH * 0.52;
      const base = L.fieldH * 0.23;
      ctx.save();
      ctx.strokeStyle = "rgba(190,210,255," + (0.018 + pulse * 0.025) + ")";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, base * i * (1 + pulse * 0.02), 0, P.TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // vignette
    const vg = ctx.createRadialGradient(
      L.w * 0.5, L.h * 0.5, Math.min(L.w, L.h) * 0.25,
      L.w * 0.5, L.h * 0.5, Math.max(L.w, L.h) * 0.78
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, L.w, L.h);
  }

  function drawFieldFrame() {
    const L = state.layout;
    ctx.save();
    ctx.strokeStyle = "rgba(148,178,235,0.075)";
    ctx.lineWidth = 1;
    ctx.strokeRect(L.fx + 0.5, L.fy + 0.5, L.fieldW - 1, L.fieldH - 1);

    const len = Math.min(34, L.fieldW * 0.035);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,46,99,0.34)";
    ctx.beginPath();
    ctx.moveTo(L.fx, L.fy + len);
    ctx.lineTo(L.fx, L.fy);
    ctx.lineTo(L.fx + len, L.fy);
    ctx.stroke();

    ctx.strokeStyle = "rgba(47,125,255,0.34)";
    ctx.beginPath();
    ctx.moveTo(L.fx + L.fieldW - len, L.fy + L.fieldH);
    ctx.lineTo(L.fx + L.fieldW, L.fy + L.fieldH);
    ctx.lineTo(L.fx + L.fieldW, L.fy + L.fieldH - len);
    ctx.stroke();
    ctx.restore();
  }

  function noteAlpha(n, t) {
    if (n.state === "active") return 1;
    const spawn = n.time - state.chart.diff.approach;
    return P.clamp((t - spawn) / 160, 0, 1);
  }

  function drawSliderBodies(t) {
    const cfg = state.chart.diff;
    for (const n of state.chart.notes) {
      if (n.type !== "slider") continue;
      if (n.state === "missed" || n.state === "done" || n.state === "hit") continue;
      if (n.state === "pending" && n.time - cfg.approach > t) continue;
      const alpha = noteAlpha(n, t);
      if (alpha <= 0.01) continue;
      drawSliderBody(n, alpha, t);
    }
  }

  function traceSliderPath(path) {
    const pts = path.points;
    ctx.beginPath();
    ctx.moveTo(stageX(pts[0].x), stageY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(stageX(pts[i].x), stageY(pts[i].y));
    }
  }

  function drawSliderBody(n, alpha, t) {
    const col = COLORS[n.group % 2];
    const r = state.radius;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // outer glow / white border
    ctx.shadowColor = "rgba(" + col.rgb + ",0.38)";
    ctx.shadowBlur = r * 0.5;
    traceSliderPath(n.path);
    ctx.strokeStyle = "rgba(245,249,255,0.92)";
    ctx.lineWidth = r * 2.14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // colored body
    traceSliderPath(n.path);
    ctx.strokeStyle = col.main;
    ctx.lineWidth = r * 1.68;
    ctx.stroke();

    // soft inner sheen
    traceSliderPath(n.path);
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = r * 1.05;
    ctx.stroke();

    // ticks
    for (const frac of n.tickFracs) {
      const p = P.pointAtProgress(n.path, frac);
      ctx.beginPath();
      ctx.arc(stageX(p.x), stageY(p.y), Math.max(2, r * 0.16), 0, P.TAU);
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fill();
    }

    // end circle
    ctx.beginPath();
    ctx.arc(stageX(n.endX), stageY(n.endY), r * 0.62, 0, P.TAU);
    const eg = ctx.createLinearGradient(
      stageX(n.endX), stageY(n.endY) - r,
      stageX(n.endX), stageY(n.endY) + r
    );
    eg.addColorStop(0, col.light);
    eg.addColorStop(1, col.dark);
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.strokeStyle = "rgba(255,255,255,0.86)";
    ctx.stroke();

    ctx.restore();
  }

  function drawHitObjects(t) {
    const cfg = state.chart.diff;
    for (const n of state.chart.notes) {
      if (n.type === "circle") {
        if (n.state !== "pending") continue;
        if (t < n.time - cfg.approach || t > n.time + cfg.missWindow) continue;
        drawCircleObject(n, t, false);
      } else {
        if (n.state === "pending") {
          if (t < n.time - cfg.approach || t > n.time + cfg.missWindow) continue;
          drawCircleObject(n, t, true);
        } else if (n.state === "active" && state.activeSlider && state.activeSlider.note === n) {
          drawSliderBall(n);
        }
      }
    }
  }

  function drawCircleObject(n, t, isSliderHead) {
    const col = COLORS[n.group % 2];
    const alpha = noteAlpha(n, t);
    if (alpha <= 0.01) return;

    const x = stageX(n.x);
    const y = stageY(n.y);
    const hover = P.dist(state.cursor.x, state.cursor.y, n.x, n.y) <=
      (state.radius * 1.05) / state.layout.fieldW;
    const r = state.radius * (hover ? 1.055 : 1);

    // approach circle
    const cfg = state.chart.diff;
    const prog = P.clamp(1 - (n.time - t) / cfg.approach, 0, 1);
    const ar = r * (2.55 - 1.55 * P.smooth(prog));
    let aAlpha = 0.85;
    if (t > n.time) aAlpha = P.clamp(1 - (t - n.time) / cfg.missWindow, 0, 1) * 0.85;

    ctx.save();
    ctx.globalAlpha = alpha * aAlpha;
    ctx.beginPath();
    ctx.arc(x, y, ar, 0, P.TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = Math.max(1.5, r * 0.065);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;

    // glow
    ctx.shadowColor = "rgba(" + col.rgb + ",0.55)";
    ctx.shadowBlur = r * 0.55;

    const grad = ctx.createLinearGradient(x, y - r, x, y + r);
    grad.addColorStop(0, col.light);
    grad.addColorStop(0.48, col.main);
    grad.addColorStop(1, col.dark);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, P.TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, r * 0.095);
    ctx.strokeStyle = "rgba(248,251,255,0.94)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, P.TAU);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();

    // number
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.font = "800 " + (r * 0.92) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = r * 0.08;
    ctx.fillText(String(n.num), x, y + r * 0.045);

    // slider head marker
    if (isSliderHead) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.38, 0, P.TAU);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSliderBall(n) {
    const s = state.activeSlider;
    if (!s) return;
    const col = COLORS[n.group % 2];
    const r = state.radius;

    // trail
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of s.trail) {
      if (p.life <= 0) continue;
      ctx.beginPath();
      ctx.arc(stageX(p.x), stageY(p.y), r * 0.46 * p.life, 0, P.TAU);
      ctx.fillStyle = "rgba(" + col.rgb + "," + (0.16 * p.life) + ")";
      ctx.fill();
    }
    ctx.restore();

    // follow circle
    const followR = state.radius * state.chart.diff.followScale;
    const fx = stageX(s.ball.x);
    const fy = stageY(s.ball.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, followR, 0, P.TAU);
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = Math.max(1.5, r * 0.055);
    ctx.setLineDash([r * 0.3, r * 0.22]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ball
    ctx.save();
    ctx.shadowColor = "rgba(" + col.rgb + ",0.7)";
    ctx.shadowBlur = r * 0.7;
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.52, 0, P.TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.36, 0, P.TAU);
    ctx.fillStyle = col.main;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.14, 0, P.TAU);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.restore();
  }

  function drawEffects() {
    const L = state.layout;

    // ripples
    for (const r of state.ripples) {
      const k = 1 - r.life / r.max;
      const rad = P.lerp(r.start, r.end, P.smooth(k)) * L.fieldW;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.72;
      ctx.beginPath();
      ctx.arc(stageX(r.x), stageY(r.y), rad, 0, P.TAU);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1.5, state.radius * 0.07 * (1 - k * 0.5));
      ctx.stroke();
      ctx.restore();
    }

    // particles
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of state.particles) {
      const a = P.clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(stageX(p.x), stageY(p.y), Math.max(1, p.size * L.fieldW), 0, P.TAU);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.restore();

    // judgment popups
    for (const p of state.popups) {
      const k = 1 - p.life / p.max;
      const alpha = p.life > p.max * 0.72
        ? (p.max - p.life) / (p.max * 0.28)
        : p.life / (p.max * 0.72);
      const scale = p.scale * (1 + 0.12 * Math.sin(Math.min(1, k * 4) * Math.PI));
      ctx.save();
      ctx.globalAlpha = P.clamp(alpha, 0, 1);
      ctx.translate(stageX(p.x), stageY(p.y) - k * state.radius * 1.6);
      ctx.scale(scale, scale);
      ctx.font = "italic 800 " + (state.radius * 0.78) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = p.color;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = state.radius * 0.2;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawCursor() {
    const r = Math.max(8, state.radius * 0.46);
    const c = state.cursor;
    const x = stageX(c.x);
    const y = stageY(c.y);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of c.trail) {
      if (p.life <= 0) continue;
      ctx.beginPath();
      ctx.arc(stageX(p.x), stageY(p.y), r * (0.24 + p.life * 0.55), 0, P.TAU);
      ctx.fillStyle = "rgba(160,195,255," + (0.12 * p.life) + ")";
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, P.TAU);
    ctx.fillStyle = "rgba(10,16,30,0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, P.TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.94)";
    ctx.lineWidth = Math.max(1.8, r * 0.16);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.24, 0, P.TAU);
    ctx.fillStyle = state.input.down ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.62)";
    ctx.fill();

    if (state.input.down) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.3, 0, P.TAU);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD(t) {
    const L = state.layout;
    const W = L.w;
    const H = L.h;
    const cfg = state.chart.diff;
    const acc = accuracy();

    /* ---- intro: song / difficulty ---- */
    if (t >= 0) {
      const alpha = t < 4300 ? 1 : P.clamp(1 - (t - 4300) / 1600, 0, 1);
      if (alpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.82;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(228,238,255,0.9)";
        ctx.font = '800 10px "Segoe UI", sans-serif';
        ctx.fillText(state.song.title + "   //   " + cfg.name, W / 2, 18);
        ctx.fillStyle = "rgba(255,46,99,0.85)";
        ctx.font = '700 8px "Segoe UI", sans-serif';
        ctx.fillText("DJ NATE TRIBUTE · " + state.song.bpm + " BPM · " + state.song.key, W / 2, 34);
        ctx.restore();
      }
    }

    /* ---- hit error bar ---- */
    if (state.lastHitError != null && t - state.lastHitAt < 2200) {
      const cx = W / 2;
      const cy = 62;
      const half = Math.min(105, W * 0.12);
      const age = (t - state.lastHitAt) / 2200;
      ctx.save();
      ctx.globalAlpha = P.clamp(1 - age * 0.75, 0, 1);
      ctx.strokeStyle = "rgba(180,200,240,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy);
      ctx.lineTo(cx + half, cy);
      ctx.stroke();
      for (const f of [-1, -0.5, 0, 0.5, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + f * half, cy - (f === 0 ? 5 : 3));
        ctx.lineTo(cx + f * half, cy + (f === 0 ? 5 : 3));
        ctx.stroke();
      }
      const px = cx + P.clamp(state.lastHitError / 200, -1, 1) * half;
      const abs = Math.abs(state.lastHitError);
      const col = abs <= cfg.w300 ? JUDGE_COLOR[300] : abs <= cfg.w100 ? JUDGE_COLOR[100] : JUDGE_COLOR[50];
      ctx.beginPath();
      ctx.arc(px, cy, 3.5, 0, P.TAU);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

    /* ---- HP bar ---- */
    const hpW = Math.min(L.fieldW * 0.32, W * 0.24);
    const hpX = 26;
    const hpY = 24;
    const hpH = Math.max(8, Math.min(12, H * 0.011));
    ctx.save();
    ctx.fillStyle = "rgba(4,8,18,0.55)";
    roundRect(hpX - 1, hpY - 1, hpW + 2, hpH + 2, hpH * 0.5);
    ctx.fill();
    ctx.fillStyle = "rgba(160,185,235,0.16)";
    roundRect(hpX, hpY, hpW, hpH, hpH * 0.5);
    ctx.fill();
    if (state.hp > 0.005) {
      const hg = ctx.createLinearGradient(hpX, 0, hpX + hpW, 0);
      hg.addColorStop(0, "#ff2e63");
      hg.addColorStop(0.6, "#ff5d7f");
      hg.addColorStop(1, "#ff9db2");
      ctx.fillStyle = hg;
      roundRect(hpX, hpY, Math.max(2, hpW * state.hp), hpH, hpH * 0.5);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    roundRect(hpX, hpY, hpW, hpH, hpH * 0.5);
    ctx.stroke();
    ctx.fillStyle = "rgba(190,208,240,0.55)";
    ctx.font = '800 7px "Segoe UI", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("HP", hpX, hpY - 4);
    ctx.restore();

    /* ---- score / accuracy ---- */
    const right = W - 28;
    const scoreSize = P.clamp(H * 0.034, 24, 42);
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(190,208,240,0.5)";
    ctx.font = '800 8px "Segoe UI", sans-serif';
    ctx.fillText("SCORE", right, 20);
    ctx.fillStyle = "rgba(248,251,255,0.97)";
    ctx.font = "800 " + scoreSize + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 12;
    ctx.fillText(P.formatScore(state.score), right, 31);
    ctx.shadowBlur = 0;
    ctx.fillStyle = acc >= 95 ? "rgba(143,230,192,0.95)" : "rgba(160,195,255,0.95)";
    ctx.font = '800 ' + P.clamp(H * 0.022, 15, 23) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText(acc.toFixed(2) + "%", right, 31 + scoreSize + 8);
    ctx.fillStyle = "rgba(190,208,240,0.4)";
    ctx.font = '700 8px "Segoe UI", sans-serif';
    ctx.fillText("ACCURACY", right, 31 + scoreSize + 8 + P.clamp(H * 0.022, 15, 23) + 6);
    ctx.restore();

    /* ---- combo ---- */
    if (state.combo > 0) {
      const scale = 1 + state.comboPop * 0.16;
      const baseSize = P.clamp(H * 0.072, 34, 74);
      ctx.save();
      ctx.translate(30, H - P.clamp(H * 0.085, 52, 92));
      ctx.scale(scale, scale);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = "italic 900 " + baseSize + 'px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.fillStyle = "rgba(250,252,255,0.98)";
      ctx.shadowColor = "rgba(255,46,99,0.35)";
      ctx.shadowBlur = 22;
      ctx.fillText(String(state.combo), 0, 0);
      const w = ctx.measureText(String(state.combo)).width;
      ctx.shadowBlur = 0;
      ctx.font = "800 " + (baseSize * 0.38) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.fillStyle = "rgba(255,111,140,0.9)";
      ctx.fillText("x", w + 5, -baseSize * 0.03);
      ctx.restore();
    }

    /* ---- progress ---- */
    const px = 26;
    const pw = W - 52;
    const py = H - 14;
    const ratio = state.music ? P.clamp(t / state.music.durationMs, 0, 1) : 0;
    ctx.save();
    ctx.fillStyle = "rgba(150,175,225,0.13)";
    ctx.fillRect(px, py, pw, 3);
    const pg = ctx.createLinearGradient(px, 0, px + pw, 0);
    pg.addColorStop(0, "#ff2e63");
    pg.addColorStop(0.55, "#b53cff");
    pg.addColorStop(1, "#2f7dff");
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw * ratio, 3);
    ctx.beginPath();
    ctx.arc(px + pw * ratio, py + 1.5, 3, 0, P.TAU);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(160,180,220,0.5)";
    ctx.font = '700 9px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(P.formatTime(Math.max(0, t) / 1000), px, py - 5);
    ctx.textAlign = "right";
    ctx.fillText(P.formatTime(state.music.durationMs / 1000), px + pw, py - 5);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(150,170,215,0.36)";
    ctx.font = '700 8px "Segoe UI", sans-serif';
    ctx.fillText("ESC  //  ПАУЗА", W / 2, py - 5);
    ctx.restore();

    /* ---- countdown ---- */
    if (t >= 500 && t < 4500) {
      const idx = P.clamp(Math.floor((t - 500) / 1000), 0, 3);
      const local = (t - 500) / 1000 - idx;
      const isGo = idx === 3;
      const text = isGo ? "GO!" : String(3 - idx);
      const alpha = local < 0.82 ? 1 : P.clamp(1 - (local - 0.82) / 0.18, 0, 1);
      const size = P.clamp(H * 0.14, 62, 150);
      const cx = W / 2;
      const cy = H * 0.5;
      const pop = 1 + 0.12 * Math.max(0, 0.22 - local) / 0.22;
      ctx.save();
      ctx.globalAlpha = alpha * 0.94;
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "italic 900 " + size + 'px "Arial Black", "Segoe UI", sans-serif';
      const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      if (isGo) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.55, "#8bb9ff");
        grad.addColorStop(1, "#2f7dff");
      } else {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.55, "#ff8ba1");
        grad.addColorStop(1, "#ff2e63");
      }
      ctx.fillStyle = grad;
      ctx.shadowColor = isGo ? "rgba(47,125,255,0.5)" : "rgba(255,46,99,0.48)";
      ctx.shadowBlur = 34;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  /* =========================================================
     LOOP
     ========================================================= */

  function loop(now) {
    requestAnimationFrame(loop);
    if (state.mode === "menu") return;

    if (!state.lastFrame) state.lastFrame = now;
    const dt = P.clamp((now - state.lastFrame) / 1000, 0, 0.05);
    state.lastFrame = now;

    if (state.mode === "playing") {
      state.time = engine.timeMs();
      updateGame(dt, state.time);
      drawGame();
    } else if (state.mode === "paused" || state.mode === "results") {
      drawGame();
    }
  }

  /* =========================================================
     INIT
     ========================================================= */

  window.addEventListener("resize", () => {
    if (state.mode !== "menu") resizeCanvas();
  });
  window.addEventListener("pointermove", pointerMove, { passive: true });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("blur", () => {
    state.input.mouse = false;
    state.input.keys.clear();
    state.input.down = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") pauseGame();
  });
  document.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  buildMenu();
  requestAnimationFrame(loop);
})();
