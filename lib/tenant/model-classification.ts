/**
 * Класс каждой модели схемы относительно арендатора.
 *
 * Это первая веха мультиарендности и фундамент всех следующих: пока у каждой
 * таблицы не записано, чья она, спор «нужен ли здесь tenantId» повторяется на
 * каждой таблице отдельно и решается по-разному.
 *
 * Три класса:
 *
 *   GLOBAL       — данные платформы, одинаковые для всех сервисов. Кузов W463 и
 *                  номер детали A4634210098 не принадлежат автосервису.
 *                  Колонки арендатора у таких таблиц нет и не будет.
 *   TENANT       — корневая сущность сервиса. Получает собственный `tenantId`.
 *   TENANT_CHILD — строка, живущая под корнем и наследующая аренду через него.
 *                  Обязана назвать родителя; цепочка родителей всегда
 *                  заканчивается на TENANT.
 *
 * **Принцип при сомнении: TENANT, а не TENANT_CHILD.** Лишняя колонка стоит
 * байты, неверно унаследованная аренда — чужие данные в чужом сервисе.
 *
 * Сторож `tests/tenant/classification.test.ts` роняет сборку, если в схеме
 * появилась модель, которой здесь нет: новая таблица обязана получить решение,
 * а не молча остаться без арендатора.
 */

export type ModelClass = "GLOBAL" | "TENANT" | "TENANT_CHILD";

export interface ModelClassification {
  /** Класс модели. */
  kind: ModelClass;
  /** Для TENANT_CHILD — модель-родитель, через которую наследуется аренда. */
  parent?: string;
  /** Причина — только там, где выбор неочевиден. */
  why?: string;
}

const G = (why?: string): ModelClassification => ({ kind: "GLOBAL", why });
const T = (why?: string): ModelClassification => ({ kind: "TENANT", why });
const C = (parent: string, why?: string): ModelClassification => ({
  kind: "TENANT_CHILD",
  parent,
  why,
});

export const MODEL_CLASSIFICATION: Readonly<Record<string, ModelClassification>> = {
  // ── Справочники платформы ──────────────────────────────────────────────────
  Tenant: G("реестр арендаторов: сам по себе не принадлежит ни одному из них"),
  Manufacturer: G("марка автомобиля одинакова для всех сервисов"),
  VehicleModel: G(),
  VehicleGeneration: G(),
  VehicleTrim: G(),
  PartReference: G("номенклатура по OEM-номеру универсальна; свои позиции сервиса появятся расширением, а не форком справочника"),
  PartReferenceFitment: G("применимость номенклатуры к поколению — свойство детали, не сервиса"),

  // ── Корневые сущности сервиса ──────────────────────────────────────────────
  User: T("до разделения идентичности (Story 9) это и учётка, и клиент, и сотрудник"),
  Setting: T("настройки, контакты и ключи интеграций у каждого сервиса свои"),
  CustomerTag: T(),
  Vehicle: T(),
  Service: T("услуги и цены у каждого сервиса свои"),
  RepairOrder: T(),
  ServiceBay: T(),
  Slot: T("при сомнении корень: слот существует и без наряда"),
  WorkingHours: T(),
  ScheduleException: T(),
  BlockedInterval: T(),
  LoyaltyAccount: T(),
  Notification: T(),
  UploadedImage: T(),
  CMSBlock: T(),
  SeoSnapshot: T(),
  BlogPost: T(),
  PartCategory: T(),
  Part: T("товар — это цена, остаток и состояние конкретного сервиса"),
  PartRequest: T(),
  Warehouse: T(),
  PartShipment: T(),
  RentalBooking: T(),
  TeamMember: T(),
  Vacancy: T(),
  SupplierOrder: T(),
  Deal: T(),
  Estimate: T(),
  CommunicationLog: T(),
  InboxMessage: T(),
  EmailMessage: T(),
  MailboxSyncCursor: T(),
  MailIdentity: T(),
  CrmTask: T(),
  InboundAttempt: T("приходит до разбора; арендатор определяется по ящику-получателю"),
  RolePermission: T(),
  AuditLog: T(),
  StaffNotificationEvent: T(),
  StaffNotificationOptOut: T(),
  TelegramDestination: T(),
  TelegramLinkToken: T(),
  TelegramUpdateReceipt: T(),
  TelegramSendAttempt: T(),
  TelegramPollState: T(),
  TelegramTestSendThrottle: T(),
  ScanEvent: T("журнал сканирований склада; пишется и при неудачном скане, когда объект неизвестен"),
  StockCountSession: T(),

  // ── Строки под корнями ─────────────────────────────────────────────────────
  CustomerProfile: C("User"),
  CustomerContact: C("User"),
  CustomerNote: C("User"),
  CustomerTagAssignment: C("CustomerTag"),
  MasterProfile: C("User"),
  SupplierProfile: C("User"),
  PasswordReset: C("User"),
  EmailVerificationToken: C("User"),
  OAuthAccount: C("User"),
  RepairOrderPhoto: C("RepairOrder"),
  JobLine: C("RepairOrder"),
  LaborLine: C("JobLine"),
  PartLine: C("JobLine"),
  LoyaltyTransaction: C("LoyaltyAccount"),
  EstimateLine: C("Estimate"),
  PartOrderItem: C("PartShipment"),
  SupplierOrderItem: C("SupplierOrder"),
  PartTrim: C("Part", "связка товара с комплектацией: сам товар принадлежит сервису"),
  StockItem: C("Warehouse"),
  StockMovement: C("StockItem"),
  StockBin: C("Warehouse"),
  StockBinMovement: C("StockItem"),
  StockLocation: C("Warehouse"),
  StockCountLine: C("StockCountSession"),
  StaffNotificationReceipt: C("StaffNotificationEvent"),
  StaffNotificationDelivery: C("StaffNotificationEvent"),
};

