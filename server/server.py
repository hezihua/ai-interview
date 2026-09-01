#!/usr/bin/env python3
"""FastAPI server for the job-search agent."""

from __future__ import annotations

import json
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

_REPO = Path(__file__).resolve().parent.parent
_AGENT = _REPO / "agent"
_MCP = _REPO / "mcp"
if str(_AGENT) not in sys.path:
    sys.path.insert(0, str(_AGENT))
# 追加到末尾，避免 uvicorn 把 mcp/server.py 当成 "server:app"
if str(_MCP) not in sys.path:
    sys.path.append(str(_MCP))

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from agent import astream_answer_text, create_job_agent, last_ai_text
from config import Settings, cors_origins_from_env
from extract import ExtractError, extract_text
from workbench import router as workbench_router
from workspace import application_dir, read_text, resolve_doc_filename

_state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = Settings.from_env()
    agent, client = await create_job_agent(settings)
    _state["settings"] = settings
    _state["agent"] = agent
    _state["client"] = client
    try:
        yield
    finally:
        await client.aclose()
        _state.clear()


app = FastAPI(title="Job Search Agent", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(cors_origins_from_env()),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    thread_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    thread_id: str


def _require_api_auth(
    authorization: str | None = Header(default=None),
) -> None:
    expected = _state["settings"].api_auth_token
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def _resolve_thread_id(thread_id: str | None) -> str:
    value = (thread_id or "").strip()
    return value or str(uuid.uuid4())


app.include_router(
    workbench_router, dependencies=[Depends(_require_api_auth)]
)


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": _state["settings"].model}


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


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    _: None = Depends(_require_api_auth),
) -> ChatResponse:
    thread_id = _resolve_thread_id(body.thread_id)
    try:
        result = await _state["agent"].ainvoke(
            {"messages": [{"role": "user", "content": body.question}]},
            config={"configurable": {"thread_id": thread_id}},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatResponse(answer=last_ai_text(result), thread_id=thread_id)


@app.post("/v1/chat/stream")
async def chat_stream(
    body: ChatRequest,
    _: None = Depends(_require_api_auth),
) -> StreamingResponse:
    thread_id = _resolve_thread_id(body.thread_id)

    async def events():
        answer_parts: list[str] = []
        try:
            async for text in astream_answer_text(
                _state["agent"], body.question, thread_id
            ):
                answer_parts.append(text)
                yield _sse({"type": "token", "text": text})
            yield _sse(
                {
                    "type": "done",
                    "thread_id": thread_id,
                    "answer": "".join(answer_parts) or "(无文本回复)",
                }
            )
        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def main() -> None:
    import uvicorn

    settings = Settings.from_env()
    uvicorn.run(
        "server:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
