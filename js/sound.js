if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Простые звуки, синтезируемые в браузере (файлов не нужно).
   Звук включается после первого клика по странице (правило браузеров). */

const Sound = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('gem-muted') === '1'; } catch (e) { /* без хранилища */ }

  function audio() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.06, delay = 0, to = null) {
    if (muted) return;
    const c = audio();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.05, delay = 0) {
    if (muted) return;
    const c = audio();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g).connect(c.destination);
    src.start(c.currentTime + delay);
  }

  return {
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      try { localStorage.setItem('gem-muted', v ? '1' : '0'); } catch (e) { /* без хранилища */ }
    },
    swap()  { tone(320, 0.07, 'triangle', 0.05, 0, 460); },
    bad()   { tone(200, 0.18, 'sawtooth', 0.05, 0, 110); },
    match(count = 3, bonus = 1) {
      const base = bonus > 1 ? 520 : 400;
      for (let i = 0; i < Math.min(4, Math.max(2, count - 1)); i++) tone(base * Math.pow(1.25, i), 0.12, 'triangle', 0.05, i * 0.06);
    },
    hit(amount = 1) { noise(0.12, Math.min(0.12, 0.03 + amount / 200)); tone(140, 0.15, 'square', 0.04, 0, 70); },
    lightning() { tone(700, 0.35, 'sawtooth', 0.04, 0, 1800); noise(0.25, 0.05); },
    heal() { [660, 784, 988].forEach((f, i) => tone(f, 0.28, 'sine', 0.05, i * 0.1)); },
    chaos() { noise(0.35, 0.05); tone(300, 0.3, 'square', 0.03, 0, 900); tone(900, 0.3, 'square', 0.03, 0.15, 250); },
    transmute() { tone(240, 0.5, 'sawtooth', 0.04, 0, 90); tone(880, 0.25, 'sine', 0.04, 0.3, 1320); },
    fire() { noise(0.7, 0.07); tone(180, 0.6, 'sawtooth', 0.04, 0, 90); },
    win()  { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, i * 0.14)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.05, i * 0.16)); },
  };
})();
