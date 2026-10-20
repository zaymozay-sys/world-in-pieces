/* Анонимная воронка новичка (1.9.7): сколько устройств дошло до шагов обучения, 1-й/3-й/10-й победы и уроков Бобра.
   Отправляются только названия событий — без имени, номера игрока и ключей; каждое событие уходит один раз с устройства
   (список отправленных хранится в localStorage), сервер лишь прибавляет единицу к счётчику за день. Нет связи — повторим позже. */
const Funnel = (() => {
  const EVENTS = ['first_open', 'tut_half', 'tut_done', 'win1', 'win3', 'win10', 'lesson1', 'lessons_all'];
  const KEY = 'wip.funnel';
  // какие события уже достигнуты по данным героя (чистая функция)
  function reached(d) {
    d = d || {};
    const out = ['first_open'], t = d.tutorial || {}, w = d.wins || 0, ls = d.lessons && d.lessons.done ? Object.keys(d.lessons.done).length : 0;
    if (t.done || (t.step || 0) >= 6) out.push('tut_half');
    if (t.done) out.push('tut_done');
    if (w >= 1) out.push('win1'); if (w >= 3) out.push('win3'); if (w >= 10) out.push('win10');
    if (ls >= 1) out.push('lesson1'); if (ls >= 5) out.push('lessons_all');
    return out;
  }
  const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const store = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* не страшно */ } };
  let busy = false;
  // вызывается при сохранении героя: отправляет новые события по одному
  async function sync(d, remote) {
    if (busy || !remote || !remote.funnel || !remote.enabled) return;
    const sent = load(), todo = reached(d).filter((e) => !sent[e]);
    if (!todo.length) return;
    busy = true;
    try { for (const e of todo) { if (await remote.funnel(e)) { sent[e] = 1; store(sent); } else break; } } catch (e) { /* позже */ } finally { busy = false; }
  }
  return { EVENTS, reached, sync };
})();

if (typeof module !== 'undefined') module.exports = Funnel;
