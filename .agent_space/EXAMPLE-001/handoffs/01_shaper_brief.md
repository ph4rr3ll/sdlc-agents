# BRIEF: manager → shaper  (step 01)

## ROLE_ACTIVATION
Ты вызван как `shaper`. Действуй согласно своему манифесту в `.agents/shaper.md`. Этот бриф — единственный источник цели; не читай `STATE.json` для определения задачи.

## TASK_GOAL
Превратить запрос пользователя в shaped solution за один проход. Произвести три артефакта в `WORKSPACE/artifacts/`:
1. **`REQUIREMENTS.md`** — акторы, user stories с AC в Gherkin, NFR, assumptions, out-of-scope.
2. **`ARCH_PLAN.md`** — компоненты, контракты, выбор стека, ADR-стиль решения, NFR mapping, риски.
3. **`TASKS.md`** — атомарные задачи разработки с Assignee, DoD, графом зависимостей.

Подготовить материал для передачи `coder_backend`/`coder_frontend` через manager.

## WORKSPACE_CONTEXT
- **TASK_ID**: `EXAMPLE-001`
- **WORKSPACE**: `.agent_space/EXAMPLE-001/`
- **Исходная задача пользователя**: «Добавь в проект эндпоинт `/healthz` для liveness/readiness проб (k8s, мониторинг). Должен возвращать статус сервиса и состояние БД.»
- **Текущая стадия**: `INIT`

## INPUTS
- Исходный запрос (см. WORKSPACE_CONTEXT выше).
- Проект — Django; стеки для выбора — в `.agents/stacks/*.md`.

## PRIOR_KNOWLEDGE
- Команда уже использует k8s, у инстансов есть liveness/readiness probes — стандартный паттерн.
- Версия приложения деплоится контейнером; переменная окружения `APP_VERSION` уже заведена в существующих манифестах деплоя (упомянуто пользователем устно).

## EXPECTED_OUTPUT
- Три артефакта: `REQUIREMENTS.md`, `ARCH_PLAN.md`, `TASKS.md` в `WORKSPACE/artifacts/`.
- Handoff-отчёт по шаблону `.agents/_templates/handoff.md` с переходом `current_stage: CODING` и `tech_stacks` массивом выбранных стеков.

## CONSTRAINTS
- Не предлагай реализацию (код), не пиши IMPL_NOTES — только проектные документы.
- Не возвращайся назад между фазами (Requirements → Architecture → Decomposition). Нужно уточнение из фазы B в фазу A — фиксируй как `ASSUMPTION` или `OPEN QUESTION`.
- Если требования не извлекаются однозначно — выноси в `OPEN QUESTIONS` или `BLOCKER`, не «домысливай».
- Зафиксируй в **OUT OF SCOPE**: интеграция с Prometheus, проверки downstream-сервисов (Redis, очереди) — это отдельные задачи.
- Если ни один стек из `.agents/stacks/` не подходит — `BLOCKER`, не изобретай.

## RETURN_FORMAT
См. `.agents/_templates/handoff.md`. Ожидаются секции: `SUMMARY`, `ARTIFACTS` (три пути), `EVIDENCE` (опциональна для shaper, но рекомендую `[VERIFIED:file]` для подтверждения чтения брифа и stack-файлов), `DECISIONS` (ключевые решения по компонентам / стеку / декомпозиции), `OPEN_QUESTIONS` (если есть), `BLOCKERS` (если есть), `RECOMMENDED_NEXT` (manager — он распределит задачи), `STATE_PATCH` с `current_stage: CODING` и `tech_stacks`.
