import { AGENT_API_BASE, agentAuthHeaders } from "@/lib/agent";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const url = new URL(request.url);
  const target = `${AGENT_API_BASE}/v1/workbench/${suffix}${url.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: {
        Accept: request.headers.get("accept") || "application/json",
        ...agentAuthHeaders(),
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法连接 Workbench API";
    return Response.json(
      {
        detail: message,
        hint: `确认 FastAPI 已在 ${AGENT_API_BASE} 运行（server/server.py）`,
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

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}
