/* 1.7.5: заставка «осколки собираются в название». Осколки (art/ui/shard-1…6) влетают, кружат и складываются в надпись
   «Хрупкий мир», затем вспыхивает золотое название. Рисуется на canvas поверх фона заставки; без картинок осколков
   рисует цветные многоугольники. Нажатие пропускает. Чистая визуальная часть — игровых данных не трогает. */
const SplashFx = (() => {
  const PAL = [[60, 120, 230], [40, 180, 100], [150, 80, 210], [220, 50, 60], [235, 170, 40], [225, 235, 245]];
  const FLOAT = 0.8, GATHER = 1.5, HOLD = 0.9, END = FLOAT + GATHER + HOLD;
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
    let W, H, DPR, shards, title, T0, raf = 0, stopped = false;
    const font = (fs) => `700 ${fs}px "Cormorant Garamond",Georgia,serif`;

    function layout() {
      DPR = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight;
      cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const off = document.createElement('canvas'); off.width = W; off.height = H; const o = off.getContext('2d');
      const fs = Math.min(W / (opt.title.length * 0.62), H / 3.4);
      o.font = font(fs); o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
      const y = H * 0.46; o.fillText(opt.title, W / 2, y);
      const step = Math.max(6, Math.round(fs / 12)), d = o.getImageData(0, 0, W, H).data, pts = [];
      for (let yy = 0; yy < H; yy += step) for (let xx = 0; xx < W; xx += step) if (d[(yy * W + xx) * 4 + 3] > 128) pts.push([xx + rnd(-1, 1), yy + rnd(-1, 1)]);
      title = { pts, step, fs, y };
    }
    function build(imgs) {
      shards = title.pts.map(([tx, ty]) => {
        const ang = Math.random() * 6.28, dist = rnd(0.35, 0.75) * Math.max(W, H), k = Math.random() * PAL.length | 0;
        return { shape: shape(), col: PAL[k], img: imgs.length ? imgs[(imgs.length > k ? k : Math.random() * imgs.length | 0)] : null, tx, ty,
          sx: W / 2 + Math.cos(ang) * dist, sy: H / 2 + Math.sin(ang) * dist,
          orb: rnd(0.2, 0.5) * Math.min(W, H), oa: Math.random() * 6.28, os: rnd(0.5, 1.4) * (Math.random() < 0.5 ? -1 : 1),
          rot: Math.random() * 6.28, spin: rnd(-5, 5), size0: rnd(0.8, 1.7) * title.step * 1.5, delay: Math.random() * 0.5 };
      });
    }
    function drawShard(s, x, y, size, rot, a) {
      ctx.globalAlpha = a;
      if (s.img) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); const w = size * 2; ctx.drawImage(s.img, -w / 2, -w / 2, w, w); ctx.restore(); ctx.globalAlpha = 1; return; }
      const [r, g, b] = s.col, c = Math.cos(rot), n = Math.sin(rot);
      const pts = s.shape.map(([px, py]) => [x + (px * c - py * n) * size, y + (px * n + py * c) * size]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], l = Math.atan2((p[1] + q[1]) / 2 - y, (p[0] + q[0]) / 2 - x), lit = Math.cos(l + 2.3), k = 0.45 + 0.55 * (lit * 0.5 + 0.5), add = 40 * Math.max(0, lit);
        ctx.fillStyle = `rgb(${Math.min(255, r * k + add) | 0},${Math.min(255, g * k + add) | 0},${Math.min(255, b * k + add) | 0})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(0.6, size * 0.05); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      if (stopped) return;
      const t = (now - T0) / 1000;
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
        ctx.save(); ctx.globalAlpha = fade; ctx.font = font(title.fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const g = ctx.createLinearGradient(0, title.y - title.fs / 2, 0, title.y + title.fs / 2);
        g.addColorStop(0, '#fff1b0'); g.addColorStop(0.5, '#e8c26a'); g.addColorStop(1, '#a8782a');
        ctx.shadowColor = 'rgba(255,220,120,.8)'; ctx.shadowBlur = 30 * (1 - fade) + 10; ctx.fillStyle = g; ctx.fillText(opt.title, W / 2, title.y); ctx.restore();
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
