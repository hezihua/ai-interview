"""Workbench read-only APIs.

直接读 workspace（jobs / tracker.csv / applications / profile），
不经过 Agent，供前端工作台页面展示状态。
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException

from tracker import load_rows
from workspace import (
    DOC_FILES,
    PROFILE_SECTIONS,
    list_application_dirs,
    list_job_files,
    read_json,
    safe_path,
)

router = APIRouter(prefix="/v1/workbench")

_OFFER_STATUSES = {"offered", "hired"}
_INTERVIEW_STATUSES = {"interview"}
_SUBMITTED_STATUSES = {"applied", "interview", "offered", "hired", "rejected", "withdrawn"}

_TITLE_SKIP = {
    "home", "positions", "campus", "returnees", "new", "login/register",
    "chat", "favorite", "share", "view all", "related recommendations",
    "related companies", "popular cities", "nearby cities",
}


def _parse_ts(value: str | None) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _job_title(job: dict[str, Any]) -> str:
    role = str(job.get("role") or "").strip()
    company = str(job.get("company") or "").strip()
    if role and company:
        return f"{company} · {role}"
    if role:
        return role
    if company:
        return company
    text = str(job.get("text") or "")
    bracket = re.search(r"【([^】]{2,40})】", text)
    if bracket:
        return bracket.group(1).strip()
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 6 or len(line) > 40:
            continue
        if line.lower() in _TITLE_SKIP or line.startswith(("<", "--", "#")):
            continue
        return line
    return f"未命名职位 {str(job.get('id') or '')[:6]}"


def _job_company(job: dict[str, Any]) -> str:
    company = str(job.get("company") or "").strip()
    if company:
        return company
    url = str(job.get("url") or "").strip()
    if url:
        host = urlparse(url).hostname or ""
        if host.startswith("www."):
            host = host[4:]
        return host.split(".")[0] if host else ""
    return ""


def _load_jobs() -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for path in list_job_files():
        job = read_json(f"jobs/{path.name}")
        if job:
            jobs.append(job)
    jobs.sort(key=lambda job: str(job.get("created_at") or ""), reverse=True)
    return jobs


def _summarize_job(job: dict[str, Any]) -> dict[str, Any]:
    evaluation = job.get("evaluation") or {}
    return {
        "id": job.get("id"),
        "title": _job_title(job),
        "company": _job_company(job),
        "role": str(job.get("role") or "").strip(),
        "location": str(job.get("location") or "").strip(),
        "source": str(job.get("source") or ""),
        "url": str(job.get("url") or ""),
        "status": str(job.get("status") or ""),
        "created_at": str(job.get("created_at") or ""),
        "application_id": str(job.get("application_id") or ""),
        "verdict": evaluation.get("verdict"),
        "overall": evaluation.get("overall"),
        "eligibility": evaluation.get("eligibility"),
        "language_gate": evaluation.get("language_gate"),
    }


def _gate_failed(job: dict[str, Any]) -> bool:
    evaluation = job.get("evaluation") or {}
    return "FAIL" in {
        str(evaluation.get("eligibility") or "").upper(),
        str(evaluation.get("language_gate") or "").upper(),
    }


def _profile_meta() -> dict[str, str]:
    content = ""
    try:
        path = safe_path(PROFILE_SECTIONS["candidate"])
        if path.is_file():
            content = path.read_text(encoding="utf-8")
    except (OSError, ValueError):
        content = ""
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    return {"name": lines[0] if lines else "", "headline": lines[1] if len(lines) > 1 else ""}


def _activity_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for job in _load_jobs():
        title = _job_title(job)
        created = str(job.get("created_at") or "")
        if created:
            events.append({"at": created, "text": f"已导入 {title}", "kind": "job"})
        evaluation = job.get("evaluation") or {}
        recorded = str(evaluation.get("recorded_at") or "")
        if recorded:
            events.append(
                {"at": recorded, "text": f"完成评估 {title}", "kind": "evaluation"}
            )

    for row in load_rows():
        label = f"{row.get('company') or ''} {row.get('role') or ''}".strip() or row["id"]
        created = row.get("created_at") or ""
        if created:
            events.append({"at": created, "text": f"已起草申请 {label}", "kind": "application"})
        updated = row.get("updated_at") or ""
        if updated and updated != created and row.get("status"):
            events.append(
                {"at": updated, "text": f"{label} 状态更新为 {row['status']}", "kind": "outcome"}
            )

    for name, rel in PROFILE_SECTIONS.items():
        try:
            path = safe_path(rel)
            if path.is_file():
                mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                events.append(
                    {
                        "at": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "text": f"档案已更新（{name}）",
                        "kind": "profile",
                    }
                )
        except (OSError, ValueError):
            continue

    for folder in list_application_dirs():
        slug = folder.name
        for filename in sorted(DOC_FILES):
            try:
                path = safe_path(f"applications/{slug}/{filename}")
            except ValueError:
                continue
            if not path.is_file():
                continue
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            labels = {
                "cv.md": "简历已保存",
                "cover.md": "求职信已保存",
                "interview_prep.md": "面试准备已保存",
                "outcome.md": "结果已记录",
            }
            label = labels.get(filename)
            if label:
                events.append(
                    {"at": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"), "text": label, "kind": "doc"}
                )

    events.sort(key=lambda event: event["at"], reverse=True)
    return events[:8]


@router.get("/overview")
async def overview() -> dict[str, Any]:
    jobs = _load_jobs()
    rows = load_rows()
    evaluated = [job for job in jobs if job.get("evaluation")]
    overalls = [
        float(job["evaluation"]["overall"])
        for job in evaluated
        if isinstance((job["evaluation"] or {}).get("overall"), (int, float))
    ]

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    created = [(_parse_ts(row.get("created_at"))) for row in rows]
    this_week = sum(1 for ts in created if ts and ts >= week_ago)
    last_week = sum(1 for ts in created if ts and week_ago > ts >= two_weeks_ago)

    pending: list[dict[str, Any]] = []
    for job in jobs:
        summary = _summarize_job(job)
        status = summary["status"]
        if status == "ingested":
            pending.append({**summary, "badge": "待评估", "tone": "todo", "action": "evaluate"})
        elif status == "evaluated":
            if _gate_failed(job):
                pending.append({**summary, "badge": "闸门不通过", "tone": "gate", "action": "view"})
            else:
                pending.append({**summary, "badge": "待起草", "tone": "todo", "action": "draft"})
    for row in rows:
        if row.get("status") == "drafted":
            pending.append(
                {
                    "id": row.get("job_id") or "",
                    "application_id": row["id"],
                    "title": f"{row.get('company') or ''} {row.get('role') or ''}".strip() or row["id"],
                    "company": row.get("company") or "",
                    "created_at": row.get("updated_at") or row.get("created_at") or "",
                    "badge": "已起草",
                    "tone": "done",
                    "action": "interview",
                }
            )

    return {
        "profile": _profile_meta(),
        "stats": {
            "pending_jobs": sum(1 for job in jobs if job.get("status") == "ingested"),
            "avg_overall": round(sum(overalls) / len(overalls), 1) if overalls else None,
            "applications_this_week": this_week,
            "applications_last_week": last_week,
        },
        "funnel": {
            "ingested": len(jobs),
            "evaluated": len(evaluated),
            "applied": sum(1 for row in rows if row.get("status") in _SUBMITTED_STATUSES),
            "interview": sum(1 for row in rows if row.get("status") in _INTERVIEW_STATUSES),
            "offer": sum(1 for row in rows if row.get("status") in _OFFER_STATUSES),
        },
        "pending": pending,
    }


@router.get("/jobs")
async def jobs() -> dict[str, Any]:
    return {"jobs": [_summarize_job(job) for job in _load_jobs()]}


@router.get("/jobs/{job_id}")
async def job_detail(job_id: str) -> dict[str, Any]:
    job = read_json(f"jobs/{job_id}.json") if re.fullmatch(r"[a-zA-Z0-9_-]{4,64}", job_id) else None
    if not job:
        raise HTTPException(status_code=404, detail="职位不存在")
    return {"job": {**_summarize_job(job), "text": str(job.get("text") or ""), "evaluation": job.get("evaluation")}}


@router.get("/applications")
async def applications() -> dict[str, Any]:
    rows = load_rows()
    apps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        seen.add(row["id"])
        apps.append(_application_entry(row["id"], row))
    for folder in list_application_dirs():
        if folder.name in seen:
            continue
        apps.append(_application_entry(folder.name, None))
    apps.sort(key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)
    return {"applications": apps}


def _application_entry(slug: str, row: dict[str, str] | None) -> dict[str, Any]:
    docs: dict[str, bool] = {}
    for filename in sorted(DOC_FILES):
        try:
            docs[filename] = safe_path(f"applications/{slug}/{filename}").is_file()
        except ValueError:
            docs[filename] = False
    return {
        "id": slug,
        "company": (row or {}).get("company") or "",
        "role": (row or {}).get("role") or "",
        "status": (row or {}).get("status") or "",
        "job_id": (row or {}).get("job_id") or "",
        "deadline": (row or {}).get("deadline") or "",
        "notes": (row or {}).get("notes") or "",
        "created_at": (row or {}).get("created_at") or "",
        "updated_at": (row or {}).get("updated_at") or "",
        "docs": docs,
    }


@router.get("/activity")
async def activity() -> dict[str, Any]:
    return {"events": _activity_events()}
