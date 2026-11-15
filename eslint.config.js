// Проверка кода: npm run lint. Ловит опечатки в именах (обращение к несуществующему), дубли ключей, недостижимый код.
// Игра собрана из обычных скриптов (не модулей): каждый файл js/*.js объявляет глобальные имена на верхнем уровне,
// поэтому список «известных» имён собирается автоматически из самих файлов.
const fs = require('fs'), path = require('path'), globals = require('globals');
const own = { _t: 'readonly', _n: 'readonly', _nn: 'readonly', TourneyClient: 'readonly', claimLiveRewards: 'readonly', claimSeasonRewards: 'readonly' };   // перевод — js/i18n.js; остальные три появляются только при игре по сети (js/game.js кладёт их в window)   // функции перевода объявляет js/i18n.js
for (const f of fs.readdirSync(path.join(__dirname, 'js'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');
  for (const m of src.matchAll(/^(?:const|let|var|(?:async\s+)?function|class)\s+([A-Za-z_$][\w$]*)/gm)) own[m[1]] = 'writable';
  for (const m of src.matchAll(/^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*[^;\n]*?,\s*([A-Za-z_$][\w$]*)\s*=/gm)) own[m[1]] = 'writable';
  for (const m of src.matchAll(/(?:window|globalThis|g|root)\.([A-Z][\w$]*)\s*=/g)) own[m[1]] = 'writable';
}
module.exports = [
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...globals.node, ...own } },
    rules: {
      'no-undef': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error',
      'no-func-assign': 'error', 'no-import-assign': 'error', 'no-self-assign': 'error', 'no-unsafe-negation': 'error', 'use-isnan': 'error',
      'valid-typeof': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-cond-assign': ['error', 'except-parens'],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-redeclare': 'off',
    },
  },
];
