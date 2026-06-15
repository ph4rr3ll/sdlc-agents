# Claude Code Integration

Claude Code поддерживает изолированные субагенты через инструмент `Task`. Это **идеальный случай** для нашей команды: менеджер вызывает специалистов как субагентов, каждый получает свежий контекст.

Режим работы: **Native mode**. `STATE.json` ведётся как журнал для аудита и восстановления.

## Структура

```
.claude/
└── agents/
    ├── manager.md
    ├── shaper.md
    ├── coder_backend.md
    ├── coder_frontend.md
    ├── reviewer.md
    ├── qa.md
    └── devops.md      # conditional
```

Каждый файл — тонкий wrapper с frontmatter формата Claude Code (`name`, `description`, `tools`) и телом, которое говорит агенту прочитать свой полный манифест из `.agents/` и действовать по нему.

## Маппинг tools

| Subagent | Tools |
|---|---|
| `manager` | Read, Write, Edit, Bash, Grep, Glob, **Task** |
| `shaper` | Read, Write, Grep, Glob |
| `coder_backend` | Read, Write, Edit, Bash, Grep, Glob |
| `coder_frontend` | Read, Write, Edit, Bash, Grep, Glob |
| `reviewer` | Read, Write, Bash, Grep, Glob |
| `qa` | Read, Write, Edit, Bash, Grep, Glob |
| `devops` *(conditional)* | Read, Write, Edit, Bash, Grep, Glob |

**Только `manager` имеет `Task`** — у специалистов делегирование запрещено.

## Установка

Файлы `.claude/agents/*.md` уже подготовлены в этом репозитории. Если ты копируешь команду в свой проект:

1. Скопируй `.agents/`, `.claude/`, `.agent_space/`, `AGENTS.md` в корень своего проекта.
2. Перезапусти Claude Code или выполни `/agents` для перезагрузки списка субагентов.

## Использование

В чате Claude Code:

```
> Инициализируй задачу TASK-001: добавь экспорт отчётов в CSV
```

Главная сессия читает `AGENTS.md` → понимает, что эту задачу должен взять `manager`. Запускает его через `Task`:

```
Task({
  subagent_type: "manager",
  description: "Init TASK-001",
  prompt: "Инициализируй задачу TASK-001: добавь экспорт отчётов в CSV. ..."
})
```

`manager` создаёт WORKSPACE, по `ROUTING_MATRIX` определяет следующего специалиста и сам вызывает `Task` с заполненным брифом по шаблону `.agents/_templates/delegation_prompt.md`. Каждый вызов — изолированный контекст. В ответ менеджер получает только финальное сообщение специалиста (handoff-отчёт).

## Опциональные настройки

В `.claude/settings.json` можно зафиксировать permissions для автоматического разрешения типичных операций:

```json
{
  "permissions": {
    "allow": [
      "Bash(uv run pytest:*)",
      "Bash(uv run ruff:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm lint:*)",
      "Read",
      "Glob",
      "Grep"
    ]
  }
}
```

Это уменьшит количество permission-промптов.

## Ограничения

- Параллельность субагентов поддерживается: менеджер может запустить несколько `Task` в одном сообщении (например, две независимые задачи разработки одновременно).
- Глубина вложенности: специалисты не делегируют дальше (`Task` отсутствует в их tools). Если специалист встречает блокер, он возвращает его менеджеру через handoff.
