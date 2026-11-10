/* Версия игры и дата обновления — показываются мелкой надписью в меню карты (☰). При каждом релизе менять обе строки
   вместе с "version" в package.json (tests/version.test.js следит, чтобы номера совпадали). */
const GAME_VERSION = '2.3.4';
const GAME_UPDATED = '10.11.2026';
if (typeof module !== 'undefined' && module.exports) module.exports = { GAME_VERSION, GAME_UPDATED };
