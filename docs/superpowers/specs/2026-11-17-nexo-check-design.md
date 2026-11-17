# NEXO Check — Design

Data: 2026-11-17 · Fontes: `prompt-claude-code-nexo-check.md` (especificação), `app-checklist-nexo.md` (visão do app), `docs/piloto-nexo.html` (fonte de verdade de conteúdo e identidade visual).

## 1. Intenção

O NEXO Check é o app de apoio à intervenção acadêmica **"NEXO em Movimento — Neurociência do Exercício Físico aplicada à saúde mental universitária"** (NEXO Consultoria). Ele serve a dois públicos:

- **Estudantes** do piloto (5 a 10) e das oficinas (meta de 20 a 30): levam para a rotina o que as oficinas ensinam, com um checklist diário em que o movimento é o protagonista e sono, respiração, pausas e hidratação são estratégias complementares de recuperação.
- **Grupo NEXO**: coleta dados anônimos e agregados para os indicadores do piloto (participação, compreensão, aceitação, adesão, estresse antes x depois, frequência de atividade física) e exporta para o relatório final (etapa 4 do 5W2H).

Pergunta norteadora: *como a prática regular e acessível de exercícios físicos pode contribuir para mitigar fatores associados à sobrecarga cerebral, ao estresse e à ansiedade entre estudantes universitários?*

## 2. Objetivos, não objetivos e antiobjetivos

**Objetivos**
- Um código gera Windows (`.exe` NSIS + `.msi`), Android (`.apk` assinado, fora da Play Store) e web (Vercel + API no Render).
- Funciona 100% offline e sem conta. A sincronização é opcional, anônima e só com consentimento LGPD.
- Painel `/admin` com os seis indicadores do piloto (valor, meta, status) e exportação CSV.
- Atualização automática via GitHub Releases em Windows, Android e web (PWA).
- CI/CD com release `v0.1.0` gerada pela pipeline.

**Não objetivos**
- Diagnóstico, triagem clínica ou escalas psicométricas validadas (PSS, GAD-7 etc.). O estresse é autorrelato de 1 a 5.
- Ranking entre usuários, metas de redução de estresse, iOS, Play Store, assinatura de código Windows (EV/OV).
- Contas com nome, e-mail ou telefone.

**Antiobjetivos** (o app falha se fizer isto, mesmo funcionando)
- Afirmar que o app ou as oficinas causam neurogênese, aumentam BDNF ou melhoram notas. Texto sempre com "pode contribuir" e "está associado a".
- Incentivar esforço intenso. O HIIT só aparece como modalidade estudada, nunca como meta ou recomendação.
- Enviar qualquer dado sem consentimento.
- Esconder o aviso de que o app não substitui acompanhamento profissional e de que as atividades devem respeitar os limites de cada pessoa.

## 3. Restrições

- Stack obrigatória: monorepo pnpm + Turborepo; React + Vite + TypeScript strict + Tailwind + shadcn/ui; Tauri 2; Dexie (IndexedDB); Fastify + Prisma + PostgreSQL; Zod compartilhado; Vitest + Playwright; ESLint, Prettier, Husky + lint-staged; Recharts; i18next; Lucide; `vite-plugin-pwa`.
- Custo direto R$ 0,00: planos gratuitos de Vercel, Render e GitHub.
- O Render Free hiberna (cold start de ~30–60 s): o cliente usa timeout maior, retry com backoff e mostra "sincronizando".
- **O Postgres Free do Render expira 30 dias após a criação** (14 dias de carência, depois é apagado, sem backup). Ver §12, item em aberto.
- Repositório: `github.com/JoaoGabrielOT/nexo-check`, **público**, porque o updater Windows (`latest.json`) e o Android (`releases/latest`) baixam sem token. Nenhum dado de participante fica no repositório.
- Máquina de desenvolvimento: Windows 11, Node 24, JDK 25. Sem pnpm (ativar via corepack), sem Rust, sem Android SDK/NDK. Builds nativos são feitos e verificados no GitHub Actions. O JDK do CI fica fixado em 17.
- Acesso: o usuário autorizou criar o repositório no GitHub (credencial salva no Git Credential Manager) e configurar Vercel e Render pelo Claude in Chrome.

