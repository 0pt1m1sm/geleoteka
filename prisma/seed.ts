import { PrismaClient } from "../app/generated/prisma/client";
import bcrypt from "bcryptjs";

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
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
      "EQ",
    ],
  },
  {
    slug: "diagnostic",
    name: "Диагностика",
    description:
      "Полная компьютерная диагностика с использованием оригинального оборудования Mercedes-Benz STAR Diagnostics. Считывание кодов ошибок, проверка электронных систем, анализ состояния узлов и агрегатов.",
    priceMin: 5000,
    priceMax: 15000,
    durationMinutes: 60,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
      "EQ",
    ],
  },
  {
    slug: "repair",
    name: "Ремонт двигателя",
    description:
      "Капитальный и текущий ремонт двигателей M264, M256, M276, M278, OM654 и других. Диагностика неисправностей, замена цепей ГРМ, ремонт головки блока, замена прокладок и уплотнений.",
    priceMin: 15000,
    priceMax: 350000,
    durationMinutes: 480,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
    ],
  },
  {
    slug: "brakes",
    name: "Тормозная система",
    description:
      "Замена тормозных колодок, дисков, суппортов. Прокачка тормозной системы, замена тормозной жидкости. Диагностика ABS, ESP и системы автоматического торможения.",
    priceMin: 4500,
    priceMax: 80000,
    durationMinutes: 90,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
    ],
  },
  {
    slug: "suspension",
    name: "Подвеска",
    description:
      "Диагностика и ремонт пневмоподвески AIRMATIC, замена амортизаторов, рычагов, сайлентблоков. Регулировка углов установки колёс на стенде Hunter.",
    priceMin: 5500,
    priceMax: 120000,
    durationMinutes: 180,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
    ],
  },
  {
    slug: "conditioner",
    name: "Кондиционер",
    description:
      "Заправка кондиционера, диагностика герметичности, замена компрессора, конденсора, испарителя. Антибактериальная обработка салона.",
    priceMin: 3500,
    priceMax: 45000,
    durationMinutes: 60,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
      "EQ",
    ],
  },
  {
    slug: "transmission",
    name: "Трансмиссия",
    description:
      "Ремонт и обслуживание АКПП 9G-Tronic, 7G-Tronic, 4MATIC. Замена масла в коробке, ремонт мехатроника, замена сцепления.",
    priceMin: 8000,
    priceMax: 250000,
    durationMinutes: 240,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
    ],
  },
  {
    slug: "electric",
    name: "Электрика и электроника",
    description:
      "Диагностика и ремонт электрических систем: COMAND, MBUX, система освещения MULTIBEAM LED, парктроники, камеры, датчики. Программирование блоков управления.",
    priceMin: 5000,
    priceMax: 80000,
    durationMinutes: 120,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
      "EQ",
    ],
  },
  {
    slug: "body",
    name: "Кузовной ремонт",
    description:
      "Локальный и капитальный кузовной ремонт. Покраска с подбором цвета, рихтовка, замена элементов кузова. Полировка и защитные покрытия.",
    priceMin: 10000,
    priceMax: 500000,
    durationMinutes: 480,
    applicableModels: [
      "C-Class",
      "E-Class",
      "S-Class",
      "GLE",
      "GLS",
      "G-Class",
      "AMG",
      "EQ",
    ],
  },
];

