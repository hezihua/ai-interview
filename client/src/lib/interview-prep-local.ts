/** 面试准备完整正文保存在浏览器 localStorage；「面试准备」页可列表查看。 */

export type LocalInterviewPrep = {
  id: string;
  applicationId: string;
  title: string;
  company: string;
  role?: string;
  markdown: string;
  updatedAt: string;
  source: "local";
};

const STORAGE_KEY = "careeros.interview_prep.v1";
const PENDING_KEY = "careeros.interview_prep.pending";

export type PendingInterviewPrep = {
  id: string;
  applicationId: string;
  title: string;
  company: string;
  role?: string;
};

function readAll(): Record<string, LocalInterviewPrep> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalInterviewPrep>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, LocalInterviewPrep>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("careeros:interview-prep-changed"));
}

export function listLocalInterviewPreps(): LocalInterviewPrep[] {
  return Object.values(readAll()).sort(
    (a, b) =>
      (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
  );
}

export function getLocalInterviewPrep(
  id: string,
): LocalInterviewPrep | null {
  return readAll()[id] || null;
}

export function saveLocalInterviewPrep(
  input: Omit<LocalInterviewPrep, "updatedAt" | "source"> & {
    updatedAt?: string;
  },
): LocalInterviewPrep {
  const entry: LocalInterviewPrep = {
    id: input.id,
    applicationId: input.applicationId || input.id,
    title: input.title,
    company: input.company || "",
    role: input.role || "",
    markdown: input.markdown.trim(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    source: "local",
  };
  const map = readAll();
  map[entry.id] = entry;
  writeAll(map);
  return entry;
}

export function removeLocalInterviewPrep(id: string) {
  const map = readAll();
  if (!(id in map)) return;
  delete map[id];
  writeAll(map);
}

export function setPendingInterviewPrep(pending: PendingInterviewPrep | null) {
  if (typeof window === "undefined") return;
  if (!pending) {
    window.sessionStorage.removeItem(PENDING_KEY);
    return;
  }
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function peekPendingInterviewPrep(): PendingInterviewPrep | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingInterviewPrep;
  } catch {
    return null;
  }
}

export function takePendingInterviewPrep(): PendingInterviewPrep | null {
  const pending = peekPendingInterviewPrep();
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(PENDING_KEY);
  }
  return pending;
}

/** 去掉流式状态提示与「去某某页看完整内容」类尾巴，保留可读正文 */
export function cleanInterviewMarkdown(text: string): string {
  return text
    .replace(/^收到，开始处理…\s*/m, "")
    .replace(/（正在调用 [^）]+…）/g, "")
    .replace(/（模型请求失败，正在重试 \d+\/\d+…）/g, "")
    .replace(/面试准备文档已成功保存[^\n]*\n?/g, "")
    .replace(/以下是面试准备的简要摘要[：:]\s*/g, "")
    .replace(/您可以通过\[[^\]]*\]\([^)]*\)查看完整内容[。.]?\s*/g, "")
    .replace(/您可以通过[^。\n]*面试准备页[^。\n]*[。.]?\s*/g, "")
    .replace(/^[….\s]+/gm, "")
    .trim();
}
