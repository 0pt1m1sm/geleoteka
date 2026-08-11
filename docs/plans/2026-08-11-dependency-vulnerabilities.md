# Устранение 33 уязвимостей зависимостей — Implementation Plan

Created: 2026-08-11
Status: VERIFIED
Mode: auto
Iterations: 1
Type: Bugfix

## Контекст

Dependabot: 33 открытых алерта (17 high, 12 moderate, 4 low). Раскладка:
- **next 16.2.3 (runtime, прямая, пиновано точно): 22 алерта** (11 high —
  DoS в Server Actions, middleware bypass, SSRF×2 и др.) — все закрываются
  16.2.11. eslint-config-next держать той же версии.
- **postcss (runtime, транзитивная: next→8.4.31, @tailwindcss/postcss и
  vite→8.5.16): 4 алерта** — нужен ≥8.5.23 (overrides, если родительские
  диапазоны не дотянутся).
- **sharp ^0.34.5 (runtime, прямая): 1 high** — нужен 0.35.0.
- **dev-транзитивки: 6 алертов** — js-yaml 4.1.1→4.3.0 (via eslint),
  esbuild 0.27.7→0.28.1 (via tsx/vite), brace-expansion 1.1.13→1.1.16 и
  5.0.5→5.0.7 (via minimatch), @babel/core 7.29.0→7.29.6.

Открытый dependabot PR #17 (31.07: next 16.2.11, sharp, esbuild, js-yaml) —
закрыть как superseded после мержа нашего PR: его ветка собрана против
старого main и не проходила локальный полный гейт.

Осторожность: проект на кастомизированном Next («NOT the Next.js you know»)
— бампы только в пределах 16.2.x, после бампа полный гейт + runtime-смоук
(dev-сервер, ключевые страницы) обязательны.

## Progress Tracking

- [x] Story 1: next 16.2.3 → 16.2.11 (+eslint-config-next) — 22 алерта (Status: VERIFIED)
- [x] Story 2: runtime-хвосты — sharp 0.35.0, postcss ≥8.5.23 — 5 алертов (Status: VERIFIED)
- [x] Story 3: dev-транзитивки + финал — npm audit 0, PR, деплой, #17 закрыт dependabot'ом (Status: VERIFIED)

## Implementation Tasks

### Story 1: next → 16.2.11

**Objective:** Закрыть все 22 next-алерта патч-бампом в пределах 16.2.x.

**Files:** package.json (next 16.2.11 точно, eslint-config-next 16.2.11),
package-lock.json.

**Шаги:** npm install next@16.2.11 eslint-config-next@16.2.11 --save-exact
(манера пиновки как сейчас: next пинован точно) → полный гейт (tsc, vitest,
lint, build) → runtime-смоук: dev-сервер, curl /, /services, /profile
с сессией, /admin (307), /booking.

**DoD:** гейт зелёный; смоук-страницы отвечают 200/307 как раньше;
`npm ls next` = 16.2.11.

### Story 2: sharp + postcss

**Objective:** Закрыть оставшиеся runtime-алерты.

**Шаги:** npm install sharp@^0.35.0; postcss — сначала npm update postcss,
если транзитивные диапазоны не пускают до 8.5.23 → package.json overrides
{"postcss": ">=8.5.23"} (проверить, что Tailwind v4/next собираются).
Прогнать build обязательно (postcss в сборочном пути), tsc+vitest.

**DoD:** `npm ls sharp postcss` без версий из уязвимых диапазонов; гейт зелёный.

### Story 3: dev-транзитивки + финал

**Objective:** Ноль открытых уязвимостей; изменения в проде; #17 закрыт.

**Шаги:** npm update js-yaml esbuild brace-expansion @babel/core (overrides
точечно, если диапазоны пинуют); `npm audit` → 0 vulnerabilities (или
задокументированный остаток с обоснованием); PR → CI → squash → деплой-вотч
→ прод здоров; закрыть PR #17 комментарием «superseded»; свериться с
dependabot alerts (счёт может обновляться с лагом — тогда критерий:
установленные версии ≥ first_patched по каждому алерту).

**DoD:** npm audit 0 (или объяснённый остаток); прод на новом коммите,
сайт 200; PR #17 закрыт.

## Verification (initiative)

- Полный гейт на каждой истории; runtime-смоук после бампа next.
- Прод после деплоя: главная 200, /profile 307, sitemap отдаётся.
- Все 33 алерта покрыты установленными версиями ≥ first_patched.
