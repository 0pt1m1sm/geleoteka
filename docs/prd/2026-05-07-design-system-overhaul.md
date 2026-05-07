# Geleoteka — Полный редизайн-ревью: Design System Overhaul

Created: 2026-05-07
Author: aleksandr.spiskov@gmail.com
Category: UX
Status: Final
Research: None
Worktree: Yes

## Problem Statement

Сайт Geleoteka — премиум-сервис Mercedes-Benz с заявленной эстетикой "Brutal Luxury" (matte black + золото `#d4af37`), но реализация дизайна не соответствует позиционированию. Аудит выявил три класса проблем:

1. **Технологический долг.** Стек (Next.js 16.2, React 19.2, Tailwind v4) — самый свежий, но возможности почти не используются: нет `next/font` (системные шрифты на премиум-бренде), `next/image` использован 1 раз против 6 raw `<img>` (включая hero), `lucide-react` установлен но почти не задействован (десятки inline-SVG), нет View Transitions API (Next 16 поддерживает). `components/ui/` — пустая директория: примитивный слой не построен.
2. **Несогласованность дизайн-системы.** В globals.css определены `.btn`, `.card`, `.input`, `.badge` — но половина компонентов использует inline `style={{}}` (NavDrawer, MobileMenu, FloatingButtons частично), вторая — Tailwind utility classes напрямую без токенов. Cabinet и Admin sidebar — два отдельных компонента с разной хромой при одинаковой задаче. Тема дублируется в трёх местах (`:root`, `html.light`, `prefers-color-scheme: light`).
3. **Отсутствие визуальной глубины и ритма.** Все страницы (кроме главной) — плоские заголовки + 3-колоночная сетка карточек. Карточки фактически идентичны (`.card { background; border; padding }`). Hero на главной хорошо проработан (split, spotlight, corner ticks) — это эталон, к которому должны подтянуться остальные 50+ страниц. Premium-tone требует типографики, асимметрии, decorative accents — этого нет.

**Почему сейчас:** стек только что обновлён на Next 16/React 19/Tailwind v4 — окно для миграции на современные паттерны (Server Components, Suspense, View Transitions, `next/font`, Image Optimization) открыто. Чем дольше ждать, тем дороже миграция: новые страницы пишутся в старой парадигме и закрепляют долг.

## Core User Flows

Дизайн-овэрхол не меняет бизнес-логику. Все существующие потоки сохраняются:

### Flow 1: Маркетинговый посетитель (public)
1. Заходит на `/` → новый hero с типографикой display-шрифта, плавный скролл с reveal-анимациями (CSS-only, `prefers-reduced-motion` aware)
2. Переходит между страницами (`/services`, `/parts`, `/models`, `/about`) → View Transitions API даёт плавные переходы
3. Каждая страница имеет согласованный page-header паттерн (eyebrow + display heading + lede), а не плоский H1
4. Карточки услуг/моделей/запчастей — единый primitive с продуманным hover-состоянием (свечение, motion, accent-border)

### Flow 2: Клиент в кабинете (portal)
1. Логинится → попадает в `/cabinet` с обновлённым sidebar (унифицированный с админкой по структуре, отличающийся по навигации)
2. Видит дашборд с настоящими data-cards (не плоские числа в `.card`, а compact metric tiles с trend, sparkline где релевантно)
3. Все формы (`AddCarForm`, profile, etc.) построены на новом `<Input>`, `<Select>`, `<Button>` примитивах
4. Status board (`StatusBoard.tsx`) и Estimate review (`EstimateReview.tsx`) — premium presentational components с типизированной шкалой статусов

### Flow 3: Менеджер в админке (admin)
1. Заходит в `/admin` → дашборд с теми же metric tiles + compact tables вместо plain `<table>`
2. Все 16 admin-форм используют `AdminFormShell` + новые input-примитивы; убираем ad-hoc стили
3. Booking wizard (`Step1ServiceVehicle`, `Step3ContactConfirm`) переходит на новый `StepIndicator`-компонент с motion и accessible state

