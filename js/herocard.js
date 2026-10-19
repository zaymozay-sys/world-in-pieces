/* Визитка героя (1.8.8): сводка для показа другим игрокам — имя, уровень, бои, медали, заслуги.
   Чистый модуль: build(data, ctx) собирает данные для показа (их же позже можно отправить на сервер), text(card) — копируемый текст.
   ctx: { level, medalName(id) } — то, чего нет в самих данных. Профиль не меняет. */
const HeroCard = (() => {
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  function build(data, ctx) {
    data = data || {}; ctx = ctx || {};
    const stats = data.stats || {}, battles = Math.max(num(stats.battles), num(data.wins));   // считаем только число боёв; исход не важен
    const earned = (data.medals && Array.isArray(data.medals.earned) ? data.medals.earned : []).filter((m) => m && m.id);
    const ids = [...new Set(earned.map((m) => m.id))];
    const shards = Object.keys((data.story && data.story.shards) || {}).filter((k) => data.story.shards[k]).length;
    const species = Object.values(data.bestiary || {}).filter((r) => r && r.wins > 0).length;
    const merits = [];
    if (shards) merits.push({ k: 'shards', n: shards });
    if (species) merits.push({ k: 'species', n: species });
    if (data.tower && data.tower.best > 1) merits.push({ k: 'tower', n: num(data.tower.best) });
    if (data.island && data.island.chestTaken) merits.push({ k: 'island', n: 1 });
    if (typeof RareHunt !== 'undefined' && RareHunt.trophyCount(data)) merits.push({ k: 'trophies', n: RareHunt.trophyCount(data) });
    if (typeof LHGames !== 'undefined' && data.lh) {
      const lh = LHGames.clean(data.lh), bd = LHGames.badges(lh);
      if (lh.best.av || lh.best.py) merits.push({ k: 'lhbest', n: lh.best.av, m: lh.best.py });
      if (bd.length) merits.push({ k: 'badges', n: bd.length, names: bd.map((x) => x.name()) });
    }
    if (Array.isArray(data.chron) && data.chron.some((e) => e && e.k === 'lord')) merits.push({ k: 'lord', n: 1 });
    return { name: typeof data.name === 'string' ? data.name : '', faction: data.faction || '', level: num(ctx.level), battles, medals: ids.map((id) => ({ id, name: ctx.medalName ? ctx.medalName(id) : id })), merits };
  }
  const MERIT_TEXT = {
    shards: (n) => _t("Стражей осколков побеждено: {0}", [n]),
    species: (n) => _t("Видов существ изучено: {0}", [n]),
    tower: (n) => _t("Лучший уровень подземелья: {0}", [n]),
    trophies: (n) => _t("Трофеев редких зверей: {0}", [n]),
    island: () => _t("Открыт сундук на Затерянном острове"),
    lord: () => _t("Победил Владыку замка"),
    lhbest: (n, m) => _t("Рекорды у смотрителя маяка: «Обвал» {0}, «Пирамида» {1}", [n, m]),
    badges: (n, m, names) => _t("Знаки маяка: {0}", [(names || []).join(', ')]),
  };
  const meritText = (m) => (MERIT_TEXT[m.k] ? MERIT_TEXT[m.k](m.n, m.m, m.names) : '');
  function text(c) {
    const lines = [_t("{0} · уровень {1}", [c.name || '—', c.level]), _t("Боёв: {0}", [c.battles])];
    for (const m of c.merits) lines.push('• ' + meritText(m));
    if (c.medals.length) lines.push(_t("Медалей: {0}", [c.medals.length]) + ': ' + c.medals.slice(0, 12).map((m) => m.name).join(', ') + (c.medals.length > 12 ? '…' : ''));
    return lines.join('\n');
  }
  return { build, text, meritText };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HeroCard;
