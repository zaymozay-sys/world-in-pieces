// Проверка кода линтером (eslint.config.js): опечатки в именах, дубли ключей, недостижимый код. Запуск: node tests/lint.test.js
// Если eslint не установлен (не выполнен npm i), проверка пропускается с предупреждением — остальные тесты не блокируются.
const cp = require('child_process'), fs = require('fs'), path = require('path');
const bin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
if (!fs.existsSync(bin)) { console.log('lint: eslint не установлен (npm i) — проверка пропущена'); process.exit(0); }
const r = cp.spawnSync(bin, ['js', '--quiet'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', shell: process.platform === 'win32' });
if (r.status !== 0) { console.error(r.stdout || r.stderr); console.error('lint: есть ошибки'); process.exit(1); }
console.log('lint: ошибок нет');