### Flow 4: Мобильный пользователь (любой layer)
1. Touch-targets ≥ 44px везде (сейчас многие `<button>` с `p-2` дают 32px)
2. NavDrawer открывается с правильной transition-анимацией (сейчас — instant render через portal)
3. Bottom-sheet паттерн для фильтров на `/parts` (сейчас — drawer слева, неудобно одной рукой)

## Scope

### In Scope

PRD структурирован в **7 последовательных фаз**. Каждая фаза — самодостаточная единица, может быть отдельным `/spec` плэном или подзадачей единого плэна на усмотрение `/spec`-диспетчера. Порядок строгий: каждая следующая фаза опирается на предыдущую.

**Phase 1 — Design System Foundation**
- `app/globals.css`: разнести на 3 файла под `app/styles/`: `tokens.css` (CSS-переменные), `base.css` (reset, html/body, scrollbar), `components.css` (`.btn`, `.card`, `.input`, `.badge`, `.alert`). Импортировать из `globals.css`.
- Удалить дублирование темы: блок `@media (prefers-color-scheme: light)` повторяет `html.light` — вынести в общий CSS-кастом-properties pattern (CSS variables в одном месте, селекторы переключают значения).
- Завести `lib/design-tokens.ts` с TypeScript-константами для значений, которые нужны в JS (например, breakpoints, animation duration). НЕ дублировать цвета (single source of truth — CSS).
- Подключить `next/font` для display + body шрифтов. Решение: **PT Mono** или подобный editorial display + **Inter** для body — финальный выбор шрифта в Phase 1 implementation на основе бренд-тона "Brutal Luxury" (матовый, automotive). Предпочтение шрифтам с переменной осью (variable fonts) для performance.
- Создать `components/ui/` примитивы: `Button.tsx`, `Card.tsx`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Checkbox.tsx`, `RadioGroup.tsx`, `Badge.tsx`, `Alert.tsx`, `Dialog.tsx` (на portal), `Tabs.tsx`, `Skeleton.tsx`, `Tooltip.tsx`. Все — TypeScript-strict, c `forwardRef`, c вариантами через CVA или CSS data-attributes.
- Storybook НЕ добавляем — превышает scope. Вместо этого: dev-only страница `/dev/ui` (скрытая, NODE_ENV=development) с галереей всех примитивов для визуального ревью.

**Phase 2 — Shared Chrome (cross-layer)**
- `components/shared/Header.tsx` — выделить из `(public)/layout.tsx` (сейчас inline). Premium-typography навигация, accent-glow на hover, проперти `variant="public" | "portal" | "admin"` для адаптации.
- Унифицировать sidebar: `components/shared/Sidebar.tsx` принимает `navItems[]` (с поддержкой групп через `kind: "link" | "group"`), используется в `(portal)/layout.tsx` и `(admin)/layout.tsx`. Существующий `AdminSidebar` логика accordion-групп переезжает сюда.
- `MobileMenu`, `NavDrawer`, `PanelMobileNav`, `AdminMobileNav` — консолидировать в `Drawer` (один primitive) + `MobileNav` (один компонент с навигацией). Добавить настоящую slide-in анимацию (CSS, `transform: translateX`).
- `FloatingButtons` — заменить inline-SVG иконки на `lucide-react` (`MessageCircle`, `X`). Кнопка-trigger получает pulse-анимацию на idle (мягкая, 1 раз каждые 5с).
- Footer — переписать как `<Footer />` компонент, сейчас inline. Добавить sub-footer с micro-typography (юр. адрес, ИНН-плейсхолдер) — premium доверие.

**Phase 3 — Public marketing pages**
Страницы: `/`, `/about`, `/services`, `/services/[slug]`, `/models`, `/models/[slug]`, `/parts`, `/parts/[slug]`, `/parts/cart`, `/rentals`, `/rentals/[id]`, `/contacts`, `/vacancies`, `/blog`.

Pattern для каждой:
- Page-header primitive: eyebrow (uppercase tracking-wide accent) + H1 (display font, clamp-fluid) + lede (max-w-prose).
- Hero на главной: оставить split, но обновить типографику + добавить "scroll cue" внизу (animated chevron). Сейчас corner-ticks и spotlight уже хороши — сохраняем, шлифуем.
- Stats section — sparkline или counter-up animation (Intersection Observer). CSS-only, без JS-библиотек.
- Service grid: вместо плоских карточек — асимметричная сетка (1 large + 2x2 small + 3 standard), gold corner-tick на hover.
- `/models` — каждая модель получает обложку через `next/image` с blur placeholder, hero-style карточку.
- `/parts` каталог — bottom-sheet фильтры на mobile (вместо drawer), refined `PartsFilterSidebar` на desktop. Cards-grid с product photos (через `next/image`), badge "В наличии"/"Под заказ", price prominently displayed.
- Все raw `<img>` → `next/image` с правильными sizes, priority для above-the-fold (hero), unoptimized=false.

**Phase 4 — Auth + Booking flow**
- `/login`, `/register`, `/reset-password`, `/reset-password/confirm` — единый `<AuthShell>` компонент: split-screen на desktop (форма слева, фотофон справа), полноэкранная форма на mobile. Brand-pillar в header.
- Booking wizard (`/booking`, `/booking/step-2`, `/booking/step-3`):
  - `StepIndicator` — переписать с motion (заполнение progress bar между шагами через CSS transition), aria-current
  - `Step1ServiceVehicle` (236 lines) — разбить на `<ServicePicker>` + `<VehiclePicker>` подкомпоненты
  - `Step3ContactConfirm` (225 lines) — разбить на `<ContactForm>` + `<BookingSummary>` подкомпоненты
  - `CalendarSlotPicker` — отполировать визуально: occupied/available slots — motion + accent border вместо плоского color-fill

**Phase 5 — Cabinet (portal) pages**
Страницы: `/cabinet`, `/cabinet/cars`, `/cabinet/cars/add`, `/cabinet/history`, `/cabinet/tracking`, `/cabinet/estimates`, `/cabinet/orders`, `/cabinet/rentals`, `/cabinet/loyalty`, `/cabinet/notifications`.

- Dashboard — заменить плоские числа на `<MetricCard>` примитив (число + label + trend-indicator + optional sparkline для history-зависимых метрик).
- `StatusBoard.tsx` — premium presentation: горизонтальная timeline статусов с animated transitions при смене (polling каждые N секунд уже есть).
- `EstimateReview.tsx` — типографически отполированный счёт (mono для цифр, display для total, accept/decline в `<Dialog>` примитиве).
- `AddCarForm` — на новом `<Input>`/`<Select>` стеке.
- `LoyaltyAccount` — visualization tier (Silver/Gold/AMG): крупный card с теми же `.badge-*` классами но в hero-формате; progress bar до следующего tier.

**Phase 6 — Admin pages**
27 admin-страниц, 22 admin-компонента.

- `AdminDashboard` (`/admin`) — те же `<MetricCard>` что в кабинете, но с MANAGER-специфичными метриками (дневная выручка, занятость календаря, задержанные заказы).
- Все 16 форм (`PartForm`, `PartEditForm`, `ModelEditForm`, `RentalCarForm`, `RentalEditForm`, `SupplierEditForm`, `SupplierOrderForm`, `EstimateBuilder`, `CMSEditor`, `PhotoUploader`, etc.) — на новых input-примитивах. `AdminFormShell` остаётся как layout-обёртка.
- Tables (`/admin/orders`, `/admin/parts`, `/admin/customers`, `/admin/suppliers/orders`, `/admin/estimates`, etc.) — заменить на `<DataTable>` примитив (sticky header, hover row, sortable columns через server-action, pagination footer). На mobile — degrade в `<DataList>` (cards).
- `AdminCalendar` — обновить grid (сейчас 133 строки, custom). Hover — preview slot, click — edit.
- Status changers (`StatusChanger`, `OrderStatusChanger`, `RentalStatusChanger`, `SupplierOrderStatusChanger`) — унифицировать в один `<StatusSelect>` с типизированной шкалой.

**Phase 7 — Polish (motion, a11y, perf, View Transitions)**
- Включить View Transitions API (`viewTransition: true` в `next.config.ts` и `unstable_ViewTransition` обёртка). Эффект для page-to-page и для shared elements (логотип, hero photo).
- `prefers-reduced-motion` audit: убедиться что ВСЕ анимации (existing + new) уважают флаг.
- Color contrast audit: gold `#d4af37` на `#0a0a0a` = 7.86:1 (OK), но gold `#d4af37` на `#141414` (card) = 6.49:1 (OK). Light theme: `#9a7b2c` на `#faf9f6` = 4.62:1 (OK с запасом). Проверить ВСЕ комбинации в финальной палитре.
- Keyboard navigation: tab-order, focus-visible на каждом интерактивном элементе, Escape closes drawers/dialogs.
- ARIA: `role="status"` для notifications, `aria-live="polite"` для status changes, `aria-current` для active nav.
- Performance: Lighthouse audit — target ≥95 across all four scores на главной, `/parts`, `/cabinet`, `/admin`. Hot-path memoization (PartsCart, EstimateBuilder).
- Storybook-альтернатива: `/dev/ui` страница с примерами всех примитивов в обоих темах + edge-cases (long text, empty state, error state, loading state).