const masters = [
  {
    name: "Алексей Петров",
    role: "Главный механик",
    bio: "Более 18 лет специализируется на двигателях Mercedes-Benz. Сертифицированный специалист STAR Diagnostics. Работал в официальном дилерском центре.",
    experience: 18,
    certifications: [
      "Mercedes-Benz STAR Certified",
      "AMG Performance Specialist",
    ],
    sortOrder: 1,
  },
  {
    name: "Дмитрий Козлов",
    role: "Специалист по электронике",
    bio: "12 лет опыта в диагностике и ремонте электронных систем. Эксперт по COMAND, MBUX, системам помощи водителю. Программирование блоков управления.",
    experience: 12,
    certifications: [
      "Mercedes-Benz Electronics Certified",
      "ADAS Calibration Specialist",
    ],
    sortOrder: 2,
  },
  {
    name: "Сергей Васильев",
    role: "Специалист по ходовой части",
    bio: "15 лет опыта в ремонте подвески и трансмиссии. Эксперт по пневмоподвеске AIRMATIC и системе 4MATIC. Регулировка углов установки колёс.",
    experience: 15,
    certifications: [
      "Hunter Alignment Certified",
      "AIRMATIC Specialist",
    ],
    sortOrder: 3,
  },
  {
    name: "Михаил Новиков",
    role: "Кузовной мастер",
    bio: "10 лет опыта в кузовном ремонте премиальных автомобилей. Покраска с подбором цвета, работа с алюминиевыми кузовными панелями.",
    experience: 10,
    certifications: [
      "Standox Certified Painter",
      "Aluminum Body Repair",
    ],
    sortOrder: 4,
  },
];

const cmsBlocks = [
  { key: "home.hero.title", content: { text: "Премиальное обслуживание" } },
  { key: "home.hero.subtitle", content: { text: "Онлайн-запись, отслеживание статуса в реальном времени, личный кабинет. Комфорт уровня G-Class." } },
  { key: "home.stats.years", content: { value: "15+" } },
  { key: "home.stats.cars", content: { value: "2 400+" } },
  { key: "home.stats.satisfaction", content: { value: "98%" } },
  { key: "home.stats.parts", content: { value: "3 500+" } },
  { key: "contacts.phone.service", content: { text: "+7 (495) 123-45-67" } },
  { key: "contacts.phone.parts", content: { text: "+7 (495) 123-45-68" } },
  { key: "contacts.email", content: { text: "info@geleoteka.ru" } },
  { key: "contacts.address", content: { text: "Москва, ул. Примерная, 15" } },
  { key: "contacts.hours.service", content: { text: "Пн–Пт: 9:00–20:00, Сб: 10:00–18:00" } },
  { key: "contacts.hours.parts", content: { text: "Пн–Пт: 9:00–19:00, Сб: 10:00–17:00" } },
];

