import {
  AGENT_CHAT_BASE,
  agentAuthHeaders,
  type ChatRequest,
} from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return Response.json({ detail: "question is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_CHAT_BASE}/v1/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...agentAuthHeaders(),
      },
      body: JSON.stringify({
        question,
        thread_id: body.thread_id || undefined,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法连接 Agent";
    return Response.json(
      {
        detail: message,
        hint: `确认 agent-pi 已在 ${AGENT_CHAT_BASE} 运行`,
      },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    return new Response(detail || "Upstream chat stream failed", {
      status: upstream.status || 502,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
