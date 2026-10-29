// Копирует в server/rules те модули игры, по которым сервер проверяет карточки (правила одни и те же, что у клиента).
// Запуск: node tools/sync-rules.js; тест server/tests/cardcheck.test.js следит, чтобы копии не отставали.
const fs = require('fs'), path = require('path');
const FILES = ['i18n.js', 'tiers.js', 'balance.js', 'items.js', 'hero.js', 'forge-data.js', 'forge.js', 'runes.js', 'stones.js'];
const src = path.join(__dirname, '..', 'js'), dst = path.join(__dirname, '..', 'server', 'rules');
fs.mkdirSync(dst, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(src, f), path.join(dst, f));
console.log('скопировано:', FILES.join(', '));
