// Проверка бесконечных анимаций: node tools/audit-anim.js
// Анимация, которая крутится всё время, должна менять только transform и opacity — их ведёт видеокарта. Любое другое
// свойство (box-shadow, filter, left, width, background-position…) заставляет браузер перерисовывать страницу на
// процессоре каждый кадр: так Стена доблести в покое занимала 97% процессора. Скрипт находит такие анимации в css/.
// Разрешённые исключения перечислены в ALLOW с объяснением. Возвращает код 1, если нашлись новые.
const fs = require('fs'), path = require('path');
const ALLOW = {
  // имя анимации: почему можно (все — короткие или редкие состояния, а не экран в покое)
  hintPulse: 'подсказка хода: горит, пока игрок не сходит',
  coachPulse: 'обучение: рамка вокруг того, что нужно нажать',
  coachRing: 'обучение: кольцо-указатель на карте',
  newspell: 'новое заклинание до первого применения; обе псевдо-части кнопки заняты (подпись клавиши и зона нажатия)',
  lootshine: 'перекрыта правилом rwShine (одно проигрывание) — в игре не крутится',
  'lh-tw': 'мини-игра Маяка', 'lh-lamp': 'мини-игра Маяка', 'lh-flow': 'мини-игра Маяка', 'lh-wave': 'мини-игра Маяка', 'lh-pulse': 'мини-игра Маяка',
};
const dir = path.join(__dirname, '..', 'css');
const css = fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n').replace(/\/\*[^]*?\*\//g, '');
const frames = {};
for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
  const props = new Set();
  for (const b of m[2].matchAll(/\{([^{}]*)\}/g)) for (const d of b[1].split(';')) { const p = d.split(':')[0].trim(); if (p) props.add(p); }
  frames[m[1]] = props;
}
const bad = {};
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  for (const d of m[2].matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) for (const part of d[1].split(',')) {
    if (!/\binfinite\b/.test(part)) continue;
    const name = part.trim().split(/\s+/).find((w) => frames[w]); if (!name) continue;
    const heavy = [...frames[name]].filter((p) => !/^(transform|opacity|offset|animation-timing-function)$/.test(p));
    if (heavy.length && !ALLOW[name]) (bad[name] = bad[name] || { props: heavy, where: [] }).where.push(m[1].trim().replace(/\s+/g, ' ').slice(0, 90));
  }
}
const names = Object.keys(bad);
for (const n of names) console.log(`${n}: ${bad[n].props.join(', ')}\n    ${bad[n].where.slice(0, 3).join('\n    ')}${bad[n].where.length > 3 ? `\n    … и ещё ${bad[n].where.length - 3}` : ''}`);
console.log(names.length ? `Тяжёлых бесконечных анимаций: ${names.length}` : 'audit-anim: все бесконечные анимации идут на видеокарте');
if (require.main === module) process.exit(names.length ? 1 : 0);
module.exports = { bad };
