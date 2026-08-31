import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownMessage } from "@/components/markdown-message";
import { AGENT_API_BASE, agentAuthHeaders } from "@/lib/agent";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string; file: string }>;
};

export default async function ApplicationDocumentPage({ params }: PageProps) {
  const { id, file } = await params;
  let title = file;
  let markdown = "";
  try {
    const upstream = await fetch(
      `${AGENT_API_BASE}/v1/applications/${encodeURIComponent(id)}/${encodeURIComponent(file)}`,
      { headers: agentAuthHeaders(), cache: "no-store" },
    );
    if (upstream.status === 404) {
      notFound();
    }
    if (!upstream.ok) {
      const detail = await upstream.text();
      throw new Error(detail || `读取失败（${upstream.status}）`);
    }
    const payload = (await upstream.json()) as {
      title?: string;
      markdown?: string;
    };
    title = payload.title || file;
    markdown = payload.markdown || "";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "无法读取文档";
    return (
      <DocumentShell title="无法打开文档">
        <p className="text-sm leading-6 text-zinc-400">{message}</p>
        <p className="mt-2 text-sm text-zinc-500">
          确认 FastAPI 已在 {AGENT_API_BASE} 运行。
        </p>
      </DocumentShell>
    );
  }

  if (!markdown.trim()) {
    notFound();
  }

  return (
    <DocumentShell title={title}>
      <MarkdownMessage content={markdown} />
    </DocumentShell>
  );
}

function DocumentShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#071018_0%,#0b1220_100%)]">
      <header className="border-b border-white/8 bg-[#071018]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-teal-200/80 uppercase">
              申请材料
            </p>
            <h1 className="text-base font-semibold text-zinc-50">{title}</h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            返回对话
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <article className="rounded-2xl border border-white/8 bg-[#121c2b] px-5 py-6">
          {children}
        </article>
      </main>
    </div>
  );
}
