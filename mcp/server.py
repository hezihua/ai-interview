"""Job-search MCP server (official mcp SDK 2.x).

Tools persist profile / jobs / applications under workspace/.
The LangChain agent owns evaluation, drafting, and interview prep.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from fetch_posting import fetch_posting, normalize_url
from tracker import get_row, load_rows, upsert_row
from workspace import (
    DOC_KINDS,
    FRAMEWORK_SECTIONS,
    PROFILE_SECTIONS,
    application_dir,
    application_slug,
    framework_relative,
    job_relative,
    list_application_dirs,
    list_job_files,
    profile_relative,
    read_json,
    read_text,
    utc_now,
    write_json,
    write_text,
)

_MCP_DIR = Path(__file__).resolve().parent
_ROOT = _MCP_DIR.parent
load_dotenv(_ROOT / ".env")
load_dotenv(_MCP_DIR / ".env", override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("mcp")

MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT") or "8765")
MCP_PATH = os.getenv("MCP_PATH") or "/mcp"
MCP_AUTH_TOKEN = (os.getenv("MCP_AUTH_TOKEN") or "").strip()
MCP_ALLOWED_HOSTS = [
    h.strip()
    for h in (os.getenv("MCP_ALLOWED_HOSTS") or "*").split(",")
    if h.strip()
]


def _transport_security() -> TransportSecuritySettings:
    hosts = MCP_ALLOWED_HOSTS
    if not hosts or hosts == ["*"] or hosts == ["off"] or hosts == ["disable"]:
        return TransportSecuritySettings(enable_dns_rebinding_protection=False)
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=hosts,
        allowed_origins=["*"],
    )


mcp = MCPServer("job-search")


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str, indent=2)


def _error(message: str, **extra: Any) -> str:
    payload = {"ok": False, "error": message}
    payload.update(extra)
    return _json(payload)


def _ok(data: dict[str, Any] | None = None, **extra: Any) -> str:
    payload: dict[str, Any] = {"ok": True}
    if data:
        payload.update(data)
    payload.update(extra)
    return _json(payload)


def _make_job_id(url: str, text: str) -> str:
    seed = url.strip() or text.strip()
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]


def _load_job(job_id: str) -> dict[str, Any] | None:
    return read_json(job_relative(job_id))


def _find_duplicate(url: str, company: str, role: str) -> dict[str, Any] | None:
    url_key = ""
    if url:
        try:
            url_key = normalize_url(url)
        except ValueError:
            url_key = url.strip()
    company_key = (company or "").strip().lower()
    role_key = (role or "").strip().lower()
    for path in list_job_files():
        job = read_json(f"jobs/{path.name}")
        if not job:
            continue
        existing_url = (job.get("url") or "").strip()
        if url_key and existing_url and existing_url == url_key:
            return job
        if (
            company_key
            and role_key
            and (job.get("company") or "").strip().lower() == company_key
            and (job.get("role") or "").strip().lower() == role_key
        ):
            return job
    return None


def _summarize_job(job: dict[str, Any]) -> dict[str, Any]:
    evaluation = job.get("evaluation") or {}
    return {
        "id": job.get("id"),
        "company": job.get("company"),
        "role": job.get("role"),
        "location": job.get("location"),
        "url": job.get("url"),
        "status": job.get("status"),
        "deadline": job.get("deadline"),
        "verdict": evaluation.get("verdict"),
        "overall": evaluation.get("overall"),
    }


class BearerAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        if not MCP_AUTH_TOKEN:
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        expected = f"Bearer {MCP_AUTH_TOKEN}"
        if not secrets.compare_digest(auth, expected):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        return await call_next(request)


@mcp.tool()
def get_profile(section: str = "") -> str:
    """读取候选人档案。section 为空则返回全部：candidate / behavioral / writing-style / search-queries。"""
    logger.info("get_profile section=%s", section or "*")
    try:
        if section.strip():
            rel = profile_relative(section)
            return _ok({"section": section.strip().lower(), "content": read_text(rel)})
        sections = {
            name: read_text(rel) for name, rel in PROFILE_SECTIONS.items()
        }
        return _ok({"sections": sections})
    except ValueError as exc:
        return _error(str(exc))


@mcp.tool()
def update_profile(section: str, content: str) -> str:
    """覆盖写入档案某一节。section: candidate / behavioral / writing-style / search-queries。
    candidate 应写成模板结构的 Markdown，不要塞简历原文。写完后对用户总结档案，不要提字节数。"""
    logger.info("update_profile section=%s chars=%s", section, len(content))
    try:
        rel = profile_relative(section)
        path = write_text(rel, content)
        logger.info("update_profile wrote %s", path)
        preview = content.strip().splitlines()
        preview_text = "\n".join(preview[:12])
        return _ok(
            {
                "section": section.strip().lower(),
                "path": rel,
                "written": True,
                "preview": preview_text,
            }
        )
    except OSError as exc:
        return _error(f"Failed to write profile: {exc}")
    except ValueError as exc:
        return _error(str(exc))


@mcp.tool()
def get_framework(name: str = "evaluation") -> str:
    """读取 SOP 框架：evaluation / interview / writing。评匹配前先读 evaluation。"""
    logger.info("get_framework name=%s", name)
    try:
        rel = framework_relative(name)
        return _ok({"name": name.strip().lower(), "content": read_text(rel)})
    except ValueError as exc:
        return _error(str(exc), known=list(FRAMEWORK_SECTIONS))


@mcp.tool()
def ingest_job(
    url: str = "",
    text: str = "",
    company: str = "",
    role: str = "",
    location: str = "",
    deadline: str = "",
) -> str:
    """收录岗位。给 url 则抓取正文；抓取失败请把完整 JD 放进 text。已存在则返回原记录。"""
    logger.info("ingest_job url=%s", url or "(paste)")
    url = (url or "").strip()
    text = (text or "").strip()
    if url:
        try:
            url = normalize_url(url)
        except ValueError as exc:
            return _error(str(exc))

    if not url and not text:
        return _error("Provide a job url and/or pasted posting text")

    fetch_error = None
    if url and not text:
        text, fetch_error = fetch_posting(url)
        if fetch_error:
            return _error(fetch_error, hint="Paste the full job description as text")

    existing = _find_duplicate(url, company, role)
    if existing:
        changed = False
        for field, value in (
            ("company", company),
            ("role", role),
            ("location", location),
            ("deadline", deadline),
        ):
            if value.strip() and not str(existing.get(field) or "").strip():
                existing[field] = value.strip()
                changed = True
        if changed:
            write_json(job_relative(str(existing["id"])), existing)
        return _ok({"deduped": True, "job": existing})

    job_id = _make_job_id(url, text)
    job = {
        "id": job_id,
        "url": url,
        "company": company.strip(),
        "role": role.strip(),
        "location": location.strip(),
        "deadline": deadline.strip(),
        "source": "url" if url else "paste",
        "text": text,
        "status": "ingested",
        "created_at": utc_now(),
        "evaluation": None,
    }
    write_json(job_relative(job_id), job)
    return _ok({"deduped": False, "job": job})


@mcp.tool()
def get_job(job_id: str) -> str:
    """按 id 读取已收录岗位（含完整 JD 原文与评分）。"""
    logger.info("get_job %s", job_id)
    try:
        job = _load_job(job_id)
    except ValueError as exc:
        return _error(str(exc))
    if not job:
        return _error(f"Job not found: {job_id}")
    return _ok({"job": job})


@mcp.tool()
def list_jobs(status: str = "") -> str:
    """列出已收录岗位摘要。可选按 status 过滤：ingested / evaluated / drafted。"""
    logger.info("list_jobs status=%s", status or "*")
    wanted = status.strip().lower()
    jobs: list[dict[str, Any]] = []
    for path in list_job_files():
        job = read_json(f"jobs/{path.name}")
        if not job:
            continue
        if wanted and (job.get("status") or "").lower() != wanted:
            continue
        jobs.append(_summarize_job(job))
    return _ok({"count": len(jobs), "jobs": jobs})


@mcp.tool()
def record_evaluation(
    job_id: str,
    technical: int,
    experience: int,
    behavioral: int,
    career: int,
    location: str,
    overall: int,
    verdict: str,
    notes: str = "",
    eligibility: str = "PASS",
    language_gate: str = "PASS",
) -> str:
    """保存五维评分。location 为 PASS/FAIL/FLAG；闸门 FAIL 时不要继续起草。"""
    logger.info("record_evaluation %s verdict=%s", job_id, verdict)
    try:
        job = _load_job(job_id)
    except ValueError as exc:
        return _error(str(exc))
    if not job:
        return _error(f"Job not found: {job_id}")
    job["evaluation"] = {
        "technical": int(technical),
        "experience": int(experience),
        "behavioral": int(behavioral),
        "career": int(career),
        "location": location.strip().upper(),
        "overall": int(overall),
        "verdict": verdict.strip(),
        "eligibility": eligibility.strip().upper() or "PASS",
        "language_gate": language_gate.strip().upper() or "PASS",
        "notes": notes,
        "recorded_at": utc_now(),
    }
    job["status"] = "evaluated"
    write_json(job_relative(job_id), job)
    return _ok({"job_id": job_id, "evaluation": job["evaluation"]})


@mcp.tool()
def save_application_doc(job_id: str, kind: str, markdown: str) -> str:
    """保存申请文档。kind: cv 或 cover_letter。事实必须来自档案，禁止编造。"""
    logger.info("save_application_doc %s kind=%s", job_id, kind)
    key = (kind or "").strip().lower()
    if key not in DOC_KINDS:
        return _error("kind must be cv or cover_letter")
    try:
        job = _load_job(job_id)
    except ValueError as exc:
        return _error(str(exc))
    if not job:
        return _error(f"Job not found: {job_id}")
    slug = application_slug(str(job.get("company") or ""), str(job.get("role") or ""), job_id)
    rel = f"{application_dir(slug)}/{DOC_KINDS[key]}"
    write_text(rel, markdown)
    filename = DOC_KINDS[key]
    return _ok(
        {
            "application_id": slug,
            "path": rel,
            "kind": key,
            "view_url": f"/applications/{slug}/{filename}",
        }
    )


@mcp.tool()
def record_application(job_id: str) -> str:
    """把岗位登记为已起草申请：归档 JD/评分，并在 tracker.csv 写入 drafted 行。"""
    logger.info("record_application %s", job_id)
    try:
        job = _load_job(job_id)
    except ValueError as exc:
        return _error(str(exc))
    if not job:
        return _error(f"Job not found: {job_id}")

    slug = application_slug(str(job.get("company") or ""), str(job.get("role") or ""), job_id)
    folder = application_dir(slug)
    write_text(f"{folder}/posting.md", str(job.get("text") or ""))
    evaluation = job.get("evaluation")
    if evaluation:
        write_text(f"{folder}/evaluation.md", _json(evaluation))

    job["status"] = "drafted"
    job["application_id"] = slug
    write_json(job_relative(job_id), job)

    row = upsert_row(
        {
            "id": slug,
            "company": job.get("company") or "",
            "role": job.get("role") or "",
            "status": "drafted",
            "job_id": job_id,
            "source": job.get("url") or job.get("source") or "",
            "deadline": job.get("deadline") or "",
            "notes": "",
        }
    )
    return _ok(
        {
            "application_id": slug,
            "tracker": row,
            "view_urls": {
                "cv": f"/applications/{slug}/cv.md",
                "cover_letter": f"/applications/{slug}/cover.md",
            },
        }
    )


@mcp.tool()
def list_applications() -> str:
    """列出 tracker.csv 中的全部申请。"""
    logger.info("list_applications")
    rows = load_rows()
    return _ok({"count": len(rows), "applications": rows})


@mcp.tool()
def get_application(application_id: str) -> str:
    """读取一次申请的归档（JD、CV、求职信、评分、面试准备、结果）。"""
    logger.info("get_application %s", application_id)
    try:
        folder = application_dir(application_id)
    except ValueError as exc:
        return _error(str(exc))
    files = {
        name: read_text(f"{folder}/{name}")
        for name in (
            "posting.md",
            "cv.md",
            "cover.md",
            "evaluation.md",
            "interview_prep.md",
            "outcome.md",
        )
    }
    if not any(files.values()) and get_row(application_id) is None:
        return _error(f"Application not found: {application_id}")
    return _ok(
        {
            "application_id": application_id,
            "tracker": get_row(application_id),
            "files": files,
        }
    )


@mcp.tool()
def save_interview_prep(application_id: str, markdown: str) -> str:
    """保存面试准备（STAR、可能问题、要问面试官的问题）。"""
    logger.info("save_interview_prep %s", application_id)
    try:
        folder = application_dir(application_id)
    except ValueError as exc:
        return _error(str(exc))
    rel = f"{folder}/interview_prep.md"
    write_text(rel, markdown)
    upsert_row({"id": application_id, "status": "interview"})
    return _ok({"application_id": application_id, "path": rel})


@mcp.tool()
def record_outcome(application_id: str, status: str, notes: str = "") -> str:
    """记录申请结果。status 如 applied / interview / offered / rejected / withdrawn / hired。"""
    logger.info("record_outcome %s status=%s", application_id, status)
    status = (status or "").strip().lower()
    if not status:
        return _error("status is required")
    try:
        folder = application_dir(application_id)
    except ValueError as exc:
        return _error(str(exc))
    write_text(
        f"{folder}/outcome.md",
        f"# Outcome\n\n- status: {status}\n- at: {utc_now()}\n\n{notes.strip()}\n",
    )
    row = upsert_row({"id": application_id, "status": status, "notes": notes})
    return _ok({"application_id": application_id, "tracker": row})


def _run_streamable_http() -> None:
    import uvicorn

    app = mcp.streamable_http_app(
        streamable_http_path=MCP_PATH,
        transport_security=_transport_security(),
        host=MCP_HOST,
    )
    if MCP_AUTH_TOKEN:
        app.add_middleware(BearerAuthMiddleware)
        logger.info("Bearer auth enabled")
    else:
        logger.warning(
            "MCP_AUTH_TOKEN 未设置：HTTP 端点无鉴权，请仅在内网使用或补上 Token"
        )

    logger.info(
        "Starting job-search MCP (streamable-http) on http://%s:%s%s",
        MCP_HOST,
        MCP_PORT,
        MCP_PATH,
    )
    uvicorn.run(app, host=MCP_HOST, port=MCP_PORT, log_level="info")


if __name__ == "__main__":
    transport = (os.getenv("MCP_TRANSPORT") or "stdio").strip().lower()
    if transport in {"streamable-http", "http", "sse"}:
        if transport == "sse":
            logger.warning("MCP_TRANSPORT=sse 已映射为 streamable-http（推荐）")
        _run_streamable_http()
    else:
        logger.info("Starting job-search MCP (stdio)")
        mcp.run(transport="stdio")