## 4. Abordagens consideradas

1. **Tauri 2 para Windows e Android + PWA na web, com plugin Kotlin próprio para o update do APK** (escolhida). Atende à stack obrigatória. O custo é o plugin Android próprio, porque o `tauri-plugin-updater` não cobre mobile.
2. **Capacitor no Android + Tauri no Windows.** O update do APK seria mais simples, mas são dois shells, e o prompt exige Tauri. Descartada.
3. **PWA única.** Muito mais barata, mas não gera `.exe` nem `.apk`, que são entregáveis. Descartada.

O usuário aprovou a abordagem 1.

## 5. Arquitetura

```
apps/
  client/                 React + Vite (web/PWA) e src-tauri/ (Windows + Android)
    src/
      app/                rotas, layout (bottom nav no mobile, sidebar ≥1024px)
      features/           hoje, registro, progresso, aprender, projeto, oficinas, config, admin, onboarding
      db/                 Dexie (schema, repositórios)
      sync/               outbox, cliente HTTP com retry/backoff
      platform/           adaptadores: notificações, updater, armazenamento de arquivos (web x tauri)
      i18n/               pt-BR
    src-tauri/            Rust, tauri.conf.json, capabilities, gen/android (commitado)
  api/                    Fastify + Prisma
packages/
  shared/                 tipos, schemas Zod, constantes (hábitos padrão, conquistas, regras), semver
    content/              Markdown (aprender, guia, oficinas, avisos) e JSON (questionários)
  ui/                     componentes shadcn/ui com o tema NEXO
  tauri-plugin-apk-updater/  plugin Tauri 2 (Rust + Kotlin) para baixar e instalar o APK
scripts/                  sync-version, release
.github/workflows/        ci.yml, release.yml
render.yaml, vercel (config em apps/client/vercel.json)
docs/piloto-nexo.html, docs/superpowers/...
```

- O `/admin` existe só no build web. No build Tauri a rota não é registrada (flag `import.meta.env.TAURI_ENV_PLATFORM` via `define`) e o código do admin entra por import dinâmico, fora do bundle nativo.
- O conteúdo em `packages/shared/content` é importado no build (`import.meta.glob` com `?raw`) e renderizado com um renderizador Markdown leve (ex.: `marked` + sanitização). Os questionários são JSON validados por schema Zod no build e nos testes.

## 6. Funcionalidades (comportamento)

### 6.1 Hoje (checklist)
Tipos de hábito: `boolean`, `counter` (alvo N, botões +/−), `minutes` (soma de blocos, alvo em min), `range_hours` (horas dormidas, cumprido se dentro de [min, max]).

| Hábito padrão | Tipo | Meta padrão |
|---|---|---|
| Movimento do dia | minutes | 30 min (blocos somados) |
| Pausas ativas | counter | 6 por dia (texto: "1 a cada 1 h sentado") |
| Mobilidade / alongamento suave | minutes | 5 min (texto: "5 a 10 min") |
| Respiração de recuperação | boolean | 1 sessão de 3 a 5 min |
| Sono | range_hours | 7 a 9 h |
| Hidratação | counter | 8 copos |

- O usuário ativa, desativa, edita metas e cria hábitos próprios (com os mesmos 4 tipos).
- Progresso do dia = hábitos ativos cumpridos / hábitos ativos.
- Os registros são indexados pela data local `YYYY-MM-DD`. A virada do dia é detectada por timer até a próxima meia-noite local e por `visibilitychange`/foco. Nada é apagado: o "reset" é só a troca da data exibida.
- **Modo progressivo** (opcional, desligado por padrão): a meta de movimento começa em 10 min e sobe 5 min quando a meta atual foi cumprida em ≥ 5 dos últimos 7 dias, até o teto definido pelo usuário (padrão 30). A meta nunca cai sozinha; o usuário pode baixá-la. *(Regra é decisão do construtor; constantes em `shared`.)*
- Microanimação ao marcar, desligada com `prefers-reduced-motion`.