async function main() {
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

  // Master profiles — delete and recreate for idempotency
  await prisma.masterProfile.deleteMany();
  await prisma.masterProfile.createMany({ data: masters });
  console.log(`Seeded ${masters.length} master profiles`);

  // CMS blocks
  for (const block of cmsBlocks) {
    await prisma.cMSBlock.upsert({
      where: { key: block.key },
      update: { content: block.content },
      create: block,
    });
  }
  console.log(`Seeded ${cmsBlocks.length} CMS blocks`);

  // Default users
  const passwordHash = await bcrypt.hash("admin123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@geleoteka.ru" },
    update: {},
    create: {
      email: "admin@geleoteka.ru",
      phone: "+79991234567",
      name: "Администратор",
      passwordHash,
      role: "ADMIN",
    },
  });
  await prisma.loyaltyAccount.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@test.ru" },
    update: {},
    create: {
      email: "client@test.ru",
      phone: "+79997654321",
      name: "Тестовый Клиент",
      passwordHash,
      role: "CLIENT",
    },
  });
  await prisma.loyaltyAccount.upsert({
    where: { userId: client.id },
    update: {},
    create: { userId: client.id, points: 150 },
  });

  console.log("Seeded default users:");
  console.log("  Admin: admin@geleoteka.ru / admin123");
  console.log("  Client: client@test.ru / admin123");

  // Part categories
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

  // Sample parts
  const oilsCat = await prisma.partCategory.findUnique({ where: { slug: "oils" } });
  const filtersCat = await prisma.partCategory.findUnique({ where: { slug: "filters" } });
  const brakesCat = await prisma.partCategory.findUnique({ where: { slug: "brakes" } });

  // Parts photos: empty for now — admin uploads real product photos via the admin panel
  const sampleParts = [
    { slug: "engine-oil-5w40", article: "A000989690613", name: "Масло моторное Mercedes 5W-40 (5л)", price: 6500, quantity: 25, isOEM: true, compatibleModels: ["G-Class", "GLE", "GLS", "S-Class"], categoryId: oilsCat?.id, photos: [] as string[] },
    { slug: "engine-oil-0w40", article: "A000989690617", name: "Масло моторное Mercedes AMG 0W-40 (5л)", price: 8900, quantity: 10, isOEM: true, compatibleModels: ["G-Class", "AMG"], categoryId: oilsCat?.id, photos: [] as string[] },
    { slug: "oil-filter-g", article: "A2761800009", name: "Фильтр масляный M176/M177", price: 1200, quantity: 30, isOEM: true, compatibleModels: ["G-Class", "AMG", "S-Class"], categoryId: filtersCat?.id, photos: [] as string[] },
    { slug: "air-filter-g463", article: "A4630940004", name: "Фильтр воздушный W464", price: 3500, quantity: 15, isOEM: true, compatibleModels: ["G-Class"], categoryId: filtersCat?.id, photos: [] as string[] },
    { slug: "brake-pads-front-g", article: "A4634210400", name: "Колодки тормозные передние G-Class", price: 12000, quantity: 8, isOEM: true, compatibleModels: ["G-Class"], categoryId: brakesCat?.id, photos: [] as string[] },
    { slug: "brake-disc-front-g", article: "A4634210112", name: "Диск тормозной передний G-Class", price: 18500, quantity: 4, isOEM: true, compatibleModels: ["G-Class"], categoryId: brakesCat?.id, photos: [] as string[] },
    { slug: "air-filter-analog-g", article: "MANN-C29028", name: "Фильтр воздушный W464 (MANN)", price: 1800, quantity: 20, isOEM: false, compatibleModels: ["G-Class"], categoryId: filtersCat?.id, photos: [] as string[] },
    { slug: "brake-fluid-dot4", article: "A000989080720", name: "Жидкость тормозная DOT 4+ (1л)", price: 950, quantity: 40, isOEM: true, compatibleModels: ["G-Class", "GLE", "GLS", "C-Class", "E-Class", "S-Class", "AMG", "EQ"], categoryId: brakesCat?.id, photos: [] as string[] },
  ];

  for (const part of sampleParts) {
    await prisma.part.upsert({
      where: { article: part.article },
      update: { ...part, isActive: true },
      create: { ...part, isActive: true },
    });
  }
  console.log(`Seeded ${sampleParts.length} sample parts`);

  // Sample rental cars
  const rentalCars = [
    { model: "G 500", year: 2024, dailyRate: 35000, description: "Mercedes-Benz G 500 — легенда бездорожья. Идеален для поездок за город.", color: "Чёрный", mileage: 12000, photos: ["/images/rentals/g-black.jpg"] },
    { model: "G 63 AMG", year: 2023, dailyRate: 55000, description: "Mercedes-AMG G 63 — 585 л.с., адреналин в каждом повороте.", color: "Белый", mileage: 18000, photos: ["/images/rentals/g-white.jpg"] },
    { model: "G 400d", year: 2024, dailyRate: 28000, description: "Mercedes-Benz G 400d — экономичный дизель для длинных маршрутов.", color: "Серый", mileage: 8000, photos: ["/images/rentals/g-grey.jpg"] },
  ];

  for (const car of rentalCars) {
    const existing = await prisma.rentalCar.findFirst({ where: { model: car.model, year: car.year } });
    if (!existing) {
      await prisma.rentalCar.create({ data: { ...car } });
    }
  }
  console.log(`Seeded ${rentalCars.length} rental cars`);

  console.log("Seeding complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
