"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase, LoaderCircle, Paperclip, Plus, SendHorizontal, Sparkles, X } from "lucide-react";

import { MarkdownMessage } from "@/components/markdown-message";
import { inferSopIndex, SopRail, SopStrip } from "@/components/sop-rail";
import type { HealthResponse } from "@/lib/agent";
import { streamChat } from "@/lib/stream-chat";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  pending?: boolean;
  error?: boolean;
};

const SUGGESTIONS = [
  "先读档案，告诉我还缺哪些信息",
  "列出我已收录的岗位",
  "评估下面这份 JD：\n",
  "帮我准备最近一次申请的面试",
];

function newId() {
  return crypto.randomUUID();
}

type ExtractedDocument = {
  filename: string;
  text: string;
};

async function extractDocuments(
  attachments: File[],
  signal?: AbortSignal,
): Promise<ExtractedDocument[]> {
  const form = new FormData();
  for (const file of attachments) {
    form.append("files", file, file.name);
  }
  const response = await fetch("/api/documents/extract", {
    method: "POST",
    body: form,
    signal,
  });
  const payload = (await response.json()) as {
    detail?: string;
    hint?: string;
    documents?: ExtractedDocument[];
  };
  if (!response.ok) {
    const detail = payload.detail || `文件解析失败（${response.status}）`;
    throw new Error(payload.hint ? `${detail}。${payload.hint}` : detail);
  }
  return payload.documents ?? [];
}

function buildQuestionWithFiles(
  question: string,
  documents: ExtractedDocument[],
): string {
  const blocks = documents.map(
    (doc) => `--- 附件 ${doc.filename} ---\n${doc.text}`,
  );
  const instruction =
    question.trim() ||
    "请阅读附件并处理：简历则整理进档案，再总结关键经历与缺口；JD 则收录并评估。不要只回复写入成功。";
  return `${instruction}\n\n${blocks.join("\n\n")}`;
}

