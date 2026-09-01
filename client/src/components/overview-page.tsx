"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader, useChatDrawer } from "@/components/workbench-shell";
import {
  fetchWorkbench,
  initialOf,
  timeAgo,
  type Overview,
} from "@/lib/workbench";

const FUNNEL_STEPS = [
  { key: "ingested", label: "已导入" },
  { key: "evaluated", label: "已评估" },
  { key: "applied", label: "已申请" },
  { key: "interview", label: "面试中" },
  { key: "offer", label: "Offer" },
] as const;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { open } = useChatDrawer();
  const router = useRouter();

  useEffect(() => {
    fetchWorkbench<Overview>("/overview")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "读取失败"));
  }, []);

  function actOn(item: Overview["pending"][number]) {
    if (item.action === "evaluate" || item.action === "view") {
      router.push(`/jobs?sel=${item.id}`);
    } else if (item.action === "draft") {
      open(`继续起草 ${item.title} 的 CV 和求职信`);
    } else {
      router.push(`/interview?sel=${item.application_id || item.id}`);
    }
  }

  const actionLabel: Record<string, string> = {
    evaluate: "去评估",
    view: "查看",
    draft: "去起草",
    interview: "准备面试",
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader
        crumb="今日进度"
        title={`${greeting()}，${data?.profile.name || "候选人"}。`}
      />

      {error ? (
        <div className="mt-8 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}。确认 FastAPI（server/server.py）已启动。
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex flex-col justify-between rounded-2xl bg-[#0d1b2a] px-7 py-7">
          <div>
            <p className="flex items-center gap-2 text-xs text-zinc-400">
              本周求职节奏
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-300">
                稳定
              </span>
            </p>
            <h2 className="mt-4 text-2xl font-semibold leading-9 tracking-tight text-zinc-50">
              把每一次机会，
              <br />
              <span className="text-teal-300">变成可执行的下一步。</span>
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              从档案到 offer，CareerOS 帮你守住事实边界，专注更值得的机会。
            </p>
          </div>
          <div className="mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
            >
              继续评估职位
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <div className="grid content-start gap-4">
          <StatCard
            label="待处理职位"
            value={pad(data?.stats.pending_jobs)}
            hint="等待你的判断"
          />
          <StatCard
            label="平均匹配度"
            value={data?.stats.avg_overall != null ? String(data.stats.avg_overall) : "—"}
            hint="来自已评估职位"
          />
          <StatCard
            label="本周申请"
            value={pad(data?.stats.applications_this_week)}
            hint={`较上周 +${Math.max(
              0,
              (data?.stats.applications_this_week ?? 0) -
                (data?.stats.applications_last_week ?? 0),
            )}`}
          />
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">你的求职漏斗</h3>
          <span className="text-xs text-zinc-500">最近 30 天</span>
        </div>
        <div className="mt-4 grid grid-cols-5 divide-x divide-white/8 rounded-2xl border border-white/8 bg-white/3">
          {FUNNEL_STEPS.map((step) => (
            <div key={step.key} className="px-2 py-5 text-center">
              <p className="text-xl font-semibold text-zinc-100">
                {pad(data?.funnel[step.key])}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{step.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">需要你处理</h3>
          <Link href="/jobs" className="text-xs text-zinc-400 hover:text-teal-200">
            查看全部 →
          </Link>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/8 bg-white/3">
          {!data || data.pending.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">
              暂无待处理事项。导入一份 JD 开始吧。
            </p>
          ) : (
            data.pending.map((item, index) => (
              <div
                key={`${item.id}-${item.badge}`}
                className={`flex items-center gap-4 px-5 py-4 ${
                  index > 0 ? "border-t border-white/6" : ""
                }`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-400/12 text-sm font-medium text-teal-200">
                  {initialOf(item.company || item.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {item.company || item.source}
                    {item.created_at ? ` · ${timeAgo(item.created_at)}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                    item.tone === "gate"
                      ? "bg-orange-400/12 text-orange-300"
                      : item.tone === "done"
                        ? "bg-teal-400/12 text-teal-200"
                        : "bg-white/8 text-zinc-300"
                  }`}
                >
                  {item.badge}
                </span>
                <button
                  type="button"
                  onClick={() => actOn(item)}
                  className="shrink-0 text-xs text-zinc-300 hover:text-teal-200"
                >
                  {actionLabel[item.action]} →
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function pad(value: number | null | undefined): string {
  return String(value ?? 0).padStart(2, "0");
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-zinc-50">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
