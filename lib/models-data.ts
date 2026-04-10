export interface ModelInfo {
  slug: string;
  name: string;
  description: string;
  priceNote: string;
  generations: string;
  engines: string;
  features: string[];
}

export const MODELS: ModelInfo[] = [
  {
    slug: "c-class",
    name: "C-Class",
    description:
      "Компактный бизнес-класс. Один из самых популярных Mercedes в обслуживании. Сбалансированное сочетание комфорта и динамики.",
    priceNote: "Стандартные расценки",
    generations: "W205, W206",
    engines: "M264, M256, OM654",
    features: [
      "9G-Tronic АКПП",
      "MBUX мультимедиа",
      "LED MULTIBEAM (опция)",
      "Полный привод 4MATIC (опция)",
    ],
  },
  {
    slug: "e-class",
    name: "E-Class",
    description:
      "Бизнес-класс. Широкий выбор двигателей и комплектаций. Пневмоподвеска AIRMATIC доступна на отдельных версиях.",
    priceNote: "Стандартные расценки, +15% на AIRMATIC",
    generations: "W213, W214",
    engines: "M264, M256, M276, OM654, OM656",
    features: [
      "Пневмоподвеска AIRMATIC (опция)",
      "MBUX с AR-навигацией",
      "Система полуавтономного вождения",
      "4MATIC полный привод",
    ],
  },
  {
    slug: "s-class",
    name: "S-Class",
    description:
      "Флагман модельного ряда. Полная пневмоподвеска, передовые технологии комфорта и безопасности. Требует высшей квалификации мастеров.",
    priceNote: "+20–30% к стандартным расценкам",
    generations: "W222, W223",
    engines: "M256, M176, M256E, OM656",
    features: [
      "E-Active Body Control",
      "MBUX с задним планшетом",
      "Полная пневмоподвеска",
      "Заднее подруливание до 10°",
    ],
  },
  {
    slug: "gle",
    name: "GLE",
    description:
      "Среднеразмерный кроссовер. Полный привод 4MATIC, пневмоподвеска. Популярная модель для семейного использования.",
    priceNote: "+10% к стандартным расценкам",
    generations: "W166, V167",
    engines: "M276, M256, OM654",
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
    priceNote: "+15–25% к стандартным расценкам",
    generations: "X166, X167",
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
    priceNote: "+25–40% к стандартным расценкам",
    generations: "W463, W464",
    engines: "M176, M177 (AMG), OM656",
    features: [
      "Рамная конструкция",
      "3 блокировки дифференциалов",
      "Раздаточная коробка",
      "Мосты с зависимой подвеской (сзади)",
    ],
  },
  {
    slug: "amg",
    name: "AMG",
    description:
      "Спортивные модели Affalterbach. Двигатели ручной сборки, спортивные тормоза, адаптивная подвеска AMG RIDE CONTROL. Требует мастеров с AMG-сертификацией.",
    priceNote: "+30–50% AMG-наценка",
    generations: "C63, E63, GT, G63, GLE 63",
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
    priceNote: "Индивидуальный расчёт",
    generations: "EQA, EQB, EQC, EQE, EQS",
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
