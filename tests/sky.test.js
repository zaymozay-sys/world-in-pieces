// 1.7.1: небо над картой — время суток, погода, прогноз, предупреждение, поправки боя, ночные гости. Запуск: node tests/sky.test.js
const assert = require('assert');
global._t = global._t || ((x, a) => (a ? x.replace(/\{(\d+)\}/g, (_, i) => a[+i]) : x));
const Sky = require('../js/sky.js');
// 1.7.9: время суток и погода по умолчанию выключены; дальше проверяем их самих, поэтому включаем
assert.strictEqual(Sky.pref('weather'), false, 'погода по умолчанию выключена'); assert.strictEqual(Sky.pref('night'), false, 'время суток по умолчанию выключено');
Sky.setPref('weather', true); Sky.setPref('night', true);

const at = (h, m = 0, d = 13) => new Date(2026, 9, d, h, m, 0).getTime();

// ночь: 21:30–5:30 по часам игрока
assert.strictEqual(Sky.isNight(at(21, 29)), false);
assert.strictEqual(Sky.isNight(at(21, 30)), true);
assert.strictEqual(Sky.isNight(at(0, 0)), true);
assert.strictEqual(Sky.isNight(at(5, 29)), true);
assert.strictEqual(Sky.isNight(at(5, 30)), false);
assert.deepStrictEqual([at(3), at(7), at(12), at(19), at(22)].map((t) => Sky.phase(t)), ['night', 'dawn', 'day', 'dusk', 'night']);
// ночь, начавшаяся вечером, и её продолжение после полуночи — одна и та же
assert.strictEqual(Sky.nightKey(at(23, 0, 13)), Sky.nightKey(at(2, 0, 14)), 'ночь одна и та же до утра');
assert.notStrictEqual(Sky.nightKey(at(23, 0, 13)), Sky.nightKey(at(23, 0, 14)), 'следующая ночь — другая');

// свет: днём слой прозрачен, ночью тёмный и плотный, между ними плавно
assert.strictEqual(Sky.light(at(12)).a, 0);
assert.ok(Sky.light(at(0)).a >= 0.45 && Sky.light(at(0)).b > Sky.light(at(0)).r, 'ночью тёмно-синий');
let prevA = null;
for (let m = 18 * 60; m <= 22 * 60; m += 10) {
  const a = Sky.light(at(Math.floor(m / 60), m % 60)).a;
  if (prevA !== null) assert.ok(a >= prevA - 1e-9, 'к ночи свет только темнеет: ' + m);
  prevA = a;
}
assert.ok(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/.test(Sky.lightCss(at(20))));

// погода: одинакова в одном трёхчасовом блоке и в разные дни/блоки не вырождается
assert.strictEqual(Sky.kindAt(at(12, 1)), Sky.kindAt(at(14, 59)), 'внутри блока погода одна');
const seen = {}; let severe = 0, total = 0;
for (let d = 1; d <= 28; d++) for (let h = 0; h < 24; h += 3) { const k = Sky.kindAt(at(h, 0, d)); seen[k] = (seen[k] || 0) + 1; total++; if (Sky.isSevere(k)) severe++; }
for (const [k] of Sky.KINDS) assert.ok(seen[k] > 0, 'за месяц встретилось явление: ' + k);
assert.ok(severe / total > 0.02 && severe / total < 0.2, 'сильная непогода редкая: ' + (severe / total).toFixed(3));
assert.ok(seen.clear + seen.cloudy > total * 0.5, 'в основном ясно и облачно');

// прогноз: восемь блоков, первый — текущий, совпадает с kindAt
const f = Sky.forecast(at(13, 20), 8);
assert.strictEqual(f.length, 8);
assert.strictEqual(f[0].current, true);
assert.strictEqual(f[0].kind, Sky.kindAt(at(13, 20)));
assert.strictEqual(new Date(f[0].from).getHours(), 12, 'блок начинается с кратного трём часа');
for (let i = 1; i < f.length; i++) { assert.strictEqual(f[i].from, f[i - 1].to); assert.strictEqual(f[i].kind, Sky.kindAt(f[i].from + 60000), 'прогноз = то, что наступит'); }

