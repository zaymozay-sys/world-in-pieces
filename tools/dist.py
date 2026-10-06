"""Собирает папку dist/ и архив для загрузки на Cloudflare Pages (перетащить в панель)."""
import os, shutil, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'dist')
shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
for n in ('index.html', 'manifest.webmanifest', 'LICENSE'):
    shutil.copy(os.path.join(ROOT, n), D)
for d in ('js', 'css', 'art', 'icons'):
    shutil.copytree(os.path.join(ROOT, d), os.path.join(D, d))
open(os.path.join(D, '_headers'), 'w').write("""/art/*
  Cache-Control: public, max-age=2592000
/icons/*
  Cache-Control: public, max-age=2592000
/js/*
  Cache-Control: public, max-age=300
/css/*
  Cache-Control: public, max-age=300
/index.html
  Cache-Control: no-cache
""")
z = os.path.join(ROOT, 'world-in-pieces-site.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for r, _, fs in os.walk(D):
        for f in fs:
            p = os.path.join(r, f); zf.write(p, os.path.relpath(p, D))
print('ok', os.path.getsize(z) // 1024, 'КБ')