### 6.2 Como foi seu dia
Escalas de 1 a 5: estresse percebido, humor, disposição, qualidade do sono; observação opcional (texto livre, **nunca sincronizado**: fica só no aparelho, para reduzir risco de dado sensível). Um registro por dia, editável.

### 6.3 Progresso
- **Dia válido para streak:** ≥ 50% dos hábitos ativos cumpridos *(decisão do construtor, constante em `shared`)*. Streak atual e recorde.
- Gráficos (Recharts) semanal e mensal: barras de minutos de movimento + linha de estresse (eixo secundário 1–5).
- Calendário com mapa de calor pela % do checklist.

### 6.4 Aprender
- Cards expansíveis no estilo do piloto com os cinco mecanismos, usando o texto do piloto como base e um parágrafo extra em linguagem cautelosa.
- Card fixo **Ressalva científica** (alerta com borda vermelha), com o texto do piloto.
- Referências do piloto.
- **Guia digital:** pausas ativas, roteiros de caminhada, sequência de mobilidade, respiração de recuperação, higiene do sono. O piloto não traz esses roteiros: o construtor escreve rascunhos com base no piloto e nas recomendações da OMS, cada arquivo com cabeçalho *"Rascunho — revisar pelo grupo e pelo profissional de Educação Física"*. Intensidade sempre leve a moderada, sempre com opção adaptada.

### 6.5 Questionários (tela Projeto)
- JSON em `packages/shared/content/questionnaires/{inicial,educativo,final}.json`, com tipos de pergunta: `scale` (1–5), `single` (múltipla escolha, com `correct` opcional no educativo), `number` (com unidade e limites), `text`.
- **Inicial:** dias/semana com ≥ 30 min de atividade física, horas sentado por dia, horas de sono, qualidade do sono (1–5), estresse percebido (1–5), dificuldades da rotina (múltipla escolha + texto).
- **Educativo:** ~10 perguntas de múltipla escolha tiradas só do conteúdo das oficinas, dos mecanismos e da ressalva. Mostra a nota ao final, com as respostas corretas.
- **Final:** reaplica as perguntas do inicial (mesmos `id`) + satisfação com as oficinas (1–5, várias afirmações) + adesão ("experimentou alguma atividade de movimento sugerida?" sim/não + quais).
- Respostas de texto livre não são enviadas ao servidor *(mesma regra da observação)*.
- Rascunhos das perguntas também com aviso de revisão pelo grupo.

### 6.6 Oficinas e presença
- Tela com Oficina 1 e Oficina 2 (duração 45–60 min, descrição e base científica do piloto).
- O admin cria uma **sessão de oficina** (oficina 1 ou 2, data, local) e o sistema gera um código curto de 6 caracteres (alfabeto sem ambiguidades) e um QR com a URL `https://<domínio-vercel>/checkin?c=CODIGO`. Válido até 24 h após a data da sessão.
- No app, o check-in é feito digitando o código ou abrindo o link/QR. A leitura do QR é feita pela câmera do próprio sistema (o link abre a web/PWA). O app nativo aceita o código digitado.
- O check-in exige consentimento e código de participante (é a única forma de contar presença sem identificar a pessoa). Offline, fica na fila e é validado no envio. Código inválido ou expirado gera mensagem clara.

### 6.7 Lembretes
Movimento, pausa ativa (intervalo configurável em horário de estudo), água, hora de dormir. `tauri-plugin-notification` no Windows/Android (agendamento nativo); Notifications API na web (só dispara com a aba/PWA aberta: limitação informada na tela).

