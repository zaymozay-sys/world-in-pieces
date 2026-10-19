/* Версия игры и дата обновления — показываются мелкой надписью в меню карты (☰). При каждом релизе менять обе строки
   вместе с "version" в package.json (tests/version.test.js следит, чтобы номера совпадали). */
const GAME_VERSION = '1.9.6';
const GAME_UPDATED = '20.10.2026';
if (typeof module !== 'undefined' && module.exports) module.exports = { GAME_VERSION, GAME_UPDATED };
