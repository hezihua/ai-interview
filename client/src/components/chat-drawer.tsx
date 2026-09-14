"use client";

import { LoaderCircle, Paperclip, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarkdownMessage } from "@/components/markdown-message";
import {
  cleanInterviewMarkdown,
  peekPendingInterviewPrep,
  saveLocalInterviewPrep,
  setPendingInterviewPrep,
  takePendingInterviewPrep,
} from "@/lib/interview-prep-local";
import { streamChat } from "@/lib/stream-chat";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  pending?: boolean;
  error?: boolean;
};

type ExtractedDocument = { filename: string; text: string };

function newId() {
  return crypto.randomUUID();
}

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

export function ChatDrawer({
  open,
  initialText,
  autoSend = false,
  autoSendKey = 0,
  freshThreadKey = 0,
  onClose,
}: {
  open: boolean;
  initialText: string;
  autoSend?: boolean;
  autoSendKey?: number;
  freshThreadKey?: number;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const lastAutoSendKeyRef = useRef(0);
  const lastFreshThreadKeyRef = useRef(0);

  useEffect(() => {
    if (!freshThreadKey || lastFreshThreadKeyRef.current === freshThreadKey) {
      return;
    }
    lastFreshThreadKeyRef.current = freshThreadKey;
    setThreadId(null);
  }, [freshThreadKey]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (open) setInput(initialText);
  }, [open, initialText]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  async function sendQuestion(raw: string, attachmentsOverride?: File[]) {
    const question = raw.trim();
    const attachments = attachmentsOverride ?? files;
    if ((!question && attachments.length === 0) || busyRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const visible = [
      question,
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
      if (!payload.trim()) throw new Error("没有可发送的内容");
      const interviewPending = peekPendingInterviewPrep();
      const result = await streamChat({
        question: payload,
        threadId: interviewPending ? null : threadId,
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
      const cleaned = cleanInterviewMarkdown(result.answer || "");
      const pending = interviewPending || peekPendingInterviewPrep();
      if (pending && cleaned.length > 40) {
        takePendingInterviewPrep();
        saveLocalInterviewPrep({
          id: pending.id,
          applicationId: pending.applicationId || pending.id,
          title: pending.title,
          company: pending.company,
          role: pending.role,
          markdown: cleaned,
        });
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  cleaned || result.answer || message.content || "(无文本回复)",
                pending: false,
              }
            : message,
        ),
      );
    } catch (error) {
      setPendingInterviewPrep(null);
      if (controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content || "已取消",
                  pending: false,
                }
              : message,
          ),
        );
        return;
      }
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

  useEffect(() => {
    if (!open || !autoSend || !autoSendKey) return;
    if (lastAutoSendKeyRef.current === autoSendKey) return;
    const text = initialText.trim();
    if (!text) return;
    lastAutoSendKeyRef.current = autoSendKey;
    void sendQuestion(text, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on explicit autoSendKey bumps
  }, [open, autoSend, autoSendKey, initialText]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-[#0b1420] shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Agent 对话</h2>
            <p className="text-[11px] text-zinc-500">
              起草、导入 JD、追问都从这里走
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-300 hover:bg-white/10"
            aria-label="关闭对话"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="chat-thread min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-xs leading-5 text-zinc-400">
              这里是全局对话入口：粘贴 JD 收录评估、起草 CV / 求职信、准备面试、记录结果。
              也可以上传 PDF / Word / Markdown。
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`min-w-0 max-w-full overflow-hidden rounded-xl px-3.5 py-2.5 ${
                    message.role === "user"
                      ? "bg-teal-300 text-zinc-950"
                      : "border border-white/8 bg-[#121c2b] text-zinc-100"
                  } ${message.error ? "border-red-400/30 bg-red-500/10 text-red-100" : ""}`}
                >
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  ) : message.pending && !message.content ? (
                    <p className="flex items-center gap-2 text-sm text-zinc-400">
                      <LoaderCircle className="size-4 animate-spin" />
                      正在处理…
                    </p>
                  ) : (
                    <MarkdownMessage content={message.content || "(无文本回复)"} />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-white/8 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendQuestion(input);
          }}
        >
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((file) => (
                <span
                  key={`${file.name}-${file.size}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200"
                >
                  {file.name}
                  <button
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    onClick={() => setFiles((prev) => prev.filter((item) => item !== file))}
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
            placeholder="粘贴 JD、起草申请、追问…"
            disabled={busy}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-[#101826] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-teal-300/40"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
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
              <span>最多 3 个</span>
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
      </aside>
    </>
  );
}