### 6.8 Conquistas
Lista fixa em `shared`: primeiro dia completo; 3 e 7 dias seguidos; 1ª semana com 100%; 10 sessões de respiração; primeiro check-in em oficina; questionário inicial respondido. Sem ranking, sem conquistas por intensidade ou volume extremo.

### 6.9 Configurações
Tema claro/escuro/sistema; idioma (pt-BR, i18next); metas e hábitos; lembretes; sincronização (código de participante, chave de recuperação, status, sincronizar agora, revogar consentimento); exportar JSON (backup completo, reimportável) e CSV (registros diários); importar JSON; apagar todos os dados (local, e no servidor se houver sincronização); Sobre (versão, link do repositório, "Verificar atualizações"); avisos.

### 6.10 Primeira abertura
1. Boas-vindas + avisos (não substitui acompanhamento profissional; respeite seus limites; em caso de condição de saúde, procure orientação).
2. Consentimento LGPD: explica o uso anônimo e agregado no projeto acadêmico, o que é enviado e o que nunca é. Opções "Concordo e quero participar da pesquisa" ou "Usar sem enviar dados". Pode mudar depois.
3. Se concordou: gera o código de participante.

## 7. Dados, identidade e sincronização

**Identidade anônima**
- Código de participante `NEXO-XXXX` (4 caracteres Crockford base32), exibido para o usuário. Mais uma **chave de recuperação** de 24 caracteres, gerada no aparelho. O servidor guarda só o hash (argon2/scrypt). O código sozinho não dá acesso aos dados. *(Decisão do construtor: o prompt pede só o código, mas com 4 caracteres ele seria adivinhável.)*
- O registro acontece no primeiro sync: `POST /v1/participants` com código + chave. Se houver colisão de código, o servidor rejeita e o cliente gera outro.
- Restaurar em outro aparelho: digitar código + chave.

**Local (Dexie)**: tabelas `habits`, `habitEntries` (data, habitId, valor), `dailyLogs`, `questionnaireResponses`, `checkins`, `achievements`, `settings`, `outbox`. Toda entidade sincronizável tem `id` (UUID), `updatedAt` (ISO, relógio do cliente) e `deletedAt` (tombstone).

**Sincronização offline-first**
- Cada escrita local grava a entidade e enfileira no `outbox`, dentro da mesma transação.
- `POST /v1/sync`: envia as alterações pendentes. O servidor aplica last-write-wins por `updatedAt` (empate: maior `id`) e devolve o cursor.
- `GET /v1/sync?since=<cursor>`: devolve as alterações do servidor desde o cursor (usado para restaurar ou em outro aparelho).
- Gatilhos: ao abrir, ao voltar a conexão (`online`), a cada 15 min com o app aberto e no botão "sincronizar agora". Timeout de 60 s, retry exponencial (1, 2, 4, 8, 16 s; máximo 5 tentativas), indicador "sincronizando…".
- Campos de texto livre são removidos antes do envio.
- Sem consentimento: o outbox não é preenchido e nenhuma requisição de dados sai do app.

**Servidor (Prisma)**: `Participant` (id, code único, keyHash, consentAt, createdAt), `SyncRecord` (participantId, entity, entityId, payload JSON, updatedAt, deletedAt, serverSeq), `QuestionnaireResponse` (participantId, kind, answers JSON, score, submittedAt), `WorkshopSession` (id, workshop 1|2, date, location, code, expiresAt), `Checkin` (participantId, sessionId, createdAt, único por par). O `SyncRecord` genérico basta para ≤ 30 participantes. As estatísticas leem o JSON.

## 8. API (`/v1`, Fastify)

