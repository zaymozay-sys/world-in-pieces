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
    // 2.2.9: то, что игра пока рисует эмодзи, текстом или векторным значком; картинки для этого ждут (в коде не подключены) — в счёт «нет» не входит.
    const soft = {};
    const addSoft = (name, list) => { soft[name] = list; };
    try { addSoft('Достопримечательности на карте (значки)', keys(World.LANDMARKS).map((i) => ({ key: 'map/ev-' + World.LANDMARKS[i].glyph, label: World.LANDMARKS[i].name }))); } catch (e) { /* нет */ }
    try { addSoft('Мелкие детали карты', ['shell', 'snowpatch', 'ripple', 'wave', 'cobble'].map((i) => ({ key: 'map/' + i, label: i }))); } catch (e) { /* нет */ }
    try { addSoft('Фоны окон без картинки', ['bank', 'sparkshop', 'best', 'wiki', 'chest', 'faction'].map((i) => ({ key: 'ui/bg-' + i, label: i }))); } catch (e) { /* нет */ }
    try { addSoft('Дом: обстановка', Decor.ITEMS.map((i) => ({ key: 'decor/' + i.id, label: i.id }))); } catch (e) { /* нет */ }
    try {
      addSoft('Питомцы: лакомства, яйца, снаряжение, амулеты', [].concat(keys(Pets.TREATS).map((i) => 'treat-' + i), keys(Pets.EGGS).map((i) => 'egg-' + i), keys(Pets.GEAR).map((i) => 'gear-' + i), keys(Pets.AMULETS).map((i) => 'amulet-' + i)).map((i) => ({ key: 'items/pet-' + i, label: i })));
      addSoft('Питомцы: таланты', keys(Pets.TALENTS).map((i) => ({ key: 'ui/talent-' + i, label: i })));
    } catch (e) { /* нет */ }
    try { addSoft('Трофеи редких зверей', RareHunt.SPECIES.map((i) => ({ key: 'items/trophy-' + i, label: i }))); } catch (e) { /* нет */ }
    try {
      const mk = [].concat(keys(Medals.STYLE), keys(Medals.WORLD), keys(Medals.SECRET), keys(Medals.MASTER), ['lines', 'strike', 'shot', 'spell', 'drunk', 'daily', 'elixir']);
      addSoft('Медали: значки категорий', mk.map((i) => ({ key: 'ui/medal-' + i, label: i })));
    } catch (e) { /* нет */ }
    addSoft('Предметы заданий', ['key-sapphire', 'key-ruby', 'key-emerald', 'potion-breath'].map((i) => ({ key: 'items/' + i, label: i })));
    addSoft('Искры', ['green', 'blue', 'red'].map((i) => ({ key: 'ui/spark-' + i, label: i })));
    try { addSoft('Рамки портрета', Village.FRAMES.map((i) => ({ key: 'ui/frame-' + i.id, label: i.name }))); } catch (e) { /* нет */ }
    try { addSoft('Характеристики', keys(Gear.STAT_NAMES).map((i) => ({ key: 'ui/stat-' + i, label: i }))); } catch (e) { /* нет */ }
    addSoft('Значки эффектов в бою', ['shield', 'spikes', 'power', 'down', 'drop', 'bolt', 'sand', 'spores'].map((i) => ({ key: 'ui/fx-' + i, label: i })));
    try { addSoft('Зоны', World.ZONE_IDS.map((i) => ({ key: 'ui/zone-' + i, label: World.ZONE_BOSSES[i].title }))); } catch (e) { /* нет */ }
    try { const f = [...new Set(Object.values(Bestiary.MONSTERS).map((m) => m.family))]; addSoft('Семейства существ', f.map((i) => ({ key: 'ui/family-' + i, label: i }))); } catch (e) { /* нет */ }
    try { addSoft('Приёмы существ (значок магии)', keys(Bestiary.ABILITIES).map((i) => ({ key: 'spells/mob-' + i, label: i }))); } catch (e) { /* нет */ }
    for (const f of Object.values(soft)) for (const x of f) x.has = Art.has(x.key);
    fam.__soft = soft;
    return fam;
  });
  await b.close();
  const softData = data.__soft || {}; delete data.__soft;
  const reg = fs.readFileSync(path.join(__dirname, '..', 'js', 'art-files.js'), 'utf8');
  const files = Object.keys(JSON.parse(reg.match(/const ART_FILES = (\{[\s\S]*\});/)[1]));
  let missing = 0, total = 0; const report = {};
  for (const [name, list] of Object.entries(data)) {
    const miss = list.filter((x) => !x.has); total += list.length; missing += miss.length; report[name] = { всего: list.length, нет: miss.map((x) => x.key + (x.label && x.label !== x.key ? ' — ' + x.label : '')) };
    console.log(`${miss.length ? 'НЕТ ' : 'ok  '} ${name}: ${list.length - miss.length} из ${list.length}`);
    for (const m of miss) console.log('       ' + m.key + (m.label && m.label !== m.key ? ' — ' + m.label : ''));
  }
  // 2.2.9: ждут рисунков (игра пока показывает эмодзи/текст/векторный значок); в счёт не входят
  const softReport = {};
  console.log('\nЖдут рисунков (в коде ещё не подключены; на «нет» выше не влияет):');
  for (const [name, list] of Object.entries(softData)) {
    const miss = list.filter((x) => !x.has); softReport[name] = { всего: list.length, нет: miss.map((x) => x.key) };
    console.log(`  ${miss.length ? 'ждёт' : 'есть'} ${name}: ${list.length - miss.length} из ${list.length}`);
  }
  // лишние: картинка есть, но ни одна сущность её не ждёт
  const used = new Set(Object.values(data).flat().map((x) => x.key));
  const extra = files.filter((k) => /^(monsters|resources|items|pets|runes|spells|npc|heroes)\//.test(k) && !used.has(k) && !/^(ui\/|spells\/mob-|map\/tex-|map\/ev-|map\/bridge|map\/fence|map\/boss-|map\/chest|gems\/|items\/(stone|shard|heart|sea-diary|seal|relic-|badge-|arrow-|ticket|travel)|map\/site|map\/flag|map\/gate)/.test(k));
  console.log(`\nКартинки, которых игра по спискам не ждёт (проверьте, нужны ли): ${extra.length}`); if (extra.length) console.log('  ' + extra.join(', '));
  console.log(`\nИтого: нет картинки у ${missing} из ${total}; ошибок страницы: ${errs.length}`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ report, soft: softReport, extra }, null, 1));
  if (process.argv.includes('--strict') && missing) process.exit(1);
})();
