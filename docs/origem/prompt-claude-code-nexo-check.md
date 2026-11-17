# Prompt para o Claude Code — NEXO Check

Antes de colar o prompt, crie a pasta do repositório e coloque nela o arquivo `PILOTO - NEXO.html` renomeado para `docs/piloto-nexo.html`. Depois copie tudo abaixo da linha e cole no Claude Code, dentro dessa pasta.

---

Você vai criar do zero o **NEXO Check**, um app de checklist diário de bem-estar para estudantes universitários. Ele faz parte do projeto acadêmico **"NEXO em Movimento — Neurociência do Exercício Físico aplicada à saúde mental universitária"**, da NEXO Consultoria.

Pergunta norteadora do projeto: *como a prática regular e acessível de exercícios físicos pode contribuir para mitigar fatores associados à sobrecarga cerebral, ao estresse e à ansiedade entre estudantes universitários?*

O arquivo `docs/piloto-nexo.html` (apresentação piloto do grupo) está na raiz do repositório. Leia esse arquivo antes de começar: ele é a fonte de verdade para o conteúdo científico, a identidade visual, as etapas 5W2H, as oficinas e os indicadores.

### Regras de conteúdo (obrigatórias)
- **O movimento é o protagonista.** Sono, respiração, hidratação e pausas são estratégias complementares de recuperação.
- **Intensidade leve a moderada**, adaptável. O HIIT aparece só como modalidade estudada, nunca como meta ou recomendação.
- **Linguagem cautelosa**: use "pode contribuir" e "está associado a". Nunca afirme que o app ou as oficinas causam neurogênese, aumentam BDNF ou melhoram notas.
- **Sem metas de redução de estresse predefinidas**: só comparar antes e depois.
- Aviso visível de que o app não substitui acompanhamento profissional e de que as atividades devem respeitar os limites de cada pessoa.

Antes de escrever código, apresente um plano com a estrutura de pastas, as dependências e a ordem de implementação, e espere a minha aprovação. Trabalhe em etapas pequenas, com commits a cada etapa concluída. Se alguma decisão depender de informação que eu não dei (contas, chaves, nomes), pergunte em vez de presumir.

## 1. Plataformas

O mesmo código deve gerar:

1. **Windows desktop**: instalador `.exe` (NSIS) e `.msi`.
2. **Android**: `.apk` assinado, instalado fora da Play Store.
3. **Web**: frontend publicado na **Vercel** e backend/API publicado no **Render**.

## 2. Stack (obrigatória)

- **Monorepo** com `pnpm` workspaces e Turborepo.
- **Frontend**: TypeScript + React + Vite, com Tailwind CSS e componentes shadcn/ui.
- **Shell nativo**: **Tauri 2** (Rust) para Windows e Android, reaproveitando o mesmo frontend.
- **Armazenamento local**: IndexedDB via Dexie. O app funciona 100% offline.
- **Backend**: Node.js + TypeScript + Fastify, com PostgreSQL (Render Postgres) e Prisma ORM.
- **Validação**: Zod, com schemas compartilhados entre frontend e backend.
- **Testes**: Vitest (unitários) e Playwright (end-to-end da versão web).
- **Qualidade**: ESLint, Prettier, TypeScript em modo `strict`, Husky + lint-staged.

Estrutura esperada:

```
apps/
  client/        # React + Vite (web) + src-tauri (Windows/Android)
  api/           # Fastify + Prisma
packages/
  shared/        # tipos, schemas Zod, constantes
  ui/            # componentes compartilhados
.github/workflows/
```

## 3. Funcionalidades

### 3.1 Checklist diário (tela "Hoje")
Hábitos padrão, que o usuário pode ativar, desativar e editar, e aos quais pode adicionar hábitos próprios:

| Hábito | Meta padrão |
|---|---|
| Movimento do dia (caminhada / aeróbico leve a moderado) | 30 min, podendo somar blocos |
| Pausas ativas | 1 a cada 1 h sentado |
| Mobilidade / alongamento suave | 5 a 10 min |
| Respiração de recuperação | 3 a 5 min |
| Sono | 7 a 9 h |
| Hidratação | 8 copos (contador +/−) |

Inclui barra de progresso do dia e reset automático à meia-noite no fuso local. Também há um **modo progressivo** opcional: a meta de movimento começa em 10 min e sobe aos poucos, conforme a adesão.

