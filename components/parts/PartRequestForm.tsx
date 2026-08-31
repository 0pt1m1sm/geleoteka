"use client";

import { useActionState } from "react";
import { createPartRequest } from "@/app/actions/part-requests";

/**
 * «Сообщить о поступлении» — форма на странице по номеру детали, когда живых
 * вариантов нет.
 *
 * Никаких автоуведомлений покупателю: заявка попадает в список, сотрудник
 * связывается сам. Так решено в PRD, и текст формы обещает ровно это — обещать
 * автоматическое письмо значило бы соврать.
 */
export function PartRequestForm({ oem }: { oem: string }): React.ReactElement {
  const [state, action, pending] = useActionState(createPartRequest, null);

  if (state?.success) {
    return (
      <div className="alert-success text-sm">
        Заявка принята. Мы свяжемся с вами, когда деталь появится или когда
        сможем привезти её под заказ.
      </div>
    );
  }

  return (
    <form action={action} className="card p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Сообщить о поступлении</h2>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Оставьте телефон или почту — напишем, когда деталь будет в наличии.
        </p>
      </div>

      <input type="hidden" name="oem" value={oem} />

      {/* Honeypot: спрятан от человека и от скринридера, заполнить его может
          только автомат. Не `type="hidden"` — такие поля боты пропускают.
          Имя НЕ «website»: менеджеры паролей и автозаполнение такие имена знают
          и иногда заполняют вопреки autocomplete="off". У живого человека это
          дало бы вид успеха без заявки, причём он никогда бы не узнал — отказ
          здесь молчаливый по устройству, поэтому цена ложного срабатывания
          выше обычной. */}
      <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
        <label htmlFor="contact_confirm_url">Не заполняйте это поле</label>
        <input id="contact_confirm_url" name="contact_confirm_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="contact" className="block text-sm font-medium mb-1">
          Телефон или почта
        </label>
        <input
          id="contact"
          name="contact"
          required
          maxLength={200}
          autoComplete="tel"
          placeholder="+7 999 123-45-67"
          className="input w-full"
        />
      </div>

      <div>
        <label htmlFor="note" className="block text-sm font-medium mb-1">
          Уточнение <span className="text-[var(--foreground-muted)]">— необязательно</span>
        </label>
        <textarea
          id="note"
          name="note"
          maxLength={500}
          rows={2}
          placeholder="Кузов, год, что именно нужно"
          className="input w-full resize-y"
        />
      </div>

      {state?.error && <p className="alert-error text-sm">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Отправляем…" : "Сообщить о поступлении"}
      </button>
    </form>
  );
}
