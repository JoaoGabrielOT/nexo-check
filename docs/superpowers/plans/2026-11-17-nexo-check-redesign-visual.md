# NEXO Check — Redesign visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o novo sistema visual (bento colorido, sem saudação, desktop em grade, tema escuro grafite com "wallpaper" de cores mescladas) às telas já prontas e deixá-lo como base das telas restantes.

**Architecture:** Tokens e utilitários no `@nexo/ui/theme.css` (claro/escuro, wallpaper, grão, raios), componentes novos no `@nexo/ui` (Tile, ProgressRing, QuickAddButton, ScalePills, PageHeader, Wallpaper), `motion` no client com `MotionConfig reducedMotion="user"`. Cada tela é recomposta com esses blocos sem mudar regras de negócio nem o banco.

**Tech Stack:** React 19, Tailwind 4, Radix, `motion` (motion/react, LazyMotion + domAnimation), Recharts, Playwright (capturas), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-nexo-check-redesign-visual.md` (+ `docs/superpowers/specs/2026-11-17-nexo-check-design.md` para regras de produto). Pesquisa: `.superpowers/design-research.md`.

## Global Constraints

- Sem saudação ("Bom dia/Boa tarde") em nenhuma tela.
- Claro: fundo `#f7f5f2`; herói Movimento `#1d1a5c` + texto `#f7f5f2`, círculo `#3a8bc8`, ações `#f5a64a` com texto navy; tintas de bloco `#c9c6dc` (água), `#fbe3c4` (sono), `#d6e7f4` (pausas), `#efe9f6` (respiração), branco + borda fina (mobilidade/hábitos próprios).
- Escuro: base `#16141a`, superfícies `#211e26`/`#2a2630`, texto `#f3f0f5`, secundário `#bdb6c6`; wallpaper com manchas radiais laranja `#f5a64a` (~22%), `#c0575a` (~18%), lavanda `#a8a4c2` (~20%) + grão; herói em gradiente `#c9c6dc → #f3c79a` com texto navy e ações navy; blocos `rgba(255,255,255,.06)` com borda `rgba(255,255,255,.08)` e rótulo colorido (`#f7b866`, `#e3868a`, `#cfcbe3`). **Nenhum fundo navy/azul dominante no escuro**; azul ≤ detalhes.
- Raios: herói 32 px, painéis 28–36 px, blocos 24 px, controles 16 px ou pílula.
- Tipografia: Montserrat; títulos 800 tracking −0.03/−0.04em; rótulos caixa-alta 10–11 px tracking +0.12em; números `tabular-nums`; `text-wrap: balance` em títulos.
- Movimento: só `transform`/`opacity`, ≤ 300 ms, molas curtas; `MotionConfig reducedMotion="user"`; nada essencial depende de animação; confirmações por `aria-live="polite"`.
- Acessibilidade: AA (texto sobre laranja/lavanda/pêssego/céu sempre navy; medir textos no escuro), alvos ≥ 44 px, foco 3 px visível, não depender só de cor.
- Linguagem cautelosa; sem culpa (nenhum vermelho para dia vazio); textos em `pt-BR.json`.
- Não mudar regras de negócio, banco nem testes de comportamento existentes (ajustar seletores apenas se a marcação mudar, mantendo nomes acessíveis).

## Review Focus

1. **Tema escuro com fundo azul por herança:** algum componente antigo ainda usa `bg-navy`/`bg-bg` escuro azul → verificar com captura do escuro de todas as telas (Task D4 checklist do conferidor-visual).
2. **Contraste do texto secundário no escuro sobre o wallpaper** (manchas claras atrás de texto) → teste de contraste dos tokens na Task D1 + checagem visual.
3. **Grade do computador quebrando entre 1024 e 1280 px** (coluna direita espremida) → capturas em 1024, 1280 e 1440 na Task D2.
4. **Movimento reduzido:** com `prefers-reduced-motion: reduce` nada desloca/escala → teste na Task D1 (MotionConfig) e captura emulando reduce.
5. **Ganhos visuais quebrando leitores de tela** (anel/heatmap/pílulas só visuais) → nomes acessíveis testados em cada task.

