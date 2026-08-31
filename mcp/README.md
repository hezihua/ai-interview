# Job Search MCP

本目录是求职工具服务。环境变量写在仓库根目录 `.env`，数据写在 `workspace/`。与 Agent / FastAPI **共用根目录 `.venv`**（mcp SDK 2.x）。

工具：`get_profile`、`update_profile`、`get_framework`、`ingest_job`、`get_job`、`list_jobs`、`record_evaluation`、`save_application_doc`、`record_application`、`list_applications`、`get_application`、`save_interview_prep`、`record_outcome`。

```bash
cd /home/hezihua/workspace/ai-interview
source .venv/bin/activate
python mcp/server.py
```

或在仓库根目录 `docker compose up -d --build mcp`。
