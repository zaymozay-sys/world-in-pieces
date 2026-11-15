// Карта модулей: node tools/modmap.js  → печатает таблицу для docs/architecture.md (файл, размер, что объявляет, от чего зависит).
// Игра — обычные скрипты в порядке из index.html; «зависит» = обращается к именам, объявленным в других файлах.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
const decl = {}, src = {};
for (const f of order) {
  src[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  decl[f] = [...new Set([...src[f].matchAll(/^(?:const|let|var|(?:async\s+)?function|class)\s+([A-Z][\w$]*)/gm)].map((m) => m[1]))];
}
const owner = {}; for (const f of order) for (const n of decl[f]) if (!owner[n] && n.length >= 4) owner[n] = f;   // короткие имена (T, N…) дают ложные совпадения
const DATA = new Set(['js/en.js', 'js/forge-data.js', 'js/art-files.js']);   // чистые данные: в них имена встречаются только как текст
const rows = [];
for (const f of order) {
  const deps = new Set(); const code = DATA.has(f) ? '' : src[f].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  for (const n in owner) if (owner[n] !== f && new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(code)) deps.add(path.basename(owner[n], '.js'));
  rows.push(`| ${order.indexOf(f) + 1} | \`${f}\` | ${Math.round(src[f].length / 1024)} | ${decl[f].slice(0, 6).join(', ')}${decl[f].length > 6 ? ', …' : ''} | ${[...deps].slice(0, 14).join(', ')}${deps.size > 14 ? ', …(' + deps.size + ')' : ''} |`);
}
console.log('| № | Файл | КБ | Объявляет | Зависит от |\n|---|---|---|---|---|\n' + rows.join('\n'));