| Rota | Auth | Descrição |
|---|---|---|
| `GET /health` | — | status + versão + ping no banco |
| `POST /v1/participants` | — | registra código + chave (rate limit forte) |
| `POST /v1/sync`, `GET /v1/sync` | código + chave (header) | push/pull LWW |
| `POST /v1/questionnaires` | código + chave | envia resposta (servidor recalcula a nota do educativo) |
| `POST /v1/checkins` | código + chave | check-in por código de sessão |
| `DELETE /v1/participants/me` | código + chave | apaga todos os dados do participante (LGPD) |
| `POST /v1/admin/login` | senha | devolve JWT de 8 h |
| `GET/POST/DELETE /v1/admin/sessions` | JWT | sessões de oficina, código e QR |
| `GET /v1/admin/stats` | JWT | indicadores |
| `GET /v1/admin/export.csv` | JWT | dados agregados e anônimos por participante (código, sem texto livre) |

Rotas além das listadas no prompt (`participants`, `checkins`, `admin/login`, `admin/sessions`): necessárias para o check-in, o login admin e a exclusão LGPD.

`@fastify/rate-limit`, `@fastify/cors` (origens: domínio Vercel, `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`, localhost em dev), `@fastify/helmet`. Validação com os schemas Zod de `shared`. `prisma migrate deploy` no pre-deploy do Render. Senha do admin comparada em tempo constante, com rate limit no login.

## 9. Indicadores (cálculo no `/admin/stats`)

| Indicador | Cálculo | Meta / status |
|---|---|---|
| Participação | participantes distintos com ≥ 1 check-in | 20–30 → abaixo / na meta |
| Compreensão | % de acertos sobre todas as respostas do questionário educativo | ≥ 80% |
| Aceitação | % das respostas de satisfação com nota ≥ 4 | ≥ 80% |
| Adesão ao movimento | % dos que responderam o final e marcaram "sim" em experimentou atividades; complementar: % com ≥ 1 registro de movimento no checklist | ≥ 60% |
| Estresse e bem-estar | média inicial x final do questionário; média dos 7 primeiros x 7 últimos dias de registro diário (só para quem tem ≥ 14 dias) | sem meta: mostra "comparação", sem verde/vermelho |
| Frequência de atividade física | média de dias/semana ativos, inicial x final | sem meta: "verificar mudanças" |

Cada card mostra valor, meta, status e o n (tamanho da amostra), com aviso de amostra pequena quando n < 10. O export CSV traz uma linha por participante com as mesmas medidas.

## 10. Atualização automática

- **Windows:** `tauri-plugin-updater`, endpoint `https://github.com/JoaoGabrielOT/nexo-check/releases/latest/download/latest.json`, assinatura com a chave do updater. Verifica ao abrir e a cada 6 h. Diálogo com o changelog (`notes`), "Atualizar agora" ou "Depois". Instalação NSIS em modo passivo.
- **Android:** `GET https://api.github.com/repos/JoaoGabrielOT/nexo-check/releases/latest`; compara `tag_name` com a versão instalada (semver de `shared`); escolhe o asset `.apk`; o plugin Kotlin baixa para o cache do app emitindo eventos de progresso, verifica o tamanho, e abre o instalador via `FileProvider` + `ACTION_VIEW` com `REQUEST_INSTALL_PACKAGES`. Se a permissão "instalar apps desconhecidos" não estiver dada, abre a tela de configuração correspondente. Mesmas regras de frequência e diálogo do Windows. Toda release usa a mesma keystore (requisito para atualizar por cima).
- **Web:** `vite-plugin-pwa` com `registerType: 'prompt'` e um toast "Nova versão disponível — recarregar".
- **Versão:** fonte única no `package.json` raiz; `scripts/sync-version` propaga para os `package.json` dos workspaces, `tauri.conf.json` e `Cargo.toml`; `versionCode` do Android = `major*10000 + minor*100 + patch`. `pnpm release patch|minor|major` sobe a versão, gera o changelog (Conventional Commits, `conventional-changelog` ou `git-cliff`), commita, cria a tag e faz push.

## 11. CI/CD e implantação

