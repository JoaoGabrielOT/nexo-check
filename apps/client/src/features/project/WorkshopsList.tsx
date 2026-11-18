import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listMarkdown } from '@nexo/shared';
import { Tile, cn, type TileTone } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';

const TONES: TileTone[] = ['sleep', 'breathing'];

/** Parágrafo "Base: …" do markdown da oficina, sem o prefixo. */
function scienceOf(body: string): string {
  const p = body.split(/\n\s*\n/).find((x) => x.startsWith('Base:'));
  return (p ?? '').replace(/^Base:\s*/, '');
}

function Workshop({
  n,
  tone,
  title,
  duration,
  summary,
  science,
}: {
  n: number;
  tone: TileTone;
  title: string;
  duration: string;
  summary: string;
  science: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <Tile tone={tone} label={t('workshop.label', { n })}>
      <h3 className="text-xl leading-snug font-extrabold tracking-[-0.02em] text-balance">
        {title}
      </h3>
      <p className="w-fit rounded-full bg-tile-ink/12 px-3 py-1 text-sm font-extrabold">
        {duration}
      </p>
      <p className="max-w-prose text-[0.9375rem] leading-relaxed">{summary}</p>
      {science && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control text-left font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl"
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full border-2 border-current"
            >
              <Plus
                className={cn('size-4 motion-safe:transition-transform', open && 'rotate-45')}
                strokeWidth={2.75}
              />
            </span>
            {t('workshop.science')}
          </button>
          <div id={panelId} hidden={!open} className="max-w-prose">
            <MarkdownView body={science} className="text-[0.9375rem] [&_p:last-child]:mb-0" />
          </div>
        </div>
      )}
    </Tile>
  );
}

export function WorkshopsList() {
  const { t } = useTranslation();
  const docs = listMarkdown('oficinas');
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {docs.map((d, i) => (
        <Workshop
          key={d.slug}
          n={i + 1}
          tone={TONES[i % TONES.length] ?? 'sleep'}
          title={d.meta.title ?? d.slug}
          duration={d.meta.duration ?? t('workshop.duration')}
          summary={d.meta.summary ?? ''}
          science={scienceOf(d.body)}
        />
      ))}
    </div>
  );
}
