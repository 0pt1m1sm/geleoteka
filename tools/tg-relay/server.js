/**
 * tg-relay — минимальный прокси к Telegram Bot API, живущий ВНЕ РФ (Railway).
 *
 * Зачем: РКН замедляет трафик Telegram↔РФ, и вызовы api.telegram.org из
 * прод-контейнера Timeweb перемежаются таймаутами. Приложение указывает в
 * настройке TELEGRAM_API_BASE_URL адрес вида
 *   https://<домен-релея>/<RELAY_KEY>
 * и строит запросы как `${base}/bot<token>/<method>` — сюда прилетает
 *   /<RELAY_KEY>/bot<token>/<method>?query
 * Релей отрезает префикс с ключом и пересылает
 *   https://api.telegram.org/bot<token>/<method>?query
 * с теми же методом, заголовками и телом; ответ отдаётся как есть.
 *
 * Безопасность:
 *  - RELAY_KEY — единственная аутентификация: путь без него → 404 без деталей.
 *  - В пути каждого запроса токен бота → НИКАКОГО логирования запросов/URL.
 *    Единственная строка в логе — старт процесса.
 *  - Никаких зависимостей: только node:http и глобальный fetch (Node ≥ 18).
 *
 * Env: PORT (Railway задаёт сам), RELAY_KEY (обязателен),
 *      UPSTREAM_BASE_URL (по умолчанию https://api.telegram.org — override
 *      нужен только для локального смоук-теста), UPSTREAM_TIMEOUT_MS
 *      (по умолчанию 60000 — длинный опрос getUpdates висит до 25 с).
 */

import http from "node:http";

const PORT = Number(process.env.PORT || 3000);
const RELAY_KEY = (process.env.RELAY_KEY || "").trim();
const UPSTREAM = (process.env.UPSTREAM_BASE_URL || "https://api.telegram.org").replace(/\/+$/, "");
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 60_000);

if (!RELAY_KEY || RELAY_KEY.includes("/")) {
  console.error("[tg-relay] RELAY_KEY is missing or contains '/': refusing to start");
  process.exit(1);
}

const PREFIX = `/${RELAY_KEY}/`;

// Hop-by-hop and connection-specific headers must not be forwarded either way.
const DROP_REQUEST_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "content-length", "accept-encoding",
]);
const DROP_RESPONSE_HEADERS = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding",
]);

function relayError(res, status, description) {
  // Same shape as a Telegram error so the adapter's parser stays happy.
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error_code: status, description }));
}

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (!url.startsWith(PREFIX)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const target = UPSTREAM + url.slice(PREFIX.length - 1); // keeps the leading "/"

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (DROP_REQUEST_HEADERS.has(name) || value === undefined) continue;
    headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    relayError(res, 400, "relay: could not read request body");
    return;
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    relayError(res, timedOut ? 504 : 502, timedOut ? "relay: upstream timeout" : "relay: upstream unreachable");
    return;
  }

  const responseHeaders = {};
  for (const [name, value] of upstream.headers) {
    if (!DROP_RESPONSE_HEADERS.has(name)) responseHeaders[name] = value;
  }
  res.writeHead(upstream.status, responseHeaders);

  if (!upstream.body || req.method === "HEAD") {
    res.end();
    return;
  }
  try {
    for await (const chunk of upstream.body) res.write(chunk);
  } catch {
    // Upstream dropped mid-stream; nothing sensible left to send.
  }
  res.end();
});

server.keepAliveTimeout = 65_000;
server.listen(PORT, () => {
  console.log(`[tg-relay] listening on :${PORT}, upstream ${UPSTREAM}, upstream timeout ${UPSTREAM_TIMEOUT_MS}ms`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
