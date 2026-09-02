import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

/**
 * Адрес НАСТОЯЩЕЙ базы для тестов, которым нужна живая база.
 *
 * Обычные тесты работают с подставным клиентом, и `vitest.config.ts` нарочно
 * подсовывает им заведомо неподключаемый адрес — чтобы забытый запрос падал
 * сразу, а не ходил в чужую базу. Поэтому живые тесты берут адрес отдельно:
 *
 *   1. `TEST_DATABASE_URL` — так его передаёт CI, где база поднимается сервисом;
 *   2. `.env` разработчика — так это работает на машине.
 *
 * Если ни того, ни другого нет, тест обязан упасть с внятным текстом, а не
 * молча пропуститься: пропущенный тест изоляции хуже отсутствующего, потому
 * что создаёт ощущение проверки.
 */
export function liveDatabaseUrl(): string {
  const fromEnv = process.env.TEST_DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  const envFile = resolve(process.cwd(), ".env");
  if (existsSync(envFile)) {
    const parsed = parse(readFileSync(envFile));
    if (parsed.DATABASE_URL) return parsed.DATABASE_URL;
  }

  throw new Error(
    "Живой базы нет: задайте TEST_DATABASE_URL (так делает CI) или DATABASE_URL в .env (так на машине разработчика)",
  );
}
