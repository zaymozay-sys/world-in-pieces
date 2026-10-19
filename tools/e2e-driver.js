// Водитель для e2e-проверок живого боя: в свой ход выбирает ход ИИ и делает его так, как сделал бы игрок.
const DRIVER = `
window.__drive = (opts) => {
  const log = (window.__log = window.__log || []);
  let busyTick = false;
  const tick = async () => {
    if (busyTick) return; busyTick = true;
    try {
      if (over || !liveActive) return;
      if (turnSide !== 'left' || busy || aiming) return;
      const f = fighters.left, v = Combat.aiView(f, fighters.right);
      const afford = f.magic ? {} : Object.fromEntries(Object.keys(MAGICS).map((k) => [k, ['lightning','fire','square','transmute','heal','chaos','pierce','strike','mirror','tide','sacrifice','divination'].includes(k) && opts.spells && spellOpen(k) && canAffordMagic('left', k)]));
      if (opts.facs && (f.charge || 0) >= CHARGE) {
        const id = playerFaction().ability.id; log.push('fac ' + id);
        if (id === 'growth') { toggleAim('growth'); let cell = null; for (let r = 0; r < N && !cell; r++) for (let c = 0; c < N; c++) if (grid[r][c]) { cell = { r, c }; break; } if (cell) await castGrowth(cell); else stopAim(); }
        else await useFactionAbility();
        await new Promise((r) => setTimeout(r, 100));
      }
      if (opts.force) {
        for (const k of opts.force) {
          if (!spellOpen(k) || !canAffordMagic('left', k) || f.magic) continue;
          if (k === 'heal' && f.hp >= f.max) continue;
          if (['fire', 'square', 'transmute', 'chaos', 'pierce'].includes(k)) {
            let cell = null; for (let r = 0; r < N && !cell; r++) for (let c = 0; c < N; c++) if (grid[r][c]) { cell = { r, c }; break; }
            if (!cell) continue; aimKind = k; aiming = true; log.push('cast ' + k); await playerCast(cell); return;
          }
          if (k === 'fury') continue;
          log.push('inst ' + k); await playerInstant(k); return;
        }
      }
      const mv = AI.choose(typOf(), valOf(), v.hpMe, v.hpOpp, 60, afford, { maxMe: v.maxMe, healMult: v.healMult, locked: lockedCells('left') });
      if (!mv) { log.push('нет хода'); return; }
      if (mv.kind === 'lightning') { toggleMagic(); await new Promise((r) => setTimeout(r, 50)); }
      else if (mv.kind === 'fire' || mv.kind === 'square' || mv.kind === 'transmute' || mv.kind === 'chaos' || mv.kind === 'pierce') {
        aimKind = mv.kind; aiming = true; log.push('cast ' + mv.kind); await playerCast({ r: Math.floor(mv.idx / N), c: mv.idx % N }); return;
      } else if (mv.kind === 'heal' || mv.kind === 'strike' || mv.kind === 'mirror' || mv.kind === 'tide' || mv.kind === 'sacrifice' || mv.kind === 'divination') { log.push('inst ' + mv.kind); await playerInstant(mv.kind); return; }
      if (mv.a !== undefined) { await playerMove({ r: Math.floor(mv.a / N), c: mv.a % N }, { r: Math.floor(mv.b / N), c: mv.b % N }); }
    } catch (e) { log.push('ERR ' + e.message); } finally { busyTick = false; }
  };
  window.__timer = setInterval(tick, 120);
};
`;
module.exports = DRIVER;
