if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* 1.6.6: рецепты Кузницы «ресурс → вещь» (без интерфейса — тестируется в Node).

   Цена: вещь из Кузницы стоит 50% цены в Лавке (обычная) или 40% (редкая, эпическая). Из этой суммы 20% — монеты мастера,
   остальное — ресурсы цвета вещи, посчитанные по цене их продажи. Ресурсы выбираются по РОЛЯМ: роль — список видов по порядку,
   берётся первый, у которого на этом цвете есть источник (вид существа, живущий на цвете и дающий не меньше MINYIELD штук за бой).
   Обычная вещь — 2 вида ресурсов (60/40), редкая — 3 вида, эпическая — 4 вида, один из них «трофей» с самых сильных существ.
   Эпические вещи не продаются в Лавке: их можно сделать здесь, найти в добыче и в событиях. */
const F_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const F_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');
const F_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const F_H = (typeof HexMap !== 'undefined') ? HexMap : require('./hexmap.js');

const Forge = (() => {
  const MINYIELD = 0.89;                      // минимум ожидаемых штук за бой с лучшим видом, чтобы источник считался «есть»
  const COIN_SHARE = 0.2;                     // доля монет мастера в цене вещи
  const PRICE_SHARE = { common: 0.5, rare: 0.4, epic: 0.4 };
  const SHARES = { common: [0.6, 0.4], rare: [0.45, 0.3, 0.25], epic: [0.35, 0.25, 0.25] };   // эпическая: ещё четвёртый — трофей
  const TROPHY_SHARE = 0.15;

  const ROLE = {
    metal:   ['ore', 'scrap', 'fang', 'bone'],
    plate:   ['scale', 'ore', 'scrap', 'fang'],
    wood:    ['splinter', 'bone', 'hide'],
    leather: ['hide', 'feather'],
    bind:    ['silk', 'feather', 'bone', 'shell'],
    arcane:  ['essence', 'crystal', 'shell', 'splinter'],
    trophy:  ['scale', 'essence', 'crystal', 'fang'],     // трофей: редкое с самых сильных существ
  };
  // Роли вещи: две основные, третья — для редких, четвёртая (трофей) — для эпических
  const TYPE_ROLES = {
    weapon1: ['metal', 'bind', 'leather'], weapon2: ['metal', 'wood', 'leather'], shield: ['plate', 'wood', 'leather'],
    head: ['plate', 'leather', 'bind'], chest: ['plate', 'leather', 'bind'], legs: ['plate', 'leather', 'bind'], shoulders: ['plate', 'leather', 'bind'],
    arms: ['leather', 'bind', 'metal'], gloves: ['leather', 'bind', 'metal'], bag: ['leather', 'bind', 'wood'], leash: ['leather', 'bind', 'wood'],
    amulet: ['arcane', 'bind', 'metal'], compass: ['metal', 'arcane', 'bind'], ranged: ['wood', 'bind', 'leather'], belt: ['leather', 'metal', 'bind'],
  };

  // Лучший источник каждого ресурса на каждом цвете: ожидаемое число штук за бой = шанс × (мин + макс) / 2 (виды с карты, не фиксированные)
  function sources() {
    const best = {};
    for (const k of Object.keys(F_B.RESOURCES)) {
      best[k] = [];
      for (let t = 1; t <= F_T.MAX; t++) {
        let b = null;
        for (const [id, m] of Object.entries(F_B.MONSTERS)) {
          const sp = F_H.SPAWN[id]; if (!sp || sp.fixed || t < sp.tiers[0] || t > sp.tiers[1]) continue;
          const d = m.drops.find((x) => x[0] === k); if (!d) continue;
          const y = d[1] * (d[2] + d[3]) / 2;
          if (!b || y > b.y) b = { id, y };
        }
        best[k].push(b);
      }
    }
    return best;
  }
  let SRC = null;
  const src = () => SRC || (SRC = sources());
  const yieldOf = (kind, tier) => { const b = src()[kind] && src()[kind][F_T.clamp(tier) - 1]; return b ? b.y : 0; };
  const sourceOf = (kind, tier) => { const b = src()[kind] && src()[kind][F_T.clamp(tier) - 1]; return b && b.y >= MINYIELD ? b.id : null; };
  // Какой ресурс берёт роль на этом цвете (не повторяя уже занятые)
  const pick = (role, tier, used) => ROLE[role].find((k) => !used.includes(k) && yieldOf(k, tier) >= MINYIELD) || null;

  // Рецепт: { coins, res: [{kind, tier, n}] } для вещи baseId цвета tier (того же вида, что и F_G.craftCost)
  function recipe(baseId, tier = 1) {
    const t = F_T.clamp(tier), base = F_G.ITEMS.find((i) => i.id === baseId);
    const roles = TYPE_ROLES[base.type];
    const price = F_G.item(F_G.makeEntry(baseId, t)).price;
    const budget = price * PRICE_SHARE[base.rarity], coins = Math.max(1, Math.round(budget * COIN_SHARE)), resValue = budget - coins;
    const used = [], parts = [];
    const nRoles = base.rarity === 'common' ? 2 : 3;
    const shares = SHARES[base.rarity].slice();
    // Дорогой ресурс (кристалл, эссенция, чешуя) берётся, только когда доля вещи на него хотя бы приблизительно покрывает одну штуку;
    // иначе — следующий по роли, а если все дороги, самый дешёвый: чтобы рецепт дешёвой вещи не вышел в разы дороже цели
    const choose = (role, share) => {
      const cand = ROLE[role].filter((k) => !used.includes(k) && yieldOf(k, t) >= MINYIELD);
      return cand.find((k) => F_B.resPrice(k, t) <= 1.6 * resValue * share) || cand.sort((a, b) => F_B.resPrice(a, t) - F_B.resPrice(b, t))[0] || null;
    };
    for (let i = 0; i < nRoles; i++) { const k = choose(roles[i], shares[i]); if (k) { used.push(k); parts.push({ kind: k, share: shares[i] }); } }
    if (base.rarity === 'epic') { const k = choose('trophy', TROPHY_SHARE); if (k) { used.push(k); parts.push({ kind: k, share: TROPHY_SHARE, trophy: true }); } }
    if (!parts.length) { const k = pick('leather', t, []) || 'hide'; parts.push({ kind: k, share: 1 }); }
    const sum = parts.reduce((s, p) => s + p.share, 0);       // если для роли нет источника, её доля делится между остальными
    const res = parts.map((p) => ({ kind: p.kind, tier: t, n: Math.max(1, Math.round(resValue * p.share / sum / F_B.resPrice(p.kind, t))) }));
    return { coins, res };
  }

  /* ---------- Алхимик и Библиотекарь: «свой» ресурс эликсира/расходника ---------- */
  // Порядок: первый, у которого на цвете есть источник
  const OWN = {
    power: ['fang'], fury: ['ore', 'scrap', 'fang'], defense: ['scale', 'ore', 'scrap', 'hide'], block: ['splinter', 'bone', 'hide'],
    ricochet: ['feather'], cunning: ['silk', 'feather'], health: ['honey', 'shell', 'hide'], stones: ['crystal', 'ore', 'scrap'], swap: ['essence', 'shell'],
    potion: ['honey', 'shell', 'hide'], elixir: ['fang'], dust: ['crystal', 'ore', 'scrap'], scroll: ['feather'], luck: ['shell', 'honey', 'feather'],
    storm: ['essence', 'shell'], stoneskin: ['scale', 'ore', 'scrap', 'hide'], honeyjar: ['honey', 'shell'],
  };
  const SCROLLS = ['scroll', 'luck'];        // свитки делает Библиотекарь (бобёр), остальное — Алхимик
  const ownList = (key, tier) => { const l = OWN[key] || []; const f = l.find((k) => yieldOf(k, tier) >= MINYIELD); return f ? [f, ...l.filter((k) => k !== f)] : l; };   // «свой» ресурс первым; остальные — запасные
  function ownRes(key, tier) {
    const list = OWN[key]; if (!list) return null;
    return list.find((k) => yieldOf(k, tier) >= MINYIELD) || list[list.length - 1];
  }
  return { MINYIELD, COIN_SHARE, PRICE_SHARE, SHARES, ROLE, TYPE_ROLES, OWN, SCROLLS, yieldOf, sourceOf, pick, recipe, ownRes, ownList, reset: () => { SRC = null; } };
})();
if (typeof module !== 'undefined') module.exports = Forge;