// штормовое предупреждение: непогода сейчас или в ближайшие три часа
let foundNow = null, foundSoon = null, calm = null;
for (let d = 1; d <= 60 && !(foundNow && foundSoon && calm); d++) for (let h = 0; h < 24; h++) {
  const t = at(h, 30, d), w = Sky.warning(t);
  if (w && w.active && !foundNow) foundNow = { t, w };
  if (w && !w.active && !foundSoon) foundSoon = { t, w };
  if (!w && !calm) calm = t;
}
assert.ok(foundNow && foundSoon && calm, 'за два месяца бывают все три случая');
assert.ok(Sky.isSevere(foundNow.w.kind) && foundNow.w.left >= 1 && foundNow.w.left <= 180);
assert.ok(Sky.isSevere(foundSoon.w.kind) && foundSoon.w.minutes >= 1 && foundSoon.w.minutes <= 180);
assert.strictEqual(Sky.kindAt(foundSoon.w.from + 60000), foundSoon.w.kind, 'предупреждение называет то, что и вправду придёт');

// подпись срока
assert.strictEqual(Sky.span(40), '40 мин');
assert.strictEqual(Sky.span(180), '3 ч');
assert.strictEqual(Sky.span(0), '1 мин');

// подмена для проверки
Sky.setDev({ hour: 23, kind: 'storm' });
assert.strictEqual(Sky.isNight(), true);
assert.strictEqual(Sky.kindAt(), 'storm');
assert.strictEqual(Sky.warning().active, true);
Sky.setDev(null);
assert.strictEqual(Sky.dev, null);

// облик явления по местности: снег вместо дождя и грозы, пески — без дождя
assert.strictEqual(Sky.local('rain', 'snow').vis, 'snow');
assert.strictEqual(Sky.local('storm', 'snow').vis, 'blizzard');
assert.strictEqual(Sky.local('storm', 'snow').base, 'storm', 'правила боя от местности не зависят');
assert.strictEqual(Sky.local('rain', 'desert').vis, 'clear');
assert.strictEqual(Sky.local('storm', 'desert').vis, 'sand');
assert.strictEqual(Sky.local('thickfog', 'desert').vis, 'haze');
assert.strictEqual(Sky.local('downpour', '').vis, 'heavy');
assert.strictEqual(Sky.local('clear', 'snow').vis, 'clear');
assert.strictEqual(Sky.biomeOf('tundra'), 'snow'); assert.strictEqual(Sky.biomeOf('badlands'), 'desert'); assert.strictEqual(Sky.biomeOf('meadow'), '');

// поправки боя
assert.deepStrictEqual(Sky.battleFx(at(23)), { night: 1, wx: Sky.isSevere(Sky.kindAt(at(23))) ? Sky.kindAt(at(23)) : null });
assert.strictEqual(Sky.hpMul({ night: 1 }), 1.10); assert.strictEqual(Sky.hpMul({ night: 0 }), 1); assert.strictEqual(Sky.hpMul(undefined), 1);
assert.strictEqual(Sky.lootMul({ night: 1 }), 1.15); assert.strictEqual(Sky.lootMul({}), 1);
assert.strictEqual(Sky.spellMul({ wx: 'storm' }, 'lightning'), 1.2);
assert.strictEqual(Sky.spellMul({ wx: 'storm' }, 'fire'), 1);
assert.strictEqual(Sky.spellMul({ wx: 'downpour' }, 'fire'), 0.75);
assert.strictEqual(Sky.spellMul({ wx: 'downpour' }, 'heal'), 1.25);
assert.strictEqual(Sky.spellMul({ wx: 'thickfog' }, 'heal'), 1);
assert.strictEqual(Sky.spellMul({}, 'fire'), 1); assert.strictEqual(Sky.spellMul(null, 'fire'), 1);
assert.strictEqual(Sky.hidesEnemy({ wx: 'thickfog' }), true); assert.strictEqual(Sky.hidesEnemy({ wx: 'storm' }), false); assert.strictEqual(Sky.hidesEnemy({}), false);
assert.strictEqual(Sky.visionPenalty('thickfog'), 1); assert.strictEqual(Sky.visionPenalty('rain'), 0);
// шаг: дождь замедляет только мягкую землю
assert.strictEqual(Sky.stepMul('rain', 'meadow'), 1.25); assert.strictEqual(Sky.stepMul('storm', 'swamp'), 1.25); assert.strictEqual(Sky.stepMul('downpour', 'field'), 1.25);
assert.strictEqual(Sky.stepMul('rain', 'mountain'), 1); assert.strictEqual(Sky.stepMul('clear', 'meadow'), 1); assert.strictEqual(Sky.stepMul('fog', 'meadow'), 1);

