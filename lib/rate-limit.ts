import "server-only";

/**
 * Скользящее окно попыток в памяти процесса.
 *
 * Вынесено из `lib/login-rate-limit.ts`, где эта механика жила с самого начала:
 * постановка Story 6 требовала «троттлинг по образцу существующих публичных
 * форм», а образца в проекте не было — единственный лимитер завязан на вход, и
 * исполнитель, честно пошедший «по образцу», скопировал бы пустоту.
 *
 * ОГРАНИЧЕНИЕ, которое переносится сюда вместе с механикой и не должно
 * потеряться: счётчик живёт в памяти процесса. Прод — один контейнер, поэтому
 * он общий для всех запросов, но при рестарте и при каждом деплое обнуляется.
 * Цель — замедлить автоматику, а не построить распределённый лимитер; для него
 * нужна таблица в БД. Знать это важно: после деплоя окно пустое.
 */
/**
 * Сколько ключей терпим до уборки. Записи выбывают лениво — только когда по
 * ключу снова спросили. При вращении ключей второго обращения не бывает, и
 * карта росла бы вечно: тридцать запросов с одной машины оставляли тридцать
 * записей (найдено ревью PR #110). Сама по себе это медленная утечка, но ключ
 * задаётся снаружи, так что мять его дёшево.
 */
const SWEEP_AT = 1000;

export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Выбросить ключи, у которых окно опустело. */
  private sweep(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) {
        this.hits.delete(key);
      }
    }
  }

  private fresh(key: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff);
  }

  /** Достигнут ли лимит по ключу в текущем окне. */
  isBlocked(key: string, now: number = Date.now()): boolean {
    const times = this.fresh(key, now);
    if (times.length === 0) {
      this.hits.delete(key);
      return false;
    }
    this.hits.set(key, times);
    return times.length >= this.limit;
  }

  /** Засчитать попытку. */
  register(key: string, now: number = Date.now()): void {
    // Уборка ДО вставки: иначе на пороге карта разрасталась бы на один ключ
    // сверх лимита при каждом обращении.
    if (this.hits.size >= SWEEP_AT) this.sweep(now);
    const times = this.fresh(key, now);
    times.push(now);
    this.hits.set(key, times);
  }

  /** Сколько ключей сейчас в памяти — для тестов и диагностики. */
  size(): number {
    return this.hits.size;
  }

  /** Сбросить счётчик по ключу (например, после успешного входа). */
  clear(key: string): void {
    this.hits.delete(key);
  }

  /** Полный сброс — только для тестов. */
  reset(): void {
    this.hits.clear();
  }
}

/**
 * Заявки «сообщить о поступлении» — по IP.
 *
 * Пять за десять минут: обычный человек оставляет одну-две заявки подряд,
 * когда ищет несколько деталей на свою машину, а пятая с одного адреса уже
 * говорит о переборе. Ключ — IP, потому что контакт в такой форме
 * произвольный и меняется бесплатно.
 */
export const PART_REQUEST_LIMIT = 5;
export const PART_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const partRequestThrottle = new SlidingWindow(PART_REQUEST_LIMIT, PART_REQUEST_WINDOW_MS);
