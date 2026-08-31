"""mcp SDK 2.x client → LangChain tools."""

from __future__ import annotations

import json
from contextlib import AsyncExitStack
from typing import Any

from langchain_core.tools import StructuredTool
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client
from pydantic import BaseModel, Field, create_model

from config import Settings

_JSON_TYPES = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
}


class JobSearchMCPClient:
    """Keep one Streamable HTTP session for the process lifetime."""

    def __init__(self, settings: Settings) -> None:
        self.url = settings.mcp_url
        self._token = settings.mcp_auth_token
        self._stack: AsyncExitStack | None = None
        self._mcp: Client | None = None

    async def connect(self) -> None:
        if self._mcp is not None:
            return
        headers = (
            {"Authorization": f"Bearer {self._token}"} if self._token else None
        )
        stack = AsyncExitStack()
        await stack.__aenter__()
        try:
            http = await stack.enter_async_context(
                create_mcp_http_client(headers=headers)
            )
            self._mcp = await stack.enter_async_context(
                Client(streamable_http_client(self.url, http_client=http))
            )
        except Exception:
            await stack.aclose()
            raise
        self._stack = stack

    async def aclose(self) -> None:
        stack, self._stack, self._mcp = self._stack, None, None
        if stack is not None:
            await stack.aclose()

    async def get_tools(self) -> list[StructuredTool]:
        if self._mcp is None:
            raise RuntimeError("MCP client is not connected")
        tools: list[StructuredTool] = []
        cursor: str | None = None
        while True:
            page = await self._mcp.list_tools(cursor=cursor)
            tools.extend(_to_langchain(self._mcp, item) for item in page.tools)
            if not page.next_cursor:
                break
            cursor = page.next_cursor
        return tools


def _schema_model(name: str, schema: dict[str, Any] | None) -> type[BaseModel]:
    schema = schema or {}
    properties = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    fields: dict[str, Any] = {}
    for key, spec in properties.items():
        spec = spec or {}
        typ = _JSON_TYPES.get(spec.get("type"), Any)
        description = spec.get("description") or ""
        if key in required and "default" not in spec:
            fields[key] = (typ, Field(..., description=description))
            continue
        default = spec.get("default", "" if typ is str else None)
        fields[key] = (typ, Field(default=default, description=description))
    return create_model(f"{name}_Args", **fields)


def _result_text(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(str(text))
    if parts:
        return "\n".join(parts)
    structured = getattr(result, "structured_content", None)
    if structured:
        return json.dumps(structured, ensure_ascii=False)
    return ""


def _to_langchain(client: Client, tool: Any) -> StructuredTool:
    schema = getattr(tool, "input_schema", None) or {}
    if not isinstance(schema, dict):
        schema = dict(schema)

    async def _run(**arguments: Any) -> str:
        result = await client.call_tool(tool.name, arguments)
        text = _result_text(result)
        if getattr(result, "is_error", False):
            return text or "MCP tool returned an error"
        return text or "(empty)"

    return StructuredTool.from_function(
        name=tool.name,
        description=tool.description or tool.name,
        args_schema=_schema_model(tool.name, schema),
        coroutine=_run,
    )
