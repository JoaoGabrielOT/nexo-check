import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { getMarkdown, listMarkdown } from '@nexo/shared';
import { Alert, PageHeader, cn } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { DraftBadge } from './DraftBadge';
import { MechanismCard } from './MechanismCard';
import { TONE_BG, TONE_LABEL, guideTone } from './tones';

const MECHANISMS = ['bdnf', 'hipocampo', 'eixo-hpa', 'recompensa', 'pre-frontal'];

/** Frase curta (meta.summary ou 1º parágrafo) e o restante do texto. */
function splitSummary(meta: Record<string, string>, body: string) {
  if (meta.summary) return { summary: meta.summary, rest: body };
  const [first = '', ...others] = body.split(/\n\s*\n/);
  return { summary: first, rest: others.join('\n\n') };
}

const h2 = 'mb-4 text-2xl font-extrabold tracking-[-0.03em] text-balance';

// Celular: uma coluna na ordem do DOM. ≥ 1024 px: mecanismos e ressalva à esquerda, guia à direita.
export function LearnPage() {
  const { t } = useTranslation();
  const docs = listMarkdown('aprender');
  const bySlug = (slug: string) => docs.find((d) => d.slug === slug);
  const mechanisms = MECHANISMS.map(bySlug).filter((d) => d !== undefined);
  const evidence = bySlug('evidencias');
  // Conteúdo obrigatório: getMarkdown lança se o arquivo sumir, em vez de omitir a seção.
  const caveat = getMarkdown('aprender/ressalva.md');
  const references = bySlug('referencias');
  const notices = getMarkdown('avisos/avisos.md');
  const guide = listMarkdown('guia');

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 sm:gap-8">
      <PageHeader eyebrow={t('learn.eyebrow')} title={t('pages.learn')} />

      {evidence && (
        <section
          aria-labelledby="learn-evidence"
          className="relative isolate overflow-hidden rounded-hero bg-hero p-6 pr-16 text-hero-ink sm:p-9 sm:pr-40"
        >
          {/* Pílulas da marca cortadas pela borda: só decoração. */}
          <span
            aria-hidden="true"
            className="absolute -top-8 right-7 -z-10 h-24 w-12 rounded-full bg-or sm:-top-10 sm:right-20 sm:h-36 sm:w-20"
          />
          <span
            aria-hidden="true"
            className="absolute top-12 -right-5 -z-10 h-24 w-12 rounded-full bg-bl sm:top-16 sm:-right-6 sm:h-36 sm:w-20 dark:bg-rd"
          />
          <h2 id="learn-evidence" className="eyebrow">
            {evidence.meta.title}
          </h2>
          <MarkdownView
            body={evidence.body}
            className="mt-3 max-w-[38rem] text-[1.0625rem] leading-snug font-semibold tracking-[-0.01em] text-balance sm:text-2xl sm:leading-snug [&_p]:my-0"
          />
        </section>
      )}

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start lg:gap-10 xl:gap-14">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="learn-mechanisms">
            <h2 id="learn-mechanisms" className={h2}>
              {t('learn.mechanisms')}
            </h2>
            {/* role="list" explícito: o Safari tira a semântica de listas sem marcador. */}
            {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- ver comentário acima */}
            <ol role="list" aria-labelledby="learn-mechanisms">
              {mechanisms.map((d, i) => {
                const { summary, rest } = splitSummary(d.meta, d.body);
                return (
                  <MechanismCard
                    key={d.slug}
                    index={i}
                    title={d.meta.title ?? d.slug}
                    summary={summary}
                    body={rest}
                  />
                );
              })}
            </ol>
          </section>

          <Alert aria-labelledby="learn-caveat" className="px-6 py-5">
            <h2 id="learn-caveat" className="mb-1 text-lg font-extrabold tracking-[-0.02em]">
              {caveat.meta.title}
            </h2>
            <MarkdownView body={caveat.body} className="text-[0.9375rem] [&_p]:my-0" />
          </Alert>
        </div>

        <section aria-labelledby="learn-guide" className="min-w-0">
          <h2 id="learn-guide" className={h2}>
            {t('learn.guide')}
          </h2>
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari: lista sem marcador */}
          <ul
            role="list"
            aria-labelledby="learn-guide"
            className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-1"
          >
            {guide.map((g, i) => {
              const tone = guideTone(i);
              return (
                <li
                  key={g.slug}
                  className={cn(
                    'relative flex flex-col gap-2 rounded-tile border border-tile-edge p-5 text-tile-ink grain dark:bg-none',
                    'has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-bl has-[a:focus-visible]:outline-solid',
                    TONE_BG[tone],
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0">
                      {/* Link "esticado": o ::after cobre o bloco inteiro, o nome acessível é só o título. */}
                      <Link
                        to={`/aprender/guia/${g.slug}`}
                        data-guide-link
                        className="inline-flex min-h-11 items-center text-lg leading-snug font-extrabold tracking-[-0.02em] outline-none after:absolute after:inset-0 after:rounded-tile"
                      >
                        {g.meta.title}
                      </Link>
                    </h3>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-full bg-tile-ink/8',
                        TONE_LABEL[tone],
                      )}
                    >
                      <ArrowUpRight className="size-5" strokeWidth={2.5} />
                    </span>
                  </div>
                  {g.meta.summary && (
                    <p className="text-[0.9375rem] leading-relaxed">{g.meta.summary}</p>
                  )}
                  {g.meta.draft === 'true' && (
                    <DraftBadge className={cn('mt-1 self-start', TONE_LABEL[tone])} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 border-t border-text/15 pt-6 text-muted lg:grid-cols-2 lg:gap-10">
        {references && (
          <section aria-labelledby="learn-refs" className="min-w-0">
            <h2 id="learn-refs" className="mb-1 text-base font-extrabold text-text">
              {t('learn.references')}
            </h2>
            <MarkdownView body={references.body} className="text-sm break-words" />
          </section>
        )}
        <section aria-labelledby="learn-notices" className="min-w-0">
          <h2 id="learn-notices" className="mb-1 text-base font-extrabold text-text">
            {t('learn.notices')}
          </h2>
          <MarkdownView body={notices.body} className="text-sm" />
        </section>
      </div>
    </div>
  );
}
