// Последовательный запуск всех браузерных (e2e) проверок с итоговой таблицей. Запуск: npm run test:e2e
// Сценарии идут строго по одному (общий localStorage и ресурсы браузера), у каждого свой таймаут и свой журнал в test-results/.
// Параметры: --only=duo,ui (подмножество по именам), --retry-flaky (один повтор для ui150: известный редкий таймаут ожидания .pet-skill).
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const SUITES = [
  ['qa164', 'tests/qa164.e2e.js', 600], ['clean', 'tests/cleanpath.e2e.js', 900], ['audit2', 'tests/audit2.e2e.js', 900], ['duo', 'tests/duo.e2e.js', 600], ['ui', 'tests/ui150.e2e.js', 900], ['map', 'tests/mapphone.e2e.js', 600],
  ['save', 'tests/save.e2e.js', 600], ['elixirs', 'tests/elixirs.e2e.js', 600], ['refit', 'tests/refit.e2e.js', 600],
  ['medals', 'tests/medalstyle.e2e.js', 600], ['world', 'tests/world160.e2e.js', 900],
  ['timer', 'tests/timer165.e2e.js', 600], ['shop', 'tests/shop165.e2e.js', 900], ['duoboard', 'tests/duoboard165.e2e.js', 300], ['duoadopt', 'tests/duoadopt165.e2e.js', 300], ['gear166', 'tests/gear166.e2e.js', 300],   // 1.6.5: таймер хода (настройка) и постоянная Лавка с примеркой
];
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const retry = process.argv.includes('--retry-flaky');
const OUT = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const [name, file, tmo] of SUITES) {
  if (only.length && !only.includes(name)) continue;
  let r, tries = 0;
  do {
    const t0 = Date.now();
    r = spawnSync(process.execPath, [path.join(__dirname, '..', file)], { encoding: 'utf8', timeout: tmo * 1000, cwd: path.join(__dirname, '..') });
    r.sec = Math.round((Date.now() - t0) / 1000); tries++;
    fs.writeFileSync(path.join(OUT, name + '.log'), (r.stdout || '') + (r.stderr || ''));
  } while (r.status !== 0 && retry && name === 'ui' && tries < 2);
  const status = r.status === 0 ? 'PASS' : r.error && r.error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'FAIL';
  rows.push({ name, status, sec: r.sec, tries });
  console.log(`${status.padEnd(8)} ${name.padEnd(9)} ${String(r.sec).padStart(4)} с${tries > 1 ? '  (повтор)' : ''}`);
}
const bad = rows.filter((x) => x.status !== 'PASS');
console.log(`\nИтого: ${rows.length - bad.length} из ${rows.length} прошли. Журналы: test-results/<имя>.log`);
process.exit(bad.length ? 1 : 0);
