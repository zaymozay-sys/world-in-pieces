/* ПРЕДЛОЖЕНИЕ для утверждения (ничего не внедряет): таблица «ресурс → вещь» для Кузницы 1.6.5.  Версия 2 (12.10.2026).
   Что считает: для каждого типа вещей и цвета — какие два ресурса нужны, сколько штук, сколько монет мастеру, какая доля
   цены Лавки получается и сколько боёв нужно, чтобы добыть нужное количество, ЕСЛИ ИГРОК ОХОТИТСЯ на нужный вид существ.
   Почему «охота на вид», а не «случайный бой»: вид существа на карте виден до боя и игрок выбирает, с кем драться
   (у «своего» вида ресурс выпадает в 3–5 раз чаще, чем в среднем по цвету). Версия 1 считала по случайному виду цвета
   и показывала дыры там, где источник есть, но игрок должен его выбрать.
   Источник ресурса на цвете: лучший из видов, живущих на этом цвете (HexMap.SPAWN), по ожидаемому числу штук за бой =
   шанс × (мин + макс)/2.  Источник «есть», если ожидаемое число ≥ MINYIELD (по умолчанию 0,9 штуки за бой).
   Запуск: node tools/proposal-forge.js [--ratio=0.5] [--coinshare=0.2] [--minyield=0.9] [--md=file.md] [--json=file] */
