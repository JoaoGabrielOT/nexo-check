import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { getMarkdown, listMarkdown } from '@nexo/shared';
import { Alert, Card } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { DraftBadge } from './DraftBadge';
import { MechanismCard } from './MechanismCard';

const MECHANISMS = ['bdnf', 'hipocampo', 'eixo-hpa', 'recompensa', 'pre-frontal'];

/** Frase curta (meta.summary ou 1º parágrafo) e o restante do texto. */
function splitSummary(meta: Record<string, string>, body: string) {
  if (meta.summary) return { summary: meta.summary, rest: body };
  const [first = '', ...others] = body.split(/\n\s*\n/);
  return { summary: first, rest: others.join('\n\n') };
}

const h2 = 'mb-3 text-2xl font-extrabold';
const grid = 'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]';

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
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.learn')}</h1>

      {evidence && (
        <section aria-labelledby="learn-evidence">
          <h2 id="learn-evidence" className={h2}>
            {t('learn.evidence')}
          </h2>
          <MarkdownView body={evidence.body} />
        </section>
      )}

      <section aria-labelledby="learn-mechanisms">
        <h2 id="learn-mechanisms" className={h2}>
          {t('learn.mechanisms')}
        </h2>
        <div className={grid}>
          {mechanisms.map((d) => {
            const { summary, rest } = splitSummary(d.meta, d.body);
            return (
              <MechanismCard
                key={d.slug}
                title={d.meta.title ?? d.slug}
                summary={summary}
                body={rest}
              />
            );
          })}
        </div>
      </section>

      <Alert aria-labelledby="learn-caveat">
        <h2 id="learn-caveat" className="mb-2 text-xl font-extrabold">
          {caveat.meta.title}
        </h2>
        <MarkdownView body={caveat.body} />
      </Alert>

      <section aria-labelledby="learn-guide">
        <h2 id="learn-guide" className={h2}>
          {t('learn.guide')}
        </h2>
        <ul className={grid}>
          {guide.map((g) => (
            <li key={g.slug}>
              <Card className="h-full">
                <Link
                  to={`/aprender/guia/${g.slug}`}
                  className="inline-flex min-h-11 items-center font-extrabold underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl"
                >
                  {g.meta.title}
                </Link>
                {g.meta.draft === 'true' && <DraftBadge />}
                {g.meta.summary && <p className="mt-1 text-sm">{g.meta.summary}</p>}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {references && (
        <section aria-labelledby="learn-refs">
          <h2 id="learn-refs" className={h2}>
            {t('learn.references')}
          </h2>
          <MarkdownView body={references.body} className="text-sm" />
        </section>
      )}

      <section aria-labelledby="learn-notices">
        <h2 id="learn-notices" className={h2}>
          {t('learn.notices')}
        </h2>
        <MarkdownView body={notices.body} className="text-sm" />
      </section>
    </div>
  );
}
