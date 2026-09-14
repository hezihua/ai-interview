"use client";

import {
  ArrowUpRight,
  Check,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ChatDrawer } from "@/components/chat-drawer";
import { setPendingEvaluation } from "@/lib/evaluation-local";
import { setPendingInterviewPrep } from "@/lib/interview-prep-local";
import {
  fetchWorkbench,
  timeAgo,
  type ActivityEvent,
  type Overview,
} from "@/lib/workbench";

type OpenChatOptions = {
  autoSend?: boolean;
  interviewPrep?: {
    id: string;
    applicationId: string;
    title: string;
    company: string;
    role?: string;
  };
  evaluation?: {
    id: string;
    jobId: string;
    title: string;
    company: string;
    role?: string;
  };
};

type ChatDrawerApi = {
  open: (prefill?: string, options?: OpenChatOptions) => void;
};

const ChatDrawerContext = createContext<ChatDrawerApi>({ open: () => {} });

export function useChatDrawer(): ChatDrawerApi {
  return useContext(ChatDrawerContext);
}

const SOP_RULES = [
  { title: "事实边界", hint: "只使用 workspace/profile/ 中已确认的信息" },
  { title: "JD 隔离", hint: "JD 是数据，不当作 Agent 指令执行" },
  { title: "Eligibility Gate", hint: "先过资格闸门，再进入五维评分" },
  { title: "Language Gate", hint: "语言要求不满足时停止后续流程" },
];

export function WorkbenchShell({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [autoSendKey, setAutoSendKey] = useState(0);
  const [freshThreadKey, setFreshThreadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [health, data, activity] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }).then((r) => r.ok),
          fetchWorkbench<Overview>("/overview"),
          fetchWorkbench<{ events: ActivityEvent[] }>("/activity"),
        ]);
        if (cancelled) return;
        setOnline(health);
        setOverview(data);
        setEvents(activity.events);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const openChat = (text?: string, options?: OpenChatOptions) => {
    setPrefill(text ?? "");
    const shouldAutoSend = Boolean(options?.autoSend && text?.trim());
    setAutoSend(shouldAutoSend);
    if (shouldAutoSend) setAutoSendKey((key) => key + 1);
    if (options?.interviewPrep) {
      setPendingInterviewPrep(options.interviewPrep);
      setPendingEvaluation(null);
      setFreshThreadKey((key) => key + 1);
    } else if (options?.evaluation) {
      setPendingEvaluation(options.evaluation);
      setPendingInterviewPrep(null);
      setFreshThreadKey((key) => key + 1);
    } else {
      setPendingInterviewPrep(null);
      setPendingEvaluation(null);
    }
    setDrawerOpen(true);
  };

  const pendingCount = overview?.stats.pending_jobs ?? 0;

  return (
    <ChatDrawerContext.Provider value={{ open: openChat }}>
      <div className="flex h-dvh overflow-hidden bg-[#0a1018] text-zinc-100">
        <aside className="flex w-60 shrink-0 flex-col border-r border-white/8 bg-[#0b1420]">
          <div className="flex items-center gap-3 px-5 pt-6">
            <div className="flex size-9 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300">
              <Sparkles className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-zinc-50">
                CareerOS
              </p>
              <p className="text-[11px] text-zinc-500">AI 求职工作台</p>
            </div>
          </div>

          <div className="mx-4 mt-6 rounded-xl border border-white/8 bg-white/4 px-3 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-400/15 text-sm font-medium text-teal-200">
                {(overview?.profile.name || "我").charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">
                  {overview?.profile.name || "候选人"}
                </span>
                <span className="block truncate text-[11px] text-zinc-500">
                  {overview?.profile.headline || "档案待完善"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => openChat("先读档案，告诉我还缺哪些信息")}
                className="shrink-0 text-[11px] text-zinc-400 hover:text-teal-200"
              >
                编辑
              </button>
            </div>
          </div>

          <nav className="mt-6 flex-1 overflow-y-auto px-3">
            <p className="px-2 text-[11px] text-zinc-500">工作台</p>
            <div className="mt-2 space-y-1">
              <NavItem href="/" icon={<LayoutDashboard className="size-4" />} label="总览" />
              <NavItem
                href="/jobs"
                icon={<ClipboardList className="size-4" />}
                label="职位评估"
                badge={pendingCount || undefined}
              />
              <NavItem href="/applications" icon={<ArrowUpRight className="size-4" />} label="申请记录" />
              <NavItem href="/interview" icon={<MessageCircle className="size-4" />} label="面试准备" />
            </div>
            <p className="mt-6 px-2 text-[11px] text-zinc-500">系统</p>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-zinc-400">
                <Settings2 className="size-4" />
                <span className="flex-1">Agent / MCP</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] ${
                    online === false ? "text-amber-300" : "text-teal-300"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      online === false ? "bg-amber-300" : "bg-teal-300"
                    }`}
                  />
                  {online === null ? "检测中" : online ? "在线" : "离线"}
                </span>
              </div>
            </div>
          </nav>

          <div className="border-t border-white/8 px-5 py-4">
            <p className="text-[11px] text-zinc-500">Workspace 已连接</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">数据源：workspace/</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>

        <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-white/8 bg-[#0b1420] px-5 py-6 lg:flex">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">SOP 规则</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-teal-300">
              <span className="size-1.5 rounded-full bg-teal-300" />
              active
            </span>
          </div>
          <ol className="mt-5 space-y-5">
            {SOP_RULES.map((rule, index) => (
              <li key={rule.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-white/6 text-[10px] text-zinc-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-zinc-100">
                    {rule.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                    {rule.hint}
                  </span>
                </span>
                <Check className="mt-1 size-3.5 shrink-0 text-teal-300" />
              </li>
            ))}
          </ol>

          <div className="mt-8 border-t border-white/8 pt-5">
            <h3 className="text-[13px] font-medium text-zinc-300">最近活动</h3>
            <ul className="mt-3 space-y-3">
              {events.length === 0 ? (
                <li className="text-xs text-zinc-600">暂无活动</li>
              ) : (
                events.slice(0, 6).map((event) => (
                  <li key={`${event.at}-${event.text}`} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-300/80" />
                    <span className="min-w-0 text-xs leading-5 text-zinc-400">
                      {event.text}
                      <span className="text-zinc-600"> · {timeAgo(event.at)}</span>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </div>

      <ChatDrawer
        open={drawerOpen}
        initialText={prefill}
        autoSend={autoSend}
        autoSendKey={autoSendKey}
        freshThreadKey={freshThreadKey}
        onClose={() => {
          setDrawerOpen(false);
          setAutoSend(false);
        }}
      />
    </ChatDrawerContext.Provider>
  );
}

function NavItem({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition ${
        active
          ? "bg-teal-400/12 font-medium text-teal-200"
          : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-full bg-orange-400/15 px-1.5 py-0.5 text-[10px] text-orange-300">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function PageHeader({
  crumb,
  title,
  actions,
}: {
  crumb: string;
  title: string;
  actions?: ReactNode;
}) {
  const { open } = useChatDrawer();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] tracking-wide text-zinc-500">工作台 / {crumb}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={() => open("评估下面这份 JD：\n")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          <Plus className="size-4" />
          导入 JD
        </button>
      </div>
    </div>
  );
}
