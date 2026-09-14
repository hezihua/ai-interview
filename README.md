# Job Search Agent

按 [ai-job-search](https://github.com/hezihua/ai-job-search) 的 SOP，用 **Pi harness** + MCP 做求职助手：建档案、收录 JD、评匹配、起草 CV/求职信、面试准备、记录结果。

```text
Portal → agent-pi (Pi) → mcp/server.py → workspace/
         FastAPI workbench ─────────────↗
```

目录：`client/`（Next.js）、`agent-pi/`（Pi + OpenRouter 聊天）、`server/`（FastAPI 工作台只读/解析）、`mcp/`（求职工具）。  
Python 侧共用仓库根目录 **一个 `.venv`**、**一份 `requirements.txt`**（官方 `mcp` SDK **2.x**）。对话 harness 为 `@mariozechner/pi-coding-agent`（见 `agent-pi/`）。旧版 LangChain CLI 在 `agent/`（已废弃）。

输出是 Markdown。岗位通过 **粘贴 JD 或 URL** 收录。

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
3. Node.js（fnm/npm）可用于 `client/` 与 `agent-pi/`

## 安装

```bash
cd /home/hezihua/workspace/ai-interview
cp .env.example .env
# 填写 OPENROUTER_API_KEY、MCP_AUTH_TOKEN

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd agent-pi && npm install && cd ..
cd client && cp .env.example .env.local && npm install && cd ..
```

不要在 `mcp/`、`agent/`、`server/` 再各自建 venv。

### 一键启动开发环境

```bash
cd /home/hezihua/workspace/ai-interview
./scripts/dev.sh          # MCP + workbench API + agent-pi + Next.js
./scripts/dev.sh status
./scripts/dev.sh stop
```

| 服务 | 端口 |
|------|------|
| MCP | 8765 |
| FastAPI workbench | 8766 |
| agent-pi（Pi 聊天） | 8767 |
| Next.js | 3000 |

日志在 `.dev/logs/`。`WORKSPACE_DIR` 会固定为仓库内 `workspace/`。

## 用法

### Web 前端（Next.js）

浏览器打开 `http://localhost:3000`。工作台：总览 / 职位评估 / 申请记录 / 面试准备；右侧 SOP；「导入 JD」打开 Agent 抽屉（文字 + PDF/docx/Markdown）。页面数据来自 FastAPI `/v1/workbench/*`；对话经 `/api/chat/stream` 转发到 **agent-pi** SSE。

`client/.env.local`：

```env
AGENT_API_BASE=http://127.0.0.1:8766
AGENT_CHAT_BASE=http://127.0.0.1:8767
```

### agent-pi（聊天）

```bash
cd agent-pi && npm run start
curl -s http://127.0.0.1:8767/health
curl -s http://127.0.0.1:8767/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"列出我已收录的岗位"}'
```

### Workbench HTTP API

```bash
cd server && python server.py
# GET /health，GET /v1/workbench/*，POST /v1/documents/extract
```

### Docker Compose

```bash
docker compose up -d --build
```

当前 compose 仍起 `mcp` + FastAPI；聊天请本机跑 `agent-pi`（后续可再纳入 compose）。

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
| `MODEL` | `openrouter:<model-id>`（agent-pi） |
| `OPENROUTER_API_KEY` | OpenRouter API Key |
| `WORKSPACE_DIR` | 工作区路径，默认 `workspace` |
| `MCP_URL` | MCP 地址 |
| `MCP_AUTH_TOKEN` | Bearer Token |
| `API_HOST` / `API_PORT` | FastAPI workbench，默认 `0.0.0.0:8766` |
| `AGENT_PI_PORT` | agent-pi，默认 `8767` |

## 代码入口

| 路径 | 作用 |
|------|------|
| `client/` | Next.js 工作台 |
| `agent-pi/` | Pi harness + MCP 工具桥 + SSE |
| `server/server.py` | FastAPI workbench / 文档提取 |
| `mcp/server.py` | 求职 MCP 工具 |
| `agent/` | 旧 LangChain CLI（已废弃） |

## 常见问题

| 现象 | 处理 |
|------|------|
| 对话不可用 / health 502 | 确认 agent-pi `:8767` 与 FastAPI `:8766` 都在跑 |
| 没有工具 / 连不上 MCP | 先起 `mcp/server.py`；核对 `MCP_URL` 与 `MCP_AUTH_TOKEN` |
| 抓 URL 失败（403） | 把 JD 全文粘贴给 Agent |
| 草稿编造经历 | 先把事实写进 `workspace/profile/candidate.md` |
| `OPENROUTER_API_KEY must be set` | 根目录 `.env` |
