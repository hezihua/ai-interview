import { AGENT_API_BASE, agentAuthHeaders } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const incoming = await request.formData();
  const files = incoming.getAll("files").filter((item) => item instanceof File);
  if (files.length === 0) {
    return Response.json({ detail: "请至少上传一个文件" }, { status: 400 });
  }

  const outbound = new FormData();
  for (const file of files) {
    outbound.append("files", file, file.name);
  }

  try {
    const upstream = await fetch(`${AGENT_API_BASE}/v1/documents/extract`, {
      method: "POST",
      headers: agentAuthHeaders(),
      body: outbound,
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return Response.json(
      {
        detail: "Agent 未启动，无法解析附件",
        hint: "先运行 mcp/server.py，再运行 python server/server.py（默认 8766）",
      },
      { status: 502 },
    );
  }
}
