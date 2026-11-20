"""Собирает папку dist/ и архив для загрузки на Cloudflare Pages (перетащить в панель)."""
import os, re, shutil, zipfile, hashlib, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'dist')
shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
for n in ('index.html', 'manifest.webmanifest', 'LICENSE'):
    shutil.copy(os.path.join(ROOT, n), D)
for d in ('js', 'css', 'art', 'icons', 'fonts'):
    shutil.copytree(os.path.join(ROOT, d), os.path.join(D, d))
# 2.3.8: 84 скрипта и 3 стиля склеиваются в по одному файлу с хешем в имени (исходники в репозитории не меняются).
# Порядок подключения сохраняется; сломать глобальные имена склейка не может (скрипты и так обычные, без модулей).
# 2.3.9: код и стили в выкладываемой сборке сжимаются esbuild (npm i — он в devDependencies). Исходники не меняются.
# Имена верхнего уровня esbuild не переименовывает (скрипты обычные, не модули), поэтому глобальные имена целы.
ESB = os.path.join(ROOT, 'node_modules', '.bin', 'esbuild')
def minify(text, loader):
    if not os.path.exists(ESB):
        print('ВНИМАНИЕ: esbuild не установлен (npm i) — сборка без сжатия'); return text
    r = subprocess.run([ESB, '--minify', '--charset=utf8', '--legal-comments=none', '--loader=' + loader], input=text.encode('utf-8'), capture_output=True)
    if r.returncode != 0: raise SystemExit('esbuild: ' + r.stderr.decode('utf-8')[:2000])
    return r.stdout.decode('utf-8')
def write_hashed(data, out_dir, stem, ext):
    h = hashlib.sha1(data.encode('utf-8')).hexdigest()[:10]
    name = f'{out_dir}/{stem}.{h}.{ext}'
    open(os.path.join(D, name), 'w', encoding='utf-8').write(data)
    return name
# 2.3.9: английский словарь (640 КБ) — отдельным файлом, грузится только тем, у кого игра на английском
LAZY_EN = 'js/en.js'
def bundle(html, tag_re, ext, out_dir):
    files = [f for f in re.findall(tag_re, html) if f != LAZY_EN]
    data = minify('\n;\n'.join(open(os.path.join(ROOT, f), encoding='utf-8').read() for f in files), 'js')
    return files, write_hashed(data, out_dir, 'app', ext)
html = open(os.path.join(D, 'index.html'), encoding='utf-8').read()
js_re = r'<script src="(js/[^"]+)"></script>'
files, jsname = bundle(html, js_re, 'js', 'js')
enname = write_hashed(minify(open(os.path.join(ROOT, LAZY_EN), encoding='utf-8').read(), 'js'), 'js', 'en', 'js')
# выбор языка — та же логика, что в js/i18n.js (detect): сохранённый выбор → имя окна → язык браузера
EN_LOADER = ("<script>(function(){var l;try{l=localStorage.getItem('wip-lang')}catch(e){}"
             "if(l!=='ru'&&l!=='en'){var m=/^wip-lang:(ru|en)$/.exec(window.name||'');"
             "l=m?m[1]:(/^(ru|uk|be|kk)/i.test((navigator.languages&&navigator.languages[0])||navigator.language||'ru')?'ru':'en')}"
             "if(l==='en')document.write('<script src=\"%s\"><\\/script>')})()</script>\n  " % enname)
first = True
def sub_js(m):
    global first
    if first: first = False; return EN_LOADER + f'<script src="{jsname}"></script>'
    return ''
html = re.sub(js_re + r'\n?', sub_js, html)
for f in os.listdir(os.path.join(D, 'css')):
    if f.endswith('.css'):
        cp = os.path.join(D, 'css', f); css = minify(open(cp, encoding='utf-8').read(), 'css'); open(cp, 'w', encoding='utf-8').write(css)
# 2.3.8: сервис-воркер (только в выкладываемой сборке): игра и картинки сохраняются на телефоне и открываются без сети.
# index.html всегда берётся из сети первым (чтобы обновления доходили сразу), при отсутствии сети — из сохранённого.
ver = jsname.split('.')[1]
open(os.path.join(D, 'sw.js'), 'w', encoding='utf-8').write('''const V = 'wip-%s';
const SHELL = ['./', '%s', 'css/style.css', 'css/battle-dock.css', 'css/ui-theme.css', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== 'wip-art').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (u.pathname.endsWith('/version.json')) return;                 // 2.5.3: проверка обновления — всегда напрямую из сети
  if (/\\/(art|icons|fonts)\\//.test(u.pathname)) {            // картинки не меняются: сначала сохранённое
    e.respondWith(caches.open('wip-art').then((c) => c.match(r).then((m) => m || fetch(r).then((x) => { if (x.ok) c.put(r, x.clone()); return x; }))));
  } else if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html')) {   // страница: сеть, иначе сохранённая
    e.respondWith(fetch(r).then((x) => { const k = x.clone(); caches.open(V).then((c) => c.put('./', k)); return x; }).catch(() => caches.match('./')));
  } else {                                                          // скрипты и стили с хешем или короткий кеш: сохранённое, иначе сеть
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((x) => { if (x.ok) { const k = x.clone(); caches.open(V).then((c) => c.put(r, k)); } return x; })));
  }
});
''' % (ver, jsname))
# 2.5.3: version.json — по нему js/update.js узнаёт, что вышла новая версия (плашка «Вышло обновление»)
_ver = re.search(r"GAME_VERSION = '([^']+)'", open(os.path.join(ROOT, 'js', 'version.js'), encoding='utf-8').read()).group(1)
open(os.path.join(D, 'version.json'), 'w', encoding='utf-8').write('{"v":"%s"}' % _ver)
html = html.replace('</body>', "<script>if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});</script>\n</body>", 1)
open(os.path.join(D, 'index.html'), 'w', encoding='utf-8').write(html)
for f in os.listdir(os.path.join(D, 'js')):
    if f not in (os.path.basename(jsname), os.path.basename(enname)): os.remove(os.path.join(D, 'js', f))
print('пакет:', jsname, len(files), 'скриптов')
open(os.path.join(D, '_headers'), 'w').write("""/art/*
  Cache-Control: public, max-age=2592000
/icons/*
  Cache-Control: public, max-age=2592000
/js/*
  Cache-Control: public, max-age=31536000, immutable
/css/*
  Cache-Control: public, max-age=300
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
""")
z = os.path.join(ROOT, 'world-in-pieces-site.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for r, _, fs in os.walk(D):
        for f in fs:
            p = os.path.join(r, f); zf.write(p, os.path.relpath(p, D))
print('ok', os.path.getsize(z) // 1024, 'КБ')
