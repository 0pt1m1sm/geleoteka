/**
 * Правила заведения не-нового товара.
 *
 * Владелец сознательно отказался от шкал и оценок состояния: без писаных
 * критериев «четвёрка» у разных людей означает разное, и потом за это спорят
 * при возврате. Вместо шкалы — фотографии и заметка, поэтому оба поля для б/у
 * обязательны: фотографии этой конкретной детали служат доказательством при
 * гарантийном возврате, а заметка объясняет, что именно покупатель берёт.
 */

/** Длина колонки Part.conditionNote (VarChar). Держать синхронно со схемой. */
export const CONDITION_NOTE_MAX = 1000;
/** Длина колонки Part.originNote (VarChar). */
export const ORIGIN_NOTE_MAX = 500;

export type PartConditionValue = "NEW" | "USED" | "REFURBISHED";

export const PART_CONDITIONS: ReadonlyArray<{ value: PartConditionValue; label: string }> = [
  { value: "NEW", label: "Новая" },
  { value: "USED", label: "Б/у" },
  { value: "REFURBISHED", label: "Восстановленная" },
];

export function isPartCondition(v: unknown): v is PartConditionValue {
  return v === "NEW" || v === "USED" || v === "REFURBISHED";
}

/**
 * @returns текст ошибки для пользователя либо null, если всё в порядке.
 */
export function validateUsedPartFields(
  condition: PartConditionValue,
  photos: readonly string[],
  conditionNote: string,
): string | null {
  if (condition === "NEW") return null;

  if (photos.length === 0) {
    return "Для не новой детали нужна хотя бы одна фотография — это доказательство состояния при возврате";
  }
  if (!conditionNote.trim()) {
    return "Опишите состояние детали: что именно покупатель берёт";
  }
  if (conditionNote.length > CONDITION_NOTE_MAX) {
    return `Описание состояния слишком длинное (максимум ${CONDITION_NOTE_MAX} символов)`;
  }
  return null;
}
