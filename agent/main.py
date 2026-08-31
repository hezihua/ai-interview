#!/usr/bin/env python3
"""Interactive CLI for the job-search agent."""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
REPO = AGENT_DIR.parent
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))

try:
    from agent import create_job_agent, last_ai_text
    from config import Settings
except ImportError as exc:
    venv_python = REPO / ".venv" / "bin" / "python"
    print(
        "依赖导入失败（多半没用项目虚拟环境）。\n"
        f"原因: {exc}\n\n"
        "请先执行：\n"
        f"  cd {REPO}\n"
        "  source .venv/bin/activate\n"
        "  python agent/main.py …\n"
        "或直接：\n"
        f"  {venv_python} agent/main.py …",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc


async def run_once(question: str, thread_id: str | None = None) -> None:
    settings = Settings.from_env()
    agent, client = await create_job_agent(settings)
    try:
        config = {"configurable": {"thread_id": thread_id or str(uuid.uuid4())}}
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": question}]},
            config=config,
        )
        print(last_ai_text(result))
    finally:
        await client.aclose()


async def run_chat() -> None:
    settings = Settings.from_env()
    print(f"Model: {settings.model}")
    print(f"MCP:   {settings.mcp_url}")
    print("正在加载 job-search MCP 工具…")
    agent, client = await create_job_agent(settings)
    try:
        thread_id = str(uuid.uuid4())
        print(
            f"已就绪（thread={thread_id[:8]}…）。"
            "可以说：完善档案 / 评估这份 JD / 起草申请 / 面试准备 / 记录结果。"
            " exit / quit 退出。\n"
        )

        while True:
            try:
                question = input("你> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n再见。")
                break
            if not question:
                continue
            if question.lower() in {"exit", "quit", "q"}:
                print("再见。")
                break

            result = await agent.ainvoke(
                {"messages": [{"role": "user", "content": question}]},
                config={"configurable": {"thread_id": thread_id}},
            )
            print(f"\n助手> {last_ai_text(result)}\n")
    finally:
        await client.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Job Search Agent (LangChain)")
    parser.add_argument(
        "-q",
        "--question",
        help="单次提问后退出；省略则进入交互模式",
    )
    parser.add_argument(
        "--thread-id",
        help="会话 thread_id（多轮记忆）；默认随机",
    )
    args = parser.parse_args()

    if args.question:
        asyncio.run(run_once(args.question, args.thread_id))
    else:
        asyncio.run(run_chat())


if __name__ == "__main__":
    main()
