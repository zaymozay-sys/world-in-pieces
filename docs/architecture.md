# Архитектура «Хрупкого мира»

Этот файл — карта кода для того, кто будет править игру. Подробные правила игры — в `docs/design.md`, баланс — в `docs/balance.md`, история выпусков — в `HANDOFF.md`.

## Как устроена игра

- **Без сборщика и модулей.** `index.html` подключает ~84 обычных скрипта из `js/` по порядку. Каждый файл объявляет на верхнем уровне одно-два глобальных имени (`Profile`, `Combat`, `MapView`…) в виде `const Имя = (() => { … return { … }; })();`. Порядок подключения = порядок зависимостей.
- **Те же файлы работают в Node.** Файлы правил заканчиваются строкой `if (typeof module !== 'undefined') module.exports = …` и подключают соседей через `require`. Поэтому правила проверяются обычными тестами без браузера.
- **Сервер** (`server/`) использует копии правил из `server/rules/`. После правки `js/` (i18n, tiers, balance, items, hero, forge-data, forge, runes, stones) выполните `node tools/sync-rules.js`.

## Слои (сверху вниз — от данных к экрану)

| Слой | Файлы | Что можно |
|---|---|---|
| Данные | `en.js`, `forge-data.js`, `art-files.js`, `gems.js`, `version.js` | Только таблицы. Никакой логики. |
| Правила | `tiers`, `balance`, `hero`, `items`, `combat`, `bestiary`, `medals`, `forge`, `runes`, `stones`, `elixirs`, `world`, `hexmap`, `engine`, `ai` | Чистые функции: вход → выход. Не трогают страницу и хранилище. Обязательно с тестом в `tests/`. |
| Состояние | `inventory.js` (`Profile`) | Единственное место, где читается и пишется сохранение. Все изменения прогресса — через методы `Profile`. |
| Экран | `mapview.js` (карта), `settings.js` (настройки игрока), `game.js` (бой), `duo.js` (бой вдвоём), `boot.js` (запуск), `screens.js` (окна), `tutorial.js`, `herocard.js` | Рисуют и слушают нажатия. Правила сами не считают — вызывают слой правил. |
| Сеть | `net.js`, `live.js`, `tourney.js`, `telemetry.js`, `funnel.js` | Игра обязана работать и без сети: любой вызов в `try/catch`. |

Правило зависимостей: нижний слой не знает о верхнем. Если правилу нужен экран — значит, логику надо разделить.

## Команды

| Команда | Что делает |
|---|---|
| `npm i` | Ставит инструменты разработчика (esbuild, eslint, playwright). Игре в браузере они не нужны. |
| `npm test` | Синтаксис, линтер, все тесты правил. Должно проходить перед каждым выпуском. |
| `npm run lint` | Только линтер (с предупреждениями о неиспользуемых именах). |
| `node tests/<имя>.e2e.js` | Сценарий в настоящем браузере. `WIP_URL=file://…/dist/index.html` — прогон по собранной папке. |
| `python3 tools/dist.py` | Сборка `dist/` и `world-in-pieces-site.zip`: склейка и сжатие кода и стилей, английский словарь отдельным файлом. |
| `node tools/perf-runtime.js` | Занятость процессора при запуске и в покое по экранам, число узлов, вес картинок. |
| `node tools/perf-profile.js boot\|idle\|pan <адрес>` | Какие функции и анимации занимают процессор. |
| `node tools/visual-diff.js <до> <после>` | Попиксельное сравнение 15 экранов двух сборок. |
| `node tools/audit-anim.js` | Бесконечные анимации тяжёлых свойств. |
| `node tools/perf-baseline.js` | Замер загрузки на «медленном телефоне» (нужен сервер: `cd dist && python3 -m http.server 8000`). |
| `node tools/balance.js` | Прогон баланса боёв. |
| `node tools/sync-rules.js` | Копирует правила на сервер. |
| `node tools/modmap.js` | Печатает таблицу модулей из конца этого файла. |

## Правила производительности (каждое — из реального замера)

