/* Общий запуск браузера для e2e-тестов и инструментов (1.6.4, WIP-08).
   Порядок: переменная CHROMIUM (путь к исполняемому файлу) → /opt/pw-browsers/chromium (облачная среда) →
   браузер, установленный самим Playwright (`npx playwright install chromium`). Возвращает Promise<Browser>.
   Другие движки для проверки: BROWSER=firefox|webkit. */
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { console.error('Нет пакета playwright. Установка: npm install && npx playwright install chromium'); process.exit(2); }
module.exports = {
  playwright: pw,
  launch(opts = {}) {
    const name = process.env.BROWSER || 'chromium';
    const type = pw[name];
    if (name !== 'chromium') return type.launch(opts);
    const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
    return type.launch(exe ? { ...opts, executablePath: exe } : opts);
  },
};
