/**
 * CMS_SCHEMA — single source of truth for every editable static-content key on
 * the public site. The admin /admin/cms UI, the public-page readers, the
 * server-action validator, and the seed all read from this registry. To add a
 * new editable string/list/markdown block:
 *   1. Add an entry below.
 *   2. Reference the key from the public-page JSX via `getCMSText` /
 *      `getCMSRichtext` / `getCMSList`.
 *   3. Run `npx prisma db seed` to write the default into the DB.
 *
 * Never query CMSBlock by key without going through `lib/cms.ts` — those
 * helpers fall back to `defaultValue` when the row is missing, keeping the
 * site rendering even before the seed runs.
 */

export type CMSBlockType = "text" | "richtext" | "list";

export type CMSGroup =
  | "home"
  | "about"
  | "services"
  | "contacts"
  | "vacancies"
  | "footer"
  | "cookie"
  | "fab";

export interface CMSListField {
  key: string;
  label: string;
  type: "text" | "richtext" | "url" | "color";
}

interface CMSTextDef {
  type: "text";
  group: CMSGroup;
  label: string;
  defaultValue: string;
}

interface CMSRichtextDef {
  type: "richtext";
  group: CMSGroup;
  label: string;
  defaultValue: string;
  helperText?: string;
}

interface CMSListDef {
  type: "list";
  group: CMSGroup;
  label: string;
  fields: readonly CMSListField[];
  defaultValue: ReadonlyArray<Record<string, string>>;
}

export type CMSDef = CMSTextDef | CMSRichtextDef | CMSListDef;

export const GROUP_LABELS: Record<CMSGroup, string> = {
  home: "Главная",
  about: "О нас",
  services: "Услуги (обзор)",
  contacts: "Контакты",
  vacancies: "Вакансии",
  footer: "Подвал",
  cookie: "Cookie-баннер",
  fab: "Плавающие кнопки",
};

/** Display order for admin sections — keep stable so admin muscle memory works. */
export const GROUP_ORDER: readonly CMSGroup[] = [
  "home",
  "about",
  "services",
  "contacts",
  "vacancies",
  "footer",
  "fab",
  "cookie",
];

const FAQ_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    question: "Какие модели Mercedes-Benz вы обслуживаете?",
    answer:
      "Мы обслуживаем весь модельный ряд: C, E, S-Class, GLE, GLS, G-Class, линейку AMG и электрические EQ. Также работаем со старыми моделями W124, W140 и другими.",
  },
  {
    question: "Используете ли вы оригинальные запчасти?",
    answer:
      "Да, мы используем только оригинальные запчасти Mercedes-Benz (OEM). По индивидуальному запросу можем подобрать альтернативы от проверенных производителей с гарантией.",
  },
  {
    question: "Сколько времени занимает ТО?",
    answer:
      "Стандартное техобслуживание занимает 2–3 часа. Вы можете подождать в зоне отдыха или оставить автомобиль на день. Точное время зависит от модели и объёма работ.",
  },
  {
    question: "Есть ли гарантия на работы?",
    answer:
      "Да, мы предоставляем гарантию на выполненные работы — 12 месяцев или 20 000 км пробега. Гарантия на запчасти определяется производителем. Подробные условия — в договоре.",
  },
  {
    question: "Можно ли отслеживать статус ремонта?",
    answer:
      "Да. После записи вы получаете доступ к личному кабинету, где в реальном времени видите статус вашего автомобиля — от приёмки до готовности. Также получаете SMS при каждой смене статуса.",
  },
  {
    question: "Как записаться на сервис?",
    answer:
      "Через онлайн-форму на сайте (самый быстрый способ), по телефону, указанному в шапке и в подвале сайта, или через WhatsApp/Telegram. После записи вам придёт SMS с подтверждением.",
  },
];