- **`ci.yml`** (PR e push na `main`): pnpm install com cache, lint, typecheck, Vitest, build web, Playwright (Chromium) contra o build web com a API mockada; `cargo check` do `src-tauri` no Linux.
- **`release.yml`** (tag `v*.*.*`):
  - job Windows: `tauri-apps/tauri-action` gera `.exe`, `.msi`, `.sig` e `latest.json`;
  - job Android: JDK 17, Android SDK/NDK no runner, Rust com os targets Android, `tauri android build --apk` com a keystore decodificada dos secrets e o APK renomeado para `nexo-check-<versão>.apk`;
  - job final: cria a GitHub Release com os artefatos e o trecho do changelog da versão.
- **Vercel:** integração Git do projeto `apps/client` (root directory), build `pnpm turbo build --filter client`, `vercel.json` com rewrite SPA, env `VITE_API_URL`. Configurado pelo Claude in Chrome.
- **Render:** Blueprint `render.yaml` com o web service (free, Node, `pnpm --filter api build`, pre-deploy `prisma migrate deploy`, health check `/health`) e o banco (ver §12). Envs: `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `CORS_ORIGINS`. Configurado pelo Claude in Chrome.
- **Secrets do GitHub:** `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. A chave do updater é gerada com `pnpm tauri signer generate`; a keystore com `keytool` (JDK local). Arquivos privados gerados ficam **fora do repositório**, numa pasta que o usuário guarda, e a lista final com os comandos vai para o README.
- Windows sem certificado de assinatura de código: o SmartScreen avisa "editor desconhecido". Documentado no README.
- `gen/android` gerado pelo `tauri android init` e commitado (com assinatura e `versionCode` configurados). Como a máquina não tem Android SDK, o construtor gera esse projeto num workflow `workflow_dispatch` de bootstrap e commita, ou instala o SDK localmente se o usuário autorizar.

## 12. Decisões do usuário (2026-11-17)

1. **Banco de dados:** Postgres gratuito no **Neon** (sem expiração), com a API no Render. O `render.yaml` define só o web service; a `DATABASE_URL` vem do Neon (connection string com `sslmode=require`; usar a URL *pooled* na aplicação e a *direct* em `DIRECT_URL` para as migrações do Prisma). A criação da conta/projeto no Neon depende de confirmação do usuário no momento do deploy.
2. **Ordem:** a versão **web completa sai primeiro** (client + API + admin, publicada na Vercel e no Render). Depois vêm o `.exe` e o `.apk` (ver §15).
3. **Papel do app:** é a **ferramenta oficial** de coleta. Os questionários precisam de aprovação do grupo, mas isso fica **por último**. Até lá, os JSON são rascunhos marcados como tal; a revisão de conteúdo é a última etapa do trabalho.
4. **Consentimento LGPD:** sem resposta por enquanto. O texto usa campos provisórios bem visíveis (`[RESPONSÁVEL PELOS DADOS]`, `[CONTATO]`, `[PRAZO DE GUARDA]`) num único arquivo Markdown de conteúdo, a preencher pelo grupo antes do piloto. A versão do consentimento (§12.1) permite trocar o texto depois e pedir o aceite de novo.

## 12.1 Decisões do construtor tomadas após a revisão

- **Versão do consentimento:** o cliente e o servidor guardam `consentVersion` junto com `consentAt`. Se o texto mudar, o app pede o consentimento de novo antes de sincronizar.
- **Versão dos questionários:** cada JSON tem `version`, e as perguntas têm `id` estável. Toda resposta guarda a versão. Mudar o texto de uma pergunta já respondida exige um `id` novo, para não quebrar a comparação inicial x final. Teste automatizado garante que os `id` comparáveis existem no inicial e no final.
- **Presença sem o app:** o admin pode lançar presenças manuais por sessão (contagem anônima, sem código de participante). O indicador de participação mostra o total (check-ins + manuais) e o detalhamento.
- **Raiz do repositório:** a pasta `A3` vira a raiz do repositório público. `.claude/` (agentes e instruções do projeto, sem segredos) é versionada; `CONTEXTO_SESSAO.md`, `abrir-sessao-claude.cmd`, `.claude/settings.local.json`, `.env*` e chaves de assinatura ficam no `.gitignore`. O `PILOTO - NEXO.html` é movido para `docs/piloto-nexo.html`; os dois `.md` de origem vão para `docs/origem/`.