export interface ClassificationProblem {
  model: string;
  problem: string;
}

/**
 * Сверить классификацию со списком моделей схемы.
 *
 * Возвращает список проблем, а не бросает: сторожу нужно показать сразу все
 * расхождения, иначе исправление идёт по одному за прогон.
 */
export function validateClassification(schemaModels: readonly string[]): ClassificationProblem[] {
  const problems: ClassificationProblem[] = [];
  const known = new Set(Object.keys(MODEL_CLASSIFICATION));

  for (const model of schemaModels) {
    if (!known.has(model)) {
      problems.push({
        model,
        problem: "нет в классификации — новая таблица обязана получить класс относительно арендатора",
      });
    }
  }
  const inSchema = new Set(schemaModels);
  for (const model of known) {
    if (!inSchema.has(model)) {
      problems.push({ model, problem: "классифицирована, но в схеме такой модели нет" });
    }
  }

  for (const [model, entry] of Object.entries(MODEL_CLASSIFICATION)) {
    if (entry.kind !== "TENANT_CHILD") {
      if (entry.parent) problems.push({ model, problem: "родитель указан у не-дочерней модели" });
      continue;
    }
    if (!entry.parent) {
      problems.push({ model, problem: "дочерняя модель обязана назвать родителя" });
      continue;
    }
    const parent = MODEL_CLASSIFICATION[entry.parent];
    if (!parent) {
      problems.push({ model, problem: `родитель ${entry.parent} не классифицирован` });
      continue;
    }
    if (parent.kind === "GLOBAL") {
      problems.push({
        model,
        problem: `родитель ${entry.parent} — GLOBAL: цепочка наследования аренды не может начинаться с общей таблицы`,
      });
    }
  }

  for (const model of Object.keys(MODEL_CLASSIFICATION)) {
    const seen = new Set<string>([model]);
    let cursor = MODEL_CLASSIFICATION[model];
    while (cursor?.kind === "TENANT_CHILD" && cursor.parent) {
      if (seen.has(cursor.parent)) {
        problems.push({ model, problem: `цепочка родителей зациклена на ${cursor.parent}` });
        break;
      }
      seen.add(cursor.parent);
      cursor = MODEL_CLASSIFICATION[cursor.parent];
    }
  }

  return problems;
}

/** Корневая TENANT-модель, от которой модель наследует аренду; null для GLOBAL. */
export function tenantRootOf(model: string): string | null {
  let cursor = MODEL_CLASSIFICATION[model];
  let name = model;
  const seen = new Set<string>();
  while (cursor?.kind === "TENANT_CHILD" && cursor.parent && !seen.has(name)) {
    seen.add(name);
    name = cursor.parent;
    cursor = MODEL_CLASSIFICATION[name];
  }
  return cursor?.kind === "TENANT" ? name : null;
}

/** Модели, которым нужна собственная колонка арендатора. */
export function modelsNeedingTenantColumn(): string[] {
  return Object.entries(MODEL_CLASSIFICATION)
    .filter(([, e]) => e.kind === "TENANT" || e.kind === "TENANT_CHILD")
    .map(([name]) => name)
    .sort();
}
