import { RAW_CONTENT } from './content.generated';
import {
  questionnaireDefSchema,
  type QuestionnaireDef,
  type QuestionnaireKind,
} from './schemas/questionnaire';

export type MarkdownDir = 'aprender' | 'guia' | 'oficinas' | 'avisos';
export interface MarkdownDoc {
  meta: Record<string, string>;
  body: string;
}

function parseFrontMatter(raw: string): MarkdownDoc {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length).trim() };
}

/** `path` relativo a `content/`, ex.: `aprender/bdnf.md`. */
export function getMarkdown(path: string): MarkdownDoc {
  const raw = RAW_CONTENT[path];
  if (raw === undefined) throw new Error(`Conteúdo não encontrado: ${path}`);
  return parseFrontMatter(raw);
}

export function listMarkdown(dir: MarkdownDir): (MarkdownDoc & { slug: string })[] {
  const prefix = `${dir}/`;
  return Object.keys(RAW_CONTENT)
    .filter((p) => p.startsWith(prefix) && p.endsWith('.md'))
    .map((p) => ({ slug: p.slice(prefix.length, -3), ...getMarkdown(p) }))
    .sort(
      (a, b) =>
        Number(a.meta.order ?? 999) - Number(b.meta.order ?? 999) || a.slug.localeCompare(b.slug),
    );
}

export function getQuestionnaire(kind: QuestionnaireKind): QuestionnaireDef {
  const raw = RAW_CONTENT[`questionnaires/${kind}.json`];
  if (raw === undefined) throw new Error(`Questionário não encontrado: ${kind}`);
  return questionnaireDefSchema.parse(JSON.parse(raw));
}
