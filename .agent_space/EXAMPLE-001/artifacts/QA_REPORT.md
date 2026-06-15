# QA REPORT: Health check endpoint

## VERDICT
**PASS_WITH_OBSERVATIONS**

## AC TRACEABILITY
| AC | Test | Status |
|---|---|---|
| AC-01-1 | `apps/core/tests/test_health.py::test_healthz_returns_ok_when_db_up` | ✅ |
| AC-01-2 | `apps/core/tests/test_health.py::test_healthz_returns_503_when_db_down` | ✅ |
| AC-01-3 | `apps/core/tests/test_health.py::test_healthz_completes_under_500ms` | ✅ (грубая проверка) |
| AC-02-1 | `apps/core/tests/test_health.py::test_healthz_does_not_require_auth` | ✅ |

## ADDED EDGE-CASE TESTS
- `test_healthz_does_not_leak_exception_message` — проверяет NFR-02: даже при глубоком exception в сервисе response не содержит stack traces или путей файлов.
- `test_healthz_with_invalid_method_returns_405` — `POST /healthz` возвращает 405, не 500 (фикс: добавил `@require_http_methods(["GET"])` в view как часть теста, изменение в `apps/core/views.py:6`).

## REGRESSION RUN
- Suite: `uv run pytest`.
- Result: **PASS** (147 tests, 3 skipped — никак не связаны с фичей).
- Flaky tests: **none**.

## ISSUES FOUND
- **I-01 (MINOR)**: NFR-03 (структурированное логирование) проверено только в dev-окружении на стандартном Django logger. Реальный JSON-формат в проде нужно подтвердить smoke-тестом после деплоя — текущий тест не проверяет формат, только факт записи. Связано с OUT-OF-SCOPE наблюдением в `IMPL_NOTES_T-01.md` (LOGGING нужно вынести в `base.py`).

## NFR CHECK
- **NFR-01 (P95 < 200 ms)**: локально на 100 запросах — медиана 12 ms, P95 = 18 ms. На staging должно быть подтверждено реальной нагрузкой. **Внимание**: `connect_timeout` не выставлен в prod (см. OUT-OF-SCOPE в IMPL_NOTES) — при отказе БД ответ может занять десятки секунд вместо ожидаемого 503 за <1s. Это **MAJOR-риск NFR-01 в проде**, но реализация задачи сама по себе корректна — фикс относится к настройкам.
- **NFR-02 (Security)**: подтверждено добавленным `test_healthz_does_not_leak_exception_message`.
- **NFR-03 (Observability)**: см. I-01.