### 3.2 Registro do dia (tela "Como foi seu dia")
Escala de 1 a 5 para estresse percebido, humor, disposição e qualidade do sono, mais um campo opcional de observação.

### 3.3 Progresso
- Streak de dias seguidos e recorde pessoal.
- Gráficos semanal e mensal (Recharts): minutos de movimento x estresse percebido.
- Calendário com mapa de calor dos dias.

### 3.4 Aprender
Cards expansíveis, no mesmo estilo dos cards do piloto, com os mecanismos: BDNF e neuroplasticidade, hipocampo, eixo HPA e cortisol, circuitos de recompensa e córtex pré-frontal. Inclui um card fixo com a **ressalva científica** do piloto (BDNF no sangue não comprova neurogênese no cérebro humano).

Também inclui o **guia digital** das oficinas: pausas ativas, roteiros de caminhada, sequência de mobilidade, respiração de recuperação e higiene do sono.

Todo o conteúdo fica em arquivos Markdown dentro de `packages/shared/content`, extraído do `docs/piloto-nexo.html`, para facilitar a edição pelo grupo.

### 3.5 Questionários do projeto
- **Inicial (diagnóstico):** atividade física, tempo sedentário, sono, estresse percebido e dificuldades da rotina.
- **Educativo:** perguntas de múltipla escolha sobre o conteúdo das oficinas, para medir compreensão (meta: 80% de acertos).
- **Final (avaliação):** reaplica as perguntas do diagnóstico e inclui satisfação com as oficinas e adesão (se experimentou atividades de movimento).
- As perguntas são definidas em JSON, sem precisar mexer no código.

### 3.6 Oficinas e presença
- Tela com as duas oficinas do piloto (Oficina 1: exercício físico, cérebro e regulação do estresse; Oficina 2: movimento consciente, recuperação e bem-estar), com duração, descrição e base científica.
- Check-in de presença por código curto ou QR code gerado no painel admin.

### 3.7 Lembretes
Notificações locais configuráveis (movimento, pausa ativa, água, hora de dormir), usando `tauri-plugin-notification` no Windows e no Android e a Notifications API na web.

### 3.8 Gamificação leve
Conquistas simples (ex.: "7 dias seguidos", "1ª semana com 100%"), sem ranking entre usuários e sem incentivo a esforço intenso.

### 3.9 Configurações
- Tema claro, escuro ou do sistema.
- Idioma pt-BR, com estrutura i18n (i18next) pronta para outros idiomas.
- Exportar e importar dados em JSON e CSV.
- Apagar todos os dados.
- Tela "Sobre" com versão, link do repositório e botão "Verificar atualizações".

## 4. Contas, sincronização e privacidade (LGPD)

- O app funciona **sem conta**.
- A sincronização com o backend é **opcional** e feita por **código anônimo de participante** (ex.: `NEXO-4F7K`), gerado no app. Não coletar nome, e-mail nem telefone.
- Na primeira abertura, exibir uma tela de consentimento (LGPD) explicando que os dados são usados de forma anônima e agregada no projeto acadêmico. Sem consentimento, nada é enviado.
- A sincronização é offline-first: fila local de alterações, envio quando houver conexão e resolução de conflito por `updatedAt`.

## 5. Painel do grupo (admin)

Rota `/admin` na versão web, protegida por senha definida em variável de ambiente:
- criação de oficinas, com geração de código e QR de check-in;
- dados agregados e anônimos, com painel dos **indicadores do piloto**:

| Indicador | Meta | Fonte |
|---|---|---|
| Participação | 20 a 30 estudantes | Check-ins |
| Compreensão dos conteúdos | 80% de acertos | Questionário educativo |
| Aceitação das oficinas | 80% de avaliações positivas | Questionário final |
| Adesão ao movimento | 60% relatando ter experimentado atividades | Questionário final + checklist |
| Estresse percebido e bem-estar | Comparar antes x depois, sem meta | Registros diários + questionários |
| Frequência de atividade física | Verificar mudanças | Questionários inicial e final |

- Cada indicador mostra o valor atual, a meta e o status.
- Exportação em CSV para o relatório final (etapa 4 do 5W2H).

