import Link from "next/link";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { Reviews } from "@/components/shared/Reviews";

const faqItems = [
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
      "Через онлайн-форму на сайте (самый быстрый способ), по телефону +7 (495) 123-45-67, или через WhatsApp. После записи вам придёт SMS с подтверждением.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden md:min-h-[600px] md:max-h-[90vh] md:h-screen">
        {/* Background photo spans full hero. Overlays add depth (atmospheric vignette
            via radial spotlight) and respect light/dark theme through hero-overlay. */}
        <div className="absolute inset-0">
          <img
            src="/images/hero/g-class-4k.jpg"
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-black/55 hero-overlay" />
          <div className="hero-spotlight" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        </div>

        {/* Two halves spanning full hero height. Each is transparent, lets the photo through.
            Mobile: stacks to two rows with a proper hairline+pip divider between them.
            Desktop: 50/50 split with hover-expand spotlight (rules in globals.css).
            Editorial accents (numerals, corner ticks) are mobile-only — desktop relies on
            the hover-spotlight for differentiation. */}
        <div className="hero-split relative z-10 grid h-full animate-fade-in grid-cols-1 text-white md:grid-cols-2">
          {/* Left half — Сервис. Gradient divider lives at right-0 so it moves with the column boundary on hover-expand. */}
          <div data-half="left" className="relative flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
            <div aria-hidden className="absolute inset-y-[15%] right-0 hidden w-px bg-gradient-to-b from-transparent via-accent/40 to-transparent md:block pointer-events-none" />

            {/* Mobile-only editorial accents */}
            <span aria-hidden className="hero-corner hero-corner-tl md:hidden" />
            <span aria-hidden className="hero-corner hero-corner-br md:hidden" />

            <div className="hero-stagger flex flex-col items-center">
              <div className="mb-6 inline-block border border-accent/40 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-accent">
                Сервис
              </div>
              <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight sm:text-5xl text-display">
                Сервис в&nbsp;Москве
              </h2>
              <p className="mb-8 max-w-md text-base text-white/70 sm:text-lg">
                ТО, диагностика, ремонт. Прозрачные цены, гарантия&nbsp;на&nbsp;работы&nbsp;12&nbsp;месяцев.<sup className="ml-0.5 text-[10px] text-accent/80">*</sup>
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
              <p className="mt-3 text-[10px] text-white/40">
                <span className="text-accent/70">*</span> Подробнее в&nbsp;
                <Link href="/about#warranty" className="underline decoration-accent/40 underline-offset-2 hover:text-white/60">условиях договора</Link>.
              </p>
            </div>
          </div>

          {/* Mobile-only section divider between halves. Removed from desktop layout via
              md:hidden so the 2-column grid sits side-by-side with the vertical accent. */}
          <div className="hero-divider-mobile py-3 md:hidden" aria-hidden>
            <span className="hero-divider-pip" />
          </div>

          {/* Right half — Запчасти */}
          <div data-half="right" className="relative flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
            {/* Mobile-only editorial accents */}
            <span aria-hidden className="hero-corner hero-corner-tl md:hidden" />
            <span aria-hidden className="hero-corner hero-corner-br md:hidden" />

            <div className="hero-stagger flex flex-col items-center">
              <div className="mb-6 inline-block border border-accent/40 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-accent">
                Запчасти
              </div>
              <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight sm:text-5xl text-display">
                Запчасти Mercedes-Benz
              </h2>
              <p className="mb-8 max-w-md text-base text-white/70 sm:text-lg">
                Оригинал. Подбор по&nbsp;вашему автомобилю.
              </p>
              <Link
                href="/parts"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              >
                В&nbsp;каталог запчастей
              </Link>
            </div>
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
              title: "Двигатель",
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
              desc: "Только на работы — 12 месяцев или 20 000 км пробега. Условия в договоре.",
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

      {/* Reviews — native cards rendered with our brand tokens. Replaces the cross-origin
          Yandex iframe (white background, blue CTA, fixed 760px width that mobile-scrolled).
          Source data is curated from the Yandex listing; the CTA links to the live profile
          for the full list. */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-display mb-3 text-3xl font-bold sm:text-4xl">
            Отзывы клиентов
          </h2>
          <p className="text-foreground-muted mx-auto mb-12 max-w-xl">
            Что пишут владельцы G-Class и других Mercedes-Benz после визита
          </p>
          <Reviews />
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
