/* Параллельный запуск тестов из tools/tests-list.json (2.4.0). Серверные тесты (server/tests) идут по одному: они занимают порты.
   Запуск: node tools/run-tests.js [--jobs=4]. Прежний последовательный запуск: npm run test:serial */
const { spawn } = require('child_process'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..'), list = require('./tests-list.json');
const arg = process.argv.find((a) => a.startsWith('--jobs=')), jobs = Math.max(1, arg ? Number(arg.slice(7)) : Math.min(4, os.cpus().length));
const serial = list.filter((f) => f.startsWith('server/')), par = list.filter((f) => !f.startsWith('server/'));
const failed = [], t0 = Date.now();
const run = (f) => new Promise((res) => {
  let out = ''; const c = spawn(process.execPath, [f], { cwd: root });
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => { if (code) { failed.push(f); console.log('\n=== ПРОВАЛ: ' + f + '\n' + out.slice(-3000)); } res(); });
});
const pool = async (files, n) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < files.length) await run(files[i++]); })); };
(async () => {
  await Promise.all([pool(par, jobs), pool(serial, 1)]);
  console.log(`тестов: ${list.length}, провалов: ${failed.length}, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  if (failed.length) { console.log(failed.join('\n')); process.exit(1); }
})();
