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

export type CMSBlockType = "text" | "richtext" | "list" | "image";

export type CMSGroup =
  | "home"
  | "about"
  | "services"
  | "catalog"
  | "rentals"
  | "contacts"
  | "vacancies"
  | "footer"
  | "cookie"
  | "fab"
  | "requisites";

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

interface CMSImageDef {
  type: "image";
  group: CMSGroup;
  label: string;
  defaultValue: string;
  helperText?: string;
}

export type CMSDef = CMSTextDef | CMSRichtextDef | CMSListDef | CMSImageDef;

export const GROUP_LABELS: Record<CMSGroup, string> = {
  home: "Главная",
  about: "О нас",
  services: "Услуги (обзор)",
  catalog: "Каталог (модели и запчасти)",
  rentals: "Аренда",
  contacts: "Контакты",
  vacancies: "Вакансии",
  footer: "Подвал",
  cookie: "Cookie-баннер",
  fab: "Плавающие кнопки",
  requisites: "Реквизиты организации",
};

/** Display order for admin sections — keep stable so admin muscle memory works. */
export const GROUP_ORDER: readonly CMSGroup[] = [
  "home",
  "about",
  "services",
  "catalog",
  "rentals",
  "contacts",
  "requisites",
  "vacancies",
  "footer",
  "fab",
  "cookie",
];

const FAQ_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    question: "Какие автомобили вы обслуживаете?",
    answer:
      "Уточните марки и модели, с которыми работаете, — этот ответ редактируется в админке. По конкретной модели всегда можно спросить по телефону или через онлайн-запись.",
  },
  {
    question: "Используете ли вы оригинальные запчасти?",
    answer:
      "Да, мы используем оригинальные запчасти. По согласованию с клиентом можем подобрать качественные аналоги от проверенных производителей — с гарантией.",
  },
  {
    question: "Сколько времени занимает ТО?",
    answer:
      "Стандартное техобслуживание занимает 2–3 часа. Вы можете подождать в зоне отдыха или оставить автомобиль на день. Точное время зависит от модели и объёма работ.",
  },
  {
    question: "Есть ли гарантия на работы?",
    answer:
      "Да, мы даём гарантию на выполненные работы. Гарантия на запчасти определяется производителем, подробные условия — в договоре.",
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
    title: "Профильный сервис",
    desc: "Узкая специализация — глубокое знание каждой модели, каждого двигателя, каждой системы.",
  },
  {
    title: "Заводская диагностика",
    desc: "Оригинальное диагностическое оборудование. Считываем то, что другие не видят.",
  },
  {
    title: "Оригинальные запчасти",
    desc: "Используем оригинальные запчасти. Качественные аналоги — по согласованию с клиентом.",
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
    title: "Гарантия на работы",
    desc: "Срок гарантии и её условия — в договоре.",
  },
];

/**
 * История сервиса — пустая по умолчанию.
 *
 * Раньше здесь стояла хроника первого клиента с годами и сертификациями.
 * Новому сервису она не просто не подходит — она про него неправда. Раздел на
 * странице «О нас» показывается, только когда записи есть.
 */
const HISTORY_DEFAULT: ReadonlyArray<Record<string, string>> = [];

const VACANCIES_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    title: "Автомеханик",
    type: "Полная занятость",
    description:
      "Ремонт и обслуживание автомобилей. Опыт работы от 3 лет. Знание диагностического оборудования — преимущество.",
    requirements:
      "- Опыт ремонта от 3 лет\n- Знание подвески, двигателей, трансмиссий\n- Готовность к обучению",
  },
  {
    title: "Автоэлектрик",
    type: "Полная занятость",
    description:
      "Диагностика и ремонт электрических систем: мультимедиа, системы помощи водителю, проводка.",
    requirements:
      "- Опыт работы с автомобильной электрикой\n- Знание CAN/LIN шин\n- Умение работать с диагностическим оборудованием",
  },
  {
    title: "Сервисный консультант",
    type: "Полная занятость",
    description:
      "Приём клиентов, оформление заказ-нарядов, контроль качества обслуживания. Опыт в автосервисе приветствуется.",
    requirements:
      "- Коммуникабельность и клиентоориентированность\n- Опыт в автосервисе от 1 года\n- Знание устройства автомобиля — плюс",
  },
];

