import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';
import { cn } from '@nexo/ui';

const prose =
  'text-base leading-relaxed [&_a]:font-semibold [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-extrabold [&_h3]:my-2 [&_h3]:font-extrabold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_strong]:font-extrabold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6';

/** Renderiza Markdown como HTML sanitizado. */
export function MarkdownView({ body, className }: { body: string; className?: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(body, { async: false, gfm: true })),
    [body],
  );
  return <div className={cn(prose, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
