import { describe, expect, it } from 'vitest';
import {
  generateContentModule,
  readContentFiles,
  readGenerated,
} from '../scripts/content-module.mjs';
import { RAW_CONTENT } from '../src/content.generated';
import { getMarkdown, getQuestionnaire, listMarkdown } from '../src/content';
import { questionnaireDefSchema, scoreEducational, stripTextAnswers } from '../src/index';
import type { Answers, QuestionnaireDef } from '../src/index';

const inicial = getQuestionnaire('inicial');
const educativo = getQuestionnaire('educativo');
const final = getQuestionnaire('final');

describe('questionários', () => {
  it('os 3 JSON passam no schema e são rascunhos versionados', () => {
    for (const kind of ['inicial', 'educativo', 'final'] as const) {
      const raw = JSON.parse(RAW_CONTENT[`questionnaires/${kind}.json`] ?? 'null');
      expect(questionnaireDefSchema.safeParse(raw).success).toBe(true);
      expect(raw.kind).toBe(kind);
      expect(raw.version).toBe(1);
      expect(raw.draft).toBe(true);
    }
  });

  it('todo id comparável do inicial existe no final com o mesmo type e options', () => {
    const comparable = inicial.questions.filter((q) => q.comparable);
    expect(comparable.length).toBeGreaterThan(0);
    for (const q of comparable) {
      const f = final.questions.find((x) => x.id === q.id);
      expect(f, q.id).toBeDefined();
      expect(f?.type).toBe(q.type);
      expect(f?.options).toEqual(q.options);
    }
  });

  it('educativo: toda pergunta tem correct presente em options', () => {
    expect(educativo.questions.length).toBeGreaterThanOrEqual(10);
    for (const q of educativo.questions) {
      expect(q.type).toBe('single');
      expect(q.options?.map((o) => o.value)).toContain(q.correct);
    }
  });

  it('existem perguntas dos grupos satisfaction, adherence, activity_frequency e stress', () => {
    const groups = new Set([...inicial.questions, ...final.questions].map((q) => q.group));
    for (const g of ['satisfaction', 'adherence', 'activity_frequency', 'stress'] as const) {
      expect(groups.has(g), g).toBe(true);
    }
    expect(final.questions.filter((q) => q.group === 'satisfaction')).toHaveLength(5);
  });

  it('scoreEducational: tudo certo dá ratio 1; metade errada dá 0.5', () => {
    const all: Answers = Object.fromEntries(
      educativo.questions.map((q) => [q.id, q.correct ?? '']),
    );
    expect(scoreEducational(educativo, all)).toEqual({
      correct: educativo.questions.length,
      total: educativo.questions.length,
      ratio: 1,
    });
    expect(scoreEducational(educativo, {}).ratio).toBe(0);
    const half = Object.fromEntries(
      educativo.questions.map((q, i) => [q.id, i % 2 === 0 ? (q.correct ?? '') : '__errada__']),
    );
    expect(scoreEducational(educativo, half).correct).toBe(
      Math.ceil(educativo.questions.length / 2),
    );
  });

  it('stripTextAnswers remove só as respostas de perguntas text', () => {
    const def: QuestionnaireDef = {
      ...inicial,
      questions: [
        { id: 'a', type: 'text', label: 'x' },
        { id: 'b', type: 'number', label: 'y' },
      ],
    };
    expect(stripTextAnswers(def, { a: 'livre', b: 3, fora: 'x' })).toEqual({ b: 3, fora: 'x' });
  });

  it('o inicial tem a pergunta de texto de dificuldades, que não é enviada', () => {
    const answers: Answers = { dificuldades_outro: 'texto livre', horas_sono: 7 };
    expect(stripTextAnswers(inicial, answers)).toEqual({ horas_sono: 7 });
  });
});

describe('conteúdo Markdown', () => {
  it('aprender tem os 5 mecanismos, ressalva, evidências e referências', () => {
    const slugs = listMarkdown('aprender').map((d) => d.slug);
    for (const s of ['bdnf', 'hipocampo', 'eixo-hpa', 'recompensa', 'pre-frontal']) {
      expect(slugs).toContain(s);
    }
    expect(getMarkdown('aprender/ressalva.md').meta.kind).toBe('alert');
    expect(slugs).toContain('evidencias');
    expect(slugs).toContain('referencias');
    const orders = listMarkdown('aprender').map((d) => Number(d.meta.order));
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('guia: 6 roteiros, todos rascunho com aviso e parada por sintomas', () => {
    const guia = listMarkdown('guia');
    expect(guia.map((d) => d.slug).sort()).toEqual([
      'aos-poucos',
      'caminhada',
      'mobilidade',
      'pausas-ativas',
      'respiracao',
      'sono',
    ]);
    for (const d of guia) {
      expect(d.meta.draft, d.slug).toBe('true');
      expect(d.body).toContain(
        'Rascunho — revisar pelo grupo e pelo profissional de Educação Física',
      );
      expect(d.body.toLowerCase()).toContain('pare se sentir dor, tontura ou falta de ar');
      expect(d.meta.title).toBeTruthy();
      expect(d.meta.summary).toBeTruthy();
    }
  });

  it('oficinas: duas, com duration', () => {
    const o = listMarkdown('oficinas');
    expect(o).toHaveLength(2);
    for (const d of o) expect(d.meta.duration).toBe('45–60 min');
  });

  it('lgpd: consentimento v1 com os três campos provisórios', () => {
    const lgpd = getMarkdown('avisos/lgpd.md');
    expect(lgpd.meta.version).toBe('1');
    for (const p of ['[RESPONSÁVEL PELOS DADOS]', '[CONTATO]', '[PRAZO DE GUARDA]']) {
      expect(lgpd.body).toContain(p);
    }
    expect(getMarkdown('avisos/avisos.md').body).toContain('R$ 0');
  });

  it('lgpd: declara que os nomes dos hábitos criados são enviados e que anotações nunca são', () => {
    const { body } = getMarkdown('avisos/lgpd.md');
    const [enviado = '', nunca = ''] = body.split('**O que nunca é enviado:**');
    expect(enviado).toContain('nomes dos hábitos que você criar');
    expect(nunca).toContain('observações do dia');
    expect(nunca).not.toContain('qualquer texto livre');
  });

  it('getMarkdown falha para caminho inexistente', () => {
    expect(() => getMarkdown('aprender/nao-existe.md')).toThrow();
  });
});

describe('varredura de termos proibidos', () => {
  const forbidden = [
    'causa neurogênese',
    'aumenta o bdnf',
    'aumenta seu bdnf',
    'melhora suas notas',
    'melhora as notas',
    'cura',
    'garante',
  ];

  it('nenhum arquivo contém termos proibidos', () => {
    for (const [path, text] of Object.entries(RAW_CONTENT)) {
      const lower = text.toLowerCase();
      for (const term of forbidden) expect(lower.includes(term), `${path}: ${term}`).toBe(false);
    }
  });

  it('toda linha com HIIT diz modalidade estudada, ou está em ressalva/referências', () => {
    for (const [path, text] of Object.entries(RAW_CONTENT)) {
      if (path.endsWith('ressalva.md') || path.endsWith('referencias.md')) continue;
      for (const line of text.split('\n')) {
        if (/hiit/i.test(line)) expect(line, path).toMatch(/modalidade estudada/i);
      }
    }
  });
});

describe('content.generated.ts', () => {
  it('está em dia com content/ (rode pnpm --filter @nexo/shared content:build)', () => {
    expect(readGenerated()).toBe(generateContentModule(readContentFiles()));
  });
});
