"""LangChain agent factory: create_agent + job-search MCP tools."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver

from config import SYSTEM_PROMPT, Settings
from mcp_client import JobSearchMCPClient


async def create_job_agent(
    settings: Settings | None = None,
    *,
    with_memory: bool = True,
):
    """创建带 job-search MCP 工具的 LangChain agent。

    Returns:
        (agent, client) — agent 可 ainvoke；用完后调用 await client.aclose()。
    """
    settings = settings or Settings.from_env()
    client = JobSearchMCPClient(settings)
    try:
        await client.connect()
        tools = await client.get_tools()
    except Exception:
        await client.aclose()
        raise
    if not tools:
        await client.aclose()
        raise RuntimeError(
            f"No tools loaded from MCP at {client.url}. "
            "Check MCP_URL / MCP_AUTH_TOKEN and that mcp/server.py is running."
        )

    agent = create_agent(
        model=settings.model,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        checkpointer=InMemorySaver() if with_memory else None,
    )
    return agent, client


def content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            else:
                text = getattr(block, "text", None)
                if text:
                    parts.append(str(text))
        return "".join(parts)
    return str(content)


def last_ai_text(result: dict[str, Any]) -> str:
    """从 agent.invoke 结果中取出最后一条 AI 文本。"""
    messages = result.get("messages") or []
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content")
        if not content:
            continue
        tool_calls = getattr(msg, "tool_calls", None)
        if tool_calls and (content == "" or content is None):
            continue
        text = content_to_text(content).strip()
        if text:
            return text
    return "(无文本回复)"


async def astream_answer_text(
    agent: Any,
    question: str,
    thread_id: str,
) -> AsyncIterator[str]:
    """流式产出模型最终回答的文本增量（跳过纯 tool 调用）。"""
    async for chunk, metadata in agent.astream(
        {"messages": [{"role": "user", "content": question}]},
        config={"configurable": {"thread_id": thread_id}},
        stream_mode="messages",
    ):
        if metadata.get("langgraph_node") != "model":
            continue
        if getattr(chunk, "tool_call_chunks", None) and not getattr(
            chunk, "content", None
        ):
            continue
        text = content_to_text(getattr(chunk, "content", None))
        if text:
            yield text
