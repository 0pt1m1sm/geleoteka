import { PrismaClient } from "../app/generated/prisma/client";
import bcrypt from "bcryptjs";
import { seedVehicleCatalog } from "./seed-vehicles";
import { seedTrims } from "./seed-trims";
import { CMS_SCHEMA } from "../lib/cms-schema";

const prisma = new PrismaClient();

const services = [
  {
    slug: "to",
    name: "Техобслуживание",
    description:
      "Регламентное техническое обслуживание по стандартам Mercedes-Benz. Замена масла, фильтров, проверка всех узлов и систем автомобиля. Используем только оригинальные расходные материалы и масла, одобренные производителем.",
    priceMin: 8000,
    priceMax: 45000,
    durationMinutes: 120,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG", "EQ"],
  },
  {
    slug: "diagnostic",
    name: "Диагностика",
    description:
      "Полная компьютерная диагностика с использованием оригинального оборудования Mercedes-Benz STAR Diagnostics. Считывание кодов ошибок, проверка электронных систем, анализ состояния узлов и агрегатов.",
    priceMin: 5000,
    priceMax: 15000,
    durationMinutes: 60,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG", "EQ"],
  },
  {
    slug: "repair",
    name: "Двигатель",
    description:
      "Капитальный и текущий ремонт двигателей M264, M256, M276, M278, OM654 и других. Диагностика неисправностей, замена цепей ГРМ, ремонт головки блока, замена прокладок и уплотнений.",
    priceMin: 15000,
    priceMax: 350000,
    durationMinutes: 480,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG"],
  },
  {
    slug: "brakes",
    name: "Тормозная система",
    description:
      "Замена тормозных колодок, дисков, суппортов. Прокачка тормозной системы, замена тормозной жидкости. Диагностика ABS, ESP и системы автоматического торможения.",
    priceMin: 4500,
    priceMax: 80000,
    durationMinutes: 90,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG"],
  },
  {
    slug: "suspension",
    name: "Подвеска",
    description:
      "Диагностика и ремонт пневмоподвески AIRMATIC, замена амортизаторов, рычагов, сайлентблоков. Регулировка углов установки колёс на стенде Hunter.",
    priceMin: 5500,
    priceMax: 120000,
    durationMinutes: 180,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG"],
  },
  {
    slug: "conditioner",
    name: "Кондиционер",
    description:
      "Заправка кондиционера, диагностика герметичности, замена компрессора, конденсора, испарителя. Антибактериальная обработка салона.",
    priceMin: 3500,
    priceMax: 45000,
    durationMinutes: 60,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG", "EQ"],
  },
  {
    slug: "transmission",
    name: "АКПП",
    description:
      "Ремонт и обслуживание АКПП 9G-Tronic, 7G-Tronic, 4MATIC. Замена масла в коробке, ремонт мехатроника, замена сцепления.",
    priceMin: 8000,
    priceMax: 250000,
    durationMinutes: 240,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG"],
  },
  {
    slug: "electric",
    name: "Электрика",
    description:
      "Диагностика и ремонт электрических систем: COMAND, MBUX, система освещения MULTIBEAM LED, парктроники, камеры, датчики. Программирование блоков управления.",
    priceMin: 5000,
    priceMax: 80000,
    durationMinutes: 120,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG", "EQ"],
  },
  {
    slug: "body",
    name: "Кузовной ремонт",
    description:
      "Локальный и капитальный кузовной ремонт. Покраска с подбором цвета, рихтовка, замена элементов кузова. Полировка и защитные покрытия.",
    priceMin: 10000,
    priceMax: 500000,
    durationMinutes: 480,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG", "EQ"],
  },
  {
    slug: "other",
    name: "Другое",
    description:
      "Не уверены, что именно нужно? Приезжайте на диагностику — мастера определят причину и предложат решение.",
    priceMin: null,
    priceMax: null,
    durationMinutes: null,
    applicableModels: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "AMG", "EQ"],
  },
];

