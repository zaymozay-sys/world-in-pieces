# Выпадение материалов и вещей 2.5.6

[Скрипт](https://github.com/zaymozay-sys/world-in-pieces/blob/qa/progression-stress-256/tools/qa-drops-256.js) и [прогон](https://github.com/zaymozay-sys/world-in-pieces/actions/runs/45985557601). 100 000 обычных побед, 10 000 на цвет, равномерное распределение доступных обычных видов, фракции поровну. Это не реальная частота встреч на карте; не включены элита, боссы, редкость появления, ночные бонусы.

| Цвет | Обычных видов | Ресурсов за победу | Шанс вещи | Эпическая вещь |
|---|---:|---:|---:|---:|
| 1 | 15 | 1.80 | 20.61% | 0.66% |
| 2 | 26 | 1.80 | 20.73% | 0.64% |
| 3 | 34 | 1.80 | 19.35% | 0.61% |
| 4 | 37 | 1.89 | 20.04% | 0.71% |
| 5 | 35 | 2.07 | 19.82% | 0.56% |
| 6 | 31 | 2.17 | 19.94% | 0.62% |
| 7 | 27 | 2.31 | 20.13% | 0.67% |
| 8 | 21 | 2.40 | 20.41% | 0.63% |
| 9 | 17 | 2.49 | 19.41% | 0.67% |
| 10 | 13 | 2.31 | 19.98% | 0.60% |

Среднее: 2,10 ресурса, вещь 20,04% за победу (обычная 12,85%, редкая 6,56%, эпическая 0,64%). На цветах 2–10 примерно 30% выпавших вещей предыдущего цвета.

Ни один проверенный рецепт не остался вообще без источника. 8 глубинных материалов намеренно привязаны к подземелью на цветах 8–10; не предлагается переносить их на поверхность. Но перо на 10-м цвете доступно только через редкого грифона. Это затрагивает 54 проверенных обычных рецепта и отдельное зелье рикошета. Контрольная симуляция, где орёл доступен на цветах 5–10 вместо 5–9, устраняет оба исключения (перо/эликсир), оставляя глубинные материалы прежними; ожидаемая добыча 1,8 пера за победу над орлом. Изменение пока не внесено в игру.

## Подробности
```json
[
  {
    "t": 8,
    "kind": "nugget",
    "count": 32,
    "max": 13,
    "examples": [
      "craft:crown-sword",
      "upgrade:crown-sword",
      "craft:berserk-axe"
    ],
    "reason": "only special source",
    "sources": [
      "nuggetmole"
    ]
  },
  {
    "t": 8,
    "kind": "mica",
    "count": 118,
    "max": 20,
    "examples": [
      "upgrade:crown-sword",
      "craft:crown-head",
      "upgrade:crown-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "micabeetle"
    ]
  },
  {
    "t": 8,
    "kind": "granite",
    "count": 23,
    "max": 5,
    "examples": [
      "craft:crown-shield",
      "craft:crown-chest",
      "craft:guard-legs"
    ],
    "reason": "only special source",
    "sources": [
      "granitespirit"
    ]
  },
  {
    "t": 8,
    "kind": "graphite",
    "count": 45,
    "max": 19,
    "examples": [
      "craft:crown-amulet",
      "craft:mage-amulet",
      "craft:wand-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "graphitegolem"
    ]
  },
  {
    "t": 8,
    "kind": "malachite",
    "count": 10,
    "max": 17,
    "examples": [
      "upgrade:crown-amulet",
      "craft:berserk-amulet",
      "upgrade:compass-brass"
    ],
    "reason": "only special source",
    "sources": [
      "malachitelizard"
    ]
  },
  {
    "t": 8,
    "kind": "fluorite",
    "count": 6,
    "max": 14,
    "examples": [
      "craft:berserk-amulet",
      "craft:mage-amulet",
      "upgrade:amulet-copper"
    ],
    "reason": "only special source",
    "sources": [
      "fluoritefly"
    ]
  },
  {
    "t": 8,
    "kind": "selenite",
    "count": 11,
    "max": 20,
    "examples": [
      "upgrade:berserk-amulet",
      "craft:mage-amulet",
      "craft:wand-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "selenebat"
    ]
  },
  {
    "t": 8,
    "kind": "quartz",
    "count": 8,
    "max": 16,
    "examples": [
      "craft:mage-arms",
      "upgrade:mage-amulet",
      "craft:hammer"
    ],
    "reason": "only special source",
    "sources": [
      "quartzspider"
    ]
  },
  {
    "t": 9,
    "kind": "nugget",
    "count": 32,
    "max": 13,
    "examples": [
      "craft:crown-sword",
      "upgrade:crown-sword",
      "craft:berserk-axe"
    ],
    "reason": "only special source",
    "sources": [
      "nuggetmole"
    ]
  },
  {
    "t": 9,
    "kind": "mica",
    "count": 118,
    "max": 20,
    "examples": [
      "upgrade:crown-sword",
      "craft:crown-head",
      "upgrade:crown-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "micabeetle"
    ]
  },
  {
    "t": 9,
    "kind": "granite",
    "count": 23,
    "max": 5,
    "examples": [
      "craft:crown-shield",
      "craft:crown-chest",
      "craft:guard-legs"
    ],
    "reason": "only special source",
    "sources": [
      "granitespirit"
    ]
  },
  {
    "t": 9,
    "kind": "graphite",
    "count": 45,
    "max": 19,
    "examples": [
      "craft:crown-amulet",
      "craft:mage-amulet",
      "craft:wand-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "graphitegolem"
    ]
  },
  {
    "t": 9,
    "kind": "malachite",
    "count": 10,
    "max": 17,
    "examples": [
      "upgrade:crown-amulet",
      "craft:berserk-amulet",
      "upgrade:compass-brass"
    ],
    "reason": "only special source",
    "sources": [
      "malachitelizard"
    ]
  },
  {
    "t": 9,
    "kind": "fluorite",
    "count": 6,
    "max": 14,
    "examples": [
      "craft:berserk-amulet",
      "craft:mage-amulet",
      "upgrade:amulet-copper"
    ],
    "reason": "only special source",
    "sources": [
      "fluoritefly"
    ]
  },
  {
    "t": 9,
    "kind": "selenite",
    "count": 11,
    "max": 20,
    "examples": [
      "upgrade:berserk-amulet",
      "craft:mage-amulet",
      "craft:wand-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "selenebat"
    ]
  },
  {
    "t": 9,
    "kind": "quartz",
    "count": 8,
    "max": 16,
    "examples": [
      "craft:mage-arms",
      "upgrade:mage-amulet",
      "craft:hammer"
    ],
    "reason": "only special source",
    "sources": [
      "quartzspider"
    ]
  },
  {
    "t": 10,
    "kind": "nugget",
    "count": 17,
    "max": 3,
    "examples": [
      "craft:crown-sword",
      "craft:berserk-axe",
      "craft:berserk-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "nuggetmole"
    ]
  },
  {
    "t": 10,
    "kind": "feather",
    "count": 54,
    "max": 10,
    "examples": [
      "craft:crown-sword",
      "craft:crown-shield",
      "craft:crown-chest"
    ],
    "reason": "only special source",
    "sources": [
      "griffin"
    ]
  },
  {
    "t": 10,
    "kind": "granite",
    "count": 23,
    "max": 5,
    "examples": [
      "craft:crown-shield",
      "craft:crown-chest",
      "craft:guard-legs"
    ],
    "reason": "only special source",
    "sources": [
      "granitespirit"
    ]
  },
  {
    "t": 10,
    "kind": "mica",
    "count": 59,
    "max": 4,
    "examples": [
      "craft:crown-head",
      "craft:guard-head",
      "craft:guard-arms"
    ],
    "reason": "only special source",
    "sources": [
      "micabeetle"
    ]
  },
  {
    "t": 10,
    "kind": "graphite",
    "count": 27,
    "max": 5,
    "examples": [
      "craft:crown-amulet",
      "craft:mage-amulet",
      "craft:wand-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "graphitegolem"
    ]
  },
  {
    "t": 10,
    "kind": "malachite",
    "count": 5,
    "max": 3,
    "examples": [
      "craft:berserk-amulet",
      "craft:compass-star",
      "craft:moon-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "malachitelizard"
    ]
  },
  {
    "t": 10,
    "kind": "fluorite",
    "count": 2,
    "max": 2,
    "examples": [
      "craft:berserk-amulet",
      "craft:mage-amulet"
    ],
    "reason": "only special source",
    "sources": [
      "fluoritefly"
    ]
  },
  {
    "t": 10,
    "kind": "quartz",
    "count": 5,
    "max": 2,
    "examples": [
      "craft:mage-arms",
      "craft:hammer",
      "craft:swift-feather"
    ],
    "reason": "only special source",
    "sources": [
      "quartzspider"
    ]
  },
  {
    "t": 10,
    "kind": "selenite",
    "count": 7,
    "max": 2,
    "examples": [
      "craft:mage-amulet",
      "craft:wand-amulet",
      "craft:bag-bandolier"
    ],
    "reason": "only special source",
    "sources": [
      "selenebat"
    ]
  },
  {
    "t": 10,
    "type": "elixir",
    "kind": "ricochet",
    "reason": "only special sources",
    "opts": [
      "feather"
    ]
  }
]
```
