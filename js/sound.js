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

  // 2.4.4: «фортепиано» — модель струны: негармоничные гармоники с разным затуханием, три слегка расстроенные струны
  // (двухступенчатое затухание), удар молоточка в 1/8 струны (гасит 8-ю гармонику), стук молоточка, резонанс деки и общий зал.
  let bus = null;
  function pianoBus(c) {
    if (bus && bus.ctx === c) return bus.in;
    const inp = c.createGain(), dry = c.createGain(), wet = c.createGain(), comp = c.createDynamicsCompressor();
    dry.gain.value = 0.85; wet.gain.value = 0.28;
    // зал: затухающий шум, слегка приглушённый, ~1.6 с
    const len = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.45 * i / len); d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    }
    const conv = c.createConvolver(); conv.buffer = ir;
    // дека: мягкие резонансы корпуса
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 240; body.Q.value = 0.9; body.gain.value = 3;
    const air = c.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 5200; air.gain.value = -4;
    inp.connect(body).connect(air); air.connect(dry); air.connect(conv); conv.connect(wet);
    dry.connect(comp); wet.connect(comp); comp.connect(c.destination);
    bus = { ctx: c, in: inp };
    return inp;
  }
  function piano(freq, dur = 1.2, vol = 0.07, delay = 0) {
    if (muted) return;
    const c = audio();
    if (!c) return;
    const out = pianoBus(c), t = c.currentTime + delay + 0.005;
    const note = Math.log2(freq / 261.6);                       // октав от до первой октавы
    const sustain = Math.max(0.5, dur * (1.5 - 0.35 * note));    // низкие ноты звучат дольше
    const B = 0.00008 * Math.pow(2, 1.9 * (note + 2));          // негармоничность растёт к краям клавиатуры
    const bright = Math.max(0.25, Math.min(1, 0.85 - 0.12 * note));
    const nPart = Math.max(6, Math.min(16, Math.floor(7000 / freq)));
    const strings = [0, 0.9, -1.1];                              // расстройка трёх струн, центы
    for (let si = 0; si < strings.length; si++) {
      const sg = c.createGain();
      sg.gain.value = si === 0 ? 0.55 : 0.3;
      // у второй и третьей струны затухание медленнее — «послезвучие»
      const tail = si === 0 ? 1 : 1.55;
      sg.connect(out);
      for (let n = 1; n <= nPart; n++) {
        const fn = freq * n * Math.sqrt(1 + B * n * n) * Math.pow(2, strings[si] / 1200);
        if (fn > 12000) break;
        const hammer = Math.abs(Math.sin(Math.PI * n / 8)) * 0.85 + 0.15;   // удар в 1/8 струны
        let amp = hammer * Math.pow(n, -1.05) * Math.pow(bright, (n - 1) * 0.45);
        if (amp < 0.004) continue;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = fn;
        const T = sustain * tail / (1 + 0.55 * (n - 1));          // верхние гармоники гаснут быстрее
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp * vol * 2.4, t + 0.003);
        g.gain.exponentialRampToValueAtTime(amp * vol * 1.1, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + T);
        o.connect(g).connect(sg);
        o.start(t); o.stop(t + T + 0.05);
      }
    }
    // стук молоточка: короткий отфильтрованный шум
    const n2 = Math.floor(c.sampleRate * 0.03), buf = c.createBuffer(1, n2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n2; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n2, 2);
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = Math.min(4000, freq * 3.2); bp.Q.value = 0.8; ng.gain.value = vol * 1.6;
    src.connect(bp).connect(ng).connect(out);
    src.start(t);
  }


  // 2.4.5: инструменты звуков по умолчанию — хэнг (стальная полусфера), челеста и гонг; общий негромкий зал.
  let bus2 = null;
  function room(c, wetv, tone) {
    const key = wetv + '|' + tone;
    if (bus2 && bus2.ctx === c && bus2.k === key) return bus2.in;
    const inp = c.createGain(), dry = c.createGain(), wet = c.createGain(), comp = c.createDynamicsCompressor();
    dry.gain.value = 0.9; wet.gain.value = wetv;
    const len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.45 * i / len); d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    }
    const conv = c.createConvolver(); conv.buffer = ir;
    const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = tone; tf.Q.value = 0.4;
    inp.connect(tf); tf.connect(dry); tf.connect(conv); conv.connect(wet); dry.connect(comp); wet.connect(comp); comp.connect(c.destination);
    bus2 = { ctx: c, in: inp, k: key };
    return inp;
  }
  function burst(c, out, t, dur, f, q, vol) {
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; g.gain.value = vol;
    src.connect(bp).connect(g).connect(out); src.start(t);
  }
  // parts: [отношение частоты, громкость, затухание в сек]; drop — начальное завышение тона (мягкий «щелчок» удара)
  function additive(c, out, f, t, parts, vol, drop = 0) {
    for (const [r, a, T] of parts) {
      const fn = f * r; if (fn > 14000 || a * vol < 0.0004) continue;
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      if (drop) { o.frequency.setValueAtTime(fn * (1 + drop), t); o.frequency.exponentialRampToValueAtTime(fn, t + 0.035); } else o.frequency.value = fn;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a * vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + T);
      o.connect(g).connect(out); o.start(t); o.stop(t + T + 0.05);
    }
  }
  // Хэнг: у каждой ноты основной тон, октава и дуодецима, мягкий удар подушечкой пальца, долгое тёплое затухание.
  function hang(f, dur = 1, vol = 0.07, delay = 0) {
    if (muted) return;
    const c = audio(); if (!c) return;
    const out = room(c, 0.4, 6000), t = c.currentTime + delay + 0.005, sus = Math.max(1.3, dur * 2.4);
    additive(c, out, f, t, [[1, 1, sus], [1.0035, 0.5, sus * 0.95], [2, 0.62, sus * 0.6], [2.004, 0.3, sus * 0.55], [3, 0.3, sus * 0.38], [4.02, 0.07, sus * 0.14], [5.9, 0.035, sus * 0.08]], vol * 1.5, 0.0025);
    burst(c, out, t, 0.025, Math.min(2500, f * 2.2), 0.9, vol * 0.55);
  }
  // Челеста: стальные пластины под молоточками, колокольчатые обертоны.
  function celesta(f, dur = 1, vol = 0.07, delay = 0) {
    if (muted) return;
    const c = audio(); if (!c) return;
    const out = room(c, 0.4, 9000), t = c.currentTime + delay + 0.005, s = Math.max(0.5, dur * 1.4);
    additive(c, out, f, t, [[1, 1, s], [2.0, 0.35, s * 0.55], [3.0, 0.15, s * 0.3], [5.4, 0.09, s * 0.16], [8.2, 0.04, s * 0.09]], vol * 1.5, 0.0015);
    burst(c, out, t, 0.012, Math.min(7000, f * 4), 1, vol * 0.4);
  }
  // Мягкое трение и глухое касание тяжёлого самоцвета: без музыкальных нот и костяшек.
  function gemSlide(vol = 0.035, delay = 0) {
    if (muted) return;
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay + 0.003;
    const n = Math.floor(c.sampleRate * 0.115);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * p) * Math.pow(1 - p, 0.7);
    }
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.55;
    g.gain.value = vol; src.connect(lp).connect(g).connect(c.destination); src.start(t);
    // Едва заметный низкий контакт камня с камнем, без тонального звона.
    burst(c, c.destination, t + 0.075, 0.027, 270, 0.45, vol * 0.42);
  }
  // Гонг: неклассический набор обертонов, медленное нарастание, долгое затухание.
  function gong(f, dur = 2, vol = 0.07, delay = 0) {
    if (muted) return;
    const c = audio(); if (!c) return;
    const out = room(c, 0.4, 7000), t = c.currentTime + delay + 0.005;
    for (const [r, a, T] of [[1, 1, dur], [1.47, 0.7, dur * 0.9], [2.09, 0.5, dur * 0.75], [2.56, 0.4, dur * 0.6], [3.4, 0.22, dur * 0.45], [4.12, 0.14, dur * 0.3]]) {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o2.type = 'sine';
      o.frequency.value = f * r; o2.frequency.value = f * r * 1.004;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a * vol * 0.8, t + 0.05 + 0.03 * r); g.gain.exponentialRampToValueAtTime(0.0001, t + T);
      o.connect(g); o2.connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + T + 0.05); o2.stop(t + T + 0.05);
    }
    burst(c, out, t, 0.12, Math.min(3500, f * 6), 0.6, vol * 0.7);
  }
  // Гул электричества: сетевой гул 50/100 Гц с «дрожанием», щелчки разрядов и короткий звонкий разряд в начале.
  function electric(vol = 0.05, dur = 0.7) {
    if (muted) return;
    const c = audio(); if (!c) return;
    const t = c.currentTime + 0.005, out = c.destination;
    const mix = c.createGain(), lp = c.createBiquadFilter(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.12); lp.frequency.exponentialRampToValueAtTime(500, t + dur); lp.Q.value = 2;
    am.gain.value = 0.7; lfo.frequency.value = 100; lg.gain.value = 0.3; lfo.connect(lg).connect(am.gain);
    mix.gain.setValueAtTime(0.0001, t); mix.gain.linearRampToValueAtTime(vol, t + 0.03); mix.gain.setValueAtTime(vol, t + dur * 0.55); mix.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, a] of [[50, 1], [100, 0.7], [150, 0.4], [200, 0.25]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = a;
      o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
    lp.connect(am).connect(mix).connect(out); lfo.start(t); lfo.stop(t + dur + 0.05);
    // разряд в начале: быстрый спад тона и шум
    const z = c.createOscillator(), zg = c.createGain(); z.type = 'square';
    z.frequency.setValueAtTime(2800, t); z.frequency.exponentialRampToValueAtTime(220, t + 0.09);
    zg.gain.setValueAtTime(vol * 0.9, t); zg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    z.connect(zg).connect(out); z.start(t); z.stop(t + 0.12);
    // потрескивание разрядов
    for (const [dt, f] of [[0.05, 3200], [0.17, 2400], [0.26, 3800], [0.4, 2700], [0.53, 3500]]) burst(c, out, t + dt, 0.018, f, 0.8, vol * 1.1);
  }

  return {
    piano, hang, celesta, gong,
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      try { localStorage.setItem('gem-muted', v ? '1' : '0'); } catch (e) { /* без хранилища */ }
    },
    // 2.4.5: инструмент у каждого события выбран владельцем (хэнг / челеста / гонг; молния — гул электричества)
    shield() { hang(131, 0.16, 0.07); hang(98, 0.14, 0.05, 0.01); noise(0.04, 0.02); },   // 2.5.1: глухой стук о щит (блок, поглощение щитом)
    swap()  { gemSlide(0.036); },
    bad()   { hang(185, 0.45, 0.07); hang(175, 0.45, 0.06, 0.02); },
    match(count = 3, bonus = 1, step = 1) {
      // При сборе комбинации — одно приглушённое касание вместо серии костяшек.
      gemSlide(0.027);
    },
    hit(amount = 1) { const v = Math.min(0.12, 0.06 + amount / 400); hang(110, 0.18, v); hang(82, 0.18, v * 0.9, 0.015); },
    lightning() { electric(0.12, 0.7); },
    heal() { [523, 659, 784, 1046].forEach((f, i) => celesta(f, 0.8, 0.05, i * 0.1)); },
    chaos() { [659, 392, 988, 523, 1175, 440, 880, 330].forEach((f, i) => hang(f, 0.35, 0.04, i * 0.045)); },
    transmute() { [1319, 1046, 784, 659].forEach((f, i) => celesta(f, 0.3, 0.04, i * 0.05)); celesta(1568, 0.8, 0.05, 0.32); },
    fire() { [196, 247, 294, 392, 494, 587, 740].forEach((f, i) => hang(f, 0.4, 0.05, i * 0.05)); noise(0.5, 0.015, 0.05); },
    pet() { [523, 659, 880].forEach((f, i) => hang(f, 0.5, 0.05, i * 0.07)); },              // 1.5.1: приём питомца
    growl() { hang(98, 0.6, 0.09); hang(73, 0.6, 0.08, 0.04); hang(49, 0.8, 0.08, 0.08); },   // вой, дыхание и прочие «громкие» приёмы
    rare() { [1319, 1568, 2093].forEach((f, i) => hang(f, 0.9, 0.04, i * 0.09)); },           // редкая добыча
    shard() { [392, 523, 659, 784, 1046, 1319].forEach((f, i) => celesta(f, 1.2, 0.06, i * 0.12)); },   // осколок Сердца
    win()  { [523, 659, 784, 1046].forEach((f, i) => celesta(f, 1.0, 0.07, i * 0.14)); celesta(262, 1.4, 0.06, 0.5); },
    crit() { [1046, 1568].forEach((f, i) => celesta(f, 0.5, 0.06, i * 0.07)); },              // 2.4.4: крит («Ярость»)
    boss() { [392, 523, 659, 784, 659, 784, 1046, 1319].forEach((f, i) => hang(f, 1.0, 0.07, i * 0.13)); [196, 262, 330].forEach((f) => hang(f, 1.6, 0.06, 1.05)); },   // победа над стражем
    lose() { gong(110, 2.4, 0.07); gong(82, 2.6, 0.06, 0.6); },
  };
})();