const masters = [
  {
    name: "Алексей Петров",
    email: "master-petrov@geleoteka.local",
    phone: "+79001000001",
    profile: {
      specialty: "Главный механик — двигатели Mercedes-Benz",
      yearsExperience: 18,
      bio: "Более 18 лет специализируется на двигателях Mercedes-Benz. Сертифицированный специалист STAR Diagnostics. Работал в официальном дилерском центре.",
      certifications: ["Mercedes-Benz STAR Certified", "AMG Performance Specialist"],
      sortOrder: 1,
    },
  },
  {
    name: "Дмитрий Козлов",
    email: "master-kozlov@geleoteka.local",
    phone: "+79001000002",
    profile: {
      specialty: "Специалист по электронике",
      yearsExperience: 12,
      bio: "12 лет опыта в диагностике и ремонте электронных систем. Эксперт по COMAND, MBUX, системам помощи водителю. Программирование блоков управления.",
      certifications: ["Mercedes-Benz Electronics Certified", "ADAS Calibration Specialist"],
      sortOrder: 2,
    },
  },
  {
    name: "Сергей Васильев",
    email: "master-vasiliev@geleoteka.local",
    phone: "+79001000003",
    profile: {
      specialty: "Специалист по ходовой части",
      yearsExperience: 15,
      bio: "15 лет опыта в ремонте подвески и трансмиссии. Эксперт по пневмоподвеске AIRMATIC и системе 4MATIC. Регулировка углов установки колёс.",
      certifications: ["Hunter Alignment Certified", "AIRMATIC Specialist"],
      sortOrder: 3,
    },
  },
  {
    name: "Михаил Новиков",
    email: "master-novikov@geleoteka.local",
    phone: "+79001000004",
    profile: {
      specialty: "Кузовной мастер",
      yearsExperience: 10,
      bio: "10 лет опыта в кузовном ремонте премиальных автомобилей. Покраска с подбором цвета, работа с алюминиевыми кузовными панелями.",
      certifications: ["Standox Certified Painter", "Aluminum Body Repair"],
      sortOrder: 4,
    },
  },
];

// Build seed payloads from CMS_SCHEMA so adding a new key requires nothing
// here. Each entry's `type` and `defaultValue` come straight from the schema.
type CMSSeedRow = { key: string; type: "text" | "richtext" | "list"; content: Record<string, unknown> };

const cmsBlocks: CMSSeedRow[] = (Object.keys(CMS_SCHEMA) as Array<keyof typeof CMS_SCHEMA>).map(
  (key) => {
    const def = CMS_SCHEMA[key];
    if (def.type === "text") return { key, type: "text", content: { value: def.defaultValue } };
    if (def.type === "richtext") return { key, type: "richtext", content: { markdown: def.defaultValue } };
    return { key, type: "list", content: { items: def.defaultValue as ReadonlyArray<Record<string, string>> } };
  },
);

