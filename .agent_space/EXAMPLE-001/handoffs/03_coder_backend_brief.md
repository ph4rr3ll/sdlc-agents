# BRIEF: manager → coder_backend  (step 03)

## ROLE_ACTIVATION
Ты вызван как `coder_backend`. Действуй согласно манифесту `.agents/coder_backend.md` и обязательно загрузи политику стека из `TECH_STACKS` ниже.

## TASK_GOAL
Реализовать задачу T-01: добавить эндпоинт `GET /healthz` в Django-проект согласно `ARCH_PLAN.md` и `TASKS.md`. Покрыть тестами все 4 acceptance criteria. Прогнать `linter_cmd`, `type_check_cmd` и `test_cmd` стека до зелёного.

## WORKSPACE_CONTEXT
- **TASK_ID**: `EXAMPLE-001`
- **WORKSPACE**: `.agent_space/EXAMPLE-001/`
- **Исходная задача пользователя**: эндпоинт `/healthz` для k8s liveness/readiness проб.
- **Текущая стадия**: `CODING`

## INPUTS
- `WORKSPACE/artifacts/TASKS.md` — твоя задача `T-01` (Files/modules, Goal, DoD, Notes).
- `WORKSPACE/artifacts/ARCH_PLAN.md` — релевантные контракт `CT-01`, компоненты `C-01`/`C-02`, решения `D-01`/`D-02`.
- `WORKSPACE/artifacts/REQUIREMENTS.md` — `AC-01-1`, `AC-01-2`, `AC-01-3`, `AC-02-1` и `NFR-01..03`, которые задача должна покрыть.

## TECH_STACKS
- `.agents/stacks/backend_python_django.md` — **обязательная политика** на сессию (uv, ruff, mypy strict, pytest-django, services/selectors паттерн, запрет signals для бизнес-логики).

## EXPECTED_OUTPUT
- **Изменения в рабочем коде** проекта:
  - `apps/core/services/health.py`
  - `apps/core/views.py`
  - `apps/core/urls.py`
  - `config/urls.py`
  - `apps/core/tests/test_health.py`
- **Артефакт**: `WORKSPACE/artifacts/IMPL_NOTES_T-01.md`.
- **Handoff-отчёт** по шаблону `.agents/_templates/handoff.md`.

## CONSTRAINTS
- Не выходи за `Files/modules` из T-01. Несвязанные баги — в `OUT-OF-SCOPE OBSERVATIONS`, не чинить.
- Запрещено использовать `pip`/`poetry` — только `uv` (см. стек).
- Mocks только на границах внешних систем. Для проверки «БД недоступна» допустимо мокать `connection.cursor` — это драйверная граница, не ORM-логика. Это исключение зафиксируй в `TACTICAL DECISIONS`.
- `uv run pytest apps/core/tests/test_health.py`, `uv run ruff check .`, `uv run mypy .` — все три зелёные. Иначе — `BLOCKER`.
- Эндпоинт без auth: проверь middleware (см. `R-02` в `ARCH_PLAN.md` и `R-01` в `TASKS.md`).

## RETURN_FORMAT
См. `.agents/_templates/handoff.md`. В `STATE_PATCH` — `current_stage: REVIEW`, `active_agent: reviewer`.

В `EVIDENCE` обязательно: `[VERIFIED:cmd]` для каждого прогона (`uv run pytest ...`, `uv run ruff ...`, `uv run mypy ...`), `[VERIFIED:file]` для прочитанных артефактов (`TASKS.md`, `ARCH_PLAN.md`, `REQUIREMENTS.md`) и stack-файла. Без EVIDENCE — `validate.py` отклоняет handoff. С флагом `--rerun-tests` менеджер может перепрогнать заявленные тесты — не врать о результатах.
