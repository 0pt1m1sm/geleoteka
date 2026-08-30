// Реверс-прокси Telegram Bot API для Geleoteka.
//
// Схема: приложение ставит TELEGRAM_API_BASE_URL = https://<домен>/<RELAY_KEY>
// и шлёт обычные пути Bot API поверх этого базового адреса:
//   POST https://<домен>/<RELAY_KEY>/bot<token>/getUpdates
// Релей проверяет секретный префикс, срезает его и проксирует остаток на
// https://api.telegram.org без изменений.
//
// Свойства, ради которых он написан руками, а не взят готовым:
//  - НИКАКОГО логирования URL и тел: в пути каждого запроса — токен бота.
//  - Секретный префикс: без него любой знающий домен мог бы гонять свои
//    запросы к Bot API через наш выход.
//  - Long poll до ~30с проходит насквозь (таймаутов не ставим).
const http = require("node:http");

const RELAY_KEY = process.env.RELAY_KEY || "";
const UPSTREAM = "https://api.telegram.org";

if (!RELAY_KEY) {
  console.error("RELAY_KEY is required");
  process.exit(1);
}

const PREFIX = `/${RELAY_KEY}/`;

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.url.startsWith(PREFIX)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const upstreamUrl = UPSTREAM + req.url.slice(PREFIX.length - 1);

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);

    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
      },
      body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "content-type":
        upstream.headers.get("content-type") || "application/json",
    });
    res.end(body);
  } catch {
    // Без деталей: любая деталь здесь потенциально содержит URL с токеном.
    res.writeHead(502);
    res.end();
  }
});

server.listen(process.env.PORT || 3000);
