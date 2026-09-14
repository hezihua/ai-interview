"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { MarkdownMessage } from "@/components/markdown-message";
import {
  getLocalEvaluation,
  type LocalEvaluation,
} from "@/lib/evaluation-local";

export default function LocalEvaluationPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id || "");
  const [doc, setDoc] = useState<LocalEvaluation | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDoc(id ? getLocalEvaluation(id) : null);
    setReady(true);
  }, [id]);

  if (!ready) return null;

  if (!doc) {
    return (
      <div className="min-h-dvh bg-[linear-gradient(180deg,#071018_0%,#0b1220_100%)] px-4 py-10 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/8 bg-[#121c2b] px-5 py-8">
          <h1 className="text-base font-semibold">文档不存在</h1>
          <p className="mt-2 text-sm text-zinc-500">
            本机 localStorage 里没有这份评估结果，可能已被清除。
          </p>
          <Link
            href="/jobs"
            className="mt-5 inline-block rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            返回职位评估
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#071018_0%,#0b1220_100%)]">
      <header className="border-b border-white/8 bg-[#071018]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-teal-200/80 uppercase">
              评估结果
            </p>
            <h1 className="text-base font-semibold text-zinc-50">{doc.title}</h1>
          </div>
          <Link
            href="/jobs"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            返回职位评估
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <article className="rounded-2xl border border-white/8 bg-[#121c2b] px-5 py-6">
          <MarkdownMessage content={doc.markdown} />
        </article>
      </main>
    </div>
  );
}
