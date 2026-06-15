---
stack_id: "frontend_react"
language: "TypeScript 5.4+"
framework: "React 19"
runtime: "Node 20+"
package_manager: "pnpm"
build_tool: "Vite"
linter_cmd: "pnpm lint"
format_cmd: "pnpm format"
type_check_cmd: "pnpm typecheck"
test_cmd: "pnpm test"
build_cmd: "pnpm build"
---
# STACK POLICY: FRONTEND (React + TypeScript)

Политика на сессию `coder_frontend`, `reviewer`, `qa` (тестовая часть). Базовые правила HTML/CSS/JS/a11y/perf — в манифесте `coder_frontend.md`. Этот файл задаёт надстройку: TypeScript, React, инструменты.

## LANGUAGE_BASELINE
- TypeScript 5.4+, strict mode: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`.
- Запрещено: `any`. Если без него никак — `unknown` + narrowing.
- Запрещено: `@ts-ignore`. `@ts-expect-error` — только с обязательным комментарием-обоснованием.
- `import type { ... }` для типов.
- Discriminated unions предпочтительнее enum.

## PACKAGE_MANAGEMENT
- **Только `pnpm`**. Запрещено: `npm install`, `yarn add`.
- Добавление: `pnpm add [pkg]`. Dev: `pnpm add -D [pkg]`. Удаление: `pnpm remove [pkg]`.
- `pnpm-lock.yaml` коммитится.
- Workspaces — через `pnpm-workspace.yaml`, если монорепо.

## RUNTIME / BUILD
- **Vite**. Запрещено: webpack, Create React App, parcel.
- Next.js — только если `ARCH_PLAN` явно требует SSR/SSG (тогда отдельный стек).
- Node 20+ (LTS) для разработки и CI.
- Production build: ESM, target — Web Platform Baseline (последние 2 версии вечнозелёных браузеров).

## PROJECT_LAYOUT
```
src/
├── main.tsx               # entry
├── App.tsx
├── routes/                # route components
├── features/              # feature-based
│   └── <feature>/
│       ├── api.ts             # data fetching (query/mutation хуки)
│       ├── components/
│       ├── hooks/
│       ├── types.ts
│       └── index.ts           # barrel — публичный API фичи
├── shared/
│   ├── ui/                # generic UI components
│   ├── lib/               # utilities
│   └── api/               # HTTP client, базовые типы
└── styles/                # глобальные стили, токены
```
- **Feature-based**, не layer-based. Глобальные папки `components/`, `hooks/`, `utils/` — анти-паттерн (быстро превращаются в свалку).
- `index.ts` (barrel) — только на уровне фичи; определяет публичный API. Внутри фичи импорты по прямым путям.

## CODE_STYLE_RULES
- ESLint + `@typescript-eslint` strict, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`.
- Prettier для форматирования (`pnpm format`).
- Имена:
  - Компоненты: `PascalCase.tsx` (`UserCard.tsx`)
  - Хуки: `useCamelCase.ts` (`useUserQuery.ts`)
  - Утилиты: `kebab-case.ts` (`format-date.ts`)
  - Типы: `kebab-case.types.ts` или внутри файла
- Запрещено: `export default` для компонентов и хуков (мешает рефакторингу). Только named exports.
- Запрещено: смешивать в одном файле UI и сложную бизнес-логику. UI — в `.tsx`, чистая логика — в `.ts`.

## REACT_IDIOMS
- **Только функциональные компоненты + хуки**. Class components запрещены.
- React 19+: используй `use()` для промисов и контекста, Actions для форм, `useActionState`/`useFormStatus`.
- **Композиция через `children` > prop drilling > Context**. Context — последнее средство для реально глобального состояния (тема, текущий пользователь).
- `useEffect` — **последнее средство**. Сначала спроси:
  1. Можно ли вычислить во время рендера?
  2. Можно ли в обработчике события?
  3. Это синхронизация с внешней системой?
- `useMemo`/`useCallback` — **только при доказанной проблеме перерендера**, не профилактически. При наличии React Compiler — оставить ему.
- `key` для списков — стабильный уникальный ID, не `index` (кроме статических списков, не меняющих порядок).
- Контролируемые компоненты для форм. Uncontrolled — только когда контролируемый невозможен.
- Компонент >150 строк или >2 ответственностей — кандидат на декомпозицию.

