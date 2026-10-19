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

## Сервер: облачное сохранение, живые бои, турниры, рейтинг

Игра работает и без сервера. Сервер (папка `server/`) нужен для онлайн-режимов. Ему нужны PostgreSQL и Node.js 22.
Подойдут бесплатные облака: база — Neon, сервер — Render (или любой хостинг с Docker: в `server/` есть `Dockerfile`
и `docker-compose.yml`).

1. Создайте базу PostgreSQL и скопируйте её строку подключения. Храните её только в настройках хостинга.
2. Разверните папку `server/` (Docker или `npm install && npm start`), задайте переменные окружения:
   `DATABASE_URL` (строка базы), `ALLOWED_ORIGINS` (адрес сайта игры, например `https://world-in-pieces.pages.dev`),
   `PLATFORMS=site` (позже добавьте `yandex` и `vk` с ключами `YANDEX_SECRET`, `VK_SECRET`).
3. Миграции применяются сами при первом запуске. Проверка: откройте `https://<адрес сервера>/health` — ответ `{"ok":true}`.
4. Впишите адрес сервера в `js/config.js` (`window.GEM_SERVER = 'https://<адрес сервера>'`) и опубликуйте сайт заново.

Строку подключения, ключи платформ и пароли нельзя выкладывать на GitHub и присылать в чат. Бесплатный сервер Render
засыпает без запросов — первое обращение после паузы занимает около минуты.
