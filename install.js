#!/usr/bin/env node
/**
 * Multi-agent SDLC team — installer (Node.js, Node 16+).
 *
 * Тянет артефакты команды агентов из git-репозитория и кладёт их в проектную
 * директорию. Кросс-платформенный single-file скрипт; зависимости — только
 * stdlib + системный `git` в PATH.
 *
 * Дистрибуция: один файл. Запуск через curl|node либо как локальный скрипт.
 *
 * Примеры:
 *   curl -fsSL <RAW_URL>/install.js | node - --yes --tool kilo --docs --example
 *   node install.js                                  # интерактивно, target = cwd
 *   node install.js /path/to/my-project              # интерактивно, явный target
 *   node install.js --yes --tool kilo                # non-interactive
 *   node install.js --repo=https://... --ref=main    # явный репо/ветка
 *
 * Конфигурация:
 *   --repo=<URL>       URL репо команды (или env AGENTS_REPO_URL)
 *   --ref=<branch>     ветка/тег (или env AGENTS_REPO_REF, default: main)
 *   --token=<TOKEN>    PAT для приватных репо (или env AGENTS_TOKEN / GITLAB_TOKEN / GITHUB_TOKEN)
 *   --tool=<name>      claude | kilo | qwen | codex | all (обязательно с --yes)
 *   --docs             включить документацию (с --yes)
 *   --example          включить эталонный EXAMPLE-001 (с --yes)
 *   --force            перезаписывать без подтверждения
 *   --yes / -y         не задавать вопросов
 *   --help / -h        вывести справку
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync, execSync } = require('child_process');

// ===========================================================================
// Конфигурация по умолчанию — замени на URL своего репо команды перед публикацией.
// ===========================================================================
const DEFAULT_REPO_URL = process.env.AGENTS_REPO_URL || 'https://gitlab.example.com/agents/team.git';
const DEFAULT_REF = process.env.AGENTS_REPO_REF || 'main';

// ===========================================================================
// Что устанавливается
// ===========================================================================
const CORE_ITEMS = ['.agents', 'AGENTS.md'];
const EMPTY_DIRS = ['.agent_space'];

const TOOL_ITEMS = {
  claude: { label: 'Claude Code', paths: ['.claude/agents'] },
  kilo:   { label: 'Kilo Code (VS Code v7.3+)', paths: ['.kilo/agents', 'kilo.jsonc'] },
  qwen:   { label: 'Qwen Code', paths: [] },                          // использует AGENTS.md из core
  codex:  { label: 'OpenAI Codex CLI', paths: [] },                   // использует AGENTS.md из core
};

const DOCS_ITEMS = ['HUMAN-GATES.md', 'LOCAL-TESTING.md', 'integrations'];
const EXAMPLE_ITEMS = ['.agent_space/EXAMPLE-001'];

const ALL_POSSIBLE = [
  ...CORE_ITEMS,
  ...EMPTY_DIRS,
  '.claude/agents', '.kilo/agents', 'kilo.jsonc',
  ...DOCS_ITEMS,
];

const PROJECT_MARKERS = [
  ['pyproject.toml',  'Python project (pyproject.toml)'],
  ['requirements.txt','Python project (requirements.txt)'],
  ['manage.py',       'Django project (manage.py)'],
  ['package.json',    'Node.js project (package.json)'],
  ['vite.config.ts',  'Vite project (vite.config.ts)'],
  ['vite.config.js',  'Vite project (vite.config.js)'],
  ['next.config.js',  'Next.js project (next.config.js)'],
  ['next.config.ts',  'Next.js project (next.config.ts)'],
  ['go.mod',          'Go project (go.mod)'],
  ['Cargo.toml',      'Rust project (Cargo.toml)'],
  ['composer.json',   'PHP project (composer.json)'],
  ['Gemfile',         'Ruby project (Gemfile)'],
  ['pom.xml',         'Java/Maven project (pom.xml)'],
  ['build.gradle',    'Java/Gradle project (build.gradle)'],
];

// ===========================================================================
// Раскраска
// ===========================================================================
const isTTY = process.stdout.isTTY === true;
const wrap = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = wrap('32');
const yellow = wrap('33');
const red = wrap('31');
const bold = wrap('1');
const dim = wrap('2');

// ===========================================================================
// Парсинг аргументов
// ===========================================================================
function parseArgs(argv) {
  const args = {
    target: '.',
    yes: false,
    tool: null,
    docs: false,
    example: false,
    force: false,
    repo: DEFAULT_REPO_URL,
    ref: DEFAULT_REF,
    token: process.env.AGENTS_TOKEN || process.env.GITLAB_TOKEN || process.env.GITHUB_TOKEN || null,
    help: false,
  };
  const positional = [];

  const getNext = (i, name) => {
    if (i + 1 >= argv.length) {
      console.error(red(`ОШИБКА: ${name} требует значения`));
      process.exit(2);
    }
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--docs') args.docs = true;
    else if (a === '--example') args.example = true;
    else if (a === '--force') args.force = true;
    else if (a.startsWith('--tool=')) args.tool = a.slice(7);
    else if (a === '--tool') { args.tool = getNext(i, '--tool'); i++; }
    else if (a.startsWith('--repo=')) args.repo = a.slice(7);
    else if (a === '--repo') { args.repo = getNext(i, '--repo'); i++; }
    else if (a.startsWith('--ref=')) args.ref = a.slice(6);
    else if (a === '--ref') { args.ref = getNext(i, '--ref'); i++; }
    else if (a.startsWith('--token=')) args.token = a.slice(8);
    else if (a === '--token') { args.token = getNext(i, '--token'); i++; }
    else if (!a.startsWith('--') && !a.startsWith('-')) positional.push(a);
    else { console.error(red(`Неизвестный аргумент: ${a}`)); process.exit(2); }
  }

  if (positional.length) args.target = positional[0];
  return args;
}

function printHelp() {
  process.stdout.write(`Multi-agent SDLC team — installer (Node.js)

Тянет артефакты команды агентов из git-репо и устанавливает в target-директорию.

Использование:
  node install.js [target]                          интерактивно
  node install.js --yes --tool kilo [target]        non-interactive

Опции:
  target                  целевая директория (по умолчанию: cwd)
  --repo <URL>            URL git-репозитория команды (по умолчанию: AGENTS_REPO_URL или внутренний default)
  --ref <branch/tag>      ветка или тег (по умолчанию: AGENTS_REPO_REF или 'main')
  --token <PAT>           personal access token для приватных репо
  --tool <name>           claude | kilo | qwen | codex | all (обязательно с --yes)
  --docs                  включить документацию (HUMAN-GATES, LOCAL-TESTING, integrations/)
  --example               включить эталонный пример EXAMPLE-001
  --force                 перезаписывать существующие артефакты без подтверждения
  --yes, -y               не задавать вопросов
  --help, -h              эта справка

Переменные окружения:
  AGENTS_REPO_URL         дефолтный URL репо
  AGENTS_REPO_REF         дефолтная ветка/тег
  AGENTS_TOKEN            токен (приоритет выше, чем GITLAB_TOKEN/GITHUB_TOKEN)

Дистрибуция:
  curl -fsSL <RAW_URL>/install.js | node - --yes --tool kilo --docs --example
`);
}

// ===========================================================================
// Интерактивные prompt'ы
// ===========================================================================
function makeRL() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl, question, opts = {}) {
  const { default: def, choices } = opts;
  let prompt = question;
  if (choices) {
    const opts2 = choices.map((c) => (c === def ? c.toUpperCase() : c)).join('/');
    prompt += ` [${opts2}]`;
  } else if (def !== undefined) {
    prompt += ` (по умолчанию: ${def})`;
  }
  prompt += ': ';

  for (;;) {
    const raw = (await new Promise((res) => rl.question(prompt, res))).trim().toLowerCase();
    if (!raw && def !== undefined) return def;
    if (choices) {
      if (choices.includes(raw)) return raw;
      console.log(red(`  Введи один из: ${choices.join(', ')}`));
      continue;
    }
    return raw;
  }
}

async function confirm(rl, q, def = 'y') {
  return (await ask(rl, q, { default: def, choices: ['y', 'n'] })) === 'y';
}

async function selectTools(rl) {
  console.log(bold('Какие инструменты будешь использовать с командой?'));
  console.log();
  const keys = Object.keys(TOOL_ITEMS);
  keys.forEach((k, i) => console.log(`  ${i + 1}) ${TOOL_ITEMS[k].label}`));
  console.log(`  ${keys.length + 1}) Все`);
  console.log();
  console.log(dim('  Можно несколько через запятую (пример: 1,2)'));
  console.log();

  for (;;) {
    const choice = (await new Promise((res) => rl.question(`Выбор [1-${keys.length + 1}]: `, res))).trim();
    if (!choice) { console.log(red('  Нужен хотя бы один вариант.')); continue; }
    try {
      const indices = choice.split(',').map((s) => parseInt(s.trim(), 10));
      if (indices.includes(keys.length + 1)) return keys.slice();
      const selected = [];
      for (const i of indices) {
        if (!Number.isInteger(i) || i < 1 || i > keys.length) throw new Error('bad');
        selected.push(keys[i - 1]);
      }
      if (selected.length) return Array.from(new Set(selected));
    } catch { /* fallthrough */ }
    console.log(red(`  Неверный ввод. Пример: 1 или 1,2 или ${keys.length + 1}`));
  }
}