const WHYUS_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    title: "Только Mercedes-Benz",
    desc: "Узкая специализация — глубокое знание каждой модели, каждого двигателя, каждой системы.",
  },
  {
    title: "STAR Diagnostics",
    desc: "Оригинальное диагностическое оборудование Mercedes-Benz. Считываем то, что другие не видят.",
  },
  {
    title: "Оригинальные запчасти",
    desc: "Используем только OEM-запчасти. Качественные аналоги — по согласованию с клиентом.",
  },
  {
    title: "Прозрачные цены",
    desc: "Смета до начала работ. Никаких сюрпризов в счёте. Согласование каждой позиции.",
  },
  {
    title: "Личный кабинет",
    desc: "Отслеживайте статус ремонта онлайн. SMS при каждой смене статуса.",
  },
  {
    title: "Гарантия 12 месяцев",
    desc: "Только на работы — 12 месяцев или 20 000 км пробега. Условия в договоре.",
  },
];

const HISTORY_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    year: "2009",
    title: "Основание",
    text: "Открытие первого сервисного поста. Два мастера, одна мечта — лучший сервис для Mercedes.",
  },
  {
    year: "2014",
    title: "Расширение",
    text: "Переезд в новый цех на 6 постов. Получение сертификации STAR Diagnostics.",
  },
  {
    year: "2018",
    title: "AMG-сертификация",
    text: "Первые в регионе получили сертификацию на обслуживание линейки AMG.",
  },
  {
    year: "2022",
    title: "EQ-направление",
    text: "Оборудование для обслуживания электрических моделей EQ. Сертификация по электробезопасности.",
  },
  {
    year: "2026",
    title: "Цифровая платформа",
    text: "Запуск онлайн-платформы: личный кабинет, отслеживание статуса, онлайн-запись.",
  },
];

const VACANCIES_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    title: "Автомеханик (G-Class)",
    type: "Полная занятость",
    description:
      "Ремонт и обслуживание Mercedes-Benz G-Class. Опыт работы от 3 лет. Знание STAR Diagnostics — преимущество.",
    requirements:
      "- Опыт ремонта Mercedes от 3 лет\n- Знание подвески, двигателей, трансмиссий\n- Готовность к обучению",
  },
  {
    title: "Автоэлектрик",
    type: "Полная занятость",
    description:
      "Диагностика и ремонт электрических систем Mercedes-Benz. COMAND, MBUX, системы помощи водителю.",
    requirements:
      "- Опыт работы с электрикой Mercedes\n- Знание CAN/LIN шин\n- Умение работать с STAR Diagnostics",
  },
  {
    title: "Сервисный консультант",
    type: "Полная занятость",
    description:
      "Приём клиентов, оформление заказ-нарядов, контроль качества обслуживания. Опыт в автосервисе приветствуется.",
    requirements:
      "- Коммуникабельность и клиентоориентированность\n- Опыт в автосервисе от 1 года\n- Знание модельного ряда Mercedes — плюс",
  },
];

const HOWTO_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    title: "На автомобиле",
    body: "Съезд с МКАД, 500 м. Бесплатная парковка перед сервисом.",
  },
  {
    title: "На метро",
    body: "Уточните маршрут по телефону, указанному в разделе «Контакты».",
  },
  {
    title: "На такси",
    body: "Назовите адрес из карточки контактов. Въезд через шлагбаум — назовите номер записи.",
  },
];

const FOOTER_SERVICES_DEFAULT: ReadonlyArray<Record<string, string>> = [
  { label: "Техобслуживание", href: "/services/to" },
  { label: "Диагностика", href: "/services/diagnostic" },
  { label: "Ремонт", href: "/services/repair" },
  { label: "Все услуги →", href: "/services" },
];

const FAB_CHANNELS_DEFAULT: ReadonlyArray<Record<string, string>> = [
  { name: "Telegram", href: "https://t.me/geleoteka", color: "#229ED9", iconKey: "telegram" },
  { name: "WhatsApp", href: "https://wa.me/74951234567", color: "#25D366", iconKey: "whatsapp" },
  { name: "Max", href: "https://max.ru/geleoteka", color: "#E60023", iconKey: "max" },
];