### Explicitly Out of Scope

- **Бизнес-логика, server actions, API endpoints** — не трогаем. Только presentational layer.
- **Database / Prisma schema** — без изменений.
- **Authentication / middleware** (`lib/auth.ts`, `app/middleware.ts`) — без изменений.
- **Routing structure** — все URL-пути сохраняются, никаких redirects не вводим.
- **Текстовый контент** — копирайтинг страниц остаётся (мы шлифуем только typography/layout, не переписываем тексты). Исключение: `<Footer>` микрокопия (юр. подвал) и empty states — туда нужны новые тексты.
- **Логотип SVG** — `/public/images/logo.svg` остаётся; treatment вокруг логотипа (badge, framing) можно делать.
- **Email / SMS templates** (`lib/sms.ts`) — не дизайн-страницы, скоуп backend.
- **PWA / offline** — отдельный проект, не сейчас.
- **i18n / переводы** — только русский, как сейчас.
- **Дополнительные библиотеки кроме перечисленных:** запрещены `framer-motion`, `react-spring`, `radix-ui`, `headlessui`, `shadcn/ui`-as-dependency, `cva` (мы используем CSS data-attributes для variants). Разрешённый delta к зависимостям: `class-variance-authority` (опционально для Button variants), `@radix-ui/react-dialog` ТОЛЬКО для Dialog primitive (a11y-grade modal — переизобретать не стоит). Финальное решение по этим двум — в Phase 1 plan.
- **Tests** — компоненты тестируются вручную через `/dev/ui` + browser-automation E2E на `/spec verify`. Unit-тесты для нового UI-слоя не пишем (presentational, низкий ROI).
- **Storybook** — out of scope (см. `/dev/ui` альтернатива).

