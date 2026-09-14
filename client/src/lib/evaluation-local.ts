/** 职位评估完整正文保存在浏览器 localStorage；「职位评估」页可列表查看。 */

export type LocalEvaluation = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  role?: string;
  markdown: string;
  updatedAt: string;
  source: "local";
};

const STORAGE_KEY = "careeros.evaluation.v1";
const PENDING_KEY = "careeros.evaluation.pending";

export type PendingEvaluation = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  role?: string;
};

function readAll(): Record<string, LocalEvaluation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalEvaluation>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, LocalEvaluation>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("careeros:evaluation-changed"));
}

export function listLocalEvaluations(): LocalEvaluation[] {
  return Object.values(readAll()).sort(
    (a, b) =>
      (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
  );
}

export function getLocalEvaluation(id: string): LocalEvaluation | null {
  return readAll()[id] || null;
}

export function saveLocalEvaluation(
  input: Omit<LocalEvaluation, "updatedAt" | "source"> & {
    updatedAt?: string;
  },
): LocalEvaluation {
  const entry: LocalEvaluation = {
    id: input.id,
    jobId: input.jobId || input.id,
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

export function removeLocalEvaluation(id: string) {
  const map = readAll();
  if (!(id in map)) return;
  delete map[id];
  writeAll(map);
}

export function setPendingEvaluation(pending: PendingEvaluation | null) {
  if (typeof window === "undefined") return;
  if (!pending) {
    window.sessionStorage.removeItem(PENDING_KEY);
    return;
  }
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function peekPendingEvaluation(): PendingEvaluation | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingEvaluation;
  } catch {
    return null;
  }
}

export function takePendingEvaluation(): PendingEvaluation | null {
  const pending = peekPendingEvaluation();
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(PENDING_KEY);
  }
  return pending;
}
