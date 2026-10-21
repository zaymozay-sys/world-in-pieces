if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Правила боя без интерфейса: урон, блок, броня, рикошет, приёмы существ и фракций, расходники.
   Работают с объектами бойцов; ими пользуются игра (game.js) и симулятор (tools/sim.js).

   Боец: { hp, max, dmg, stats, buffs: [{kind, amount, turns}], haste, magic, counts, ability,
           charged, revived, turnNo, poison: {turns, dmg} }.
   dmg — множитель урона камней (у героя растёт с уровнем, у существа — с цветом).
   ability — приём существа (id из bestiary.js) или null у героя.
   rand — генератор случайных чисел 0..1 (по умолчанию BattleRand). */

const C_B = (typeof Balance !== 'undefined') ? Balance : require('./balance.js');
const C_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

const Combat = (() => {
  // случайные числа боя: общий поток BattleRand (в бою по сети он по зерну), а в тестах без него — Math.random
  const battleRand = () => (typeof BattleRand !== 'undefined' ? BattleRand.next() : Math.random());
  const A = C_B.abilities;
  const chance = (p, rand) => p > 0 && rand() * 100 < p;

  /* 1.6.0: Броня — цифры, а не проценты. Очки Брони (stats.defense) переводятся в «плоское» число, которое вычитается из
     каждого удара: Броня 1, удар 3 — прилетит 2. Масштаб — типичный удар линии из 3 камней самого бойца (его dmg × урон камня × 3),
     поэтому броня растёт вместе с уровнем и цветом, как и урон. Пол урона: не меньше 20% удара и не меньше 1. */
  const HIT_STONES = 3, FLOOR = 0.2;
  const armorAt = (points, dmg) => { const p = Math.min(C_G.MAX_DEFENSE, points || 0); return p <= 0 ? 0 : Math.max(1, Math.round(p / 100 * (dmg || 1) * C_B.damage.stone * HIT_STONES)); };
  const armorOf = (f) => armorAt(f.stats && f.stats.defense, f.dmg);
  const mitigate = (amount, armor) => Math.max(Math.max(1, Math.ceil(amount * FLOOR)), Math.round(amount) - armor);
  // Доля удара нападающего (типичного, линия из 3 камней), доходящая до цели, — для оценок ИИ.
  const armorFactor = (attacker, target) => { const a = Math.max(0.01, AVG_HIT + power(attacker)); return Math.max(FLOOR, 1 - armorOf(target) / a); };

  // Сумма всех усилений урона (эликсир силы, Знамя, Вой).
  const buffPower = (f) => f.buffs.reduce((s, b) => s + (b.amount || 0), 0);

  // Сумма усилений одного вида (kind) — Изворотливость копит Блок, Возмездие копит Рикошет; несколько
  // срабатываний подряд СКЛАДЫВАЮТСЯ (каждое — отдельная запись в buffs со своим таймером в 3 хода).
  const buffStat = (f, kind) => f.buffs.reduce((s, b) => s + (b.kind === kind ? (b.amount || 0) : 0), 0);

  /* Сила — единственная прибавка к удару: удар = (камни + Сила) × магия × Ярость − Броня.
     Камни не растут с уровнем. Рост урона даёт Сила уровня: levelPower(dmg) = 4,5 · levelMul · (dmg − 1), то есть линия из трёх
     камней среднего номинала (4,5) бьёт так же, как раньше била «4,5 × dmg». dmg хранит рост бойца (герой — по уровню, существо — по цвету)
     и по-прежнему множится Знаменем, Яростью дракона, питомцами и т. п. — Сила уровня пересчитывается сама.
     Усиления Знамя/Вой/эликсир/Ярость орка заданы в «старых очках» (0,045 × dmg Силы за очко). */
  const levelPower = (dmg) => HIT_STONES * C_B.damage.stone * (C_B.damage.levelMul || 1) * Math.max(0, (dmg || 1) - 1);
  const buffUnit = (f) => 0.045 * (f.dmg || 1);
  const basePower = (f) => ((f.stats && f.stats.power) || 0) + levelPower(f.dmg);
  function power(f) {
    let p = (f.stats.power || 0) + levelPower(f.dmg);
    let extra = buffPower(f);
    if (f.ability === 'rage' && f.hp < f.max * A.rage.below) extra += A.rage.power;
    return (p + extra * buffUnit(f)) * (1 + (f.elxPct || 0) / 100);   // 2.0.4: эликсир силы — % от суммарной Силы
  }
  // Типичный удар (линия из HIT_STONES камней среднего номинала) — для оценок шансов, брони и ИИ.
  const AVG_HIT = C_B.damage.stone * HIT_STONES;
  const powerEst = (f) => (AVG_HIT + power(f)) / AVG_HIT;

  // Снимает ХП. «Неупокоенный» один раз встаёт вместо смерти. Возвращает true, если боец восстал.
  function loseHp(f, amount) {
    if (f.ability === 'undying' && !f.revived && f.hp - amount <= 0) {
      f.revived = true;
      f.hp = Math.ceil(f.max * A.undying.hp);
      return true;
    }
    if (f.secondWind && !f.revived2 && f.hp - amount <= 0) {       // 1.6.3: умение медалей «Второе дыхание»
      f.revived2 = true;
      f.hp = Math.ceil(f.max * 0.3);
      return true;
    }
    f.hp = Math.max(0, f.hp - amount);
    return false;
  }

  /* Удар attacker → target на amount (до усилений).
     Порядок: Сила нападающего усиливает удар (Натиск удваивает первый); цель может БЛОКИРОВАТЬ его целиком;
     иначе Броня цели снижает урон (Подлый удар её не замечает); затем удар может РИКОШЕТОМ отлететь
     в нападающего (отлетает урон за вычетом брони цели); Кровопийца лечится на долю урона.
     раз в удар Ярость нападающего может удвоить amount (считается до Блока и Брони — блок/рикошет действуют
     как обычно на уже удвоенный урон).
     raw = true — урон без модификаторов (штраф за неверный ход, яд).
     Возвращает { kind: 'hit' | 'block' | 'reflect', amount, charged, crit, pierce, heal, revived, attackerRevived }. */
  function hit(attacker, target, amount, raw = false, rand = battleRand, mult = 1) {
    const out = { kind: 'hit', amount: 0, charged: false, crit: false, pierce: false, pierceBlock: false, shred: 0, heal: 0, revived: false, attackerRevived: false };
    if (amount <= 0) return out;
    if (raw) {
      out.revived = loseHp(target, amount);
      out.amount = amount;
      return out;
    }
    amount = Math.ceil((amount + power(attacker)) * mult);   // (камни + Сила) × магия; рост урона — внутри Силы
    // Жертва: если заклинатель принёс в жертву ХП перед этим сбором, следующий удар усилен ×mult —
    // одноразово, флаг снимается сразу (см. Combat.applySacrifice).
    if (attacker.tripleNext) {
      amount *= C_B.magic.sacrifice.mult;
      attacker.tripleNext = false;
      out.sacrificed = true;
    }
    // Кулак ярости: следующий удар ×fury.mult (одноразово, см. Combat.applyFury). Если одновременно взведена
    // Жертва — множители перемножаются (×3 · ×2 = ×6): оба заклинания оплачены, и оба расходуются на этот удар.
    if (attacker.doubleNext) {
      amount *= C_B.magic.fury.mult;
      attacker.doubleNext = false;
      out.fury = true;
    }
    // Зеркало: цель заранее прикрылась Зеркалом (Combat.applyMirror) — следующий удар, который она получает,
    // целиком отражается атакующему вместо того, чтобы применяться к цели. Срабатывает один раз и снимается,
    // даже если удар был бы заблокирован — Зеркало «ловит» удар раньше Блока/Брони.
    if (target.mirrorReady) {
      target.mirrorReady = false;
      out.kind = 'mirror';
      out.amount = amount;
      out.attackerRevived = loseHp(attacker, amount);
      return out;
    }
    if (attacker.ability === 'charge' && !attacker.charged) {
      attacker.charged = true;
      amount *= A.charge.mult;
      out.charged = true;
    }
    if (chance(attacker.stats.fury, rand)) {
      amount *= 2 + (attacker.critExtra || 0);          // 1.5.1: эликсир ярости — первый крит сильнее
      out.crit = true;
      if (attacker.critExtra) { out.critExtra = attacker.critExtra; attacker.critExtra = 0; }
    }
    // Арбалет: если Блок цели должен был сработать, с шансом pierceBlock.chance% болт пробивает его насквозь.
    // Изворотливость добавляет временный Блок сверх базового (см. buffStat/monsterTurnStart 'evasion').
    let blocked = chance(target.stats.block + buffStat(target, 'evasion'), rand);
    if (blocked && attacker.weaponPerk && attacker.weaponPerk.type === 'pierceBlock' && chance(C_B.weaponPerks.pierceBlock.chance, rand)) {
      blocked = false;
      out.pierceBlock = true;
    }
    // Банка мёда: гарантированный блок следующего удара (заряд копится в target.shield, см. useConsumable).
    if (!blocked && target.shield > 0) { blocked = true; target.shield--; out.shieldUsed = true; }
    if (blocked) {
      out.kind = 'block';
      // 1.3.8: заблокированный удар может ещё и отразиться — Рикошет проверяется независимо от Блока
      // (кубик Рикошета; урон отражается за вычетом Брони цели). Тогда kind = 'blockreflect'.
      if (chance(target.stats.ricochet + buffStat(target, 'retribution'), rand)) {
        out.kind = 'blockreflect';
        out.amount = mitigate(amount, armorOf(target));
        out.attackerRevived = loseHp(attacker, out.amount);
      }
      return out;
    }
    out.pierce = attacker.ability === 'backstab' && chance(A.backstab.chance, rand);
    amount = mitigate(amount, out.pierce ? 0 : armorOf(target));
    out.amount = amount;
    // Возмездие добавляет временный Рикошет сверх базового (см. buffStat/monsterTurnStart 'retribution').
    if (chance(target.stats.ricochet + buffStat(target, 'retribution'), rand)) {
      out.kind = 'reflect';
      out.attackerRevived = loseHp(attacker, amount);
      return out;
    }
    // 1.7.3: Щит существа (приём 'ward') принимает удар на себя, пока не кончится (броня уже учтена).
    if (target.ward > 0) {
      const take = Math.min(target.ward, amount);
      target.ward -= take; amount -= take;
      out.absorbed = take; out.amount = amount;
      if (amount <= 0) return out;
    }
    out.revived = loseHp(target, amount);
    if (attacker.ability === 'vampire' && attacker.hp > 0) {
      out.heal = Math.min(attacker.max - attacker.hp, Math.ceil(amount * A.vampire.share));
      attacker.hp += out.heal;
    }
    // Утренняя звезда: каждый удар крошит Броню цели на armorShred.amount, не больше cap суммарно за бой.
    if (attacker.weaponPerk && attacker.weaponPerk.type === 'armorShred') {
      const P = C_B.weaponPerks.armorShred;
      attacker.shredDone = attacker.shredDone || 0;
      const shred = Math.max(0, Math.min(P.amount, P.cap - attacker.shredDone));
      if (shred > 0) { target.stats.defense = Math.max(0, target.stats.defense - shred); attacker.shredDone += shred; out.shred = shred; }
    }
    return out;
  }

  // Удар: фиксированный «сырой» урон заклинания Удар — базовый рост урона бойца (тот же dmg, что растит
  // урон камней с уровнем/цветом), БЕЗ Силы, крита, Блока и Брони: вызывающий передаёт его в hit()/dealDamage
  // с raw = true, поэтому эти модификаторы не применяются ни на одной стороне.
  const strikeDamage = (f) => Math.max(1, Math.round(f.dmg || 1));

  // Зеркало: следующий удар, который получит f, отражается атакующему целиком (см. hit()). Ставится на
  // себя перед ходом противника; одноразовое — снимается при первом же попадании или при поражении/победе.
  function applyMirror(f) { f.mirrorReady = true; }

  // Жертва: сжигает долю ТЕКУЩЕГО ХП заклинателя (см. Balance.magic.sacrifice.hpPct) и взводит тройной
  // урон его следующего удара (см. tripleNext в hit()). Возвращает { loss, revived } — сколько ХП потеряно
  // и не поднял ли это «Неупокоенного» (крайний случай, если Жертва добивает саму себя).
  function applySacrifice(f) {
    const loss = Math.max(1, Math.round(f.hp * C_B.magic.sacrifice.hpPct / 100));
    const revived = loseHp(f, loss);
    f.tripleNext = true;
    return { loss, revived };
  }

  // Кулак ярости: взводит двойной урон следующего удара f (см. doubleNext в hit()). Условие каста (родной цвет
  // фракции господствует на поле по номиналам, Engine.dominantType) проверяет вызывающий.
  function applyFury(f) { f.doubleNext = true; }

  // Шанс героя (левого бойца) ходить первым, %.
  const firstMoveChance = (left, right) => {
    const I = C_B.initiative;
    return Math.max(I.min, Math.min(I.max, I.base + left.stats.initiative - right.stats.initiative));
  };

  // Цена заклинания kind в камнях каждого вида при Магии бойца (по умолчанию — Шаровая молния, самое частое
  // заклинание). Смола Древеня (см. ability 'sap') на 1 ход добавляет камень, независимо от заклинания.
  const spellCost = (f, kind = 'lightning') => {
    const base = Math.max(C_B.magic.minCost, C_B.magic.costs[kind]);
    const sap = f.buffs.filter((b) => b.kind === 'sap').reduce((s, b) => s + (b.extra || 0), 0);
    return base + sap;
  };

  /* Расходник. Возвращает описание эффекта или null, если использовать нельзя.
     { kind, heal } | { kind, power, turns } | { kind, stones } | { kind } */
  function useConsumable(f, kind, types, rand = battleRand) {
    const K = C_B.consumables;
    if (kind === 'potion') {
      if (f.hp >= f.max) return null;
      const heal = Math.min(f.max - f.hp, Math.max(1, Math.round((f.dmg || 1) * C_B.damage.stone * K.potion.stones)));   // цифрой: урон 8 камней
      f.hp += heal;
      return { kind, heal };
    }
    if (kind === 'elixir') {
      if (f.buffs.some((b) => b.kind === 'power')) return null;
      // «До конца хода» — держится через все действия текущего хода (в т.ч. бонусные ходы за линию 4+)
      // и снимается только когда ход передаётся противнику (см. Combat.clearTurnEndBuffs, вызывается из game.js/setTurn).
      f.buffs.push({ kind: 'power', amount: K.elixir.power, untilTurnEnd: true });
      return { kind, power: K.elixir.power };
    }
    if (kind === 'dust') {
      for (const t of types) f.counts[t] += K.dust.stones;
      return { kind, stones: K.dust.stones };
    }
    if (kind === 'scroll') {
      if (f.haste) return null;
      f.haste = true;
      return { kind };
    }
    // Свиток удачи: один раз за бой, +% к монетам и ресурсам, если этот бой выигран (см. grantRewards в game.js).
    if (kind === 'luck') {
      if (f.luck) return null;
      f.luck = K.luck.pct;
      return { kind, pct: K.luck.pct };
    }
    // Банка мёда: наугад — либо мгновенный прирост максимума ХП (держится весь бой), либо заряд
    // гарантированного блока следующего удара (см. target.shield в hit()).
    if (kind === 'honeyjar') {
      const Kj = K.honeyjar;
      if (rand() < Kj.hpChance) {
        const add = Math.round(f.max * Kj.hpPct);
        f.max += add; f.hp += add; f.tempMax = (f.tempMax || 0) + add;   // 1.6.0: пересчёт характеристик (эликсиры) не стирает добавку
        return { kind, mode: 'hp', amount: add };
      }
      f.shield = (f.shield || 0) + Kj.shieldHits;
      return { kind, mode: 'shield', hits: Kj.shieldHits };
    }
    // 1.3.0, Алхимик: Зелье грозы — бесплатная Шаровая молния на этот ход; Каменная кожа — 2 гарантированных блока.
    if (kind === 'storm') {
      if (f.magic) return null;
      f.magic = true; f.magicFree = true;
      return { kind };
    }
    if (kind === 'stoneskin') {
      f.stats.defense = (f.stats.defense || 0) + K.stoneskin.armor; f.tempDef = (f.tempDef || 0) + K.stoneskin.armor;
      return { kind, armor: K.stoneskin.armor };
    }
    return null;
  }

  // Какие расходники противник возьмёт в ранец при данном уровне ИИ.
  function enemyBag(level) {
    const out = {};
    for (const [k, levels] of Object.entries(C_B.enemyBag)) out[k] = levels.filter((l) => level >= l).length;
    return out;
  }

  // Когда противник пользуется расходниками (в начале каждого своего действия). Возвращает список видов.
  function enemyItemPlan(f, canMagic, rand = battleRand) {
    const bag = f.bag || {}, plan = [];
    if (bag.potion > 0 && f.hp <= f.max * 0.4) plan.push('potion');
    if (bag.elixir > 0 && !f.buffs.length && rand() < 0.6) plan.push('elixir');
    if (bag.scroll > 0 && !f.haste && rand() < 0.35) plan.push('scroll');
    if (bag.dust > 0 && !canMagic && rand() < 0.7) plan.push('dust');
    return plan;
  }

  // Конец действия бойца: усиления с ограничением по числу ходов теряют по ходу; усиления «до конца хода»
  // (untilTurnEnd, напр. эликсир силы) действия не считают — их снимает clearTurnEndBuffs при смене хода.
  // Свиток спешки даёт дополнительный ход. Возвращает { extra, haste } — будет ли дополнительный ход и дал ли его свиток.
  function finishAction(f, extra) {
    for (const b of f.buffs) if (!b.untilTurnEnd) b.turns--;
    f.buffs = f.buffs.filter((b) => b.untilTurnEnd || b.turns > 0);
    if (f.haste) { f.haste = false; return { extra: true, haste: true }; }
    return { extra: !!extra, haste: false };
  }

  // Снимает усиления «до конца хода» (эликсир силы) — вызывается, когда ход реально переходит другой стороне,
  // а не после каждого действия (бонусные ходы за линию 4+ не снимают баф).
  function clearTurnEndBuffs(f) {
    f.buffs = f.buffs.filter((b) => !b.untilTurnEnd);
  }

  /* Хитрость (cunning): когда противник закончил собирать камни (проход resolveBoard вместе с каскадами),
     с шансом thief.stats.cunning% вор забирает половину (вниз, минимум 1) каждого МАГИЧЕСКОГО вида,
     который противник только что получил. gained — { type: amount } за этот проход (обсидиан игнорируется).
     Меняет counts обоих бойцов. Возвращает null или { stolen: { type: n }, total }. */
  const CUNNING_TYPES = ['sapphire', 'ruby', 'emerald'];
  function cunningSteal(thief, victim, gained, rand = battleRand) {
    const p = Math.min((C_G.CAPS && C_G.CAPS.cunning) || 30, (thief.stats && thief.stats.cunning) || 0);
    const got = CUNNING_TYPES.filter((t) => (gained[t] || 0) > 0);
    if (!got.length || !chance(p, rand)) return null;
    const stolen = {};
    let total = 0;
    for (const t of got) {
      const n = Math.min(Math.max(1, Math.floor(gained[t] / 2)), gained[t], Math.max(0, victim.counts[t] || 0));
      if (n <= 0) continue;
      victim.counts[t] -= n;
      thief.counts[t] = (thief.counts[t] || 0) + n;
      stolen[t] = n; total += n;
    }
    return total ? { stolen, total } : null;
  }

  /* Приём существа в начале его хода (turnNo уже увеличен). Решает, что делать; поле меняет вызывающий.
     Возвращает null или одно из:
       { kind: 'regen', heal } { kind: 'steal', type, stones } { kind: 'prank' } { kind: 'howl' }
       { kind: 'petrify' } { kind: 'veil', stones } { kind: 'drum' } { kind: 'breath', mult }
     Регенерация, воровство, вой и бубен применяются здесь же. */
  function monsterTurnStart(f, hero, types, rand = battleRand) {
    const n = f.turnNo;
    switch (f.ability) {
      case 'regen': {
        const heal = Math.min(f.max - f.hp, Math.max(1, Math.round(f.max * A.regen.heal)));
        if (heal <= 0) return null;
        f.hp += heal;
        return { kind: 'regen', heal };
      }
      case 'steal': {
        const have = types.filter((t) => hero.counts[t] > 0);
        if (!have.length || !chance(A.steal.chance, rand)) return null;
        const type = have[Math.floor(rand() * have.length)], stones = Math.min(A.steal.stones, hero.counts[type]);
        hero.counts[type] -= stones;
        return { kind: 'steal', type, stones };
      }
      case 'prank': return chance(A.prank.chance, rand) ? { kind: 'prank' } : null;
      case 'howl':
        if (n % A.howl.every) return null;
        f.buffs.push({ kind: 'howl', amount: A.howl.power, turns: 1 });
        return { kind: 'howl' };
      case 'petrify': return n % A.petrify.every ? null : { kind: 'petrify' };
      case 'veil': return n % A.veil.every ? null : { kind: 'veil', stones: A.veil.stones };
      case 'drum':
        if (n % A.drum.every) return null;
        f.magic = true;
        return { kind: 'drum' };
      case 'breath': return n % A.breath.every ? null : { kind: 'breath', mult: A.breath.mult };
      // Морок Тени: на ваш следующий ход немного слабеет наносимый вами урон (та же «сумка баффов», что у Вой/Эликсира,
      // только с отрицательной amount — buffPower() и так суммирует все баффы без разбора кода).
      case 'weaken': {
        if (n % A.weaken.every) return null;
        hero.buffs.push({ kind: 'weaken', amount: A.weaken.power, turns: 1 });
        return { kind: 'weaken', amount: A.weaken.power };
      }
      // Панцирь Рака: с каждым разом отращивает новый шип — Блок растёт и остаётся до конца боя.
      case 'pinch': {
        if (n % A.pinch.every) return null;
        const add = Math.max(0, Math.min(C_G.CAPS.block, f.stats.block + A.pinch.block) - f.stats.block);
        f.stats.block += add;
        return { kind: 'pinch', add };
      }
      // Трясина Болотника: на ваш следующий ход, если ошибётесь, штраф ХП будет двойным (см. invalidPenalty).
      case 'mire': {
        if (n % A.mire.every) return null;
        hero.buffs.push({ kind: 'mire', amount: 0, turns: 1 });
        return { kind: 'mire' };
      }
      // Смола Древеня: ваше следующее заклинание обойдётся на extra камня каждого цвета дороже (см. spellCost).
      case 'sap': {
        if (n % A.sap.every) return null;
        hero.buffs.push({ kind: 'sap', amount: 0, extra: A.sap.extra, turns: 1 });
        return { kind: 'sap', extra: A.sap.extra };
      }
      // Спороносец Дикого гриба: споры копятся из камней, которые гриб собрал сам (см. addSpores). Проверка —
      // В НАЧАЛЕ ХОДА гриба: если спор ≥ clone.charge, живого двойника нет и за бой их было < clone.max,
      // встаёт НАСТОЯЩИЙ второй боец f.clone (см. makeClone) с ХП оригинала в этот момент; споры обнуляются.
      // Двойник бьёт героя в свой слот раунда (см. turnOrder) и прикрывает оригинал (см. enemyTarget).
      case 'clone': {
        if (f.hp <= 0 || !cloneReady(f)) return null;
        f.clone = makeClone(f);
        f.clonesMade = (f.clonesMade || 0) + 1;
        f.spores = 0;
        return { kind: 'clone', hp: f.clone.hp };
      }
      // Изворотливость: с шансом evasion.chance% в начале своего хода существо готовится уворачиваться —
      // на evasion.turns СВОИХ следующих ходов (считая этот) Блок повышен сверх обычного (см. buffStat в hit()).
      // Срабатывания подряд СКЛАДЫВАЮТСЯ: каждое добавляет отдельную запись в buffs со своим таймером —
      // buffStat() суммирует все активные, поэтому два подряд срабатывания дают вдвое больше Блока.
      case 'evasion': {
        if (!chance(A.evasion.chance, rand)) return null;
        f.buffs.push({ kind: 'evasion', amount: A.evasion.block, turns: A.evasion.turns });
        return { kind: 'evasion', amount: A.evasion.block };
      }
      // Возмездие: с шансом retribution.chance% в начале своего хода существо готовится мстить — на
      // retribution.turns СВОИХ следующих ходов (считая этот) Рикошет повышен сверх обычного. Складывается
      // так же, как Изворотливость (см. выше) — несколько срабатываний подряд суммируют бонус Рикошета.
      case 'retribution': {
        if (!chance(A.retribution.chance, rand)) return null;
        f.buffs.push({ kind: 'retribution', amount: A.retribution.ricochet, turns: A.retribution.turns });
        return { kind: 'retribution', amount: A.retribution.ricochet };
      }
      // Оглушение (1.7.3): героя оглушает — свой следующий ход он пропускает (см. game.js enemyTurn); Блок героя
      // даёт шанс устоять. hero.stunned снимает вызывающий, когда ход пропущен.
      case 'stun': {
        if (n % A.stun.every) return null;
        if (chance((hero.stats && hero.stats.block) || 0, rand)) return { kind: 'stun', resisted: true };
        hero.stunned = true;
        return { kind: 'stun' };
      }
      // Отрава (1.7.3): яд на героя — в начале каждого из turns его ходов он теряет dmg ХП (raw, броня и Блок не помогают).
      case 'toxin': {
        if (n % A.toxin.every) return null;
        const dmg = Math.max(1, Math.round(venomTick(power(f), f.dmg) * A.toxin.mult));
        hero.poison = { turns: A.toxin.turns, dmg: Math.max(dmg, (hero.poison && hero.poison.turns > 0 && hero.poison.dmg) || 0) };
        return { kind: 'toxin', dmg, turns: A.toxin.turns };
      }
      // Щит (1.7.3): обновляет щит до pct максимума ХП; новый заменяет остаток прежнего.
      case 'ward': {
        if (n % A.ward.every) return null;
        const amount = Math.max(1, Math.round(f.max * A.ward.pct));
        f.ward = amount;
        return { kind: 'ward', amount };
      }
      default: return null;
    }
  }

  /* Что существо сделает дальше (1.7.3, подпись над ним). Возвращает null (приёма нет) или
     { kind, every, left } — «каждый N-й ход», left ходов существа до срабатывания (1 — в ближайший);
     { kind, chance } — «с шансом»; { kind, once, spent } — одноразовый; { kind, hot } — Ярость раненого;
     { kind, passive } — действует постоянно. fighters.right.turnNo — сколько ходов существо уже сделало. */
  function nextMove(f) {
    const id = f && f.ability;
    if (!id || f.hp <= 0) return null;
    const a = A[id] || {};
    if (a.every) return { kind: id, every: a.every, left: a.every - ((f.turnNo || 0) % a.every) };
    if (id === 'undying') return { kind: id, once: true, spent: !!f.revived };
    if (id === 'charge') return { kind: id, once: true, spent: !!f.charged };
    if (id === 'rage') return { kind: id, below: Math.round(a.below * 100), hot: f.hp < f.max * a.below };
    if (id === 'clone') return { kind: id, spores: f.spores || 0, need: a.charge, spent: (f.clonesMade || 0) >= a.max };
    if (id === 'regen') return { kind: id, heal: Math.round(a.heal * 100) };
    if (a.chance) return { kind: id, chance: a.chance };
    return { kind: id, passive: true };
  }

  // Урон яда за один ход: растёт с уровнем и Силой отравителя.
  const venomTick = (pow, dmg = 1) => Math.ceil(C_B.faction.venom.base * dmg + 0.25 * pow);
  // Лечение Целебного дождя: сумма номиналов цветных камней × рост урона заклинателя.
  const rainHeal = (f, sum) => Math.min(f.max - f.hp, Math.round(sum * (f.dmg || 1)));
  /* ХП цели в «камнях» нападающего: сколько собранных камней нужно, чтобы её добить (с учётом роста урона,
     Силы нападающего и Брони цели). ИИ считает в камнях, поэтому ему передаются такие значения. */
  const hpUnits = (target, attacker, hp = target.hp) =>
    hp / Math.max(0.01, powerEst(attacker) * armorFactor(attacker, target));
  // Всё, что нужно ИИ бойца me против соперника opp.
  const aiView = (me, opp) => ({
    hpMe: hpUnits(me, opp), hpOpp: hpUnits(opp, me), maxMe: hpUnits(me, opp, me.max),
    healMult: (me.dmg || 1) / Math.max(0.01, powerEst(opp) * armorFactor(opp, me)),
  });
  /* Оценка шанса победы «среднего» игрока: hero = { max, dmg, stats }, mon = { max, dmg, stats, ai }, species — вид.
     Модель и её числа — Balance.danger (обучена на симуляторе). */
  function winChance(hero, mon, species) {
    const D = C_B.danger;
    const pct = (v, cap) => Math.min(v || 0, cap) / 100;
    const ehp = (f) => f.max / ((1 - pct(f.stats.defense, C_G.MAX_DEFENSE)) * (1 - pct(f.stats.block, 50)) * (1 - pct(f.stats.ricochet, 40)));
    let aiDmg = D.aiTable[D.aiTable.length - 1][1];
    for (let i = 1; i < D.aiTable.length; i++) {
      const [a0, v0] = D.aiTable[i - 1], [a1, v1] = D.aiTable[i];
      if (mon.ai <= a1) { aiDmg = v0 + (v1 - v0) * (Math.max(a0, mon.ai) - a0) / (a1 - a0); break; }
    }
    // Удар за ход = камни + Сила за каждое собрание: собраний за ход примерно столько, сколько линий среднего размера в heroBase.
    const heroHits = D.heroBase / AVG_HIT, monHits = aiDmg / AVG_HIT;
    const heroDpr = D.heroBase + heroHits * basePower(hero);
    const monDpr = aiDmg + monHits * basePower(mon);
    const x = Math.log((ehp(hero) / monDpr) / (ehp(mon) / heroDpr));
    const z = D.slope * x + D.init * ((hero.stats.initiative || 0) - (mon.stats.initiative || 0)) / 100 + (D.offset[species] || 0);
    return 1 / (1 + Math.exp(-z));
  }
  // Оценка словами: 'easy' | 'even' | 'hard' | 'deadly'.
  function dangerBand(p) {
    const b = C_B.danger.bands;
    return p >= b.easy ? 'easy' : p >= b.even ? 'even' : p >= b.hard ? 'hard' : 'deadly';
  }

  /* Порядок ходов в раунде, когда у игрока есть боеспособный питомец (см. pets.js): это ВСЕГДА
     тот же единственный дикий противник, которого встретил игрок — просто теперь по нему бьют двое
     (2 на 1), а не мирное удвоение урона героя. heroFirst — обычный бросок инициативы героя против
     монстра (см. firstMoveChance), petAlive — жив ли и в строю ли питомец на начало раунда.
     Без питомца (petAlive=false или питомца нет вовсе) возвращает ровно ['hero','monster'] или
     ['monster','hero'] — то есть старый 1-на-1 порядок ходов не меняется НИКАК.
     cloneAlive (необязательный, по умолчанию false) — жив ли двойник Дикого гриба (см. makeClone): он
     ходит сразу после оригинала, зеркально питомцу: [hero, pet?, monster, clone] / [monster, clone, hero, pet?]. */
  function turnOrder(heroFirst, petAlive, cloneAlive = false) {
    const party = petAlive ? ['hero', 'pet'] : ['hero'];
    const foes = cloneAlive ? ['monster', 'clone'] : ['monster'];
    return heroFirst ? [...party, ...foes] : [...foes, ...party];
  }

  /* ---------- Спороносец: двойник Дикого гриба (второй боец на стороне ПРОТИВНИКА) ----------
     Состояние живёт на самом грибе-оригинале f: f.spores — накопленные споры, f.clonesMade — сколько
     двойников уже было за бой, f.clone — боец двойника (тот же формат, что у героя/питомца) или null.
     Вызывающий (game.js, tools/sim.js) обнуляет эти поля в начале боя. */
  const CL = () => A.clone;
  // Споры: всё, что гриб сам собрал за проход по полю (номинал × бонус линии, все виды камней). Копятся до порога.
  // У других существ ничего не делает. Пока жив двойник, споры НЕ копятся — иначе новый двойник вставал бы
  // сразу после гибели предыдущего. Возвращает текущий запас спор.
  function addSpores(f, amount) {
    if (f.ability !== 'clone' || !(amount > 0) || cloneAlive(f)) return f.spores || 0;
    f.spores = Math.min(CL().charge, (f.spores || 0) + amount);
    return f.spores;
  }
  const cloneAlive = (f) => !!f && !!f.clone && f.clone.hp > 0;
  // Можно ли выпустить двойника прямо сейчас: споры набраны, живого двойника нет, лимит за бой не исчерпан.
  const cloneReady = (f) => f.ability === 'clone' && (f.spores || 0) >= CL().charge && !cloneAlive(f) && (f.clonesMade || 0) < CL().max;
  // Двойник: ХП = текущее ХП оригинала (и это же его максимум), остальные характеристики — копия. Без приёма
  // (сам не клонируется), без ранца и баффов оригинала.
  function makeClone(f) {
    return {
      hp: f.hp, max: f.hp, dmg: f.dmg, stats: { ...f.stats }, buffs: [], haste: false, magic: false,
      counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false,
      turnNo: 0, poison: null, isClone: true,
    };
  }
  // Удар двойника (до модификаторов Combat.hit — роста урона, Силы, Брони героя): clone.stones «камней».
  const cloneAttackAmount = () => CL().stones;
  // Кого бьют герой и питомец: живой двойник прикрывает оригинал; перебор урона на оригинал не переходит.
  const enemyTarget = (f) => (cloneAlive(f) ? f.clone : f);
  // Сторона противника побеждена, только когда мёртв оригинал И нет живого двойника.
  const enemyDefeated = (f) => f.hp <= 0 && !cloneAlive(f);

  // Штраф за неверный ход. Трясина Болотника (см. ability 'mire') на 1 ход удваивает его.
  const invalidPenalty = (f) => {
    const base = Math.max(1, Math.round(f.max * C_B.invalid.penalty));
    return f.buffs.some((b) => b.kind === 'mire') ? base * 2 : base;
  };

  // Шаровая молния действует до конца хода: если ход продолжается (дополнительный ход
  // за линию 4+), заклинание остаётся включённым и снова сработает на следующем сборе камней.
  const continueMagic = (wasMagic, extraTurn) => !!wasMagic && !!extraTurn;

  // Таймер хода в бою: если игрок не ходит TURN_TIMER.seconds секунд подряд, ход пропускается.
  // skipLimit таких пропусков ПОДРЯД (без реального хода между ними подряд) — поражение.
  const TURN_TIMER = { seconds: 30, skipLimit: 3 };
  // Пропуск хода по таймеру: увеличивает счётчик подряд идущих пропусков.
  // Возвращает { skips, defeated } — новый счётчик и наступило ли поражение.
  function registerSkip(skips) {
    const n = (skips || 0) + 1;
    return { skips: n, defeated: n >= TURN_TIMER.skipLimit };
  }

  return { levelPower, basePower, armorOf, armorAt, mitigate, buffPower, buffStat, power, loseHp, hit, applyMirror, applySacrifice, applyFury, strikeDamage, firstMoveChance, spellCost, useConsumable, enemyBag, enemyItemPlan, finishAction, clearTurnEndBuffs, monsterTurnStart, nextMove, cunningSteal, venomTick, rainHeal, invalidPenalty, hpUnits, aiView, winChance, dangerBand, chance, continueMagic, TURN_TIMER, registerSkip, turnOrder, addSpores, cloneAlive, cloneReady, makeClone, cloneAttackAmount, enemyTarget, enemyDefeated };
})();

// Для тестов и симулятора в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Combat;
