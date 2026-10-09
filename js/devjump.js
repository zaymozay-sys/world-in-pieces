/* Режим разработчика (1.5.0): прыжки для чек-листа. Ссылка вида  index.html#dev-<команда>  открывает игру сразу
   в нужном месте — без регистрации, обучения и ходьбы. Профиль создаётся тестовый (горный клан, «Тест»,
   характеристики ×10 и все заклинания). Команды:
     map-<местность>   meadow forest hills swamp mountain beach sea village — герой перемещается на ближайшую соту
     bld-<здание>      id здания из HexMap.BUILDINGS (forge, shop, kennel …) — окно здания
     fight-<вид>-<цвет>[-solo]  обычный бой (с питомцем, если он есть; solo — без него), например fight-wolf-3
     boss-<b1..b5>     страж осколка и Древний дракон
     result-win | result-loss   бой, сразу заканчивающийся победой или поражением (окно награды)
     scr-<bag|best|medals|kennel|village|credits>   окна */
const DevJump = (() => {
  const cmd = () => { const m = /^#dev-([A-Za-z0-9._~-]+)$/.exec(location.hash || ''); return m ? m[1] : null; };

  function prep() {
    const sp = document.getElementById('splash'); if (sp) sp.remove();
    try { if (typeof Screens !== 'undefined' && Screens.isOpen) Screens.close(); } catch (e) { /* окна нет */ }
    const d = Profile.data;
    if (!d.faction) { d.name = 'Тест'; d.gender = 'male'; chooseFaction('dwarf'); }
    d.tutorial = Object.assign(d.tutorial || {}, { done: true, step: null });
    d.testX10 = true; d.testAllSpells = true;
    Profile.save();
    const coach = document.querySelector('.coach'); if (coach) coach.remove();
  }
  const toMap = () => { document.body.classList.add('mode-map'); document.body.classList.remove('mode-battle'); };

  async function run() {
    const c = cmd(); if (!c) return;
    if (typeof Profile === 'undefined' || typeof MapView === 'undefined') return;
    prep();
    const [kind, a, b, opt] = c.split('-');
    const msg = (t) => { try { MapView.toast(t); } catch (e) { /* без подсказки */ } };
    if (kind === 'map') {
      toMap();
      const idx = MapView.devFindTerrain(a);
      if (idx < 0) return msg('Нет такой местности на карте: ' + a);
      MapView.devTeleport(idx);
    } else if (kind === 'bld') {
      toMap();
      if (!MapView.devBuilding(a)) msg('Нет здания: ' + a);
    } else if (kind === 'fight' || kind === 'boss' || kind === 'result') {
      let id = a, tier = +b || 3, extra = { dev: 1 };
      if (kind === 'boss') { const ch = Story.BY_ID[a]; if (!ch) return msg('Нет стража: ' + a); id = ch.species; tier = ch.tier; extra = { boss: a }; }
      if (kind === 'result') { id = 'rat'; tier = 1; }
      if (!Bestiary.MONSTERS[id]) return msg('Нет существа: ' + id);
      Profile.data.petStay = opt === 'solo';   // solo — бой без питомца (одно поле)
      MapView.startTraining(id, tier, extra);
      if (kind === 'result') {
        await new Promise((r) => setTimeout(r, 1500));
        moves = 30;
        const duo = typeof Duo !== 'undefined' && Duo.on() && Duo.pet;
        if (duo) duo.moves = 30;
        if (a === 'loss') { fighters.left.hp = 0; checkEnd(); if (duo) { duo.fighters.left.hp = 0; duo.checkEnd(); } }
        else { if (duo) { duo.fighters.right.hp = 0; duo.checkEnd(); } fighters.right.hp = 0; checkEnd(); }
      }
    } else if (kind === 'scr') {
      toMap();
      if (a === 'bag') Inventory.open('left');
      else if (a === 'best') Screens.openBestiary();
      else if (a === 'medals') Screens.openLibrary();
      else if (a === 'kennel') Screens.open('kennel');
      else if (a === 'village') { Profile.data.coins = Math.max(Profile.data.coins, 3e7); Screens.open('village'); }
      else if (a === 'credits') Screens.openCredits();
      else if (a === 'arena' || a === 'trial') { Profile.data.wins = Math.max(Profile.data.wins || 0, 6); Screens.open('arena'); if (a === 'trial') { const t = document.querySelector('[data-tab=daily]'); if (t) t.click(); } }
    } else if (kind === 'ev') {                 // 1.5.4: карточка события (cache, altar, merchant, beast, ambush) или логова (lair)
      toMap();
      const w = MapView.world, e = a === 'lair' ? w.lairs[0] : w.events.find((x) => x.kind === a);
      if (!e) return msg('Нет события: ' + a);
      MapView.devTeleport(e.idx, 4);
      if (a === 'lair') MapView.showLair(e); else { MapView.state.evUsed[e.id] = 0; MapView.showEvent(e); }
    }
  }

  function boot() { setTimeout(run, 1200); }
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => { if (cmd()) location.reload(); });
    if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
  }
  return { run, cmd };
})();