## Technical Context

- **Next.js 16.2.3** — App Router, Turbopack, View Transitions API доступен (см. `node_modules/next/dist/docs/`). Не использовать deprecated paterns; читать docs в node_modules перед каждой Next-фичей (см. `AGENTS.md`).
- **React 19.2.4** — Server Components default, `useActionState` для form actions (уже частично используется в `app/actions/*`), Suspense boundaries для streaming.
- **Tailwind v4** — `@import "tailwindcss"`, `@theme inline { ... }` блок уже есть в globals.css. Use `@layer components` для новых component-классов.
- **TypeScript strict** — все новые компоненты с explicit return types, no `any`. Prisma типы — pattern в `geleoteka-conventions.md` (explicit type assertions).
- **CSS variables — single source of truth** для цветов/spacing/radius. JS обращается через CSS Custom Properties (`getComputedStyle` если очень нужно, чаще — не нужно).
- **Theme switching** — `<html class="light">` toggle через `ThemeInit` (уже работает). Сохранить, но упростить duplicated CSS блоки.
- **Существующие классы для удаления через grep после рефакторинга:** `card-hover`, `btn-ghost`, `btn-outline` — могут оказаться неиспользуемы после миграции на `<Button variant>`. Проверить, удалить.
- **Файлы > 200 строк, требующие split в рамках scope:**
  - `Step1ServiceVehicle.tsx` (236)
  - `Step3ContactConfirm.tsx` (225)
  - `PartsFilterSidebar.tsx` (258)
  - `SupplierOrderForm.tsx` (344)
  - `TrimManager.tsx` (360)
  - `app/(public)/page.tsx` (344) — извлечь sections в подкомпоненты
  - `globals.css` (646) — Phase 1 split на 3 файла
