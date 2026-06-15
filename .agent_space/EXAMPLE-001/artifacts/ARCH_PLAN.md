# ARCHITECTURE: Health check endpoint

## OVERVIEW
Один эндпоинт в существующем Django-приложении `apps/core/`. Сервис-функция выполняет лёгкую проверку БД (`SELECT 1`) и формирует структуру `HealthReport`. View превращает её в `JsonResponse` с правильным HTTP-статусом. Версия сервиса читается из env при импорте модуля.

```
GET /healthz ──▶ HealthCheckView ──▶ check_health() ──▶ DB(SELECT 1)
                       │
                       └────────────▶ JsonResponse(200 | 503)
```

## COMPONENTS

### C-01: HealthCheckView (`apps/core/views.py`)
- **Назначение**: HTTP-эндпоинт `/healthz`.
- **Ответственность**: вызывает service, формирует JSON-response с правильным статус-кодом, пишет лог.
- **НЕ делает**: бизнес-логику, аутентификацию, прямые SQL-запросы.
- **Зависимости**: C-02.

### C-02: `check_health()` (`apps/core/services/health.py`)
- **Назначение**: чистая функция, возвращающая `HealthReport`.
- **Ответственность**: проверка БД через `SELECT 1`, чтение версии.
- **НЕ делает**: формирование HTTP-ответа, логирование.
- **Зависимости**: Django DB connection.

## CONTRACTS

### CT-01: GET /healthz
- **Тип**: REST endpoint.
- **Сигнатура**:
  - Request: `GET /healthz` (no body, no auth).
  - Response `200`: `{"status": "ok", "db": "ok", "version": "<str>"}`.
  - Response `503`: `{"status": "degraded", "db": "down", "version": "<str>"}`.
- **Семантика**: синхронный, идемпотентный.
- **Ошибки**: внутренние exception → `503` с маскированным сообщением. Никогда не возвращает `500` со stack trace.

## DATA FLOWS
1. Request → URL router → `HealthCheckView.health_view(request)`.
2. View → `check_health()` → `connection.cursor().execute("SELECT 1")` с таймаутом 1s; ловит `OperationalError`.
3. Service возвращает `HealthReport(db_ok: bool, version: str)`.
4. View → `JsonResponse` с body и статусом 200 или 503.

## TECH STACKS
- `backend_python_django` — единственный стек проекта.

## DECISIONS

### D-01: `SELECT 1` vs ORM `.exists()`
- **Решение**: `connection.cursor().execute("SELECT 1")`.
- **Обоснование**: минимальный overhead, не зависит от схемы; работает даже если ни одна таблица не создана.
- **Альтернативы**: `User.objects.exists()` — отвергнуто (зависит от схемы и кэшей менеджеров).
- **Последствия**: при смене драйвера БД нужно подтвердить совместимость синтаксиса (`SELECT 1` — стандарт ANSI).

### D-02: Версия из env при импорте
- **Решение**: `APP_VERSION = os.environ.get("APP_VERSION", "unknown")` в модуле сервиса.
- **Обоснование**: статичная версия за процесс — корректно для контейнерного деплоя; не требует I/O при каждом запросе.
- **Альтернативы**: чтение из `pyproject.toml` — отвергнуто как лишний I/O при импорте.
- **Последствия**: hot-reload версии без рестарта невозможен — допустимо для нашего CD.

## NFR MAPPING
- **NFR-01 (P95 < 200 ms)** → `SELECT 1` даёт <5 ms на здоровой БД; целевое время в основном от Django request overhead. Добавить query timeout `1s` как страховку от зависшего соединения.
- **NFR-02 (Security)** → exception handler возвращает только `{"status": "degraded", "db": "down"}`, не `str(exc)`. Никаких stack traces.
- **NFR-03 (Observability)** → структурированный логгер с correlation ID. Уровень INFO для 200, WARNING для 503. Поле `endpoint="healthz"` для фильтрации.

## RISKS
- **R-01**: Частые вызовы `/healthz` от k8s могут забивать общий request log. Mitigation: `endpoint="healthz"` как структурное поле; команда наблюдаемости может исключить его в общих дашбордах.
- **R-02**: При наличии глобального `LoginRequiredMixin`/middleware эндпоинт может неожиданно стать защищённым. Mitigation: явный test-case на анонимный доступ (AC-02-1).
