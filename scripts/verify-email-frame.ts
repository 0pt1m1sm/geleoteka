/**
 * Проверяет посадку письма в рамку: высота меряется снаружи, а скрипты внутри
 * по-прежнему не исполняются.
 *
 * Проверка существует потому, что ради автоподбора высоты песочнице выдано
 * allow-same-origin. Это безопасно ровно до тех пор, пока рядом нет
 * allow-scripts — вместе они отдают чужому HTML наш origin. Утверждение
 * «скрипты не выполняются» слишком дорого держать на честном слове, поэтому
 * оно проверяется, а не декларируется.
 *
 * Запуск: npm run verify-email-frame
 */
import { webkit } from "@playwright/test";

const EVIL = `
  <script>window.parent.__PWNED__ = true; document.title = "executed";</script>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
  <p style="height:640px;margin:0">высокое письмо</p>
`;

async function main(): Promise<void> {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = ""): void => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? `: ${detail}` : ""}`);
  };

  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><body style="margin:0">
        <iframe id="f" sandbox="allow-same-origin" scrolling="no"
                style="width:600px;border:0;display:block"
                srcdoc='${EVIL.replace(/'/g, "&apos;")}'></iframe>
      </body></html>`,
      { waitUntil: "load" },
    );
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const f = document.getElementById("f") as HTMLIFrameElement;
      const doc = f.contentDocument;
      return {
        pwned: (window as unknown as { __PWNED__?: boolean }).__PWNED__ === true,
        title: doc?.title ?? null,
        readable: doc !== null,
        scrollHeight: doc?.documentElement.scrollHeight ?? 0,
      };
    });

    check("скрипт письма НЕ выполнился (окно родителя чистое)", result.pwned === false);
    check("скрипт письма НЕ выполнился (свой документ не тронут)", result.title !== "executed");
    check("родитель читает документ письма", result.readable);
    check(
      "высота измерима и соответствует содержимому",
      result.scrollHeight > 600,
      `${result.scrollHeight}px`,
    );
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? "\n✅ ВСЁ СОШЛОСЬ" : `\n❌ ПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
