"use client";

import {
  ArrowRight,
  ExternalLink,
  FileText,
  MapPin,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { PageHeader, useChatDrawer } from "@/components/workbench-shell";
import {
  listLocalEvaluations,
  removeLocalEvaluation,
  type LocalEvaluation,
} from "@/lib/evaluation-local";
import {
  fetchWorkbench,
  initialOf,
  timeAgo,
  type JobSummary,
} from "@/lib/workbench";

function JobsPageInner() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [localEvals, setLocalEvals] = useState<LocalEvaluation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const searchParams = useSearchParams();
  const { open } = useChatDrawer();

  function refreshLocal() {
    setLocalEvals(listLocalEvaluations());
  }

  useEffect(() => {
    refreshLocal();
    const onChange = () => refreshLocal();
    window.addEventListener("careeros:evaluation-changed", onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener("careeros:evaluation-changed", onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);

  useEffect(() => {
    fetchWorkbench<{ jobs: JobSummary[] }>("/jobs")
      .then((data) => {
        setJobs(data.jobs);
        const fromUrl = searchParams.get("sel");
        const preferred = data.jobs.find((job) => job.id === fromUrl);
        setSelectedId((prev) => {
          if (preferred?.id) return preferred.id;
          if (prev && data.jobs.some((job) => job.id === prev)) return prev;
          return data.jobs[0]?.id || "";
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "读取失败"));
  }, [searchParams]);

  const pendingJobs = useMemo(() => {
    const done = new Set(
      localEvals.flatMap((item) => [item.id, item.jobId]),
    );
    return jobs.filter((job) => !done.has(job.id));
  }, [jobs, localEvals]);

  const current = useMemo(
    () =>
      pendingJobs.find((job) => job.id === selectedId) || pendingJobs[0] || null,
    [pendingJobs, selectedId],
  );

  function startEvaluation(job: JobSummary) {
    open(
      `请评估岗位「${job.title}」（job_id: ${job.id}）。

硬性要求：
1. 先 get_framework("evaluation") + get_profile + get_job("${job.id}")
2. 不要调用 record_evaluation，不要写文件或给页面链接
3. 在回复中直接输出完整 Markdown 评估，至少包含：
## 闸门（Eligibility / Language / 地点）
## 五维评分（技能 / 经验 / 行为 / 职业 / 综合）
## 匹配要点与缺口
## 结论与下一步建议
闸门 FAIL 时明确建议跳过起草。`,
      {
        autoSend: true,
        evaluation: {
          id: job.id,
          jobId: job.id,
          title: job.title,
          company: job.company,
          role: job.role,
        },
      },
    );
  }

  function deleteEvaluation(item: LocalEvaluation) {
    if (
      !window.confirm(`确定删除「${item.title}」的评估结果？删除后可重新评估。`)
    ) {
      return;
    }
    removeLocalEvaluation(item.id);
    refreshLocal();
    setSelectedId(item.jobId || item.id);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader crumb="职位评估" title="求职工作台" />

      {error ? (
        <div className="mt-8 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}。确认后端已启动（`./scripts/dev.sh start`）。
        </div>
      ) : null}

      <div className="mt-8 space-y-8">
        <section className="rounded-2xl border border-white/8 bg-white/3 px-6 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">评估结果</h2>
              <p className="mt-1 text-sm text-zinc-500">
                保存在本机 localStorage；对话追问完毕后手动保存。
              </p>
            </div>
            <span className="text-xs text-zinc-500">{localEvals.length} 份结果</span>
          </div>

          {localEvals.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-black/10 px-5 py-8 text-center">
              <FileText className="mx-auto size-5 text-zinc-500" />
              <p className="mt-3 text-sm font-medium text-zinc-200">
                还没有评估结果
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                在下方开始 AI 评估，追问完后点「保存评估结果」。
              </p>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-white/6">
              {localEvals.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-4 py-4 first:pt-2 last:pb-0"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-400/12 text-sm font-medium text-teal-200">
                    {initialOf(item.company || item.title)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {[item.company, item.role].filter(Boolean).join(" · ") ||
                        "评估结果"}
                      {item.updatedAt
                        ? ` · 更新于 ${timeAgo(item.updatedAt)}`
                        : ""}
                      {" · 本机"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => deleteEvaluation(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Trash2 className="size-4" />
                      删除
                    </button>
                    <Link
                      href={`/jobs/local/${encodeURIComponent(item.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-3.5 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
                    >
                      查看完整内容
                      <ArrowRight className="size-4" />
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/3 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                开始新的评估
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                选择尚未保存评估的岗位；完整结果在对话中生成，手动保存到上方列表。
              </p>
            </div>
            {pendingJobs.length > 0 ? (
              <select
                value={current?.id || ""}
                onChange={(event) => setSelectedId(event.target.value)}
                className="max-w-md rounded-lg border border-white/10 bg-[#101826] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-teal-300/40"
              >
                {pendingJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col items-center py-6 text-center">
            {jobs.length === 0 ? (
              <p className="text-sm text-zinc-500">
                还没有职位。点右上角「导入 JD」。
              </p>
            ) : pendingJobs.length === 0 ? (
              <p className="text-sm text-zinc-500">
                当前岗位都已有本机评估。删除上方结果后可重新评估。
              </p>
            ) : current ? (
              <>
                <p className="text-sm font-medium text-zinc-200">{current.title}</p>
                <p className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-500">
                  {current.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {current.location}
                    </span>
                  ) : null}
                  {current.url ? (
                    <a
                      href={current.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-teal-200"
                    >
                      <ExternalLink className="size-3.5" />
                      原始链接
                    </a>
                  ) : null}
                  <span>{current.company || current.source}</span>
                </p>
                <button
                  type="button"
                  onClick={() => startEvaluation(current)}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
                >
                  开始 AI 评估
                  <ArrowRight className="size-4" />
                </button>
              </>
            ) : null}
          </div>
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
