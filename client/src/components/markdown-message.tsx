import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden wrap-break-word text-[15px] leading-7 text-zinc-100">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-xl font-semibold tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-teal-300 underline underline-offset-2 hover:text-teal-200"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-50">{children}</strong>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (!isBlock) {
              return (
                <code className="rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[13px] text-teal-100">
                  {children}
                </code>
              );
            }
            return (
              <code className="block font-mono text-[13px] leading-6 text-zinc-100">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 max-w-full whitespace-pre-wrap wrap-break-word rounded-xl border border-white/8 bg-[#0b1220] p-4 last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 max-w-full last:mb-0">
              <table className="w-full table-fixed border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="wrap-break-word border border-white/10 bg-white/5 px-2.5 py-1.5 text-left align-top font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="wrap-break-word border border-white/10 px-2.5 py-1.5 align-top">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