1. **Никаких `:has()` на `body`, `html` и других больших контейнерах.** Правило `body:has(.coach…)` заставляло браузер пересчитывать стили всех ~30 тысяч элементов карты при любой вставке узла (9 секунд на телефоне при запуске). Нужен признак «на странице есть X» — ставьте класс на `body` из кода (`body.coach-on`).
2. **Карта — самое тяжёлое место.** Слои карты разложены на лоскуты (`g.ck`), лоскуты вне экрана скрыты (`cull`). Украшения создаются только у открытых земель (`syncDeco`). Новые слои карты делайте так же.
3. **Не заменяйте `innerHTML` у `<defs>` и больших слоёв без нужды.** Замена рисунка в `<defs>` пересобирает все его копии (`<use>`). Для точечного обновления есть `setDefs`.
4. **Не удаляйте узлы карты поштучно во время анимации** — скрывайте (`display: none`), как сделано с туманом (`lift`).
5. **Тяжёлые данные — отдельным файлом по требованию.** Английский словарь грузится только английским игрокам (см. `tools/dist.py`).
6. **Картинки не пережимаются.** Скорость добывается кодом, а не качеством графики.

7. **Бесконечная анимация меняет только `transform` и `opacity`.** Их ведёт видеокарта. Пульсация `box-shadow`, `filter`, `left`, `width` заставляет браузер перерисовывать окно на процессоре каждый кадр: из-за мерцания значков 8–10 цвета Стена доблести в покое занимала 97% процессора. Приём: слабое состояние — неподвижный стиль самого элемента, сильное — на `::before`, у которого плавно меняется прозрачность. Проверяет `tests/anim.test.js` (список исключений с объяснениями — в `tools/audit-anim.js`).
8. **Картинки карты подключаются по мере открытия земель** (`syncDefs` в `js/mapview.js`): текстуры местности и здания под туманом не скачиваются и не занимают память, пока игрок до них не дошёл. Берутся открытые клетки и два кольца вокруг — туман на границе полупрозрачен.
9. **Не измеряйте страницу в обработчике движения.** `getBoundingClientRect()` сразу после изменения страницы заставляет браузер немедленно всё пересчитать. Размеры поля карты запоминаются (`view()`), сбрасываются при изменении окна и в начале жеста.
10. **Не ищите по всему документу в частых обработчиках.** В бою на странице больше 25 тысяч узлов. Для «есть ли на странице X» годится живой список `getElementsByClassName`.

## Как проверить, что оптимизация ничего не испортила

1. `npm test` — правила, линтер, анимации.
2. **Картинка «до» и «после»** — `tools/visual-diff.js`: открывает 15 экранов на телефоне и компьютере в двух сборках и считает отличающиеся точки (случайность и время зафиксированы). Старая сборка берётся через `git worktree add <папка> <коммит>`; обе раздаются `python3 -m http.server`. `PHASE=0.5` сравнивает середину анимаций (пик мерцаний).
3. **Скорость** — `tools/perf-runtime.js`: занятость процессора при запуске и в покое, число пересчётов стилей и раскладки, число узлов, вес скачанных картинок. `tools/perf-baseline.js` — загрузка по медленной сети.
4. Сценарии в браузере: `node tests/<имя>.e2e.js`.

Замеры выпуска 2.3.9 (процессор замедлен в 4 раза):

| Что | Было | Стало |
|---|---|---|
| Стена доблести в покое, занятость процессора | 97% | 4% |
| Картинки карты на старте новой игры | ~4,9 МБ (98 файлов) | ~3,4 МБ (73 файла) |
| Перетаскивание карты: принудительные замеры страницы | 444 мс за жест | 13 мс |
| Карта в покое (компьютер) | ~80% | 0–5% |

## Правила надёжности

- **Сохранение:** только через `Profile`. Новое поле — со значением по умолчанию в `fresh()` и проверкой в `sanitize()`/`migrate()`, чтобы старые сохранения открывались.
- **Любой необязательный вызов** (сеть, звук, статистика, реклама) — в `try/catch` с комментарием, почему ошибка не страшна.
- **Новая строка для игрока** — через `_t("…")` и с переводом в `js/en.js` (проверяет `tests/i18n.test.js`).
- **Любое изменение — с тестом.** Правило → тест в Node; экран → e2e или хотя бы проверка в `tools/smoke.js`.

## Куда расти (известный технический долг)

- `js/game.js` (≈390 КБ), `js/screens.js` (≈390 КБ), `js/mapview.js` (≈210 КБ) — слишком большие файлы. Делить их стоит по одному окну/подсистеме за раз, каждый раз с прогоном e2e; «большой взрыв» здесь опасен.
  - `js/game.js`: почти весь файл (≈4800 строк) — тело одной функции `createBattle(host)`; общие переменные боя живут в её замыкании, поэтому разрезать файл по разделам механически нельзя. Путь: сначала вынести то, что не трогает состояние боя (рисование аватаров, журнал, таймер, подсказки) в отдельные файлы с явными параметрами, затем состояние собрать в один объект `B` и передавать его.
  - `js/screens.js`: одно замыкание `Screens`; окна выносить по одному, передавая общие помощники (`modal`, `head`, `esc`, `money`) через объект.
