/* Song definitions + procedural footwork / juke soundtrack generation */
(function () {
  "use strict";
  const P = (window.PIL2 = window.PIL2 || {});

  /*
    Original synthesized tracks in the spirit of DJ Nate's Chicago footwork:
    160-ish BPM, punchy 808s, frantic hats, chopped soul-ish vocal stabs.
    No sampled or copyrighted audio is used — every sound is generated live.
  */
  P.SONGS = [
    {
      id: "anthem",
      title: "FOOTWORK ANTHEM",
      bpm: 160,
      bars: 48,
      root: 41, // F2
      prog: [0, 8, 3, 10],
      seed: 20151,
      tag: "160 BPM",
      key: "F MINOR",
      desc: "ГИМН ЧИКАГСКОГО ДЖУКА",
      motifs: [
        [
          [0, 0, 2], [2, 3, 1], [3, 5, 1], [6, 7, 2],
          [8, 5, 2], [11, 3, 1], [12, 2, 1], [14, 0, 2],
        ],
        [
          [0, 7, 2], [3, 5, 1], [4, 3, 2], [7, 0, 1],
          [8, 3, 2], [10, 5, 1], [12, 7, 1], [14, 9, 2],
        ],
      ],
    },
    {
      id: "juke",
      title: "JUKE DAT",
      bpm: 156,
      bars: 48,
      root: 43, // G2
      prog: [0, 10, 8, 3],
      seed: 4004,
      tag: "156 BPM",
      key: "G MINOR",
      desc: "БЫСТРЫЕ ХЭТЫ, ТЯЖЁЛЫЙ БАС",
      motifs: [
        [
          [0, 0, 1], [1, 3, 1], [2, 5, 1], [4, 7, 2],
          [6, 5, 1], [8, 3, 2], [11, 0, 1], [12, 2, 2], [14, 3, 2],
        ],
        [
          [0, 5, 2], [2, 7, 1], [4, 8, 1], [6, 7, 2],
          [8, 5, 2], [10, 3, 1], [12, 2, 1], [13, 3, 1], [14, 5, 2],
        ],
      ],
    },
    {
      id: "chitown",
      title: "CHI-TOWN BOUNCE",
      bpm: 168,
      bars: 48,
      root: 38, // D2
      prog: [0, 3, 8, 5],
      seed: 7731,
      tag: "168 BPM",
      key: "D MINOR",
      desc: "НОЧНАЯ ПОЕЗДКА ПО ЧИКАГО",
      motifs: [
        [
          [0, 0, 2], [3, 2, 1], [4, 3, 1], [6, 5, 2],
          [8, 7, 1], [9, 8, 1], [10, 7, 2], [12, 5, 2], [14, 3, 2],
        ],
        [
          [0, 5, 2], [2, 7, 1], [4, 8, 2], [6, 7, 1],
          [8, 5, 1], [9, 3, 1], [10, 2, 1], [12, 3, 2], [14, 0, 2],
        ],
      ],
    },
  ];

  const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17];
  const MINOR = [0, 3, 7, 10];
  const MAJOR = [0, 4, 7, 11];

  P.songDuration = function (song) {
    return (song.bars * 4 * 60) / song.bpm;
  };

  P.sectionAtBar = function (b, bars) {
    if (b < 4) return "intro";
    if (b < 20) return "A";
    if (b < 36) return "B";
    if (b < 40) return "break";
    if (b < bars - 2) return "C";
    return "outro";
  };

  P.buildMusic = function (song) {
    const rng = P.mulberry32(song.seed);
    const beat = 60 / song.bpm;
    const bar = beat * 4;
    const step = beat / 4;
    const bars = song.bars;
    const events = [];

    const add = (t, type, data) => {
      if (t < -0.01) return;
      events.push(Object.assign({ t: t, type: type }, data || {}));
    };

    const progAt = (b) => {
      const idx = Math.floor(b / 2) % song.prog.length;
      return { idx: idx, deg: song.prog[idx], root: song.root + song.prog[idx] };
    };

    for (let b = 0; b < bars; b++) {
      const t0 = b * bar;
      const section = P.sectionAtBar(b, bars);
      const ch = progAt(b);
      const quality = [0, 5].indexOf(ch.deg) >= 0 ? MINOR : MAJOR;
      const chordNotes = [
        ch.root + 12,
        ch.root + 12 + quality[1],
        ch.root + 12 + quality[2],
        ch.root + 12 + quality[3],
      ];

      /* ---------- pads / chords ---------- */
      if (b % 2 === 0) {
        let padVel = 0.75;
        if (section === "intro") padVel = 1.15;
        else if (section === "break") padVel = 1.25;
        else if (section === "outro") padVel = 1.5;
        else padVel = 0.62;
        add(t0, "pad", {
          notes: [ch.root, ch.root + quality[1], ch.root + quality[2], ch.root + 12],
          dur: bar * 2 * 0.98,
          vel: padVel,
        });
      }

      /* ---------- drums ---------- */
      if (section === "intro") {
        if (b >= 1) {
          for (let s = 0; s < 16; s += 2) {
            add(t0 + s * step, "hat", {
              vel: 0.42 + (s % 4 === 0 ? 0.16 : 0),
              pan: (s % 4 === 0 ? -0.18 : 0.18),
            });
          }
        }
        if (b >= 2) {
          [0, 8].forEach((s, i) => add(t0 + s * step, "kick", { vel: i === 0 ? 0.85 : 0.65 }));
          if (b === 3) [4, 12].forEach((s) => add(t0 + s * step, "kick", { vel: 0.55 }));
        }
        if (b === 2) add(t0, "riser", { dur: bar * 2, vel: 0.8 });
        if (b === 0) {
          add(t0 + 2 * step, "vocal", { note: ch.root + 24, dur: beat * 2.2, vel: 0.85 });
          add(t0 + 10 * step, "vocal", { note: ch.root + 24 + 7, dur: beat * 1.6, vel: 0.55 });
        }
      } else if (section === "outro") {
        add(t0, "crash", { vel: 0.9 });
        add(t0, "pad", {
          notes: chordNotes.concat([ch.root + 24]),
          dur: bar * 1.9,
          vel: 1.6,
        });
        add(t0, "bass", { note: ch.root, dur: bar * 1.5, vel: 0.8 });
        add(t0 + 2 * step, "vocal", {
          note: ch.root + 24,
          dur: bar * 1.4,
          vel: 0.9,
        });
      } else if (section === "break") {
        [0, 10].forEach((s, i) => add(t0 + s * step, "kick", { vel: i === 0 ? 0.9 : 0.66 }));
        add(t0 + 12 * step, "snare", { vel: 0.55 });
        for (let s = 0; s < 16; s += 4) {
          add(t0 + s * step, "hat", { vel: 0.36 });
        }
        add(t0 + 8 * step, "stab", {
          notes: chordNotes.slice(0, 3),
          dur: beat * 2.4,
          vel: 0.62,
        });
        if (b === 36 || b === 38) {
          const noteDeg = [7, 5, 3, 2][(b - 36) % 4];
          add(t0 + 2 * step, "vocal", {
            note: ch.root + 24 + SCALE[noteDeg],
            dur: bar * 1.35,
            vel: 0.9,
          });
        }
        if (b === 38) add(t0, "riser", { dur: bar * 2, vel: 0.85 });
        if (b === 39) {
          for (let s = 0; s < 16; s++) {
            add(t0 + s * step, "snare", { vel: 0.14 + (s / 16) * 0.62 });
          }
        }
      } else {
        // main sections: A, B, C
        let kicks;
        if (section === "A") kicks = [0, 4, 10, 12];
        else if (section === "B") kicks = [0, 3, 6, 10, 12, 14];
        else kicks = [0, 2, 4, 6, 10, 12, 14];

        kicks.forEach((s) => {
          add(t0 + s * step, "kick", {
            vel: s % 4 === 0 ? 1 : 0.78 + rng() * 0.1,
          });
        });
        if (rng() < 0.5) add(t0 + 7 * step, "kick", { vel: 0.45 });

        [4, 12].forEach((s) => {
          add(t0 + s * step, "snare", { vel: 0.92 });
        });
        if (rng() < 0.22) add(t0 + 15 * step, "snare", { vel: 0.25 });

        const extra = section === "A" ? 0.18 : section === "B" ? 0.36 : 0.5;
        for (let s = 0; s < 16; s++) {
          if (s % 2 === 0) {
            add(t0 + s * step, "hat", {
              vel: 0.38 + (s % 4 === 0 ? 0.22 : 0) + rng() * 0.1,
              pan: s % 4 === 0 ? -0.2 : 0.2,
            });
          } else if (rng() < extra) {
            add(t0 + s * step, "hat", {
              vel: 0.2 + rng() * 0.16,
              pan: rng() * 0.5 - 0.25,
            });
          }
        }
        if (b % 2 === 0) add(t0 + 14 * step, "ohat", { vel: 0.5, pan: 0.1 });

        /* bass */
        let bassPattern;
        if (section === "A") {
          bassPattern = [
            [0, 2, 0], [6, 2, 7], [10, 2, 0], [14, 2, 3],
          ];
        } else if (section === "B") {
          bassPattern = [
            [0, 2, 0], [5, 2, 7], [8, 2, 0], [12, 4, 10],
          ];
        } else {
          bassPattern = [
            [0, 2, 0], [3, 1, 7], [6, 2, 0], [10, 2, 3], [14, 2, 7],
          ];
        }
        bassPattern.forEach((bp, i) => {
          const s = bp[0];
          const durBeats = bp[1];
          const interval = bp[2];
          const note = ch.root + interval;
          const data = {
            note: note,
            dur: durBeats * beat * 0.92,
            vel: 0.9 + (i === 0 ? 0.1 : 0),
          };
          if (i === 1 && rng() < 0.4) data.slide = note - 2;
          add(t0 + s * step, "bass", data);
        });

        /* chord stabs */
        const stabSteps = section === "A" ? [2, 6, 10, 14] : [2, 6, 10, 13];
        stabSteps.forEach((s, i) => {
          add(t0 + s * step, "stab", {
            notes: [
              ch.root + 24,
              ch.root + 24 + quality[1],
              ch.root + 24 + quality[2],
            ],
            dur: step * 1.5,
            vel: 0.46 + (i === 1 ? 0.12 : 0),
          });
        });

        /* vocal hook every 4 bars */
        if (b % 4 === 0) {
          const phraseIndex = Math.floor((b - 4) / 4);
          const motif = song.motifs[Math.abs(phraseIndex) % song.motifs.length];
          const octave = phraseIndex % 4 === 2 ? 12 : 0;
          motif.forEach((n) => {
            const midi = ch.root + 24 + SCALE[n[1]] + octave;
            add(t0 + n[0] * step, "vocal", {
              note: midi,
              dur: Math.max(step * 1.2, n[2] * step * 0.9),
              vel: 0.8,
            });
            add(t0 + (n[0] + 3) * step, "vocal", {
              note: midi,
              dur: Math.max(step, n[2] * step * 0.55),
              vel: 0.22,
            });
          });
        }
      }

      /* ---------- section fx ---------- */
      if (b === 4 || b === 20 || b === 40) {
        add(t0, "crash", { vel: 0.82 });
        add(t0, "vocal", {
          note: ch.root + 24,
          dur: beat * 0.8,
          vel: 0.75,
        });
      }
      if (b === 18) add(t0, "riser", { dur: bar * 2, vel: 0.55 });
      if (b === 46) add(t0 + 14 * step, "crash", { vel: 0.5 });
    }

    events.sort((a, b) => a.t - b.t);

    return {
      song: song,
      events: events,
      beat: beat,
      bar: bar,
      step: step,
      durationMs: bars * bar * 1000,
      chartStartMs: 3 * bar * 1000,
      chartEndMs: (bars - 2) * bar * 1000,
    };
  };
})();
