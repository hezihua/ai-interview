import { getModel, type Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig } from "./config.js";
import { REPO_ROOT } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export type StreamHandlers = {
  onToken: (text: string) => void;
  onDone: (answer: string) => void;
  onError: (message: string) => void;
};

function resolveModel(config: AppConfig): Model<any> {
  const model = getModel(config.provider as any, config.modelId as any);
  if (!model) {
    throw new Error(
      `Model not found: ${config.provider}:${config.modelId}. Check MODEL in .env`,
    );
  }
  return model;
}

function contentToText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (block && typeof block === "object") {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && b.text) parts.push(b.text);
    }
  }
  return parts.join("");
}

function lastAssistantText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as {
      role?: string;
      content?: unknown;
      errorMessage?: string;
      stopReason?: string;
    };
    if (msg?.role !== "assistant") continue;
    const text = contentToText(msg.content).trim();
    if (text) return text;
    if (msg.errorMessage) return "";
  }
  return "";
}

function lastAssistantError(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as {
      role?: string;
      errorMessage?: string;
      stopReason?: string;
    };
    if (msg?.role !== "assistant") continue;
    if (msg.stopReason === "error" && msg.errorMessage) {
      return msg.errorMessage;
    }
  }
  return null;
}

function isStatusOnlyText(text: string): boolean {
  const stripped = text
    .replace(/（正在调用 [^）]+…）/g, "")
    .replace(/（模型请求失败，正在重试 \d+\/\d+…）/g, "")
    .replace(/[….\s]/g, "");
  return stripped.length === 0;
}

export class SessionPool {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly model: Model<any>;
  private readonly authStorage: AuthStorage;
  private readonly modelRegistry: ModelRegistry;
  private readonly agentDir: string;

  constructor(
    private readonly config: AppConfig,
    private readonly customTools: ToolDefinition[],
  ) {
    this.model = resolveModel(config);
    this.authStorage = AuthStorage.inMemory();
    this.authStorage.setRuntimeApiKey(config.provider, config.apiKey);
    this.modelRegistry = ModelRegistry.create(this.authStorage);
    this.agentDir = resolve(REPO_ROOT, ".dev/pi-agent");
    mkdirSync(this.agentDir, { recursive: true });
  }

  get modelLabel(): string {
    return this.config.modelRaw;
  }

  resolveThreadId(threadId?: string | null): string {
    const value = (threadId || "").trim();
    return value || randomUUID();
  }

  async getOrCreate(threadId: string): Promise<AgentSession> {
    const existing = this.sessions.get(threadId);
    if (existing) return existing;

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 2 },
    });
    const loader = new DefaultResourceLoader({
      cwd: REPO_ROOT,
      agentDir: this.agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: SYSTEM_PROMPT,
    });
    await loader.reload();

    const toolNames = this.customTools.map((t) => t.name);
    const { session } = await createAgentSession({
      cwd: REPO_ROOT,
      agentDir: this.agentDir,
      model: this.model,
      thinkingLevel: "off",
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      noTools: "builtin",
      tools: toolNames,
      customTools: this.customTools,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      settingsManager,
    });

    this.sessions.set(threadId, session);
    return session;
  }

  async prompt(
    threadId: string,
    question: string,
    handlers: StreamHandlers,
  ): Promise<void> {
    const session = await this.getOrCreate(threadId);
    const parts: string[] = [];
    let streamed = false;
    let failedMessage: string | null = null;
    let retrying = false;
    const startedAt = Date.now();

    const unsubscribe = session.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        const tip = `\n（正在调用 ${event.toolName}…）\n`;
        streamed = true;
        parts.push(tip);
        handlers.onToken(tip);
      } else if (event.type === "message_update") {
        const ame = event.assistantMessageEvent;
        if (ame?.type === "text_delta" && typeof ame.delta === "string") {
          streamed = true;
          parts.push(ame.delta);
          handlers.onToken(ame.delta);
        }
      } else if (event.type === "auto_retry_start") {
        retrying = true;
        console.warn(
          `[agent-pi] model retry ${event.attempt}/${event.maxAttempts}`,
        );
        const tip = `\n（模型请求失败，正在重试 ${event.attempt}/${event.maxAttempts}…）\n`;
        streamed = true;
        parts.push(tip);
        handlers.onToken(tip);
      } else if (event.type === "auto_retry_end") {
        retrying = false;
        if (!event.success) {
          failedMessage = event.finalError || "model request failed";
          console.error(`[agent-pi] model retries exhausted:`, failedMessage);
        }
      } else if (event.type === "agent_end") {
        if (!streamed && Array.isArray(event.messages)) {
          const text = lastAssistantText(event.messages);
          if (text) parts.push(text);
        }
      }
    });

    const timeoutMs = Number(process.env.AGENT_PI_TIMEOUT_MS || 180_000);
    const timer = setTimeout(() => {
      console.error(
        `[agent-pi] prompt timeout after ${timeoutMs}ms thread=${threadId}`,
      );
      failedMessage = `请求超时（>${Math.round(timeoutMs / 1000)}s）。可能是模型网络不稳定或工具调用过慢，请重试。`;
      void session.abort();
    }, timeoutMs);

    try {
      console.log(
        `[agent-pi] prompt start thread=${threadId} q=${question.slice(0, 80)}`,
      );
      await session.prompt(question);
      const msgs = session.messages as unknown[];
      const fromMessages = lastAssistantText(msgs);
      const modelError =
        failedMessage ||
        lastAssistantError(msgs) ||
        (retrying ? "模型请求中断（重试未完成）" : null);
      if (modelError) {
        handlers.onError(modelError);
        console.error(
          `[agent-pi] prompt error thread=${threadId}`,
          modelError,
        );
        return;
      }
      // 最终答案优先用 messages 里的助手正文，避免把「正在重试」提示当成成功回复
      const streamedText = parts.join("").trim();
      const answer = (fromMessages || streamedText).trim();
      if (!answer || (!fromMessages && isStatusOnlyText(streamedText))) {
        const sawTools = /正在调用/.test(streamedText);
        handlers.onError(
          sawTools
            ? "模型调用了工具但没有输出正文。请刷新「面试准备」页确认是否已保存；若仍没有，请再试一次。"
            : "模型未返回内容，请稍后重试（避免连续点击）。",
        );
        console.error(
          `[agent-pi] empty answer thread=${threadId} streamed=${streamedText.slice(0, 200)}`,
        );
        return;
      }
      if (!streamed) {
        handlers.onToken(answer);
      }
      handlers.onDone(answer);
      console.log(
        `[agent-pi] prompt done thread=${threadId} ${Date.now() - startedAt}ms`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const timedOut = Date.now() - startedAt >= timeoutMs - 50;
      handlers.onError(
        timedOut
          ? `请求超时（>${Math.round(timeoutMs / 1000)}s）。可能是 OpenRouter 网络不通或模型无响应。`
          : message,
      );
      console.error(`[agent-pi] prompt error thread=${threadId}`, message);
    } finally {
      clearTimeout(timer);
      unsubscribe();
    }
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      try {
        session.dispose();
      } catch {
        /* ignore */
      }
    }
    this.sessions.clear();
  }
}