- `css/style.css` (≈360 КБ): при запуске используется меньше 10% правил. Кандидаты на вынос в отдельные файлы — стили окон, которые открываются редко.
- Часть e2e-сценариев устарела и падает не из-за ошибок игры (например, `tests/mapphone.e2e.js`, `tests/ui150.e2e.js`). Их нужно обновить или удалить.

## Карта модулей

Порядок — как в `index.html`. «Зависит от» — к именам каких файлов обращается код.

| № | Файл | КБ | Объявляет | Зависит от |
|---|---|---|---|---|
| 1 | `js/en.js` | 487 |  |  |
| 2 | `js/i18n.js` | 4 |  |  |
| 3 | `js/version.js` | 0 | GAME_VERSION, GAME_UPDATED |  |
| 4 | `js/config.js` | 0 |  |  |
| 5 | `js/gems.js` | 24 | GEM_TYPES, GEM_NAMES, GEM_SVG |  |
| 6 | `js/art-files.js` | 45 | ART_FILES |  |
| 7 | `js/art.js` | 7 | Art | gems, art-files, items |
| 8 | `js/battlerand.js` | 1 | BattleRand |  |
| 9 | `js/live.js` | 4 | Live |  |
| 10 | `js/tourney.js` | 6 | Tourney | live |
| 11 | `js/engine.js` | 11 | Engine |  |
| 12 | `js/ai.js` | 14 | AI | engine, balance, game |
| 13 | `js/sound.js` | 4 | Sound |  |
| 14 | `js/tiers.js` | 6 | Tiers |  |
| 15 | `js/balance.js` | 22 | GAME_LENGTH, Balance |  |
| 16 | `js/hero.js` | 5 | H_T, H_B, Hero | tiers, balance, inventory |
| 17 | `js/names.js` | 2 | Names |  |
| 18 | `js/factions.js` | 5 | Factions | tiers, balance, game |
| 19 | `js/items.js` | 50 | T, Gear | tiers, balance, hero, forge |
| 20 | `js/runes.js` | 8 | Runes | tiers, items, stones |
| 21 | `js/talents.js` | 2 | Talents | balance, hero |
| 22 | `js/combat.js` | 40 | C_B, C_G, Combat | battlerand, balance, items |
| 23 | `js/bestiary.js` | 50 | B_T, B_G, B_B, Bestiary | tiers, balance, items |
| 24 | `js/parts.js` | 59 | Parts | items |
| 25 | `js/figures.js` | 34 | Figures | items, parts |
| 26 | `js/story.js` | 6 | ST_T, B_S_econ, CK_S, Story | tiers, balance |
| 27 | `js/hexmap.js` | 57 | HM_S, HexMap | story |
| 28 | `js/forge-data.js` | 298 | ForgeData |  |
| 29 | `js/forge.js` | 11 | F_T, F_G, F_B, F_H, F_D, Forge | tiers, items, bestiary, hexmap, forge-data |
| 30 | `js/world.js` | 23 | W_HM, W_T, CT_W, CK_W, World | tiers, balance, hexmap |
| 31 | `js/siege.js` | 6 | Siege |  |
| 32 | `js/bank.js` | 4 | Bank |  |
| 33 | `js/lhgames.js` | 25 | LHGames | engine |
| 34 | `js/dungeon.js` | 2 | Dungeon |  |
| 35 | `js/chronicle.js` | 3 | Chron |  |
| 36 | `js/herocard.js` | 3 | HeroCard | lhgames, rarehunt |
| 37 | `js/petdiary.js` | 3 | PetDiary |  |
| 38 | `js/run.js` | 3 | Run |  |
| 39 | `js/rarehunt.js` | 2 | RareHunt |  |
| 40 | `js/puzzle.js` | 4 | Puzzle | lhgames |
| 41 | `js/lessons.js` | 5 | Lessons | engine |
| 42 | `js/streak.js` | 3 | Streak |  |
| 43 | `js/growth.js` | 2 | Growth |  |
| 44 | `js/trophy.js` | 3 | Trophy | growth |
| 45 | `js/chess.js` | 18 | Chess |  |
| 46 | `js/tips.js` | 4 | Tips, EmptyArt |  |
| 47 | `js/funnel.js` | 2 | Funnel |  |
| 48 | `js/trader.js` | 3 | Trader |  |
| 49 | `js/crafts.js` | 3 | Crafts |  |
| 50 | `js/decor.js` | 4 | Decor |  |
| 51 | `js/gifts.js` | 4 | Gifts |  |
| 52 | `js/spark.js` | 5 | Spark | hero, inventory |
| 53 | `js/mail.js` | 5 | Mail |  |
| 54 | `js/events.js` | 2 | Events |  |
| 55 | `js/compass.js` | 3 | Compass |  |
| 56 | `js/stones.js` | 6 | S_T, Stones | tiers |
| 57 | `js/net.js` | 15 | Net |  |
| 58 | `js/duel.js` | 4 | Duel | hero, items, hexmap |
| 59 | `js/sky.js` | 11 | Sky |  |
| 60 | `js/mapart.js` | 38 | MapArt |  |
| 61 | `js/monsterart.js` | 47 | MonsterArt | tiers |
| 62 | `js/itemicons.js` | 4 | ItemIcons | items, parts, figures |
| 63 | `js/medals.js` | 29 | ME_B, ME_G, ME_X, Medals | tiers, items, bestiary, elixirs |
| 64 | `js/elixirs.js` | 15 | Elixirs | tiers, balance, items |
| 65 | `js/pets.js` | 28 | PT_B, PT_T, PT_G, Pets | tiers, items, bestiary |
| 66 | `js/ammo.js` | 10 | Ammo | balance |
| 67 | `js/market.js` | 4 | MK_G, MK_B, Market | items, bestiary |
| 68 | `js/village.js` | 14 | VG_T, Village | tiers, balance, medals |
| 69 | `js/saveguard.js` | 17 | SG_G, SG_B, SG_T, SG_E, SG_A, SG_R, … | tiers, items, runes, bestiary, bank, lhgames, puzzle, lessons, streak, chess, trader, crafts, decor, mail, …(19) |
| 70 | `js/inventory.js` | 121 | I_PT, Profile, ResInfo, ItemInfo, Inventory, BagDrag | tiers, balance, hero, factions, items, runes, talents, combat, bestiary, figures, chronicle, petdiary, funnel, decor, …(29) |
| 71 | `js/quests.js` | 14 | Q_H, Quests | hero, items, inventory |
| 72 | `js/unlocks.js` | 5 | Unlocks | hero, hexmap |
| 73 | `js/daily.js` | 7 | D_G, D_B, D_H, Daily | hero, items, bestiary, inventory |
| 74 | `js/focus.js` | 4 | ModalFocus |  |
| 75 | `js/wiki.js` | 58 | Wiki | tourney, tiers, balance, hero, factions, items, runes, talents, bestiary, story, hexmap, forge, world, siege, …(38) |
| 76 | `js/whatsnew.js` | 14 | Whatsnew |  |
| 77 | `js/screens.js` | 337 | Screens | version, gems, live, tourney, tiers, balance, hero, names, factions, items, runes, combat, bestiary, figures, …(56) |
| 78 | `js/mapview.js` | 189 | MapView | version, sound, tiers, balance, hero, factions, items, runes, combat, bestiary, figures, story, hexmap, world, …(41) |
| 79 | `js/tutorial.js` | 18 | Tutorial | version, gems, engine, tips, inventory, unlocks, screens, mapview, game |
| 80 | `js/battlelog.js` | 5 | BattleLog |  |
| 81 | `js/telemetry.js` | 10 | Telemetry | version, hero, inventory, battlelog |
| 82 | `js/splashfx.js` | 7 | SplashFx |  |
| 83 | `js/settings.js` | 6 | RULES, AnimSpeed, TextSize, TurnTimerSetting, AdPause |  |
| 84 | `js/game.js` | 277 | N, ONYX, MAGIC_TYPES, PET, HINT_WINS, LIVE, … | gems, battlerand, engine, sound, tiers, balance, hero, factions, items, runes, combat, bestiary, figures, story, …(36) |
| 85 | `js/duo.js` | 28 | Duo | gems, battlerand, sound, tiers, hero, items, bestiary, story, pets, inventory, tutorial, game |
| 86 | `js/boot.js` | 21 |  | live, tourney, hero, factions, items, world, streak, duel, village, inventory, daily, screens, mapview, tutorial, …(16) |
| 87 | `js/devjump.js` | 5 | DevJump | hero, bestiary, story, pets, inventory, screens, mapview |
