// Текст боевого кода одним куском. С 2.3.9 бывший js/game.js разделён на settings.js (настройки), game.js (бой),
// duo.js (бой вдвоём) и boot.js (запуск): тесты, которые ищут в коде конкретные строки, читают все четыре файла разом.
const fs = require('fs'), path = require('path');
const FILES = ['settings.js', 'game.js', 'duo.js', 'boot.js'];
module.exports = { FILES, text: () => FILES.map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n') };
