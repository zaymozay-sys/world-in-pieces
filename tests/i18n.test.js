// Тесты перевода. Запуск: node tests/i18n.test.js
const assert = require('assert');
const fs = require('fs'), path = require('path');
const EN = require('../js/en.js');
const I18N = require('../js/i18n.js');
const cy = /[А-Яа-яЁё]/;

// по умолчанию в тестах — русский, текст возвращается как есть, вставки подставляются
assert.strictEqual(I18N.lang, 'ru');
assert.strictEqual(global._t('Привет, {0}!', ['мир']), 'Привет, мир!');

// каждый _t('…') в коде имеет английский перевод; переводы без русских букв, с теми же {0}, тегами и крайними пробелами
const dir = path.join(__dirname, '..', 'js');
const used = new Set();
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js') || ['en.js', 'i18n.js', 'art-files.js'].includes(f)) continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /_t\(\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    let s; try { s = new Function('return ' + m[1] + m[2].replace(/\$\{/g, '\\${') + m[1])(); } catch (e) { continue; }
    if (cy.test(s)) used.add(s);
  }
}
assert.ok(used.size > 1000, 'в коде найдено много строк для перевода: ' + used.size);
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
const tags = (s) => (s.match(/<\/?[a-z][^>]*>/gi) || []).map((t) => t.replace(/>\s*$/, '>')).length;
for (const k of used) {
  const v = EN[k];
  assert.ok(v !== undefined, 'нет перевода: ' + k.slice(0, 80));
  assert.ok(!cy.test(v), 'в переводе остались русские буквы: ' + v.slice(0, 80));
  assert.strictEqual(ph(v), ph(k), 'не совпадают {0}…: ' + k.slice(0, 60));
  assert.strictEqual(tags(v), tags(k), 'не совпадает число HTML-тегов: ' + k.slice(0, 60));
}

// текст из index.html тоже переведён (русские надписи в разметке)
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
let htmlKeys = 0;
for (const m of html.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g)) { const k = norm(m[1]); assert.ok(EN[k] !== undefined, 'index.html без перевода: ' + k); htmlKeys++; }
for (const m of html.matchAll(/\b(?:title|placeholder|aria-label|alt)="([^"]*[А-Яа-яЁё][^"]*)"/g)) {
  const k = norm(m[1]); if (/ \/ /.test(k) && /Language/.test(k)) continue; assert.ok(EN[k] !== undefined, 'атрибут index.html без перевода: ' + k); htmlKeys++;
}
assert.ok(htmlKeys > 20);
console.log('i18n: строк в коде ' + used.size + ', в разметке ' + htmlKeys + ' — все переведены');
