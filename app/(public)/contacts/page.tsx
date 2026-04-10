import Link from "next/link";

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-display text-4xl sm:text-5xl font-bold mb-4">
          Контакты
        </h1>
        <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto text-lg">
          Свяжитесь с нами или приезжайте — мы всегда рады помочь
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Contact info */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Отдел сервиса</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Телефон
                </p>
                <a
                  href="tel:+74951234567"
                  className="text-lg font-medium hover:text-[var(--color-accent)] transition-colors"
                >
                  +7 (495) 123-45-67
                </a>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Часы работы
                </p>
                <p className="font-medium">Пн–Пт: 9:00–20:00, Сб: 10:00–18:00</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Отдел запчастей</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Телефон
                </p>
                <a
                  href="tel:+74951234568"
                  className="text-lg font-medium hover:text-[var(--color-accent)] transition-colors"
                >
                  +7 (495) 123-45-68
                </a>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Часы работы
                </p>
                <p className="font-medium">Пн–Пт: 9:00–19:00, Сб: 10:00–17:00</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Общие контакты</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Email</p>
                <a
                  href="mailto:info@geleoteka.ru"
                  className="font-medium hover:text-[var(--color-accent)] transition-colors"
                >
                  info@geleoteka.ru
                </a>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Адрес</p>
                <p className="font-medium">Москва, ул. Примерная, 15</p>
              </div>
            </div>
          </div>

          <Link href="/booking" className="btn btn-primary w-full text-center">
            Записаться на сервис
          </Link>
        </div>

        {/* Map placeholder */}
        <div className="card flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-secondary)] mx-auto mb-4 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[var(--foreground-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z"
                />
              </svg>
            </div>
            <p className="text-[var(--foreground-muted)] text-sm">
              Яндекс Карта
            </p>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Подключается после получения API-ключа
            </p>
          </div>
        </div>
      </div>

      {/* Directions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Как добраться</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <h3 className="font-medium mb-2">На автомобиле</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Съезд с МКАД, 500 м по ул. Примерная. Бесплатная парковка
              перед сервисом.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">На метро</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Станция «Примерная», выход 2. 10 минут пешком или одна
              остановка на автобусе.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">На такси</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Назовите адрес: ул. Примерная, 15. Въезд через шлагбаум —
              назовите номер записи.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
