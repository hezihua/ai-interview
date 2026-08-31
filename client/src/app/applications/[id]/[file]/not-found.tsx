import Link from "next/link";

export default function ApplicationDocNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#071018] px-6 text-center">
      <p className="text-sm text-zinc-400">这份材料还没有保存，或链接不正确。</p>
      <Link href="/" className="text-sm text-teal-300 underline underline-offset-2">
        返回对话
      </Link>
    </div>
  );
}
