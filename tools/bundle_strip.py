"""Для предпросмотра (лимит 16 МБ): убирает из встроенных скриптов и стилей комментарии-строки целиком.
Файлы игры и архивы не меняются. Код внутри строк и шаблонных литералов не трогается."""
import re


def strip_js(js):
    out, i, n = [], 0, len(js)
    state = None              # None | "'" | '"' | '`' | 'b' (блочный комментарий)
    line_start = True         # только пробелы с начала строки
    line_buf = []             # текущая строка (для решения, оставлять ли)
    drop_line = False
    lines = []
    cur = []
    while i < n:
        ch = js[i]
        nxt = js[i + 1] if i + 1 < n else ''
        if state is None:
            if ch == '\n':
                cur.append(ch); lines.append(''.join(cur)); cur = []; line_start = True; i += 1; continue
            if line_start and ch in ' \t':
                cur.append(ch); i += 1; continue
            if ch == '/' and nxt == '/':
                if line_start:
                    j = js.find('\n', i)
                    j = n if j < 0 else j
                    cur = []                      # вся строка — комментарий: выбрасываем вместе с отступом
                    i = j + 1 if j < n else j
                    line_start = True
                    continue
                j = js.find('\n', i); j = n if j < 0 else j
                cur.append(js[i:j]); i = j; line_start = False; continue   # хвостовой комментарий не трогаем
            if ch == '/' and nxt == '*' and line_start:
                j = js.find('*/', i + 2)
                if j < 0:
                    cur.append(js[i:]); i = n; continue
                k = j + 2
                rest_end = js.find('\n', k); rest_end = n if rest_end < 0 else rest_end
                if js[k:rest_end].strip() == '':   # блок занимает строки целиком
                    cur = []; i = rest_end + 1 if rest_end < n else rest_end; line_start = True; continue
                cur.append(js[i:k]); i = k; line_start = False; continue
            if ch in '\'"`':
                state = ch
            line_start = False
            cur.append(ch); i += 1; continue
        # внутри строки или шаблона
        if ch == '\\':
            cur.append(js[i:i + 2]); i += 2; continue
        if ch == '\n':
            cur.append(ch); lines.append(''.join(cur)); cur = []
            if state in ('\'', '"'):    # одинарная/двойная строка не переносится — сбой разбора, сбрасываем
                state = None; line_start = True
            i += 1; continue
        if ch == state:
            state = None
        cur.append(ch); i += 1
    lines.append(''.join(cur))
    return ''.join(lines)


def strip_css(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def strip_html(html):
    html = re.sub(r'(<script>\n)(.*?)(\n</script>)', lambda m: m.group(1) + strip_js(m.group(2)) + m.group(3), html, flags=re.S)
    html = re.sub(r'(<style>)(.*?)(</style>)', lambda m: m.group(1) + strip_css(m.group(2)) + m.group(3), html, flags=re.S)
    return html
