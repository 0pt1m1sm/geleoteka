import "server-only";

/**
 * Троттлинг подбора пароля на входе.
 *
 * Скользящее окно неудачных попыток на идентификатор (email/телефон),
 * в памяти процесса. Прод — один инстанс контейнера, поэтому счётчик общий
 * для всех запросов; при рестарте/деплое он обнуляется — это осознанный
 * компромисс: цель здесь замедлить перебор, а не построить распределённый
 * лимитер (для него нужна таблица в БД). bcrypt cost 12 уже даёт ~0.25с на
 * попытку; окно с блокировкой закрывает автоматизированный перебор.
 *
 * Ключ нормализуется (lower/trim), чтобы обход сменой регистра не работал.
 * Успешный вход счётчик очищает.
 */

export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;

const failures = new Map<string, number[]>();

function normalize(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function prune(times: number[], now: number): number[] {
  const cutoff = now - LOGIN_WINDOW_MS;
  return times.filter((t) => t > cutoff);
}

/** true, если по идентификатору уже накоплен лимит провалов в текущем окне. */
export function isLoginBlocked(identifier: string, now: number = Date.now()): boolean {
  const key = normalize(identifier);
  const times = failures.get(key);
  if (!times) return false;
  const fresh = prune(times, now);
  if (fresh.length === 0) {
    failures.delete(key);
    return false;
  }
  failures.set(key, fresh);
  return fresh.length >= LOGIN_MAX_FAILURES;
}

/** Зафиксировать неудачную попытку входа. */
export function registerFailedLogin(identifier: string, now: number = Date.now()): void {
  const key = normalize(identifier);
  const times = prune(failures.get(key) ?? [], now);
  times.push(now);
  failures.set(key, times);
}

/** Сбросить счётчик после успешного входа. */
export function clearLoginFailures(identifier: string): void {
  failures.delete(normalize(identifier));
}

/** Тестовый сброс общего состояния. */
export function __resetLoginThrottle(): void {
  failures.clear();
}
