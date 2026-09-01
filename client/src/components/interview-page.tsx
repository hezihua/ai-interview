"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader, useChatDrawer } from "@/components/workbench-shell";
import {
  fetchWorkbench,
  type ApplicationEntry,
} from "@/lib/workbench";

function InterviewPageInner() {
  const [apps, setApps] = useState<ApplicationEntry[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { open } = useChatDrawer();

  useEffect(() => {
    fetchWorkbench<{ applications: ApplicationEntry[] }>("/applications")
      .then((data) => {
        setApps(data.applications);
        const fromUrl = searchParams.get("sel");
        setSelected(
          fromUrl && data.applications.some((a) => a.id === fromUrl)
            ? fromUrl
            : (data.applications[0]?.id ?? ""),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "读取失败"));
  }, [searchParams]);

  const current = apps.find((app) => app.id === selected);
  const label = current
    ? [current.company, current.role].filter(Boolean).join(" · ") || current.id
    : "";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader crumb="面试准备" title="求职工作台" />

      {error ? (
        <div className="mt-8 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}。确认 FastAPI（server/server.py）已启动。
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border border-white/8 bg-white/3 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-zinc-100">面试准备</h2>
          {apps.length > 0 ? (
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="rounded-lg border border-white/10 bg-[#101826] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-teal-300/40"
            >
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {[app.company, app.role].filter(Boolean).join(" · ") || app.id}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="flex flex-col items-center py-14 text-center">
          {apps.length === 0 ? (
            <>
              <LoaderCircle className="size-5 animate-spin text-teal-300" />
              <p className="mt-4 text-sm font-medium text-zinc-200">
                还没有可准备的申请
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                AI 会基于已保存的档案和职位评估，生成专属准备清单。先完成一次评估与起草。
              </p>
            </>
          ) : current?.docs["interview_prep.md"] ? (
            <>
              <p className="text-sm font-medium text-zinc-200">{label}</p>
              <p className="mt-2 text-sm text-zinc-500">
                面试准备已生成，包含 STAR 题单与要问面试官的问题。
              </p>
              <Link
                href={`/applications/${current.id}/interview_prep.md`}
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
              >
                查看面试准备
                <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <>
              <LoaderCircle className="size-5 animate-spin text-teal-300" />
              <p className="mt-4 text-sm font-medium text-zinc-200">
                为下一场面试做好准备
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                AI 会基于已保存的档案和职位评估，生成专属准备清单。
              </p>
              <button
                type="button"
                onClick={() => open(`帮我准备 ${label || selected} 的面试`)}
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-teal-300"
              >
                生成面试准备
                <ArrowRight className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
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
