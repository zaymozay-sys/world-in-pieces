# Промты: здания под единый угол

Нужно выровнять угол обзора у зданий, которые выбиваются из ряда. Цвета крыш не меняются.

Общий стиль: тёплая рукописная живопись, мягкие тени, без текста и цифр. Эталон угла и масштаба прикладывайте к каждому сообщению: `art/map/forge.webp` (так же стоят ратуша, мастерская художника, лавка, библиотека, дом).
Конец каждого сообщения: `Rules: transparent background (real alpha channel), no text, no numbers, no frame, no watermark, no checkerboard, one object centered with a 6% margin, same style as the attached reference.`

## 1. Единый угол (вставлять во все промты зданий)

`Camera: the same 3/4 isometric view as the attached reference building (forge) — seen from the front-left, slightly above (about 30 degrees), the front wall faces the lower left and the right side wall is visible, the door is on the front wall, the roof ridge runs from the upper left to the lower right. The ground under the building is a small irregular diamond-shaped patch of earth and grass with a soft shadow. Do not rotate the building, do not look straight at the facade, do not look from above. Scale: the building fills about 85% of the 256x256 square.`

## 2. Какие здания выбиваются из ряда

Проверено по всем картинкам `art/map/` рядом с эталоном.

| Файл | Что не так | Приоритет |
|---|---|---|
| `junker` (хижина старьёвщика) | вид прямо в фасад, без угла и без пятна земли под зданием | высокий |
| `mill` (мельница) | боковая проекция прямо, ровно, без ромба земли | высокий |
| `altar` (алтарь воскрешения) | вид прямо в арку, ступени фронтально | высокий |
| `jeweler` (ювелирная лавка) | фасад почти фронтально, конёк идёт слева направо, крупнее остальных | высокий |
| `arena` | камера слишком высоко, почти сверху | средний |
| `kennel` (питомник) | камера слишком высоко, здание плоское | средний |
| `site2` (стройка) | камера выше эталона | низкий |

Остальные (ратуша, кузница, мастерская, алхимик, лавка, банк, почта, таверна, библиотека, охотничий дом, сторожка, дом) стоят достаточно ровно. Маяк — башня, ему угол не нужен.

## 3. Промты

Для каждого здания прикладывайте текущую картинку («что исправить») и кузницу («эталон угла»), затем текст. Пишите: `Redraw the first building keeping its design, but in the camera of the second reference.`

1. **map/junker** — `A ramshackle junk dealer's hut, a lopsided plank-and-beam shack with a patched shingle roof, a crooked chimney pipe, a canvas awning over a counter piled with barrels, a cart wheel, rusty pots, a shield, a sign with crossed tools, a heavy wooden door on the front wall, junk heaped around. Warm brown wood, faded canvas, rusty iron.` + камера из п. 1.
2. **map/mill** — `A village windmill: a round stone base with a conical wooden cap, four big lattice sails with cream cloth, a small wooden door at the foot, sacks of flour and a hand cart by the wall, a wooden porch step. Weathered wood, gray stone, cream cloth.` + камера из п. 1 (мельница стоит в той же 3/4 проекции, лопасти повёрнуты к зрителю под углом, не плоско).
3. **map/altar** — `A resurrection altar: a ring of three stone steps, a stone altar table, an ancient stone arch with a soft golden glowing sun-sigil hanging in it, small glowing teal runes on the steps, moss and tiny white flowers between the stones. Gray stone, gold glow, teal runes.` + камера из п. 1 (арка стоит наискосок, видны два её столба и боковая грань).
4. **map/jeweler** — `A small stone-and-timber jeweler's shop with a red clay-tile roof, a magpie sitting on the roof ridge, a round-arched door on the front wall, a bay shop window glowing warm gold with scattered colored gems and a blue velvet awning, a sign shaped like a cut blue gem, a stone chimney, flower boxes. Red tiles, warm stone, blue accents.` + камера из п. 1, дом по размеру как кузница, не крупнее.
5. **map/arena** — `A small village arena: an oval ring of stone and timber stands with red banners and a crimson cloth awning, an arched gate in the front wall, a sand floor visible over the near wall, weapon racks by the gate. Cream stone, red cloth, sand.` + камера из п. 1 (ниже, чем сейчас: стены не просматриваются сверху, видна наружная стена и край арены).
6. **map/kennel** — `A cozy pet kennel: a low timber house with a moss-green roof, a fenced yard in front, two small doghouses, a food bowl, a rope toy, a hay pile, a hanging wooden sign with a paw. Green moss, warm wood, hay yellow.` + камера из п. 1.
7. **map/site2** — `A building site: scaffolding around a stone foundation, stacks of stone blocks, sacks, a hand cart, a ladder, a red pennant, a teal tarp on the scaffold, a sign with an hourglass icon. Pale stone, honey wood, teal cloth.` + камера из п. 1.

Партии: 1 — junker, mill, altar, jeweler (высокий приоритет); 2 — arena, kennel, site2.

## Что ещё нарисовано и добавлено в 2.0.6

Фигурки существ на карте (все существующие виды), пояса, камни 1–10, печать, камень стража, стрелки, путевой дневник, рамка-канат, фоны ювелира и торговца, портреты сороки и торговца, стройка. Остаётся для этапа C: фигурки и портреты четырёх новых существ и иконки трёх ресурсов (уже лежат в `art/`).
