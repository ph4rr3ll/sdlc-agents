# EXAMPLE-001 — эталонный end-to-end прогон

Минимальный реальный пример полного цикла команды: от запроса пользователя до `DONE`, с демонстрацией секции **`EVIDENCE`** и трёх слоёв защиты от каскадных галлюцинаций.

## Фича

Реализовать эндпоинт `GET /healthz` для Django-проекта со стеком `backend_python_django`. Возвращает статус сервиса и состояние БД для k8s liveness/readiness проб.

## Маршрут

```
user → manager
        ├→ shaper         → REQUIREMENTS.md + ARCH_PLAN.md + TASKS.md (в один проход)
        ├→ coder_backend  → код + IMPL_NOTES_T-01.md
        ├→ reviewer       → REVIEW_T-01.md  (APPROVED, 1 MINOR)
        └→ qa             → QA_REPORT.md  (PASS_WITH_OBSERVATIONS)
                          → DONE
```

10 шагов в `history` (раньше было 16 — экономия за счёт объединения analyst+architect+tech_lead в shaper и удаления writer/DOCS-стадии).

## Что лежит здесь

- `STATE.json` — полный журнал из 10 шагов (0 → 9).
- `artifacts/` — артефакты всех специалистов:
  - От shaper: `REQUIREMENTS.md`, `ARCH_PLAN.md`, `TASKS.md` (три файла в один проход)
  - `IMPL_NOTES_T-01.md` (coder_backend), `REVIEW_T-01.md` (reviewer), `QA_REPORT.md` (qa)
- `handoffs/` — **6 из 8** брифов и отчётов:
  - `01_shaper_brief.md`, `02_shaper_report.md` — пара shaping (новый flow с тремя артефактами).
  - `03_coder_backend_brief.md`, `04_coder_backend_report.md` — пара со **стек-загрузкой и тестовыми прогонами в EVIDENCE**.
  - `06_reviewer_report.md` — отчёт ревьюера с **file:line цитированием диффа** в EVIDENCE.
  - `08_qa_report.md` — отчёт QA с **AC TRACEABILITY**, где каждая строка матрицы опирается на `[VERIFIED:cmd] uv run pytest …`, плюс пример `[ASSUMED]` для NFR-03.

  Опущены briefs для reviewer (05) и qa (07) — формат идентичен 03_coder_backend_brief.md.

## Что демонстрирует EVIDENCE

Эталонные отчёты показывают, как заполнять секцию для **разных типов агентов** (с учётом её opt-in природы):

| Агент | EVIDENCE | Чем характерна |
|---|---|---|
| `shaper` | **опциональна** | Преимущественно `[VERIFIED:file]` — прочитанные бриф и stack-файлы. Один `[ASSUMED]` — допущение, которое потом стало `A-01` в `REQUIREMENTS.md`. |
| `coder_backend` | **обязательна** | Преимущественно `[VERIFIED:cmd]` — реальные прогоны `uv run pytest/ruff/mypy` с конкретными результатами + `[VERIFIED:file]` для прочитанных артефактов и стека. |
| `reviewer` | **обязательна** | Цитирование **диффа построчно** через `[VERIFIED:cmd] git diff … -- <path>` — каждый finding F-XX опирается на эту запись. Контроль того, что reviewer **реально читал дифф**, а не придумывал строки. |
| `qa` | **обязательна** | Доказательство существования каждого теста, на который ссылается AC TRACEABILITY: `[VERIFIED:cmd] uv run pytest --collect-only` + `[VERIFIED:cmd]` каждого конкретного `test_xxx::test_yyy`. NFR-03 показан как `[ASSUMED]` — честное признание границ проверки. |

## Как читать

1. **Старт** — открой `STATE.json` и пройди по `history` сверху вниз.
2. **На каждом шаге** — открой соответствующий артефакт из `artifacts/` (если был создан) или handoff (если показан).
3. **Сравни** `01_shaper_brief.md` с шаблоном `.agents/_templates/delegation_prompt.md` — формат идентичен.
4. **Сравни** `02_shaper_report.md` с шаблоном `.agents/_templates/handoff.md` — обрати внимание, что EVIDENCE для shaper заполнена, хотя могла быть опущена (opt-in).
5. **Прогон валидатора** на любом отчёте:
   ```bash
   python3 .agents/_tools/validate.py --task EXAMPLE-001 --handoff .agent_space/EXAMPLE-001/handoffs/06_reviewer_report.md
   ```
   Должен вернуть `OK: N checks, 0 failures`.

## Где код

Этот пример **демонстрирует workspace**, а не реальный Django-проект. В живом использовании `coder_backend` создал бы файлы в `apps/core/...` исходного репозитория. Здесь `IMPL_NOTES_T-01.md` лишь перечисляет, какие файлы были бы изменены.

## Связь с другими документами

- **`HUMAN-GATES.md`** (в корне) — как при таком прогоне настроить ручные подтверждения переходов.
- **`.agents/_tools/validate.py`** — слой автоматической проверки, который менеджер запускает после каждого handoff.
- **`.agents/_templates/handoff.md`** — формальный шаблон, по которому написаны все отчёты в этом примере (EVIDENCE conditional).
- **`.agents/_common/`** — стандартный ACTIVATION_PROTOCOL и universal CONSTRAINTS, на которые ссылаются манифесты специалистов.