## STATE_MANAGEMENT
- **Local state** (`useState`/`useReducer`) — по умолчанию.
- **Server state** — TanStack Query. Запрещено дублировать server state в Redux/Zustand.
- **Global client state** — только реально global (тема, текущий пользователь, нотификации). Zustand или Context. Redux — только если зафиксирован в `ARCH_PLAN`.
- **URL — тоже состояние.** Фильтры таблиц, пагинация, открытые табы — в `searchParams`, не в local state. Иначе теряется при F5 и не шарится ссылкой.

## ROUTING
- React Router v6+ **или** TanStack Router. Один на проект, выбор фиксируется в `ARCH_PLAN`.
- Code splitting по роутам **обязателен** (`React.lazy` или route-level lazy loading).
- Error boundaries — на каждом верхнеуровневом маршруте.
- 404 — обработан явным catch-all маршрутом.

## DATA_FETCHING
- TanStack Query для server state.
- Один источник правды на endpoint — кастомный хук в `features/<X>/api.ts`. Не вызывай `useQuery(...)` напрямую в компоненте — всегда обёртка с типизацией.
- **Запрещено**: `useEffect(() => { fetch(...); }, [])`. Только query/mutation-хуки.
- Optimistic updates — только если откат недорог и UX этого требует.
- HTTP-клиент: `fetch` + типизированная обёртка или `ky`. Запрещено: `axios` без явной причины в `ARCH_PLAN`.

## STYLING
- **CSS Modules** (`*.module.css`) по умолчанию.
- **Tailwind** — если зафиксирован в `ARCH_PLAN`. Тогда CSS Modules — только для уникальных кастомных стилей.
- Запрещено: `style={{...}}` для статических стилей. Динамические значения — через CSS custom properties.
- Дизайн-токены — CSS custom properties в `:root` (`--color-primary`, `--space-2`, `--radius-md`).
- Запрещено: runtime CSS-in-JS (styled-components, emotion) без явного решения в `ARCH_PLAN`. Они дороги по перфу и SSR.

## FORMS
- **React Hook Form + Zod** для валидации.
- Zod-schema — единая для клиента и backend (если backend на TS) или продублирована и проверена на консистентность.
- Запрещено: ручной `useState` на каждое поле формы, кроме формы из одного поля.

## TESTING
- **Vitest** для unit и component tests.
- **React Testing Library** — тестируй поведение, не имплементацию. Запросы к DOM через `getByRole` приоритетно, `getByLabelText` для форм, `getByText` для контента. `getByTestId` — последнее средство.
- **Playwright** для E2E на критических flow.
- Запрещено: `enzyme`, `shallow rendering`.
- Запрещено: тесты, лезущие во внутреннее состояние (`useState`) или подсчитывающие вызовы хуков. Если без этого никак — переделай компонент.
- Mocks: только сетевые границы (MSW для HTTP). Не мочи внутренние хуки и функции.
- Каждое поведение (не файл!) покрывается минимум одним тестом.

## ACCESSIBILITY
- Базовые правила WCAG 2.2 AA — в манифесте `coder_frontend.md`.
- В этом стеке: используй headless-библиотеки для сложных интерактивных паттернов:
  - **Radix UI** или **React Aria** — modal, combobox, menu, listbox, tooltip.
  - Они правильно реализуют ARIA, фокус и клавиатурную навигацию.
- Запрещено: реализовывать modal/dropdown/combobox с нуля без явной причины (a11y delta огромная).
- `eslint-plugin-jsx-a11y` обязателен в pipeline.

## PERFORMANCE
- Bundle budget определяется в `ARCH_PLAN`. Если не определён — рост main bundle >10% от baseline = `BLOCKER`.
- Lazy-load ниже fold: компоненты через `React.lazy` + `Suspense`.
- Изображения: `<picture>` или next-gen форматы (AVIF/WebP). `loading="lazy"` на не-критичные.
- `useDeferredValue` / `useTransition` для тяжёлых обновлений UI (фильтры по большим спискам).
- React DevTools Profiler — обязательная проверка при подозрении на проблему перерендера, до добавления `useMemo`.

## FORBIDDEN
- `dangerouslySetInnerHTML` без явной санитизации (DOMPurify) и обоснования.
- `localStorage`/`sessionStorage` для чувствительных данных (токены, PII).
- `eval`, `new Function()`.
- Мутация props (`props.items.push(...)`) и мутация state без копирования.
- Global state для server state (см. STATE_MANAGEMENT).
- Перерендер всего дерева через `key={Math.random()}`.
- Прямое обращение к DOM (`document.querySelector`) кроме случаев работы с focus management и порталов.
- Глобальные побочные эффекты на уровне модуля (`document.addEventListener` при импорте).