const fs = require('fs');
global.window = undefined;
require('../js/i18n.js');
global.Tiers = require('../js/tiers.js'); const Gear = global.Gear = require('../js/items.js'); global.Balance = require('../js/balance.js');
const Bestiary = global.Bestiary = require('../js/bestiary.js'); const HexMap = require('../js/hexmap.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const RATIO = Number(arg('ratio', 0.5));          // доля цены Лавки, которую стоит вещь, сделанная в Кузнице (монеты + ресурсы по цене продажи)
const COINSHARE = Number(arg('coinshare', 0.2));  // из этой доли — монеты мастера; остальное — ресурсы
const MINYIELD = Number(arg('minyield', 0.9));    // минимум ожидаемых штук за бой с лучшим видом, чтобы считать источник «есть»
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RES = Bestiary.RESOURCES;

// Лучший источник каждого ресурса на каждом цвете (только виды, которые живут на карте и не «фиксированные»)
const best = {};
for (const k of Object.keys(RES)) {
  best[k] = TIERS.map((t) => {
    let b = null;
    for (const [id, m] of Object.entries(Bestiary.MONSTERS)) {
      const sp = HexMap.SPAWN[id]; if (!sp || sp.fixed || t < sp.tiers[0] || t > sp.tiers[1]) continue;
      const d = m.drops.find((x) => x[0] === k); if (!d) continue;
      const y = d[1] * (d[2] + d[3]) / 2;
      if (!b || y > b.y) b = { id, name: m.name || id, y };
    }
    return b;
  });
}
const yieldOf = (k, t) => (best[k][t - 1] ? best[k][t - 1].y : 0);

// Роли ресурсов: первый в списке, у которого на цвете есть источник (≥ MINYIELD)
const ROLE = {
  metal:   ['ore', 'scrap', 'fang', 'bone'],        // клинки, оковка: руда на высоких цветах, лом на средних, клык на первом
  plate:   ['scale', 'ore', 'scrap', 'fang'],       // тяжёлая броня: чешуя (8–10), руда (6–7), лом (2–5)
  wood:    ['splinter', 'bone', 'hide'],            // древки, луки, деревянные основы
  leather: ['hide', 'feather'],                     // кожа
  bind:    ['silk', 'feather', 'bone', 'shell'],    // обмотки, тетива, ремни
  arcane:  ['essence', 'crystal', 'shell', 'splinter'],  // амулеты и компасы (щепка — деревянный оберег, когда остальное слишком дорого или недоступно)
};
const TYPE_ROLES = {   // [роль 1 (≈60% стоимости ресурсов), роль 2 (≈40%)]
  weapon1: ['metal', 'bind'], weapon2: ['metal', 'wood'], shield: ['plate', 'wood'], head: ['plate', 'leather'], chest: ['plate', 'leather'], arms: ['leather', 'bind'], legs: ['plate', 'leather'],
  shoulders: ['plate', 'leather'], gloves: ['leather', 'bind'], amulet: ['arcane', 'bind'], bag: ['leather', 'bind'], leash: ['leather', 'bind'], compass: ['metal', 'arcane'], ranged: ['wood', 'bind'],
};
const okSrc = (k, t) => yieldOf(k, t) >= MINYIELD - 1e-9;
// Выбор ресурса роли: первый с источником, одна штука которого не превышает 1,4× выделенной на него суммы (иначе малая вещь на высоком цвете
// «съест» всю скидку одной штукой редкого ресурса); если такого нет — самый дешёвый из доступных
const pick = (role, t, allot) => {
  const c = ROLE[role].filter((k) => okSrc(k, t));
  return c.find((k) => Bestiary.resPrice(k, t) <= 1.4 * allot) || c.sort((a, b) => Bestiary.resPrice(a, t) - Bestiary.resPrice(b, t))[0] || null;
};

const rows = [], gaps = new Set();
const types = Object.keys(TYPE_ROLES);
for (const type of types) {
  const sample = Gear.ITEMS.find((i) => i.type === type && !i.relic && !i.faction && i.set !== 'sea' && i.rarity === 'common') || Gear.ITEMS.find((i) => i.type === type && !i.relic);
  if (!sample) continue;
  for (const t of TIERS) {
    const it = Gear.item(Gear.makeEntry(sample.id, t)), price = it.price;
    const budget = price * RATIO, coins = Math.round(budget * COINSHARE), resValue = budget - coins;
    const picks = TYPE_ROLES[type].map((role, i) => pick(role, t, resValue * [0.6, 0.4][i]));
    const parts = [];
    [0.6, 0.4].forEach((share, i) => {
      const r = picks[i];
      if (!r) { parts.push({ kind: null, n: 0 }); return; }
      const unit = Bestiary.resPrice(r, t), n = Math.max(1, Math.round(resValue * share / unit));
      parts.push({ kind: r, n, fights: +(n / yieldOf(r, t)).toFixed(1), src: best[r][t - 1].id });
    });
    TYPE_ROLES[type].forEach((role, i) => { if (!parts[i].kind) gaps.add(`${Gear.TYPE_NAMES[type]}: роль «${{ metal: 'металл', plate: 'пластины', wood: 'дерево', leather: 'кожа', bind: 'обвязка', arcane: 'тайное' }[role]}» на цвете ${t}`); });
    const val = parts.reduce((s, p) => s + (p.kind ? p.n * Bestiary.resPrice(p.kind, t) : 0), 0);
    rows.push({ type, tier: t, base: sample.id, price, coins, parts, resValue: Math.round(val), total: coins + Math.round(val), share: +((coins + val) / price).toFixed(2), fights: Math.max(...parts.map((p) => p.fights || 0)), gap: parts.filter((p) => !p.kind).length });
  }
}
// «Нет источника вообще» по ресурсам (для списка новых существ)
const noSource = {};
for (const k of Object.keys(RES)) noSource[k] = TIERS.filter((t) => !okSrc(k, t));

console.log(`Цель: вся стоимость вещи в Кузнице = ${(RATIO * 100) | 0}% цены Лавки (скидка ${((1 - RATIO) * 100) | 0}%), из них монеты ${(COINSHARE * 100) | 0}%; источник «есть» при ≥ ${MINYIELD} шт. за бой с лучшим видом.`);
console.log('\nЛучший вид-источник ресурса на цвете (шт. за бой):');
console.log('ресурс    ' + TIERS.map((t) => ('ц' + t).padStart(12)).join(''));
for (const k of Object.keys(RES)) console.log(k.padEnd(9), TIERS.map((t) => (best[k][t - 1] ? `${best[k][t - 1].y.toFixed(2)} ${best[k][t - 1].id}`.slice(0, 11) : '—').padStart(12)).join(''));
console.log('\nДыры (роль без источника на цвете):'); [...gaps].forEach((g) => console.log('  ' + g)); if (!gaps.size) console.log('  нет');
console.log('\nРесурсы без источника (< порога) по цветам:'); for (const k of Object.keys(RES)) console.log('  ' + k.padEnd(9), noSource[k].length ? noSource[k].join(',') : '—');
console.log('\nПримеры (обычная вещь каждого типа): ресурсы + монеты (доля цены Лавки) ~боёв охоты');
for (const type of types) {
  const rs = rows.filter((r) => r.type === type);
  console.log(type.padEnd(10), [1, 4, 7, 10].map((t) => { const r = rs.find((x) => x.tier === t); return r ? `ц${t}: ${r.parts.map((p) => (p.kind ? p.n + p.kind : '—')).join('+')} +${r.coins}м (${r.share}) ~${r.fights}б` : ''; }).join(' | '));
}

// ---- Markdown ----
const nm = (k) => RES[k].name;
const RN = { metal: 'металл', plate: 'пластины', wood: 'дерево', leather: 'кожа', bind: 'обвязка', arcane: 'тайное' };
// ---- Эликсиры (варит Алхимик, 2 штуки ресурса того же цвета) и расходники/свитки (цвет ресурса = цвет героя) ----
const ELX = {   // эликсир → ресурсы по порядку «темы» (первый с источником на цвете; остальные — запасные)
  power: ['fang', 'bone'], fury: ['scrap', 'ore', 'fang'], defense: ['scale', 'ore', 'scrap', 'hide'], block: ['splinter', 'bone', 'hide'], ricochet: ['feather', 'shell'],
  cunning: ['silk', 'feather'], health: ['honey', 'shell', 'hide'], stones: ['crystal', 'ore', 'scrap', 'bone'], swap: ['essence', 'shell', 'crystal'],
};
const CONS = {  // расходники и свитки
  potion: ['honey', 'shell', 'hide'], elixir: ['fang', 'bone'], dust: ['crystal', 'ore', 'scrap'], scroll: ['feather', 'silk'], luck: ['shell', 'honey', 'feather'], storm: ['essence', 'crystal'], stoneskin: ['scale', 'ore', 'scrap', 'hide'], honeyjar: ['honey', 'shell'],
};
const grid = (map, label) => {
  const out = [], gapList = [];
  for (const [id, list] of Object.entries(map)) {
    const cells = TIERS.map((t) => {
      const i = list.findIndex((k) => okSrc(k, t));
      if (i < 0) { gapList.push(`${label(id)} ц${t}`); return '—'; }
      return `${i === 0 ? '' : '(зап.) '}${nm(list[i])}`;
    });
    out.push({ id, cells });
  }
  return { out, gapList };
};

const md = [];
md.push(`# Кузница 1.6.5 — таблица «ресурс → вещь» (для утверждения)\n`);
md.push(`Правило цены: вещь из Кузницы стоит **${(RATIO * 100) | 0}% цены такой же вещи в Лавке** (скидка ${((1 - RATIO) * 100) | 0}%): монеты мастера — ${(COINSHARE * 100) | 0}% этой суммы, остальное — два вида ресурсов (60% и 40%), посчитанных по цене их продажи (то есть с упущенной выгодой). Количество ресурса = доля стоимости ÷ цена одной штуки.\n`);
md.push(`## 1. Откуда берётся каждый ресурс (лучший вид-источник на цвете, штук за бой)\n\n| ресурс | ${TIERS.map((t) => 'ц' + t).join(' | ')} |\n|---|${'---|'.repeat(10)}`);
for (const k of Object.keys(RES)) md.push(`| ${nm(k)} | ${TIERS.map((t) => { const b = best[k][t - 1]; return b && okSrc(k, t) ? `${b.y.toFixed(1).replace('.', ',')} ${Bestiary.MONSTERS[b.id].name}` : (b ? `*${b.y.toFixed(1).replace('.', ',')} ${Bestiary.MONSTERS[b.id].name}*` : '—'); }).join(' | ')} |`);
md.push(`\nКурсивом — источник слабее порога ${String(MINYIELD).replace('.', ',')} шт. за бой (считается «нет»); «—» — вида с этим ресурсом на цвете нет вообще.\n`);
md.push(`## 2. Роли ресурсов\n\n| роль | порядок (берётся первый, у которого на цвете есть источник) | для чего |\n|---|---|---|`);
const forWhat = { metal: 'клинки, оковка, компас', plate: 'щиты, шлемы, нагрудники, поножи, наплечники', wood: 'древки двуручного, метательное, основа щита', leather: 'кожаные части, сумка, поводок, перчатки', bind: 'обмотка, тетива, ремни', arcane: 'амулеты, компасы' };
for (const [role, list] of Object.entries(ROLE)) md.push(`| ${RN[role]} | ${list.map(nm).join(' → ')} | ${forWhat[role]} |`);
md.push(`\n## 3. Какая вещь из каких ролей\n\n| тип вещи | роль 1 (≈60%) | роль 2 (≈40%) |\n|---|---|---|`);
for (const [ty, rr] of Object.entries(TYPE_ROLES)) md.push(`| ${Gear.TYPE_NAMES[ty]} | ${RN[rr[0]]} | ${RN[rr[1]]} |`);
md.push(`\n## 4. Что получится по цветам (обычная вещь; для редких и эпических количество растёт вместе с ценой)\n\nФормат: ресурс 1 + ресурс 2 + монеты мастера · ~боёв охоты на нужный вид.\n\n| тип | ц1 | ц4 | ц7 | ц10 |\n|---|---|---|---|---|`);
for (const type of types) {
  const rs = rows.filter((r) => r.type === type);
  md.push(`| ${Gear.TYPE_NAMES[type]} | ${[1, 4, 7, 10].map((t) => { const r = rs.find((x) => x.tier === t); return `${r.parts.map((p) => (p.kind ? `${nm(p.kind).toLowerCase()} ×${p.n}` : '—')).join(' + ')} + ${r.coins.toLocaleString('ru-RU')} мон. · ~${Math.max(1, Math.round(r.fights))} боёв`; }).join(' | ')} |`);
}
md.push(`\n## 5. Где источника нет совсем\n`);
md.push(Object.keys(RES).filter((k) => noSource[k].length).map((k) => `- ${nm(k)}: нет на цветах ${noSource[k].join(', ')}`).join('\n'));
md.push(`\n## 6. Дыры в итоговой таблице (роль без источника на цвете)\n`); md.push(gaps.size ? [...gaps].map((g) => '- ' + g).join('\n') : 'нет');

const elxName = { power: 'Эликсир силы', fury: 'Эликсир ярости', defense: 'Эликсир брони', block: 'Эликсир блока', ricochet: 'Эликсир рикошета', cunning: 'Эликсир хитрости', health: 'Эликсир жизни', stones: 'Эликсир камней', swap: 'Эликсир превращения' };
const consName = { potion: 'Зелье здоровья', elixir: 'Боевой настой', dust: 'Каменная пыль', scroll: 'Свиток спешки', luck: 'Свиток удачи', storm: 'Зелье грозы', stoneskin: 'Каменная кожа', honeyjar: 'Банка мёда' };
const ge = grid(ELX, (id) => elxName[id]), gc = grid(CONS, (id) => consName[id]);
md.push(`\n## 7. Эликсиры (Алхимик): какой ресурс какого цвета\n\nСейчас эликсир можно сварить из любых двух одинаковых ресурсов нужного цвета. Предлагается привязать вид эликсира к «своему» ресурсу; «(зап.)» — запасной, когда у первого на этом цвете нет источника.\n\n| эликсир | ${TIERS.map((t) => 'ц' + t).join(' | ')} |\n|---|${'---|'.repeat(10)}`);
for (const r of ge.out) md.push(`| ${elxName[r.id]} | ${r.cells.join(' | ')} |`);
md.push(`\nЦвета без источника вообще: ${ge.gapList.length ? ge.gapList.join('; ') : 'нет'}.`);
md.push(`\n## 8. Расходники и свитки (цвет ресурса — цвет героя)\n\nСвитки предлагается делать у Библиотекаря (бобра), остальное — у Алхимика (как сейчас).\n\n| расходник | ${TIERS.map((t) => 'ц' + t).join(' | ')} |\n|---|${'---|'.repeat(10)}`);
for (const r of gc.out) md.push(`| ${consName[r.id]} | ${r.cells.join(' | ')} |`);
md.push(`\nЦвета без источника вообще: ${gc.gapList.length ? gc.gapList.join('; ') : 'нет'}.`);
console.log('\nЭликсиры без источника:', ge.gapList.join('; ') || 'нет'); console.log('Расходники без источника:', gc.gapList.join('; ') || 'нет');
fs.writeFileSync(arg('md', '/tmp/A2/forge-proposal.md'), md.join('\n') + '\n');
const jf = process.argv.find((a) => a.startsWith('--json='));
if (jf) fs.writeFileSync(jf.slice(7), JSON.stringify({ RATIO, COINSHARE, MINYIELD, rows, gaps: [...gaps], noSource, best: Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.map((b) => (b ? { id: b.id, y: +b.y.toFixed(2) } : null))])) }, null, 1));
