/** Russian labels for DealStage / DealChannel / DealLineType. */

export const DEAL_STAGE_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  QUOTED: "Смета",
  APPROVED: "Согласовано",
  IN_FULFILLMENT: "В работе",
  DELIVERED: "Готово",
  WON: "WON",
  LOST: "LOST",
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

const OPEN_STAGES = new Set(["DRAFT", "QUOTED", "APPROVED", "IN_FULFILLMENT", "DELIVERED"]);

export function isOpenStage(stage: string): boolean {
  return OPEN_STAGES.has(stage);
}
