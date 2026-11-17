# NEXO Check — Fase A (Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a versão web completa do NEXO Check (app offline/PWA, questionários, oficinas e check-in, API com sincronização anônima, painel admin com indicadores), publicada na Vercel (frontend) e no Render (API), com banco no Neon.

**Architecture:** Monorepo pnpm + Turborepo. `packages/shared` concentra tipos, schemas Zod, regras puras (cumprimento de hábito, streak, modo progressivo, conquistas, indicadores) e o conteúdo em Markdown/JSON; o client (React + Vite) grava tudo no IndexedDB (Dexie) e, com consentimento, enfileira alterações num outbox que sincroniza com a API Fastify/Prisma por last-write-wins. O `/admin` é uma rota web carregada sob demanda.

**Tech Stack:** pnpm 10, Turborepo 2, TypeScript 5 strict, React 19, Vite, React Router 7 (modo biblioteca), Tailwind CSS 4, shadcn/ui, Lucide, Dexie 4 + dexie-react-hooks, Recharts, i18next + react-i18next, vite-plugin-pwa, marked + DOMPurify, qrcode, Zod, Fastify 5 (+ @fastify/cors, @fastify/helmet, @fastify/rate-limit, @fastify/jwt), Prisma (última estável) + PostgreSQL, embedded-postgres (testes da API), Vitest + Testing Library + fake-indexeddb, Playwright, ESLint (flat) + Prettier + Husky + lint-staged + commitlint.

**Spec:** `docs/superpowers/specs/2026-11-17-nexo-check-design.md` (ler §§2, 6, 7, 8, 9, 12, 12.1 e 13 antes de qualquer tarefa).

**Execução:** subagent-driven com os agentes do projeto (`.claude/agents`). `testador` escreve os testes que falham; `implementador` faz o código até passar (delegando comandos ao `terminal` e o acompanhamento do CI ao `monitor-ci`); `revisor` revisa o diff de cada tarefa antes do próximo passo, com revisão final da fase. Passos com Claude in Chrome (Task 23) e criação do repositório (Task 1, Step 10) ficam com a sessão principal.

## Global Constraints

- Linguagem cautelosa em todo texto: "pode contribuir", "está associado a". Proibido afirmar que o app/oficinas causam neurogênese, aumentam BDNF ou melhoram notas.
- HIIT só como "modalidade estudada"; nunca meta ou recomendação. Intensidade sempre "leve a moderada", com opção adaptada.
- Sem metas de redução de estresse: só comparar antes e depois.
- Aviso visível em onboarding, Aprender e Configurações: o app não substitui acompanhamento profissional; as atividades devem respeitar os limites de cada pessoa.
- Sem consentimento: nenhuma requisição com dados do participante sai do app e o outbox não é preenchido.
- Texto livre (`DailyLog.note`, respostas `text`) nunca é enviado ao servidor.
- Código de participante: `/^NEXO-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/` (Crockford base32). Chave de recuperação: 24 caracteres do mesmo alfabeto. Código de sessão de oficina: 6 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.
- Tokens de cor: `--bg #f7f5f2`, `--navy #1d1a5c`, `--lav #a8a4c2`, `--lav2 #c9c6dc`, `--or #f5a64a`, `--rd #c0575a`, `--bl #3a8bc8`, branco `#fff`. Montserrat 400/600/800 via `@fontsource/montserrat`. Painel raio 36 px, card 24 px, botões em pílula, alerta com borda esquerda vermelha de 8 px.
- Acessibilidade WCAG AA; alvos de toque ≥ 44 px; foco visível `3px solid var(--bl)`; animações só sob `prefers-reduced-motion: no-preference`.
- Idioma pt-BR via i18next; nenhum texto de UI hardcoded fora de `apps/client/src/i18n/pt-BR.json` (conteúdo longo fica em `packages/shared/content`).
- Commits em Conventional Commits, terminando com as linhas de atribuição da sessão. Um commit por tarefa (ou mais, se a tarefa tiver passos de commit).
- Repositório: `github.com/JoaoGabrielOT/nexo-check`, público. Nada de segredo, `.env` ou chave no git.
- API em `/v1`; headers de participante `x-participant-code` e `x-participant-key`.
- Constantes de regra (em `packages/shared/src/constants.ts`): `STREAK_THRESHOLD = 0.5`, `PROGRESSIVE_START = 10`, `PROGRESSIVE_STEP = 5`, `PROGRESSIVE_DAYS_REQUIRED = 5` (de 7), `PROGRESSIVE_DEFAULT_CEILING = 30`, `CONSENT_VERSION = 1`, `SYNC_TIMEOUT_MS = 60000`, `SYNC_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]`, `SYNC_INTERVAL_MS = 900000`, `MAX_CLOCK_SKEW_MS = 300000`, `SESSION_VALID_HOURS_AFTER = 24`, `ADMIN_JWT_TTL = '8h'`.

## Review Focus

1. **App aberto na virada da meia-noite:** marcar um hábito depois da meia-noite grava no novo dia, e a tela mostra o dia novo zerado sem recarregar. → teste com fake timers na Task 10.
2. **Reenvio após falha/cold start:** reenviar o mesmo lote ao `POST /v1/sync` (timeout no cliente após o servidor já ter aplicado) não duplica nem altera o resultado; o outbox só é limpo após resposta 2xx. → testes nas Tasks 18 e 20.
3. **Mudar a meta não reescreve o passado:** dias anteriores mantêm "cumprido/não cumprido" calculado com a meta da época (`HabitEntry.targetSnapshot`). → teste na Task 2.
4. **Importar backup inválido ou de outra versão:** rejeita com mensagem clara e não apaga nem altera os dados atuais. → teste na Task 13.
5. **Revogar consentimento / apagar tudo sem conexão:** revogar limpa o outbox e para os envios imediatamente; "apagar tudo" com sincronização ativa tenta apagar no servidor primeiro e, se falhar, pergunta se apaga só no aparelho (nunca apaga localmente em silêncio deixando dados no servidor). → testes nas Tasks 13 e 20.

---

## Estrutura de arquivos (Fase A)

```
.gitignore  .prettierrc  .nvmrc  eslint.config.js  commitlint.config.js
package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
.husky/pre-commit  .husky/commit-msg
.github/workflows/ci.yml
render.yaml  README.md
docs/piloto-nexo.html  docs/origem/{app-checklist-nexo.md,prompt-claude-code-nexo-check.md}
packages/shared/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts            reexporta tudo
  src/constants.ts        constantes da seção Global Constraints
  src/types.ts            Habit, HabitEntry, DailyLog, QuestionnaireResponse, Checkin, Settings
  src/dates.ts            datas locais
  src/habits.ts           hábitos padrão e cumprimento
  src/streak.ts           streak e recorde
  src/progressive.ts      modo progressivo
  src/achievements.ts     conquistas
  src/semver.ts           comparação de versões
  src/codes.ts            códigos de participante, chave, sessão
  src/privacy.ts          remoção de campos privados
  src/csv.ts              serialização CSV
  src/indicators.ts       cálculo dos 6 indicadores
  src/schemas/entities.ts schemas Zod das entidades
  src/schemas/api.ts      schemas Zod dos payloads da API
  src/schemas/questionnaire.ts schema dos JSON de questionário
  src/content.ts          carregamento tipado do conteúdo (glob)
  content/aprender/*.md   mecanismos, ressalva, referências
  content/guia/*.md       guia digital (rascunhos)
  content/oficinas/*.md   oficina-1.md, oficina-2.md
  content/avisos/*.md     avisos.md, lgpd.md
  content/questionnaires/{inicial,educativo,final}.json
  test/*.test.ts
packages/ui/
  package.json  src/index.ts  src/styles/theme.css
  src/components/*.tsx    button, card, panel, alert, tabs, dialog, switch, input, scale, toast, decorative-pills
  test/*.test.tsx
apps/client/
  package.json  vite.config.ts  index.html  vercel.json  playwright.config.ts
  public/icons/*
  src/main.tsx  src/app/router.tsx  src/app/layout.tsx  src/app/theme.ts
  src/i18n/index.ts  src/i18n/pt-BR.json
  src/db/db.ts  src/db/repos/*.ts
  src/sync/http.ts  src/sync/engine.ts  src/sync/useSyncStatus.ts
  src/platform/notifications.ts  src/platform/files.ts
  src/features/{onboarding,hoje,registro,progresso,aprender,projeto,config,admin}/...
  test/**/*.test.tsx  e2e/*.spec.ts
apps/api/
  package.json  tsconfig.json  vitest.config.ts  prisma.config.ts (se Prisma 7)
  prisma/schema.prisma  prisma/migrations/*
  src/server.ts  src/app.ts  src/env.ts  src/db.ts
  src/plugins/participant-auth.ts  src/plugins/admin-auth.ts
  src/routes/{health,participants,sync,questionnaires,checkins,admin}.ts
  src/services/stats.ts
  test/setup/global-setup.ts  test/helpers.ts  test/*.test.ts
```

