# REQUIREMENTS: Health check endpoint

## ACTORS
- **monitoring_system**: внешний мониторинг (k8s liveness/readiness probe, статус-страница).
- **on_call_engineer**: человек, проверяющий состояние сервиса вручную при инциденте.

## USER STORIES

### US-01: Liveness/readiness probe
**Как** monitoring_system, **я хочу** получать быстрый HTTP-ответ о состоянии сервиса, **чтобы** автоматически принимать решения о restart/traffic.

#### Acceptance Criteria
- **AC-01-1**: Given сервис работает, When отправляется `GET /healthz`, Then ответ `200` с body `{"status": "ok", "db": "ok", "version": "<semver>"}`.
- **AC-01-2**: Given БД недоступна, When отправляется `GET /healthz`, Then ответ `503` с body `{"status": "degraded", "db": "down", "version": "<semver>"}`.
- **AC-01-3**: Given эндпоинт вызван, When ответ сформирован, Then общее время ответа `< 500 ms` при здоровой БД.

### US-02: Без аутентификации
**Как** monitoring_system, **я хочу** обращаться к `/healthz` без аутентификации, **чтобы** не зависеть от auth-системы для мониторинга.

#### Acceptance Criteria
- **AC-02-1**: Given анонимный запрос, When `GET /healthz`, Then ответ как в AC-01-1 (без `401`/`403`).

## NON-FUNCTIONAL REQUIREMENTS
- **NFR-01 (Performance)**: P95 latency < 200 ms при здоровой БД.
- **NFR-02 (Security)**: эндпоинт не возвращает stack traces или внутренние пути даже при ошибке.
- **NFR-03 (Observability)**: каждый запрос `/healthz` логируется на уровне INFO с correlation ID; для 503 — WARNING.

## ASSUMPTIONS
- **A-01**: Версия приложения доступна через переменную окружения `APP_VERSION`.

## CONSTRAINTS
- **C-01**: Эндпоинт должен быть в стандартном Django URL, не в отдельном lightweight-сервисе.

## OUT OF SCOPE
- Глубокая проверка downstream-сервисов (Redis, очереди) — отдельная задача.
- Метрики Prometheus — отдельная задача.
- Аутентификация и rate-limiting эндпоинта (намеренно открыт для k8s).

## OPEN QUESTIONS
- **Q-01** (закрыт A-01): откуда брать версию? — `APP_VERSION` env при импорте модуля.
