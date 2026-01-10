"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Customize heading styles to match site design
          h1: ({ children }) => (
            <h1 className="font-serif text-4xl tracking-tight mt-8 mb-4 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-serif text-2xl tracking-tight mt-8 mb-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-serif text-xl tracking-tight mt-6 mb-2">
              {children}
            </h3>
          ),
          // Style lists
          ul: ({ children }) => (
            <ul className="my-4 ml-6 list-disc space-y-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 ml-6 list-decimal space-y-2">{children}</ol>
          ),
          // Style paragraphs
          p: ({ children }) => (
            <p className="leading-relaxed text-foreground my-4">
              {children}
            </p>
          ),
          // Style links
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              {children}
            </a>
          ),
          // Style strong/bold
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
