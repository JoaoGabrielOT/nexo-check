import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { listMarkdown, type MarkdownDir } from '@nexo/shared';
import { PageHeader, cn } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { DraftBadge } from './DraftBadge';
import { TONE_BG, TONE_LABEL, focusRing, guideTone } from './tones';

const SECTIONS: MarkdownDir[] = ['aprender', 'guia'];

export function ArticlePage() {
  const { t } = useTranslation();
  const { section, slug } = useParams();
  const dir = SECTIONS.find((s) => s === section);
  const docs = dir ? listMarkdown(dir) : [];
  const index = docs.findIndex((d) => d.slug === slug);
  const doc = docs[index];
  const back = (
    <Link
      to="/aprender"
      className={cn(
        '-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full py-2 pr-4 pl-2 text-sm font-extrabold hover:bg-text/8',
        focusRing,
      )}
    >
      <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2.5} />
      {t('learn.back')}
    </Link>
  );

  if (!doc) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        {back}
        <PageHeader title={t('learn.notFound')} meta={t('learn.notFoundHint')} />
      </div>
    );
  }
  // O artigo do guia repete a tinta do bloco de onde veio; os textos de Aprender usam a superfície neutra.
  const tone = dir === 'guia' ? guideTone(index) : null;
  return (
    <article className="mx-auto flex w-full max-w-[760px] flex-col gap-4 sm:gap-6">
      {back}
      <header
        className={cn(
          'flex flex-col gap-3 rounded-panel border border-tile-edge p-6 text-tile-ink grain sm:p-9 dark:bg-none',
          tone ? TONE_BG[tone] : 'bg-tile-plain',
        )}
      >
        <p className={cn('eyebrow', tone ? TONE_LABEL[tone] : 'text-tile-label-plain')}>
          {dir === 'guia' ? t('learn.guide') : t('pages.learn')}
        </p>
        <h1 className="text-[2.25rem] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">
          {doc.meta.title}
        </h1>
        {doc.meta.summary && (
          <p className="max-w-prose text-base leading-relaxed font-semibold sm:text-lg">
            {doc.meta.summary}
          </p>
        )}
        {doc.meta.draft === 'true' && (
          <DraftBadge
            className={cn('self-start', tone ? TONE_LABEL[tone] : 'text-tile-label-plain')}
          />
        )}
      </header>
      <MarkdownView body={doc.body} className="max-w-prose px-1 sm:text-[1.0625rem]" />
    </article>
  );
}
