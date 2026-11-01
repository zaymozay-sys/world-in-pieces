// Искры Сердца (2.1.2): платная валюта. Баланс, журнал и права живут на сервере (клиент баланс сам себе не пишет).
// Здесь — каталог товаров с твёрдой ценой и запретный список: три топовых комплекта продавать нельзя ни при каких условиях.
// Единица учёта — самая мелкая (зелёная) искра. 1 синяя = 100 зелёных, 1 красная = 100 синих = 10 000 зелёных. Игроки покупают только красные.
const RED = 10000, BLUE = 100;
const FORBIDDEN_SETS = ['hammer', 'bastion', 'legend'];        // «Молот», «Бастион», «Легенда Подземелий» — только трофеи
const STABLE_PRICES = [150, 250, 400, 600, 900].map((p) => p * RED);               // слоты зверинца 2–6 (первый слот бесплатно)
const FIXED = {};
STABLE_PRICES.forEach((p, i) => { FIXED['stable_' + (i + 2)] = { price: p, needs: i ? 'stable_' + (i + 1) : null }; });
// косметика: цена задаётся здесь, чтобы клиент не мог заплатить меньше
const COSMETICS = {
  frame_spark: 60, frame_ember: 90, frame_aurora: 120,
  avatar_dwarf_veteran: 30000, avatar_elf_sage: 30000, avatar_human_knight: 30000, avatar_lizard_shaman: 30000,
  look_guardian: 50000, look_nightwind: 50000, look_stonewall: 50000,           // цены в красных искрах
};
for (const [k, p] of Object.entries(COSMETICS)) FIXED[k] = { price: p * RED, needs: null };
const KINDS = ['fixed', 'convert', 'goods'];
const MAX_SPEND = 1e12, TEST_GRANT = 1000 * RED, TEST_GRANT_DAY_MS = 86400000;
// проверка запроса траты; возвращает { ok, price, reason }
function check(body, rights) {
  if (!body || !KINDS.includes(body.kind)) return { ok: false, reason: 'kind' };
  if (typeof body.ref !== 'string' || !/^[0-9a-zA-Z_-]{8,64}$/.test(body.ref)) return { ok: false, reason: 'ref' };
  if (body.kind === 'fixed') {
    const it = typeof body.item === 'string' ? FIXED[body.item] : null;
    if (!it) return { ok: false, reason: 'item' };
    if (rights.has(body.item)) return { ok: false, reason: 'owned' };
    if (it.needs && !rights.has(it.needs)) return { ok: false, reason: 'order' };
    return { ok: true, price: it.price };
  }
  const n = body.n;
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_SPEND) return { ok: false, reason: 'n' };
  if (body.kind === 'goods' && (typeof body.item !== 'string' || FORBIDDEN_SETS.some((s) => body.item.indexOf(s) >= 0))) return { ok: false, reason: 'forbidden' };
  return { ok: true, price: n };
}
module.exports = { RED, BLUE, FORBIDDEN_SETS, FIXED, STABLE_PRICES, KINDS, MAX_SPEND, TEST_GRANT, TEST_GRANT_DAY_MS, check };
