// «Битва народов»: недельное соревнование четырёх фракций. Очки народа — сумма изменений рейтинга всех его игроков
// за календарную неделю (бои между разными народами переносят очки от проигравшего к победителю, бои своих — ноль).
// Победитель недели — народ с наибольшим положительным счётом и не менее MIN_PLAYERS играющими; игроки победителя,
// сыгравшие от MIN_GAMES боёв, получают награду один раз (ключ faction:<id> в tournament_claims).
const FACTIONS = ['human', 'dwarf', 'elf', 'lizard'];
const MIN_PLAYERS = 2;
// rows: [{ faction, score, games, players }] из store.factionRange; возвращает полный список по четырём народам и победителя
const standings = (rows) => {
  const by = new Map((rows || []).map((r) => [r.faction, r]));
  const list = FACTIONS.map((f) => { const r = by.get(f); return { faction: f, score: r ? r.score : 0, games: r ? r.games : 0, players: r ? r.players : 0 }; });
  list.sort((a, b) => b.score - a.score || b.games - a.games || FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction));
  const top = list[0], second = list[1];
  const winner = top && top.score > 0 && top.players >= MIN_PLAYERS && (!second || second.score < top.score) ? top.faction : null;
  return { list, winner };
};
module.exports = { FACTIONS, MIN_PLAYERS, standings };
