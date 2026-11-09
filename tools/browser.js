/* Общий запуск браузера для e2e-тестов и инструментов (1.6.4, WIP-08).
   Порядок: переменная CHROMIUM (путь к исполняемому файлу) → /opt/pw-browsers/chromium (облачная среда) →
   браузер, установленный самим Playwright (`npx playwright install chromium`). Возвращает Promise<Browser>.
   Другие движки для проверки: BROWSER=firefox|webkit. */
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { console.error('Нет пакета playwright. Установка: npm install && npx playwright install chromium'); process.exit(2); }
// 2.2.9: раскладка боя на телефоне — «новая» или «прежняя». Старые браузерные проверки писались под прежнюю (кнопки внизу), поэтому
// по умолчанию контекст открывается с раскладкой «old»; проверка новой раскладки задаёт DOCK=new (так делает qa164).
const withDock = async (b) => {
  const mode = () => process.env.DOCK || 'old';
  const nc = b.newContext.bind(b);
  b.newContext = async (o) => {
    const c = await nc(o);
    await c.addInitScript((m) => { try { if (!localStorage.getItem('wip-battle-dock')) localStorage.setItem('wip-battle-dock', m); } catch (e) { /* без хранилища */ } }, mode());
    return c;
  };
  b.newPage = async (o) => (await b.newContext(o)).newPage();
  return b;
};
module.exports = {
  playwright: pw,
  launch(opts = {}) {
    const name = process.env.BROWSER || 'chromium';
    const type = pw[name];
    if (name !== 'chromium') return type.launch(opts).then(withDock);
    const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
    return type.launch(exe ? { ...opts, executablePath: exe } : opts).then(withDock);
  },
};
