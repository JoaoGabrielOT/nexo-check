import { useId, useState } from 'react';
import { cn } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';

/** Card expansível de mecanismo: frase curta sempre visível, texto completo ao abrir. */
export function MechanismCard({
  title,
  summary,
  body,
}: {
  title: string;
  summary: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div
      className={cn(
        'rounded-card p-5 text-text',
        open ? 'bg-surface ring-4 ring-navy dark:ring-border' : 'bg-card',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full cursor-pointer items-start justify-between gap-2 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl"
      >
        <span className="font-extrabold">{title}</span>
        <span aria-hidden="true" className="font-extrabold">
          {open ? '−' : '+'}
        </span>
      </button>
      <p className="mt-1 text-sm">{summary}</p>
      <div id={panelId} hidden={!open} className="mt-2 text-sm">
        <MarkdownView body={body} />
      </div>
    </div>
  );
}
