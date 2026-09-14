import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../..");

loadEnv({ path: resolve(REPO_ROOT, ".env") });

// Cursor / 部分环境会注入坏掉的 HTTPS_PROXY，导致 OpenRouter Connection error。
// 本地开发默认直连；若确实需要代理，设 AGENT_PI_KEEP_PROXY=1。
if (process.env.AGENT_PI_KEEP_PROXY !== "1") {
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    if (process.env[key]) delete process.env[key];
  }
}

/** Pi provider → 环境变量名（国内直连优先） */
const PROVIDER_API_KEY_ENV: Record<string, string[]> = {
  openrouter: ["OPENROUTER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  zai: ["ZAI_API_KEY", "ZHIPU_API_KEY"],
  moonshotai: ["MOONSHOT_API_KEY"],
  "moonshotai-cn": ["MOONSHOT_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  "minimax-cn": ["MINIMAX_CN_API_KEY", "MINIMAX_API_KEY"],
};

export type AppConfig = {
  modelRaw: string;
  provider: string;
  modelId: string;
  apiKey: string;
  mcpUrl: string;
  mcpAuthToken: string;
  apiAuthToken: string;
  host: string;
  port: number;
};

function parseModel(raw: string): { provider: string; modelId: string } {
  const value = raw.trim();
  const idx = value.indexOf(":");
  if (idx <= 0) {
    return { provider: "openrouter", modelId: value || "deepseek/deepseek-chat" };
  }
  return {
    provider: value.slice(0, idx).trim(),
    modelId: value.slice(idx + 1).trim(),
  };
}

function resolveApiKey(provider: string): string {
  const envs = PROVIDER_API_KEY_ENV[provider];
  if (!envs) {
    throw new Error(
      `Unsupported MODEL provider "${provider}". ` +
        `支持: ${Object.keys(PROVIDER_API_KEY_ENV).join(", ")}`,
    );
  }
  for (const name of envs) {
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  throw new Error(
    `Missing API key for provider "${provider}". Set one of: ${envs.join(", ")}`,
  );
}

export function loadConfig(): AppConfig {
  const modelRaw = (
    process.env.MODEL || "openrouter:deepseek/deepseek-chat"
  ).trim();
  const { provider, modelId } = parseModel(modelRaw);
  const apiKey = resolveApiKey(provider);
  const mcpAuthToken = (
    process.env.MCP_AUTH_TOKEN ||
    process.env.INFINI_SQL_MCP_TOKEN ||
    ""
  ).trim();
  if (!mcpAuthToken) {
    throw new Error("MCP_AUTH_TOKEN must be set in the repo root .env");
  }
  const port = Number((process.env.AGENT_PI_PORT || "8767").trim());
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("AGENT_PI_PORT must be a positive integer");
  }
  return {
    modelRaw,
    provider,
    modelId,
    apiKey,
    mcpUrl: (process.env.MCP_URL || "http://127.0.0.1:8765/mcp").trim(),
    mcpAuthToken,
    apiAuthToken: (process.env.API_AUTH_TOKEN || "").trim(),
    host: (process.env.AGENT_PI_HOST || "0.0.0.0").trim(),
    port,
  };
}
