"use client";

import { ArrowRight, ExternalLink, MapPin, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { MarkdownMessage } from "@/components/markdown-message";
import { PageHeader, useChatDrawer } from "@/components/workbench-shell";
import {
  fetchWorkbench,
  initialOf,
  timeAgo,
  type JobDetail,
  type JobSummary,
} from "@/lib/workbench";

function JobsPageInner() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [tab, setTab] = useState<"evaluation" | "raw">("evaluation");
  const searchParams = useSearchParams();
  const { open } = useChatDrawer();

  useEffect(() => {
    fetchWorkbench<{ jobs: JobSummary[] }>("/jobs")
      .then((data) => {
        setJobs(data.jobs);
        const fromUrl = searchParams.get("sel");
        const first = fromUrl && data.jobs.some((j) => j.id === fromUrl)
          ? fromUrl
          : (data.jobs[0]?.id ?? null);
        setSelectedId(first);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "读取失败"));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    fetchWorkbench<{ job: JobDetail }>(`/jobs/${selectedId}`)
      .then((data) => {
        if (!cancelled) {
          setDetail(data.job);
          setTab(data.job.evaluation ? "evaluation" : "raw");
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const gateFailed =
    detail?.evaluation &&
    ["eligibility", "language_gate"].some(
      (key) => String(detail.evaluation?.[key] || "").toUpperCase() === "FAIL",
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader crumb="职位评估" title="求职工作台" />

      {error ? (
        <div className="mt-8 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}。确认 FastAPI（server/server.py）已启动。
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-2xl border border-white/8 bg-white/3 p-3">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs text-zinc-500">{jobs.length} 个职位</span>
            <span className="text-xs text-zinc-500">全部</span>
          </div>
          <ul className="mt-1 space-y-1">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                    selectedId === job.id
                      ? "bg-teal-400/10"
                      : "hover:bg-white/4"
                  }`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-400/12 text-sm font-medium text-teal-200">
                    {initialOf(job.company || job.title)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                        {job.title}
                      </span>
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          job.status === "ingested"
                            ? "bg-orange-400"
                            : job.status === "evaluated"
                              ? "bg-teal-300"
                              : "bg-zinc-500"
                        }`}
                      />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">
                      {job.company || job.source}
                      {job.created_at ? ` · ${timeAgo(job.created_at)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {jobs.length === 0 ? (
              <li className="px-3 py-4 text-xs text-zinc-500">
                还没有职位。点右上角「导入 JD」。
              </li>
            ) : null}
          </ul>
        </aside>

        <section className="min-w-0">
          {!detail ? (
            <div className="rounded-2xl border border-white/8 bg-white/3 px-6 py-16 text-center text-sm text-zinc-500">
              选择左侧职位查看评估。
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/3">
              <div className="flex items-start justify-between gap-4 px-6 pt-6">
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-400/12 text-base font-medium text-teal-200">
                    {initialOf(detail.company || detail.title)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                      {detail.company || detail.source}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">
                      {detail.title}
                    </h2>
                    <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      {detail.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {detail.location}
                        </span>
                      ) : null}
                      {detail.url ? (
                        <a
                          href={detail.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-teal-200"
                        >
                          <ExternalLink className="size-3.5" />
                          原始链接
                        </a>
                      ) : null}
                      <span>状态：{detail.status}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-6 border-b border-white/8 px-6">
                {(
                  [
                    ["evaluation", "评估"],
                    ["raw", "原始 JD"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`-mb-px border-b-2 pb-2.5 text-sm ${
                      tab === key
                        ? "border-teal-300 text-teal-200"
                        : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-6 py-6">
                {tab === "evaluation" ? (
                  detail.evaluation ? (
                    <div className="space-y-5">
                      {gateFailed ? (
                        <div className="rounded-xl border border-orange-400/25 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
                          闸门未通过（Eligibility / Language）。按 SOP 不建议继续起草。
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {(
                          [
                            ["technical", "技能"],
                            ["experience", "经验"],
                            ["behavioral", "行为"],
                            ["career", "职业"],
                            ["overall", "综合"],
                          ] as const
                        ).map(([key, label]) => (
                          <div
                            key={key}
                            className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-center"
                          >
                            <p className="text-lg font-semibold text-zinc-50">
                              {String(detail.evaluation?.[key] ?? "—")}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">{label}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-zinc-300">
                        结论：{String(detail.evaluation?.verdict || "—")}
                      </p>
                      {detail.evaluation?.notes ? (
                        <MarkdownMessage
                          content={String(detail.evaluation.notes)}
                        />
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            open(`继续起草 ${detail.title} 的 CV 和求职信`)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
                        >
                          起草申请
                          <ArrowRight className="size-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-10 text-center">
                      <Sparkles className="size-5 text-teal-300" />
                      <p className="mt-4 text-sm font-medium text-zinc-200">
                        准备好开始了吗？
                      </p>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                        先通过 Eligibility 和 Language Gate，再进行五维匹配度分析。
                      </p>
                      <button
                        type="button"
                        onClick={() => open(`评估这份 JD（job_id: ${detail.id}）`)}
                        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
                      >
                        开始 AI 评估
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  )
                ) : (
                  <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-[#0d1520] px-4 py-4 text-xs leading-5 text-zinc-300">
                    {detail.text || "（无原文）"}
                  </pre>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsPageInner />
    </Suspense>
  );
}
