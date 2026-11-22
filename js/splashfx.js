/* Заставка «осколки собираются в название»: цветные многоугольники влетают, кружат и складываются в надпись «Хрупкий мир»,
   затем вспыхивает золотое название. Всё рисуется на canvas графикой, без картинок. Нажатие пропускает.
   Чистая визуальная часть — игровых данных не трогает. */
const SplashFx = (() => {
  const PAL = [[60, 120, 230], [40, 180, 100], [150, 80, 210], [220, 50, 60], [235, 170, 40], [225, 235, 245]];
  const PIXELS = 2.5e6, MAXN = 520, FLOAT = 0.8, GATHER = 1.5, HOLD = 0.9, END = FLOAT + GATHER + HOLD;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function loadShards(urls, ms) {
    return new Promise((resolve) => {
      const out = []; let left = urls.length, done = false;
      const fin = () => { if (!done) { done = true; resolve(out.filter((i) => i && i.complete && i.naturalWidth)); } };
      if (!left) return fin();
      urls.forEach((u, i) => { const im = new Image(); im.onload = im.onerror = () => { if (--left === 0) fin(); }; im.src = u; out[i] = im; });
      setTimeout(fin, ms);
    });
  }
  function shape() {
    const n = 5 + (Math.random() * 3 | 0), pts = [], a0 = Math.random() * 6.28;
    for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.28 + rnd(-0.2, 0.2), r = rnd(0.55, 1) * (i % 2 ? 1 : 1.15); pts.push([Math.cos(a) * r, Math.sin(a) * r * rnd(0.7, 1)]); }
    return pts;
  }

  // play(host, { title, sub, shardUrls, onEnd }) → { stop() }
  function play(host, opt) {
    const cv = document.createElement('canvas'); cv.className = 'splash-fx';
    host.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W, H, DPR, shards, title, T0, raf = 0, stopped = false, last = 0, ema = 0, nf = 0, thinned = false;
    const font = (fs) => `700 ${fs}px "Cormorant Garamond",Georgia,serif`;

    function layout() {
      W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight;
      DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(PIXELS / (W * H))));   // 2.4.7: бюджет пикселей холста — на больших экранах без лишней плотности
      cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const fs = Math.min(W * (W < H ? 0.8 : 0.9) / (opt.title.length * 0.62), H / 3.4);   // 1.8.2: на телефоне стоя поля по краям
      const step = Math.max(6, Math.round(fs / 12)), y = H * 0.46;
      const pad = Math.ceil(fs * 0.35), top = y - fs / 2 - pad;
      const tw = Math.ceil(W * DPR), th = Math.ceil((fs + 2 * pad) * DPR);
      // Осколки и золотая надпись должны иметь одну геометрию глифов.
      // Сначала рисуем маску в ПОЛНОМ разрешении и лишь затем уменьшаем её для выборки точек.
      // Раньше текст отдельно растеризовался в масштабе 1/step; браузер менял метрики
      // и сглаживание букв, а точки брались из углов ячеек (сдвиг на полшага).
      const glyph = document.createElement('canvas'); glyph.width = tw; glyph.height = th;
      const gm = glyph.getContext('2d'); gm.setTransform(DPR, 0, 0, DPR, 0, 0);
      gm.font = font(fs); gm.textAlign = 'center'; gm.textBaseline = 'middle';
      gm.fillStyle = '#fff'; gm.fillText(opt.title, W / 2, pad + fs / 2);
      // Точки осколков — центры ячеек, с учётом того же top, что у финального текста.
      const off = document.createElement('canvas');
      off.width = Math.ceil(W / step); off.height = Math.ceil((fs + 2 * pad) / step);
      const o = off.getContext('2d', { willReadFrequently: true });
      o.drawImage(glyph, 0, 0, tw, th, 0, 0, W / step, (fs + 2 * pad) / step);
      const d = o.getImageData(0, 0, off.width, off.height).data, pts = [];
      for (let gy = 0; gy < off.height; gy++) for (let gx = 0; gx < off.width; gx++) {
        if (d[(gy * off.width + gx) * 4 + 3] > 128) {
          pts.push([(gx + 0.5) * step + rnd(-1, 1), top + (gy + 0.5) * step + rnd(-1, 1)]);
        }
      }
      let st = step;
      if (pts.length > MAXN) { const f = pts.length / MAXN; for (let i = pts.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; const t = pts[i]; pts[i] = pts[j]; pts[j] = t; } pts.length = MAXN; st = step * Math.sqrt(f); }   // 2.4.7: не больше MAXN осколков — иначе кадр не успевает на слабых устройствах
      title = { pts, step: st, fs, y, top, pad };
      // Золотая надпись рисуется тем же шрифтом, с той же привязкой и размером,
      // что белая маска: формы букв теперь совпадают независимо от DPI.
      const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
      const t2 = tc.getContext('2d'); t2.setTransform(DPR, 0, 0, DPR, 0, 0); t2.font = font(fs); t2.textAlign = 'center'; t2.textBaseline = 'middle';
      const gg = t2.createLinearGradient(0, pad, 0, pad + fs); gg.addColorStop(0, '#fff1b0'); gg.addColorStop(0.5, '#e8c26a'); gg.addColorStop(1, '#a8782a');
      t2.shadowColor = 'rgba(255,220,120,.8)'; t2.shadowBlur = 24; t2.fillStyle = gg; t2.fillText(opt.title, W / 2, pad + fs / 2);
      title.cache = tc;
    }
    // 24 готовых осколка (6 цветов × 4 формы): граненый многоугольник рисуется один раз, в кадре — только drawImage с поворотом
    const U = 48; let sprites = null;
    function makeSprites() {
      const side = Math.ceil(U * 2.6), out = [];
      for (let k = 0; k < PAL.length; k++) for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas'); c.width = c.height = side; const g = c.getContext('2d'), [r, gr, b] = PAL[k], pts = shape().map(([px, py]) => [side / 2 + px * U, side / 2 + py * U]);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length], l = Math.atan2((p[1] + q[1]) / 2 - side / 2, (p[0] + q[0]) / 2 - side / 2), lit = Math.cos(l + 2.3), kk = 0.45 + 0.55 * (lit * 0.5 + 0.5), add = 40 * Math.max(0, lit);
          g.fillStyle = `rgb(${Math.min(255, r * kk + add) | 0},${Math.min(255, gr * kk + add) | 0},${Math.min(255, b * kk + add) | 0})`;
          g.beginPath(); g.moveTo(side / 2, side / 2); g.lineTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.closePath(); g.fill();
        }
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1, U * 0.05); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
        out.push({ c, k });
      }
      return out;
    }
    function build(imgs) {
      sprites = makeSprites();
      shards = title.pts.map(([tx, ty]) => {
        const ang = Math.random() * 6.28, dist = rnd(0.35, 0.75) * Math.max(W, H), k = Math.random() * PAL.length | 0;
        const sp = sprites[k * 4 + (Math.random() * 4 | 0)].c;
        return { sp, col: PAL[k], img: imgs.length ? imgs[(imgs.length > k ? k : Math.random() * imgs.length | 0)] : null, tx, ty,
          sx: W / 2 + Math.cos(ang) * dist, sy: H / 2 + Math.sin(ang) * dist,
          orb: rnd(0.2, 0.5) * Math.min(W, H), oa: Math.random() * 6.28, os: rnd(0.5, 1.4) * (Math.random() < 0.5 ? -1 : 1),
          rot: Math.random() * 6.28, spin: rnd(-5, 5), size0: rnd(0.8, 1.7) * title.step * 1.5, delay: Math.random() * 0.5 };
      });
    }
    function drawShard(s, x, y, size, rot, a) {
      ctx.globalAlpha = a;
      if (s.img) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); const w = size * 2; ctx.drawImage(s.img, -w / 2, -w / 2, w, w); ctx.restore(); ctx.globalAlpha = 1; return; }
      const k = size / U * DPR, c = Math.cos(rot) * k, n = Math.sin(rot) * k;   // 2.4.7: готовый спрайт с поворотом вместо отрисовки граней в каждом кадре
      ctx.setTransform(c, n, -n, c, x * DPR, y * DPR); ctx.drawImage(s.sp, -s.sp.width / 2, -s.sp.height / 2); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1;
    }
    function frame(now) {
      if (stopped) return;
      const t = (now - T0) / 1000;
      // слабое устройство: если кадры дольше ~28 мс, один раз вдвое меньше осколков (время анимации считается по часам — не растягивается)
      if (last) { ema = ema ? ema * 0.85 + (now - last) * 0.15 : now - last; if (++nf === 14 && ema > 28 && !thinned) { thinned = true; shards = shards.filter((_, i) => i % 2 === 0); } }
      last = now;
      ctx.clearRect(0, 0, W, H);
      const gp = (t - FLOAT) / GATHER, fade = clamp01((t - FLOAT - GATHER) / 0.7);
      for (const s of shards) {
        const fl = t * s.os, fx = W / 2 + Math.cos(s.oa + fl) * s.orb * (1 + 0.4 * Math.sin(t * 0.9 + s.oa)), fy = H / 2 + Math.sin(s.oa + fl * 1.1) * s.orb * 0.7;
        const inn = ease(t / (0.6 + s.delay)), bx = s.sx + (fx - s.sx) * inn, by = s.sy + (fy - s.sy) * inn;
        const e = ease((gp - s.delay * 0.35) / (1 - 0.35 * 0.5));
        const x = bx + (s.tx - bx) * e + Math.sin(e * Math.PI) * (s.sy - H / 2) * 0.03, y = by + (s.ty - by) * e;
        const size = s.size0 + (title.step * 0.8 - s.size0) * e;
        drawShard(s, x, y, size, (s.rot + s.spin * t) * (1 - e), 1 - 0.55 * fade);
      }
      if (fade > 0) {
        ctx.globalAlpha = fade; ctx.drawImage(title.cache, 0, title.top, W, title.cache.height / DPR); ctx.globalAlpha = 1;
        if (opt.sub) {
          ctx.save(); ctx.globalAlpha = clamp01((t - FLOAT - GATHER - 0.4) / 0.6); ctx.font = `500 ${Math.max(12, title.fs / 6)}px system-ui,sans-serif`;
          ctx.textAlign = 'center'; ctx.fillStyle = '#b9b2c6'; ctx.fillText(opt.sub, W / 2, title.y + title.fs * 0.62); ctx.restore();
        }
      }
      if (t < END) raf = requestAnimationFrame(frame); else finish();
    }
    function finish() { if (stopped) return; stopped = true; cancelAnimationFrame(raf); if (opt.onEnd) opt.onEnd(); }
    layout();
    loadShards(opt.shardUrls || [], 900).then((imgs) => { if (stopped) return; build(imgs); T0 = performance.now(); raf = requestAnimationFrame(frame); });
    return { stop() { stopped = true; cancelAnimationFrame(raf); cv.remove(); }, skip: finish, END, canvas: cv };
  }
  return { play, END };
})();
if (typeof module !== 'undefined') module.exports = SplashFx;
