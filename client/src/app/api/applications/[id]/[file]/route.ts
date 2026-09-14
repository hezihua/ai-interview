import { AGENT_API_BASE, agentAuthHeaders } from "@/lib/agent";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; file: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id, file } = await context.params;
  const target = `${AGENT_API_BASE}/v1/applications/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        Accept: "application/json",
        ...agentAuthHeaders(),
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法连接 Workbench API";
    return Response.json(
      {
        detail: message,
        hint: `确认 FastAPI 已在 ${AGENT_API_BASE} 运行`,
      },
      { status: 502 },
    );
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
}
