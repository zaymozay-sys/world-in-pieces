"""Склеивает игру в один файл gem-match-preview.html (css, js и картинки внутри) — для просмотра без сервера.
Запуск из папки игры:  python3 tools/bundle.py"""
import re, os, sys, base64, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

# 1. Inline stylesheet
def inline_css(m):
    href = m.group(1)
    css = open(os.path.join(ROOT, href), encoding='utf-8').read()
    return f'<style>{css}</style>'
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)

# 2. Drop manifest/icon links (not needed for preview, avoid 404 noise)
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="icon"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', '', html)

# 3. Inline scripts in order
def inline_js(m):
    src = m.group(1)
    js = open(os.path.join(ROOT, src), encoding='utf-8').read()
    return f'<script>\n{js}\n</script>'
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

# 4. Rewrite art-files.js webp paths -> data URIs. We already inlined art-files.js as JS text with
# `art/xxx/yyy.webp` string literals. Replace those substrings with data URIs directly in the whole doc.
# Только в предпросмотре (лимит 16 МБ): заставка — одна афиша (рыцарь и гном); в игре и в архивах остаются все пять картинок,
# а без части картинок game.js берёт любую доступную афишу. С 1.7.5 осколки анимации в предпросмотре есть (они нужны заставке).
# Крупная иконка приложения в игре не показывается — в предпросмотр не кладём. Графику самой игры ради предпросмотра не ужимаем.
html = re.sub(r'\n?\s*"ui/bg-splash-(?:landscape|portrait|poster-f|poster-m2)": "[^"]+",?', '', html)
# Не показываются в игре: иконка приложения (из неё сделаны icons/), «Корни» (убраны в 1.2.1), свиток-карточка (в игре вместо него CSS-свиток)
html = re.sub(r'\n?\s*"(?:ui/app-icon|spells/ability-roots)": "[^"]+",?', '', html)

# 1.7.7: картинок стало 443, и предпросмотр перестал помещаться в 16 МБ. Только в предпросмотре: фигуры героев в рост для второго и
# третьего уровня одежды не кладём (код берёт ближайшую из имеющихся — Art.bodyKey), остальные крупные картинки сжимаются чуть сильнее.
# В игре и в архивах всё остаётся как есть.
html = re.sub(r'\n?\s*"heroes/[a-z]+-[mf]-body-[23]": "[^"]+",?', '', html)

MIME = {'.webp': 'image/webp', '.png': 'image/png'}
def art_replacer(match):
    path = match.group(0)
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return path
    ext = os.path.splitext(path)[1]
    mime = MIME.get(ext, 'application/octet-stream')
    raw = open(full, 'rb').read()
    # Предпросмотр ограничен 16 МБ: крупные картинки (фоны, герои в рост) ужимаются только в этой сборке,
    # файлы в art/ не меняются.
    if len(raw) > 45_000 and ext == '.webp':
        try:
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(raw))
            lim = 320 if re.match(r'art/(monsters|pets)/', path) else 256 if path.startswith('art/items/') else 640   # только для предпросмотра (лимит 16 МБ); в игре картинки полного размера
            im.thumbnail((lim, lim))
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=55, method=6)
            if buf.tell() < len(raw):
                raw = buf.getvalue()
        except Exception:
            pass
    data = base64.b64encode(raw).decode('ascii')
    return f'data:{mime};base64,{data}'

html = re.sub(r'art/[a-zA-Z0-9_./-]+\.(?:webp|png)', art_replacer, html)

# 1.6.9: в предпросмотре выбрасываем комментарии-строки (лимит 16 МБ); код не меняется
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bundle_strip import strip_html
html = strip_html(html)
# Предпросмотр (лимит 16 МБ): убираем лишние пробелы и переводы строк в коде (esbuild --minify-whitespace; имена и строки не меняются). Графика не затрагивается.
import subprocess, shutil
_esb = '/tmp/A2/esb/node_modules/.bin/esbuild'
if os.path.exists(_esb):
    def _min(m):
        r = subprocess.run([_esb, '--minify-whitespace', '--charset=utf8', '--loader=js'], input=m.group(1).encode(), capture_output=True)
        return '<script>\n' + r.stdout.decode() + '\n</script>' if r.returncode == 0 and r.stdout else m.group(0)
    html = re.sub(r'<script>\n(.*?)\n</script>', _min, html, flags=re.S)

out = os.path.join(ROOT, 'gem-match-preview.html')
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html)/1e6, 'MB')
