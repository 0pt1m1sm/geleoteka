import Link from "next/link";

/**
 * Одна строка списка писем.
 *
 * Раскладка: слева тема и начало текста — то, по чему письмо узнают; справа
 * время и ящик; снизу отдельной полосой служебное — направление, вложения,
 * домен отправителя.
 *
 * Раньше слева стоял адрес отправителя, а тема шла второй строкой мелким
 * серым. В списке из десяти писем от разных людей ищут глазами ТЕМУ, а адрес
 * нужен реже — и уж точно не первым.
 *
 * Разметка одна на обе вкладки: очередь разбора и полный архив показывают одно
 * и то же, только берут из разных таблиц. До этого markup был скопирован
 * дважды и уже начал расходиться.
 */

export interface InboxCardProps {
  /** Куда ведёт строка. Null — письмо, которое пока некуда открыть. */
  href: string | null;
  subject: string | null;
  /** Начало текста письма — то, что видно, не открывая. */
  preview: string | null;
  outbound: boolean;
  /** Собеседник: отправитель для входящего, адресат для исходящего. */
  party: string;
  time: string;
  /** Ящик или папка, куда легло письмо. */
  folder: string | null;
  attachments: number;
  /** Метки состояния: «в разборе», «синхр. позже» и подобные. */
  marks?: string[];
  /** Меню действий. Встаёт в один ряд с метками — см. комментарий у разметки. */
  actions?: React.ReactNode;
}

/** Домен отправителя — заготовка под репутацию: по нему её и считают. */
function domainOf(party: string): string | null {
  const at = party.lastIndexOf("@");
  if (at === -1) return null;
  return party.slice(at + 1).replace(/>$/, "").trim() || null;
}

const CHIP =
  "shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-muted)]";

export function InboxCard(props: InboxCardProps): React.ReactElement {
  const { href, subject, preview, outbound, party, time, folder, attachments, marks, actions } =
    props;
  const domain = domainOf(party);

  const body = (
    <div className="px-4 py-3">
      {/* Строками, а не двумя колонками.
          Колонки висели каждая на своей сетке: слева тема кеглем крупнее,
          справа время мелким — и первые строки не совпадали по базовой линии.
          В строке с общей базовой линией совпадение получается само. */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium truncate min-w-0">{subject || "(без темы)"}</div>
        <div className="shrink-0 text-xs text-[var(--foreground-muted)]">{time}</div>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs text-[var(--foreground-muted)] truncate min-w-0">{party}</div>
        {folder ? (
          <div className="shrink-0 text-xs text-[var(--foreground-muted)] truncate max-w-[10rem]">
            {folder}
          </div>
        ) : null}
      </div>

      {/* Две строки предпросмотра: одна почти ничего не говорит, три превращают
          список в чтение. Многоточие ставит сам line-clamp — своё добавлять не
          надо, иначе оно повисает отдельной строкой. */}
      {preview ? (
        <p className="mt-1 text-sm text-[var(--foreground-muted)] line-clamp-2 break-words">
          {preview}
        </p>
      ) : null}

      {/* Служебная полоса. Направление здесь, а не у темы: оно уточняет письмо,
          а не называет его.

          Меню действий стоит в этой же строке, справа. Оно относится к письму
          целиком, но зрительно принадлежит служебной полосе — и метки, и «что с
          этим письмом сделать» это одна мысль. Отдельной строкой ниже кнопка
          висела сама по себе и растягивала карточку впустую.

          Метки — вложенный контейнер с flex-1: переносятся внутри себя, а
          кнопка остаётся на своей строке и никогда не срывается вниз. */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          <span
            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--background-secondary)] text-[var(--foreground-muted)]"
            title={outbound ? "Исходящее (от менеджера)" : "Входящее"}
          >
            {outbound ? "→ ИСХ" : "← ВХ"}
          </span>
          {attachments > 0 ? <span className={CHIP}>📎 {attachments}</span> : null}
          {domain ? (
            // Репутации пока нет — показываем домен, по которому её будут считать.
            <span className={CHIP} title="Домен отправителя">
              {domain}
            </span>
          ) : null}
          {marks?.map((m) => (
            <span key={m} className={CHIP}>
              {m}
            </span>
          ))}
        </div>
        {actions ? (
          // z-10 поднимает кнопку над накладкой-ссылкой (см. ниже), иначе
          // нажатие на неё открывало бы письмо.
          <div className="shrink-0 relative z-10">{actions}</div>
        ) : null}
      </div>
    </div>
  );

  if (!href) return <div className="block">{body}</div>;

  // Ссылка — прозрачная накладка поверх строки, а не обёртка вокруг неё.
  //
  // Обёртка не годится: кнопка действий оказалась бы ВНУТРИ ссылки — это и
  // невалидная разметка, и нажатие на неё уводило бы в письмо. Раньше кнопку
  // приходилось выносить наружу, отдельной строкой снизу, — отсюда и разнобой
  // уровней.
  //
  // Накладка кликабельна целиком, как и раньше, но подсветку наведения несёт
  // контейнер: будь она на самой накладке, фон лёг бы ПОВЕРХ текста.
  return (
    <div className="relative row-clickable">
      {body}
      <Link href={href} className="absolute inset-0" aria-label={subject || "Открыть письмо"} />
    </div>
  );
}
