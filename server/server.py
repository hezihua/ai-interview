#!/usr/bin/env python3
"""FastAPI workbench API (documents / applications). Chat is served by agent-pi."""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

_REPO = Path(__file__).resolve().parent.parent
_MCP = _REPO / "mcp"
_SERVER = Path(__file__).resolve().parent
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))
# 追加到末尾，避免 uvicorn 把 mcp/server.py 当成 "server:app"
if str(_MCP) not in sys.path:
    sys.path.append(str(_MCP))

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from config import cors_origins_from_env
from extract import ExtractError, extract_text
from workbench import router as workbench_router
from workspace import application_dir, read_text, resolve_doc_filename

load_dotenv(_REPO / ".env")

_state: dict[str, Any] = {}


def _api_auth_token() -> str:
    return (os.getenv("API_AUTH_TOKEN") or "").strip()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _state["api_auth_token"] = _api_auth_token()
    try:
        yield
    finally:
        _state.clear()


app = FastAPI(title="Job Search Workbench API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(cors_origins_from_env()),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_api_auth(
    authorization: str | None = Header(default=None),
) -> None:
    expected = _state.get("api_auth_token") or ""
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")


app.include_router(
    workbench_router, dependencies=[Depends(_require_api_auth)]
)


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "workbench"}


@app.get("/v1/applications/{application_id}/{filename}")
async def get_application_document(
    application_id: str,
    filename: str,
    _: None = Depends(_require_api_auth),
) -> dict[str, str]:
    try:
        doc = resolve_doc_filename(filename)
        rel = f"{application_dir(application_id)}/{doc}"
        content = read_text(rel)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not content.strip():
        raise HTTPException(status_code=404, detail="文档不存在或还是空的")
    titles = {
        "cv.md": "简历",
        "cover.md": "求职信",
        "interview_prep.md": "面试准备",
        "posting.md": "岗位 JD",
        "evaluation.md": "评估",
        "outcome.md": "申请结果",
    }
    return {
        "application_id": application_id,
        "filename": doc,
        "title": titles.get(doc, doc),
        "markdown": content,
    }


@app.post("/v1/documents/extract")
async def extract_documents(
    files: list[UploadFile] = File(...),
    _: None = Depends(_require_api_auth),
) -> dict[str, list[dict[str, str]]]:
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一个文件")
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="一次最多 3 个文件")
    documents: list[dict[str, str]] = []
    for upload in files:
        raw = await upload.read()
        name = upload.filename or "upload"
        try:
            text = extract_text(name, raw)
        except ExtractError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"{name} 解析失败：{exc}"
            ) from exc
        documents.append({"filename": name, "text": text})
    return {"documents": documents}


def main() -> None:
    import uvicorn

    host = (os.getenv("API_HOST") or "0.0.0.0").strip()
    try:
        port = int((os.getenv("API_PORT") or "8766").strip())
    except ValueError as exc:
        raise SystemExit("API_PORT must be an integer") from exc
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=False,
    )


if __name__ == "__main__":
    main()
