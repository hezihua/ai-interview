"""Sandboxed filesystem helpers for the job-search workspace."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO = Path(__file__).resolve().parent.parent
logger = logging.getLogger("mcp.workspace")

# Cursor / 沙箱会注入 /tmp/tmp.* ，不能当成项目工作区
_EPHEMERAL_TMP = re.compile(r"^tmp\.")

PROFILE_SECTIONS = {
    "candidate": "profile/candidate.md",
    "behavioral": "profile/behavioral.md",
    "writing-style": "profile/writing-style.md",
    "search-queries": "profile/search-queries.md",
}

FRAMEWORK_SECTIONS = {
    "evaluation": "framework/evaluation.md",
    "interview": "framework/interview-prep.md",
    "writing": "framework/writing-style.md",
}

DOC_KINDS = {
    "cv": "cv.md",
    "cover_letter": "cover.md",
    "cover": "cover.md",
}

DOC_FILES = {
    "cv.md",
    "cover.md",
    "interview_prep.md",
    "posting.md",
    "evaluation.md",
    "outcome.md",
}

DOC_ALIASES = {
    "cv": "cv.md",
    "resume": "cv.md",
    "cover": "cover.md",
    "cover_letter": "cover.md",
    "cover.md": "cover.md",
    "cv.md": "cv.md",
    "interview_prep.md": "interview_prep.md",
    "interview": "interview_prep.md",
    "posting.md": "posting.md",
    "evaluation.md": "evaluation.md",
    "outcome.md": "outcome.md",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(text: str, fallback: str = "item") -> str:
    cleaned = re.sub(r"[^\w\s-]+", "", (text or "").strip(), flags=re.UNICODE)
    cleaned = re.sub(r"[\s_]+", "-", cleaned).strip("-").lower()
    return cleaned[:80] or fallback


def _is_ephemeral_workspace(path: Path) -> bool:
    try:
        resolved = path.expanduser()
        parent = resolved.parent.resolve() if resolved.is_absolute() else resolved.parent
        name = resolved.name
    except OSError:
        return False
    return str(parent) in {"/tmp", "/var/tmp"} and bool(_EPHEMERAL_TMP.match(name))


def resolve_doc_filename(name: str) -> str:
    key = (name or "").strip().lower().lstrip("/")
    mapped = DOC_ALIASES.get(key)
    if mapped:
        return mapped
    raise ValueError(f"Unknown document: {name}")


def workspace_root() -> Path:
    raw = (os.getenv("WORKSPACE_DIR") or "workspace").strip()
    path = Path(raw).expanduser()
    if _is_ephemeral_workspace(path):
        logger.warning(
            "Ignoring ephemeral WORKSPACE_DIR=%s; using %s/workspace",
            path,
            _REPO,
        )
        path = _REPO / "workspace"
    elif not path.is_absolute():
        path = _REPO / path
    path = path.resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_layout() -> Path:
    root = workspace_root()
    for name in ("profile", "framework", "jobs", "applications"):
        (root / name).mkdir(parents=True, exist_ok=True)
    return root


def safe_path(relative: str | Path) -> Path:
    root = ensure_layout()
    rel = Path(str(relative))
    if rel.is_absolute():
        raise ValueError("Path must be workspace-relative")
    resolved = (root / rel).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError("Path escapes workspace")
    return resolved


def read_text(relative: str) -> str:
    path = safe_path(relative)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


def write_text(relative: str, content: str) -> Path:
    path = safe_path(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if path.read_text(encoding="utf-8") != content:
        raise OSError(f"Write did not persist: {path}")
    return path


def read_json(relative: str) -> dict[str, Any] | None:
    raw = read_text(relative)
    if not raw.strip():
        return None
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    return data


def write_json(relative: str, data: dict[str, Any]) -> Path:
    return write_text(relative, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def profile_relative(section: str) -> str:
    key = (section or "").strip().lower()
    if key not in PROFILE_SECTIONS:
        raise ValueError(
            f"Unknown profile section {section!r}. "
            f"Use: {', '.join(PROFILE_SECTIONS)}"
        )
    return PROFILE_SECTIONS[key]


def framework_relative(name: str) -> str:
    key = (name or "").strip().lower()
    if key not in FRAMEWORK_SECTIONS:
        raise ValueError(
            f"Unknown framework {name!r}. Use: {', '.join(FRAMEWORK_SECTIONS)}"
        )
    return FRAMEWORK_SECTIONS[key]


def job_relative(job_id: str) -> str:
    job_id = (job_id or "").strip()
    if not re.fullmatch(r"[a-zA-Z0-9_-]{4,64}", job_id):
        raise ValueError("Invalid job_id")
    return f"jobs/{job_id}.json"


def application_slug(company: str, role: str, job_id: str = "") -> str:
    base = slugify(f"{company} {role}", fallback="")
    if base:
        return base
    return slugify(job_id, fallback="application")


def application_dir(slug: str) -> str:
    slug = slugify(slug)
    if not slug:
        raise ValueError("Invalid application id")
    return f"applications/{slug}"


def list_job_files() -> list[Path]:
    jobs_dir = safe_path("jobs")
    if not jobs_dir.is_dir():
        return []
    return sorted(jobs_dir.glob("*.json"))


def list_application_dirs() -> list[Path]:
    apps = safe_path("applications")
    if not apps.is_dir():
        return []
    return sorted(p for p in apps.iterdir() if p.is_dir())
