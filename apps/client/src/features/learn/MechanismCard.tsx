import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { focusRing } from './tones';

/**
 * Item da lista numerada de mecanismos: frase curta sempre visível, texto completo ao abrir.
 * O número é visual (a lista é um <ol>, o leitor de tela já anuncia a posição).
 */
export function MechanismCard({
  index,
  title,
  summary,
  body,
}: {
  index: number;
  title: string;
  summary: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 border-t border-text/15 py-5 first:border-t-0 first:pt-1 sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:gap-x-4">
      <span
        aria-hidden="true"
        className="text-[2.5rem] leading-none font-extrabold tracking-[-0.05em] tabular-nums sm:text-[3.5rem]"
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'group flex min-h-11 w-full cursor-pointer items-start justify-between gap-3 rounded-control text-left',
              focusRing,
            )}
          >
            <span className="pt-1 text-lg leading-snug font-extrabold tracking-[-0.02em] text-balance sm:text-xl">
              {title}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full border-2 border-text/70 transition-colors',
                open
                  ? 'border-navy bg-navy text-[#f7f5f2] dark:border-lav2 dark:bg-lav2 dark:text-navy'
                  : 'group-hover:bg-text/8',
              )}
            >
              <Plus
                className={cn('size-4 motion-safe:transition-transform', open && 'rotate-45')}
                strokeWidth={2.75}
              />
            </span>
          </button>
        </h3>
        <p className="mt-1 max-w-prose text-[0.9375rem] leading-relaxed text-muted">{summary}</p>
        <div id={panelId} hidden={!open} className="max-w-prose">
          <MarkdownView body={body} className="text-[0.9375rem] [&_p:last-child]:mb-0" />
        </div>
      </div>
    </li>
  );
}