async function main(): Promise<void> {
  console.log("Seeding database...");

  // Services
  for (const service of services) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: service,
      create: service,
    });
  }
  console.log(`Seeded ${services.length} services`);

  // CMS blocks — schema-driven; idempotent.
  for (const block of cmsBlocks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = block.content as any;
    await prisma.cMSBlock.upsert({
      where: { key: block.key },
      update: { type: block.type, content },
      create: { key: block.key, type: block.type, content },
    });
  }
  console.log(`Seeded ${cmsBlocks.length} CMS blocks`);

  // ============================================
  // USERS — auth identities + role-based profiles
  // ============================================
  const passwordHash = await bcrypt.hash("admin123", 12);

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@geleoteka.ru" },
    update: {},
    create: {
      email: "admin@geleoteka.ru",
      phone: "+79991234567",
      name: "Администратор",
      passwordHash,
      permissionRole: "ADMIN",
      isCustomer: false,
    },
  });
  await prisma.loyaltyAccount.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  // Client
  const client = await prisma.user.upsert({
    where: { email: "client@test.ru" },
    update: {},
    create: {
      email: "client@test.ru",
      phone: "+79997654321",
      name: "Тестовый Клиент",
      passwordHash,
      permissionRole: "CLIENT",
      isCustomer: true,
    },
  });
  await prisma.loyaltyAccount.upsert({
    where: { userId: client.id },
    update: {},
    create: { userId: client.id, points: 150 },
  });
  await prisma.customerProfile.upsert({
    where: { userId: client.id },
    update: {},
    create: { userId: client.id },
  });

  console.log("Seeded default users:");
  console.log("  Admin: admin@geleoteka.ru / admin123");
  console.log("  Client: client@test.ru / admin123");

  // ============================================
  // MASTERS — Users with isMaster=true + MasterProfile
  // ============================================
  for (const m of masters) {
    const masterUser = await prisma.user.upsert({
      where: { email: m.email },
      update: { name: m.name },
      create: {
        email: m.email,
        phone: m.phone,
        name: m.name,
        passwordHash: null,
        permissionRole: "NONE",
        isCustomer: false,
        isMaster: true,
      },
    });
    await prisma.masterProfile.upsert({
      where: { userId: masterUser.id },
      update: m.profile,
      create: { userId: masterUser.id, ...m.profile, isActive: true },
    });
  }
  console.log(`Seeded ${masters.length} master profiles`);

  // ============================================
  // PART CATEGORIES & PARTS
  // ============================================
  const categories = [
    { name: "Масла и жидкости", slug: "oils" },
    { name: "Фильтры", slug: "filters" },
    { name: "Тормозная система", slug: "brakes" },
    { name: "Подвеска", slug: "suspension" },
    { name: "Двигатель", slug: "engine" },
    { name: "Кузов и оптика", slug: "body" },
    { name: "Электрика", slug: "electric" },
    { name: "Трансмиссия", slug: "transmission" },
  ];

  for (const cat of categories) {
    await prisma.partCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { ...cat, sortOrder: categories.indexOf(cat) },
    });
  }
  console.log(`Seeded ${categories.length} part categories`);

  const oilsCat = await prisma.partCategory.findUnique({ where: { slug: "oils" } });
  const filtersCat = await prisma.partCategory.findUnique({ where: { slug: "filters" } });
  const brakesCat = await prisma.partCategory.findUnique({ where: { slug: "brakes" } });
  // Sample parts are inserted AFTER seedVehicleCatalog + seedTrims (see end of
  // main()) so they can reference real trim ids via partTrims links.
  const sampleParts = [
    { slug: "engine-oil-5w40", article: "A000989690613", name: "Масло моторное Mercedes 5W-40 (5л)", price: 6500, quantity: 25, isOEM: true, defaultTrims: ["g-class:W463", "g-class:W463A", "gle:W166", "gle:V167", "gls:X166", "gls:X167", "s-class:W222", "s-class:W223"], specificTrims: [] as Array<{ modelSlug: string; generationCode: string; trimCode: string }>, categoryId: oilsCat?.id, photos: [] as string[] },
    { slug: "engine-oil-0w40", article: "A000989690617", name: "Масло моторное Mercedes AMG 0W-40 (5л)", price: 8900, quantity: 10, isOEM: true, defaultTrims: ["g-class:W463"], specificTrims: [
      { modelSlug: "g-class", generationCode: "W463A", trimCode: "G 63 AMG" },
      { modelSlug: "c-class", generationCode: "W205", trimCode: "AMG C 63 S" },
      { modelSlug: "e-class", generationCode: "W213", trimCode: "AMG E 63 S" },
      { modelSlug: "amg-gt", generationCode: "C190", trimCode: "ALL" },
      { modelSlug: "gle", generationCode: "V167", trimCode: "AMG GLE 63 S" },
    ], categoryId: oilsCat?.id, photos: [] as string[] },
    { slug: "oil-filter-g", article: "A2761800009", name: "Фильтр масляный M176/M177", price: 1200, quantity: 30, isOEM: true, defaultTrims: ["g-class:W463", "s-class:W222", "s-class:W223"], specificTrims: [
      { modelSlug: "g-class", generationCode: "W463A", trimCode: "G 500" },
      { modelSlug: "g-class", generationCode: "W463A", trimCode: "G 63 AMG" },
      { modelSlug: "gle", generationCode: "V167", trimCode: "AMG GLE 63 S" },
    ], categoryId: filtersCat?.id, photos: [] as string[] },
    { slug: "air-filter-g463", article: "A4630940004", name: "Фильтр воздушный W463A", price: 3500, quantity: 15, isOEM: true, defaultTrims: ["g-class:W463A"], specificTrims: [], categoryId: filtersCat?.id, photos: [] as string[] },
    { slug: "brake-pads-front-g", article: "A4634210400", name: "Колодки тормозные передние G-Class", price: 12000, quantity: 8, isOEM: true, defaultTrims: ["g-class:W463", "g-class:W463A"], specificTrims: [], categoryId: brakesCat?.id, photos: [] as string[] },
    { slug: "brake-disc-front-g", article: "A4634210112", name: "Диск тормозной передний G-Class", price: 18500, quantity: 4, isOEM: true, defaultTrims: ["g-class:W463", "g-class:W463A"], specificTrims: [], categoryId: brakesCat?.id, photos: [] as string[] },
    { slug: "air-filter-analog-g", article: "MANN-C29028", name: "Фильтр воздушный W463A (MANN)", price: 1800, quantity: 20, isOEM: false, defaultTrims: ["g-class:W463A"], specificTrims: [], categoryId: filtersCat?.id, photos: [] as string[] },
    { slug: "brake-fluid-dot4", article: "A000989080720", name: "Жидкость тормозная DOT 4+ (1л)", price: 950, quantity: 40, isOEM: true, defaultTrims: ["g-class:W463", "g-class:W463A", "gle:W166", "gle:V167", "gls:X166", "gls:X167", "c-class:W205", "c-class:W206", "e-class:W213", "e-class:W214", "s-class:W222", "s-class:W223", "eqa:H243", "eqb:X243", "eqc:N293", "eqe:V295", "eqe:X294", "eqs:V297", "eqs:X296"], specificTrims: [], categoryId: brakesCat?.id, photos: [] as string[] },
  ];

  // ============================================
  // VEHICLES — fleet (RENTAL ownership type)
  // ============================================
  const rentalVehicles = [
    {
      model: "G 500",
      year: 2024,
      ownershipType: "RENTAL" as const,
      dailyRate: 35000,
      description: "Mercedes-Benz G 500 — легенда бездорожья. 4.0-литровый битурбо V8 в сочетании с полным приводом 4MATIC.",
      color: "Чёрный",
      mileage: 12000,
      photos: ["/images/rentals/g-black.jpg"],
      engine: "4.0 V8 Biturbo",
      horsepower: 422,
      transmission: "9G-TRONIC",
      features: ["Полный привод 4MATIC", "Кожаный салон Nappa", "Электрорегулировка сидений с памятью", "Климат-контроль 3-зонный", "Панорамная крыша", "Мультимедиа MBUX", "Камера 360°", "Адаптивный круиз-контроль"],
      seats: 5,
    },
    {
      model: "G 63 AMG",
      year: 2023,
      ownershipType: "RENTAL" as const,
      dailyRate: 55000,
      description: "Mercedes-AMG G 63 — ультимативная версия легенды. 585 лошадиных сил, разгон до 100 км/ч за 4.5 секунды.",
      color: "Белый",
      mileage: 18000,
      photos: ["/images/rentals/g-white.jpg"],
      engine: "4.0 V8 Biturbo AMG",
      horsepower: 585,
      transmission: "AMG SPEEDSHIFT TCT 9G",
      features: ["AMG RIDE CONTROL", "Спортивные сиденья AMG", "Выхлопная система Performance", "Керамические тормоза (опция)", "AMG Track Pace", "Burmester аудио 3D", "Подогрев/вентиляция сидений", "Массаж сидений"],
      seats: 5,
    },
    {
      model: "G 400d",
      year: 2024,
      ownershipType: "RENTAL" as const,
      dailyRate: 28000,
      description: "Mercedes-Benz G 400d — рациональный выбор для длинных маршрутов. Экономичный 3.0-литровый дизель.",
      color: "Серый",
      mileage: 8000,
      photos: ["/images/rentals/g-grey.jpg"],
      engine: "3.0 I6 Diesel",
      horsepower: 330,
      transmission: "9G-TRONIC",
      features: ["Полный привод 4MATIC", "Экономичный дизель", "Кожаный салон", "Навигация с пробками", "Парктроники 360°", "Активный круиз-контроль", "LED MULTIBEAM фары", "Память настроек водителя"],
      seats: 5,
    },
  ];

  for (const v of rentalVehicles) {
    const existing = await prisma.vehicle.findFirst({ where: { model: v.model, year: v.year, ownershipType: "RENTAL" } });
    if (existing) {
      await prisma.vehicle.update({ where: { id: existing.id }, data: v });
    } else {
      await prisma.vehicle.create({ data: v });
    }
  }
  console.log(`Seeded ${rentalVehicles.length} rental vehicles`);

  // ============================================
  // VEHICLE CATALOG — Manufacturer / Model / Generation
  // ============================================
  await seedVehicleCatalog(prisma);

  // ============================================
  // VEHICLE TRIMS — default trim per generation + curated trims for popular generations
  // ============================================
  await seedTrims(prisma);

  // ============================================
  // SAMPLE PARTS — must run after trim seed because parts link to trim ids
  // ============================================
  async function resolveTrimId(
    modelSlug: string,
    generationCode: string,
    trimCode: string,
  ): Promise<string | null> {
    const model = (await prisma.vehicleModel.findUnique({
      where: { slug: modelSlug },
      select: { id: true },
    })) as { id: string } | null;
    if (!model) return null;
    const generation = (await prisma.vehicleGeneration.findUnique({
      where: { modelId_code: { modelId: model.id, code: generationCode } },
      select: { id: true },
    })) as { id: string } | null;
    if (!generation) return null;
    const trim = (await prisma.vehicleTrim.findUnique({
      where: { generationId_code: { generationId: generation.id, code: trimCode } },
      select: { id: true },
    })) as { id: string } | null;
    return trim?.id ?? null;
  }

  for (const sp of sampleParts) {
    const trimIds = new Set<string>();
    for (const key of sp.defaultTrims) {
      const [modelSlug, generationCode] = key.split(":");
      const id = await resolveTrimId(modelSlug, generationCode, "ALL");
      if (id) trimIds.add(id);
      else console.warn(`  ↪ ${sp.article}: default trim not found for ${key}`);
    }
    for (const t of sp.specificTrims) {
      const id = await resolveTrimId(t.modelSlug, t.generationCode, t.trimCode);
      if (id) trimIds.add(id);
      else console.warn(`  ↪ ${sp.article}: specific trim not found for ${t.modelSlug}/${t.generationCode}/${t.trimCode}`);
    }

    // Idempotent: upsert the part, then sync its PartTrim rows.
    const part = await prisma.part.upsert({
      where: { article: sp.article },
      update: {
        slug: sp.slug,
        name: sp.name,
        price: sp.price,
        quantity: sp.quantity,
        isOEM: sp.isOEM,
        categoryId: sp.categoryId,
        photos: sp.photos,
        isActive: true,
      },
      create: {
        slug: sp.slug,
        article: sp.article,
        name: sp.name,
        price: sp.price,
        quantity: sp.quantity,
        isOEM: sp.isOEM,
        categoryId: sp.categoryId,
        photos: sp.photos,
        isActive: true,
      },
      select: { id: true },
    });
    const p = part as { id: string };

    // Sync PartTrim rows: clear and recreate to match the seed definition exactly.
    await prisma.partTrim.deleteMany({ where: { partId: p.id } });
    if (trimIds.size > 0) {
      await prisma.partTrim.createMany({
        data: Array.from(trimIds).map((trimId) => ({ partId: p.id, trimId })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`Seeded ${sampleParts.length} sample parts (with PartTrim links)`);

  console.log("Seeding complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
