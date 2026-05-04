import Link from "next/link";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { YANDEX_PROFILE_URL, YANDEX_REVIEWS_IFRAME_URL } from "@/lib/yandex";

const faqItems = [
  {
    question: "Какие модели Mercedes-Benz вы обслуживаете?",
    answer:
      "Мы обслуживаем весь модельный ряд: C, E, S-Class, GLE, GLS, G-Class, линейку AMG и электрические EQ. Также работаем со старыми моделями W124, W140 и другими.",
  },
  {
    question: "Используете ли вы оригинальные запчасти?",
    answer:
      "Да, мы используем только оригинальные запчасти Mercedes-Benz (OEM). По желанию клиента можем установить качественные аналоги от проверенных производителей с соответствующей гарантией.",
  },
  {
    question: "Сколько времени занимает ТО?",
    answer:
      "Стандартное техобслуживание занимает 2–3 часа. Вы можете подождать в зоне отдыха или оставить автомобиль на день. Точное время зависит от модели и объёма работ.",
  },
  {
    question: "Есть ли гарантия на работы?",
    answer:
      "Да, мы предоставляем гарантию 12 месяцев или 20 000 км на все выполненные работы и установленные запчасти.",
  },
  {
    question: "Можно ли отслеживать статус ремонта?",
    answer:
      "Да. После записи вы получаете доступ к личному кабинету, где в реальном времени видите статус вашего автомобиля — от приёмки до готовности. Также получаете SMS при каждой смене статуса.",
  },
  {
    question: "Как записаться на сервис?",
    answer:
      "Через онлайн-форму на сайте (самый быстрый способ), по телефону +7 (495) 123-45-67, или через WhatsApp. После записи вам придёт SMS с подтверждением.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden md:min-h-[600px] md:max-h-[90vh] md:h-screen">
        {/* Background photo spans full hero. Both halves are transparent — photo shows through. */}
        <div className="absolute inset-0">
          <img
            src="/images/hero/g-class-4k.jpg"
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-black/55 hero-overlay" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        </div>

        {/* Vertical gold hairline divider — desktop only, middle 70% of height */}
        <div className="absolute inset-y-[15%] left-1/2 z-10 hidden w-px bg-gradient-to-b from-transparent via-accent/40 to-transparent md:block pointer-events-none" />

        {/* Two halves spanning full hero height. Each is transparent, lets the photo through.
            Mobile: stacks to two rows (service first). Desktop: 50/50 split.
            Half is a <div> (not a Link) so the primary CTA and secondary link inside
            remain independent <Link>s with their own hrefs and proper a11y. */}
        <div className="relative z-10 grid h-full animate-fade-in grid-cols-1 text-white md:grid-cols-2">
          {/* Left half — Сервис */}
          <div className="flex flex-col items-center justify-center border-b border-white/10 px-6 py-12 text-center sm:px-10 md:border-b-0">
            <div className="mb-6 inline-block border border-accent/40 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-accent">
              Сервис
            </div>
            <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight sm:text-5xl text-display">
              Сервис в&nbsp;Москве
            </h2>
            <p className="mb-8 max-w-md text-base text-white/70 sm:text-lg">
              ТО, диагностика, ремонт. Прозрачные цены, гарантия&nbsp;12 месяцев.
            </p>
            <Link
              href="/booking"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            >
              Записаться на&nbsp;сервис
            </Link>
            <Link
              href="/services"
              className="mt-4 text-sm text-accent/80 transition-colors hover:text-accent-hover focus:outline-2 focus:outline-offset-2 focus:outline-accent rounded"
            >
              Прайс на&nbsp;работы →
            </Link>
          </div>

          {/* Right half — Запчасти */}
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
            <div className="mb-6 inline-block border border-accent/40 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-accent">
              Запчасти
            </div>
            <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight sm:text-5xl text-display">
              Запчасти для&nbsp;G-Class
            </h2>
            <p className="mb-8 max-w-md text-base text-white/70 sm:text-lg">
              Оригинал и&nbsp;качественные аналоги. Подбор по&nbsp;вашему автомобилю.
            </p>
            <Link
              href="/parts"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            >
              В&nbsp;каталог запчастей
            </Link>
            <Link
              href="/parts?category=oils"
              className="mt-4 text-sm text-accent/80 transition-colors hover:text-accent-hover focus:outline-2 focus:outline-offset-2 focus:outline-accent rounded"
            >
              Масла и&nbsp;фильтры →
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "15+", label: "Лет опыта" },
              { value: "2 400+", label: "Авто в год" },
              { value: "98%", label: "Довольных клиентов" },
              { value: "3 500+", label: "Запчастей в наличии" },
            ].map((stat, i) => (
              <div
                key={i}
                className="animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="text-display text-4xl font-bold text-[var(--color-accent)]">
                  {stat.value}
                </div>
                <div className="text-sm text-[var(--foreground-muted)] mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-display text-3xl sm:text-4xl font-bold mb-4">
            Наши услуги
          </h2>
          <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto">
            Полный спектр услуг по обслуживанию и ремонту автомобилей
            Mercedes-Benz
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              href: "/services/to",
              title: "Техобслуживание",
              desc: "ТО по регламенту Mercedes",
              price: "от 8 000 ₽",
            },
            {
              href: "/services/diagnostic",
              title: "Диагностика",
              desc: "STAR Diagnostics, полная проверка",
              price: "от 5 000 ₽",
            },
            {
              href: "/services/repair",
              title: "Ремонт двигателя",
              desc: "Любой вид ремонта узлов и агрегатов",
              price: "от 15 000 ₽",
            },
            {
              href: "/services/brakes",
              title: "Тормозная система",
              desc: "Замена колодок, дисков, суппортов",
              price: "от 4 500 ₽",
            },
            {
              href: "/services/suspension",
              title: "Подвеска",
              desc: "Диагностика и ремонт ходовой части",
              price: "от 5 500 ₽",
            },
            {
              href: "/services/conditioner",
              title: "Кондиционер",
              desc: "Заправка, диагностика, ремонт",
              price: "от 3 500 ₽",
            },
          ].map((service, i) => (
            <Link
              key={i}
              href={service.href}
              className="card card-hover group"
            >
              <h3 className="text-lg font-semibold mb-2 group-hover:text-[var(--color-accent)] transition-colors">
                {service.title}
              </h3>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                {service.desc}
              </p>
              <div className="text-[var(--color-accent)] text-sm font-medium">
                {service.price}
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/services" className="btn btn-secondary">
            Все услуги →
          </Link>
        </div>
      </section>

      {/* Why Us */}
      <section className="py-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-display text-3xl sm:text-4xl font-bold mb-4">
            Почему мы
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
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
              desc: "На все работы и запчасти. 20 000 км пробега. Без мелкого шрифта.",
            },
          ].map((item, i) => (
            <div key={i} className="card">
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-[var(--foreground-muted)]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section className="py-20 bg-[var(--card)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-display text-3xl sm:text-4xl font-bold mb-4">
              Отзывы клиентов
            </h2>
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className="w-5 h-5 text-[var(--color-gold)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span className="text-lg font-semibold">4.9</span>
              <span className="text-[var(--foreground-muted)]">
                — 230+ отзывов
              </span>
            </div>
          </div>
          {/* Yandex Maps reviews widget. May be blocked by uBlock Origin / privacy
              extensions; we accept the blank-iframe risk and do NOT add a JS fallback
              because cross-origin frame-load detection is unreliable. */}
          <div className="overflow-x-auto mx-auto max-w-full" style={{ minHeight: 800 }}>
            <iframe
              src={YANDEX_REVIEWS_IFRAME_URL}
              loading="lazy"
              frameBorder="0"
              width="560"
              height="800"
              className="block mx-auto"
              title="Отзывы клиентов на Яндекс Картах"
            />
          </div>

          <div className="text-center mt-6">
            <a
              href={YANDEX_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline text-sm font-medium"
            >
              Все отзывы на Яндекс Картах →
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-display text-3xl sm:text-4xl font-bold mb-4">
            Частые вопросы
          </h2>
        </div>
        <FAQAccordion items={faqItems} />
      </section>

      {/* CTA */}
      <section className="py-20 bg-[var(--color-accent)]">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-display text-3xl font-bold text-white mb-4">
            Готовы записаться?
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Заполните форму онлайн — это займёт 2 минуты. Мы перезвоним для
            подтверждения.
          </p>
          <Link
            href="/booking"
            className="btn bg-white text-[var(--color-accent)] hover:bg-white/90 text-lg px-8 py-4"
          >
            Онлайн-запись
          </Link>
        </div>
      </section>
    </div>
  );
}
