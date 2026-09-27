/* Правила боя без интерфейса: урон, блок, броня, рикошет, приёмы существ и фракций, расходники.
   Работают с объектами бойцов; ими пользуются игра (game.js) и симулятор (tools/sim.js).

   Боец: { hp, max, dmg, stats, buffs: [{kind, amount, turns}], haste, magic, counts, ability,
           charged, revived, turnNo, poison: {turns, dmg} }.
   dmg — множитель урона камней (у героя растёт с уровнем, у существа — с цветом).
   ability — приём существа (id из bestiary.js) или null у героя.
   rand — генератор случайных чисел 0..1 (по умолчанию Math.random). */

const C_B = (typeof Balance !== 'undefined') ? Balance : require('./balance.js');
const C_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

const Combat = (() => {
  const A = C_B.abilities;
  const chance = (p, rand) => p > 0 && rand() * 100 < p;

  // Сумма всех усилений урона (эликсир силы, Знамя, Вой).
  const buffPower = (f) => f.buffs.reduce((s, b) => s + (b.amount || 0), 0);

  // Итоговая Сила бойца: снаряжение + усиления + Ярость раненого орка.
  function power(f) {
    let p = f.stats.power + buffPower(f);
    if (f.ability === 'rage' && f.hp < f.max * A.rage.below) p += A.rage.power;
    return p;
  }

  // Снимает ХП. «Неупокоенный» один раз встаёт вместо смерти. Возвращает true, если боец восстал.
  function loseHp(f, amount) {
    if (f.ability === 'undying' && !f.revived && f.hp - amount <= 0) {
      f.revived = true;
      f.hp = Math.ceil(f.max * A.undying.hp);
      return true;
    }
    f.hp = Math.max(0, f.hp - amount);
    return false;
  }

  /* Удар attacker → target на amount (до усилений).
     Порядок: Сила нападающего усиливает удар (Натиск удваивает первый); цель может БЛОКИРОВАТЬ его целиком;
     иначе Броня цели снижает урон (Подлый удар её не замечает); затем удар может РИКОШЕТОМ отлететь
     в нападающего (отлетает урон за вычетом брони цели); Кровопийца лечится на долю урона.
     raw = true — урон без модификаторов (штраф за неверный ход, яд).
     Возвращает { kind: 'hit' | 'block' | 'reflect', amount, charged, pierce, heal, revived, attackerRevived }. */
  function hit(attacker, target, amount, raw = false, rand = Math.random) {
    const out = { kind: 'hit', amount: 0, charged: false, pierce: false, heal: 0, revived: false, attackerRevived: false };
    if (amount <= 0) return out;
    if (raw) {
      out.revived = loseHp(target, amount);
      out.amount = amount;
      return out;
    }
    amount = Math.ceil(amount * (attacker.dmg || 1) * (1 + power(attacker) / 100));   // dmg — рост урона с уровнем/цветом
    if (attacker.ability === 'charge' && !attacker.charged) {
      attacker.charged = true;
      amount *= A.charge.mult;
      out.charged = true;
    }
    if (chance(target.stats.block, rand)) { out.kind = 'block'; return out; }
    out.pierce = attacker.ability === 'backstab' && chance(A.backstab.chance, rand);
    const def = out.pierce ? 0 : Math.min(C_G.MAX_DEFENSE, target.stats.defense);
    amount = Math.max(1, Math.round(amount * (1 - def / 100)));
    out.amount = amount;
    if (chance(target.stats.ricochet, rand)) {
      out.kind = 'reflect';
      out.attackerRevived = loseHp(attacker, amount);
      return out;
    }
    out.revived = loseHp(target, amount);
    if (attacker.ability === 'vampire' && attacker.hp > 0) {
      out.heal = Math.min(attacker.max - attacker.hp, Math.ceil(amount * A.vampire.share));
      attacker.hp += out.heal;
    }
    return out;
  }

  // Шанс героя (левого бойца) ходить первым, %.
  const firstMoveChance = (left, right) => {
    const I = C_B.initiative;
    return Math.max(I.min, Math.min(I.max, I.base + left.stats.initiative - right.stats.initiative));
  };

  // Цена заклинания в камнях каждого вида при Магии бойца.
  const spellCost = (f) => Math.max(C_B.magic.minCost, C_B.magic.cost - Math.floor(f.stats.magic / C_B.magic.magicPerStone));

  /* Расходник. Возвращает описание эффекта или null, если использовать нельзя.
     { kind, heal } | { kind, power, turns } | { kind, stones } | { kind } */
  function useConsumable(f, kind, types) {
    const K = C_B.consumables;
    if (kind === 'potion') {
      if (f.hp >= f.max) return null;
      const heal = Math.min(f.max - f.hp, Math.ceil(f.max * K.potion.heal));
      f.hp += heal;
      return { kind, heal };
    }
    if (kind === 'elixir') {
      if (f.buffs.some((b) => b.kind === 'power')) return null;
      f.buffs.push({ kind: 'power', amount: K.elixir.power, turns: K.elixir.turns });
      return { kind, power: K.elixir.power, turns: K.elixir.turns };
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
    return null;
  }

  // Какие расходники противник возьмёт в ранец при данном уровне ИИ.
  function enemyBag(level) {
    const out = {};
    for (const [k, levels] of Object.entries(C_B.enemyBag)) out[k] = levels.filter((l) => level >= l).length;
    return out;
  }

  // Когда противник пользуется расходниками (в начале каждого своего действия). Возвращает список видов.
  function enemyItemPlan(f, canMagic, rand = Math.random) {
    const bag = f.bag || {}, plan = [];
    if (bag.potion > 0 && f.hp <= f.max * 0.4) plan.push('potion');
    if (bag.elixir > 0 && !f.buffs.length && rand() < 0.6) plan.push('elixir');
    if (bag.scroll > 0 && !f.haste && rand() < 0.35) plan.push('scroll');
    if (bag.dust > 0 && !canMagic && rand() < 0.7) plan.push('dust');
    return plan;
  }

  // Конец действия бойца: усиления теряют по ходу, Свиток спешки даёт дополнительный ход.
  // Возвращает { extra, haste } — будет ли дополнительный ход и дал ли его свиток.
  function finishAction(f, extra) {
    for (const b of f.buffs) b.turns--;
    f.buffs = f.buffs.filter((b) => b.turns > 0);
    if (f.haste) { f.haste = false; return { extra: true, haste: true }; }
    return { extra: !!extra, haste: false };
  }

  /* Приём существа в начале его хода (turnNo уже увеличен). Решает, что делать; поле меняет вызывающий.
     Возвращает null или одно из:
       { kind: 'regen', heal } { kind: 'steal', type, stones } { kind: 'prank' } { kind: 'howl' }
       { kind: 'petrify' } { kind: 'veil', stones } { kind: 'drum' } { kind: 'breath', mult }
     Регенерация, воровство, вой и бубен применяются здесь же. */
  function monsterTurnStart(f, hero, types, rand = Math.random) {
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
      default: return null;
    }
  }

  // Урон яда за один ход: растёт с Силой и уровнем отравителя.
  const venomTick = (pow, dmg = 1) => Math.ceil(C_B.faction.venom.base * dmg * (1 + pow / 100));
  // Лечение Целебного дождя: сумма номиналов цветных камней × рост урона заклинателя.
  const rainHeal = (f, sum) => Math.min(f.max - f.hp, Math.round(sum * (f.dmg || 1)));
  /* ХП цели в «камнях» нападающего: сколько собранных камней нужно, чтобы её добить (с учётом роста урона,
     Силы нападающего и Брони цели). ИИ считает в камнях, поэтому ему передаются такие значения. */
  const hpUnits = (target, attacker, hp = target.hp) =>
    hp / Math.max(0.01, (attacker.dmg || 1) * (1 + power(attacker) / 100) * (1 - Math.min(C_G.MAX_DEFENSE, target.stats.defense) / 100));
  // Всё, что нужно ИИ бойца me против соперника opp.
  const aiView = (me, opp) => ({
    hpMe: hpUnits(me, opp), hpOpp: hpUnits(opp, me), maxMe: hpUnits(me, opp, me.max),
    healMult: (me.dmg || 1) / Math.max(0.01, (opp.dmg || 1) * (1 + power(opp) / 100) * (1 - Math.min(C_G.MAX_DEFENSE, me.stats.defense) / 100)),
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
    const heroDpr = D.heroBase * (hero.dmg || 1) * (1 + (hero.stats.power || 0) / 100) * (1 + 0.06 * Math.floor((hero.stats.magic || 0) / 4));
    const monDpr = aiDmg * (mon.dmg || 1) * (1 + (mon.stats.power || 0) / 100);
    const x = Math.log((ehp(hero) / monDpr) / (ehp(mon) / heroDpr));
    const z = D.slope * x + D.init * ((hero.stats.initiative || 0) - (mon.stats.initiative || 0)) / 100 + (D.offset[species] || 0);
    return 1 / (1 + Math.exp(-z));
  }
  // Оценка словами: 'easy' | 'even' | 'hard' | 'deadly'.
  function dangerBand(p) {
    const b = C_B.danger.bands;
    return p >= b.easy ? 'easy' : p >= b.even ? 'even' : p >= b.hard ? 'hard' : 'deadly';
  }

  // Штраф за неверный ход.
  const invalidPenalty = (f) => Math.max(1, Math.round(f.max * C_B.invalid.penalty));

  return { buffPower, power, loseHp, hit, firstMoveChance, spellCost, useConsumable, enemyBag, enemyItemPlan, finishAction, monsterTurnStart, venomTick, rainHeal, invalidPenalty, hpUnits, aiView, winChance, dangerBand, chance };
})();

// Для тестов и симулятора в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Combat;
