import "server-only";

import { SlidingWindow } from "@/lib/rate-limit";

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

// Механика окна вынесена в lib/rate-limit.ts, чтобы её можно было
// переиспользовать (Story 6 требовала троттлинг для публичной формы, а
// «образца» в проекте не было). Поведение и публичный интерфейс здесь не
// менялись: те же ключ, окно и лимит.
const window = new SlidingWindow(LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);

function normalize(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/** true, если по идентификатору уже накоплен лимит провалов в текущем окне. */
export function isLoginBlocked(identifier: string, now: number = Date.now()): boolean {
  return window.isBlocked(normalize(identifier), now);
}

/** Зафиксировать неудачную попытку входа. */
export function registerFailedLogin(identifier: string, now: number = Date.now()): void {
  window.register(normalize(identifier), now);
}

/** Сбросить счётчик после успешного входа. */
export function clearLoginFailures(identifier: string): void {
  window.clear(normalize(identifier));
}

/** Тестовый сброс общего состояния. */
export function __resetLoginThrottle(): void {
  window.reset();
}