---

### Task D1: Sistema visual (tokens, wallpaper, componentes base, motion)

**Files:**
- Modify: `packages/ui/src/styles/theme.css`, `packages/ui/src/index.ts`, `packages/ui/src/components/DecorativePills.tsx`, `packages/ui/src/components/ScalePicker.tsx` (ou novo `ScalePills.tsx` exportado no lugar)
- Create: `packages/ui/src/components/{Tile.tsx,ProgressRing.tsx,QuickAddButton.tsx,PageHeader.tsx,Wallpaper.tsx,ScalePills.tsx}`, `packages/ui/src/assets/grain.svg` (ou data-URI no CSS), `packages/ui/test/redesign.test.tsx`
- Modify: `apps/client/src/main.tsx` ou `src/app/layout.tsx` (MotionConfig + LazyMotion + Wallpaper), `apps/client/package.json` (`motion`)

**Interfaces (Produces):**
- Tokens Tailwind (claro e `.dark`): `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-text`, `--color-muted`, `--color-border`, `--color-hero-bg` (claro navy / escuro gradiente via utilitário `.bg-hero`), `--color-hero-ink`, `--color-hero-action`, `--color-hero-action-ink`, `--color-tile-water`, `--color-tile-sleep`, `--color-tile-breaks`, `--color-tile-breathing`, `--color-tile-plain`, `--color-tile-label-*` (cor do rótulo por tile no escuro), raios `--radius-hero:32px`, `--radius-tile:24px`, `--radius-control:16px`.
- `<Wallpaper />` (fixo, `aria-hidden`, `pointer-events-none`, `z-0`): claro = grão + pílulas da marca; escuro = manchas radiais + grão. Substitui o uso direto de `DecorativePills` no layout (DecorativePills continua exportado para uso pontual).
- `<Tile tone="water"|"sleep"|"breaks"|"breathing"|"plain" label: string; children; className? />` — `section` com `aria-label={label}`, raio tile, rótulo caixa-alta.
- `<ProgressRing value: number /*0..1*/ size?: number; stroke?: number; label: string />` — SVG com `role="img"` e `aria-label={label}`.
- `<QuickAddButton onClick; children; variant?: 'hero'|'outline' />` — pílula ≥ 44 px, mola no toque (`motion` `whileTap={{ scale: 0.96 }}`).
- `<PageHeader eyebrow?: string; title: string; meta?: ReactNode; aside?: ReactNode />` — data/rótulo + título grande à esquerda.
- `<ScalePills value: 1..5|null; onChange; label; words: [string,string,string,string,string] />` — cinco pílulas de tamanho/tom crescente com número e palavra, `role="radiogroup"`, setas do teclado, cada uma `role="radio"` com nome "3 — Médio".

- [ ] **Step 1: Testes que falham** (`redesign.test.tsx`): Tile tem `aria-label` e classe do tom; ProgressRing com `value=0.66` tem `role="img"` e nome; ScalePills navega com setas e anuncia "4 — Alto"; Wallpaper `aria-hidden="true"`; teste de contraste dos pares de tokens (função utilitária `contrastRatio(hexA, hexB)` local ao teste): texto `#f3f0f5` e `#bdb6c6` sobre `#16141a`/`#211e26` ≥ 4.5; navy `#1d1a5c` sobre `#f5a64a`, `#c9c6dc`, `#fbe3c4`, `#d6e7f4`, `#efe9f6`, `#f3c79a` ≥ 4.5; rótulos coloridos do escuro sobre `#211e26` ≥ 4.5. No client: com `matchMedia('(prefers-reduced-motion: reduce)')` = true, o `MotionConfig` recebe `reducedMotion="user"` (teste de render que verifica que um `QuickAddButton` não aplica transform inline ao clicar).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar tokens, utilitários `.bg-hero`, `.grain`, wallpaper, componentes e MotionConfig/LazyMotion na raiz. **Step 4:** PASS + `pnpm lint typecheck test build`.
- [ ] **Step 5:** Capturas Playwright (página com os componentes ou a tela Hoje atual) em claro/escuro, 390 e 1280, salvas em `.superpowers/sdd/2026-11-17-nexo-check-redesign-visual/screens/d1-*.png`.
- [ ] **Step 6:** Commit `feat(ui): redesign tokens, wallpaper and base components`.

