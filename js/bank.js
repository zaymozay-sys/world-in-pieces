if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Банк (1.8.6). Без интерфейса — можно тестировать в Node.

   Вклад: ставка зависит от того, как давно вы играете подряд: не заходили — ставка 0, серия дней подряд поднимает её
   медленно (0,2% за день серии, потолок 3% в сутки). Проценты зачисляются при заходе в новые сутки. Чеки (пока скрыты
   в игре, пригодятся с сервером): владелец игры выдаёт тестировщикам код вида  CHK-<сумма>-<номер>-<подпись>
   (tools/mkcheque.js); игрок вводит код в банке и получает сумму один раз. Подпись — простая проверка от опечаток и
   подделки «на глаз»; игра без сервера, так что это честность на слово, а не защита. */

const Bank = (() => {
  const DAY = 86400000;
  const RATE_STEP = 0.002;      // прибавка ставки за каждый день подряд, когда вы заходили в игру
  const RATE_MAX = 0.03;        // потолок ставки в сутки
  const CAP = 20000;            // предел вклада
  const SALT = 'hrupkiy-mir-bank';

  const blank = () => ({ dep: 0, day: 0, streak: 0, cheques: {} });
  // Потолок вклада растёт с ценами: scale — Hero.priceScale(уровень героя); без аргумента — базовые 20000.
  const capFor = (scale) => Math.max(CAP, Math.round(CAP * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
  const clean = (b, cap = CAP) => {
    const o = (b && typeof b === 'object') ? b : {};
    const dep = Number.isFinite(o.dep) && o.dep > 0 ? Math.min(cap, Math.floor(o.dep)) : 0;
    const day = Number.isInteger(o.day) && o.day > 0 ? o.day : 0, streak = Number.isInteger(o.streak) && o.streak > 0 ? Math.min(1000, o.streak) : 0;
    return { dep, day, streak, cheques: (o.cheques && typeof o.cheques === 'object' && !Array.isArray(o.cheques)) ? o.cheques : {} };
  };

  // Номер суток по местному времени.
  const dayOf = (now) => { const d = new Date(now); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
  // Ставка за сутки при серии заходов подряд: 0, если не заходили; растёт медленно до потолка.
  const rate = (streak) => Math.min(RATE_MAX, Math.max(0, streak) * RATE_STEP);
  // Заход в игру: новые сутки подряд — серия растёт и вклад получает проценты; пропуск суток — серия с нуля и ставка 0.
  // Возвращает начисленные проценты.
  function visit(b, now, cap = CAP) {
    const today = dayOf(now);
    if (b.day === today) return 0;
    const consecutive = b.day > 0 && today === b.day + 1;
    b.streak = consecutive ? b.streak + 1 : 1;
    b.day = today;
    if (!consecutive || !(b.dep > 0)) return 0;
    const gain = Math.min(cap - b.dep, Math.floor(b.dep * rate(b.streak)));
    b.dep += Math.max(0, gain);
    return Math.max(0, gain);
  }
  // Проценты, которые прибавятся при заходе завтра (если зайти).
  const tomorrow = (b, cap = CAP) => (b && b.dep > 0 && b.day > 0 ? Math.min(cap - b.dep, Math.floor(b.dep * rate((b.streak || 0) + 1))) : 0);
  function deposit(b, n, cap = CAP) {
    n = Math.floor(n);
    if (!(n > 0) || b.dep + n > cap) return false;
    b.dep += n;
    return true;
  }
  function withdraw(b, n) {
    n = Math.floor(n);
    if (!(n > 0) || n > b.dep) return false;
    b.dep -= n;
    return true;
  }

  const sig = (amount, id) => {
    let h = 2166136261;
    const s = `${amount}|${id}|${SALT}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36).toUpperCase().padStart(6, '0').slice(-6);
  };
  const makeCheque = (amount, id) => `CHK-${amount}-${id}-${sig(amount, id)}`;
  // Разбор кода: { amount, id } или null.
  function parseCheque(code) {
    const m = /^(?:CHK|ЧК)-(\d{1,7})-([A-Za-zА-Яа-я0-9]{1,12})-([0-9A-Z]{6})$/.exec(String(code || '').trim().toUpperCase());
    if (!m) return null;
    const amount = Number(m[1]), id = m[2];
    return amount > 0 && sig(amount, id) === m[3] ? { amount, id } : null;
  }
  // Погашение: true — выдать amount; повторно один и тот же чек не гасится.
  function redeem(b, code) {
    const c = parseCheque(code);
    if (!c) return { ok: false, why: 'bad' };
    if (b.cheques[c.id]) return { ok: false, why: 'used' };
    b.cheques[c.id] = true;
    return { ok: true, amount: c.amount };
  }

  return { DAY, RATE_STEP, RATE_MAX, CAP, capFor, blank, clean, dayOf, rate, visit, tomorrow, deposit, withdraw, sig, makeCheque, parseCheque, redeem };
})();

if (typeof module !== 'undefined') module.exports = Bank;
