/* Режим «Забег» (1.8.8): серия боёв с тенями подряд, каждая следующая сильнее. Награда копится в копилке:
   можно продолжить или забрать; поражение или бегство отнимают часть копилки. Рекорд — волна и монеты.
   Чистый модуль: состояние Profile.data.run = { on, wave, pot, best, bestPot, runs }, все функции меняют переданный объект. */
const Run = (() => {
  // 1.8.9: условие забега — правило из World.ARENA_RULES (тени оглушают, травят…); награда волны умножается на множитель условия
  const MODS = { stun: 1.4, toxin: 1.4, ward: 1.3, tough: 1.25, fierce: 1.3, smart: 1.3 };
  const modMult = (id) => MODS[id] || 1;
  const MAX_WAVE = 30, LOSS_KEEP = 0.4, DAILY_WAVES = 12;   // монеты дают только первые 12 волн за сутки (дальше — рекорд без монет)
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  function clean(r) {
    r = r && typeof r === 'object' ? r : {};
    return { on: !!r.on, wave: Math.min(MAX_WAVE + 1, num(r.wave)), pot: num(r.pot), best: Math.min(MAX_WAVE, num(r.best)), bestPot: num(r.bestPot), runs: num(r.runs), mod: typeof r.mod === 'string' && MODS[r.mod] ? r.mod : '', day: typeof r.day === 'string' ? r.day : '', paid: Math.min(DAILY_WAVES, num(r.paid)) };
  }
  function start(r, mod) { r.on = true; r.wave = 1; r.pot = 0; r.runs = num(r.runs) + 1; r.mod = typeof mod === 'string' && MODS[mod] ? mod : ''; return r; }
  // тень текущей волны: уровень растёт на 1 за две волны (старт — на уровень ниже героя), ум — на 2 за волну
  function shadow(r, heroLevel, seed, factions) {
    const w = r.wave, level = Math.max(1, Math.min(100, num(heroLevel) - 1 + Math.floor((w - 1) / 2)));
    const faction = factions[(num(seed) + w * 7) % factions.length];
    return { nick: _t("Тень забега {0}", [w]), faction, gender: (num(seed) + w) % 2 ? 'f' : 'm', level, ai: Math.min(95, 40 + num(heroLevel) / 2 + w * 2), seed: (num(seed) + w * 101) | 0, rule: r.mod || null };
  }
  const waveReward = (w, base) => Math.round(base * (0.5 + 0.1 * w));
  // победа в текущей волне: копилка растёт, рекорд обновляется. Возвращает { add, done } (done — пройдены все волны, выплата автоматически)
  // сколько монетных волн ещё осталось сегодня (счётчик сбрасывается со сменой даты)
  function left(r, day) { if (r.day !== day) { r.day = day; r.paid = 0; } return DAILY_WAVES - r.paid; }
  function win(r, base, day) {
    const add = day && left(r, day) <= 0 ? 0 : waveReward(r.wave, base);
    if (day && add > 0) r.paid++;
    r.pot += add;
    if (r.wave > r.best) r.best = Math.min(MAX_WAVE, r.wave);
    r.bestPot = Math.max(r.bestPot, r.pot);
    r.wave++;
    return { add, done: r.wave > MAX_WAVE };
  }
  function cash(r) { const c = r.pot; r.on = false; r.pot = 0; return c; }
  function lose(r) { const c = Math.floor(r.pot * LOSS_KEEP); r.on = false; r.pot = 0; return c; }
  return { MODS, modMult, MAX_WAVE, LOSS_KEEP, DAILY_WAVES, left, clean, start, shadow, waveReward, win, cash, lose };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Run;
