export interface Generation {
  /** Chassis code shown in workshop refs (e.g., "W463", "W464", "EQS"). */
  code: string;
  /** First production year. */
  yearFrom: number;
  /** Last production year, or null if still in production. */
  yearTo: number | null;
}

export interface ModelInfo {
  slug: string;
  name: string;
  description: string;
  generations: Generation[];
  engines: string;
  features: string[];
}

/** Current → "year–н.в.", retired → "year–year". Always followed by · code.
 *  Example: "2018–н.в. · W464", "2007–2018 · W463". */
export function generationLabel(g: Generation): string {
  const end = g.yearTo === null ? "н.в." : String(g.yearTo);
  return `${g.yearFrom}–${end} · ${g.code}`;
}

/** Short label for compact contexts (chassis helper, breadcrumbs). */
export function generationShort(g: Generation): string {
  return g.code;
}

export const MODELS: ModelInfo[] = [
  {
    slug: "a-class",
    name: "A-Class",
    description:
      "Компактный хэтчбек/седан. Передний или полный привод, MBUX мультимедиа, экономичные дизели и бензиновые турбо-моторы.",
    generations: [
      { code: "W176", yearFrom: 2012, yearTo: 2018 },
      { code: "W177", yearFrom: 2018, yearTo: null },
    ],
    engines: "M270, M260, M282, OM607, OM654q",
    features: ["MBUX", "Передний/полный привод", "Активные ассистенты", "Турбо-моторы"],
  },
  {
    slug: "b-class",
    name: "B-Class",
    description:
      "Компактвэн с увеличенным внутренним пространством. Универсальный городской автомобиль для семей.",
    generations: [
      { code: "W246", yearFrom: 2011, yearTo: 2019 },
      { code: "W247", yearFrom: 2019, yearTo: null },
    ],
    engines: "M270, M260, OM607, OM654q",
    features: ["Просторный салон", "Низкая погрузочная высота", "Опц. 4MATIC", "Электромотор (B 250e)"],
  },
  {
    slug: "c-class",
    name: "C-Class",
    description:
      "Компактный бизнес-класс. Один из самых популярных Mercedes в обслуживании. Сбалансированное сочетание комфорта и динамики.",
    generations: [
      { code: "W205", yearFrom: 2014, yearTo: 2021 },
      { code: "W206", yearFrom: 2021, yearTo: null },
    ],
    engines: "M264, M256, OM654",
    features: [
      "9G-Tronic АКПП",
      "MBUX мультимедиа",
      "LED MULTIBEAM (опция)",
      "Полный привод 4MATIC (опция)",
    ],
  },
  {
    slug: "cla",
    name: "CLA",
    description:
      "Четырёхдверное купе на платформе A-Class. Выразительный дизайн, динамичная посадка, спортивные настройки шасси.",
    generations: [
      { code: "C117", yearFrom: 2013, yearTo: 2019 },
      { code: "C118", yearFrom: 2019, yearTo: null },
    ],
    engines: "M270, M260, M139 (AMG)",
    features: ["Купе-седан", "Опц. 4MATIC", "AMG-версии", "MBUX"],
  },
  {
    slug: "e-class",
    name: "E-Class",
    description:
      "Бизнес-класс. Широкий выбор двигателей и комплектаций. Пневмоподвеска AIRMATIC доступна на отдельных версиях.",
    generations: [
      { code: "W213", yearFrom: 2016, yearTo: 2023 },
      { code: "W214", yearFrom: 2023, yearTo: null },
    ],
    engines: "M264, M256, M276, OM654, OM656",
    features: [
      "Пневмоподвеска AIRMATIC (опция)",
      "MBUX с AR-навигацией",
      "Полуавтономное вождение",
      "4MATIC полный привод",
    ],
  },
  {
    slug: "s-class",
    name: "S-Class",
    description:
      "Флагман модельного ряда. Полная пневмоподвеска, передовые технологии комфорта и безопасности. Требует высшей квалификации мастеров.",
    generations: [
      { code: "W222", yearFrom: 2013, yearTo: 2020 },
      { code: "W223", yearFrom: 2020, yearTo: null },
    ],
    engines: "M256, M176, M256E, OM656",
    features: [
      "E-Active Body Control",
      "MBUX с задним планшетом",
      "Полная пневмоподвеска",
      "Заднее подруливание до 10°",
    ],
  },
  {
    slug: "gla",
    name: "GLA",
    description:
      "Компактный кроссовер на базе A-Class. Опционально полный привод 4MATIC, удобная посадка для города.",
    generations: [
      { code: "X156", yearFrom: 2014, yearTo: 2020 },
      { code: "H247", yearFrom: 2020, yearTo: null },
    ],
    engines: "M270, M260, OM607, OM654q",
    features: ["Опц. 4MATIC", "Высокая посадка", "MBUX", "AMG GLA 35/45"],
  },
  {
    slug: "glc",
    name: "GLC",
    description:
      "Среднеразмерный кроссовер. Один из самых продаваемых Mercedes. Опц. AIRMATIC, 4MATIC, AMG-версии.",
    generations: [
      { code: "X253", yearFrom: 2015, yearTo: 2022 },
      { code: "X254", yearFrom: 2022, yearTo: null },
    ],
    engines: "M264, M256, OM654, OM656, M177 (AMG)",
    features: ["4MATIC", "AIRMATIC (опция)", "MBUX", "Версии Coupé"],
  },
  {
    slug: "gle",
    name: "GLE",
    description:
      "Среднеразмерный кроссовер. Полный привод 4MATIC, пневмоподвеска. Популярная модель для семейного использования.",
    generations: [
      { code: "W166", yearFrom: 2015, yearTo: 2019 },
      { code: "V167", yearFrom: 2019, yearTo: null },
    ],
    engines: "M276, M256, OM654, OM656",
    features: [
      "Полный привод 4MATIC",
      "Пневмоподвеска AIRMATIC",
      "Активные стабилизаторы (опция)",
      "7-местная конфигурация (опция)",
    ],
  },
  {
    slug: "gls",
    name: "GLS",
    description:
      "Полноразмерный кроссовер. 7-местная конфигурация, максимальный комфорт в классе больших SUV.",
    generations: [
      { code: "X166", yearFrom: 2015, yearTo: 2019 },
      { code: "X167", yearFrom: 2019, yearTo: null },
    ],
    engines: "M276, M256, M177",
    features: [
      "7 мест",
      "Пневмоподвеска AIRMATIC",
      "E-Active Body Control (опция)",
      "MBUX с тремя экранами",
    ],
  },
  {
    slug: "g-class",
    name: "G-Class",
    description:
      "Легендарный внедорожник. Рамная конструкция, мосты, раздаточная коробка, три блокировки дифференциалов. Уникальная конструкция требует специализированного подхода.",
    generations: [
      { code: "W463", yearFrom: 1990, yearTo: 2018 },
      { code: "W464", yearFrom: 2018, yearTo: null },
    ],
    engines: "M176, M177 (AMG), OM656",
    features: [
      "Рамная конструкция",
      "3 блокировки дифференциалов",
      "Раздаточная коробка",
      "Мосты с зависимой подвеской (сзади)",
    ],
  },
  {
    slug: "v-class",
    name: "V-Class",
    description:
      "Премиальный минивэн. До 8 мест, варианты с длинной/удлинённой колёсной базой. Комфорт уровня бизнес-седана для перевозок и семьи.",
    generations: [
      { code: "W447", yearFrom: 2014, yearTo: null },
    ],
    engines: "OM651, OM654",
    features: ["До 8 мест", "Электрические двери (опция)", "Опц. 4MATIC", "Долговечный дизель"],
  },
  {
    slug: "amg",
    name: "AMG",
    description:
      "Спортивные модели Affalterbach. Двигатели ручной сборки, спортивные тормоза, адаптивная подвеска AMG RIDE CONTROL. Требует мастеров с AMG-сертификацией.",
    generations: [
      { code: "C63", yearFrom: 2014, yearTo: null },
      { code: "E63", yearFrom: 2017, yearTo: null },
      { code: "GT", yearFrom: 2014, yearTo: null },
      { code: "G63", yearFrom: 2018, yearTo: null },
      { code: "GLE 63", yearFrom: 2019, yearTo: null },
    ],
    engines: "M177, M178, M139",
    features: [
      "Двигатели ручной сборки (One Man, One Engine)",
      "AMG RIDE CONTROL подвеска",
      "Керамические тормоза (опция)",
      "AMG SPEEDSHIFT коробка",
    ],
  },
  {
    slug: "eq",
    name: "EQ",
    description:
      "Электрические модели Mercedes. Высоковольтные батареи, электромоторы, рекуперативное торможение. Обслуживание требует сертификации по электробезопасности.",
    generations: [
      { code: "EQA", yearFrom: 2021, yearTo: null },
      { code: "EQB", yearFrom: 2021, yearTo: null },
      { code: "EQC", yearFrom: 2019, yearTo: null },
      { code: "EQE", yearFrom: 2022, yearTo: null },
      { code: "EQS", yearFrom: 2021, yearTo: null },
    ],
    engines: "Электромоторы, батарея до 120 кВт·ч",
    features: [
      "Высоковольтная система (400–800В)",
      "Рекуперативное торможение",
      "Термоуправление батареи",
      "OTA-обновления ПО",
    ],
  },
];

export function getModelBySlug(slug: string): ModelInfo | undefined {
  return MODELS.find((m) => m.slug === slug);
}

/**
 * Map of model name → list of generation chassis codes (just the strings).
 * Backwards-compat shape so callers iterating string codes (parts validation,
 * URL params, label rendering) keep working.
 */
export const MODEL_GENERATIONS: Record<string, string[]> = Object.fromEntries(
  MODELS.map((m) => [m.name, m.generations.map((g) => g.code)]),
);

/** Same map but with full Generation objects, for callers that want years. */
export const MODEL_GENERATIONS_FULL: Record<string, Generation[]> = Object.fromEntries(
  MODELS.map((m) => [m.name, m.generations]),
);
