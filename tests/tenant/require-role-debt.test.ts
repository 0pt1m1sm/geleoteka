import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Храповик долга `requireRole`.
 *
 * Проверка прав ролью — то, что мультиарендность обязана убрать: роль живёт в
 * токене, а на платформе право зависит от арендатора и может быть отозвано
 * между двумя запросами. Замена на каталог разрешений идёт постепенно, и
 * единственное, что здесь по-настоящему опасно, — рост долга: пока старый
 * способ разрешён, новый код пишется по образцу соседнего.
 *
 * Поэтому число зафиксировано. Уменьшать его можно и нужно; увеличивать —
 * нельзя. Если тест упал на росте, новую точку входа надо писать через
 * `requirePermission` из `lib/authz.ts`, а не через роль.
 *
 * Снижая долг, обновите число здесь же — тогда планка опускается и обратно
 * не поднимется.
 */
const CEILING = 209;

function countRequireRoleCallSites(): number {
  // grep возвращает 1, когда совпадений нет: для нас это не ошибка, а ноль.
  const out = execFileSync(
    "bash",
    [
      "-lc",
      `grep -rn 'requireRole(' --include='*.ts' --include='*.tsx' app lib | grep -v 'lib/auth.ts' | wc -l`,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return Number(out.trim());
}

describe("долг проверок по роли", () => {
  it("не растёт", () => {
    const actual = countRequireRoleCallSites();
    expect(
      actual,
      `Мест с requireRole стало ${actual} вместо ${CEILING}. Новые точки входа — через requirePermission (lib/authz.ts): роль живёт в токене и не знает про арендатора.`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("планка не оторвана от действительности", () => {
    // Если долг упал заметно ниже планки, её пора опустить — иначе храповик
    // перестаёт держать.
    const actual = countRequireRoleCallSites();
    expect(
      CEILING - actual,
      `Долг ${actual}, планка ${CEILING} — опустите планку в этом тесте до текущего числа.`,
    ).toBeLessThanOrEqual(15);
  });
});
