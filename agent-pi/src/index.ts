import express, { type Request, type Response, type NextFunction } from "express";
import { loadConfig } from "./config.js";
import { McpToolBridge } from "./mcp-tools.js";
import { SessionPool } from "./session.js";

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function main() {
  const config = loadConfig();
  const mcp = new McpToolBridge(config.mcpUrl, config.mcpAuthToken);
  await mcp.connect();
  const tools = (await mcp.loadTools()).filter(
    (tool) =>
      tool.name !== "save_interview_prep" && tool.name !== "record_evaluation",
  );
  if (!tools.length) {
    throw new Error(`No tools loaded from MCP at ${config.mcpUrl}`);
  }
  console.log(
    `Loaded ${tools.length} MCP tools from ${config.mcpUrl} (save_interview_prep/record_evaluation disabled; localStorage save)`,
  );

  const pool = new SessionPool(config, tools);
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!config.apiAuthToken) return next();
    const auth = req.header("authorization") || "";
    if (auth !== `Bearer ${config.apiAuthToken}`) {
      res.status(401).json({ detail: "Unauthorized" });
      return;
    }
    next();
  };

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", model: pool.modelLabel, harness: "pi" });
  });

  app.post("/v1/chat", requireAuth, async (req, res) => {
    const question = String(req.body?.question || "").trim();
    if (!question) {
      res.status(400).json({ detail: "question is required" });
      return;
    }
    const threadId = pool.resolveThreadId(req.body?.thread_id);
    let answer = "";
    let error: string | null = null;
    await pool.prompt(threadId, question, {
      onToken: () => {},
      onDone: (text) => {
        answer = text;
      },
      onError: (message) => {
        error = message;
      },
    });
    if (error) {
      res.status(502).json({ detail: error });
      return;
    }
    res.json({ answer, thread_id: threadId });
  });

  app.post("/v1/chat/stream", requireAuth, async (req, res) => {
    const question = String(req.body?.question || "").trim();
    if (!question) {
      res.status(400).json({ detail: "question is required" });
      return;
    }
    const threadId = pool.resolveThreadId(req.body?.thread_id);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let closed = false;
    // 注意：不要用 req.on("close")——Express 读完 body 后就会触发，
    // 会把后续 token/done 全部吞掉，前端会一直停在「正在处理」。
    req.on("aborted", () => {
      closed = true;
    });
    res.on("close", () => {
      closed = true;
    });

    const write = (payload: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(sse(payload));
      // @ts-expect-error Node ServerResponse.flush
      res.flush?.();
    };

    // 立刻给前端反馈，避免长时间空白「正在处理」
    write({ type: "token", text: "收到，开始处理…\n" });

    const heartbeat = setInterval(() => {
      write({ type: "token", text: "…" });
    }, 12_000);

    console.log(`[agent-pi] SSE /v1/chat/stream thread=${threadId}`);
    try {
      await pool.prompt(threadId, question, {
        onToken: (text) => write({ type: "token", text }),
        onDone: (answer) =>
          write({ type: "done", thread_id: threadId, answer }),
        onError: (message) => write({ type: "error", message }),
      });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  const server = app.listen(config.port, config.host, () => {
    console.log(
      `agent-pi (Pi harness) listening on http://${config.host}:${config.port}`,
    );
    console.log(`model=${config.modelRaw}`);
  });

  const shutdown = async () => {
    console.log("shutting down agent-pi…");
    pool.dispose();
    await mcp.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
