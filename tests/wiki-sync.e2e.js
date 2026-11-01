// База знаний должна отражать игру: всё, что есть в данных игры, должно быть описано в статьях и совпадать числами.
// Запуск: node tests/wiki-sync.e2e.js. Падает, если добавили заклинание, здание, вещь, талант и т. п., а в базе его нет.
const assert = require('assert');
const path = require('path');
const { launch } = require('../tools/browser.js');
(async () => {
  const b = await launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html') + '#dev-map'); await p.waitForTimeout(2000);
  const bad = await p.evaluate(() => {
    const out = []; const txt = (id) => { const a = Wiki.find(id); return a ? (a.title() + ' ' + a.body()).replace(/<[^>]+>/g, ' ') : ''; };
    const has = (id, s, what) => { if (!txt(id).includes(s)) out.push(`${what}: «${s}» нет в статье ${id}`); };
    const ids = new Set(Wiki.ARTICLES.map((a) => a.id));
    for (const k of Object.keys(MAGICS)) if (k !== 'strike') has('magic', MAGICS[k].name, 'заклинание');
    for (const k of Object.keys(Balance.spellUnlock)) has('spellcolors', MAGICS[k].name, 'магия по цвету');
    for (const id of Object.keys(Bestiary.MONSTERS)) if (!ids.has('m:' + id)) out.push('нет статьи о существе ' + id);
    for (const id of Object.keys(Gear.ITEMS)) if (!ids.has('i:' + id)) out.push('нет статьи о вещи ' + id);
    for (const id of Object.keys(Gear.CONSUMABLES)) if (!ids.has('c:' + id)) out.push('нет статьи о расходнике ' + id);
    for (const id of Object.keys(Ammo.CATALOG)) if (!ids.has('a:' + id)) out.push('нет статьи о снаряде ' + id);
    for (const id of Object.keys(Elixirs.KINDS)) if (!ids.has('x:' + id)) out.push('нет статьи об эликсире ' + id);
    for (const [id, bl] of Object.entries(HexMap.BUILDINGS)) if (!bl.soon && !ids.has('b:' + id)) out.push('нет статьи о здании ' + id);
    for (const k of Object.keys(Bestiary.RESOURCES)) has('resources', Bestiary.RESOURCES[k].name, 'ресурс');
    for (const k of Object.keys(Gear.SETS)) has('sets', Gear.SETS[k].name, 'комплект');
    for (const f of Object.values(Factions.LIST)) has('peoples', f.name, 'народ');
    for (const id of Talents.IDS) has('talents', Talents.NAMES[id], 'талант');
    has('medals', String(Object.keys(Medals.GROUPS).length), 'медали: наборы');
    has('field', String(Math.round(Balance.board.multiplierChance.x5*100)), 'поле: шанс x5'); has('effects', String(Balance.abilities.stun.every), 'эффекты: оглушение');
    has('economy', String(Gear.DUR_BASE), 'экономика: прочность'); has('petcare', String(Pets.TAME_WINS), 'питомцы: приручение'); has('craft', String(Gear.TEMPER_MAX), 'кузница: закалка'); for (const a of Wiki.BASE) if (a.id !== 'glossary') has('glossary', String(a.title()), 'словарь');
    has('market', String(Market.MAX_LOTS), 'торговые ряды'); has('hunt', String(Siege.MIN_WINS), 'осада'); for (const e of Events.LIST) has('hunt', e.name(), 'событие недели'); has('story', String(Story.HP_MULT), 'сюжет'); has('daily', String(Streak.WEEK_BONUS), 'лента'); has('compass', String(Compass.CAP_BASE), 'компас'); has('bank', String(Bank.CAP), 'банк'); for (const id of Crafts.IDS) has('crafts', Crafts.JOBS[id].name(), 'промысел'); has('house', String(Decor.ITEMS.length), 'дом'); has('mail', String(Mail.LETTERS.length), 'почта'); has('trophyelix', String(Trophy.MAX_TAKE), 'трофейные эликсиры');
    has('talents', String(Talents.EVERY), 'таланты: очко за N уровней'); has('talents', String(Talents.RANK_MAX), 'таланты: ступени');
    has('magic', String(Hero.spellSlots(1)), 'слоты магий'); has('spellcolors', String(Hero.spellSlots(1)), 'слоты магий');
    for (const r of World.RANKS) has('ranks', r, 'ранг арены');
    for (const t of Tiers.LIST) has('xp', t.name, 'цвет');
    for (const a of Wiki.ARTICLES) { let t = ''; try { t = a.title() + a.body(); } catch (e) { t = 'ERR'; } if (/undefined|NaN|\[object|ERR/.test(t)) out.push('в статье ' + a.id + ' «undefined/NaN»'); }
    return out;
  });
  assert.deepStrictEqual(bad, [], 'База знаний отстала от игры:\n' + bad.slice(0, 20).join('\n'));
  assert.deepStrictEqual(errs, []);
  console.log('wiki-sync: база знаний соответствует игре');
  await b.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
