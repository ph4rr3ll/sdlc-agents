# DEVELOPMENT TASKS: Health check endpoint

## TASK GRAPH
```
T-01 (атомарная, без зависимостей)
```

Одна задача — фича маленькая, делить нечего.

## TASKS

### T-01: Реализовать `/healthz` эндпоинт
- **Assignee**: `coder_backend`
- **Tech stacks**: `[backend_python_django]`
- **Covers**: US-01 (AC-01-1, AC-01-2, AC-01-3), US-02 (AC-02-1)
- **Files/modules**:
  - `apps/core/services/health.py` (новый)
  - `apps/core/views.py` (новый или расширение)
  - `apps/core/urls.py` (новый или расширение)
  - `config/urls.py` (подключение URL)
  - `apps/core/tests/test_health.py` (новый)
- **Goal**: эндпоинт `GET /healthz` возвращает статус сервиса и БД; реализован service-layer и view; покрыто тестами на все 4 AC.
- **DoD**:
  - [ ] Функция `check_health() -> HealthReport` в `apps/core/services/health.py`.
  - [ ] View `health_view` в `apps/core/views.py`, использует `JsonResponse`.
  - [ ] URL подключён в `config/urls.py` как `/healthz`.
  - [ ] Все 4 AC покрыты тестами в `apps/core/tests/test_health.py`.
  - [ ] `uv run pytest apps/core/tests/test_health.py` — зелёный.
  - [ ] `uv run ruff check .` — зелёный.
  - [ ] `uv run mypy .` — зелёный.
- **Depends on**: none
- **Parallel-safe with**: —
- **Notes**:
  - Эндпоинт без auth: убедись, что middleware не требует CSRF (для GET — не должен) или login (см. R-02 в `ARCH_PLAN.md`).
  - Mocks на `connection.cursor` для AC-01-2 — допустимое исключение (мокается граница БД, не ORM-логика).

## PARALLELIZATION STRATEGY
Wave 1: T-01. Всё.

## RISKS
- **R-01**: Глобальный auth middleware может неявно защитить эндпоинт. AC-02-1 ловит это в тесте.
