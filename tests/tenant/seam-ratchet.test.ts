import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Храповик перевода на шов — в перевёрнутом виде.
 *
 * Пока перевод шёл, здесь лежал список УЖЕ переведённых модулей: добавил файл
 * в список — назад дороги нет. Список дорос до 148 записей и исчерпал себя:
 * его слабость в том, что новый файл с прямым клиентом в него просто не
 * попадает, и защита не срабатывает там, где нужнее всего — на свежем коде.
 *
 * Перевод закончен, и список перевёрнут. Теперь здесь перечислены те немногие
 * места, которым прямой клиент разрешён, а правило звучит наоборот: любой файл
 * в `app/` и `lib/`, берущий клиент напрямую и не названный ниже, роняет тесты.
 * Умолчание для нового кода стало правильным.
 */
const IMPORT_RE = /^import\s+\{[^}]*\bdb\b[^}]*\}\s+from\s+"@\/lib\/db"/m;

/**
 * Прямой клиент разрешён только здесь. Причина обязательна: список короткий
 * ровно потому, что каждая строка в нём — обоснованное исключение, а не
 * недоделка.
 */
const ALLOWED_DIRECT: Readonly<Record<string, string>> = {
  // Вход: пользователя ищут по почте или телефону ДО того, как известен
  // арендатор. Суженный клиент здесь искал бы в арендаторе, которого ещё нет.
  "app/actions/login.ts": "вход — пользователь ищется до известного арендатора",
  "app/actions/register.ts": "регистрация — то же самое",
  "app/actions/request-password-reset.ts": "восстановление пароля — вход по почте",
  "app/actions/confirm-reset-password.ts": "восстановление пароля — подтверждение",
  "lib/oauth-login.ts": "вход через провайдера — тот же случай",

  // Шов не может брать клиент у себя же.
  "lib/tenant/scoped-db.ts": "сам шов",

  // Диагностика обязана видеть соединение как есть: её предмет — то, каким
  // арендатором и какой ролью открыто соединение с базой.
  "app/api/internal/db/tenant-context/route.ts": "диагностика соединения",
};

/** Все .ts/.tsx под app/ и lib/, кроме сгенерированного Prisma-клиента. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (full.includes("app/generated")) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push(relative(process.cwd(), full));
    }
  };
  walk(join(process.cwd(), "app"));
  walk(join(process.cwd(), "lib"));
  return out;
}

describe("прямой клиент базы", () => {
  it("не используется нигде, кроме перечисленных исключений", () => {
    const offenders = sourceFiles().filter(
      (file) => !(file in ALLOWED_DIRECT) && IMPORT_RE.test(readFileSync(file, "utf8")),
    );
    expect(
      offenders,
      `берут клиент базы напрямую вместо шва: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("список исключений не протух", () => {
    // Исключение, которое перестало быть исключением, обязано уйти из списка:
    // иначе он тихо разрешает то, чего давно нет, и перестаёт быть щитом.
    const stale = Object.keys(ALLOWED_DIRECT).filter((file) => {
      let src: string;
      try {
        src = readFileSync(join(process.cwd(), file), "utf8");
      } catch {
        return true; // файла нет вовсе
      }
      return !IMPORT_RE.test(src);
    });
    expect(
      stale,
      `в списке исключений лишние записи (файл исчез или уже на шве): ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