### Task D2: Layout e tela Hoje (bento + desktop)

**Files:**
- Modify: `apps/client/src/app/layout.tsx`, `apps/client/src/features/today/{TodayPage.tsx,HabitRow.tsx}` (HabitRow pode virar `HabitTile.tsx`), `apps/client/src/i18n/pt-BR.json`
- Create: `apps/client/src/features/today/{MovementHero.tsx,DaySummary.tsx,suggestion.ts}`, `apps/client/test/features/today-redesign.test.tsx`

**Interfaces:**
- Consumes: D1 components; repos `adjustEntry/appendBlock/removeBlock/setEntry`; `dayProgress`.
- Produces: `getDaySuggestion(state: { movementMinutes: number; movementTarget: number; done: number; total: number; hour: number }): string` (chave i18n) em `suggestion.ts` — regras: tudo feito → `today.suggestion.allDone`; movimento < 10 min → `today.suggestion.walk10`; movimento < meta → `today.suggestion.keepGoing`; senão → `today.suggestion.recover` (respiração/pausa). Textos cautelosos, sem culpa.
- Layout: barra inferior com ícone preenchido no ativo (< 1024 px); ≥ 1024 px menu lateral em superfície clara/grafite (sem navy no escuro); conteúdo `max-w-[1200px]`; ≥ 1280 px coluna direita (`DaySummary`: anel grande "X de Y hábitos hoje", atalho "Como foi seu dia?" → /registro, dica do Aprender ligada a um hábito pendente).
- Hoje: `PageHeader` com eyebrow = data longa pt-BR ("Terça, 17 de novembro"), title = "Hoje", meta = "4 de 6 hábitos · <sugestão>", aside = `ProgressRing` pequeno (escondido ≥ 1280 px, onde o resumo da direita aparece); `MovementHero` (minutos grandes, "de N min", blocos, barra, +5/+10/+15, chips de blocos removíveis, linha "Leve a moderado, no seu ritmo"); grade de tiles: 2 colunas no celular, 3 no tablet/desktop; mobilidade e hábitos próprios em tile largo `col-span-2`.
- [ ] **Step 1: Testes que falham**: `getDaySuggestion` para os 4 casos; Hoje renderiza eyebrow com a data, NÃO renderiza "Bom dia/Boa tarde/Boa noite"; herói mostra "20" e "de 30 min" após 2 blocos de 10; `+10` adiciona bloco (via repo atômico); tile de água tem botões "Adicionar um copo"/"Remover um copo" com nomes acessíveis; `DaySummary` aparece com `matchMedia('(min-width: 1280px)')` = true. Testes antigos de comportamento continuam passando (ajustar seletores se necessário mantendo nomes acessíveis).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + suíte completa.
- [ ] **Step 5:** Capturas em 390×844, 1024×768, 1280×800, 1440×900, claro e escuro, salvas em `.../screens/d2-*.png`.
- [ ] **Step 6:** Commit `feat(client): bento today screen and responsive layout`.

### Task D3: Registro e Progresso

**Files:**
- Modify: `apps/client/src/features/log/LogPage.tsx`, `apps/client/src/features/progress/{ProgressPage.tsx,WeekMonthChart.tsx,Heatmap.tsx}`, `pt-BR.json`
- Create: `apps/client/src/features/log/afterSave.ts`, testes em `apps/client/test/features/{log,progress}-redesign.test.tsx`

