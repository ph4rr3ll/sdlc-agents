---
stack_id: "backend_python_django"
language: "Python 3.12+"
framework: "Django 5.x"
package_manager: "uv"
linter_cmd: "uv run ruff check ."
format_cmd: "uv run ruff format ."
type_check_cmd: "uv run mypy ."
test_cmd: "uv run pytest"
---
# STACK POLICY: PYTHON BACKEND (Django)

Политика на сессию `coder_backend`, `reviewer`, `qa` (тестовая часть). Обязательна к соблюдению при загрузке.

## LANGUAGE_BASELINE
- Python 3.12+. Новые конструкции (type parameter syntax, `@override`) разрешены.
- **Явная типизация обязательна** на все публичные функции, методы, поля моделей и serializer'ов. Локальные переменные — без типов, если очевидно из контекста.
- `mypy` в strict mode. Падение `type_check_cmd` — game-stopper.

## PACKAGE_MANAGEMENT
- **Только `uv`**. Запрещено: `pip install`, прямое редактирование `requirements.txt`.
- Добавление: `uv add [pkg]`. Dev: `uv add --dev [pkg]`. Удаление: `uv remove [pkg]`.
- `uv.lock` коммитится.
- Версия Python — через `.python-version`, синхронизована с `pyproject.toml`.

## PROJECT_LAYOUT
```
project/
├── pyproject.toml
├── uv.lock
├── .python-version
├── manage.py
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── dev.py
│   │   ├── prod.py
│   │   └── test.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   └── <app_name>/
│       ├── models.py
│       ├── services.py    # write-side бизнес-логика
│       ├── selectors.py   # read-side, query-функции
│       ├── views.py       # тонкие view
│       ├── serializers.py
│       ├── urls.py
│       ├── admin.py
│       └── tests/
└── tests/                 # cross-app integration tests
```

## DJANGO_IDIOMS
- **Тонкие views, толстые сервисы.** View — парсинг входа, вызов service, формирование response. Бизнес-логика — в `services.py` (write) и `selectors.py` (read).
- **Fat models — только для простых инвариантов** (`@property`, валидация поля через `clean()`). Бизнес-операции — в сервисах.
- **Сигналы — анти-паттерн.** Допустимы только для интеграции со сторонним кодом (например, `post_migrate` или сторонние app). Внутренние flow выражай явными вызовами сервисов.
- **Class-based views** только когда они дают конкретное преимущество. Для DRF: `APIView`/`GenericAPIView`. `ViewSet` — только когда явно нужен полный CRUD-набор без кастомизации.
- **Custom user model** обязателен с первого дня (`AUTH_USER_MODEL = "users.User"`).
- Управление командами через `BaseCommand` в `management/commands/`, не через скрипты в корне.

## ORM_RULES
- Каждый QuerySet, идущий в шаблон или serializer, проходит через `.select_related()` / `.prefetch_related()`. **N+1 = bug, не оптимизация.**
- `Model.objects.create(...)`, `.save()`, `.delete()` запрещены в `views.py` и сторонних модулях. Только через `services.py` / `selectors.py`.
- Транзакции: явный `with transaction.atomic():` для multi-step операций. `ATOMIC_REQUESTS = False`.
- `QuerySet.update()` — не вызывает сигналы и `save()`. Используй сознательно, отмечай комментарием.
- Запрещено `__exact` в фильтрах (он default). `__iexact`, `__contains`, `__icontains` — пишутся явно.
- Денормализация — только с явным обоснованием в `ARCH_PLAN.md`.
- Индексы создаются вместе с моделью; добавление индекса в продакшн на большой таблице — отдельная задача `devops`.

## API_LAYER (DRF)
- **DRF** для REST. Альтернатива — `django-ninja`, если зафиксирована в `ARCH_PLAN`.
- Serializers: отдельный read и write, если поля сильно различаются. Не делай god-serializer.
- Permissions — на уровне view (`permission_classes`), не в serializer. Frontend не отвечает за авторизацию.
- Pagination — `LimitOffsetPagination` (стандарт) или `CursorPagination` (бесконечные ленты).
- Версионирование API — через URL prefix (`/api/v1/`).
- Ошибки — единый формат: `{ "detail": "...", "code": "...", "errors": {...} }`. Кастомный exception handler.

## MIGRATIONS
- Каждое изменение модели = миграция в том же PR.
- Имя миграции — осмысленное: `0042_add_user_email_index`, не `0042_auto_...`. Команда: `uv run python manage.py makemigrations --name <name> <app>`.
- Forward-compatible deploy: новая колонка с `null=True` или `default`. Бэкфилл данных — отдельная миграция (`RunPython`).
- Запрещено редактировать применённые в проде миграции.
- Тяжёлые `RunPython` тестируются на staging-копии prod.

## SETTINGS_MANAGEMENT
- `django-environ` для чтения `.env`. `.env.example` коммитится с заглушками (без реальных значений).
- Запрещено: hard-coded секреты, прямой `os.environ.get` в settings.
- Settings разделены: `base.py`, `dev.py`, `prod.py`, `test.py`. Переключение через `DJANGO_SETTINGS_MODULE`.
- `DEBUG = False` в prod — проверяется в CI отдельным шагом.
- `ALLOWED_HOSTS` — явный whitelist, никаких `"*"`.

## TESTING
- `pytest` + `pytest-django`. Запрещено: `unittest.TestCase` напрямую.
- Фикстуры — через `pytest` (`conftest.py`), не Django `.json` fixtures.
- БД в тестах — **реальная** (PostgreSQL для integration, SQLite допустим для чисто unit). **Запрещено мочить ORM** (`mock.patch` на менеджеры моделей).
- `factory_boy` для построения объектов в тестах. Запрещено ручное `Model(field=...)` в тестах.
- Каждый view — минимум два теста: happy path и failure mode (auth, validation, not found).
- E2E через `pytest-playwright` или Django `LiveServerTestCase` — для критических flow.
- `pytest-django` flags: `--reuse-db` локально, `--create-db` в CI.

## SECURITY
- CSRF включён для всех state-changing операций.
- CORS — `django-cors-headers`, whitelist явный, никаких `CORS_ALLOW_ALL_ORIGINS = True`.
- В `prod.py`: `SECURE_SSL_REDIRECT=True`, `SECURE_HSTS_SECONDS>=31536000`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`.
- Запрещено: `mark_safe`, `format_html` с user input без явного экранирования.
- Запрещено: `eval`, `exec` в любом виде.
- Логирование — без PII. Если PII попало в лог — это инцидент.
- Rate limiting — `django-ratelimit` или DRF `throttle_classes` на чувствительных эндпоинтах.

## OBSERVABILITY
- `structlog` для structured logging. JSON output в проде.
- Sentry для exceptions. PII фильтруется через `before_send`.
- Метрики: `django-prometheus` или OpenTelemetry. Минимум — request latency, error rate, DB query count.
- Correlation ID через middleware, прокидывается в логи и в HTTP-заголовки downstream-запросов.

## FORBIDDEN
- `django.contrib.admin` в публичных URL без аутентификации (`@staff_member_required` минимум).
- `signals` для внутренней бизнес-логики.
- `Model.objects.create(...)` в `views.py` (см. ORM_RULES).
- `print` для отладки — `logger.debug` / `logger.info`.
- `assert` для валидации пользовательского входа: `AssertionError` отключается с `python -O`. Используй явные exception'ы (`ValidationError`, `ValueError`).
- Глобальное состояние модуля для cache/счётчиков. Используй Redis или БД.
- `time.sleep` в production-коде.
