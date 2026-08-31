import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Контракт индикатора ожидания.
 *
 * Первая версия возвращала `null`, пока переход не начался, — то есть элемент
 * ПОЯВЛЯЛСЯ в момент клика и толкал соседей. Документация Next называет это
 * прямым анти-паттерном («Inline indicators can easily introduce layout
 * shifts. Prefer a fixed-size, always-rendered hint element and toggle its
 * opacity»), а в карточке каталога сдвиг был бы заметен: длинное название от
 * лишнего элемента получает перенос строки и растягивает всю строку сетки.
 *
 * Рендерить React здесь нечем (окружение vitest — node, jsdom не подключён),
 * поэтому компонент вызывается как функция и проверяется возвращённый элемент.
 * Этого достаточно: вопрос ровно в том, ЧТО он возвращает в каждом состоянии.
 */

const pending = { value: false };
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: pending.value }) }));

async function render(isPending: boolean) {
  pending.value = isPending;
  vi.resetModules();
  const { LinkPending } = await import("@/components/shared/LinkPending");
  return LinkPending() as unknown as { props: Record<string, unknown> } | null;
}

/** Свойства отрисованного элемента. Падает, если элемента нет вовсе — иначе
 *  проверки ниже проходили бы «мимо» на `undefined?.props` и молчали как раз
 *  тогда, когда индикатор исчез из разметки. */
async function props(isPending: boolean): Promise<Record<string, unknown>> {
  const el = await render(isPending);
  if (el === null) throw new Error("индикатор не отрисован — вёрстка сдвинется при клике");
  return el.props;
}

describe("LinkPending", () => {
  beforeEach(() => {
    pending.value = false;
  });

  it("до клика элемент ВСЁ РАВНО в разметке — иначе клик двигает вёрстку", async () => {
    const el = await render(false);
    expect(el).not.toBeNull();
    expect(el?.props.className).toBe("link-pending-hint");
  });

  it("до клика он невидим: признака ожидания нет", async () => {
    // Видимость переключает CSS по data-атрибуту, а не наличие узла.
    expect((await props(false))["data-pending"]).toBeUndefined();
  });

  it("во время перехода поднимает признак, по которому CSS его показывает", async () => {
    expect((await props(true))["data-pending"]).toBe("true");
  });

  it("для скринридера скрыт: это украшение, а не сообщение", async () => {
    // aria-label попал бы в доступное имя ссылки и мусорил бы его: вместо
    // «Запчасти» пользователь слышал бы «Запчасти, Загрузка».
    const p = await props(true);
    expect(p["aria-hidden"]).toBe("true");
    expect(p["aria-label"]).toBeUndefined();
    expect(p.role).toBeUndefined();
  });
});
