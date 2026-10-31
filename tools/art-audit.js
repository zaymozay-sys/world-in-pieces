// 2.0.9: проверка графики перед выпуском. Для каждой сущности игры (существо, вещь, ресурс, питомец, здание, герой…) проверяет,
// есть ли нужная картинка в art/ и записана ли она в js/art-files.js. Где картинки нет, игра рисует запасной рисунок.
// Запуск: node tools/art-audit.js [--json=файл] [--strict]   (--strict: код выхода 1, если чего-то нет)
const path = require('path'), fs = require('fs');
const { launch } = require('./browser.js');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : ''; };
(async () => {
  const b = await launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html') + '#dev-map'); await new Promise((r) => setTimeout(r, 1500));
  const data = await p.evaluate(() => {
    const keys = (o) => (o ? (Array.isArray(o) ? o.map((x) => x.id || x) : Object.keys(o)) : []);
    const fam = {};
    const add = (name, list) => { fam[name] = list; };
    const mons = keys(Bestiary.MONSTERS);
    add('Портреты существ', mons.map((m) => ({ key: 'monsters/' + m, label: Bestiary.MONSTERS[m].name })));
    add('Фигурки существ на карте (на подставке)', mons.map((m) => ({ key: 'map/mob-' + m, label: Bestiary.MONSTERS[m].name })));
    add('Ресурсы', keys(Bestiary.RESOURCES).concat(Bestiary.DEEP_RESOURCES || []).filter((x, i, a) => a.indexOf(x) === i).map((r) => ({ key: 'resources/' + r, label: r })));
    add('Вещи', keys(Gear.ITEMS).map((i) => ({ key: 'items/' + i, label: i })));
    add('Расходники', keys(Gear.CONSUMABLES).map((i) => ({ key: 'items/' + i, label: i })));
    add('Стрелы и снаряды', keys(Ammo.CATALOG).map((i) => ({ key: 'items/ammo-' + i, label: i })));
    add('Эликсиры', keys(Elixirs.KINDS).map((i) => ({ key: 'items/elx-' + i, label: i })));
    add('Руны', keys(Runes.CATALOG).map((i) => ({ key: 'runes/' + i, label: i })));
    add('Заклинания', keys(MAGICS).map((i) => ({ key: 'spells/' + i, label: i })));
    const pets = []; try { for (const [id, m] of Object.entries(Bestiary.MONSTERS)) if (Pets.isTameableSpecies(id)) pets.push({ key: 'pets/' + id, label: m.name }); } catch (e) { /* нет */ }
    add('Питомцы', pets);
    const heroes = []; for (const f of ['human', 'dwarf', 'elf', 'lizard']) for (const g of ['m', 'f']) { heroes.push({ key: `heroes/${f}-${g}-portrait`, label: `${f}-${g}` }); heroes.push({ key: `map/hero-${f}-${g}`, label: `${f}-${g} (карта)` }); for (const n of [1, 2, 3]) heroes.push({ key: `heroes/${f}-${g}-body-${n}`, label: `${f}-${g} тело ${n}` }); }
    add('Герои', heroes);
    const scr = ['alchemist', 'arena', 'artistWorkshop', 'forge', 'herocard', 'jeweler', 'junker', 'kennel', 'library', 'lighthouse', 'market', 'mill', 'shop', 'tavern', 'valor', 'village', 'wreck', 'help', 'trader'];
    add('Фоны окон', scr.map((s) => ({ key: 'ui/bg-' + s, label: s })));
    const npc = ['alchemist', 'beaver-library', 'crane-artist', 'goblin-tavern', 'junker', 'kennel-keeper', 'magpie-jeweler', 'merchant', 'mouse-mill', 'seal-lighthouse', 'trader'];
    add('Портреты жителей', npc.map((s) => ({ key: 'npc/' + s + '-portrait', label: s })));
    const bld = ['alchemist', 'altar', 'arena', 'artistWorkshop', 'bank', 'castle', 'dungeon', 'forge', 'guardhouse', 'hall', 'home', 'hunter', 'jeweler', 'junker', 'kennel', 'library', 'lighthouse', 'mail', 'mill', 'shop', 'tavern'];
    add('Здания на карте', bld.map((s) => ({ key: 'map/' + s, label: s })));
    add('Шахматы', ['w', 'b'].flatMap((c) => ['k', 'q', 'r', 'b', 'n', 'p'].map((t) => ({ key: `chess/${c}-${t}`, label: c + t }))).concat([{ key: 'chess/bob', label: 'Бобёр' }, { key: 'chess/sq-light', label: 'светлая клетка' }, { key: 'chess/sq-dark', label: 'тёмная клетка' }]));
    for (const f of Object.values(fam)) for (const x of f) x.has = Art.has(x.key);
    return fam;
  });
  await b.close();
  const reg = fs.readFileSync(path.join(__dirname, '..', 'js', 'art-files.js'), 'utf8');
  const files = Object.keys(JSON.parse(reg.match(/const ART_FILES = (\{[\s\S]*\});/)[1]));
  let missing = 0, total = 0; const report = {};
  for (const [name, list] of Object.entries(data)) {
    const miss = list.filter((x) => !x.has); total += list.length; missing += miss.length; report[name] = { всего: list.length, нет: miss.map((x) => x.key + (x.label && x.label !== x.key ? ' — ' + x.label : '')) };
    console.log(`${miss.length ? 'НЕТ ' : 'ok  '} ${name}: ${list.length - miss.length} из ${list.length}`);
    for (const m of miss) console.log('       ' + m.key + (m.label && m.label !== m.key ? ' — ' + m.label : ''));
  }
  // лишние: картинка есть, но ни одна сущность её не ждёт
  const used = new Set(Object.values(data).flat().map((x) => x.key));
  const extra = files.filter((k) => /^(monsters|resources|items|pets|runes|spells|npc|heroes)\//.test(k) && !used.has(k) && !/^(ui\/|map\/tex-|map\/ev-|map\/bridge|map\/fence|map\/boss-|map\/chest|gems\/|items\/(stone|shard|heart|sea-diary|seal|relic-|badge-|arrow-|ticket|travel)|map\/site|map\/flag|map\/gate)/.test(k));
  console.log(`\nКартинки, которых игра по спискам не ждёт (проверьте, нужны ли): ${extra.length}`); if (extra.length) console.log('  ' + extra.join(', '));
  console.log(`\nИтого: нет картинки у ${missing} из ${total}; ошибок страницы: ${errs.length}`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ report, extra }, null, 1));
  if (process.argv.includes('--strict') && missing) process.exit(1);
})();
