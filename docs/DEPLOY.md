# Публикация игры на Cloudflare Pages (бесплатно)

1. Зарегистрируйтесь на https://dash.cloudflare.com (почта и пароль, карта не нужна).
2. Слева: **Workers & Pages → Create → Pages → Upload assets**.
3. Название проекта, например `world-in-pieces` → **Create project**.
4. Перетащите в окно архив `world-in-pieces-site.zip` (или распакованную папку) → **Deploy site**.
5. Через минуту появится адрес вида `world-in-pieces.pages.dev`. Его можно отправлять тестерам.

Обновление: **Create deployment** в том же проекте и загрузить новый архив.
Свой домен: вкладка **Custom domains** в проекте.

Для постоянной автоматической публикации: связать проект с GitHub-репозиторием `zaymozay-sys/world-in-pieces`
(Pages → Connect to Git; Build command пустая, Output directory `/`).

## Облачное сохранение (следующий шаг)
1. Зарегистрируйтесь на https://supabase.com, создайте проект.
2. Пришлите мне только **Project URL** и **anon key** (они публичные, пароли не нужны).
3. Я подключу вход и сохранение профиля в таблицу `profiles` и пришлю SQL для создания таблицы.
