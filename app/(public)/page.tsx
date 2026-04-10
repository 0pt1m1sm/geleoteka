import Link from "next/link";
import { MODELS } from "@/lib/models-data";
import { FAQAccordion } from "@/components/shared/FAQAccordion";

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
      <section className="relative min-h-[600px] max-h-[90vh] h-screen flex items-center justify-center overflow-hidden">
        {/* Background photo */}
        <div className="absolute inset-0">
          <img
            src="/images/hero/g-class-hero.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-black/65 hero-overlay" />
          {/* Gold gradient accent from bottom */}
          <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-[var(--color-accent)]/10 to-transparent" />
          {/* Bottom gold line */}
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/40 to-transparent" />
        </div>

        {/* Force light text on hero regardless of theme */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 text-white">
          <div className="animate-fade-in">
            <div className="inline-block border border-[#d4af37]/40 px-4 py-1.5 mb-8 text-xs uppercase tracking-[0.3em] text-[#d4af37]">
              G-Class Specialist
            </div>
            <h1 className="text-display font-black tracking-tight mb-6 uppercase leading-none" style={{ fontSize: "clamp(2.5rem, 10vw, 9rem)" }}>
              Geleoteka
            </h1>
            <p className="text-xl sm:text-2xl text-white/70 max-w-2xl mx-auto mb-4 font-light">
              Специализированный сервис Mercedes-Benz G-Class
            </p>
            <p className="text-sm text-white/40 max-w-xl mx-auto mb-12 tracking-wide">
              Онлайн-запись · Отслеживание статуса · Личный кабинет
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/booking"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium bg-[#d4af37] text-black rounded-[var(--radius-lg)] hover:bg-[#e0c04a] transition-colors"
              >
                Записаться на сервис
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium border border-white/30 text-white rounded-[var(--radius-lg)] hover:bg-white/10 transition-colors"
              >
                Наши услуги
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

      {/* Models */}
      <section className="py-20 bg-[var(--card)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-display text-3xl sm:text-4xl font-bold mb-4">
              Популярные модели
            </h2>
            <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto">
              Обслуживаем весь модельный ряд Mercedes-Benz
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {MODELS.map((model) => (
              <Link
                key={model.slug}
                href={`/models/${model.slug}`}
                className="card card-hover text-center group py-4"
              >
                <div className="text-lg font-bold group-hover:text-[var(--color-accent)] transition-colors">
                  {model.name}
                </div>
                <div className="text-[10px] text-[var(--foreground-muted)] mt-1">
                  {model.generations}
                </div>
              </Link>
            ))}
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: "Андрей К.",
                car: "GLE 350d",
                text: "Отличный сервис. Сделали ТО за 2 часа, всё по регламенту. Удобно следить за статусом через личный кабинет.",
                rating: 5,
              },
              {
                name: "Мария С.",
                car: "C 200",
                text: "Нашли и устранили причину стука в подвеске, которую два других сервиса не смогли диагностировать. Рекомендую!",
                rating: 5,
              },
              {
                name: "Дмитрий В.",
                car: "G 63 AMG",
                text: "Единственное место, куда доверяю свой G-Class. Знают все нюансы AMG. Честные цены, никаких навязываний.",
                rating: 5,
              },
            ].map((review, i) => (
              <div key={i} className="card">
                <div className="flex mb-3">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <svg
                      key={j}
                      className="w-4 h-4 text-[var(--color-gold)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-[var(--foreground-muted)] mb-4">
                  «{review.text}»
                </p>
                <div>
                  <p className="font-medium text-sm">{review.name}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {review.car}
                  </p>
                </div>
              </div>
            ))}
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