export function ChatPortal() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json()) as HealthResponse;
        if (cancelled) return;
        if (!response.ok) {
          setHealthError(data.detail || "Agent 不可用");
          setHealth(null);
          return;
        }
        setHealth(data);
        setHealthError(null);
      } catch (error) {
        if (cancelled) return;
        setHealthError(error instanceof Error ? error.message : "探活失败");
        setHealth(null);
      }
    }
    void loadHealth();
    const timer = window.setInterval(() => void loadHealth(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const online = health?.status === "ok";

  async function sendQuestion(raw: string, extraFiles: File[] = files) {
    const question = raw.trim();
    const attachments = extraFiles;
    if ((!question && attachments.length === 0) || busy) return;
    if (!online) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content:
            "Agent 离线，无法发送或解析附件。请先启动 mcp/server.py，再启动 python server/server.py。",
          error: true,
        },
      ]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const visible = [
      question || "请阅读附件，整理进档案并总结给我。",
      attachments.length
        ? `附件：${attachments.map((file) => file.name).join("、")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: visible },
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setFiles([]);
    setBusy(true);

    try {
      let payload = question;
      if (attachments.length) {
        const extracted = await extractDocuments(attachments, controller.signal);
        payload = buildQuestionWithFiles(question, extracted);
      }
      if (!payload.trim()) {
        throw new Error("没有可发送的内容");
      }
      const result = await streamChat({
        question: payload,
        threadId,
        signal: controller.signal,
        onToken(text) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + text, pending: true }
                : message,
            ),
          );
        },
      });
      setThreadId(result.threadId);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: result.answer, pending: false }
            : message,
        ),
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const detail =
        error instanceof Error ? error.message : "请求失败，请稍后重试";
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: detail, pending: false, error: true }
            : message,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function resetConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setThreadId(null);
    setInput("");
    setFiles([]);
    setBusy(false);
  }

  const sopIndex = inferSopIndex(messages.map((message) => message.content));

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(1200px_circle_at_10%_-10%,rgba(45,212,191,0.12),transparent_45%),radial-gradient(900px_circle_at_90%_0%,rgba(56,189,248,0.08),transparent_40%),linear-gradient(180deg,#071018_0%,#0b1220_48%,#0a1018_100%)]">
      <header className="sticky top-0 z-10 border-b border-white/8 bg-[#071018]/80 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-400/10 text-teal-200">
              <Briefcase className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-zinc-50">
                求职助手
              </h1>
              <p className="text-xs text-zinc-400">
                档案 · 评 JD · 起草申请 · 面试准备
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs ${
                online ? "text-teal-200" : "text-amber-200"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  online ? "bg-teal-300" : "bg-amber-300"
                }`}
              />
              {online ? "Agent 在线" : healthError ? "Agent 离线" : "检测中"}
            </span>
            {health?.model ? (
              <span className="hidden max-w-56 truncate text-xs text-zinc-500 sm:inline">
                {health.model}
              </span>
            ) : null}
            <button
              type="button"
              onClick={resetConversation}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
            >
              <Plus className="size-3.5" />
              新对话
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-x-clip">
        <div className="hidden min-h-0 shrink-0 md:flex">
          <SopRail currentIndex={sopIndex} />
        </div>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip">
          <SopStrip currentIndex={sopIndex} />
          <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-clip px-5 pb-6 pt-6 sm:px-8 md:w-2/3">
        <div className="chat-thread min-h-0 flex-1">
          {messages.length === 0 ? (
            <EmptyState onPick={sendQuestion} />
          ) : (
            <div className="min-w-0 space-y-5 pb-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form
          className="mt-auto min-w-0 max-w-full rounded-2xl border border-white/10 bg-[#101826]/90 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur"
          onSubmit={(event) => {
            event.preventDefault();
            void sendQuestion(input);
          }}
        >
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {files.map((file) => (
                <span
                  key={`${file.name}-${file.size}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200"
                >
                  {file.name}
                  <button
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    onClick={() =>
                      setFiles((prev) => prev.filter((item) => item !== file))
                    }
                    className="text-zinc-400 hover:text-zinc-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendQuestion(input);
              }
            }}
            placeholder="完善档案、粘贴 JD，或上传 PDF / Word / Markdown"
            disabled={busy}
            rows={3}
            className="min-h-20 min-w-0 w-full max-w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-500 [field-sizing:fixed]"
          />
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                multiple
                className="hidden"
                onChange={(event) => {
                  const next = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  setFiles((prev) => [...prev, ...next].slice(0, 3));
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                <Paperclip className="size-3.5" />
                附件
              </button>
              <span>
                PDF / .docx / .md · 最多 3 个
                {threadId ? " · 已记住本轮" : ""}
              </span>
            </div>
            <button
              type="submit"
              disabled={busy || (!input.trim() && files.length === 0)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-300 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-teal-200 disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
              发送
            </button>
          </div>
        </form>
          </div>
        </main>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-2 pb-4 pt-2 text-left">
      <div className="mb-4 flex size-12 items-center justify-center rounded-3xl border border-teal-300/20 bg-teal-400/10 text-teal-200">
        <Sparkles className="size-5" />
      </div>
      <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-50">
        按 SOP 往下走
      </h2>
      <p className="mt-2 max-w-xl text-center text-sm leading-6 text-zinc-400">
        左侧（窄屏在上方）会一直显示流程和当前步骤。同一轮记住上下文；Enter
        发送，Shift+Enter 换行。也可以先上传简历，或点下面的句子。
      </p>

      <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-teal-300/30 hover:bg-teal-400/8"
          >
            {suggestion.trim()}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-full overflow-hidden rounded-2xl px-4 py-3 ${
          isUser ? "w-fit max-w-[min(100%,28rem)]" : "w-full"
        } ${
          isUser
            ? "bg-teal-300 text-zinc-950"
            : "border border-white/8 bg-[#121c2b] text-zinc-100"
        } ${message.error ? "border-red-400/30 bg-red-500/10 text-red-100" : ""}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-[15px] leading-7">
            {message.content}
          </p>
        ) : message.content ? (
          <MarkdownMessage content={message.content} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <LoaderCircle className="size-4 animate-spin" />
            正在处理…
          </p>
        )}
      </div>
    </div>
  );
}
