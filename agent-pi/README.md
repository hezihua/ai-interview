# agent-pi

Pi（`@mariozechner/pi-coding-agent`）求职 Agent harness。

```bash
# 需先启动 mcp/server.py（:8765）
cd agent-pi
npm install
npm run start   # http://127.0.0.1:8767
```

环境变量读仓库根 `.env`：`OPENROUTER_API_KEY`、`MODEL=openrouter:<id>`、`MCP_URL`、`MCP_AUTH_TOKEN`。

接口：`GET /health`，`POST /v1/chat`，`POST /v1/chat/stream`（SSE 与原先前端契约一致）。
