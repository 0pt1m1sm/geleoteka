import type { PrismaClient } from "../app/generated/prisma/client";

interface SeedGeneration {
  code: string;
  yearFrom: number;
  yearTo: number | null;
}

interface SeedModel {
  slug: string;
  name: string;
  description: string;
  engines?: string;
  features?: string[];
  generations: SeedGeneration[];
}

interface SeedManufacturer {
  slug: string;
  name: string;
  models: SeedModel[];
}

/**
 * Mercedes-Benz lineup. Year ranges curated for the Russian market — older
 * generations (W124, W202, W210, W163, W220, etc.) are common on the road
 * here so they're included, not just current production.
 */
const VEHICLE_CATALOG: SeedManufacturer[] = [
  {
    slug: "mercedes-benz",
    name: "Mercedes-Benz",
    models: [
      {
        slug: "a-class",
        name: "A-Class",
        description:
          "Компактный хэтчбек/седан. Передний или полный привод, MBUX мультимедиа, экономичные дизели и бензиновые турбо-моторы.",
        engines: "M270, M260, M282, OM607, OM654q",
        features: ["MBUX", "Передний/полный привод", "Турбо-моторы"],
        generations: [
          { code: "W168", yearFrom: 1997, yearTo: 2004 },
          { code: "W169", yearFrom: 2004, yearTo: 2012 },
          { code: "W176", yearFrom: 2012, yearTo: 2018 },
          { code: "W177", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        slug: "b-class",
        name: "B-Class",
        description:
          "Компактвэн с увеличенным внутренним пространством. Универсальный городской автомобиль для семей.",
        engines: "M270, M260, OM607, OM654q",
        features: ["Просторный салон", "Низкая погрузочная высота", "Опц. 4MATIC"],
        generations: [
          { code: "W245", yearFrom: 2005, yearTo: 2011 },
          { code: "W246", yearFrom: 2011, yearTo: 2018 },
          { code: "W247", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        slug: "c-class",
        name: "C-Class",
        description:
          "Компактный бизнес-класс. Один из самых распространённых Mercedes в обслуживании. Сбалансированное сочетание комфорта и динамики.",
        engines: "M111, M271, M274, M264, M256, M276, OM611, OM646, OM651, OM654",
        features: ["9G-Tronic", "MBUX", "Опц. 4MATIC"],
        generations: [
          { code: "W202", yearFrom: 1993, yearTo: 2000 },
          { code: "W203", yearFrom: 2000, yearTo: 2007 },
          { code: "W204", yearFrom: 2007, yearTo: 2014 },
          { code: "W205", yearFrom: 2014, yearTo: 2021 },
          { code: "W206", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        slug: "cla",
        name: "CLA",
        description:
          "Четырёхдверное купе на платформе A-Class. Выразительный дизайн, спортивные настройки шасси.",
        engines: "M270, M260, M139 (AMG)",
        features: ["Купе-седан", "Опц. 4MATIC", "AMG-версии"],
        generations: [
          { code: "C117", yearFrom: 2013, yearTo: 2019 },
          { code: "C118", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        slug: "cls",
        name: "CLS",
        description:
          "Четырёхдверное купе на базе E-Class. Сочетание седана и купе с выразительным силуэтом.",
        engines: "M272, M273, M276, M256, OM642, OM656",
        features: ["AIRMATIC (опция)", "Опц. 4MATIC", "AMG CLS 53/63"],
        generations: [
          { code: "C219", yearFrom: 2003, yearTo: 2010 },
          { code: "C218", yearFrom: 2011, yearTo: 2018 },
          { code: "C257", yearFrom: 2018, yearTo: 2023 },
        ],
      },
      {
        slug: "e-class",
        name: "E-Class",
        description:
          "Бизнес-класс. Широкий выбор двигателей и комплектаций. Пневмоподвеска AIRMATIC доступна на отдельных версиях.",
        engines: "M104, M111, M112, M113, M271, M272, M273, M274, M264, M256, M276, OM602, OM606, OM611, OM642, OM651, OM654, OM656",
        features: ["AIRMATIC (опция)", "MBUX (с W213)", "4MATIC"],
        generations: [
          { code: "W124", yearFrom: 1985, yearTo: 1995 },
          { code: "W210", yearFrom: 1995, yearTo: 2002 },
          { code: "W211", yearFrom: 2002, yearTo: 2009 },
          { code: "W212", yearFrom: 2009, yearTo: 2016 },
          { code: "W213", yearFrom: 2016, yearTo: 2023 },
          { code: "W214", yearFrom: 2023, yearTo: null },
        ],
      },
      {
        slug: "s-class",
        name: "S-Class",
        description:
          "Флагман модельного ряда. Полная пневмоподвеска, передовые технологии комфорта и безопасности. Требует высшей квалификации мастеров.",
        engines: "M104, M119, M120, M137, M272, M273, M275, M276, M278, M256, M176, OM606, OM613, OM628, OM642, OM656",
        features: [
          "E-Active Body Control (W223)",
          "MBUX",
          "Полная пневмоподвеска",
        ],
        generations: [
          { code: "W140", yearFrom: 1991, yearTo: 1998 },
          { code: "W220", yearFrom: 1998, yearTo: 2005 },
          { code: "W221", yearFrom: 2005, yearTo: 2013 },
          { code: "W222", yearFrom: 2013, yearTo: 2020 },
          { code: "W223", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        slug: "gla",
        name: "GLA",
        description:
          "Компактный кроссовер на базе A-Class. Опционально полный привод 4MATIC.",
        engines: "M270, M260, OM607, OM654q",
        features: ["Опц. 4MATIC", "Высокая посадка", "AMG GLA 35/45"],
        generations: [
          { code: "X156", yearFrom: 2014, yearTo: 2020 },
          { code: "H247", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        slug: "glb",
        name: "GLB",
        description:
          "Компактный кроссовер с возможностью семиместной конфигурации. Пространство универсала, посадка SUV.",
        engines: "M260, OM654q",
        features: ["Опц. 7 мест", "Опц. 4MATIC", "MBUX"],
        generations: [
          { code: "X247", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        slug: "glc",
        name: "GLC",
        description:
          "Среднеразмерный кроссовер. Один из самых продаваемых Mercedes. Опц. AIRMATIC, 4MATIC, AMG-версии. Преемник GLK.",
        engines: "M264, M256, OM651, OM654, OM656, M177 (AMG)",
        features: ["4MATIC", "AIRMATIC (опция)", "Версии Coupé"],
        generations: [
          { code: "X204", yearFrom: 2008, yearTo: 2015 },
          { code: "X253", yearFrom: 2015, yearTo: 2022 },
          { code: "X254", yearFrom: 2022, yearTo: null },
        ],
      },
      {
        slug: "gle",
        name: "GLE",
        description:
          "Среднеразмерный кроссовер. Полный привод 4MATIC, пневмоподвеска. Преемник M-Class.",
        engines: "M112, M113, M272, M273, M276, M256, OM642, OM654, OM656",
        features: [
          "4MATIC",
          "AIRMATIC",
          "Опц. активные стабилизаторы",
        ],
        generations: [
          { code: "W163", yearFrom: 1997, yearTo: 2004 },
          { code: "W164", yearFrom: 2005, yearTo: 2011 },
          { code: "W166", yearFrom: 2011, yearTo: 2019 },
          { code: "V167", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        slug: "gls",
        name: "GLS",
        description:
          "Полноразмерный кроссовер. 7-местная конфигурация, максимальный комфорт в классе больших SUV. Преемник GL-Class.",
        engines: "M273, M276, M256, M177, OM642, OM656",
        features: ["7 мест", "AIRMATIC", "Опц. E-Active Body Control"],
        generations: [
          { code: "X164", yearFrom: 2006, yearTo: 2012 },
          { code: "X166", yearFrom: 2012, yearTo: 2019 },
          { code: "X167", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        slug: "g-class",
        name: "G-Class",
        description:
          "Легендарный внедорожник. Рамная конструкция, мосты, раздаточная коробка, три блокировки дифференциалов. Уникальная конструкция требует специализированного подхода.",
        engines: "M104, M112, M113, M119, M137, M156, M157, M176, M177, OM606, OM613, OM648, OM642, OM656",
        features: [
          "Рамная конструкция",
          "3 блокировки дифференциалов",
          "Раздаточная коробка",
        ],
        generations: [
          { code: "W460", yearFrom: 1979, yearTo: 1991 },
          // W461 — Puch G / military + civilian utility variant. Civilian
          // production ran through 2019, full production through 2022. Same
          // chassis family as W460 with W463 powertrain.
          { code: "W461", yearFrom: 1985, yearTo: 2022 },
          { code: "W463", yearFrom: 1990, yearTo: 2018 },
          // 2018+ civilian uses W463A (aftermarket-parts naming). True W464 is
          // the 2022+ military 4×4² variant, not a customer-facing platform.
          { code: "W463A", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        slug: "v-class",
        name: "V-Class",
        description:
          "Премиальный минивэн. До 8 мест, варианты с длинной/удлинённой колёсной базой. Включает предшественников Vito/Viano.",
        engines: "M111, M112, M271, M274, OM611, OM646, OM651, OM654",
        features: ["До 8 мест", "Опц. 4MATIC", "Долговечный дизель"],
        generations: [
          { code: "W638", yearFrom: 1996, yearTo: 2003 },
          { code: "W639", yearFrom: 2003, yearTo: 2014 },
          { code: "W447", yearFrom: 2014, yearTo: null },
        ],
      },
      {
        slug: "sl",
        name: "SL",
        description:
          "Двухместный родстер. Складная жёсткая крыша на R230/R231, мягкая на R232. Линейка V8/V12/AMG.",
        engines: "M119, M120, M137, M272, M273, M275, M278, M156, M157, M178",
        features: ["Складная крыша", "AMG-версии", "AIRMATIC"],
        generations: [
          { code: "R129", yearFrom: 1988, yearTo: 2001 },
          { code: "R230", yearFrom: 2001, yearTo: 2011 },
          { code: "R231", yearFrom: 2012, yearTo: 2020 },
          { code: "R232", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        slug: "slk-slc",
        name: "SLK / SLC",
        description:
          "Компактный родстер со складной жёсткой крышей. Переименован в SLC после рестайлинга 2016.",
        engines: "M111, M112, M271, M272, M276, M152, M178",
        features: ["Vario-крыша", "AMG SLK/SLC 55", "Магниевая отделка интерьера"],
        generations: [
          { code: "R170", yearFrom: 1995, yearTo: 2004 },
          { code: "R171", yearFrom: 2004, yearTo: 2011 },
          { code: "R172", yearFrom: 2011, yearTo: 2020 },
        ],
      },
      {
        slug: "amg-gt",
        name: "AMG GT",
        description:
          "Двухместный спорткар Affalterbach. Двигатели M178 и M177, заднее или полное (4MATIC+) ведущее колесо. Включает 4-дверное GT 53/63.",
        engines: "M178, M177, M139",
        features: [
          "Двигатели ручной сборки",
          "AMG RIDE CONTROL",
          "Керамические тормоза (опция)",
        ],
        generations: [
          { code: "C190", yearFrom: 2014, yearTo: 2022 },
          { code: "X290", yearFrom: 2018, yearTo: null },
          { code: "C192", yearFrom: 2023, yearTo: null },
        ],
      },
      {
        slug: "eqa",
        name: "EQA",
        description:
          "Компактный электрический кроссовер на платформе GLA. Запас хода до 560 км WLTP.",
        engines: "Электромотор PSM, батарея 66.5 кВт·ч",
        features: ["Высоковольтная система 400В", "Рекуперация", "MBUX"],
        generations: [
          { code: "H243", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        slug: "eqb",
        name: "EQB",
        description:
          "Электрический кроссовер на платформе GLB. Опция семиместной конфигурации.",
        engines: "Электромотор PSM, батарея 66.5 кВт·ч",
        features: ["Опц. 7 мест", "AWD", "MBUX"],
        generations: [
          { code: "X243", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        slug: "eqc",
        name: "EQC",
        description:
          "Электрический кроссовер на базе GLC. Двухмоторный полный привод, батарея 80 кВт·ч.",
        engines: "Два электромотора, батарея 80 кВт·ч",
        features: ["AWD", "Полная электрика", "MBUX"],
        generations: [
          { code: "N293", yearFrom: 2019, yearTo: 2023 },
        ],
      },
      {
        slug: "eqe",
        name: "EQE",
        description:
          "Электрический бизнес-класс. Седан и кроссовер версий, до 90 кВт·ч ёмкости.",
        engines: "Электромоторы, батарея 90 кВт·ч",
        features: ["Hyperscreen (опция)", "AWD", "Адаптивная подвеска"],
        generations: [
          { code: "V295", yearFrom: 2022, yearTo: null },
          { code: "X294", yearFrom: 2022, yearTo: null },
        ],
      },
      {
        slug: "eqs",
        name: "EQS",
        description:
          "Электрический флагман. До 120 кВт·ч ёмкости, запас хода 700+ км WLTP.",
        engines: "Электромоторы, батарея до 120 кВт·ч",
        features: [
          "Hyperscreen",
          "Заднее подруливание до 10°",
          "Полная пневмоподвеска",
        ],
        generations: [
          { code: "V297", yearFrom: 2021, yearTo: null },
          { code: "X296", yearFrom: 2022, yearTo: null },
        ],
      },
    ],
  },
];

/** Idempotent upsert. Safe to run repeatedly. */
export async function seedVehicleCatalog(prisma: PrismaClient): Promise<void> {
  let manufacturerCount = 0;
  let modelCount = 0;
  let generationCount = 0;

  for (let mIdx = 0; mIdx < VEHICLE_CATALOG.length; mIdx++) {
    const mfr = VEHICLE_CATALOG[mIdx];
    const manufacturer = await prisma.manufacturer.upsert({
      where: { slug: mfr.slug },
      update: { name: mfr.name, sortOrder: mIdx, isActive: true },
      create: { slug: mfr.slug, name: mfr.name, sortOrder: mIdx, isActive: true },
    });
    manufacturerCount++;

    for (let modelIdx = 0; modelIdx < mfr.models.length; modelIdx++) {
      const m = mfr.models[modelIdx];
      const model = await prisma.vehicleModel.upsert({
        where: { slug: m.slug },
        update: {
          name: m.name,
          description: m.description,
          engines: m.engines,
          features: m.features ?? [],
          manufacturerId: manufacturer.id,
          sortOrder: modelIdx,
          isActive: true,
        },
        create: {
          slug: m.slug,
          name: m.name,
          description: m.description,
          engines: m.engines,
          features: m.features ?? [],
          manufacturerId: manufacturer.id,
          sortOrder: modelIdx,
          isActive: true,
        },
      });
      modelCount++;

      for (let genIdx = 0; genIdx < m.generations.length; genIdx++) {
        const g = m.generations[genIdx];
        const generation = await prisma.vehicleGeneration.upsert({
          where: { modelId_code: { modelId: model.id, code: g.code } },
          update: { yearFrom: g.yearFrom, yearTo: g.yearTo, sortOrder: genIdx, isActive: true },
          create: {
            modelId: model.id,
            code: g.code,
            yearFrom: g.yearFrom,
            yearTo: g.yearTo,
            sortOrder: genIdx,
            isActive: true,
          },
        });
        generationCount++;

        // Default trim: every generation gets one isDefault=true trim that
        // absorbs legacy compatibility data and acts as the "Все варианты"
        // fallback for the public picker. Idempotent via composite unique.
        await prisma.vehicleTrim.upsert({
          where: { generationId_code: { generationId: generation.id, code: "ALL" } },
          update: { isActive: true, isDefault: true, sortOrder: 0 },
          create: {
            generationId: generation.id,
            code: "ALL",
            isDefault: true,
            isActive: true,
            sortOrder: 0,
          },
        });
      }
    }
  }

  console.log(
    `Seeded vehicle catalog: ${manufacturerCount} manufacturers, ${modelCount} models, ${generationCount} generations`,
  );
}
