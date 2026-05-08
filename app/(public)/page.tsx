import Link from "next/link";
import Image from "next/image";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { Reviews } from "@/components/shared/Reviews";
import { Markdown } from "@/components/shared/Markdown";
import { getCMSText, getCMSRichtext, getCMSList } from "@/lib/cms";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<React.ReactElement> {
  const [
    heroLeftEyebrow,
    heroLeftTitle,
    heroLeftLede,
    heroLeftCta,
    heroLeftSecLabel,
    heroLeftSecHref,
    heroLeftDisclaimer,
    heroRightEyebrow,
    heroRightTitle,
    heroRightLede,
    heroRightCta,
    statsYears,
    statsYearsLabel,
    statsCars,
    statsCarsLabel,
    statsSat,
    statsSatLabel,
    statsParts,
    statsPartsLabel,
    whyusTitle,
    whyusItems,
    faqTitle,
    faqItems,
    reviewsTitle,
    reviewsSubtitle,
    ctaTitle,
    ctaSubtitle,
    ctaButton,
  ] = await Promise.all([
    getCMSText("home.hero.left.eyebrow"),
    getCMSText("home.hero.left.title"),
    getCMSRichtext("home.hero.left.lede"),
    getCMSText("home.hero.left.cta"),
    getCMSText("home.hero.left.secondary.label"),
    getCMSText("home.hero.left.secondary.href"),
    getCMSRichtext("home.hero.left.disclaimer"),
    getCMSText("home.hero.right.eyebrow"),
    getCMSText("home.hero.right.title"),
    getCMSText("home.hero.right.lede"),
    getCMSText("home.hero.right.cta"),
    getCMSText("home.stats.years"),
    getCMSText("home.stats.years.label"),
    getCMSText("home.stats.cars"),
    getCMSText("home.stats.cars.label"),
    getCMSText("home.stats.satisfaction"),
    getCMSText("home.stats.satisfaction.label"),
    getCMSText("home.stats.parts"),
    getCMSText("home.stats.parts.label"),
    getCMSText("home.whyus.title"),
    getCMSList("home.whyus.items"),
    getCMSText("home.faq.title"),
    getCMSList("home.faq.items"),
    getCMSText("home.reviews.title"),
    getCMSText("home.reviews.subtitle"),
    getCMSText("home.cta.title"),
    getCMSRichtext("home.cta.subtitle"),
    getCMSText("home.cta.button"),
  ]);

  const statsList = [
    { value: statsYears, label: statsYearsLabel },
    { value: statsCars, label: statsCarsLabel },
    { value: statsSat, label: statsSatLabel },
    { value: statsParts, label: statsPartsLabel },
  ];

  // FAQ answers are markdown — pre-render to React nodes so FAQAccordion stays
  // a thin presentational component. answerNode is what the accordion renders.
  const faqRendered = faqItems.map((item) => ({
    question: item.question,
    answerNode: <Markdown source={item.answer} className="text-sm text-[var(--foreground-muted)] leading-relaxed pt-3" />,
  }));

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden md:min-h-[600px] md:max-h-[90vh] md:h-screen">
        <div className="absolute inset-0">
          <Image
            src="/images/hero/g-class-4k.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-image object-cover"
          />
          <div className="absolute inset-0 bg-black/55 hero-overlay" />
          <div className="hero-spotlight" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        </div>

        <div className="hero-split relative z-10 grid h-full animate-fade-in grid-cols-1 text-white md:grid-cols-2">
          {/* Left half — Сервис */}
          <div data-half="left" className="relative flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
            <div aria-hidden className="absolute inset-y-[15%] right-0 hidden w-px bg-gradient-to-b from-transparent via-accent/40 to-transparent md:block pointer-events-none" />

            <span aria-hidden className="hero-corner hero-corner-tl md:hidden" />
            <span aria-hidden className="hero-corner hero-corner-br md:hidden" />

            <div className="hero-stagger flex flex-col items-center">
              <div className="mb-6 inline-block border border-accent/40 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-accent">
                {heroLeftEyebrow}
              </div>
              <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight sm:text-5xl text-display">
                {heroLeftTitle}
              </h2>
              <div className="mb-8 max-w-md text-base text-white/70 sm:text-lg sm:min-h-[3.5rem] flex items-center">
                <Markdown source={heroLeftLede} />
              </div>
              <Link
                href="/booking"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover active:brightness-90 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              >
                {heroLeftCta}
              </Link>
            </div>

            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center px-6 text-center sm:bottom-10">
              <Link
                href={heroLeftSecHref}
                className="text-sm text-accent/80 transition-colors hover:text-accent-hover active:opacity-70 focus:outline-2 focus:outline-offset-2 focus:outline-accent rounded"
              >
                {heroLeftSecLabel}
              </Link>
              <div className="mt-3 text-[10px] text-white/40">
                <Markdown source={heroLeftDisclaimer} />
              </div>
            </div>
          </div>

          {/* Mobile-only section divider */}
          <div className="hero-divider-mobile py-3 md:hidden" aria-hidden>
            <span className="hero-divider-pip" />
          </div>

          {/* Right half — Запчасти */}
          <div data-half="right" className="relative flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
            <span aria-hidden className="hero-corner hero-corner-tl md:hidden" />
            <span aria-hidden className="hero-corner hero-corner-br md:hidden" />

            <div className="hero-stagger flex flex-col items-center">
              <div className="mb-6 inline-block border border-accent/40 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-accent">
                {heroRightEyebrow}
              </div>
              <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight sm:text-5xl text-display">
                {heroRightTitle}
              </h2>
              <p className="mb-8 max-w-md text-base text-white/70 sm:text-lg sm:min-h-[3.5rem] flex items-center">
                {heroRightLede}
              </p>
              <Link
                href="/parts"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-4 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover active:brightness-90 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              >
                {heroRightCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {statsList.map((stat, i) => (
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

      {/* Services overview cards — TODO(cms): migrate to read from db.service.findMany() in a follow-up plan. */}
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
            { href: "/services/to", title: "Техобслуживание", desc: "ТО по регламенту Mercedes", price: "от 8 000 ₽" },
            { href: "/services/diagnostic", title: "Диагностика", desc: "STAR Diagnostics, полная проверка", price: "от 5 000 ₽" },
            { href: "/services/repair", title: "Двигатель", desc: "Любой вид ремонта узлов и агрегатов", price: "от 15 000 ₽" },
            { href: "/services/brakes", title: "Тормозная система", desc: "Замена колодок, дисков, суппортов", price: "от 4 500 ₽" },
            { href: "/services/suspension", title: "Подвеска", desc: "Диагностика и ремонт ходовой части", price: "от 5 500 ₽" },
            { href: "/services/conditioner", title: "Кондиционер", desc: "Заправка, диагностика, ремонт", price: "от 3 500 ₽" },
          ].map((service, i) => (
            <Link key={i} href={service.href} className="card card-hover group">
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
            {whyusTitle}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {whyusItems.map((item, i) => (
            <div key={i} className="card">
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <div className="text-sm text-[var(--foreground-muted)]">
                <Markdown source={item.desc} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-display mb-3 text-3xl font-bold sm:text-4xl">
            {reviewsTitle}
          </h2>
          <p className="text-foreground-muted mx-auto mb-12 max-w-xl">
            {reviewsSubtitle}
          </p>
          <Reviews />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-display text-3xl sm:text-4xl font-bold mb-4">
            {faqTitle}
          </h2>
        </div>
        <FAQAccordion items={faqRendered} />
      </section>

      {/* CTA */}
      <section className="py-20 bg-[var(--color-accent)]">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-display text-3xl font-bold text-white mb-4">
            {ctaTitle}
          </h2>
          <div className="text-white/80 mb-8 max-w-xl mx-auto">
            <Markdown source={ctaSubtitle} />
          </div>
          <Link
            href="/booking"
            className="btn bg-white text-[var(--color-accent)] hover:bg-white/90 text-lg px-8 py-4"
          >
            {ctaButton}
          </Link>
        </div>
      </section>
    </div>
  );
}
