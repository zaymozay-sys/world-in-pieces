# Промты для недостающей графики (1.7.7)

**Обновление 14.10.2026: все восемь картинок получены и подключены, в игре 443 картинки; ниже — промты для истории, заказывать больше ничего не нужно.** Ранее не хватало восьми: `map/tex-sand`, `map/tex-tundra`, `map/tex-badlands`, `map/tex-field`, `map/tex-river` (необязательна), `map/bridge-ne`, `map/ford`, `map/flag-storm`. Описания те же, что в art-prompts-1.7.1 и на странице «Арт-промты «Хрупкого мира»»; здесь они собраны в одном месте. Подключение: назвать файл как в заголовке и запустить `python3 tools/build-art.py <папка>`.

Порядок: пески (340 сот на юге) и поле (80 сот вокруг деревни) самые заметные; мост `bridge-ne` рисовать с эталоном `bridge-se`; брод и флаг можно в конце.

Лишние варианты (снег, серая земля, зелёный мох, два моста) перенесены на Диске в «_варианты (не вошли в игру)».

Каждая картинка — отдельный запрос: сначала текст промта, затем «правила» партии (в конце). Имя файла — как в заголовке.

## Текстуры больших областей: тёмный лес, пепел, снега, пески

### tex-sand.png

Desert sand texture (the south of the map): loose warm sand with fine wind ripples. Base golden sand (#dec077), lighter crests (#f2dc9f), darker hollows (#b9984f). Short scaly ripples running in different directions in small patches (no single direction across the tile), rare darker and lighter grains, tiny pebbles. No dunes at the scale of the frame, no footprints, no cracks of dried clay.

**Правила партии (добавить в конец каждого промта):** Rules for every image above: Square image, 1024x1024. A seamless tileable ground texture that fills the entire frame (no transparency). Strictly orthographic top-down view: no perspective, no horizon, no sky, no cast shadows of objects. Same painterly fantasy realism as the reference sheet (digital oil painting with refined brushwork, like the already finished meadow, lake and swamp textures if I attach them). Soft even diffuse lighting: no directional light, no vignette, no darkened edges, no hot spot in the center, no brightness gradient from corner to corner. The texture is equally dense over the whole frame; the largest element is no bigger than 1/25 of the frame width; no single eye-catching landmark (a big rock, a bright flower, a fresh footprint) that would reveal the repeat when the tile is repeated. The left edge continues seamlessly into the right edge and the top edge into the bottom edge. Draw details slightly larger and in clear brushstrokes rather than dust: the picture will be shrunk about 2.5 times, so anything smaller than 6-8 pixels of the 1024 image turns into noise. No text, letters, figures, buildings, roads, borders, frames or watermarks. Medium saturation, nothing baked in: do not paint night blue, twilight, wet shine or fog, the game adds those by itself.

## Текстуры: тундра, каменистые пески, поля, вода реки

### tex-tundra.png

Tundra texture: frozen brown earth, tufts of stiff dry grass, lichen and patches of half-melted snow. Base grayish olive (#aab694), lighter lichen and frosted grass (#cdd5b6), darker frozen earth and pebbles (#7e8b6e). White snow only as rare small patches and veins, no more than 10% of the frame. Small stones, sedge tufts. Cold diffuse light but no blue night tint: the sky is not reflected, the snow is gray-white and not dazzling.

### tex-badlands.png

Rocky badlands texture: red-orange scorched clay, a cracked crust, rubble and layered fragments. Base terracotta (#b77a4c), lighter dried plates (#d79c6b), darker cracks and rubble (#8a5430). A fine net of cracks (cells about 1/20 of the frame), a rough crust between them and rare small red-gray stones; here and there very thin stripes of multicolored rock layers. No cliffs and no mesas: those are separate sprites.

### tex-field.png

Farmland texture near the village: loosened earth with remains of stubble, WITHOUT furrows. Base warm golden olive (#b8a850), lighter dry clods and straw (#d0c46e), darker hollows between the clods (#8f8036). IMPORTANT: do NOT draw straight rows of furrows. The game adds furrows itself as a separate sprite rotated by 0, 60 and 120 degrees, and furrows already in the texture would overlap with it into a grid. Draw a uniform loose plowed soil: tiny clods, short scraps of straw and stubble pointing in random directions, rare light patches of dried soil. No ears of grain, no flowers, no stones bigger than 1/40 of the frame, no people. The tone is not too bright: roads, furrows and creature tokens must stay readable on it.

### tex-river.png

River water texture (optional): the same calm lake canvas as the lake texture but lighter and livelier. Base transparent blue (#4f93bf), crests whitish blue (#b7e0f3), depth #2a6a9a. Many small riffles and short light highlights, but NO single flow direction: the river strip turns in every direction on the map, and a flow painted along one axis would run sideways on the bends. The rivers are narrow (about 8-16 pixels on the map), so no big waves and no foam.

**Правила партии (добавить в конец каждого промта):** Rules for every image above: Square image, 1024x1024. A seamless tileable ground texture that fills the entire frame (no transparency). Strictly orthographic top-down view: no perspective, no horizon, no sky, no cast shadows of objects. Same painterly fantasy realism as the reference sheet (digital oil painting with refined brushwork, like the already finished meadow, lake and swamp textures if I attach them). Soft even diffuse lighting: no directional light, no vignette, no darkened edges, no hot spot in the center, no brightness gradient from corner to corner. The texture is equally dense over the whole frame; the largest element is no bigger than 1/25 of the frame width; no single eye-catching landmark (a big rock, a bright flower, a fresh footprint) that would reveal the repeat when the tile is repeated. The left edge continues seamlessly into the right edge and the top edge into the bottom edge. Draw details slightly larger and in clear brushstrokes rather than dust: the picture will be shrunk about 2.5 times, so anything smaller than 6-8 pixels of the 1024 image turns into noise. No text, letters, figures, buildings, roads, borders, frames or watermarks. Medium saturation, nothing baked in: do not paint night blue, twilight, wet shine or fog, the game adds those by itself.

## Мост: две диагонали (прикрепите первый мост)

### bridge-ne.png

Use the attached bridge picture (the west-east bridge) as the exact design reference: the same stone, parapets, bollard posts, moss and level of detail. Draw the same bridge running diagonally from the lower-left corner of the frame to the upper-right corner (rising at 60 degrees to the horizontal); its ends touch the lower-left and the upper-right edges of the image. The hump of the bridge faces up and to the left.

**Правила партии (добавить в конец каждого промта):** Rules for every image above: Square image, same painterly fantasy realism and the same bridge as the attached reference. Seen from above and from the side at about 40 degrees. No text, no border, no frame, no watermark, no cast shadow. Transparent background: export as a PNG with a real alpha channel, only the bridge is visible. Do not draw a checkerboard, water, banks, a floor, a backdrop or a glow halo.

## Брод и штормовой флаг мельницы

### ford.png

FLAT ground drawing: a stepping-stone ford. A scatter of five or six flat rounded stepping stones lying in a small group in shallow water, with transparent light ripples around the stones and a few tiny splash circles. Strictly top-down, no outline, the edges dissolve softly into transparency. The stones are gray-beige with a warm light rim (#a9a59d, #b9b5ad, #a29e96), wet and slightly glossy. The group is symmetric in every direction (the game does not rotate it, and the river can flow any way here): it takes about 60% of the frame, centered.

### flag-storm.png

The storm flag of the mill: a tall thin mast of dark wood with a red pennant flying to the right; bright alarming cloth (#d6372b) with a slightly darker red lining and a golden tassel at the tip; a small bundle of rope at the base. The whole flag is inside the frame: the mast base at the bottom center, the pennant at the top right of the mast. Dark brown outline. The sprite is tiny on the map (30x40 pixels), so the silhouette must read as a red flag instantly.

**Правила партии (добавить в конец каждого промта):** Rules for every image above: Square image. Same style as the reference sheet: painterly fantasy realism (digital oil painting with refined brushwork), warm key light from the upper left, cool blue reflections in the shadows, moderate saturation, a clear dark brown outline about 2 px at 1024. A game-map sprite seen from above and from the side at about 40 degrees, like the trees and the buildings of the village. ONE object per image, not a group, centered, fully inside the frame with a margin of about 6%. The sprite is shown at only 20-30 pixels on the map, so the silhouette must be large and clear, with few but contrasting details. Exception: images marked FLAT are drawings lying on the ground: no outline, soft edges that dissolve into transparency, seen from directly above unless the line says otherwise. No text, no letters, no border, no frame, no watermark, no cast shadow, no ground under the object. Transparent background: export as a PNG with a real alpha channel, only the subject is visible, everything around it is fully transparent. Do not draw a checkerboard, a floor, a backdrop or a glow halo around the subject.