---

### Task 1: Repositório, monorepo e CI

**Files:**
- Create: arquivos da raiz listados acima, `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/constants.ts}`, `packages/shared/test/constants.test.ts`, `.github/workflows/ci.yml`
- Move: `PILOTO - NEXO.html` → `docs/piloto-nexo.html`; `app-checklist-nexo.md`, `prompt-claude-code-nexo-check.md` → `docs/origem/`

**Interfaces:**
- Produces: scripts raiz `pnpm dev | build | lint | typecheck | test | test:e2e | format` (via turbo); pacote `@nexo/shared` (ESM, `exports: "./src/index.ts"` para consumo interno sem build); `tsconfig.base.json` com `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`.

- [ ] **Step 1:** Instalar pnpm (`corepack enable pnpm`; se negar permissão, `npm i -g pnpm@10`) e conferir `pnpm -v` ≥ 10.
- [ ] **Step 2:** `git init -b main`, mover os arquivos, criar `.gitignore` com: `node_modules`, `dist`, `.turbo`, `coverage`, `playwright-report`, `test-results`, `.env*` (exceto `.env.example`), `*.keystore`, `*.jks`, `*.key`, `CONTEXTO_SESSAO.md`, `abrir-sessao-claude.cmd`, `.claude/settings.local.json`, `src-tauri/target`.
- [ ] **Step 3:** Criar raiz do monorepo (`package.json` com `"packageManager": "pnpm@10.x"`, `"version": "0.0.0"`, `engines.node >=22`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (tasks `build`, `lint`, `typecheck`, `test`, `dev` persistente), ESLint flat (typescript-eslint strict, react-hooks, jsx-a11y para `.tsx`), Prettier, Husky (`pre-commit`: lint-staged; `commit-msg`: commitlint conventional).
- [ ] **Step 4: Teste que falha** — `packages/shared/test/constants.test.ts`:

```ts
import { STREAK_THRESHOLD, CONSENT_VERSION, SYNC_RETRY_DELAYS_MS } from '../src';
test('constantes do design', () => {
  expect(STREAK_THRESHOLD).toBe(0.5);
  expect(CONSENT_VERSION).toBe(1);
  expect(SYNC_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
});
```

- [ ] **Step 5:** `pnpm --filter @nexo/shared test` → FAIL (módulo sem exports).
- [ ] **Step 6:** Criar `src/constants.ts` com todas as constantes da seção Global Constraints e reexportar em `src/index.ts`.
- [ ] **Step 7:** `pnpm lint && pnpm typecheck && pnpm test` → tudo PASS.
- [ ] **Step 8:** `ci.yml`: em `pull_request` e `push` na `main`; ubuntu-latest; `pnpm/action-setup` + `actions/setup-node` (Node 22, cache pnpm); `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`. (Playwright entra na Task 22.)
- [ ] **Step 9:** Commit `chore: bootstrap monorepo and CI`.
- [ ] **Step 10:** Criar o repositório público `JoaoGabrielOT/nexo-check` pela API do GitHub usando a credencial do Git Credential Manager (`git credential fill` → `POST https://api.github.com/user/repos` com `{"name":"nexo-check","private":false,"description":"NEXO Check — checklist diário do projeto NEXO em Movimento"}`), sem imprimir o token. `git remote add origin`, `git push -u origin main`.
- [ ] **Step 11:** Conferir que o workflow CI terminou verde (agente `monitor-ci` ou API pública `GET /repos/JoaoGabrielOT/nexo-check/actions/runs`).

---

### Task 2: Datas locais, hábitos padrão e cumprimento

**Files:**
- Create: `packages/shared/src/{types.ts,dates.ts,habits.ts}`, `packages/shared/test/{dates,habits}.test.ts`

**Interfaces:**
- Produces:
  - `type HabitType = 'boolean' | 'counter' | 'minutes' | 'range_hours'`
  - `interface SyncMeta { id: string; updatedAt: string; deletedAt: string | null }`
  - `interface Habit extends SyncMeta { key: DefaultHabitKey | null; name: string; description: string; type: HabitType; target: number; targetMax: number | null; active: boolean; order: number; progressive: { enabled: boolean; ceiling: number } | null }`
  - `type DefaultHabitKey = 'movement' | 'active_breaks' | 'mobility' | 'breathing' | 'sleep' | 'hydration'`
  - `interface HabitEntry extends SyncMeta { habitId: string; date: string; value: number; blocks: number[]; targetSnapshot: number; targetMaxSnapshot: number | null }` — `id` = `` `${habitId}:${date}` ``
  - `interface DailyLog extends SyncMeta { date: string; stress: Scale; mood: Scale; energy: Scale; sleepQuality: Scale; note: string | null }` — `id` = `date`; `type Scale = 1|2|3|4|5`
  - `toLocalDateKey(d: Date): string` (`YYYY-MM-DD` no fuso local)
  - `msUntilNextLocalMidnight(now: Date): number`
  - `lastNDateKeys(today: string, n: number): string[]` (mais antigo primeiro, inclui `today`)
  - `createDefaultHabits(now: Date, newId: () => string): Habit[]`
  - `isEntryMet(habitType: HabitType, entry: HabitEntry | undefined): boolean`
  - `dayProgress(habits: Habit[], entries: HabitEntry[], date: string): { done: number; total: number; ratio: number }` (só hábitos ativos e não deletados; `ratio = 0` quando `total = 0`)
  - `makeEntry(habit: Habit, date: string, value: number, blocks: number[], now: Date): HabitEntry` (copia `target/targetMax` para os snapshots)

- [ ] **Step 1: Testes que falham**:
  - `toLocalDateKey(new Date(2026, 0, 5, 23, 59))` → `'2026-01-05'`; `msUntilNextLocalMidnight(new Date(2026,0,5,23,59,0))` → `60000`; `lastNDateKeys('2026-03-01', 3)` → `['2026-02-27','2026-02-28','2026-03-01']`.
  - `createDefaultHabits` devolve 6 hábitos na ordem movement, active_breaks, mobility, breathing, sleep, hydration com `(type,target,targetMax)` = `(minutes,30,null)`, `(counter,6,null)`, `(minutes,5,null)`, `(boolean,1,null)`, `(range_hours,7,9)`, `(counter,8,null)`; todos `active: true`; movement com `progressive: { enabled: false, ceiling: 30 }`.
  - `isEntryMet`: boolean value 1 → true; counter 5/6 → false, 6/6 → true; minutes blocks [10,20] value 30 target 30 → true; range_hours 6.5 (7–9) → false, 8 → true, 9.5 → false; entry undefined → false.
  - **Review Focus 3:** `makeEntry(habit{target:30}, ...)` com value 25 → não cumprido; depois mudar `habit.target = 20` e recalcular `dayProgress` do dia antigo usando a entry existente → continua não cumprido (cumprimento usa `targetSnapshot`).
  - `dayProgress` com 6 ativos, 3 cumpridos, 1 inativo cumprido → `{done:3,total:6,ratio:0.5}`.
- [ ] **Step 2:** `pnpm --filter @nexo/shared test` → FAIL.
- [ ] **Step 3:** Implementar os tipos e funções acima; textos `name/description` dos hábitos padrão em pt-BR conforme a tabela de §6.1 do design (ex.: descrição de pausas ativas "1 a cada 1 h sentado"; mobilidade "5 a 10 min"; respiração "1 sessão de 3 a 5 min").
- [ ] **Step 4:** Testes → PASS.
- [ ] **Step 5:** Commit `feat(shared): habits, local dates and completion rules`.

---

### Task 3: Streak, modo progressivo, conquistas e semver

**Files:**
- Create: `packages/shared/src/{streak.ts,progressive.ts,achievements.ts,semver.ts}`, testes correspondentes

**Interfaces:**
- Consumes: `lastNDateKeys`, `dayProgress`, `STREAK_THRESHOLD`, constantes `PROGRESSIVE_*`
- Produces:
  - `computeStreak(ratiosByDate: Record<string, number>, today: string): { current: number; best: number }` — dia válido se `ratio >= STREAK_THRESHOLD`; se `today` ainda não é válido, o streak atual conta até ontem (não zera durante o dia).
  - `nextProgressiveTarget(currentTarget: number, last7Met: boolean[], ceiling: number): number` — +`PROGRESSIVE_STEP` se ≥ `PROGRESSIVE_DAYS_REQUIRED` true, limitado ao `ceiling`; senão mantém.
  - `type AchievementId = 'first_full_day' | 'streak_3' | 'streak_7' | 'first_perfect_week' | 'breathing_10' | 'first_checkin' | 'initial_questionnaire'`
  - `interface AchievementState { ratiosByDate: Record<string, number>; today: string; breathingSessions: number; confirmedCheckins: number; initialQuestionnaireDone: boolean }`
  - `evaluateAchievements(s: AchievementState): AchievementId[]`
  - `ACHIEVEMENTS: Record<AchievementId, { titleKey: string; descriptionKey: string }>` (chaves i18n)
  - `compareSemver(a: string, b: string): -1 | 0 | 1` (aceita prefixo `v`; ignora pré-release na Fase A)

- [ ] **Step 1: Testes que falham**:
  - streak: ratios {d1:1, d2:0.5, d3:0.4, d4:1, d5:1}, today=d5 → `{current:2,best:2}`; {d1..d3:1, d4 (today):0} → `{current:3,best:3}`; vazio → `{0,0}`.
  - progressivo: `(10,[t,t,t,t,t,f,f],30)` → 15; `(10,[t,t,t,t,f,f,f],30)` → 10; `(30,[t×7],30)` → 30; `(28,[t×7],30)` → 30.
  - conquistas: 7 dias consecutivos com ratio 1 → contém `first_full_day`, `streak_3`, `streak_7`, `first_perfect_week`; `breathingSessions: 10` → contém `breathing_10`; nada → `[]`.
  - semver: `('v0.1.0','0.1.0')` → 0; `('0.2.0','0.10.0')` → -1; `('1.0.0','0.9.9')` → 1.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(shared): streak, progressive goal, achievements, semver`.

---

### Task 4: Códigos, privacidade, CSV e schemas Zod

**Files:**
- Create: `packages/shared/src/{codes.ts,privacy.ts,csv.ts}`, `src/schemas/{entities.ts,api.ts}`, testes

**Interfaces:**
- Produces:
  - `generateParticipantCode(rand?: () => number): string`, `generateRecoveryKey(rand?): string`, `generateSessionCode(rand?): string`, `isParticipantCode(s: string): boolean`, `normalizeCode(s: string): string` (maiúsculas, trim, troca `O→0`, `I/L→1` no corpo do código de participante)
  - `stripPrivateFields<T extends SyncEntityName>(entity: T, payload: EntityPayload<T>): EntityPayload<T>` — `dailyLog.note → null` (respostas de texto livre são tratadas por `stripTextAnswers`, na Task 5)
  - `toCsv(rows: Record<string, string | number | boolean | null>[], columns: string[]): string` — separador `;`, CRLF, aspas duplas quando houver `;`, `"`, quebra de linha; BOM UTF-8 no início (Excel pt-BR).
  - Schemas (`zod`): `habitSchema`, `habitEntrySchema`, `dailyLogSchema`; `syncEntityName = z.enum(['habit','habitEntry','dailyLog'])`; `syncChangeSchema = { entity, entityId, payload, updatedAt (ISO), deletedAt (ISO|null) }`
  - API: `registerRequest {code, key, consentVersion}`, `syncPushRequest {changes: syncChange[] (max 500)}`, `syncPushResponse {applied:number, cursor:string}`, `syncPullResponse {changes, cursor}`, `questionnaireSubmit {id, kind, version, answers, submittedAt}`, `questionnaireSubmitResponse {score: number|null}`, `checkinRequest {sessionCode, clientId}`, `checkinResponse {status:'confirmed', workshop: 1|2, date}`, `adminLoginRequest {password}`, `adminLoginResponse {token}`, `sessionCreate {workshop:1|2, date:'YYYY-MM-DD', location}`, `sessionView {id, workshop, date, location, code, checkinUrl, expiresAt, checkins, manualCount}`, `manualAttendanceUpdate {manualCount: int ≥ 0}`, `apiError {error: string, message: string}`
  - Tipos inferidos exportados (`SyncChange`, `RegisterRequest`, ...).

- [ ] **Step 1: Testes que falham**: 1000 códigos gerados passam em `isParticipantCode`; `generateRecoveryKey().length === 24`; `generateSessionCode()` casa `/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/`; `normalizeCode(' nexo-4f7k ')` → `'NEXO-4F7K'`; `stripPrivateFields('dailyLog', {...note:'triste'})` → `note: null`; `toCsv([{a:'x;y',b:1}],['a','b'])` → `'﻿a;b\r\n"x;y";1\r\n'`; `syncPushRequest.safeParse` rejeita 501 mudanças e `updatedAt` não ISO.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (`crypto.getRandomValues` como fonte padrão). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(shared): codes, privacy, csv and zod schemas`.

---

### Task 5: Conteúdo (Markdown/JSON) e validação de conteúdo

**Files:**
- Create: `packages/shared/content/**` (lista na estrutura), `packages/shared/src/schemas/questionnaire.ts`, `packages/shared/src/content.ts`, `packages/shared/test/content.test.ts`

**Interfaces:**
- Produces:
  - `questionnaireDefSchema`: `{ kind: 'inicial'|'educativo'|'final', version: number, draft: boolean, title, intro, questions: Question[] }`; `Question = { id, type: 'scale'|'single'|'multi'|'number'|'text', label, options?: {value,label}[], correct?: string (só educativo/single), min?, max?, unit?, comparable?: boolean, group?: 'satisfaction'|'adherence'|'activity_frequency'|'stress'|'sleep'|'sedentary' }`
  - `type AnswerValue = number | string | string[]`; `type Answers = Record<string, AnswerValue>`
  - `scoreEducational(def: QuestionnaireDef, answers: Answers): { correct: number; total: number; ratio: number }`
  - `stripTextAnswers(def: QuestionnaireDef, answers: Answers): Answers` — remove as respostas de perguntas `type: 'text'`
  - `content.ts`: `getMarkdown(path: string): { meta: Record<string,string>; body: string }` (front-matter simples `---\nkey: value\n---`), `listMarkdown(dir: 'aprender'|'guia'|'oficinas'|'avisos'): {slug, meta, body}[]` ordenado por `meta.order`, `getQuestionnaire(kind): QuestionnaireDef` — via `import.meta.glob('../content/**/*.{md,json}', { eager: true, query: '?raw', import: 'default' })`.

- [ ] **Step 1:** Escrever o conteúdo:
  - `aprender/`: `bdnf.md`, `hipocampo.md`, `eixo-hpa.md`, `recompensa.md`, `pre-frontal.md` (frase do piloto + 1 parágrafo cauteloso), `ressalva.md` (texto literal da "Ressalva científica" do piloto, `meta.kind: alert`), `referencias.md` (lista do piloto), `evidencias.md` (parágrafo Huang et al. 2024 do piloto).
  - `oficinas/oficina-1.md`, `oficina-2.md`: título, `duration: 45–60 min`, descrição e base científica literais do piloto.
  - `guia/`: `pausas-ativas.md`, `caminhada.md` (roteiros de 10, 20, 30 min, ritmo em que dá para conversar), `mobilidade.md`, `respiracao.md` (3–5 min), `sono.md`, `aos-poucos.md`; cada um com `draft: true` e o aviso "Rascunho — revisar pelo grupo e pelo profissional de Educação Física".
  - `avisos/avisos.md` (não substitui acompanhamento; respeite seus limites; condição de saúde → orientação profissional; custo R$ 0), `avisos/lgpd.md` (consentimento v1 com `[RESPONSÁVEL PELOS DADOS]`, `[CONTATO]`, `[PRAZO DE GUARDA]`; o que é enviado: hábitos, registros 1–5, respostas fechadas, presença; o que nunca é: nome, e-mail, telefone, observações e textos livres).
  - `questionnaires/*.json` com `draft: true`, perguntas de §6.5 do design; `comparable: true` + `group` nas perguntas do inicial reaplicadas no final com o mesmo `id`; educativo com ~10 perguntas `single` com `correct`; final com bloco `satisfaction` (5 afirmações `scale`) e `adherence` (`single` sim/não + `multi` quais atividades).
- [ ] **Step 2: Testes que falham** (`content.test.ts`):
  - os 3 JSON passam em `questionnaireDefSchema`;
  - todo `id` com `comparable: true` no inicial existe no final com o mesmo `type` e `options`;
  - educativo: toda pergunta tem `correct` presente em `options`;
  - existem perguntas com `group` `satisfaction`, `adherence`, `activity_frequency`, `stress`;
  - varredura em todo `.md`/`.json`: nenhuma ocorrência (case-insensitive) de `causa neurogênese`, `aumenta o bdnf`, `aumenta seu bdnf`, `melhora suas notas`, `melhora as notas`, `cura`, `garante`; toda linha com `HIIT` contém `modalidade estudada` ou está em `ressalva.md`/`referencias.md`;
  - `listMarkdown('aprender')` tem os 5 mecanismos + ressalva; `scoreEducational` com todas certas → `ratio 1`.
- [ ] **Step 3:** Rodar → FAIL (schema/loader inexistentes). **Step 4:** Implementar schema, loader e `scoreEducational`. **Step 5:** PASS.
- [ ] **Step 6:** Commit `feat(shared): educational content, questionnaire drafts and content checks`.

---

### Task 6: Indicadores (cálculo puro)

**Files:**
- Create: `packages/shared/src/indicators.ts`, `packages/shared/test/indicators.test.ts`

**Interfaces:**
- Consumes: `scoreEducational`, `QuestionnaireDef`
- Produces:
  - `interface IndicatorInput { participantsWithCheckin: number; manualAttendance: number; educational: { correct: number; total: number }[]; finalResponses: Answers[]; initialResponses: Answers[]; finalDef: QuestionnaireDef; initialDef: QuestionnaireDef; dailyStress: { participantId: string; date: string; stress: number }[]; participantsWithMovementEntry: number; totalParticipants: number }`
  - `type IndicatorStatus = 'below' | 'met' | 'comparison'`
  - `interface Indicator { id: 'participation'|'comprehension'|'acceptance'|'adherence'|'stress'|'activity_frequency'; value: string; target: string; status: IndicatorStatus; n: number; smallSample: boolean; detail?: Record<string, number | null> }`
  - `computeIndicators(i: IndicatorInput): Indicator[]` (ordem acima)

- [ ] **Step 1: Testes que falham**, regras de §9 do design:
  - participação = checkins + manuais; 18+3 → value `'21'`, status `met`, detail `{checkins:18, manual:3}`; 15 → `below`.
  - compreensão: soma 40 certas / 50 → `'80%'`, `met`; 39/50 → `below`.
  - aceitação: % das respostas `group: satisfaction` com valor ≥ 4; 8 de 10 → `met`.
  - adesão: % de finais com `adherence` sim; 6/10 → `met`; detail inclui `checklistMovement = participantsWithMovementEntry/totalParticipants`.
  - estresse: status sempre `comparison`; detail `{questionnaireBefore, questionnaireAfter, dailyFirst7, dailyLast7}`; diário só de participantes com ≥ 14 dias; sem dados → `null`.
  - frequência: `comparison`, média da pergunta `group: activity_frequency` inicial x final.
  - `smallSample: true` quando `n < 10`; n = 0 → value `'—'` e status `below` (exceto `comparison`).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(shared): pilot indicators computation`.

---

### Task 7: Pacote UI e tema NEXO

**Files:**
- Create: `packages/ui/**` (estrutura acima)

**Interfaces:**
- Produces: `@nexo/ui` exporta `Button` (variants `primary|secondary|ghost|danger`, sempre pílula, `min-h-11`), `Card` (raio 24), `Panel` (lavanda, raio 36), `Alert` (borda esquerda `--rd` 8 px, `role="note"`), `Tabs` (pílulas, navy selecionado; Radix), `Dialog`, `Switch`, `Input`, `ScalePicker` (`value: 1..5 | null`, `onChange`, `label`, rótulos das extremidades; `role="radiogroup"`), `Toaster`/`toast`, `DecorativePills` (`aria-hidden`, fixas como `.blob/.l1/.l2` do piloto), `cn()`. `src/styles/theme.css` com `@theme` Tailwind 4 mapeando os tokens e o bloco `.dark` (fundo `--navy`, superfícies `#2a2670`, texto `#f7f5f2`).

- [ ] **Step 1:** Inicializar shadcn/ui no monorepo (Tailwind 4, componentes em `packages/ui`), Vitest + Testing Library + jsdom.
- [ ] **Step 2: Testes que falham**: `Button` renderiza com classe `rounded-full` e `min-h-11`; `ScalePicker` com teclado (setas) muda o valor e chama `onChange(3)`; `Alert` tem `role="note"`; `DecorativePills` tem `aria-hidden="true"`.
- [ ] **Step 3:** FAIL. **Step 4:** Implementar componentes e tema. **Step 5:** PASS.
- [ ] **Step 6:** Commit `feat(ui): NEXO design system components`.

---

### Task 8: Client — esqueleto, rotas, layout, i18n, tema e PWA

**Files:**
- Create: `apps/client/{package.json,vite.config.ts,index.html,vercel.json}`, `src/main.tsx`, `src/app/{router.tsx,layout.tsx,theme.ts}`, `src/i18n/{index.ts,pt-BR.json}`, `src/features/*/index.tsx` (placeholders), `public/icons/*`, `test/layout.test.tsx`

**Interfaces:**
- Produces:
  - Rotas: `/` Hoje, `/registro`, `/progresso`, `/aprender`, `/aprender/:section/:slug`, `/projeto`, `/projeto/questionario/:kind`, `/checkin`, `/config`, `/onboarding`, `/admin/*` (só quando `!import.meta.env.TAURI_ENV_PLATFORM`, via `lazy()`).
  - `useTheme(): { theme: 'light'|'dark'|'system'; setTheme(t) }` — aplica classe `dark` no `<html>`; persiste em `settings` (Task 9) com fallback em memória.
  - Layout: bottom nav (5 itens: Hoje, Registro, Progresso, Aprender, Projeto + ícone Config no header) abaixo de 1024 px; sidebar a partir de 1024 px; `DecorativePills`; link "Pular para o conteúdo".
  - PWA: `vite-plugin-pwa` `registerType: 'prompt'`, manifest (nome "NEXO Check", `theme_color #1d1a5c`, `background_color #f7f5f2`, ícones 192/512/maskable); `useRegisterSW` mostra toast i18n `pwa.updateAvailable` ("Nova versão disponível — recarregar").
  - `vercel.json`: rewrite `/(.*)` → `/index.html`, headers de cache para `/assets/*`.
  - Env: `VITE_API_URL` (padrão `http://localhost:3333` em dev).
- [ ] **Step 1: Teste que falha** `layout.test.tsx`: em viewport padrão, os 5 itens de navegação têm nome acessível (`Hoje`, `Registro`, `Progresso`, `Aprender`, `Projeto`) e o item ativo tem `aria-current="page"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS; `pnpm --filter client build` gera `dist/` com `manifest.webmanifest` e `sw.js`.
- [ ] **Step 5:** Commit `feat(client): app shell, routing, theme, i18n and PWA`.

---

### Task 9: Client — banco local (Dexie) e outbox

**Files:**
- Create: `apps/client/src/db/db.ts`, `src/db/repos/{settings,habits,entries,dailyLogs,questionnaires,checkins,outbox}.ts`, `test/db/*.test.ts`

**Interfaces:**
- Consumes: tipos e `createDefaultHabits`, `makeEntry`, `stripPrivateFields` de `@nexo/shared`
- Produces:
  - `db` (Dexie `nexo-check`, versão 1): `habits` (`id, order`), `habitEntries` (`id, date, habitId`), `dailyLogs` (`id, date`), `questionnaireResponses` (`id, kind`), `checkins` (`id, status`), `settings` (`key`), `outbox` (`++seq, entity, entityId`).
  - `interface AppSettings { onboardingDone: boolean; consent: { granted: boolean; version: number; at: string } | null; participant: { code: string; key: string; registered: boolean } | null; theme: 'light'|'dark'|'system'; reminders: ReminderSettings; syncCursor: string | null; lastSyncAt: string | null; unlockedAchievements: { id: AchievementId; at: string }[] }`
  - `getSettings(): Promise<AppSettings>`, `updateSettings(patch: Partial<AppSettings>): Promise<void>`
  - `saveHabit(h: Habit)`, `deleteHabit(id)` (tombstone), `ensureDefaultHabits(now)`
  - `setEntry(habit: Habit, date: string, value: number, blocks?: number[])`, `getEntriesForDate(date)`, `getEntriesBetween(from, to)`
  - `saveDailyLog(log: Omit<DailyLog,'updatedAt'|'deletedAt'>)`, `getDailyLog(date)`, `getDailyLogsBetween(from,to)`
  - `interface LocalQuestionnaireResponse { id: string; kind: 'inicial'|'educativo'|'final'; version: number; answers: Answers; score: number | null; submittedAt: string; syncedAt: string | null }`
  - `interface LocalCheckin { id: string; sessionCode: string; createdAt: string; status: 'pending'|'confirmed'|'rejected'; reason: 'invalid_code'|'expired'|null; workshop: 1|2|null; date: string|null; syncedAt: string | null }` (`id` também é o `clientId` enviado à API)
  - `saveQuestionnaireResponse(r: Omit<LocalQuestionnaireResponse,'syncedAt'>)`, `getQuestionnaireResponses(kind?)`, `markQuestionnaireSynced(id, at)`
  - `addCheckin(sessionCode): Promise<LocalCheckin>`, `updateCheckinStatus(id, patch: Partial<LocalCheckin>)`
  - outbox: toda escrita sincronizável (`habit`, `habitEntry`, `dailyLog`) roda `db.transaction('rw', [tabela, outbox, settings])` e só chama `enqueue(change)` se `settings.consent?.granted`; `peekOutbox(limit): Promise<{seq:number; change: SyncChange}[]>`, `ackOutbox(seqs: number[])`, `clearOutbox()`, `outboxCount()`.
  - `applyRemoteChanges(changes: SyncChange[])`: LWW local (aplica só se `updatedAt` remoto > local) sem reenfileirar.
  - `exportAll(): Promise<BackupFile>` / `importAll(file: unknown): Promise<void>` — `BackupFile = { app: 'nexo-check', schemaVersion: 1, exportedAt, data: {...todas as tabelas exceto outbox} }` (implementação de UI na Task 13; a função e validação Zod ficam aqui).
  - `wipeLocal()`
- [ ] **Step 1: Testes que falham** (fake-indexeddb): sem consentimento `setEntry` não enfileira (`outboxCount() === 0`); com consentimento enfileira 1 mudança com `payload.note === null` para `dailyLog`; `setEntry` duas vezes no mesmo dia mantém 1 registro (`id = habitId:date`) e 2 itens de outbox; `applyRemoteChanges` com `updatedAt` mais antigo não sobrescreve; `importAll({app:'outro'})` rejeita e os dados existentes continuam (**Review Focus 4**); `importAll(await exportAll())` após `wipeLocal()` restaura tudo.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): local database, repositories and outbox`.

---

### Task 10: Onboarding/consentimento e tela Hoje

**Files:**
- Create: `src/features/onboarding/*`, `src/features/hoje/{HojePage.tsx,HabitRow.tsx,useToday.ts}`, testes

**Interfaces:**
- Consumes: repos da Task 9, `dayProgress`, `isEntryMet`, `nextProgressiveTarget`, `generateParticipantCode`, `generateRecoveryKey`, `CONSENT_VERSION`, `getMarkdown('avisos/avisos.md'|'avisos/lgpd.md')`
- Produces:
  - `useToday(): string` — data local atual; atualiza via `setTimeout(msUntilNextLocalMidnight)` e em `visibilitychange`/`focus`.
  - Onboarding em 3 passos (§6.10 do design). Aceitar → `consent {granted:true, version:CONSENT_VERSION}` + `participant {code, key, registered:false}` + tela mostrando código e chave com botão copiar e aviso "guarde a chave". Recusar → `consent:null`. Em ambos `ensureDefaultHabits` e `onboardingDone:true`. Rotas redirecionam para `/onboarding` enquanto `!onboardingDone`.
  - `HabitRow` por tipo: boolean (checkbox grande), counter (− valor/alvo +), minutes (botões +5/+10/+15 que adicionam um bloco, lista de blocos removíveis, total/alvo), range_hours (stepper de 0,5 h). `aria-label` descritivo; microanimação no cumprimento (classe só sob `motion-safe`).
  - Reconsentimento: se `consent.version < CONSENT_VERSION`, mostrar a tela de consentimento atualizada antes de qualquer sincronização (aceitar → nova versão + `PATCH /v1/participants/me/consent` pelo motor de sync; recusar → `consent: null`).
  - Barra de progresso do dia (`role="progressbar"`, `aria-valuenow` em %).
  - Modo progressivo: ao abrir o dia, se `movement.progressive.enabled`, recalcula `target` com `nextProgressiveTarget` a partir dos últimos 7 dias (uma vez por dia; guarda `progressiveCheckedOn` no settings).
  - Aviso curto fixo no rodapé da tela: "Respeite seus limites. O app não substitui acompanhamento profissional."
- [ ] **Step 1: Testes que falham**:
  - onboarding: aceitar → `getSettings().consent.version === 1`, participante com código válido; recusar → `consent === null` e nenhuma mudança no outbox após marcar um hábito.
  - Hoje: com hábitos padrão, marcar respiração e +6 copos → progressbar `aria-valuenow="33"` (2/6).
  - **Review Focus 1:** `vi.useFakeTimers()` com hora 23:59:30; avançar 60 s; marcar respiração → entry gravada com `date` do novo dia e progressbar do novo dia = 17 (1/6).
  - progressivo: 5 de 7 dias cumpridos com alvo 10 → alvo exibido 15.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): onboarding with LGPD consent and today checklist`.

---

### Task 11: Registro do dia e Progresso

**Files:**
- Create: `src/features/registro/*`, `src/features/progresso/{ProgressoPage.tsx,WeekMonthChart.tsx,Heatmap.tsx,useProgressData.ts}`, testes

**Interfaces:**
- Consumes: `saveDailyLog`, `getDailyLogsBetween`, `getEntriesBetween`, `computeStreak`, `dayProgress`, `lastNDateKeys`, `ScalePicker`
- Produces:
  - Registro: 4 `ScalePicker` (estresse percebido, humor, disposição, qualidade do sono; rótulos 1/5 em i18n) + textarea "Observação (fica só no seu aparelho)"; salvar habilitado só com os 4 preenchidos; carrega o registro do dia para edição; seletor para editar dias anteriores (até 7 dias).
  - `useProgressData(range: 'week'|'month'): { days: { date: string; movementMinutes: number; stress: number | null; ratio: number }[]; streak: {current:number; best:number} }`
  - Gráfico Recharts `ComposedChart`: barras de minutos (cor `--bl`), linha de estresse (cor `--rd`, eixo direito 1–5), alternância semana/mês por `Tabs`; tabela oculta acessível com os mesmos dados.
  - Heatmap: grade do mês com intensidade por `ratio` (0, <0.5, <1, 1) em tons de lavanda→navy; cada célula com `aria-label` "dd/mm: X% do checklist".
  - Card de streak atual e recorde; lista de conquistas desbloqueadas (avalia `evaluateAchievements` ao abrir e grava novas em `unlockedAchievements` com toast).
- [ ] **Step 1: Testes que falham**: registro só salva com 4 escalas; salvar + reabrir mostra os valores; `useProgressData('week')` com dados de 7 dias devolve 7 itens na ordem e minutos somados do hábito `movement`; streak exibido "3 dias"; conquista `streak_3` é gravada uma única vez.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): daily log, progress charts, heatmap and achievements`.

---

### Task 12: Aprender e guia digital

**Files:**
- Create: `src/features/aprender/{AprenderPage.tsx,MechanismCard.tsx,MarkdownView.tsx,GuiaPage.tsx}`, teste

**Interfaces:**
- Consumes: `listMarkdown`, `getMarkdown`, `Alert`, `Card`
- Produces: `MarkdownView({ body }: { body: string })` — `marked` + `DOMPurify`; página com seções: Evidências (parágrafo Huang 2024), Mecanismos (cards expansíveis `aria-expanded`, `+`/`−` como no piloto), Ressalva científica (Alert fixo, sempre visível), Guia digital (lista → `/aprender/guia/:slug`, com selo "Rascunho" quando `meta.draft`), Referências, Avisos.
- [ ] **Step 1: Testes que falham**: 5 cards de mecanismos fechados; clicar abre (`aria-expanded="true"`) e mostra o texto; Alert da ressalva contém "não comprova neurogênese"; página de guia com `draft: true` mostra o selo "Rascunho".
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): learn section and digital guide`.

---

### Task 13: Configurações, lembretes web e dados

**Files:**
- Create: `src/features/config/{ConfigPage.tsx,HabitsEditor.tsx,RemindersSection.tsx,DataSection.tsx,SyncSection.tsx,AboutSection.tsx}`, `src/platform/{notifications.ts,files.ts}`, testes

**Interfaces:**
- Consumes: repos (Task 9), `exportAll/importAll/wipeLocal`, `toCsv`, `useTheme`
- Produces:
  - `HabitsEditor`: ativar/desativar, editar meta (e `targetMax` no sono), reordenar (botões subir/descer), criar hábito próprio (nome, tipo, meta), excluir hábito próprio (padrões só desativam); ligar modo progressivo e teto no movimento.
  - `interface ReminderSettings { movement: {enabled:boolean; time:'HH:mm'}; activeBreak: {enabled:boolean; everyMinutes: number; from:'HH:mm'; to:'HH:mm'}; water: {enabled:boolean; everyMinutes:number; from; to}; bedtime: {enabled:boolean; time} }`
  - `platform/notifications.ts`: `interface NotificationAdapter { requestPermission(): Promise<boolean>; schedule(rules: ReminderSettings): void; cancelAll(): void }`; `webNotifications` agenda com `setTimeout` enquanto a página está aberta e mostra a limitação "na web, os lembretes só aparecem com o app aberto"; `getNotificationAdapter()` (na Fase B ganha o adaptador Tauri).
  - `platform/files.ts`: `downloadFile(name: string, content: string, mime: string)`; `pickFile(accept: string): Promise<string | null>`.
  - Dados: exportar JSON (`nexo-check-backup-YYYY-MM-DD.json`), exportar CSV (registros diários + % do checklist + minutos de movimento por dia), importar JSON (confirmação "substitui os dados atuais"), apagar tudo.
  - **Apagar tudo:** se `participant.registered`, chama `deleteRemoteParticipant()` (Task 20) primeiro; sucesso → `wipeLocal()`; falha → diálogo "Não foi possível apagar no servidor. Apagar só neste aparelho?" (**Review Focus 5**).
  - `SyncSection` (estrutura agora, ações ligadas na Task 20): código + chave (mostrar/copiar), status, "Sincronizar agora", "Restaurar em outro aparelho" (código + chave), "Revogar consentimento".
  - Sobre: versão (`__APP_VERSION__` via `define` do `package.json` raiz), link do repositório, botão "Verificar atualizações" (web: `registration.update()`), avisos.
  - Tema claro/escuro/sistema; idioma (só pt-BR listado).
- [ ] **Step 1: Testes que falham**: desativar "Hidratação" remove a linha da tela Hoje; criar hábito "Leitura" (boolean) aparece em Hoje; importar arquivo inválido mostra erro e `getEntriesForDate(hoje)` continua igual (**Review Focus 4**); apagar tudo com servidor falhando (mock) abre o diálogo e não apaga até confirmar; com servidor ok apaga local; `webNotifications.schedule` com `movement 08:00` agenda 1 timer para o próximo 08:00.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): settings, reminders and data management`.

---

### Task 14: Questionários, oficinas e check-in (client, offline)

**Files:**
- Create: `src/features/projeto/{ProjetoPage.tsx,QuestionnairePage.tsx,QuestionField.tsx,WorkshopsList.tsx,CheckinPage.tsx}`, testes

**Interfaces:**
- Consumes: `getQuestionnaire`, `scoreEducational`, `saveQuestionnaireResponse`, `addCheckin`, `listMarkdown('oficinas')`, `normalizeCode`
- Produces:
  - Projeto: cartões dos 3 questionários com estado (pendente/respondido em dd/mm; educativo mostra nota), oficinas 1 e 2 (cards com duração, descrição, base científica), área de check-in (input de 6 caracteres + botão), lista de check-ins (pendente/confirmado/recusado com motivo).
  - Questionário: uma pergunta por tela com progresso "3 de 12", `QuestionField` por tipo, voltar/avançar, revisão final, envio grava `QuestionnaireResponse {id: uuid, kind, version: def.version, answers, score (educativo), submittedAt}`; selo "Rascunho" quando `def.draft`. Educativo mostra resultado e gabarito. Final só libera depois do inicial respondido (aviso explicativo).
  - `/checkin?c=CODIGO`: pré-preenche e confirma; sem consentimento → explica que a presença só conta com participação na pesquisa e oferece ir ao consentimento.
  - O envio ao servidor de respostas e check-ins é feito pelo motor de sync (Task 20) a partir dos registros com `syncedAt == null`; aqui só gravação local.
- [ ] **Step 1: Testes que falham**: responder o educativo com 8/10 certas mostra "80%" e grava `score: 0.8`; navegação por teclado entre opções; final bloqueado sem inicial; `/checkin?c=abc234` grava check-in `ABC234` pendente; sem consentimento mostra a explicação e não grava.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): questionnaires, workshops and check-in`.

---

### Task 15: API — base, Prisma, saúde e infraestrutura de testes

**Files:**
- Create: `apps/api/{package.json,tsconfig.json,vitest.config.ts}`, `prisma/schema.prisma`, migração inicial, `src/{server.ts,app.ts,env.ts,db.ts}`, `src/routes/health.ts`, `test/setup/global-setup.ts`, `test/helpers.ts`, `test/health.test.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `env.ts`: Zod de `DATABASE_URL`, `DIRECT_URL` (opcional), `ADMIN_PASSWORD` (≥ 12), `ADMIN_JWT_SECRET` (≥ 32), `CORS_ORIGINS` (lista separada por vírgula), `PUBLIC_WEB_URL`, `PORT` (padrão 3333), `NODE_ENV`.
  - `buildApp(opts: { prisma: PrismaClient; env: Env; now?: () => Date }): Promise<FastifyInstance>` — registra helmet, cors (origens do env + `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`), rate-limit global (100/min/IP), error handler devolvendo `apiError`, rotas sob `/v1` e `GET /health`.
  - Prisma schema com os modelos de §7 do design + `WorkshopSession.manualCount Int @default(0)` + `Participant.consentVersion Int` + `QuestionnaireResponse.version Int` + `SyncRecord.serverSeq BigInt @default(autoincrement())` (único), `@@unique([participantId, entity, entityId])` no `SyncRecord`, `@@unique([participantId, sessionId])` no `Checkin`, `@@unique([participantId, clientId])` no `QuestionnaireResponse`. Em Prisma 7, usar `prisma.config.ts` (URL direta para migrações) e `@prisma/adapter-pg` no runtime; em Prisma 6, `url`/`directUrl` no schema.
  - Testes: `global-setup.ts` sobe `embedded-postgres` numa porta livre e diretório temporário, cria o banco `nexo_test`, roda `prisma migrate deploy`, exporta `DATABASE_URL`; `helpers.ts`: `makeTestApp(): Promise<{ app; prisma; reset(): Promise<void> }>` (`TRUNCATE ... RESTART IDENTITY CASCADE`).
  - `GET /health` → `{ status: 'ok', version, db: 'ok' | 'error' }`.
- [ ] **Step 1: Teste que falha**: `GET /health` → 200 `{status:'ok', db:'ok'}`; header `x-content-type-options: nosniff` presente; requisição com `Origin: https://malicioso.example` não recebe `access-control-allow-origin`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS (localmente e no CI — o `embedded-postgres` roda em Windows e Linux).
- [ ] **Step 5:** Commit `feat(api): fastify base, prisma schema and health check`.

---

### Task 16: API — participantes, autenticação e exclusão

**Files:**
- Create: `src/plugins/participant-auth.ts`, `src/routes/participants.ts`, `test/participants.test.ts`

**Interfaces:**
- Consumes: `registerRequest`, `isParticipantCode`
- Produces:
  - `POST /v1/participants` (rate limit 10/h/IP): cria com `keyHash` (scrypt de `node:crypto` com salt aleatório, formato `scrypt$N$r$p$salt$hash`), `consentVersion`, `consentAt`. Código já existente → 409 `{error:'code_taken'}`.
  - Decorator `request.participant: { id: string; code: string }` via `participantAuth` (preHandler): lê `x-participant-code`/`x-participant-key`, verifica com `timingSafeEqual`; falha → 401 `{error:'unauthorized'}`.
  - `DELETE /v1/participants/me` → apaga participante e tudo em cascata; 204.
  - `PATCH /v1/participants/me/consent {consentVersion}` → atualiza versão e data.
- [ ] **Step 1: Testes que falham**: registrar → 201; mesmo código → 409; sync com chave errada → 401; código válido + chave certa passa no preHandler; `DELETE /me` remove `SyncRecord`, respostas e check-ins (contagens 0); 11º registro na mesma hora → 429.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): anonymous participants, auth and LGPD deletion`.

---

### Task 17: API — sincronização (push/pull LWW)

**Files:**
- Create: `src/routes/sync.ts`, `test/sync.test.ts`

**Interfaces:**
- Consumes: `participantAuth`, `syncPushRequest`, `syncPullResponse`, schemas de entidade, `stripPrivateFields`, `MAX_CLOCK_SKEW_MS`
- Produces:
  - `POST /v1/sync`: valida cada `payload` com o schema da entidade; aplica `stripPrivateFields` de novo no servidor; rejeita (400) `updatedAt` > `now + MAX_CLOCK_SKEW_MS`; upsert por `(participantId, entity, entityId)` só se `updatedAt` recebido > armazenado (empate → mantém o existente); a cada escrita efetiva, novo `serverSeq`; resposta `{applied, cursor}` com `cursor` = maior `serverSeq` do participante (string).
  - `GET /v1/sync?since=<cursor>`: mudanças com `serverSeq > since`, ordenadas, limite 1000, `cursor` final.
- [ ] **Step 1: Testes que falham**:
  - push de 3 mudanças → `applied: 3`; pull desde `0` devolve 3.
  - **Review Focus 2:** repetir exatamente o mesmo push → `applied: 0`, pull desde o cursor anterior devolve 0 itens, total de registros continua 3.
  - mudança com `updatedAt` mais antigo que a armazenada → ignorada.
  - `dailyLog` com `note: 'texto'` → armazenado com `note: null`.
  - `updatedAt` 10 min no futuro → 400.
  - participante A não vê mudanças do participante B.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (transação Prisma por lote). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): offline-first sync with last-write-wins`.

---

### Task 18: API — questionários e check-ins

**Files:**
- Create: `src/routes/{questionnaires.ts,checkins.ts}`, testes

**Interfaces:**
- Consumes: `questionnaireSubmit`, `getQuestionnaire`, `scoreEducational`, `stripTextAnswers`, `checkinRequest`, `normalizeCode`
- Produces:
  - `POST /v1/questionnaires`: valida `kind`/`version` contra a definição atual (versão diferente é aceita e armazenada como está); remove respostas `text`; recalcula `score` do educativo no servidor; idempotente por `(participantId, clientId=id)` → reenvio devolve a mesma resposta 200 sem duplicar.
  - `POST /v1/checkins`: código inexistente → 404 `{error:'invalid_code'}`; `now > expiresAt` → 410 `{error:'expired'}`; já feito → 200 com a mesma resposta (idempotente); sucesso → 201 `checkinResponse`.
- [ ] **Step 1: Testes que falham**: educativo enviado com `score` adulterado 1.0 mas 5/10 certas → armazenado 0.5 e devolvido `{score:0.5}`; resposta `text` não persiste; reenviar o mesmo `id` → 1 registro; check-in válido 201, repetido 200, código errado 404, sessão expirada 410.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): questionnaires and workshop check-ins`.

---

### Task 19: API — admin (login, sessões, presença manual, indicadores, CSV)

**Files:**
- Create: `src/plugins/admin-auth.ts`, `src/routes/admin.ts`, `src/services/stats.ts`, `test/admin.test.ts`

**Interfaces:**
- Consumes: `computeIndicators`, `getQuestionnaire`, `generateSessionCode`, `toCsv`, `SESSION_VALID_HOURS_AFTER`, `ADMIN_JWT_TTL`
- Produces:
  - `POST /v1/admin/login` (rate limit 5/15 min/IP): compara senha com `timingSafeEqual` (sobre hashes SHA-256 de mesmo tamanho) → `{token}` JWT (`@fastify/jwt`, `ADMIN_JWT_SECRET`, `expiresIn: ADMIN_JWT_TTL`, `sub: 'admin'`).
  - `adminAuth` preHandler → 401 sem token válido.
  - `GET /v1/admin/sessions` → `sessionView[]` ordenado por data desc; `POST /v1/admin/sessions` → cria com código único (retenta em colisão), `expiresAt = fim do dia da data (America/Sao_Paulo) + SESSION_VALID_HOURS_AFTER`, `checkinUrl = ${PUBLIC_WEB_URL}/checkin?c=${code}`; `PATCH /v1/admin/sessions/:id/manual {manualCount}`; `DELETE /v1/admin/sessions/:id` (só sem check-ins; senão 409).
  - `services/stats.ts`: `buildIndicatorInput(prisma): Promise<IndicatorInput>` — lê participantes, check-ins, `manualCount`, respostas por tipo, `SyncRecord` de `dailyLog` (stress) e `habitEntry` cujo `habitId` pertence a um `habit` com `key: 'movement'` e `value > 0`.
  - `GET /v1/admin/stats` → `{ indicators: Indicator[], generatedAt, totals: { participants, sessions } }`.
  - `GET /v1/admin/export.csv` → `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="nexo-indicadores-YYYY-MM-DD.csv"`; uma linha por participante com colunas `codigo;checkins;educativo_pct;satisfacao_media;adesao;estresse_inicial;estresse_final;estresse_diario_inicio;estresse_diario_fim;freq_af_inicial;freq_af_final;dias_registrados;dias_com_movimento` + bloco final com os 6 indicadores. Nunca texto livre.
- [ ] **Step 1: Testes que falham**: login errado 401, certo devolve token; stats sem token 401; criar sessão devolve código de 6 caracteres e `checkinUrl` com `PUBLIC_WEB_URL`; `PATCH manual 3` + 2 check-ins → indicador participação `value '5'`; cenário semeado com 10 participantes reproduz os valores esperados de compreensão/aceitação/adesão; CSV começa com BOM, tem cabeçalho exato acima e não contém o texto de uma observação semeada; 6ª tentativa de login em 15 min → 429.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): admin sessions, indicators and CSV export`.

---

### Task 20: Client — motor de sincronização

**Files:**
- Create: `src/sync/{http.ts,engine.ts,useSyncStatus.ts}`, testes; Modify: `SyncSection.tsx`, `DataSection.tsx`, `CheckinPage.tsx`, `ProjetoPage.tsx`, `layout.tsx` (indicador)

**Interfaces:**
- Consumes: repos da Task 9 (outbox, `applyRemoteChanges`, settings), schemas da API, `SYNC_*`
- Produces:
  - `http.ts`: `apiFetch<T>(path: string, init: RequestInit & { schema: ZodType<T>; auth?: boolean; timeoutMs?: number }): Promise<T>` — base `VITE_API_URL`, `AbortController` com `SYNC_TIMEOUT_MS`, headers de participante quando `auth`; retry só em erro de rede, timeout e 5xx/429, com `SYNC_RETRY_DELAYS_MS`; 4xx não é retentado; lança `ApiError { status: number; code: string }`.
  - `engine.ts`: `syncNow(): Promise<SyncResult>`; `startSyncLoop(): () => void` (gatilhos: início, `online`, `SYNC_INTERVAL_MS`, `visibilitychange` visível); `restoreFromServer(code: string, key: string): Promise<void>`; `revokeConsent(): Promise<void>`; `deleteRemoteParticipant(): Promise<void>`. Ordem do `syncNow`: sem consentimento ou com `consent.version < CONSENT_VERSION` → retorna `'skipped'`; se a versão do consentimento mudou desde o último envio, `PATCH /v1/participants/me/consent`; registra o participante se `!registered` (409 `code_taken` → gera novo código, até 3 tentativas); push do outbox em lotes de 500 (`ackOutbox` só após 2xx); pull desde `syncCursor`; envia questionários e check-ins pendentes (`syncedAt == null`) e atualiza status (`confirmed`/`rejected` com motivo `invalid_code`/`expired`); grava `lastSyncAt`.
  - `useSyncStatus(): { state: 'idle'|'syncing'|'error'|'offline'|'disabled'; lastSyncAt: string | null; pending: number }` — indicador discreto no header ("Sincronizando…", "Pendente: N", "Offline").
  - Revogar consentimento: `consent = null`, `clearOutbox()`, para o loop; pergunta se também quer apagar os dados do servidor (chama `deleteRemoteParticipant`).
- [ ] **Step 1: Testes que falham** (fetch mockado com MSW ou `vi.fn`):
  - sem consentimento: `syncNow()` → `'skipped'` e zero chamadas de fetch.
  - **Review Focus 2:** primeira tentativa de push dá timeout após o servidor aplicar; segunda responde 200 → outbox vazio e nenhum item enviado em duplicidade além do reenvio do mesmo lote.
  - 503, 503, 200 → sucesso com 3 chamadas; 400 → falha sem retry.
  - registro com 409 → novo código salvo e registro repetido.
  - check-in pendente + resposta 410 → status `rejected` com motivo `expired`.
  - **Review Focus 5:** `revokeConsent()` com 5 itens no outbox → `outboxCount() === 0` e próximo `syncNow()` → `'skipped'`.
  - `restoreFromServer` popula tabelas a partir do pull e grava `participant.registered = true`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar e ligar nas telas. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): offline-first sync engine with retry and status`.

---

### Task 21: Client — painel admin

**Files:**
- Create: `src/features/admin/{AdminRoutes.tsx,LoginPage.tsx,SessionsPage.tsx,IndicatorsPage.tsx,adminApi.ts}`, testes

**Interfaces:**
- Consumes: `apiFetch`, schemas admin, `Indicator`, `qrcode`
- Produces:
  - Token admin só em `sessionStorage` (`nexo-admin-token`); 401 → volta para o login.
  - Sessões: formulário (oficina 1/2, data, local), lista com código grande, QR (`qrcode.toDataURL(checkinUrl)`), botão "Tela cheia" para projetar, contagem de check-ins, campo de presença manual com salvar, excluir.
  - Indicadores: 6 cards (valor, meta, status com ícone + texto, não só cor; n; aviso "amostra pequena"); estresse e frequência exibem antes x depois sem verde/vermelho; botão "Exportar CSV" (fetch com token → `downloadFile`).
  - A rota `/admin` não aparece na navegação do app.
- [ ] **Step 1: Testes que falham**: login com 401 mostra erro; sucesso guarda token e abre indicadores; criar sessão mostra o código e uma `<img alt="QR code de check-in ...">`; card de participação com status `met` mostra "Meta atingida"; card de estresse não tem texto de status de meta.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(client): admin panel with sessions, QR and indicators`.

---

### Task 22: E2E (Playwright) e acessibilidade

**Files:**
- Create: `apps/client/playwright.config.ts`, `apps/client/e2e/{onboarding,hoje,questionario,checkin,dados,tema,admin}.spec.ts`, `apps/client/e2e/mock-api.ts`; Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: build web (`vite preview`), API mockada por `page.route` (`mock-api.ts`)
- Produces: script `pnpm test:e2e`; job `e2e` no CI (instala Chromium, sobe preview, roda specs, publica relatório como artefato em falha).
- [ ] **Step 1:** Escrever os specs (fluxos de §14 do design): onboarding com e sem consentimento; marcar hábitos e ver progresso; registro do dia; questionário educativo com nota; check-in por `/checkin?c=`; exportar JSON (download com `app: 'nexo-check'`); tema escuro aplica classe `dark`; admin login + criar sessão mostra QR. Adicionar `@axe-core/playwright` nas telas Hoje, Registro, Progresso, Aprender, Projeto, Config e Admin exigindo zero violações `serious`/`critical`, nos temas claro e escuro, em viewport 390×844 e 1280×800.
- [ ] **Step 2:** `pnpm test:e2e` → corrigir o que falhar (bugs reais, não os testes) até PASS.
- [ ] **Step 3:** Adicionar o job ao `ci.yml`; push; CI verde.
- [ ] **Step 4:** Commit `test(e2e): playwright flows and accessibility checks`.

---

### Task 23: Deploy — Neon, Render, Vercel e README web

**Files:**
- Create: `render.yaml`, `README.md` (parte web); Modify: `apps/client/vercel.json` se necessário

**Interfaces:**
- Produces: API pública `https://<serviço>.onrender.com`, web pública `https://<projeto>.vercel.app`.
- [ ] **Step 1:** **Pedir confirmação ao usuário** para criar a conta/projeto no Neon pelo Claude in Chrome (não foi autorizado ainda). Com o ok: projeto `nexo-check`, região mais próxima do Brasil disponível (ex.: `aws-sa-east-1`), copiar URL *pooled* (runtime) e *direct* (migrações) — sem colar em arquivos do repositório.
- [ ] **Step 2:** `render.yaml`: um `web` service `nexo-check-api`, `runtime: node`, `plan: free`, região `oregon` (ou a mais próxima disponível no free), `buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm --filter api build`, `preDeployCommand: pnpm --filter api exec prisma migrate deploy` (se o plano free não suportar pre-deploy, mover para o início do `startCommand`), `startCommand: pnpm --filter api start`, `healthCheckPath: /health`, `envVars` com `sync: false` para `DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`, `PUBLIC_WEB_URL` e `generateValue: true` para `ADMIN_JWT_SECRET`.
- [ ] **Step 3:** Commit `chore(deploy): render blueprint`; push.
- [ ] **Step 4:** Pelo Claude in Chrome: Render → New Blueprint → repositório `nexo-check`; preencher envs (senha do admin: **pedir ao usuário** ou gerar uma forte e entregar a ele só na conversa); aguardar deploy; `GET /health` → `{status:'ok', db:'ok'}`.
- [ ] **Step 5:** Pelo Claude in Chrome: Vercel → importar o repositório, root `apps/client`, framework Vite, install `pnpm install --frozen-lockfile`, build `pnpm turbo build --filter client`, output `dist`, env `VITE_API_URL` = URL do Render; deploy. Voltar ao Render e ajustar `CORS_ORIGINS` e `PUBLIC_WEB_URL` com o domínio final da Vercel.
- [ ] **Step 6:** Verificação em produção: abrir a web, fazer onboarding com consentimento, marcar hábito, "Sincronizar agora" (tolerando cold start) → sem erro; `/admin` login → criar sessão → check-in com o código no app → indicador participação = 1; exportar CSV. Depois apagar os dados de teste (apagar tudo no app + excluir a sessão).
- [ ] **Step 7:** README (parte web): visão geral, capturas das telas (Hoje, Progresso, Aprender, Admin), pré-requisitos (Node 22+, pnpm 10), `pnpm install` / `pnpm dev` (client em 5173, API em 3333 com `.env` a partir de `.env.example`), testes, arquitetura resumida, configuração de Neon/Render/Vercel e lista de variáveis de ambiente, avisos do projeto. Seções de Windows/Android/releases marcadas "Fase B".
- [ ] **Step 8:** Commit `docs: README for web version and deployment`; push; CI verde.
