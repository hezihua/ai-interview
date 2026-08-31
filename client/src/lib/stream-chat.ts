import { parseSseDataLine } from "@/lib/agent";

export type StreamChatResult = {
  answer: string;
  threadId: string | null;
};

export async function streamChat(options: {
  question: string;
  threadId: string | null;
  signal?: AbortSignal;
  onToken: (text: string) => void;
}): Promise<StreamChatResult> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: options.question,
      thread_id: options.threadId,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail) {
        throw new Error(data.detail);
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new Error(text || `请求失败（${response.status}）`);
  }

  if (!response.body) {
    throw new Error("浏览器未收到流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let threadId = options.threadId;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const event = parseSseDataLine(line);
        if (!event) continue;
        if (event.type === "token") {
          answer += event.text;
          options.onToken(event.text);
        } else if (event.type === "done") {
          threadId = event.thread_id;
          answer = event.answer || answer;
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    }
  }

  return { answer: answer || "(无文本回复)", threadId };
}
