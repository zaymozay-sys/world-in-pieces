if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Торговые ряды (версия 1.3.0): объявления игрока о продаже вещей, ресурсов, расходников и боеприпасов.

   Пока у игры нет сервера, лоты покупают странствующие купцы: чем ближе цена к справедливой, тем быстрее.
   Логика здесь — без интерфейса и без хранилища (можно тестировать в Node): лоты лежат в Profile.data.market,
   окно — Screens 'market'. Когда появится сервер, «купцы» заменятся живыми покупателями: формат лота уже
   годится для обмена (что продаётся, сколько, за сколько, когда выставлено).

   Лот: { id, kind: 'item'|'res'|'cons'|'ammo', key, n, price, fair, listedAt, checkedAt, entry? }
     item — entry (сама вещь { uid, id, tier, runes }); res — key 'вид:цвет'; cons/ammo — key вида. price — за весь лот. */

const MK_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');
const MK_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');

const Market = (() => {
  const FEE = 0.05;              // сбор за место: 5% от цены (не возвращается при снятии)
  const MAX_LOTS = 8;            // одновременно выставлено не больше
  const BASE_MIN = 12;           // при справедливой цене лот уходит в среднем за ~12 минут
  const NEVER = 3;               // дороже справедливой в 3 раза и больше — не купят никогда
  const PRICE_STEPS = [0.8, 1, 1.3, 1.7, 2.3];   // кнопки цены: доля от справедливой

  // Справедливая цена одной штуки — ориентир купцов (дороже продажи в Лавку, дешевле покупки в Лавке).
  function fairUnit(kind, key, entry, unitPrice) {
    if (kind === 'item') { const it = MK_G.item(entry); return Math.max(1, Math.round(it.price * 0.7)); }
    if (kind === 'res') { const [k, t] = key.split(':'); return Math.max(1, Math.round(MK_B.resPrice(k, Number(t)) * 1.8)); }
    return Math.max(1, Math.round((unitPrice || 1) * 0.75));     // cons/ammo: от цены в Лавке
  }
  const fee = (price, rate = FEE) => Math.max(1, Math.round(price * rate));

  // Среднее время продажи (мин) при цене price и справедливой fair. Infinity — не купят.
  function meanMinutes(price, fair) {
    const r = price / Math.max(1, fair);
    if (r >= NEVER) return Infinity;
    return BASE_MIN * Math.max(0.15, Math.pow(r, 3));
  }
  const etaText = (price, fair) => {
    const m = meanMinutes(price, fair);
    if (!isFinite(m)) return _t("слишком дорого — не купят");
    if (m < 5) return _t("купят почти сразу");
    if (m < 30) return _t("обычно за {0} мин", [Math.round(m)]);
    if (m < 120) return _t("около часа и дольше");
    return _t("долго — несколько часов");
  };

  function makeLot(kind, key, n, price, fair, entry, now = Date.now()) {
    return { id: 'lot' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36), kind, key, n, price, fair, listedAt: now, checkedAt: now, entry: entry || null };
  }

  // Проверка лотов за прошедшее время: каждый может быть куплен (экспоненциальное ожидание).
  // Возвращает { sold, left }. rand — для тестов.
  function tick(lots, now = Date.now(), rand = Math.random) {
    const sold = [], left = [];
    for (const lot of lots) {
      const dt = Math.max(0, (now - (lot.checkedAt || lot.listedAt)) / 60000);
      lot.checkedAt = now;
      const mean = meanMinutes(lot.price, lot.fair);
      const p = isFinite(mean) ? 1 - Math.exp(-dt / mean) : 0;
      if (dt > 0 && rand() < p) sold.push(lot); else left.push(lot);
    }
    return { sold, left };
  }

  return { FEE, MAX_LOTS, BASE_MIN, NEVER, PRICE_STEPS, fairUnit, fee, meanMinutes, etaText, makeLot, tick };
})();

if (typeof module !== 'undefined') module.exports = Market;