**Interfaces:**
- `getAfterSaveMessage(log: { stress: number; mood: number; energy: number; sleepQuality: number }): string` (chave i18n): estresse ≥ 4 ou humor ≤ 2 → `log.after.hardDay` (acolhedor, sugere respiração/pausa, lembra que o app não substitui apoio profissional); disposição ≥ 4 e estresse ≤ 2 → `log.after.goodDay`; senão `log.after.neutral`.
- Registro: `PageHeader` (eyebrow data, title "Como foi seu dia"); quatro `ScalePills` com palavras (estresse: "Muito baixo, Baixo, Médio, Alto, Muito alto"; humor: "Muito mal, Mal, Ok, Bem, Muito bem"; disposição e sono análogos); após salvar, painel com a frase de retorno (`aria-live="polite"`).
- Progresso: destaque "dias de movimento este mês" (número grande; dias com entrada do hábito movement `value > 0` no mês corrente) em tile herói; sequência atual e recorde em tiles menores com texto gentil ("sua melhor sequência: N dias"); gráfico: barras lavanda/navy, laranja só na barra de hoje, linha de estresse com pontos, rótulos diretos no último ponto, legenda existente mantida; heatmap: células com raio 8 px, legenda em texto ("0", "até metade", "mais da metade", "completo"), dia vazio em lavanda vazada (nunca vermelho); conquistas como selos (círculo + título), bloqueadas em contorno.
- [ ] **Step 1: Testes que falham**: `getAfterSaveMessage` 3 casos; após salvar aparece a frase em região `aria-live`; ScalePills de estresse tem rádio "4 — Alto"; Progresso mostra "dias de movimento este mês" com o número correto para dados semeados; heatmap tem legenda em texto; nenhuma célula vazia usa classe/token vermelho.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + suíte.
- [ ] **Step 5:** Capturas 390/1280 claro/escuro de /registro e /progresso em `.../screens/d3-*.png`.
- [ ] **Step 6:** Commit `feat(client): redesigned daily log and progress`.

### Task D4: Aprender, onboarding e conferência visual geral

**Files:**
- Modify: `apps/client/src/features/learn/{LearnPage.tsx,MechanismCard.tsx,ArticlePage.tsx}`, `apps/client/src/features/onboarding/*`, `pt-BR.json`
- Test: `apps/client/test/features/{learn,onboarding}.test.tsx` (ajustes)

**Interfaces:**
- Aprender: `PageHeader` (eyebrow "Neurociência do exercício", title "Aprender"); card destaque (evidências) em tile herói; mecanismos como lista editorial numerada "01 … 05" com expansão (mesmo padrão de disclosure acessível); ressalva sempre visível (Alert); guia em tiles largos coloridos com selo "Rascunho"; referências e avisos ao fim.
- Onboarding: uma ideia por tela, título grande, wallpaper; botões de consentimento claros (mesmos textos); passo do código com o código em destaque grande.
- [ ] **Step 1:** Ajustar/adicionar testes: números "01"–"05" visíveis e cards ainda com `aria-expanded`; ressalva e avisos presentes; onboarding mantém os mesmos fluxos (testes existentes passam).
- [ ] **Step 2:** FAIL onde houver mudança. **Step 3:** Implementar. **Step 4:** PASS + suíte.
- [ ] **Step 5:** Capturas de TODAS as telas prontas (Hoje, Registro, Progresso, Aprender, artigo do guia, onboarding passos 1–3) em 390 e 1280, claro e escuro → `.../screens/d4-*.png`. O controlador pede ao agente `conferidor-visual` a conferência com o checklist: sem fundo azul no escuro, contraste legível, nada cortado/sobreposto, alvos grandes, hierarquia clara, sem saudação.
- [ ] **Step 6:** Commit `feat(client): redesigned learn section and onboarding`.