// ===========================================================================
// Аудит target-директории
// ===========================================================================
function detectProject(target) {
  const facts = [];
  const gitHead = path.join(target, '.git', 'HEAD');
  if (fs.existsSync(gitHead)) {
    try {
      const head = fs.readFileSync(gitHead, 'utf8').trim();
      if (head.startsWith('ref: refs/heads/')) {
        facts.push(`git-репозиторий (branch: ${head.slice('ref: refs/heads/'.length)})`);
      } else {
        facts.push('git-репозиторий (detached HEAD)');
      }
    } catch {
      facts.push('git-репозиторий');
    }
  }
  for (const [file, label] of PROJECT_MARKERS) {
    if (fs.existsSync(path.join(target, file))) facts.push(label);
  }
  return facts;
}

function existingConflicts(target) {
  return ALL_POSSIBLE.filter((item) => fs.existsSync(path.join(target, item)));
}

function showAudit(target) {
  console.log(bold(`Целевая директория: ${target}`));

  let entries;
  try { entries = fs.readdirSync(target); }
  catch (e) {
    console.log(red(`  ОШИБКА: нет прав на чтение: ${e.message}`));
    process.exit(1);
  }
  const visible = entries.filter((n) => !n.startsWith('.'));
  const hidden = entries.filter((n) => n.startsWith('.'));
  const isOfType = (name, fn) => {
    try { return fn(fs.statSync(path.join(target, name))); }
    catch { return false; }
  };
  const files = visible.filter((n) => isOfType(n, (s) => s.isFile()));
  const dirs = visible.filter((n) => isOfType(n, (s) => s.isDirectory()));

  console.log(`  Содержимое: ${files.length} файлов, ${dirs.length} директорий, ${hidden.length} скрытых элементов`);

  const facts = detectProject(target);
  if (facts.length) {
    console.log('  Тип проекта:');
    facts.forEach((f) => console.log(`    • ${f}`));
  } else {
    console.log(dim('  Тип проекта: не удалось определить по маркерам.'));
  }

  const conflicts = existingConflicts(target);
  if (conflicts.length) {
    console.log();
    console.log(yellow('  ⚠ Артефакты команды уже присутствуют (потенциальные конфликты):'));
    for (const item of conflicts) {
      const p = path.join(target, item);
      const kind = fs.statSync(p).isDirectory() ? 'DIR ' : 'FILE';
      console.log(`    [${kind}] ${item}`);
    }
  } else {
    console.log(green('  Артефактов команды не обнаружено — чистая установка.'));
  }
  console.log();
}