## 6. Atualização automática via GitHub Releases

### Windows
- Usar `tauri-plugin-updater`, com endpoint apontando para o `latest.json` da última release do GitHub.
- Atualizações assinadas com a chave do updater do Tauri.
- Verificar ao abrir o app e a cada 6 h. Mostrar diálogo com o changelog da release e as opções "Atualizar agora" e "Depois".

### Android
O updater do Tauri não cobre mobile, então implementar um plugin/comando próprio que:
1. consulta `https://api.github.com/repos/<OWNER>/<REPO>/releases/latest`;
2. compara a versão com a instalada (semver);
3. baixa o `.apk` da release, mostrando o progresso;
4. abre o instalador do sistema via `FileProvider` + intent, com a permissão `REQUEST_INSTALL_PACKAGES`.

### Web
- PWA com `vite-plugin-pwa`.
- Quando houver nova versão do service worker, mostrar um aviso "Nova versão disponível — recarregar".

### Versionamento
- A versão vem de uma única fonte (`package.json` raiz) e é sincronizada com `tauri.conf.json` e com o `versionCode` do Android por script.
- Changelog gerado a partir de Conventional Commits.

## 7. CI/CD (GitHub Actions)

- **`ci.yml`** (em PR e push na `main`): lint, typecheck, testes unitários e build web.
- **`release.yml`** (em push de tag `v*.*.*`):
  - build do Windows com `tauri-apps/tauri-action`, gerando `.exe`, `.msi` e `latest.json` assinado;
  - build do Android (`tauri android build --apk`) assinado com keystore guardada em secrets;
  - criação da GitHub Release com todos os artefatos e o changelog.
- **Deploy**:
  - frontend na Vercel (integração Git ou `vercel deploy` na action);
  - API no Render via `render.yaml` (Blueprint), com o serviço web e o Postgres definidos no arquivo.

Ao final, liste todos os **secrets** que eu preciso criar no GitHub, na Vercel e no Render (chave do updater Tauri, keystore Android e senhas, `DATABASE_URL`, senha do admin etc.) e os comandos para gerar cada um.

## 8. Backend (API no Render)

- Endpoints REST versionados (`/v1`): `POST /sync`, `GET /sync`, `POST /questionnaires`, `GET /admin/stats`, `GET /admin/export.csv` e `GET /health`.
- Rate limiting, CORS restrito aos domínios da Vercel e do app, e Helmet.
- Migrações do Prisma executadas automaticamente no deploy.
- O plano gratuito do Render hiberna; o cliente deve tolerar cold start (timeout maior, retry com backoff e indicação de "sincronizando").

## 9. Design e acessibilidade

- Mobile-first e responsivo; no desktop, layout com barra lateral.
- **Identidade visual igual à do piloto** (`docs/piloto-nexo.html`):
  - fonte Montserrat (400/600/800), títulos em peso 800 com `letter-spacing` negativo;
  - tokens de cor: `--bg #f7f5f2`, `--navy #1d1a5c`, `--lav #a8a4c2`, `--lav2 #c9c6dc`, `--or #f5a64a`, `--rd #c0575a`, `--bl #3a8bc8`;
  - painéis lavanda com `border-radius` de 36 px, cards de 24 px, botões em pílula e as "pílulas" coloridas decorativas nas bordas da tela;
  - alertas com borda esquerda vermelha, como a "Ressalva científica";
  - modo escuro derivado dessa paleta (fundo navy, texto claro).
- Ícones Lucide.
- WCAG AA: contraste, navegação por teclado, `aria-labels` e alvos de toque de pelo menos 44 px.
- Microanimações discretas ao marcar um hábito, respeitando `prefers-reduced-motion`.

## 10. Entregáveis

1. Repositório funcionando com `pnpm install` e `pnpm dev`.
2. `README.md` com:
   - visão geral e capturas de tela;
   - pré-requisitos (Node, pnpm, Rust, Android SDK/NDK, JDK);
   - como rodar cada plataforma localmente;
   - como gerar uma release (`pnpm release patch|minor|major`, criando a tag e disparando a action);
   - como configurar Vercel, Render e os secrets.
3. Testes passando no CI.
4. Primeira release `v0.1.0` gerada pela pipeline, com `.exe`, `.msi` e `.apk`.

Comece pelo plano.
