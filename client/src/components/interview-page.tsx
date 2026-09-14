"use client";

import { ArrowRight, FileText, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { PageHeader, useChatDrawer } from "@/components/workbench-shell";
import {
  listLocalInterviewPreps,
  type LocalInterviewPrep,
} from "@/lib/interview-prep-local";
import {
  fetchWorkbench,
  initialOf,
  timeAgo,
  type ApplicationEntry,
  type JobSummary,
} from "@/lib/workbench";

type Target = {
  id: string;
  title: string;
  company: string;
  role: string;
  applicationId: string | null;
};

function titleOf(item: { title: string; company: string; role: string; id: string }) {
  return (
    item.title ||
    [item.company, item.role].filter(Boolean).join(" · ") ||
    item.id
  );
}

function InterviewPageInner() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [localPreps, setLocalPreps] = useState<LocalInterviewPrep[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { open } = useChatDrawer();
  const firstLoad = useRef(true);

  function refreshLocal() {
    setLocalPreps(listLocalInterviewPreps());
  }

  useEffect(() => {
    refreshLocal();
    const onChange = () => refreshLocal();
    window.addEventListener("careeros:interview-prep-changed", onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener("careeros:interview-prep-changed", onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (firstLoad.current) setLoading(true);
      try {
        const [jobData, appData] = await Promise.all([
          fetchWorkbench<{ jobs: JobSummary[] }>("/jobs"),
          fetchWorkbench<{ applications: ApplicationEntry[] }>("/applications"),
        ]);
        if (cancelled) return;
        const appsById = new Map(
          appData.applications.map((app) => [app.id, app]),
        );
        const appsByJob = new Map(
          appData.applications
            .filter((app) => app.job_id)
            .map((app) => [app.job_id, app]),
        );
        const rows: Target[] = jobData.jobs.map((job) => {
          const app =
            appsById.get(job.id) ||
            (job.application_id
              ? appsById.get(job.application_id)
              : undefined) ||
            appsByJob.get(job.id);
          return {
            id: job.id,
            title:
              job.title ||
              [job.company, job.role].filter(Boolean).join(" · ") ||
              job.id,
            company: job.company || app?.company || "",
            role: job.role || app?.role || "",
            applicationId: app?.id ?? null,
          };
        });
        setTargets(rows);
        setError(null);
        const fromUrl = searchParams.get("sel");
        const preferred = rows.find(
          (item) => item.id === fromUrl || item.applicationId === fromUrl,
        );
        setSelected((prev) => {
          if (preferred?.id) return preferred.id;
          if (prev && rows.some((item) => item.id === prev)) return prev;
          return rows[0]?.id || "";
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "读取失败");
        }
      } finally {
        if (!cancelled) {
          firstLoad.current = false;
          setLoading(false);
        }
      }
    }
    void load();
  }, [searchParams]);

  const readyDocs = useMemo(() => localPreps, [localPreps]);

  const pending = useMemo(() => {
    const readyIds = new Set(
      readyDocs.flatMap((doc) => [doc.id, doc.applicationId]),
    );
    return targets.filter(
      (item) =>
        !readyIds.has(item.id) &&
        !(item.applicationId && readyIds.has(item.applicationId)),
    );
  }, [targets, readyDocs]);

  const currentPending = useMemo(
    () => pending.find((item) => item.id === selected) || pending[0],
    [pending, selected],
  );

  function generatePrep(target: Target) {
    const title = titleOf(target);
    const appId = target.applicationId || target.id;
    open(
      `请为「${title}」写一份完整面试准备，直接作为本轮回复正文输出。

硬性要求：
1. 不要调用 save_interview_prep，不要写任何 md 文件
2. 不要写「摘要」「已保存」「请到某某页查看」或任何链接
3. 先 get_job("${target.id}")，需要时再 get_profile / get_framework("interview")
4. 然后直接输出完整 Markdown，必须包含这些一级标题及实质内容：
## 岗位要点
## STAR 示例
## 可能被问到的问题
## 要问面试官的问题
STAR 至少 2 个完整例子；可能问题至少 8 条（含答法要点）；要问面试官至少 5 条。`,
      {
        autoSend: true,
        interviewPrep: {
          id: target.id,
          applicationId: appId,
          title,
          company: target.company,
          role: target.role,
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader crumb="面试准备" title="求职工作台" />

      {error ? (
        <div className="mt-8 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}。确认后端已启动（`./scripts/dev.sh start`）。
        </div>
      ) : null}

      {loading ? (
        <div className="mt-16 flex justify-center">
          <LoaderCircle className="size-5 animate-spin text-teal-300" />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="rounded-2xl border border-white/8 bg-white/3 px-6 py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  面试准备文档
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  保存在本机 localStorage，可随时打开完整内容。
                </p>
              </div>
              <span className="text-xs text-zinc-500">
                {readyDocs.length} 份文档
              </span>
            </div>

            {readyDocs.length === 0 ? (
              <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-black/10 px-5 py-8 text-center">
                <FileText className="mx-auto size-5 text-zinc-500" />
                <p className="mt-3 text-sm font-medium text-zinc-200">
                  还没有面试准备文档
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  在下方生成后，完整正文会写入本机，并出现在此列表。
                </p>
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-white/6">
                {readyDocs.map((item) => (
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
                          "面试准备"}
                        {item.updatedAt
                          ? ` · 更新于 ${timeAgo(item.updatedAt)}`
                          : ""}
                        {" · 本机"}
                      </span>
                    </span>
                    <Link
                      href={`/interview/local/${encodeURIComponent(item.id)}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-400 px-3.5 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
                    >
                      查看完整内容
                      <ArrowRight className="size-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/3 px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  生成新的准备
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  完整内容会出现在右侧对话，并自动保存到本机列表。
                </p>
              </div>
              {pending.length > 0 ? (
                <select
                  value={currentPending?.id || ""}
                  onChange={(event) => setSelected(event.target.value)}
                  className="max-w-md rounded-lg border border-white/10 bg-[#101826] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-teal-300/40"
                >
                  {pending.map((item) => (
                    <option key={item.id} value={item.id}>
                      {titleOf(item)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="mt-8 flex flex-col items-center py-6 text-center">
              {targets.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  先导入并评估 JD，再回来生成面试准备。
                </p>
              ) : pending.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  当前岗位都已有本机面试准备，可在上方打开完整内容。
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-zinc-200">
                    {titleOf(currentPending!)}
                  </p>
                  <button
                    type="button"
                    onClick={() => generatePrep(currentPending!)}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
                  >
                    生成面试准备
                    <ArrowRight className="size-4" />
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function InterviewPage() {
  return (
    <Suspense fallback={null}>
      <InterviewPageInner />
    </Suspense>
  );
}
