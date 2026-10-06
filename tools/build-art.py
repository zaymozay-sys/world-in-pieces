#!/usr/bin/env python3
"""Подготовка графики для игры.

Берёт картинки из ChatGPT (любые имена, PNG), узнаёт их по имени файла из спецификации (docs/art-spec.md),
уменьшает, сжимает в WebP и раскладывает по папке art/. Затем пишет js/art-files.js — список того, что есть:
игра рисует новую графику там, где файл найден, и по-старому там, где его нет.

Запуск:  python3 tools/build-art.py <папка с картинками> [--game <папка игры>]
Нужны Pillow и scipy (для нарезки листа камней).
"""
import argparse, json, os, re, sys
from PIL import Image
import numpy as np
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# Что и как ужимать: (макс. сторона, обрезать поля, качество WebP)
RULES = {
    'heroes-portrait': dict(size=384, trim=False),
    'heroes-body': dict(size=720, trim=False),
    'monsters': dict(size=384, trim=True),
    'pets': dict(size=384, trim=True),
    'gems': dict(size=128, trim=True),
    'items': dict(size=192, trim=True),
    'spells': dict(size=128, trim=True),
    'resources': dict(size=128, trim=True),
    'ui-emblem': dict(size=96, trim=True),
    'ui-coin': dict(size=64, trim=True),
    'map-sprite': dict(size=256, trim=True),
    'texture': dict(size=512, trim=False),
    'background': dict(size=1280, trim=False),
    'ui-piece': dict(size=768, trim=False, crop=True),   # свиток, рамки, печать: сохраняем пропорции
}
TEXTURES = ('board', 'tex-', 'panel')
BACKGROUNDS = ('bg-', 'app-icon')


def spec_files():
    """Все пути из спецификации: art/gems/ruby.png и т. д."""
    path = os.path.join(ROOT, 'docs', 'art-spec.md')
    return re.findall(r'`(art/[^`]+\.png)`', open(path, encoding='utf-8').read())


def rule_for(rel):
    name = os.path.basename(rel)
    if name.startswith(('card-', 'hero-panel', 'slot-frame', 'parchment')):
        return RULES['ui-piece']
    if name.startswith(TEXTURES) or name == 'board.png':
        return RULES['texture']
    if name.startswith(BACKGROUNDS):
        return RULES['background']
    if rel.startswith('art/heroes/'):
        return RULES['heroes-body'] if '-body-' in name else RULES['heroes-portrait']
    if rel.startswith('art/monsters/'): return RULES['monsters']
    if rel.startswith('art/pets/'): return RULES['pets']
    if rel.startswith('art/gems/'): return RULES['gems']
    if rel.startswith('art/items/'): return RULES['items']
    if rel.startswith('art/spells/'): return RULES['spells']
    if rel.startswith('art/resources/') or rel.startswith('art/runes/'): return RULES['resources']
    if name.startswith('emblem-'): return RULES['ui-emblem']
    if name.startswith('coin-'): return RULES['ui-coin']
    if rel.startswith('art/map/'): return RULES['map-sprite']
    return RULES['map-sprite']


def trim_square(im, pad=0.04):
    a = np.array(im.getchannel('A'))
    ys, xs = np.where(a > 24)
    if not len(xs): return im
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    im = im.crop(box)
    s = max(im.size); m = int(s * pad)
    out = Image.new('RGBA', (s + 2 * m, s + 2 * m), (0, 0, 0, 0))
    out.paste(im, ((s + 2 * m - im.width) // 2, (s + 2 * m - im.height) // 2))
    return out


def shrink(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def save(im, rel, game, quality=88):
    out = os.path.join(game, os.path.splitext(rel)[0] + '.webp')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if im.mode == 'RGBA':
        im.save(out, 'WEBP', quality=quality, method=6, alpha_quality=95)
    else:
        im.convert('RGB').save(out, 'WEBP', quality=quality, method=6)
    return out


def cut_gems(im, game, report):
    """Лист из четырёх камней слева направо: сапфир, рубин, изумруд, обсидиан."""
    a = np.array(im.getchannel('A')) > 24
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=6))
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    idx = [i + 1 for i in np.argsort(sizes)[::-1][:4]]
    objs = ndimage.find_objects(lab)
    boxes = sorted((objs[i - 1] for i in idx), key=lambda s: s[1].start)
    if len(boxes) < 4:
        report.append('  ! на листе камней найдено меньше 4 камней')
        return []
    made = []
    for name, (sy, sx) in zip(['sapphire', 'ruby', 'emerald', 'onyx'], boxes):
        g = trim_square(im.crop((sx.start, sy.start, sx.stop, sy.stop)), pad=0.06)
        made.append(save(shrink(g, RULES['gems']['size']), f'art/gems/{name}.png', game))
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--game', default=ROOT)
    a = ap.parse_args()
    game = os.path.abspath(a.game)
    spec = {os.path.basename(p): p for p in spec_files()}
    report, done = [], []
    # длинные имена первыми, чтобы «gems-sheet.png» не съел «sheet»
    keys = sorted(spec, key=len, reverse=True)
    for fn in sorted(os.listdir(a.src)):
        if not fn.lower().endswith('.png'):
            continue
        low = fn.lower()
        key = next((k for k in keys if low.endswith(k.lower())), None)
        if not key:
            report.append(f'  ? не узнал: {fn}')
            continue
        rel = spec[key]
        if key == 'style-reference.png':
            report.append(f'  · {fn}: эталон стиля, в игре не нужен')
            continue
        im = Image.open(os.path.join(a.src, fn)).convert('RGBA')
        if key == 'gems-sheet.png':
            made = cut_gems(im, game, report)
            report.append(f'  ✓ {fn}: нарезано камней — {len(made)}')
            done += made
            continue
        rule = rule_for(rel)
        if rule.get('crop'):
            al = np.array(im.getchannel('A')); ys, xs = np.where(al > 24)
            if len(xs): im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        if rule['trim']: im = trim_square(im)
        opaque = np.array(im.getchannel('A')).min() > 250
        out = save(shrink(im, rule['size']), rel, game)
        report.append(f'  ✓ {fn} → {os.path.relpath(out, game)} ({os.path.getsize(out) // 1024} КБ){"  ! нет прозрачности" if opaque and rel.startswith(("art/heroes", "art/monsters", "art/items")) else ""}')
        done.append(out)

    # манифест: ключ «heroes/dwarf-portrait» → путь к файлу
    files = {}
    for root, _, names in os.walk(os.path.join(game, 'art')):
        for n in names:
            if n.endswith('.webp'):
                p = os.path.join(root, n)
                key = os.path.relpath(p, os.path.join(game, 'art')).replace('\\', '/')[:-5]
                files[key] = 'art/' + key + '.webp'
    js = ('/* Список графики, которая есть в папке art/ (создаётся tools/build-art.py). */\n'
          'const ART_FILES = ' + json.dumps(dict(sorted(files.items())), ensure_ascii=False, indent=1) + ';\n')
    with open(os.path.join(game, 'js', 'art-files.js'), 'w', encoding='utf-8') as f:
        f.write(js)
    print('\n'.join(report))
    print(f'Всего в игре: {len(files)} картинок')


if __name__ == '__main__':
    main()
