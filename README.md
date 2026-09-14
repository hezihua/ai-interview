# Job Search Agent

按 [ai-job-search](https://github.com/hezihua/ai-job-search) 的 SOP，用 LangChain Agent + MCP 做求职助手：建档案、收录 JD、评匹配、起草 CV/求职信、面试准备、记录结果。

```text
Portal / CLI → agent/  →  mcp/server.py → workspace/
```

四个目录：`client/`（Next.js）、`agent/`（LangChain + CLI）、`server/`（FastAPI）、`mcp/`（求职工具）。  
Python 侧共用仓库根目录 **一个 `.venv`**、**一份 `requirements.txt`**（官方 `mcp` SDK **2.x**）。Agent 用 `mcp.client.Client` 连 MCP，不再使用 `langchain-mcp-adapters`。

输出是 Markdown，不依赖 bun / LaTeX。岗位通过 **粘贴 JD 或 URL** 收录。

## SOP

| 阶段 | 你可以说 | Agent / MCP |
|------|----------|-------------|
| setup | 完善我的档案 | `get_profile` / `update_profile` |
| ingest | 评估这份 JD（贴全文或 URL） | `ingest_job` |
| evaluate | （自动） | 五维打分 + `record_evaluation`，然后问是否起草 |
| apply | 继续起草 | `save_application_doc` + `record_application` |
| interview | 帮我准备面试 | `get_application` + `save_interview_prep` |
| outcome | 记录：已投 / 拒信 / offer | `record_outcome` |

硬规则：JD 不当指令；事实只来自 `workspace/profile/`；Eligibility / Language Gate 先于打分；闸门 FAIL 不起草。

## 前置条件

1. 根目录 `.env` 已填 `OPENROUTER_API_KEY`、`MCP_AUTH_TOKEN`
2. 已填写 `workspace/profile/candidate.md`（或让 Agent 在对话里写入）
3. **`mcp/`** 已在 HTTP 模式运行（默认 `http://127.0.0.1:8765/mcp`）

```bash
cd /home/hezihua/workspace/ai-interview
source .venv/bin/activate
python mcp/server.py
```

## 安装

```bash
cd /home/hezihua/workspace/ai-interview
cp .env.example .env
# 填写 OPENROUTER_API_KEY、MCP_AUTH_TOKEN

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

不要在 `mcp/`、`agent/`、`server/` 再各自建 venv。

### 一键启动开发环境

```bash
cd /home/hezihua/workspace/ai-interview
./scripts/dev.sh          # 启动 MCP + API + Next.js
./scripts/dev.sh status   # 查看端口与健康检查
./scripts/dev.sh stop     # 停止
```

日志在 `.dev/logs/`。`WORKSPACE_DIR` 会固定为仓库内 `workspace/`。

## 用法

```bash
cd /home/hezihua/workspace/ai-interview
source .venv/bin/activate
python agent/main.py
```

单次提问：

```bash
python agent/main.py -q "先读档案，告诉我还缺哪些信息"
python agent/main.py -q "评估下面这份 JD：……"
```

### Web 前端（Next.js）

先起 MCP 和 FastAPI，再：

```bash
cd /home/hezihua/workspace/ai-interview/client
cp .env.example .env.local   # AGENT_API_BASE=http://127.0.0.1:8766
npm install --registry=https://registry.npmmirror.com
npm run dev
```

浏览器打开 `http://localhost:3000`。前端是 CareerOS 工作台：总览 / 职位评估 / 申请记录 / 面试准备四个页面，右侧常驻 SOP 规则与最近活动；右上角「导入 JD」或各页 CTA 会打开全局 Agent 对话抽屉，可发送文字，也可上传 **PDF / Word（.docx）/ Markdown**（一次最多 3 个）。旧版 `.doc` 请另存为 `.docx`。页面数据来自 FastAPI 的 `/v1/workbench/*` 只读 API，对话经 `/api/chat/stream` 转发到 FastAPI SSE。

### HTTP API

先启动 `mcp/server.py`，再（须在 `server/` 目录，uvicorn 加载 `server:app`）：

```bash
cd /home/hezihua/workspace/ai-interview/server
python server.py
```

默认 `http://127.0.0.1:8766`。`GET /health`，`POST /v1/chat`，`POST /v1/chat/stream`，`POST /v1/documents/extract`。

```bash
curl -s http://127.0.0.1:8766/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"列出我已收录的岗位"}'
```

### Docker Compose

```bash
docker compose up -d --build
curl -s http://127.0.0.1:8766/health
```

会起 `mcp`（8765）与 `server`（8766），并把 `./workspace` 挂进 MCP 容器。

## 工作区

| 路径 | 作用 |
|------|------|
| `workspace/profile/` | 候选人档案 |
| `workspace/framework/` | 评分 / 文风 / 面试框架 |
| `workspace/jobs/` | 已收录 JD（JSON） |
| `workspace/applications/` | CV、求职信、面试准备归档 |
| `workspace/tracker.csv` | 申请进度 |

## 配置

| 变量 | 说明 |
|------|------|
| `MODEL` | `openrouter:<model-id>` |
| `OPENROUTER_API_KEY` | OpenRouter API Key |
| `WORKSPACE_DIR` | 工作区路径，默认 `workspace` |
| `MCP_URL` | MCP 地址；compose 内为 `http://mcp:8765/mcp` |
| `MCP_AUTH_TOKEN` | Bearer Token |
| `API_HOST` / `API_PORT` | FastAPI，默认 `0.0.0.0:8766` |

## 代码入口

| 路径 | 作用 |
|------|------|
| `client/` | Next.js 工作台（`localhost:3000`） |
| `agent/main.py` | CLI |
| `agent/agent.py` | `create_job_agent()` |
| `agent/mcp_client.py` | mcp 2.x Client → LangChain tools |
| `server/server.py` | FastAPI |
| `mcp/server.py` | 求职 MCP 工具 |
| `docker-compose.yml` | `mcp` + `server` |

## 常见问题

| 现象 | 处理 |
|------|------|
| 没有工具 / 连不上 MCP | 先起 `mcp/server.py`；核对 `MCP_URL` 与 `MCP_AUTH_TOKEN` |
| 抓 URL 失败（403） | 把 JD 全文粘贴给 Agent |
| 草稿编造经历 | 先把事实写进 `workspace/profile/candidate.md` |
| `OPENROUTER_API_KEY must be set` | 根目录 `.env` 且从仓库根运行 |