const HOWTO_DEFAULT: ReadonlyArray<Record<string, string>> = [
  {
    title: "На автомобиле",
    body: "Опишите здесь, как доехать: ориентиры, съезд, парковка.",
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
  { label: "Статьи", href: "/blog" },
];

// Телефон мессенджеров и шаблон первого сообщения. Telegram по номеру
// не поддерживает предзаполненный текст — шаблон только у WhatsApp.
/**
 * Каналы быстрой связи — пусты по умолчанию.
 *
 * Раньше здесь стоял телефон первого клиента числом и ссылка на его аккаунт в
 * мессенджере: каждый следующий сервис получил бы кнопку «написать нам»,
 * ведущую к чужим людям. Пока каналы не заданы, кнопка не показывается вовсе
 * (`components/shared/FloatingButtons.tsx`).
 */
const FAB_CHANNELS_DEFAULT: ReadonlyArray<Record<string, string>> = [];

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
    defaultValue: "Сервис вашего автомобиля",
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
    defaultValue: "Что пишут клиенты после визита",
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

  "home.hero.image": {
    type: "image",
    group: "home",
    label: "Hero — фоновое изображение",
    helperText: "Полноэкранный фон главной. Рекомендуется 4К landscape, JPG/WebP.",
    defaultValue: "/images/hero/g-class-4k.jpg",
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
      "Онлайн-запись, отслеживание статуса в реальном времени, личный кабинет.",
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
      "Специализированный автосервис. Сертифицированные мастера, оригинальные запчасти, прозрачное ценообразование.",
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
      "Все мастера проходят регулярное обучение и сертификацию. Мы используем оригинальное диагностическое оборудование.",
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
      "Полный спектр работ по обслуживанию и ремонту автомобилей",
  },
  "services.cta.text": {
    type: "richtext",
    group: "services",
    label: "Услуги (обзор) — текст под списком",
    defaultValue: "Не нашли нужную услугу? Свяжитесь с нами.",
  },
  // Заголовки каталожных листингов — раньше жили хардкодом в TSX, из-за чего
  // подправить формулировку (или добавить город для SEO) без деплоя было
  // нельзя. Дефолты повторяют прежний текст с добавленной геопривязкой.
  "catalog.models.title": {
    type: "text",
    group: "catalog",
    label: "Модели — заголовок",
    defaultValue: "Модели, которые мы обслуживаем",
  },
  "catalog.models.description": {
    type: "text",
    group: "catalog",
    label: "Модели — описание",
    defaultValue:
      "Выберите свою модель, чтобы посмотреть доступные услуги и их стоимость.",
  },
  "catalog.parts.title": {
    type: "text",
    group: "catalog",
    label: "Запчасти — заголовок",
    defaultValue: "Запчасти",
  },
  "catalog.parts.subtitle": {
    type: "text",
    group: "catalog",
    label: "Запчасти — подзаголовок",
    defaultValue:
      "Оригинальные запчасти и качественные аналоги — в наличии и под заказ",
  },

  // ── АРЕНДА — самый ёмкий поисковый кластер сайта (~7 тыс. запросов/мес:
  // «аренда гелика» + «аренда гелендвагена» с московскими хвостами), поэтому
  // тексты страницы редактируются без деплоя, а дефолты закрывают обе
  // народные формы названия и хвосты «на сутки / с водителем / без водителя».
  "rentals.title": {
    type: "text",
    group: "rentals",
    label: "Аренда — заголовок",
    defaultValue: "Аренда автомобилей",
  },
  "rentals.description": {
    type: "text",
    group: "rentals",
    label: "Аренда — подзаголовок",
    defaultValue:
      "Автомобили на сутки и на любой срок — с водителем и без",
  },
  "rentals.seo.text": {
    type: "richtext",
    group: "rentals",
    label: "Аренда — SEO-текст под списком",
    defaultValue:
      "Арендовать автомобиль можно на сутки, на выходные или на длительный срок — как с водителем, так и без. Каждая машина в парке обслуживается в нашем собственном сервисе, а не «где придётся».\n\nАренда подходит и для повседневных задач, и для событий: поездка в другой город, съёмки, деловая встреча. Условия подачи, страховки и поддержки опишите здесь — этот текст редактируется в админке.\n\nЦена зависит от модели и срока: чем дольше срок, тем ниже стоимость суток. Точную стоимость на ваши даты видно в карточке автомобиля — бронирование онлайн за пару минут.",
  },
  "rentals.faq.items": {
    type: "list",
    group: "rentals",
    label: "Аренда — FAQ",
    fields: [
      { key: "question", label: "Вопрос", type: "text" },
      { key: "answer", label: "Ответ", type: "text" },
    ],
    defaultValue: [
      {
        question: "Сколько стоит аренда?",
        answer:
          "Стоимость зависит от модели и срока: цена за сутки указана в карточке каждого автомобиля, при аренде от недели действует сниженный тариф.",
      },
      {
        question: "Можно ли арендовать автомобиль без водителя?",
        answer:
          "Да, при соответствии требованиям: возраст от 25 лет, стаж от 3 лет, документ, удостоверяющий личность, и действующие права категории B. Вариант с водителем тоже доступен.",
      },
      {
        question: "Какой залог и когда он возвращается?",
        answer:
          "Залог фиксируется при выдаче автомобиля и возвращается после осмотра при возврате — обычно в тот же день.",
      },
      {
        question: "Входит ли страховка в стоимость?",
        answer: "Да, все автомобили застрахованы на весь срок аренды.",
      },
      {
        question: "Возможна ли аренда на мероприятие?",
        answer:
          "Да, аренда на мероприятия — с водителем или без — частый запрос. Согласуем время подачи и маршрут заранее.",
      },
    ],
  },
  "rentals.terms.items": {
    type: "list",
    group: "rentals",
    label: "Аренда — условия (карточка автомобиля)",
    fields: [
      { key: "title", label: "Заголовок", type: "text" },
      { key: "subtitle", label: "Пояснение", type: "text" },
    ],
    defaultValue: [
      {
        title: "Страховка включена",
        subtitle: "Страховая защита на весь срок аренды",
      },
      { title: "Поддержка 24/7", subtitle: "Техническая поддержка в любое время" },
      {
        title: "Доставка автомобиля",
        subtitle: "За дополнительную плату — уточните зону подачи",
      },
      {
        title: "Залог по договору",
        subtitle: "Возвращается после осмотра автомобиля",
      },
    ],
  },
  "rentals.requirements.items": {
    type: "list",
    group: "rentals",
    label: "Аренда — требования к водителю",
    fields: [{ key: "text", label: "Требование", type: "text" }],
    defaultValue: [
      { text: "Возраст от 25 лет" },
      { text: "Водительский стаж от 3 лет" },
      { text: "Документ, удостоверяющий личность, и действующее в/у категории B" },
      { text: "Залог по договору" },
    ],
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
    defaultValue: "+7 (963) 768-06-42",
  },
  "contacts.phone.parts": {
    type: "text",
    group: "contacts",
    label: "Телефон — запчасти",
    defaultValue: "+7 (963) 768-06-42",
  },
  "contacts.email": {
    type: "text",
    group: "contacts",
    label: "Email",
    defaultValue: "",
  },
  "contacts.address": {
    type: "text",
    group: "contacts",
    label: "Адрес",
    defaultValue: "Московская область, Химки, Пролетарская улица, 18к1",
  },
  "contacts.hours.service": {
    type: "text",
    group: "contacts",
    label: "Часы работы — сервис",
    defaultValue: "Пн–Пт: 10:00–20:00, Сб: 10:00–16:00, Вс: выходной",
  },
  "contacts.hours.parts": {
    type: "text",
    group: "contacts",
    label: "Часы работы — запчасти",
    defaultValue: "Пн–Пт: 10:00–20:00, Сб: 10:00–16:00, Вс: выходной",
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
    // Пусто по умолчанию: координаты и номер организации — данные конкретного
    // сервиса. Карта на странице контактов появляется, когда ссылка задана.
    defaultValue: "",
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
      "Присоединяйтесь к нашей команде",
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
      "Отправьте резюме на адрес, указанный в контактах, — мы всегда рассматриваем сильных кандидатов.",
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
      "Обслуживание и ремонт автомобилей. Сертифицированные мастера, оригинальные запчасти.",
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
    defaultValue: "Все права защищены.",
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

  // Юридические реквизиты — используются на печатной форме сметы,
  // в подвале и в шапке заказ-наряда. Все поля свободные строки —
  // если у организации нет какого-то реквизита (например, физлицо
  // без расчётного счёта), оставить пустым.
  "requisites.legal_name": {
    type: "text",
    group: "requisites",
    label: "Юридическое наименование",
    defaultValue: "",
  },
  "requisites.short_name": {
    type: "text",
    group: "requisites",
    label: "Сокращённое наименование (на бланке)",
    defaultValue: "",
  },
  "requisites.inn": {
    type: "text",
    group: "requisites",
    label: "ИНН",
    defaultValue: "",
  },
  "requisites.kpp": {
    type: "text",
    group: "requisites",
    label: "КПП",
    defaultValue: "",
  },
  "requisites.ogrn": {
    type: "text",
    group: "requisites",
    label: "ОГРН / ОГРНИП",
    defaultValue: "",
  },
  "requisites.legal_address": {
    type: "text",
    group: "requisites",
    label: "Юридический адрес",
    defaultValue: "",
  },
  "requisites.bank_name": {
    type: "text",
    group: "requisites",
    label: "Банк",
    defaultValue: "",
  },
  "requisites.bank_bik": {
    type: "text",
    group: "requisites",
    label: "БИК",
    defaultValue: "",
  },
  "requisites.account": {
    type: "text",
    group: "requisites",
    label: "Расчётный счёт",
    defaultValue: "",
  },
  "requisites.corr_account": {
    type: "text",
    group: "requisites",
    label: "Корреспондентский счёт",
    defaultValue: "",
  },
  "requisites.director_name": {
    type: "text",
    group: "requisites",
    label: "Руководитель (ФИО, должность)",
    defaultValue: "",
  },
  "requisites.estimate_footer": {
    type: "richtext",
    group: "requisites",
    label: "Подпись/примечание под сметой",
    defaultValue:
      "Смета действительна в течение указанного срока. По всем вопросам — отдел сервиса.",
  },
  "requisites.warranty": {
    type: "richtext",
    group: "requisites",
    label: "Гарантия на работы",
    defaultValue:
      "Гарантия на выполненные работы — 6 месяцев или 10 000 км пробега (что наступит раньше).",
  },
  "requisites.parts_warranty": {
    type: "richtext",
    group: "requisites",
    label: "Гарантия на запчасти",
    defaultValue:
      "Гарантия на запчасти — по условиям производителя (от 6 до 24 месяцев). Гарантия не распространяется на расходные материалы и узлы, повреждённые в результате нарушения эксплуатации.",
  },
  "requisites.payment_terms": {
    type: "richtext",
    group: "requisites",
    label: "Условия оплаты",
    defaultValue:
      "Предоплата 50% после согласования сметы, остаток — по факту выполнения работ. Оплата возможна наличными, банковской картой или переводом на расчётный счёт.",
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
      : (typeof CMS_SCHEMA)[K] extends { type: "image" }
        ? string
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
