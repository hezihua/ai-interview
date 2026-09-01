import { AGENT_API_BASE, agentAuthHeaders } from "@/lib/agent";

export type JobSummary = {
  id: string;
  title: string;
  company: string;
  role: string;
  location: string;
  source: string;
  url: string;
  status: string;
  created_at: string;
  application_id: string;
  verdict: string | null;
  overall: number | null;
  eligibility: string | null;
  language_gate: string | null;
};

export type JobDetail = JobSummary & {
  text: string;
  evaluation: Record<string, unknown> | null;
};

export type PendingItem = JobSummary & {
  badge: string;
  tone: "todo" | "gate" | "done";
  action: "evaluate" | "view" | "draft" | "interview";
};

export type Overview = {
  profile: { name: string; headline: string };
  stats: {
    pending_jobs: number;
    avg_overall: number | null;
    applications_this_week: number;
    applications_last_week: number;
  };
  funnel: {
    ingested: number;
    evaluated: number;
    applied: number;
    interview: number;
    offer: number;
  };
  pending: PendingItem[];
};

export type ApplicationEntry = {
  id: string;
  company: string;
  role: string;
  status: string;
  job_id: string;
  deadline: string;
  notes: string;
  created_at: string;
  updated_at: string;
  docs: Record<string, boolean>;
};

export type ActivityEvent = { at: string; text: string; kind: string };

export async function fetchWorkbench<T>(path: string): Promise<T> {
  const response = await fetch(`${AGENT_API_BASE}/v1/workbench${path}`, {
    headers: agentAuthHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `读取失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

export function timeAgo(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const minutes = Math.floor((Date.now() - ts) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export function initialOf(label: string): string {
  const first = label.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

export const STATUS_LABELS: Record<string, string> = {
  drafted: "已起草",
  applied: "已投递",
  interview: "面试中",
  offered: "Offer",
  hired: "已录用",
  rejected: "已拒绝",
  withdrawn: "已撤回",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status || "未记录";
}
