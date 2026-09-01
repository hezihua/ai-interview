"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/workbench-shell";
import {
  fetchWorkbench,
  initialOf,
  statusLabel,
  timeAgo,
  type ApplicationEntry,
} from "@/lib/workbench";

const DOC_LABELS: [string, string][] = [
  ["cv.md", "简历"],
  ["cover.md", "求职信"],
  ["posting.md", "JD"],
  ["evaluation.md", "评估"],
  ["interview_prep.md", "面试准备"],
  ["outcome.md", "结果"],
];

export function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkbench<{ applications: ApplicationEntry[] }>("/applications")
      .then((data) => setApps(data.applications))
      .catch((err) => setError(err instanceof Error ? err.message : "读取失败"));
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader crumb="申请记录" title="求职工作台" />

      {error ? (
        <div className="mt-8 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}。确认 FastAPI（server/server.py）已启动。
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        {apps.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 px-6 py-10">
            <h2 className="text-base font-semibold text-zinc-100">申请记录</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              每次状态变化都会记录到你的求职时间线。起草申请后，这里会出现第一条记录。
            </p>
          </div>
        ) : (
          apps.map((app) => (
            <div
              key={app.id}
              className="rounded-2xl border border-white/8 bg-white/3 px-6 py-5"
            >
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-400/12 text-sm font-medium text-teal-200">
                  {initialOf(app.company || app.role || app.id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {[app.company, app.role].filter(Boolean).join(" · ") || app.id}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {app.created_at ? `创建于 ${timeAgo(app.created_at)}` : ""}
                    {app.updated_at && app.updated_at !== app.created_at
                      ? ` · 更新于 ${timeAgo(app.updated_at)}`
                      : ""}
                    {app.deadline ? ` · 截止 ${app.deadline}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                    app.status === "rejected" || app.status === "withdrawn"
                      ? "bg-orange-400/12 text-orange-300"
                      : app.status === "offered" || app.status === "hired"
                        ? "bg-teal-400/15 text-teal-200"
                        : "bg-white/8 text-zinc-300"
                  }`}
                >
                  {statusLabel(app.status)}
                </span>
              </div>
              {app.notes ? (
                <p className="mt-3 text-xs leading-5 text-zinc-400">{app.notes}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {DOC_LABELS.filter(([file]) => app.docs[file]).map(
                  ([file, label]) => (
                    <Link
                      key={file}
                      href={`/applications/${app.id}/${file}`}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-teal-300/30 hover:text-teal-200"
                    >
                      {label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
