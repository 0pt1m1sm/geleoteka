/** Russian labels for DealStage / DealChannel / DealLineType. */

/**
 * DealStage labels (Russian). Collapsed 2026-05-19: 7 → 4. NEW absorbs
 * DRAFT/QUOTED; IN_PROGRESS absorbs APPROVED/IN_FULFILLMENT/DELIVERED;
 * WON/LOST stay (now with Russian labels per ru-only audience).
 */
export const DEAL_STAGE_LABELS: Record<string, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  WON: "Выиграна",
  LOST: "Потеряна",
};

export const DEAL_CHANNEL_LABELS: Record<string, string> = {
  SERVICE: "Сервис",
  PARTS_RETAIL: "Магазин",
  PARTS_WHOLESALE: "Опт",
  RENTAL: "Аренда",
  WALK_IN: "Самообращение",
};

export const DEAL_LINE_TYPE_LABELS: Record<string, string> = {
  LABOR: "Работа",
  PART: "Запчасть",
  RENTAL_DAY: "Аренда (день)",
  DISCOUNT: "Скидка",
  FEE: "Сбор",
};

export const ESTIMATE_STAGE_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SENT: "Отправлена",
  APPROVED: "Согласована",
  DECLINED: "Отклонена",
  EXPIRED: "Истекла",
  SUPERSEDED: "Пересмотрена",
};

const OPEN_STAGES = new Set(["NEW", "IN_PROGRESS"]);

/** "Open" = not closed via WON/LOST. Used by deal-list filters. */
export function isOpenStage(stage: string): boolean {
  return OPEN_STAGES.has(stage);
}
