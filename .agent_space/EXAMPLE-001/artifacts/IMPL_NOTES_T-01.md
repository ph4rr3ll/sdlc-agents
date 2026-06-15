# IMPL NOTES: T-01

## SUMMARY
Реализован эндпоинт `GET /healthz`. Service-функция `check_health` проверяет БД через `SELECT 1`, возвращает `HealthReport`. View формирует JSON-ответ с правильным статус-кодом. Версия читается при импорте из `APP_VERSION` env.

## FILES CHANGED
- `apps/core/services/health.py` — новый модуль: `HealthReport` (`dataclass`) и `check_health()`.
- `apps/core/views.py` — добавлена `health_view` (функция, не CBV — простая).
- `apps/core/urls.py` — добавлен `path("healthz", health_view, name="healthz")`.
- `config/urls.py` — `path("", include("apps.core.urls"))` (расширение существующей строки).
- `apps/core/tests/test_health.py` — 5 тестов: happy path, БД недоступна, no auth required, latency < 500 ms, версия из env.

## TEST RESULTS
- `uv run pytest apps/core/tests/test_health.py -v`: **PASS** (5 tests).
- `uv run ruff check .`: **PASS**.
- `uv run mypy .`: **PASS**.

## TACTICAL DECISIONS
- **Функция-view, не CBV**. Один HTTP-метод, без расширения — функция короче и читабельнее. CBV `APIView` был бы overengineering.
- **Mock `connection.cursor` в тесте AC-01-2**. Это исключение из общего правила «не мочи ORM»: здесь мокается **граница** к БД (драйверный layer), не ORM-логика.
- **`csrf_exempt` не нужен**. Эндпоинт только GET; CSRF в Django применяется только к state-changing методам.
- **Timeout `1s` через `connection.cursor()` параметр `connection.connect_timeout`** — выставлен в settings (`DATABASES["default"]["OPTIONS"]["connect_timeout"] = 1`). Без правки settings выйти за scope нельзя — поэтому добавил **только в test-настройки** и оставил `OUT-OF-SCOPE OBSERVATION` для prod (см. ниже).

## OUT-OF-SCOPE OBSERVATIONS
- В `config/settings/base.py` отсутствует `LOGGING` конфигурация. NFR-03 (структурированный логгер с correlation ID) работает только в `prod.py` через подключение `structlog`. В dev и test — стандартный Django logger. Стоит вынести `LOGGING` в `base.py` отдельной задачей.
- В `config/settings/prod.py` нет `DATABASES["default"]["OPTIONS"]["connect_timeout"]`. Без него timeout `1s` в health-check не сработает в продакшне — `SELECT 1` будет ждать TCP keepalive (десятки секунд). Это влияет на NFR-01 при отказе БД. Требует отдельной задачи `devops` или PR в settings.
