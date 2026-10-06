// Проверка переводов. Запуск из папки игры:  node tools/i18n-extract.js
// Показывает: какие _t('русская строка') из js/*.js ещё не переведены в js/en.js
// и (если найден парсер acorn) русский текст, который забыли обернуть в _t(...).
// Как писать текст в коде:  _t('Привет')   или со вставками   _t('Получено {0} монет', [n]).
// Английские переводы правятся прямо в js/en.js (ключ — русская строка, значение — перевод).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'js');
const EN = require('../js/en.js');
const cy = /[А-Яа-яЁё]/;
let acorn = null;
for (const m of ['acorn', process.env.ACORN_PATH || '']) { if (!m) continue; try { acorn = require(m); break; } catch (e) { /* нет */ } }
if (!acorn) console.log('(acorn не найден — проверка «текст вне _t» пропущена; можно задать ACORN_PATH=путь/к/acorn)');

const used = new Set(), bare = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js') || ['en.js', 'i18n.js', 'art-files.js'].includes(f)) continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /_t\(\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    let s; try { s = new Function('return ' + m[1] + m[2].replace(/\$\{/g, '\\${') + m[1])(); } catch (e) { continue; }
    if (cy.test(s)) used.add(s);
  }
  if (!acorn) continue;
  const ast = acorn.parse(src, { ecmaVersion: 'latest', locations: true });
  (function visit(n, parent) {
    const isT = parent && parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && parent.callee.name === '_t' && parent.arguments[0] === n;
    const isKey = parent && parent.type === 'BinaryExpression' && [parent.left, parent.right].some((x) => x.type === 'MemberExpression' && x.property.name === 'key');
    if (n.type === 'Literal' && typeof n.value === 'string' && cy.test(n.value) && !isT && !isKey) bare.push(`${f}:${n.loc.start.line}: ${JSON.stringify(n.value.slice(0, 60))}`);
    if (n.type === 'TemplateLiteral' && n.quasis.some((q) => cy.test(q.value.cooked)) && !isT) bare.push(`${f}:${n.loc.start.line}: шаблон «${n.quasis[0].value.cooked.slice(0, 50)}…»`);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, n));
      else if (v && typeof v.type === 'string') visit(v, n);
    }
  })(ast, null);
}
const missing = [...used].filter((k) => EN[k] === undefined);
console.log(`строк в коде: ${used.size}, переводов в en.js: ${Object.keys(EN).length}`);
if (missing.length) { console.log('\nНет английского перевода:'); missing.forEach((k) => console.log('  ' + JSON.stringify(k))); }
if (bare.length) { console.log('\nРусский текст не в _t(...):'); bare.forEach((b) => console.log('  ' + b)); }
console.log(missing.length || bare.length ? '\nесть что исправить' : '\nвсё переведено');
process.exitCode = missing.length || bare.length ? 1 : 0;
