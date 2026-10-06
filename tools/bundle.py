"""Склеивает игру в один файл gem-match-preview.html (css, js и картинки внутри) — для просмотра без сервера.
Запуск из папки игры:  python3 tools/bundle.py"""
import re, os, base64, json

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
    if len(raw) > 90_000 and ext == '.webp':
        try:
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(raw))
            lim = 480 if re.match(r'art/(monsters|pets)/', path) else 900   # новые рисунки существ — 768 px; для предпросмотра хватает 480
            im.thumbnail((lim, lim))
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=68, method=6)
            if buf.tell() < len(raw):
                raw = buf.getvalue()
        except Exception:
            pass
    data = base64.b64encode(raw).decode('ascii')
    return f'data:{mime};base64,{data}'

html = re.sub(r'art/[a-zA-Z0-9_./-]+\.(?:webp|png)', art_replacer, html)

out = os.path.join(ROOT, 'gem-match-preview.html')
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html)/1e6, 'MB')
