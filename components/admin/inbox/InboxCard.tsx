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
  const { href, subject, preview, outbound, party, time, folder, attachments, marks } = props;
  const domain = domainOf(party);

  const body = (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{subject || "(без темы)"}</div>
          {/* Собеседник сразу под темой, а не в правой колонке: тема и «от кого»
              читаются одним движением глаз, а справа остаётся только служебное —
              когда и куда пришло. */}
          <div className="text-xs text-[var(--foreground-muted)] truncate">{party}</div>
          {/* Две строки предпросмотра: одна почти ничего не говорит, три
              превращают список в чтение. */}
          {preview ? (
            <p className="mt-0.5 text-sm text-[var(--foreground-muted)] line-clamp-2 break-words">
              {preview}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-right text-xs text-[var(--foreground-muted)]">
          <div>{time}</div>
          {folder ? <div className="mt-0.5 truncate max-w-[9rem]">{folder}</div> : null}
        </div>
      </div>

      {/* Служебная полоса. Направление здесь, а не у темы: оно уточняет письмо,
          а не называет его. */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
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
    </div>
  );

  if (!href) return <div className="block">{body}</div>;
  return (
    <Link href={href} className="row-clickable block">
      {body}
    </Link>
  );
}
