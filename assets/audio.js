/* Stick Showdown — sound effects synthesized with WebAudio. No audio assets.
   SS_Audio.init() must be called from a user gesture; play(name) is safe to
   call at any time afterwards (silently no-ops before init or when muted). */
(function () {
  'use strict';

  var ctx = null, master = null, enabled = true, inited = false;

  function init() {
    if (inited) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
    var AC = globalThis.window && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    inited = true;
  }
  function setEnabled(b) {
    enabled = b;
    if (master) master.gain.value = b ? 0.42 : 0;
  }
  function isEnabled() { return enabled; }

  function now() { return ctx.currentTime; }

  function tone(o) {
    // {f, f2, dur, type, vol, delay, attack}
    if (!ctx || !enabled) return;
    var t0 = now() + (o.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
    var v = (o.vol || 0.5);
    var a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
  }

  var noiseBuf = null;
  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function noise(o) {
    // {dur, vol, f, f2, q, type='bandpass', delay}
    if (!ctx || !enabled) return;
    var t0 = now() + (o.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = getNoise();
    src.loop = true;
    var flt = ctx.createBiquadFilter();
    flt.type = o.type || 'bandpass';
    flt.frequency.setValueAtTime(o.f || 800, t0);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    flt.Q.value = o.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.3, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + o.dur + 0.02);
  }

  function play(name, vol) {
    if (!inited || !ctx || !enabled) return;
    var v = vol === undefined ? 1 : vol;
    switch (name) {
      case 'ui':
        tone({ f: 660, f2: 880, dur: 0.06, type: 'triangle', vol: 0.22 * v });
        break;
      case 'swing':
        noise({ dur: 0.09, vol: 0.22 * v, f: 420, f2: 1500, q: 2 });
        break;
      case 'hit':
        tone({ f: 160, f2: 70, dur: 0.09, type: 'sine', vol: 0.5 * v });
        noise({ dur: 0.06, vol: 0.25 * v, f: 900, q: 1 });
        break;
      case 'hitHeavy':
        tone({ f: 110, f2: 45, dur: 0.16, type: 'sine', vol: 0.65 * v });
        noise({ dur: 0.12, vol: 0.3 * v, f: 600, f2: 200, q: 0.8 });
        tone({ f: 70, dur: 0.14, type: 'square', vol: 0.14 * v });
        break;
      case 'hurt':
        tone({ f: 220, f2: 90, dur: 0.16, type: 'square', vol: 0.2 * v });
        noise({ dur: 0.1, vol: 0.2 * v, f: 500, q: 2 });
        break;
      case 'enemyDie':
        tone({ f: 320, f2: 60, dur: 0.22, type: 'triangle', vol: 0.4 * v });
        noise({ dur: 0.15, vol: 0.3 * v, f: 700, f2: 150, q: 1 });
        break;
      case 'bossDie':
        tone({ f: 200, f2: 40, dur: 0.7, type: 'sawtooth', vol: 0.4 * v });
        noise({ dur: 0.6, vol: 0.35 * v, f: 400, f2: 80, q: 0.7 });
        tone({ f: 90, f2: 30, dur: 0.8, type: 'sine', vol: 0.5 * v, delay: 0.1 });
        break;
      case 'jump':
        tone({ f: 240, f2: 520, dur: 0.1, type: 'sine', vol: 0.22 * v });
        break;
      case 'dash':
        noise({ dur: 0.14, vol: 0.26 * v, f: 1400, f2: 300, q: 3 });
        tone({ f: 500, f2: 200, dur: 0.08, type: 'triangle', vol: 0.12 * v });
        break;
      case 'throw':
        tone({ f: 900, f2: 380, dur: 0.16, type: 'sine', vol: 0.16 * v });
        break;
      case 'roar':
      case 'enrage':
        tone({ f: 60, f2: 42, dur: 0.65, type: 'sawtooth', vol: 0.4 * v });
        tone({ f: 90, f2: 55, dur: 0.6, type: 'sawtooth', vol: 0.22 * v, delay: 0.05 });
        noise({ dur: 0.5, vol: 0.22 * v, f: 250, f2: 90, q: 0.8 });
        if (name === 'enrage') {
          tone({ f: 440, dur: 0.09, type: 'square', vol: 0.2, delay: 0.3 });
          tone({ f: 660, dur: 0.09, type: 'square', vol: 0.2, delay: 0.4 });
        }
        break;
      case 'shockwave':
      case 'quake':
        tone({ f: 80, f2: 32, dur: 0.3, type: 'sine', vol: 0.55 * v });
        noise({ dur: 0.25, vol: 0.3 * v, f: 300, f2: 70, q: 0.7 });
        break;
      case 'warning':
        tone({ f: 760, dur: 0.08, type: 'square', vol: 0.18 * v });
        tone({ f: 760, dur: 0.08, type: 'square', vol: 0.18 * v, delay: 0.14 });
        break;
      case 'drop':
        tone({ f: 520, f2: 780, dur: 0.1, type: 'sine', vol: 0.2 * v });
        break;
      case 'pickup':
        tone({ f: 620, dur: 0.07, type: 'sine', vol: 0.24 * v });
        tone({ f: 930, dur: 0.09, type: 'sine', vol: 0.24 * v, delay: 0.06 });
        break;
      case 'combo':
        tone({ f: 520, f2: 900, dur: 0.08, type: 'square', vol: 0.1 * v });
        break;
      case 'perfect':
        tone({ f: 880, dur: 0.07, type: 'sine', vol: 0.26 });
        tone({ f: 1320, dur: 0.12, type: 'sine', vol: 0.22, delay: 0.07 });
        noise({ dur: 0.1, vol: 0.12, f: 2400, f2: 800, q: 3 });
        break;
      case 'unlock':
        [523, 659, 784, 1047].forEach(function (f, i) {
          tone({ f: f, dur: 0.12, type: 'triangle', vol: 0.24, delay: i * 0.09 });
        });
        break;
      case 'fanfare':
        [392, 523, 659, 784].forEach(function (f, i) {
          tone({ f: f, dur: 0.14, type: 'triangle', vol: 0.26, delay: i * 0.1 });
        });
        [196, 262, 330, 392].forEach(function (f, i) {
          tone({ f: f, dur: 0.5, type: 'sine', vol: 0.16, delay: 0.42 });
        });
        break;
      case 'gameover':
        [330, 262, 208, 156].forEach(function (f, i) {
          tone({ f: f, dur: 0.22, type: 'triangle', vol: 0.24, delay: i * 0.16 });
        });
        break;
      case 'start':
        tone({ f: 392, dur: 0.09, type: 'triangle', vol: 0.25 });
        tone({ f: 523, dur: 0.12, type: 'triangle', vol: 0.25, delay: 0.08 });
        break;
    }
  }

  globalThis.SS_Audio = {
    init: init, play: play, setEnabled: setEnabled, isEnabled: isEnabled,
    get inited() { return inited; }
  };
})();
