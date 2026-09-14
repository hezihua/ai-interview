import {
  AGENT_API_BASE,
  AGENT_CHAT_BASE,
  agentAuthHeaders,
} from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [apiRes, chatRes] = await Promise.all([
      fetch(`${AGENT_API_BASE}/health`, {
        headers: agentAuthHeaders(),
        cache: "no-store",
      }),
      fetch(`${AGENT_CHAT_BASE}/health`, {
        headers: agentAuthHeaders(),
        cache: "no-store",
      }),
    ]);

    if (!apiRes.ok || !chatRes.ok) {
      const apiText = await apiRes.text().catch(() => "");
      const chatText = await chatRes.text().catch(() => "");
      return Response.json(
        {
          status: "error",
          detail: "upstream health failed",
          api: { status: apiRes.status, body: apiText },
          chat: { status: chatRes.status, body: chatText },
          hint: `确认 workbench API (${AGENT_API_BASE}) 与 agent-pi (${AGENT_CHAT_BASE}) 均已启动`,
        },
        { status: 502 },
      );
    }

    const apiBody = (await apiRes.json()) as Record<string, unknown>;
    const chatBody = (await chatRes.json()) as Record<string, unknown>;
    return Response.json({
      status: "ok",
      model: chatBody.model,
      harness: chatBody.harness || "pi",
      api: apiBody,
      chat: chatBody,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法连接后端";
    return Response.json(
      {
        status: "error",
        detail: message,
        hint: `确认 FastAPI (${AGENT_API_BASE}) 与 agent-pi (${AGENT_CHAT_BASE}) 均已启动`,
      },
      { status: 502 },
    );
  }
}