- **Существующие проблемные паттерны (фиксим в скоупе):**
  - Inline `style={{}}` в `NavDrawer`, `MobileMenu`, `PanelMobileNav` — в Phase 2.
  - 6 raw `<img>` → `next/image` — Phase 3 (`g-class-4k.jpg`, logo, photos).
  - Lucide-react установлен (v1.8.0!) но не используется — масштабная миграция inline-SVG → lucide компоненты в Phase 2-6.
  - `useEffect` + `useState` для localStorage anywhere — заменить на `useSyncExternalStore` pattern (см. `geleoteka-conventions.md`).
- **Worktree:** `Yes` — пользователь явно запросил изолированный worktree для этой работы. `/spec`-диспетчер должен создать `.worktrees/spec-design-system-overhaul-<hash>/`. Squash-merge после verification.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Объём PRD: один или несколько? | Один PRD, 7 фаз | Дизайн-система — единое целое; разрезать = терять консистентность. Фазы дают `/spec` право построить multi-stage план или серию planов. |
| Component primitive layer | Build custom in `components/ui/` | shadcn/ui — красивый старт но добавляет copy-paste долг и Radix-зависимость. Для одного проекта с уникальным брендингом custom примитивы дешевле в долгосроке. |
| Iconography | Migrate to `lucide-react` (already in deps) | Tree-shakeable, consistent visual weight, активно поддерживается. Inline-SVG проигрывает в consistency. |
| Typography | `next/font` с display + body, choices in Phase 1 | "Brutal Luxury" + system-ui — противоречие. Premium-бренд требует characterful шрифт. `next/font` для self-hosting и zero-CLS. |
| Theme system | Сохранить `html.light` + кастом-проперти; убрать дублирующий `prefers-color-scheme` блок | Текущее работает, но 3 копии переменных = bug-magnet. Сохраняем явный toggle (UX уже на нём построен), но генерим из одного source. |
| Animation library | CSS-only + View Transitions API | Зависимость на framer-motion = +60kb gzipped. Tailwind v4 + custom CSS keyframes покрывают 99% потребностей. Page transitions — встроены в Next 16. |
| Dialog/Modal primitive | `@radix-ui/react-dialog` (single dep) | A11y-grade modal — focus trap, scroll lock, ARIA — переписывать = вводить баги. Один Radix-компонент дешевле полной dependency. |
| Variants pattern | CSS data-attributes (`data-variant="primary"`) | Альтернатива CVA. Меньше JS-зависимостей, читаемо в DOM dev tools, легко стилизуется через `[data-variant="primary"]`. |
| Storybook? | Нет, заменён на dev-only `/dev/ui` страницу | Storybook = отдельная инфраструктура (build, deploy, версионирование). `/dev/ui` живёт в App Router, бесплатно, достаточно для визуального ревью. |
| Tests for UI primitives | Нет unit-тестов; visual via `/dev/ui` + E2E на ключевых флоу | Presentational компоненты — низкий ROI на unit-тесты. E2E уже мандатно на `/spec verify`. |
| Worktree | Yes (явный запрос пользователя) | Большой scope, несколько фаз → изоляция от main критична. После verification — squash-merge. |
| Public copy / wording | Out of scope | Это дизайн-овэрхол, не редактура. Тексты остаются. |
| Phasing — все 7 в один PR? | Решает `/spec` (плэн или серия planов) | PRD не предписывает delivery model. Если `/spec` сделает один большой плэн — OK; разобьёт на 7 — тоже OK, главное что Phase 1 идёт первой. |
