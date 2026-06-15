#!/usr/bin/env python3
"""
Strict validator for multi-agent SDLC team handoffs.

Layer 1 in the anti-hallucination defense. Runs after each handoff and BEFORE
the manager applies STATE_PATCH. Non-zero exit means the handoff is rejected.

Usage (from project root):
    python3 .agents/_tools/validate.py --task TASK-001
    python3 .agents/_tools/validate.py --task TASK-001 --handoff .agent_space/TASK-001/handoffs/02_shaper_report.md
    python3 .agents/_tools/validate.py --task TASK-001 --rerun-tests

Exit codes:
    0 — all checks passed
    1 — validation failed (see stderr for findings)
    2 — tool error (bad inputs, missing files)

Checks (strict mode is the default):
    - STATE.json parses and matches state.schema.json (if jsonschema available)
    - Handoff contains required sections (SUMMARY, ARTIFACTS,
      RECOMMENDED_NEXT, STATE_PATCH)
    - STATE_PATCH JSON parses and contains expected keys
    - Every artifact path in STATE_PATCH and handoff actually exists
    - tech_stacks reference existing files in .agents/stacks/
    - EVIDENCE section: required for coder_backend/coder_frontend/reviewer/qa
      (must contain at least one [VERIFIED:...] entry); optional for others
    - For coder_*: with --rerun-tests, actually re-run claimed test command
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

WORKSPACE_ROOT = Path(".agent_space")
STACKS_DIR = Path(".agents/stacks")
SCHEMA_PATH = Path(".agents/_templates/state.schema.json")

REQUIRED_HANDOFF_SECTIONS = [
    "## SUMMARY",
    "## ARTIFACTS",
    "## RECOMMENDED_NEXT",
    "## STATE_PATCH",
]

# EVIDENCE секция обязательна только для агентов с верифицируемыми claims
# (запуски тестов, цитирование file:line, AC traceability).
# Для shaper/manager/devops/etc — опциональна.
EVIDENCE_REQUIRED_AGENTS = {"coder_backend", "coder_frontend", "reviewer", "qa"}


class Report:
    def __init__(self) -> None:
        self.failures: list[tuple[str, str]] = []
        self.warnings: list[tuple[str, str]] = []

    def fail(self, check: str, detail: str) -> None:
        self.failures.append((check, detail))

    def warn(self, check: str, detail: str) -> None:
        self.warnings.append((check, detail))

    @property
    def ok(self) -> bool:
        return not self.failures

    def emit(self) -> None:
        for check, detail in self.failures:
            print(f"FAIL [{check}]: {detail}", file=sys.stderr)
        for check, detail in self.warnings:
            print(f"WARN [{check}]: {detail}", file=sys.stderr)
        total = len(self.failures) + len(self.warnings)
        if self.ok:
            print(f"OK: {total} checks, 0 failures, {len(self.warnings)} warnings.")


def die(msg: str, code: int = 2) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def find_workspace(task_id: Optional[str]) -> Path:
    if task_id:
        ws = WORKSPACE_ROOT / task_id
        if not ws.is_dir():
            die(f"WORKSPACE not found: {ws}")
        return ws
    if not WORKSPACE_ROOT.is_dir():
        die(f"no {WORKSPACE_ROOT}/ directory")
    candidates: list[tuple[str, Path]] = []
    for ws in WORKSPACE_ROOT.iterdir():
        if not ws.is_dir():
            continue
        state_path = ws / "STATE.json"
        if not state_path.exists():
            continue
        try:
            data = json.loads(state_path.read_text())
        except json.JSONDecodeError:
            continue
        if data.get("current_stage") == "DONE":
            continue
        candidates.append((data.get("updated_at", ""), ws))
    if not candidates:
        die("no active WORKSPACE found (all DONE or none exist)")
    candidates.sort(reverse=True)
    return candidates[0][1]


def find_latest_report(workspace: Path) -> Path:
    handoffs = workspace / "handoffs"
    if not handoffs.is_dir():
        die(f"no handoffs/ in {workspace}")
    reports = sorted(handoffs.glob("*_report.md"))
    if not reports:
        die(f"no *_report.md files in {handoffs}")
    return reports[-1]


def check_state(state_path: Path, report: Report) -> Optional[dict[str, Any]]:
    try:
        data = json.loads(state_path.read_text())
    except json.JSONDecodeError as e:
        report.fail("STATE_JSON", f"{state_path}: parse error: {e}")
        return None

    try:
        import jsonschema  # type: ignore
    except ImportError:
        report.warn("SCHEMA_SKIP", "jsonschema not installed; STATE.json schema not validated")
        return data

    try:
        schema = json.loads(SCHEMA_PATH.read_text())
    except Exception as e:
        report.warn("SCHEMA_SKIP", f"could not load {SCHEMA_PATH}: {e}")
        return data

    try:
        jsonschema.validate(data, schema)
    except jsonschema.ValidationError as e:
        report.fail("STATE_SCHEMA", f"{state_path}: {e.message}")
        return None

    return data


def check_handoff_sections(handoff_text: str, handoff_path: Path, report: Report) -> None:
    for section in REQUIRED_HANDOFF_SECTIONS:
        if section not in handoff_text:
            report.fail("HANDOFF_FORMAT", f"{handoff_path}: missing section {section}")


def extract_state_patch(handoff_text: str, report: Report) -> Optional[dict[str, Any]]:
    m = re.search(r"## STATE_PATCH.*?```json\s*(.*?)\s*```", handoff_text, re.DOTALL)
    if not m:
        report.fail("STATE_PATCH_MISSING", "no ```json``` block under ## STATE_PATCH")
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError as e:
        report.fail("STATE_PATCH_JSON", f"invalid JSON: {e}")
        return None


def check_paths(workspace: Path, paths: list[str], where: str, report: Report) -> None:
    for p in paths:
        candidates = [workspace / p, Path(p)]
        if any(c.exists() for c in candidates):
            continue
        report.fail("PATH_NOT_FOUND", f"{where}: '{p}' does not exist")


def check_tech_stacks(stacks: list[str], report: Report) -> None:
    for stack_id in stacks:
        stack_file = STACKS_DIR / f"{stack_id}.md"
        if not stack_file.exists():
            report.fail(
                "STACK_NOT_FOUND",
                f"tech_stack '{stack_id}' has no file at {stack_file}",
            )


def check_evidence(handoff_text: str, agent_id: Optional[str], report: Report) -> None:
    """Проверка EVIDENCE секции — строгая для критичных агентов, мягкая для остальных."""
    section = re.search(r"## EVIDENCE\s*\n(.*?)(?=\n## |\Z)", handoff_text, re.DOTALL)

    # Для некритичных агентов (shaper/manager/devops/...) — EVIDENCE опциональна.
    # Но если секция всё же есть и в ней [ASSUMED] — предупреждаем.
    if agent_id not in EVIDENCE_REQUIRED_AGENTS:
        if section:
            assumed = re.findall(r"\[ASSUMED\]", section.group(1))
            if assumed:
                report.warn(
                    "ASSUMPTIONS_PRESENT",
                    f"{len(assumed)} [ASSUMED] entries — manager should review their criticality",
                )
        return

    # Для критичных агентов — секция обязательна и должна содержать хотя бы один [VERIFIED].
    if not section:
        report.fail(
            "EVIDENCE_MISSING",
            f"no ## EVIDENCE section (required for {agent_id})",
        )
        return
    content = section.group(1)
    verified = re.findall(r"\[VERIFIED:[^\]]+\]", content)
    if not verified:
        report.fail(
            "EVIDENCE_EMPTY",
            f"EVIDENCE has no [VERIFIED:...] entries (required for {agent_id})",
        )
        return
    assumed = re.findall(r"\[ASSUMED\]", content)
    if assumed:
        report.warn(
            "ASSUMPTIONS_PRESENT",
            f"{len(assumed)} [ASSUMED] entries — manager should review their criticality",
        )


def parse_agent_from_handoff(handoff_path: Path) -> Optional[str]:
    m = re.match(r"\d+_([a-z_]+)_report\.md", handoff_path.name)
    return m.group(1) if m else None


def rerun_test_claims(handoff_text: str, workspace: Path, agent_id: str, report: Report) -> None:
    if not agent_id.startswith("coder_"):
        return
    impl_match = re.search(r"IMPL_NOTES_[A-Z0-9-]+\.md", handoff_text)
    if not impl_match:
        return
    impl_path = workspace / "artifacts" / impl_match.group(0)
    if not impl_path.exists():
        return
    impl_text = impl_path.read_text()
    pattern = r"`([^`\n]+(?:pytest|vitest|pnpm[^`]*test|playwright)[^`]*)`:\s*\*?\*?(PASS|FAIL)"
    claims = re.findall(pattern, impl_text)
    if not claims:
        report.warn("TEST_CLAIMS_NONE", f"no parseable test claims in {impl_path.name}")
        return
    for cmd, claimed_status in claims:
        report.warn("TEST_RERUN", f"rerunning: {cmd}")
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=180
            )
        except subprocess.TimeoutExpired:
            report.fail("TEST_RERUN_TIMEOUT", f"timeout: {cmd}")
            continue
        actual = "PASS" if result.returncode == 0 else "FAIL"
        if actual != claimed_status:
            report.fail(
                "TEST_RESULT_MISMATCH",
                f"'{cmd}' claimed {claimed_status} but actual {actual}",
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--task", help="TASK_ID; auto-detect latest active if omitted")
    parser.add_argument("--handoff", help="explicit handoff report path; auto-detect latest if omitted")
    parser.add_argument(
        "--rerun-tests",
        action="store_true",
        help="actually rerun claimed test commands for coder_* handoffs (slow)",
    )
    args = parser.parse_args()

    if not WORKSPACE_ROOT.exists() or not Path(".agents").exists():
        die("run from project root (must contain .agents/ and .agent_space/)")

    workspace = find_workspace(args.task)
    state_path = workspace / "STATE.json"
    if not state_path.exists():
        die(f"no STATE.json in {workspace}")

    report = Report()
    state = check_state(state_path, report)
    if state is None:
        report.emit()
        return 1

    handoff_path = Path(args.handoff) if args.handoff else find_latest_report(workspace)
    if not handoff_path.exists():
        die(f"handoff not found: {handoff_path}")

    handoff_text = handoff_path.read_text()
    check_handoff_sections(handoff_text, handoff_path, report)

    state_patch = extract_state_patch(handoff_text, report)
    if state_patch:
        artifacts = state_patch.get("artifacts", {})
        if isinstance(artifacts, dict):
            check_paths(workspace, list(artifacts.values()), "STATE_PATCH.artifacts", report)
        history = state_patch.get("history_append", {})
        if isinstance(history, dict) and isinstance(history.get("artifacts"), list):
            check_paths(workspace, history["artifacts"], "STATE_PATCH.history_append.artifacts", report)
        check_tech_stacks(state_patch.get("tech_stacks") or state.get("tech_stacks") or [], report)
    else:
        check_tech_stacks(state.get("tech_stacks") or [], report)

    agent_id = parse_agent_from_handoff(handoff_path)
    check_evidence(handoff_text, agent_id, report)

    if agent_id and args.rerun_tests:
        rerun_test_claims(handoff_text, workspace, agent_id, report)

    report.emit()
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