// ===========================================================================
// Получение source из git
// ===========================================================================
function injectAuth(url, token) {
  if (!token || !url.startsWith('https://')) return url;
  // GitLab convention: https://oauth2:TOKEN@host/...
  // GitHub также принимает этот формат.
  return url.replace(/^https:\/\//, `https://oauth2:${encodeURIComponent(token)}@`);
}

function sanitize(text, token) {
  if (!token) return text;
  return text.split(token).join('***');
}

function ensureGit() {
  try { execSync('git --version', { stdio: 'pipe' }); }
  catch {
    console.log(red('ОШИБКА: git не найден в PATH.'));
    console.log(red('        Установи: https://git-scm.com/ (или через пакетный менеджер).'));
    process.exit(1);
  }
}

function fetchRepo(repoUrl, ref, token) {
  ensureGit();

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-installer-'));
  const cloneDir = path.join(tmpRoot, 'src');

  const visibleUrl = token ? repoUrl.replace(/^https:\/\//, 'https://oauth2:***@') : repoUrl;
  console.log(dim(`  git clone --depth=1 --branch=${ref} ${visibleUrl}`));

  const authed = injectAuth(repoUrl, token);
  const result = spawnSync(
    'git',
    ['clone', '--depth=1', '--branch', ref, '--quiet', authed, cloneDir],
    { stdio: ['ignore', 'inherit', 'pipe'] }
  );

  if (result.status !== 0) {
    const stderr = sanitize((result.stderr || '').toString(), token).trim();
    console.log(red('ОШИБКА: git clone завершился неуспешно.'));
    if (stderr) console.log(red(stderr));

    if (/(\b401\b|\b403\b|Authentication failed|HTTP Basic)/i.test(stderr)) {
      console.log();
      console.log(yellow('Похоже на проблему с доступом. Передай токен через --token=... или env (AGENTS_TOKEN / GITLAB_TOKEN).'));
    }
    if (/(\b404\b|not found|Repository not found|could not read)/i.test(stderr)) {
      console.log();
      console.log(yellow(`Проверь URL: ${repoUrl}`));
    }
    if (/(Could not resolve host|name or service not known)/i.test(stderr)) {
      console.log();
      console.log(yellow('Похоже на проблему с сетью или DNS.'));
    }
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    process.exit(1);
  }

  // Sanity: source repo должен содержать .agents/
  if (!fs.existsSync(path.join(cloneDir, '.agents'))) {
    console.log(red('ОШИБКА: в клонированном репо нет .agents/ — это не репо команды агентов.'));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.exit(1);
  }

  return {
    sourceDir: cloneDir,
    cleanup: () => {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
      catch (e) { console.log(yellow(`Предупреждение: не удалось удалить временную директорию ${tmpRoot}: ${e.message}`)); }
    },
  };
}

// ===========================================================================
// Копирование
// ===========================================================================
function copyItem(src, dst) {
  if (!fs.existsSync(src)) return { ok: false, reason: 'отсутствует в source' };
  try {
    if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function installItems(items, source, target) {
  const failures = [];
  for (const item of items) {
    const src = path.join(source, item);
    const dst = path.join(target, item);
    const res = copyItem(src, dst);
    if (res.ok) console.log(`  ${green('✓')} ${item}`);
    else { console.log(`  ${red('✗')} ${item} (${res.reason})`); failures.push(item); }
  }
  return failures;
}

function ensureEmptyDirs(target) {
  for (const d of EMPTY_DIRS) fs.mkdirSync(path.join(target, d), { recursive: true });
}

function makePlan(tools, includeDocs, includeExample) {
  const seen = new Set();
  const items = [];
  const push = (it) => { if (!seen.has(it)) { seen.add(it); items.push(it); } };

  CORE_ITEMS.forEach(push);
  for (const t of tools) TOOL_ITEMS[t].paths.forEach(push);
  if (includeDocs) DOCS_ITEMS.forEach(push);
  if (includeExample) EXAMPLE_ITEMS.forEach(push);
  return items;
}

// ===========================================================================
// Next steps
// ===========================================================================
function printNextSteps(tools, target) {
  console.log();
  console.log(bold('Готово. Команда установлена.'));
  console.log(`  Директория: ${target}`);
  console.log();

  if (tools.includes('claude')) {
    console.log(bold('Claude Code:'));
    console.log('  1. Открой Claude Code в этой директории.');
    console.log('  2. В чате: «Инициализируй задачу TASK-001: <описание>».');
    console.log();
  }
  if (tools.includes('kilo')) {
    console.log(bold('Kilo Code (VS Code):'));
    console.log('  1. Открой проект в VS Code.');
    console.log('  2. Command Palette → «Kilo Code: Reload Config».');
    console.log('  3. Выбери agent «manager» в agent picker.');
    console.log('  4. В чате: «Инициализируй задачу TASK-001: <описание>».');
    console.log();
  }
  if (tools.includes('qwen')) {
    console.log(bold('Qwen Code:'));
    console.log('  1. Запусти qwen-code в этой директории.');
    console.log('  2. В чате: «Инициализируй задачу TASK-001: <описание>».');
    console.log();
  }
  if (tools.includes('codex')) {
    console.log(bold('OpenAI Codex CLI:'));
    console.log('  1. Запусти `codex` в этой директории.');
    console.log('  2. В чате: «Инициализируй задачу TASK-001: <описание>».');
    console.log();
  }

  console.log(bold('Документация в установленной директории:'));
  console.log('  • AGENTS.md — universal entry point');
  if (fs.existsSync(path.join(target, 'HUMAN-GATES.md'))) console.log('  • HUMAN-GATES.md — настройка ручных подтверждений переходов');
  if (fs.existsSync(path.join(target, 'LOCAL-TESTING.md'))) console.log('  • LOCAL-TESTING.md — памятка под локальные модели');
  if (fs.existsSync(path.join(target, 'integrations'))) console.log('  • integrations/*.md — детали по каждому инструменту');
  console.log();
}

// ===========================================================================
// Main
// ===========================================================================
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { printHelp(); return 0; }

  // Sanity: target
  const target = path.resolve(args.target);
  if (!fs.existsSync(target)) {
    console.error(red(`ОШИБКА: целевой директории не существует: ${target}`));
    return 2;
  }
  if (!fs.statSync(target).isDirectory()) {
    console.error(red(`ОШИБКА: цель — не директория: ${target}`));
    return 2;
  }

  // Banner
  console.log();
  console.log(bold('Multi-agent SDLC team — Installer (Node.js)'));
  console.log('-'.repeat(50));
  console.log(`Source repo:  ${args.repo}`);
  console.log(`Ref:          ${args.ref}`);
  console.log(`Token:        ${args.token ? '(передан)' : '(не используется)'}`);
  console.log();

  // Аудит target
  showAudit(target);

  // Non-interactive mode validation
  if (args.yes && !args.tool) {
    console.error(red('ОШИБКА: --yes требует --tool'));
    return 2;
  }

  // Stdin must be TTY для interactive режима (иначе при curl|node нечем prompt'ить)
  const isInteractive = !args.yes;
  if (isInteractive && !process.stdin.isTTY) {
    console.error(red('ОШИБКА: stdin не подключён к терминалу — интерактивный режим невозможен.'));
    console.error(red('        Похоже на запуск через `curl | node` без --yes.'));
    console.error(red(''));
    console.error(red('Решения:'));
    console.error(red('  1. Используй non-interactive режим:'));
    console.error(red('     curl -fsSL <URL>/install.js | node - --yes --tool kilo --docs --example [target]'));
    console.error(red('  2. Сохрани скрипт локально и запусти отдельно:'));
    console.error(red('     curl -fsSL <URL>/install.js -o install.js && node install.js'));
    return 2;
  }

  let rl = null;
  if (isInteractive) rl = makeRL();

  try {
    if (isInteractive && !(await confirm(rl, 'Установить команду в эту директорию?', 'y'))) {
      console.log('Отмена.');
      return 0;
    }

    // Tools
    let tools;
    if (args.yes) {
      tools = args.tool === 'all' ? Object.keys(TOOL_ITEMS) : [args.tool];
    } else {
      console.log();
      tools = await selectTools(rl);
    }

    // Extras
    let includeDocs, includeExample;
    if (args.yes) {
      includeDocs = args.docs;
      includeExample = args.example;
    } else {
      console.log();
      includeDocs = await confirm(rl, 'Установить документацию (HUMAN-GATES, LOCAL-TESTING, integrations/)?', 'y');
      includeExample = await confirm(rl, 'Установить эталонный пример EXAMPLE-001?', 'y');
    }

    // План
    const items = makePlan(tools, includeDocs, includeExample);
    console.log();
    console.log(bold('Будет установлено (после клонирования source):'));
    for (const it of items) console.log(`  + ${it}`);
    console.log(`  + .agent_space/  ${dim('(пустая директория для будущих задач)')}`);
    console.log();

    // Подтверждение перед перезаписью
    const willOverwrite = items.filter((it) => fs.existsSync(path.join(target, it)));
    if (willOverwrite.length && !args.force) {
      console.log(yellow('Будет перезаписано:'));
      for (const it of willOverwrite) console.log(`  ! ${it}`);
      console.log();
      if (isInteractive && !(await confirm(rl, 'Перезаписать перечисленные артефакты?', 'n'))) {
        console.log('Отмена.');
        return 0;
      }
    }

    if (isInteractive && !(await confirm(rl, 'Продолжить установку?', 'y'))) {
      console.log('Отмена.');
      return 0;
    }

    // Fetch source
    console.log();
    console.log(bold('Получение source из git...'));
    const { sourceDir, cleanup } = fetchRepo(args.repo, args.ref, args.token);

    try {
      console.log();
      console.log(bold('Установка...'));
      const failures = installItems(items, sourceDir, target);
      ensureEmptyDirs(target);

      if (failures.length) {
        console.log();
        console.log(red(`Завершено с ошибками (${failures.length} проблем).`));
        return 1;
      }

      printNextSteps(tools, target);
      return 0;
    } finally {
      cleanup();
    }
  } finally {
    if (rl) rl.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(red(`\nНепредвиденная ошибка: ${err.message}`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