## 13. Design visual e acessibilidade

- Tokens do piloto: `--bg #f7f5f2`, `--navy #1d1a5c`, `--lav #a8a4c2`, `--lav2 #c9c6dc`, `--or #f5a64a`, `--rd #c0575a`, `--bl #3a8bc8`, branco. Montserrat 400/600/800 (self-hosted via `@fontsource/montserrat`, para funcionar offline). Títulos em 800 com `letter-spacing` negativo.
- Painéis lavanda com raio de 36 px, cards de 24 px, botões e abas em pílula (navy selecionado), alertas com borda esquerda vermelha de 8 px, "pílulas" decorativas laranja/vermelho/azul fixas nas bordas (escondidas atrás do conteúdo, `aria-hidden`).
- Modo escuro derivado: fundo navy, superfícies navy mais claras, texto `#f7f5f2`, lavanda para elementos secundários, acentos mantidos. Contraste conferido para AA (o texto sobre laranja usa navy).
- Mobile-first; ≥ 1024 px: sidebar. Ícones Lucide. Foco visível azul (como no piloto), navegação por teclado, `aria-label`, alvos de pelo menos 44 px.

## 14. Testes e qualidade

- Vitest: regras em `shared` (cumprimento de hábito, streak, modo progressivo, conquistas, semver, cálculo de indicadores, validação dos JSON de conteúdo), repositórios Dexie (`fake-indexeddb`), outbox/sync, rotas da API (Fastify `inject` + Postgres em container no CI, ou Prisma com banco de teste).
- Playwright (web): onboarding com e sem consentimento, marcar hábitos e ver o progresso, registro do dia, questionário educativo com nota, check-in com código, export JSON, tema escuro, admin login + criar sessão.
- Teste de conteúdo: varredura nos Markdown/JSON por termos proibidos ("causa neurogênese", "aumenta o BDNF", "melhora suas notas", "HIIT" fora do contexto de modalidade estudada).
- ESLint + Prettier + TS strict; Husky + lint-staged no pre-commit; Conventional Commits (commitlint).

## 15. Ordem de implementação (etapas com commit)

**Fase A — Web (entregue primeiro)**
1. Repositório GitHub, monorepo, ferramentas de qualidade, `shared` com tipos e regras, `ci.yml`.
2. Client web offline: tema, layout, onboarding/consentimento, Hoje, Registro, Progresso, Aprender + guia, Configurações (export/import/apagar), PWA.
3. Questionários (rascunhos), oficinas, conquistas, lembretes (web).
4. API: participantes, sync, questionários, check-in, exclusão; cliente de sync.
5. Admin: login, sessões + QR, presença manual, indicadores, CSV.
6. Deploy: Neon, Render (`render.yaml`), Vercel; README da parte web.

**Fase B — Nativos**
7. Tauri Windows: shell, notificações, updater.
8. Tauri Android: bootstrap do `gen/android`, plugin de update do APK, assinatura.
9. `release.yml`, secrets, script `pnpm release`, README completo e release `v0.1.0`.

**Fase C — Conteúdo**
10. Revisão com o grupo: questionários, guia digital e texto LGPD (campos provisórios).

## 16. Deixado ao construtor

Nomes de componentes e arquivos internos; biblioteca de Markdown e de changelog; textos de UI e o detalhe dos rascunhos de conteúdo (respeitando §2 e §6.4); layout exato das telas, dentro de §13; estratégia de banco nos testes da API. Também as regras marcadas como *decisão do construtor*: modo progressivo, limiar de streak, chave de recuperação e não envio de texto livre.