export const CMS_SCHEMA = {
  // ── HOME — Hero (left half, "Сервис")
  "home.hero.left.eyebrow": {
    type: "text",
    group: "home",
    label: "Hero — левая колонка — надзаголовок",
    defaultValue: "Сервис",
  },
  "home.hero.left.title": {
    type: "text",
    group: "home",
    label: "Hero — левая колонка — заголовок",
    defaultValue: "Сервис в Москве",
  },
  "home.hero.left.lede": {
    type: "richtext",
    group: "home",
    label: "Hero — левая колонка — описание",
    defaultValue:
      "ТО, диагностика, ремонт. Прозрачные цены, гарантия на работы 12 месяцев.",
  },
  "home.hero.left.cta": {
    type: "text",
    group: "home",
    label: "Hero — левая колонка — кнопка",
    defaultValue: "Записаться на сервис",
  },
  "home.hero.left.secondary.label": {
    type: "text",
    group: "home",
    label: "Hero — левая колонка — вторичная ссылка",
    defaultValue: "Прайс на работы →",
  },
  "home.hero.left.secondary.href": {
    type: "text",
    group: "home",
    label: "Hero — левая колонка — адрес вторичной ссылки",
    defaultValue: "/services",
  },
  "home.hero.left.disclaimer": {
    type: "richtext",
    group: "home",
    label: "Hero — левая колонка — мелкий текст под кнопкой",
    defaultValue:
      "Подробнее в [условиях договора](/about#warranty).",
  },

  // ── HOME — Hero (right half, "Запчасти")
  "home.hero.right.eyebrow": {
    type: "text",
    group: "home",
    label: "Hero — правая колонка — надзаголовок",
    defaultValue: "Запчасти",
  },
  "home.hero.right.title": {
    type: "text",
    group: "home",
    label: "Hero — правая колонка — заголовок",
    defaultValue: "Магазин запчастей",
  },
  "home.hero.right.lede": {
    type: "text",
    group: "home",
    label: "Hero — правая колонка — описание",
    defaultValue: "Оригинал. Подбор по вашему автомобилю.",
  },
  "home.hero.right.cta": {
    type: "text",
    group: "home",
    label: "Hero — правая колонка — кнопка",
    defaultValue: "В каталог запчастей",
  },

  // ── HOME — Stats (existing keys keep their dot-namespaced values; new label keys)
  "home.stats.years": {
    type: "text",
    group: "home",
    label: "Статистика — лет опыта (значение)",
    defaultValue: "15+",
  },
  "home.stats.years.label": {
    type: "text",
    group: "home",
    label: "Статистика — лет опыта (подпись)",
    defaultValue: "Лет опыта",
  },
  "home.stats.cars": {
    type: "text",
    group: "home",
    label: "Статистика — авто в год (значение)",
    defaultValue: "2 400+",
  },
  "home.stats.cars.label": {
    type: "text",
    group: "home",
    label: "Статистика — авто в год (подпись)",
    defaultValue: "Авто в год",
  },
  "home.stats.satisfaction": {
    type: "text",
    group: "home",
    label: "Статистика — довольных клиентов (значение)",
    defaultValue: "98%",
  },
  "home.stats.satisfaction.label": {
    type: "text",
    group: "home",
    label: "Статистика — довольных клиентов (подпись)",
    defaultValue: "Довольных клиентов",
  },
  "home.stats.parts": {
    type: "text",
    group: "home",
    label: "Статистика — запчастей (значение)",
    defaultValue: "3 500+",
  },
  "home.stats.parts.label": {
    type: "text",
    group: "home",
    label: "Статистика — запчастей (подпись)",
    defaultValue: "Запчастей в наличии",
  },

  // ── HOME — Why us
  "home.whyus.title": {
    type: "text",
    group: "home",
    label: "Почему мы — заголовок",
    defaultValue: "Почему мы",
  },
  "home.whyus.items": {
    type: "list",
    group: "home",
    label: "Почему мы — карточки",
    fields: [
      { key: "title", label: "Заголовок", type: "text" },
      { key: "desc", label: "Описание", type: "richtext" },
    ],
    defaultValue: WHYUS_DEFAULT,
  },

  // ── HOME — FAQ
  "home.faq.title": {
    type: "text",
    group: "home",
    label: "FAQ — заголовок",
    defaultValue: "Частые вопросы",
  },
  "home.faq.items": {
    type: "list",
    group: "home",
    label: "FAQ — список вопросов",
    fields: [
      { key: "question", label: "Вопрос", type: "text" },
      { key: "answer", label: "Ответ (markdown)", type: "richtext" },
    ],
    defaultValue: FAQ_DEFAULT,
  },

  // ── HOME — Reviews section
  "home.reviews.title": {
    type: "text",
    group: "home",
    label: "Отзывы — заголовок",
    defaultValue: "Отзывы клиентов",
  },
  "home.reviews.subtitle": {
    type: "text",
    group: "home",
    label: "Отзывы — подзаголовок",
    defaultValue: "Что пишут владельцы G-Class и других Mercedes-Benz после визита",
  },

  // ── HOME — CTA banner
  "home.cta.title": {
    type: "text",
    group: "home",
    label: "CTA — заголовок",
    defaultValue: "Готовы записаться?",
  },
  "home.cta.subtitle": {
    type: "richtext",
    group: "home",
    label: "CTA — подзаголовок",
    defaultValue:
      "Заполните форму онлайн — это займёт 2 минуты. Мы перезвоним для подтверждения.",
  },
  "home.cta.button": {
    type: "text",
    group: "home",
    label: "CTA — кнопка",
    defaultValue: "Онлайн-запись",
  },

  // ── HOME — legacy hero text/subtitle keys (kept for back-compat with seed history)
  "home.hero.title": {
    type: "text",
    group: "home",
    label: "(legacy) Hero — заголовок",
    defaultValue: "Премиальное обслуживание",
  },
  "home.hero.subtitle": {
    type: "text",
    group: "home",
    label: "(legacy) Hero — подзаголовок",
    defaultValue:
      "Онлайн-запись, отслеживание статуса в реальном времени, личный кабинет. Комфорт уровня G-Class.",
  },

  // ── ABOUT
  "about.eyebrow": {
    type: "text",
    group: "about",
    label: "О нас — надзаголовок",
    defaultValue: "О компании",
  },
  "about.title": {
    type: "text",
    group: "about",
    label: "О нас — заголовок",
    defaultValue: "О нас",
  },
  "about.description": {
    type: "text",
    group: "about",
    label: "О нас — описание",
    defaultValue:
      "Специализированный сервис Mercedes-Benz с 2009 года. Сертифицированные мастера, оригинальные запчасти, прозрачное ценообразование.",
  },
  "about.history.title": {
    type: "text",
    group: "about",
    label: "История — заголовок",
    defaultValue: "История",
  },
  "about.history.items": {
    type: "list",
    group: "about",
    label: "История — записи",
    fields: [
      { key: "year", label: "Год", type: "text" },
      { key: "title", label: "Заголовок", type: "text" },
      { key: "text", label: "Описание (markdown)", type: "richtext" },
    ],
    defaultValue: HISTORY_DEFAULT,
  },
  "about.team.title": {
    type: "text",
    group: "about",
    label: "Команда — заголовок",
    defaultValue: "Команда",
  },
  "about.certificates.title": {
    type: "text",
    group: "about",
    label: "Сертификаты — заголовок",
    defaultValue: "Сертификаты и лицензии",
  },
  "about.certificates.body": {
    type: "richtext",
    group: "about",
    label: "Сертификаты — текст",
    defaultValue:
      "Все мастера проходят регулярное обучение и сертификацию. Мы используем только оригинальное диагностическое оборудование Mercedes-Benz.",
  },

  // ── SERVICES (overview page)
  "services.eyebrow": {
    type: "text",
    group: "services",
    label: "Услуги (обзор) — надзаголовок",
    defaultValue: "Сервис",
  },
  "services.title": {
    type: "text",
    group: "services",
    label: "Услуги (обзор) — заголовок",
    defaultValue: "Услуги",
  },
  "services.description": {
    type: "text",
    group: "services",
    label: "Услуги (обзор) — описание",
    defaultValue:
      "Полный спектр работ по обслуживанию и ремонту автомобилей Mercedes-Benz",
  },
  "services.cta.text": {
    type: "richtext",
    group: "services",
    label: "Услуги (обзор) — текст под списком",
    defaultValue: "Не нашли нужную услугу? Свяжитесь с нами.",
  },
  "services.cta.button": {
    type: "text",
    group: "services",
    label: "Услуги (обзор) — кнопка",
    defaultValue: "Контакты",
  },

  // ── CONTACTS — existing seeded values stay; their group is "contacts"
  "contacts.phone.service": {
    type: "text",
    group: "contacts",
    label: "Телефон — сервис",
    defaultValue: "+7 (495) 123-45-67",
  },
  "contacts.phone.parts": {
    type: "text",
    group: "contacts",
    label: "Телефон — запчасти",
    defaultValue: "+7 (495) 123-45-68",
  },
  "contacts.email": {
    type: "text",
    group: "contacts",
    label: "Email",
    defaultValue: "info@geleoteka.ru",
  },
  "contacts.address": {
    type: "text",
    group: "contacts",
    label: "Адрес",
    defaultValue: "Москва, ул. Примерная, 15",
  },
  "contacts.hours.service": {
    type: "text",
    group: "contacts",
    label: "Часы работы — сервис",
    defaultValue: "Пн–Пт: 9:00–20:00, Сб: 10:00–18:00",
  },
  "contacts.hours.parts": {
    type: "text",
    group: "contacts",
    label: "Часы работы — запчасти",
    defaultValue: "Пн–Пт: 9:00–19:00, Сб: 10:00–17:00",
  },
  "contacts.eyebrow": {
    type: "text",
    group: "contacts",
    label: "Контакты (страница) — надзаголовок",
    defaultValue: "Контакты",
  },
  "contacts.title": {
    type: "text",
    group: "contacts",
    label: "Контакты (страница) — заголовок",
    defaultValue: "Свяжитесь с нами",
  },
  "contacts.description": {
    type: "text",
    group: "contacts",
    label: "Контакты (страница) — описание",
    defaultValue: "Свяжитесь с нами или приезжайте — мы всегда рады помочь",
  },
  "contacts.map.url": {
    type: "text",
    group: "contacts",
    label: "Ссылка на точку в Яндекс.Картах (или iframe SRC из «Поделиться → HTML-код»)",
    defaultValue: "https://yandex.com/map-widget/v1/?ll=37.4357%2C55.8951&z=17&pt=37.4357%2C55.8951%2Cpm2rdm",
  },
  "contacts.howto.title": {
    type: "text",
    group: "contacts",
    label: "Как добраться — заголовок",
    defaultValue: "Как добраться",
  },
  "contacts.howto.items": {
    type: "list",
    group: "contacts",
    label: "Как добраться — карточки",
    fields: [
      { key: "title", label: "Заголовок", type: "text" },
      { key: "body", label: "Описание (markdown)", type: "richtext" },
    ],
    defaultValue: HOWTO_DEFAULT,
  },

  // ── VACANCIES
  "vacancies.eyebrow": {
    type: "text",
    group: "vacancies",
    label: "Вакансии — надзаголовок",
    defaultValue: "Карьера",
  },
  "vacancies.title": {
    type: "text",
    group: "vacancies",
    label: "Вакансии — заголовок",
    defaultValue: "Вакансии",
  },
  "vacancies.description": {
    type: "text",
    group: "vacancies",
    label: "Вакансии — описание",
    defaultValue:
      "Присоединяйтесь к команде Geleoteka — работайте с лучшими автомобилями в мире",
  },
  "vacancies.items": {
    type: "list",
    group: "vacancies",
    label: "Вакансии — список",
    fields: [
      { key: "title", label: "Должность", type: "text" },
      { key: "type", label: "Тип занятости", type: "text" },
      { key: "description", label: "Описание", type: "richtext" },
      {
        key: "requirements",
        label: "Требования (по одной строке через перенос или маркеры -)",
        type: "richtext",
      },
    ],
    defaultValue: VACANCIES_DEFAULT,
  },
  "vacancies.cta.title": {
    type: "text",
    group: "vacancies",
    label: "Вакансии — CTA заголовок",
    defaultValue: "Не нашли подходящую вакансию?",
  },
  "vacancies.cta.body": {
    type: "richtext",
    group: "vacancies",
    label: "Вакансии — CTA текст",
    defaultValue:
      "Отправьте резюме на [hr@geleoteka.ru](mailto:hr@geleoteka.ru) — мы всегда рассматриваем сильных кандидатов.",
  },
  "vacancies.cta.button": {
    type: "text",
    group: "vacancies",
    label: "Вакансии — CTA кнопка",
    defaultValue: "Контакты",
  },

  // ── FOOTER
  "footer.description": {
    type: "richtext",
    group: "footer",
    label: "Подвал — описание",
    defaultValue:
      "Специализированный сервис Mercedes-Benz. Опыт работы более 15 лет, сертифицированные мастера, оригинальные запчасти.",
  },
  "footer.services.title": {
    type: "text",
    group: "footer",
    label: "Подвал — заголовок «Услуги»",
    defaultValue: "Услуги",
  },
  "footer.services.items": {
    type: "list",
    group: "footer",
    label: "Подвал — ссылки услуг",
    fields: [
      { key: "label", label: "Название", type: "text" },
      { key: "href", label: "Адрес", type: "url" },
    ],
    defaultValue: FOOTER_SERVICES_DEFAULT,
  },
  "footer.contacts.title": {
    type: "text",
    group: "footer",
    label: "Подвал — заголовок «Контакты»",
    defaultValue: "Контакты",
  },
  "footer.copyright": {
    type: "text",
    group: "footer",
    label: "Подвал — копирайт (без года)",
    defaultValue: "Geleoteka. Все права защищены.",
  },

  // ── COOKIE
  "cookie.banner.text": {
    type: "richtext",
    group: "cookie",
    label: "Cookie — текст",
    defaultValue:
      "Мы используем файлы cookie для улучшения работы сайта. Продолжая пользоваться сайтом, вы соглашаетесь с политикой обработки персональных данных (152-ФЗ).",
  },
  "cookie.banner.button": {
    type: "text",
    group: "cookie",
    label: "Cookie — кнопка",
    defaultValue: "Принять",
  },

  // ── FAB
  "fab.channels": {
    type: "list",
    group: "fab",
    label: "Каналы связи (FAB)",
    fields: [
      { key: "name", label: "Название", type: "text" },
      { key: "href", label: "Ссылка", type: "url" },
      { key: "color", label: "Цвет", type: "color" },
      { key: "iconKey", label: "Иконка (telegram | whatsapp | max)", type: "text" },
    ],
    defaultValue: FAB_CHANNELS_DEFAULT,
  },
} as const satisfies Record<string, CMSDef>;

export type CMSKey = keyof typeof CMS_SCHEMA;

/** Narrow helper: returns the runtime shape of `content` for a given key. */
export type CMSValue<K extends CMSKey> = (typeof CMS_SCHEMA)[K] extends {
  type: "text";
}
  ? string
  : (typeof CMS_SCHEMA)[K] extends { type: "richtext" }
    ? string
    : (typeof CMS_SCHEMA)[K] extends { type: "list" }
      ? Array<Record<string, string>>
      : never;

/** Group → ordered list of keys belonging to that group. */
export function keysByGroup(group: CMSGroup): CMSKey[] {
  return (Object.keys(CMS_SCHEMA) as CMSKey[]).filter(
    (k) => CMS_SCHEMA[k].group === group,
  );
}

/** All keys in display order (group order, then within-group definition order). */
export function allKeysInDisplayOrder(): CMSKey[] {
  const out: CMSKey[] = [];
  for (const g of GROUP_ORDER) out.push(...keysByGroup(g));
  return out;
}
