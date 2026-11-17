# NEXO Check — Redesign visual

Data: 2026-11-17 · Complementa `2026-11-17-nexo-check-design.md` (§13 é substituída por este documento no que conflitar). Pesquisa de apoio: `.superpowers/design-research.md` (local).

## Intenção
O usuário achou o app genérico ("cara de IA"): blocos lavanda iguais empilhados, pouca hierarquia, e o tema escuro com fundo todo azul-marinho incomoda. Objetivo: app mais bonito, vivo e agradável, mantendo a identidade do piloto (Montserrat, paleta, pílulas) e a acessibilidade (AA, 44 px, foco, movimento reduzido).

## Decisões do usuário
- Disposição da tela Hoje: **opção B (blocos de cor / bento)**, com as informações extras da opção A (data, resumo "X de Y hábitos", sugestão do dia, anel de progresso).
- **Sem saudação** ("Boa tarde" fora).
- Precisa funcionar bem em **telas grandes** (computador).
- **Tema escuro sem azul dominante**: usar outras cores, mesclar as cores da marca ou um "wallpaper".
- O resto fica a critério do construtor.

## Antiobjetivos
- Gradiente roxo, glassmorphism, sombras difusas em tudo; grade de cards iguais com emoji; tudo centralizado.
- Gamificação punitiva (vermelho para dia vazio, ranking, culpa).
- Fundo azul-marinho no tema escuro.

## Abordagens consideradas (escolha do usuário: B)
- A · Editorial com anel: saudação grande, anel, lista limpa. Mais calma, menos colorida.
- **B · Blocos de cor (bento)**: Movimento em bloco herói, outros hábitos em blocos coloridos. Mais viva e escaneável. ← escolhida, com elementos de A.

## Sistema visual (decisões do construtor)

**Cores — claro (padrão)**
- Fundo `#f7f5f2` com grão sutil (SVG noise ~3%) e pílulas da marca cortadas nas bordas.
- Bloco herói (Movimento): azul-marinho `#1d1a5c` com texto `#f7f5f2`, círculo decorativo azul `#3a8bc8`, ações em laranja `#f5a64a` com texto navy.
- Blocos de hábito com tintas suaves: lavanda `#c9c6dc` (água), pêssego `#fbe3c4` (sono), céu `#d6e7f4` (pausas), lilás `#efe9f6` (respiração), branco com borda fina (hábitos próprios/mobilidade). Texto sempre navy.
- Laranja só para a ação principal; vermelho só para erro real.

**Cores — escuro ("wallpaper" mesclado, sem azul dominante)**
- Base grafite quente `#16141a`; superfícies `#211e26` e `#2a2630`; texto `#f3f0f5`; texto secundário `#bdb6c6`.
- Wallpaper fixo atrás do conteúdo: 3 manchas radiais grandes e desfocadas — laranja `#f5a64a` (~22%), rosa-tijolo `#c0575a` (~18%), lavanda `#a8a4c2` (~20%) — em cantos diferentes, mais grão; estático (sem animação), barato (CSS `radial-gradient`, sem `filter` ao vivo).
- Bloco herói no escuro: gradiente mesclado lavanda → pêssego (`#c9c6dc` → `#f3c79a`) com texto navy; ações em navy com texto claro.
- Blocos de hábito: superfícies grafite translúcidas (`rgba(255,255,255,.06)`) com borda `rgba(255,255,255,.08)` e rótulo na cor da marca clareada (laranja `#f7b866`, rosa `#e3868a`, lavanda `#cfcbe3`); azul só em detalhes pequenos (≤ 5% da tela).
- Nada de fundo navy no escuro.

**Tipografia**: Montserrat; títulos 800 com tracking −0.03/−0.04em; data/rótulos em caixa-alta 10–11 px, tracking +0.12em; números grandes tabulares (`font-variant-numeric: tabular-nums`); `text-wrap: balance` em títulos.

**Forma e espaço**: raios com hierarquia — herói 32 px, painéis 28–36 px, blocos 24 px, controles internos 16 px ou pílula; espaço por proximidade em vez de caixa em volta de tudo; sombra rara.

**Movimento**: biblioteca `motion` (`motion/react`, `LazyMotion` + `domAnimation`, `MotionConfig reducedMotion="user"`) para toque com mola (escala 0.97→1), check com traço desenhado, número que sobe e entrada escalonada curta (≤ 300 ms); View Transitions entre rotas como melhoria progressiva; tudo desligado/sem deslocamento em `prefers-reduced-motion`. Animar só `transform`/`opacity`.

## Telas
- **Layout**: celular com barra inferior (ícone preenchido no ativo); computador ≥ 1024 px com menu lateral claro/grafite e conteúdo em grade de 12 colunas com coluna direita de resumo quando couber (≥ 1280 px).
- **Hoje**: cabeçalho = data grande ("Terça, 17 de novembro") + linha "4 de 6 hábitos · <sugestão do dia>" + anel pequeno; bloco herói de Movimento (minutos, barra, blocos, +5/+10/+15); blocos de hábito por tipo em grade 2 col (celular) / 3–4 col (computador); hábito próprio e mobilidade em bloco largo. Computador: coluna direita com anel grande "X de Y", atalho "Como foi seu dia?" e dica do Aprender ligada a um hábito. Sugestão do dia: frase escolhida pelo estado (ex.: falta movimento → "que tal 10 min de caminhada?"; tudo feito → "dia completo, bom descanso"), cautelosa, sem culpa.
- **Registro**: escalas 1–5 como cinco pílulas de tamanho/tonalidade crescente com número e palavra (não só cor); depois de salvar, frase de retorno acolhedora (sem diagnóstico).
- **Progresso**: destaque "dias de movimento este mês" (número grande) + sequência atual e recorde com texto gentil; gráfico com rótulos diretos e laranja só para hoje; heatmap com células arredondadas e legenda em texto; conquistas como selos calmos.
- **Aprender**: card destaque + lista editorial numerada (01, 02…) dos mecanismos; ressalva sempre visível; guia em cards largos.
- **Onboarding**: uma ideia por tela, tipografia grande, wallpaper da marca.
- Telas futuras (Configurações, Projeto/questionários, check-in, admin) seguem o mesmo sistema.

## Restrições que continuam
WCAG AA (texto sobre laranja/lavanda/pêssego sempre navy; medir contrastes no escuro), alvos ≥ 44 px, foco visível 3 px, não depender só de cor, `aria-live` para confirmações, textos em `pt-BR.json`, linguagem cautelosa, sem metas de redução de estresse.

## Deixado ao construtor
Valores finos de cor/opacidade dentro das faixas acima, ícones Lucide escolhidos, frases da sugestão do dia (cautelosas), composição exata da grade desktop, detalhes das animações.
