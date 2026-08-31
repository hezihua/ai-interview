"use client";

export type SopStepId =
  | "setup"
  | "ingest"
  | "evaluate"
  | "apply"
  | "interview"
  | "outcome";

export type SopStep = {
  id: SopStepId;
  title: string;
  hint: string;
};

export const SOP_STEPS: SopStep[] = [
  {
    id: "setup",
    title: "完善档案",
    hint: "上传简历，或说出缺口信息",
  },
  {
    id: "ingest",
    title: "收录 JD",
    hint: "粘贴全文或招聘页 URL",
  },
  {
    id: "evaluate",
    title: "评估匹配",
    hint: "看评分后决定是否起草",
  },
  {
    id: "apply",
    title: "起草申请",
    hint: "回复「继续起草」",
  },
  {
    id: "interview",
    title: "面试准备",
    hint: "出 STAR 题单与提问清单",
  },
  {
    id: "outcome",
    title: "记录结果",
    hint: "已投 / 拒信 / offer",
  },
];

const STAGE_MARKERS: { id: SopStepId; patterns: RegExp[] }[] = [
  {
    id: "outcome",
    patterns: [/记录：/, /已投递/, /已投\b/, /拒信/, /\boffer\b/i, /已录用/, /withdrawn/i],
  },
  {
    id: "interview",
    patterns: [/面试准备/, /STAR/, /帮我准备面试/, /问面试官/],
  },
  {
    id: "apply",
    patterns: [/求职信/, /继续起草/, /cover letter/i, /已起草/, /cv\.md/i],
  },
  {
    id: "evaluate",
    patterns: [/五维/, /评分表/, /闸门/, /是否继续起草/, /verdict/i, /overall/i],
  },
  {
    id: "ingest",
    patterns: [/已收录/, /岗位[：:]/, /ingest/i, /评估这份\s*jd/i, /job_id/i],
  },
  {
    id: "setup",
    patterns: [/档案/, /简历/, /candidate/i, /仍缺/],
  },
];

export function inferSopIndex(texts: string[]): number {
  const blob = texts.join("\n");
  if (!blob.trim()) return 0;
  for (const stage of STAGE_MARKERS) {
    if (stage.patterns.some((pattern) => pattern.test(blob))) {
      return SOP_STEPS.findIndex((step) => step.id === stage.id);
    }
  }
  return 0;
}

export function SopRail({ currentIndex }: { currentIndex: number }) {
  const current = SOP_STEPS[currentIndex] ?? SOP_STEPS[0];
  const next = SOP_STEPS[Math.min(currentIndex + 1, SOP_STEPS.length - 1)];

  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col border-r border-white/8 bg-[#08111c]/70 px-3 py-4 backdrop-blur-xl">
      <p className="px-1 text-[11px] font-medium tracking-[0.16em] text-teal-200/80 uppercase">
        SOP
      </p>
      <h2 className="mt-1 px-1 text-sm font-semibold text-zinc-50">求职流程</h2>
      <p className="mt-2 px-1 text-xs leading-5 text-zinc-500">
        当前：{current.title}
        {next && next.id !== current.id ? ` → 下一步 ${next.title}` : ""}
      </p>

      <ol className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {SOP_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${
                active
                  ? "border border-teal-300/30 bg-teal-400/10"
                  : "border border-transparent"
              }`}
            >
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  done
                    ? "bg-teal-300 text-zinc-950"
                    : active
                      ? "bg-teal-300/90 text-zinc-950"
                      : "bg-white/8 text-zinc-400"
                }`}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      active ? "text-zinc-50" : "text-zinc-200"
                    }`}
                  >
                    {step.title}
                  </span>
                  {active ? (
                    <span className="rounded-full bg-teal-300/15 px-1.5 py-0.5 text-[10px] text-teal-200">
                      当前
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                  {step.hint}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 px-1 text-[11px] leading-4 text-zinc-600">
        仅作进度对照。闸门失败或必须搬家时，默认不起草。
      </p>
    </aside>
  );
}

export function SopStrip({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="border-b border-white/8 bg-[#08111c]/80 px-3 py-2 md:hidden">
      <div className="-mx-1 flex flex-wrap gap-1.5 pb-1">
        {SOP_STEPS.map((step, index) => {
          const active = index === currentIndex;
          const done = index < currentIndex;
          return (
            <span
              key={step.id}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                active
                  ? "bg-teal-300 text-zinc-950"
                  : done
                    ? "bg-teal-300/15 text-teal-100"
                    : "bg-white/5 text-zinc-400"
              }`}
            >
              <span>{index + 1}</span>
              {step.title}
            </span>
          );
        })}
      </div>
    </div>
  );
}