// описание поправок для карточки
assert.deepStrictEqual(Sky.effectLines('clear', false), []);
assert.strictEqual(Sky.effectLines('clear', true).length, 1);
assert.ok(Sky.effectLines('storm', true, 'Метель').some((s) => s.startsWith('Метель:')), 'в тексте — местное название');
assert.strictEqual(Sky.effectLines('downpour', false).length, 2);

// ночные гости: 12 штук, на свободных сотах, не теснее четырёх сот, виды по цвету, одинаковы по зерну
const cells = []; for (let i = 0; i < 400; i++) cells.push({ idx: i, tier: 1 + (i % 10), q: i % 20, r: Math.floor(i / 20) });
const far = (a, b) => Math.hypot(a.q - b.q, a.r - b.r);
const mkRand = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const g1 = Sky.guests(cells, mkRand(5), '2026-10-13', far), g2 = Sky.guests(cells, mkRand(5), '2026-10-13', far);
assert.deepStrictEqual(g1, g2, 'гости по зерну одинаковы');
assert.strictEqual(g1.length, Sky.GUEST_COUNT);
assert.strictEqual(new Set(g1.map((g) => g.idx)).size, g1.length, 'на разных сотах');
for (const g of g1) {
  assert.ok(g.guest && g.id.startsWith('n2026-10-13-'));
  const [lo, hi] = Sky.GUESTS[g.species]; assert.ok(g.tier >= lo && g.tier <= hi, `${g.species} не на своём цвете: ${g.tier}`);
}
for (let i = 0; i < g1.length; i++) for (let j = i + 1; j < g1.length; j++) assert.ok(far(cells[g1[i].idx], cells[g1[j].idx]) >= 4, 'гости не теснее четырёх сот');
assert.deepStrictEqual(Sky.guests([], mkRand(1), 'k', far), [], 'на пустой карте — пусто');

// настройки: время суток и погоду можно выключить (по отдельности)
assert.strictEqual(Sky.pref('night'), true); assert.strictEqual(Sky.pref('weather'), true);
Sky.setPref('night', false);
assert.strictEqual(Sky.isNight(at(23)), false); assert.strictEqual(Sky.phase(at(23)), 'day'); assert.strictEqual(Sky.light(at(23)).a, 0);
assert.strictEqual(Sky.battleFx(at(23)).night, 0, 'без времени суток ночь не влияет на бой');
Sky.setPref('night', true);
assert.strictEqual(Sky.isNight(at(23)), true);
let sev = null;
for (let d = 1; d <= 60 && !sev; d++) for (let h = 0; h < 24; h += 3) if (Sky.isSevere(Sky.kindAt(at(h, 0, d)))) { sev = at(h, 30, d); break; }
assert.ok(sev, 'нашлась непогода');
Sky.setPref('weather', false);
assert.strictEqual(Sky.kindAt(sev), 'clear'); assert.strictEqual(Sky.warning(sev), null);
assert.ok(Sky.forecast(sev, 8).every((b) => b.kind === 'clear' && !b.severe), 'без погоды в прогнозе всегда ясно');
assert.strictEqual(Sky.battleFx(sev).wx, null, 'без погоды непогода не влияет на бой');
assert.strictEqual(Sky.stepMul(Sky.kindAt(sev), 'meadow'), 1);
Sky.setDev({ hour: 23, kind: 'storm' });
assert.strictEqual(Sky.kindAt(), 'clear', 'выключенная погода сильнее подмены для проверки');
Sky.setDev(null);
Sky.setPref('weather', true);
assert.strictEqual(Sky.kindAt(sev) === 'clear', false, 'включили обратно — непогода на месте');
assert.strictEqual(Sky.setPref('нет такой', true), false);
console.log('sky: ok');
