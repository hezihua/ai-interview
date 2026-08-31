export const AGENT_API_BASE =
  process.env.AGENT_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8766";

export function agentAuthHeaders(): HeadersInit {
  const token = process.env.AGENT_API_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type ChatRequest = {
  question: string;
  thread_id?: string | null;
};

export type HealthResponse = {
  status: string;
  model?: string;
  detail?: string;
};

export type StreamTokenEvent = {
  type: "token";
  text: string;
};

export type StreamDoneEvent = {
  type: "done";
  thread_id: string;
  answer: string;
};

export type StreamErrorEvent = {
  type: "error";
  message: string;
};

export type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;

export function parseSseDataLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload) return null;
  return JSON.parse(payload) as StreamEvent;
}
