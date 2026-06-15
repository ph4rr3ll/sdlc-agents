# Kilo Code Integration (VS Code Plugin)

Под Kilo Code **v7.3+** (схема `kilo.jsonc` + `.kilo/agents/`). Если у тебя более старая версия (`.kilocodemodes` / `customModes` array) — обнови плагин или адаптируй файлы под legacy-схему вручную (плагин обещает auto-migration при первом запуске на старых конфигах).

С v7.3+ Kilo Code поддерживает изолированные субагенты через инструмент `Task` — режим работы **Native mode**, аналогично Claude Code.

## Структура

```
kilo.jsonc                       # workspace config: $schema, agents glob, дефолтные permissions
.kilo/agents/
├── manager.md                   # mode: all + task: allow
├── shaper.md                    # mode: all + task: deny; edit: только .agent_space/
├── coder_backend.md             # включён bash для uv/pytest/ruff/mypy
├── coder_frontend.md            # включён bash для pnpm/vitest/playwright
├── reviewer.md                  # edit: только .agent_space/
├── qa.md                        # edit: только tests/
└── devops.md                    # edit: только инфра/CI (conditional)
```

Каждый файл — тонкий wrapper с frontmatter формата Kilo Code (`description`, `mode`, `permission`) и телом, которое говорит агенту прочитать полный манифест из `.agents/` и действовать по нему.

## Frontmatter новой схемы

```yaml
---
description: краткое описание (показывается в agent picker)
mode: all          # primary | subagent | all
permission:
  read: allow
  edit:
    "<glob>": allow | deny | ask
    "*": ask | deny
  bash:
    "<command-glob>": allow | deny | ask
    "*": ask
  task: allow | deny    # для menedjer'а: allow; для специалистов: deny
---
```

Значения permission: `allow` (автоматически), `ask` (спросить пользователя), `deny` (заблокировать).

## Mapping (тонкости permissions)

| Agent | `task` | `bash` | `edit` (scope) |
|---|---|---|---|
| `manager` | **allow** | ask (по умолчанию) | `.agent_space/**` allow, всё прочее ask |
| `shaper` | deny | deny | только `.agent_space/**` |
| `coder_backend` | deny | `uv/pytest/ruff/mypy/python` allow, прочее ask | `apps/**`, `src/**`, `tests/**`, `config/**`, `pyproject.toml`, `.agent_space/**` |
| `coder_frontend` | deny | `pnpm/node/tsc/vitest/playwright` allow, прочее ask | `src/**`, `public/**`, `tests/**`, `package.json`, конфиги, `.agent_space/**` |
| `reviewer` | deny | команды для прогона тестов и `git diff/log/show` allow | только `.agent_space/**` |
| `qa` | deny | `uv/pytest/pnpm/vitest/playwright` allow | только `tests/**` и `.agent_space/**` |
| `devops` *(conditional)* | deny | `docker/make/git` allow, прочее ask | инфра-папки (`.github/**`, `Dockerfile*`, `terraform/**`, …) + `.agent_space/**` |

**Только `manager` имеет `task: allow`** — субагенты делегировать вглубь не могут.

## Установка

`kilo.jsonc` и `.kilo/agents/*.md` уже подготовлены в этом репозитории. Если копируешь команду в свой проект:

1. Скопируй `kilo.jsonc`, `.kilo/`, `.agents/`, `.agent_space/`, `AGENTS.md` в корень своего проекта.
2. Открой проект в VS Code.
3. Kilo Code подхватит `kilo.jsonc` автоматически. Если нет — команда палитры `Kilo Code: Reload Config`.

## Использование

В чате Kilo Code:

```
> Инициализируй задачу TASK-001: добавь экспорт отчётов в CSV
```

Если выбран agent `manager`, он создаст WORKSPACE, по `ROUTING_MATRIX` определит следующего специалиста и сам вызовет `Task` с заполненным брифом по `.agents/_templates/delegation_prompt.md`. Каждый вызов — изолированный контекст. В ответ менеджер получает только финальный handoff-отчёт.

Параллельные задачи (например, два независимых coder_*-вызова) можно запустить несколькими `Task` в одном ходу.

## Опциональные настройки в `kilo.jsonc`

Workspace-уровень `permission` в `kilo.jsonc` задаёт дефолты, которые применяются к встроенным агентам Kilo (`code`, `plan`, `ask`, `debug`) и переопределяются per-agent в `.kilo/agents/`.

Например, добавить allowlist для часто используемых тестовых команд:
```jsonc
{
  "permission": {
    "bash": {
      "uv run pytest*": "allow",
      "uv run ruff*": "allow",
      "pnpm test*": "allow",
      "pnpm lint*": "allow",
      "*": "ask"
    }
  }
}
```

## Если у тебя legacy-версия Kilo Code

До v7 формат был:
```jsonc
{
  "customModes": [
    {
      "slug": "manager",
      "name": "Manager",
      "roleDefinition": "...",
      "groups": ["read", "edit", "command"],
      "fileRegex": "..."
    }
  ]
}
```
в файле `.kilocodemodes` или `.roomodes`.

Тогда либо обнови плагин (рекомендуется), либо вручную:
1. Заменить агента markdown-обёртку на запись в `customModes[]`.
2. `description` → `roleDefinition`.
3. `permission.bash/edit/read` → `groups: ["read", "edit", "command"]` (без файловых ограничений).
4. `permission.edit["<glob>"]` → `fileRegex` (только один regex на mode).

## Ограничения

- Параллельность субагентов поддерживается, как и в Claude Code.
- Глубина вложенности: специалисты не делегируют дальше (`task: deny`). При блокере возвращают handoff менеджеру.
- File-scoped edit-permissions с глобами — рабочая страховка, но не serverside enforcement; конечная дисциплина обеспечивается манифестами агентов.
