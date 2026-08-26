# tg-relay — прокси к Telegram Bot API вне РФ

Часть проекта Geleoteka. Крутится на **Railway** (проект `tg-relay`, сервис
`tg-relay`, env `production`), домен `tg-relay-production-013b.up.railway.app`.
Это единственное, что у нас осталось на Railway — **не удалять**: без него
уведомления сотрудников в Telegram из прод-контейнера Timeweb (РФ) перемежаются
таймаутами (РКН). Почему релей и как он используется — `docs/runbooks/staff-notifications.md`.

## Как это работает

Приложение хранит в настройке `TELEGRAM_API_BASE_URL` (админка → интеграции)
адрес `https://<домен-релея>/<RELAY_KEY>` и шлёт `${base}/bot<token>/<method>`.
Релей проверяет префикс `/<RELAY_KEY>/`, отрезает его и пересылает запрос на
`https://api.telegram.org` (метод, заголовки, тело, query — как есть).
Путь без ключа → `404`. `/healthz` → `200 ok` (для healthcheck Railway).

Никаких зависимостей — `node:http` + встроенный `fetch`. Логируется только
строка старта: **в пути каждого запроса токен бота**, поэтому логирование
запросов/URL запрещено и в коде, и в настройках Railway.

## Переменные сервиса (Railway → Variables)

| Переменная | Назначение |
|---|---|
| `RELAY_KEY` | Секретный префикс пути. Обязателен. Тот же, что в `TELEGRAM_API_BASE_URL` приложения. |
| `PORT` | Задаёт Railway. |
| `UPSTREAM_BASE_URL` | Не задавать в бою (по умолчанию `https://api.telegram.org`); нужен только смоук-тесту. |
| `UPSTREAM_TIMEOUT_MS` | По умолчанию 60000 — длинный опрос `getUpdates` висит до 25 с. |

## Доступ и деплой

```bash
railway whoami                                  # аккаунт владельца
railway link -p tg-relay && railway service tg-relay   # привязка каталога (один раз на машину)
railway status / railway variables / railway logs / railway deployment list
```

Деплой — **только из этого каталога**, чтобы в архив не попал весь монорепо:

```bash
cd tools/tg-relay && railway up --service tg-relay
```

Смена `RELAY_KEY` = одновременно поменять `TELEGRAM_API_BASE_URL` в админке.

## История / важное

Боевой инстанс был развёрнут 2026-08-02 командой `railway up` из временного
каталога (`server.js` в скретчпаде сессии), в git исходник тогда не попал.
`server.js` здесь — восстановление по контракту (прогнан локальный смоук-тест:
префикс, pass-through метода/тела/query/статуса, 502 при недоступном апстриме,
отсутствие URL в логах). Перед первым передеплоем с этого исходника стоит
снять оригинал с боевого контейнера и сравнить:

```bash
railway ssh --service tg-relay -- cat /app/server.js
```
