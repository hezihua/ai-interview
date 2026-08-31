import { AGENT_API_BASE, agentAuthHeaders } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const upstream = await fetch(`${AGENT_API_BASE}/health`, {
      headers: agentAuthHeaders(),
      cache: "no-store",
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法连接 Agent";
    return Response.json(
      {
        status: "error",
        detail: message,
        hint: `确认 FastAPI 已在 ${AGENT_API_BASE} 运行（python server/server.py）`,
      },
      { status: 502 },
    );
  }
}
