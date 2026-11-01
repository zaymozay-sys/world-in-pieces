/* Искры Сердца: платная валюта. Баланс и права живут на сервере (клиент баланс сам себе не пишет).
   Единица учёта — самая мелкая (зелёная) искра; 1 синяя = 100 зелёных, 1 красная = 100 синих = 10 000 зелёных.
   Цвета только для показа (как медь, серебро и золото у монет); игроки покупают за деньги красные искры, мелкие нужны для расчётов.
   Бесплатно искры не выдаются. Без сети траты невозможны (играть можно). */
const Spark = (() => {
  const BLUE = 100, RED = 10000;
  const K = 1;                           // монет за 1 зелёную искру для героя 1-го уровня (красная = 10 000 монет = 1 золотая); дальше × Hero.priceScale(уровень). Владелец меняет K сам
  const MARKUP = 1.1;                    // покупка вещей за искры дороже обмена на 10%
  const STABLE_PRICES = [150, 250, 400, 600, 900].map((p) => p * RED);
  let state = { balance: 0, rights: [], testGrant: false, testAt: 0, loaded: false };
  const lvl = (l) => l || (typeof Profile !== 'undefined' ? Profile.level() : 1);
  const rate = (level) => Math.max(1, Math.round(K * Hero.priceScale(lvl(level))));          // монет за 1 зелёную искру
  const sparksFor = (coins, level) => Math.max(1, Math.ceil(coins * MARKUP / rate(level)));
  const remote = () => (typeof Net !== 'undefined' && Net.current && Net.current.remote && Net.current.remote.enabled) ? Net.current.remote : null;
  const split = (n) => { n = Math.max(0, Math.floor(n)); return { red: Math.floor(n / RED), blue: Math.floor((n % RED) / BLUE), green: n % BLUE }; };
  // значок: камень (изумруд / сапфир / рубин) в золотой оправе со вспышкой; размер растёт с номиналом
  const GEM = { green: ['#d9ffd0', '#38b45a', '#126a34'], blue: ['#d6ecff', '#3a86e0', '#17408f'], red: ['#ffd9d9', '#e0364a', '#7d1424'] };
  const icon = (kind = 'red') => {
    const [l, m, d] = GEM[kind], id = 'spg' + kind;
    return `<svg class="spark-icon spark-${kind}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l}"/><stop offset=".5" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`
      + `<polygon points="5.5,9 8.5,4.5 15.5,4.5 18.5,9 12,20.5" fill="url(#${id})" stroke="#e0b050" stroke-width="1.7" stroke-linejoin="round"/>`
      + `<path d="M5.5 9h13M8.5 4.5L10.5 9 12 20.5 13.5 9 15.5 4.5M10.5 9L12 4.5 13.5 9" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/>`
      + `<path d="M19 1.2l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#fffbe0" stroke="#e0a030" stroke-width=".6" stroke-linejoin="round"/></svg>`;
  };
  // сумма: старшие слева, нулевые номиналы не показываются; при нуле — «0» с мелкой искрой
  const html = (n) => {
    const m = split(n), parts = [];
    for (const k of ['red', 'blue', 'green']) if (m[k]) parts.push(`<span class="spark-part">${m[k]}${icon(k)}</span>`);
    if (!parts.length) parts.push(`<span class="spark-part">0${icon('green')}</span>`);
    return `<span class="money spark-money" data-n="${Math.round(n)}">${parts.join('')}</span>`;
  };
  const legend = () => `<span class="spark-legend">${icon('red')} = 100 ${icon('blue')} = 10 000 ${icon('green')}</span>`;
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  async function refresh() {
    const r = remote(); if (!r) return state;
    const j = await r.wallet(); if (j) state = { balance: j.balance, rights: j.rights || [], testGrant: !!j.testGrant, testAt: j.testAt || 0, loaded: true };
    return state;
  }
  async function spend(body) {                     // вернёт { ok, balance } или { error }
    const r = remote(); if (!r) return { error: 'net' };
    const j = await r.walletSpend(Object.assign({ ref: uid('sp') }, body));
    if (j && j.ok) { state.balance = j.balance; if (j.rights) state.rights = j.rights; }
    return j || { error: 'net' };
  }
  async function testGrant() { const r = remote(); if (!r) return { error: 'net' }; const j = await r.walletTestGrant(); if (j && j.ok) state.balance = j.balance; return j || { error: 'net' }; }
  // обмен: n мелких искр → монеты по курсу (в одну сторону). Монеты зачисляются только после подтверждения сервера.
  async function exchange(n) {
    const res = await spend({ kind: 'convert', n }); if (!res.ok) return res;
    const coins = n * rate(); Profile.addCoins(coins); return { ok: true, coins, balance: res.balance };
  }
  const stablePrice = (slot) => STABLE_PRICES[slot - 2];                           // slot: 2..6
  const slotsOwned = () => 1 + state.rights.filter((x) => /^stable_[2-6]$/.test(x)).length;
  return { rate, sparksFor, icon, html, legend, split, refresh, spend, testGrant, exchange, stablePrice, slotsOwned, get state() { return state; }, STABLE_PRICES, MARKUP, BLUE, RED, available: () => !!remote() };
})();
if (typeof module !== 'undefined') module.exports = Spark;
