import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { listMarkdown, type MarkdownDir } from '@nexo/shared';
import { MarkdownView } from '../../components/MarkdownView';
import { DraftBadge } from './DraftBadge';

const SECTIONS: MarkdownDir[] = ['aprender', 'guia'];

export function ArticlePage() {
  const { t } = useTranslation();
  const { section, slug } = useParams();
  const dir = SECTIONS.find((s) => s === section);
  const doc = dir ? listMarkdown(dir).find((d) => d.slug === slug) : undefined;
  const back = (
    <Link to="/aprender" className="font-semibold underline">
      {t('learn.back')}
    </Link>
  );

  if (!doc) {
    return (
      <div className="space-y-3">
        {back}
        <h1 className="text-3xl font-extrabold tracking-tight">{t('learn.notFound')}</h1>
        <p>{t('learn.notFoundHint')}</p>
      </div>
    );
  }
  return (
    <article className="space-y-3">
      {back}
      <h1 className="text-3xl font-extrabold tracking-tight">
        {doc.meta.title}
        {doc.meta.draft === 'true' && <DraftBadge />}
      </h1>
      <MarkdownView body={doc.body} />
    </article>
  );
}
