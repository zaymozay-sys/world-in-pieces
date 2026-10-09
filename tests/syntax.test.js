// Каждый скрипт игры должен разбираться без ошибок (игра грузит их как обычные скрипты — одна опечатка ломает всё).
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'js');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'pipe' }); }
  catch (e) { throw new Error('синтаксическая ошибка в js/' + f + ': ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ')); }
}
console.log('syntax: все скрипты разбираются');
