/* Procedural audio engine: music scheduler + synthesized footwork instruments */
(function () {
  "use strict";
  const P = (window.PIL2 = window.PIL2 || {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.songBus = null;
      this.playing = false;
      this.paused = false;
      this.events = [];
      this.idx = 0;
      this.startAt = 0;
      this.timer = null;
      this.volume = 0.8;
      this.noiseBuffer = null;
      this.reverb = null;
      this.shaperCurve = null;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -13;
      comp.knee.value = 22;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.24;

      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.92;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(this.master);

      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(1.9, 2.7);
      const rvGain = this.ctx.createGain();
      rvGain.gain.value = 0.22;
      this.reverb.connect(rvGain);
      rvGain.connect(this.master);

      this.noiseBuffer = this.makeNoise(2.5);

      // soft saturation curve for 808 bass
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
      }
      this.shaperCurve = curve;
    }

    makeImpulse(seconds, decay) {
      const rate = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(rate * seconds));
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          const early = i < rate * 0.012 ? 0 : 1;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * early;
        }
      }
      return buf;
    }

    makeNoise(seconds) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    async unlock() {
      this.init();
      if (this.ctx.state !== "running") {
        try { await this.ctx.resume(); } catch (e) { /* ignore */ }
      }
    }

    setVolume(v) {
      this.volume = P.clamp(v, 0, 1);
      if (this.master) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(this.volume, t, 0.02);
      }
    }

    /* ---------------- music scheduler ---------------- */

    playMusic(events, lead) {
      this.init();
      this.stopMusic(0.04);
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      lead = lead == null ? 0.18 : lead;

      this.songBus = this.ctx.createGain();
      this.songBus.gain.value = 1;
      this.songBus.connect(this.musicBus);

      this.events = events.slice().sort((a, b) => a.t - b.t);
      this.idx = 0;
      this.startAt = this.ctx.currentTime + lead;
      this.playing = true;
      this.paused = false;

      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 25);
      this.schedule();
    }

    schedule() {
      if (!this.playing || this.paused || !this.ctx) return;
      const until = this.ctx.currentTime + 0.22;
      while (this.idx < this.events.length) {
        const ev = this.events[this.idx];
        const at = this.startAt + ev.t;
        if (at > until) break;
        if (at >= this.ctx.currentTime - 0.06) this.spawn(ev, at);
        this.idx++;
      }
    }

    timeMs() {
      if (!this.ctx || !this.playing) return 0;
      return (this.ctx.currentTime - this.startAt) * 1000;
    }

    pauseMusic() {
      if (!this.playing || this.paused) return;
      this.paused = true;
      clearInterval(this.timer);
      this.timer = null;
      if (this.ctx && this.ctx.state === "running") {
        this.ctx.suspend().catch(() => {});
      }
    }

    resumeMusic() {
      if (!this.playing || !this.paused) return;
      const ctx = this.ctx;
      ctx.resume().then(() => {
        if (!this.playing || !this.paused) return;
        this.paused = false;
        clearInterval(this.timer);
        this.timer = setInterval(() => this.schedule(), 25);
        this.schedule();
      }).catch(() => {});
    }

    stopMusic(fade) {
      this.playing = false;
      this.paused = false;
      clearInterval(this.timer);
      this.timer = null;
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      if (this.songBus) {
        const bus = this.songBus;
        this.songBus = null;
        const now = this.ctx ? this.ctx.currentTime : 0;
        try {
          bus.gain.cancelScheduledValues(now);
          if (fade && fade > 0.03) {
            bus.gain.setValueAtTime(bus.gain.value, now);
            bus.gain.linearRampToValueAtTime(0.0001, now + fade);
          } else {
            bus.gain.setValueAtTime(0.0001, now);
          }
        } catch (e) { /* ignore */ }
        setTimeout(() => {
          try { bus.disconnect(); } catch (e) { /* ignore */ }
        }, Math.max(80, (fade || 0) * 1000 + 120));
      }
    }

    spawn(ev, at) {
      const bus = this.songBus;
      if (!bus) return;
      switch (ev.type) {
        case "kick": this.kick(at, ev.vel || 1); break;
        case "snare": this.snare(at, ev.vel || 1); break;
        case "hat": this.hat(at, ev.vel || 1, false, ev.pan || 0); break;
        case "ohat": this.hat(at, ev.vel || 1, true, ev.pan || 0); break;
        case "bass": this.bass(at, ev.note, ev.dur || 0.3, ev.vel || 1, ev.slide); break;
        case "stab": this.stab(at, ev.notes || [], ev.dur || 0.2, ev.vel || 1); break;
        case "pad": this.pad(at, ev.notes || [], ev.dur || 2, ev.vel || 1); break;
        case "vocal": this.vocal(at, ev.note, ev.dur || 0.25, ev.vel || 1); break;
        case "riser": this.riser(at, ev.dur || 2, ev.vel || 1); break;
        case "crash": this.crash(at, ev.vel || 1); break;
      }
    }

    /* ---------------- instruments ---------------- */

    _noise(t, dur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.start(t, Math.random() * 1.6);
      src.stop(t + dur + 0.03);
      return src;
    }

    _send(node, amount) {
      const g = this.ctx.createGain();
      g.gain.value = amount;
      node.connect(g);
      g.connect(this.reverb);
    }

    kick(t, vel) {
      const bus = this.songBus;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(158, t);
      o.frequency.exponentialRampToValueAtTime(43, t + 0.13);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.82 * vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + 0.31);

      const n = this._noise(t, 0.028);
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.08 * vel, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(bus);
    }

    snare(t, vel) {
      const bus = this.songBus;
      const n = this._noise(t, 0.2);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1650;
      bp.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      n.connect(bp);
      bp.connect(g);
      g.connect(bus);
      this._send(g, 0.16);

      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(195, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.15 * vel, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(og);
      og.connect(bus);
      o.start(t);
      o.stop(t + 0.11);

      // tight high clap layer
      const n2 = this._noise(t + 0.012, 0.08);
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4200;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.07 * vel, t + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      n2.connect(hp);
      hp.connect(g2);
      g2.connect(bus);
    }

    hat(t, vel, open, pan) {
      const bus = this.songBus;
      const n = this._noise(t, open ? 0.22 : 0.06);
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = open ? 6200 : 7600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((open ? 0.1 : 0.065) * vel, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.2 : 0.045));
      n.connect(hp);
      hp.connect(g);
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = P.clamp(pan || 0, -1, 1);
        g.connect(p);
        p.connect(bus);
      } else {
        g.connect(bus);
      }
    }

    bass(t, note, dur, vel, slide) {
      const bus = this.songBus;
      const f = P.midiToFreq(note);
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 1.45, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      if (slide != null) {
        o.frequency.exponentialRampToValueAtTime(
          P.midiToFreq(slide),
          t + Math.max(0.08, Math.min(dur * 0.9, 0.5))
        );
      }
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.shaperCurve;
      shaper.oversample = "2x";
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 620;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.46 * vel, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(shaper);
      shaper.connect(lp);
      lp.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + dur + 0.03);

      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = "triangle";
      sub.frequency.setValueAtTime(f, t);
      if (slide != null) {
        sub.frequency.exponentialRampToValueAtTime(
          P.midiToFreq(slide),
          t + Math.max(0.08, Math.min(dur * 0.9, 0.5))
        );
      }
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.1 * vel, t + 0.012);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      sub.connect(sg);
      sg.connect(bus);
      sub.start(t);
      sub.stop(t + dur + 0.03);
    }

    stab(t, notes, dur, vel) {
      const bus = this.songBus;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075 * vel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(g);
      g.connect(bus);
      this._send(g, 0.24);
      notes.forEach((m, i) => {
        const o = this.ctx.createOscillator();
        o.type = i % 2 === 0 ? "sawtooth" : "square";
        o.frequency.value = P.midiToFreq(m);
        o.detune.value = (i - 1) * 7;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.03);
      });
    }

    pad(t, notes, dur, vel) {
      const bus = this.songBus;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(620, t);
      lp.frequency.linearRampToValueAtTime(1050, t + dur * 0.55);
      lp.frequency.linearRampToValueAtTime(600, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.048 * vel, t + Math.min(0.45, dur * 0.25));
      g.gain.setValueAtTime(0.048 * vel, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(g);
      g.connect(bus);
      this._send(g, 0.4);
      notes.forEach((m, i) => {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = P.midiToFreq(m);
        o.detune.value = (i - 1) * 9;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.04);
      });
    }

    vocal(t, note, dur, vel) {
      const bus = this.songBus;
      const f = P.midiToFreq(note);
      const out = this.ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.11 * vel, t + 0.028);
      out.gain.exponentialRampToValueAtTime(0.075 * vel, t + Math.min(dur * 0.62, 0.5));
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      out.connect(bus);
      this._send(out, 0.32);

      const formants = [
        { f: 780, q: 5.5, g: 0.9 },
        { f: 1180, q: 7.5, g: 0.55 },
        { f: 2820, q: 9, g: 0.18 },
      ];

      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 5.3 + Math.random() * 0.6;
      lg.gain.value = f * 0.0065;
      lfo.connect(lg);
      lfo.start(t);
      lfo.stop(t + dur + 0.03);

      for (let k = 0; k < 2; k++) {
        const o = this.ctx.createOscillator();
        o.type = k === 0 ? "sawtooth" : "square";
        o.frequency.value = f;
        o.detune.value = k === 0 ? -4 : 6;
        lg.connect(o.frequency);
        formants.forEach((fm) => {
          const bp = this.ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = fm.f;
          bp.Q.value = fm.q;
          const fg = this.ctx.createGain();
          fg.gain.value = fm.g * (k === 0 ? 0.75 : 0.35);
          o.connect(bp);
          bp.connect(fg);
          fg.connect(out);
        });
        o.start(t);
        o.stop(t + dur + 0.02);
      }

      // a little breath
      const n = this._noise(t, Math.min(0.1, dur));
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 1.4;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.012 * vel, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.12, dur));
      n.connect(bp);
      bp.connect(ng);
      ng.connect(out);
    }

    riser(t, dur, vel) {
      const bus = this.songBus;
      const n = this._noise(t, dur);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.8;
      bp.frequency.setValueAtTime(280, t);
      bp.frequency.exponentialRampToValueAtTime(6800, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12 * vel, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp);
      bp.connect(g);
      g.connect(bus);
      this._send(g, 0.3);
    }

    crash(t, vel) {
      const bus = this.songBus;
      const n = this._noise(t, 1.35);
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14 * vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      n.connect(hp);
      hp.connect(g);
      g.connect(bus);
      this._send(g, 0.45);
    }

    /* ---------------- sfx ---------------- */

    sfxHit(judgment) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.004;
      const base = judgment >= 300 ? 1240 : judgment >= 100 ? 980 : 780;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.72, t + 0.055);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.07);

      const n = this._noise(t, 0.03);
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2800;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.035, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(this.sfxBus);
    }

    sfxTick() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.003;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = 1780;
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.032);
    }

    sfxMiss() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.003;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(72, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.21);
    }

    sfxUI() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.002;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(820, t);
      o.frequency.exponentialRampToValueAtTime(610, t + 0.055);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.07);
    }

    sfxCountdown(isGo) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.002;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(isGo ? 1040 : 660, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  P.AudioEngine = AudioEngine;
})();
