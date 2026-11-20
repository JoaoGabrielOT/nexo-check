# NEXO Check — Fase B (Nativos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar o app Windows (`.exe` NSIS + `.msi`, com atualização automática assinada) e o app Android (`.apk` assinado, com atualização pelo GitHub Releases) a partir do mesmo client, e publicar a release `v0.1.0` pela pipeline.

**Architecture:** Tauri 2 em `apps/client/src-tauri` empacota o build Vite do client. O client escolhe, pela variável de build `TAURI_ENV_PLATFORM`, os adaptadores de `src/platform/` (links, arquivos, notificações, updater) para web, desktop ou Android. O update do Windows usa `tauri-plugin-updater`; o do Android usa o plugin próprio `packages/tauri-plugin-apk-updater` (Rust + Kotlin), alimentado pela API pública `releases/latest`. Como a máquina local não tem Rust nem Android SDK, todo build nativo roda no GitHub Actions (`native-build.yml`, reutilizado pelo `release.yml`), e os arquivos gerados (`Cargo.lock`, `gen/android`) são criados e commitados por um workflow `workflow_dispatch` de bootstrap.

**Tech Stack:** Tauri 2 (`@tauri-apps/cli`, `@tauri-apps/api`, plugins `notification`, `updater`, `process`, `opener`, `dialog`, `fs`), Rust stable (≥ 1.90, exigido pelo plugin de notificação), Kotlin (Android library do plugin), Gradle/AGP do template do Tauri, JDK 17 no CI, Android SDK + NDK `27.2.12479018`, `tauri-apps/tauri-action@v1`, `android-actions/setup-android@v3`, `reactivecircus/android-emulator-runner@v2`, `git-cliff` (npm), Vitest, JUnit 4.

**Spec:** `docs/superpowers/specs/2026-11-17-nexo-check-design.md` (ler §§3, 5, 6.7, 6.9, 10, 11 e 15 antes de qualquer tarefa). Ledger da Fase A: `.superpowers/sdd/2026-11-17-nexo-check-fase-a-web/progress.md`.

**Execução:** subagent-driven com os agentes de `.claude/agents` (`testador` → `implementador` → `revisor`; `monitor-ci` acompanha cada execução do Actions; `conferidor-visual` confere as capturas dos smoke tests). Ledger novo em `.superpowers/sdd/2026-11-20-nexo-check-fase-b-nativos/progress.md`. Os **Checkpoints U1 e U2** são do usuário; o resto não depende dele.

## Global Constraints

- Todas as restrições globais do plano da Fase A continuam valendo (linguagem cautelosa, avisos, consentimento, texto livre nunca enviado, i18n só em `apps/client/src/i18n/pt-BR.json`, acessibilidade).
- `identifier` = `io.github.joaogabrielot.nexocheck` (nunca muda: os dados locais do WebView e a atualização por cima dependem dele). `productName` = `NEXO Check`. Crate `nexo-check`, lib `nexo_check_lib`.
- Não ativar `useHttpsScheme` (a origem do WebView, `http://tauri.localhost`, guarda o IndexedDB; trocá-la perde os dados). A API já aceita `tauri://localhost`, `http://tauri.localhost` e `https://tauri.localhost` (`apps/api/src/app.ts:18`).
- Endpoint do updater Windows: `https://github.com/JoaoGabrielOT/nexo-check/releases/latest/download/latest.json`. `plugins.updater.windows.installMode` = `"passive"`. `bundle.windows.nsis.installMode` = `"currentUser"`.
- Android: `GET https://api.github.com/repos/JoaoGabrielOT/nexo-check/releases/latest`; só aceita asset `.apk` cuja URL comece com `https://github.com/JoaoGabrielOT/nexo-check/releases/download/`. Nome do asset: `nexo-check-<versão>.apk`.
- Verificação de atualização: ao abrir e a cada `UPDATE_CHECK_INTERVAL_MS = 21_600_000` (6 h). Diálogo com as notas, "Atualizar agora" ou "Depois".
- `versionCode = major*10000 + minor*100 + patch`; `minor` e `patch` ≤ 99 (senão colide); versão `0.0.0` (desenvolvimento) grava `versionCode` 1. `bundle.android.minSdkVersion` = 26 (Android 8, primeiro com `canRequestPackageInstalls`).
- Fonte única da versão: `version` do `package.json` raiz. `__APP_VERSION__` já vem dele (`apps/client/vite.config.ts`).
- Builds nativos usam `VITE_API_URL=https://nexo-check-api.onrender.com`.
- CI: Node 22, JDK 17 (temurin), Rust stable, NDK `27.2.12479018`, targets Android `aarch64`, `armv7`, `x86_64` (o x86_64 permite o smoke no emulador).
- Secrets do GitHub (nomes exatos): `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Arquivos privados ficam fora do repositório, em `%USERPROFILE%\nexo-check-chaves\` (`updater.key`, `updater.key.pub`, `nexo-check.keystore`). Nada de chave, senha ou `keystore.properties` no git.
- O `/admin` nunca entra no bundle nativo (nem como chunk).
- Commits: Conventional Commits com assunto em minúsculas (commitlint), terminando com as linhas de atribuição da sessão. Agentes commitam localmente; o controlador faz o push e confere o CI (decisão da Fase A).
- Sem Rust/SDK local: nenhum passo pode exigir `cargo`, `rustc` ou `gradlew` na máquina. Builds nativos são verificados pelo `native-build.yml` (push em `main` com mudança nas pastas nativas, ou `workflow_dispatch`). Para disparar um workflow por API, usar a credencial do Git Credential Manager sem imprimir o token:

```powershell
$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$token = (($cred -split "`n") | Where-Object { $_ -like 'password=*' }).Substring(9)
$body = @{ ref = 'main'; inputs = @{ task = 'cargo-lock' } } | ConvertTo-Json   # inputs conforme o workflow
Invoke-RestMethod -Method Post -Headers @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json' } `
  -Uri 'https://api.github.com/repos/JoaoGabrielOT/nexo-check/actions/workflows/bootstrap-native.yml/dispatches' -Body $body
```

## Review Focus

1. **Chave pública do updater diferente da privada dos secrets:** o app publicado nunca conseguiria se atualizar. A pessoa espera que toda release instalada aceite a próxima. → `verifyMinisign` + `scripts/verify-updater.mjs` bloqueiam o publish (Task 10).
2. **APK assinado com outra keystore (ou sem assinatura):** o Android recusa instalar por cima e a pessoa perde a atualização (ou os dados, se desinstalar). → tag sem secrets falha; fingerprint do certificado fixado no repositório e conferido em toda release (Task 8).
3. **Dados locais depois de atualizar:** hábitos e registros continuam lá após instalar a versão nova. → teste de configuração que trava `identifier`, ausência de `useHttpsScheme` e endpoint (Task 2).
4. **Lembretes no Android com o app fechado:** continuam disparando; mudar a configuração substitui sem duplicar; desmontar o layout (ou o StrictMode) não cancela o agendamento nativo. → testes do adaptador Android (Task 3).
5. **Verificação automática sem internet, com rate limit (403) da API do GitHub, release sem `.apk` ou com versão igual/menor:** nenhum diálogo e nenhum erro na tela; só a verificação manual mostra mensagem. → testes do store (Task 4) e de `evaluateRelease` (Task 7).

---

## Estrutura de arquivos (Fase B)

```
.github/workflows/
  ci.yml                    + job tauri-check (cargo check, bundle nativo sem admin/PWA, scripts)
  native-build.yml          build Windows + Android, smoke tests; workflow_call/dispatch/push
  bootstrap-native.yml      workflow_dispatch: cargo-lock | android-init (commita o gerado)
  release.yml               tag v*.*.*: draft → native-build → verificação → publish
cliff.toml  CHANGELOG.md
scripts/
  vitest.config.mjs
  lib/version.mjs           versionCode, androidVersionCode, bumpVersion
  lib/sync-version.mjs      syncVersionInFiles (puro)
  lib/changelog.mjs         changelogSection
  lib/minisign.mjs          verifyMinisign
  lib/release-plan.mjs      planRelease
  sync-version.mjs  changelog-section.mjs  verify-updater.mjs  release.mjs   (CLIs finas)
  test/*.test.mjs
apps/client/
  public/theme-init.js      tema antes do React (sai do inline, por causa da CSP)
  scripts/check-native-bundle.mjs
  src/platform/runtime.ts  links.ts  files.ts  notifications.ts  notifications-tauri.ts
  src/platform/pwa-register-noop.ts
  src/platform/updater/{types,store,desktop,github,android}.ts
  src/features/update/{UpdateDialog.tsx,useUpdateChecks.ts,index.ts}
  src-tauri/
    Cargo.toml  Cargo.lock  build.rs  tauri.conf.json  .gitignore  android-signing.sha256
    src/main.rs  src/lib.rs
    capabilities/{default,desktop,mobile}.json
    icons/*  gen/android/** (gerado pelo bootstrap)
  test/platform/*.test.ts  test/features/update-dialog.test.tsx  test/native-config.test.ts
packages/tauri-plugin-apk-updater/
  Cargo.toml  build.rs  package.json  permissions/default.toml
  src/{lib,commands,mobile,desktop,models,error}.rs
  guest-js/index.ts
  android/build.gradle.kts  android/src/main/AndroidManifest.xml
  android/src/main/res/xml/apk_updater_paths.xml
  android/src/main/java/{ApkUpdaterPlugin.kt,ApkFiles.kt}
  android/src/test/java/ApkFilesTest.kt
```

---

### Task 1: Modo nativo no client (plataforma, links, arquivos, PWA desligado)

**Files:**
- Create: `apps/client/src/platform/{runtime.ts,links.ts,pwa-register-noop.ts}`, `apps/client/scripts/check-native-bundle.mjs`, `apps/client/test/platform/{runtime,links,files}.test.ts`, `apps/client/test/features/router-native.test.ts`
- Modify: `apps/client/src/platform/files.ts`, `apps/client/vite.config.ts`, `apps/client/src/env.d.ts`, `apps/client/src/app/router.tsx:13-27`, `apps/client/src/main.tsx`, `apps/client/package.json`

**Interfaces:**
- Produces:
  - `type Platform = 'web' | 'desktop' | 'android'`; `toPlatform(raw: string | undefined): Platform` (`'android'` → android; outro valor não vazio → desktop; vazio/undefined → web); `PLATFORM: Platform` (de `import.meta.env.TAURI_ENV_PLATFORM`); `isNative(p: Platform = PLATFORM): boolean`
  - `openExternal(url: string): Promise<void>` (nativo: `openUrl` de `@tauri-apps/plugin-opener`; web: `window.open(url, '_blank', 'noopener')`)
  - `installExternalLinkHandler(root: Document, open: (url: string) => Promise<void> | void): () => void`
  - `files.ts` mantém os nomes usados pelos testes atuais: `downloadFile(name: string, content: string, mime: string): Promise<void>`, `pickFile(accept: string): Promise<string | null>`; novo `extensionsFromAccept(accept: string): string[]`
  - `env.d.ts`: `TAURI_ENV_PLATFORM?: 'windows' | 'linux' | 'darwin' | 'android' | 'ios'`

- [ ] **Step 1:** Instalar no client `@tauri-apps/api@^2`, `@tauri-apps/plugin-opener@^2`, `@tauri-apps/plugin-dialog@^2`, `@tauri-apps/plugin-fs@^2` (dependências) e `@tauri-apps/cli@^2` (dev); script `"tauri": "tauri"` no `apps/client/package.json`.
- [ ] **Step 2: Testes que falham:**
  - `runtime.test.ts`: `toPlatform(undefined)` → `'web'`; `toPlatform('')` → `'web'`; `toPlatform('windows')` → `'desktop'`; `toPlatform('android')` → `'android'`; `isNative('web')` → false.
  - `links.test.ts` (jsdom): clique em `<a href="https://who.int/x" target="_blank">` chama `open('https://who.int/x')` e o evento fica `defaultPrevented`; clique em `<a href="/aprender">` não chama `open`; `mailto:` não chama; a função devolvida remove o listener (clique depois dela não chama).
  - `files.test.ts`: `extensionsFromAccept('application/json,.json')` → `['json']`; `extensionsFromAccept('.csv, text/csv')` → `['csv']`; com `vi.mock('@tauri-apps/plugin-dialog')` e `vi.mock('@tauri-apps/plugin-fs')` e a plataforma nativa forçada (`vi.stubEnv('TAURI_ENV_PLATFORM','windows')` + `vi.resetModules()` + import dinâmico): `downloadFile('b.json','{}','application/json')` chama `save({ defaultPath: 'b.json', filters: [{ name: 'json', extensions: ['json'] }] })` e `writeTextFile(<caminho devolvido>, '{}')`; `save` devolvendo `null` não chama `writeTextFile`; `pickFile` chama `open` com o filtro e devolve o `readTextFile` do caminho, ou `null` se cancelado.
  - `router-native.test.ts`: com `TAURI_ENV_PLATFORM='windows'`, nenhuma rota de `routes` (recursivo) tem `path` começando com `admin`; sem a variável, existe `admin/*`.
- [ ] **Step 3:** `pnpm --filter client test` → FAIL.
- [ ] **Step 4:** Implementar `runtime.ts`, `links.ts`, o despacho por plataforma em `files.ts` (web continua com o `<a download>` e o `<input type=file>` atuais) e, em `main.tsx`, `if (isNative()) installExternalLinkHandler(document, openExternal)`.
- [ ] **Step 5:** Em `router.tsx`, mover o `lazy(() => import('../features/admin/AdminRoutes'))` para dentro do ramo web do ternário, para o minificador eliminar o `import()` no build nativo (spec §5: admin fora do bundle nativo).
- [ ] **Step 6:** Em `vite.config.ts`: `const native = Boolean(process.env.TAURI_ENV_PLATFORM)`; sem `VitePWA` quando `native`; alias `virtual:pwa-register/react` → `src/platform/pwa-register-noop.ts` quando `native` (mesmo formato do stub de teste `test/pwa-register-react.ts`). `check-native-bundle.mjs <dist>`: falha (exit 1, mensagem clara) se existir `assets/AdminRoutes-*.js`, `sw.js` ou `manifest.webmanifest`.
- [ ] **Step 7:** Testes → PASS. `pnpm lint && pnpm typecheck && pnpm test` → PASS. Em Git Bash: `TAURI_ENV_PLATFORM=windows pnpm --filter client exec vite build --outDir dist-native && node apps/client/scripts/check-native-bundle.mjs apps/client/dist-native` → exit 0; `pnpm --filter client build` (web) continua gerando `sw.js`. Apagar `dist-native` e adicioná-lo ao `.gitignore`.
- [ ] **Step 8:** Commit `feat(client): native platform adapters for links and files`.

---

### Task 2: Shell Tauri do Windows, CI e build nativo

**Files:**
- Create: `apps/client/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,.gitignore,src/main.rs,src/lib.rs,capabilities/default.json,icons/*}`, `apps/client/public/theme-init.js`, `apps/client/test/native-config.test.ts`, `.github/workflows/{native-build.yml,bootstrap-native.yml}`
- Modify: `apps/client/index.html` (inline script → `<script src="/theme-init.js"></script>`), `.github/workflows/ci.yml`, `.gitignore`, `.prettierignore`, `eslint.config.mjs`
- Generated by CI: `apps/client/src-tauri/Cargo.lock`

**Interfaces:**
- Consumes: Task 1 (modo nativo do Vite, `check-native-bundle.mjs`)
- Produces:
  - `tauri.conf.json` (valores fixos): `productName` `NEXO Check`, `version` `0.0.0`, `identifier` (Global Constraints), `build.frontendDist` `../dist`, `build.devUrl` `http://localhost:5173`, `build.beforeDevCommand` `pnpm dev`, `build.beforeBuildCommand` `pnpm build`, janela `main` (1200×800, mínimo 360×600, título `NEXO Check`), `bundle.targets` `["nsis","msi"]`, `bundle.createUpdaterArtifacts` `false` (vira `true` na Task 4), `bundle.publisher` `NEXO Consultoria`, `bundle.windows.nsis.installMode` `currentUser`, `bundle.android.minSdkVersion` 26, `bundle.android.versionCode` 1, `app.security.csp` abaixo.
  - `lib.rs`: `#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()` registrando `tauri_plugin_opener`, `tauri_plugin_dialog`, `tauri_plugin_fs`; `main.rs` chama `nexo_check_lib::run()` com `windows_subsystem = "windows"` em release. `[lib] crate-type = ["staticlib", "cdylib", "rlib"]` (exigência do Android).
  - `native-build.yml`: `on: workflow_call` (inputs `release-id`, `tag`, `notes`, strings com padrão `''`), `workflow_dispatch`, `push` em `main` com `paths` `apps/client/src-tauri/**`, `packages/tauri-plugin-apk-updater/**`, `.github/workflows/native-build.yml`. Job `windows` produz o artefato `windows-bundle` e `windows-smoke.png`.
  - `bootstrap-native.yml`: `workflow_dispatch` com input `task` (choice: `cargo-lock`; `android-init` entra na Task 5), `permissions: contents: write`, commita como `github-actions[bot]`.

CSP (`app.security.csp`): `default-src 'self'; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://nexo-check-api.onrender.com http://localhost:3333 https://api.github.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`

- [ ] **Step 1: Teste que falha** — `native-config.test.ts` lê `src-tauri/tauri.conf.json` e confere: `identifier === 'io.github.joaogabrielot.nexocheck'`; nenhuma janela com `useHttpsScheme: true`; `build.frontendDist === '../dist'`; `bundle.android.minSdkVersion === 26`; a CSP contém `connect-src` com `https://nexo-check-api.onrender.com`; `index.html` não tem `<script>` inline (só com `src`). (Review Focus 3.)
- [ ] **Step 2:** `pnpm --filter client test native-config` → FAIL.
- [ ] **Step 3:** Mover o script de tema de `index.html` para `public/theme-init.js` (mesmo conteúdo) e carregá-lo com `<script src="/theme-init.js"></script>` no `<head>` (clássico, bloqueante). Criar o `src-tauri` com os valores de **Interfaces**; capability `default.json` (`windows: ["main"]`, `core:default`, `opener:default`, `dialog:default`, `fs:allow-read-text-file`, `fs:allow-write-text-file`). `src-tauri/.gitignore`: `/target/`, `/gen/schemas`. Gerar os ícones localmente (o CLI do Tauri é binário npm, não precisa de Rust): `pnpm --filter client tauri icon public/icons/icon.svg` (se o SVG não for aceito, gerar um PNG 1024 com `sharp` a partir do SVG, fora do repositório, e usar esse PNG).
- [ ] **Step 4:** `.gitignore` + `apps/client/src-tauri/gen/android/keystore.properties`, `*.p12`, `apps/client/dist-native`; `.prettierignore` + `apps/client/src-tauri/target`, `apps/client/src-tauri/gen`, `CHANGELOG.md`; ESLint ignora `**/src-tauri/target/**`, `**/src-tauri/gen/**`.
- [ ] **Step 5:** Teste → PASS; `pnpm lint && pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 6:** `ci.yml`: novo job `tauri-check` (ubuntu-latest): `apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev`; `dtolnay/rust-toolchain@stable`; `swatinem/rust-cache@v2` (`workspaces: apps/client/src-tauri -> target`); pnpm/node como nos outros jobs; `TAURI_ENV_PLATFORM=windows pnpm --filter client build`; `node apps/client/scripts/check-native-bundle.mjs apps/client/dist`; `cargo check --manifest-path apps/client/src-tauri/Cargo.toml`.
- [ ] **Step 7:** `native-build.yml`, job `windows` (windows-latest): checkout, pnpm, node 22 com cache, Rust stable, rust-cache, `pnpm install --frozen-lockfile`, `tauri-apps/tauri-action@v1` com `projectPath: apps/client`, `tauriScript: pnpm tauri`, `releaseId: ${{ inputs.release-id }}`, `releaseBody: ${{ inputs.notes }}`, env `GITHUB_TOKEN` e `VITE_API_URL`. Smoke no mesmo job: iniciar `apps/client/src-tauri/target/release/nexo-check.exe` (confirmar o nome com `Get-ChildItem target/release/*.exe` na primeira execução), esperar 20 s, falhar se o processo não estiver vivo, salvar captura de tela (`System.Drawing` `CopyFromScreen`) em `windows-smoke.png`, encerrar o processo; rodar o instalador NSIS com `/S` e exigir exit code 0. `actions/upload-artifact@v4` com `src-tauri/target/release/bundle/**` e a captura.
- [ ] **Step 8:** `bootstrap-native.yml` com `task: cargo-lock`: Rust stable, `cargo generate-lockfile --manifest-path apps/client/src-tauri/Cargo.toml`, commit `chore(tauri): update cargo lockfile` só se houver diferença, push em `main`.
- [ ] **Step 9:** Commit `feat(tauri): windows shell and native build workflow`; o controlador faz o push. O push dispara `ci.yml` e `native-build.yml`.
- [ ] **Step 10:** `monitor-ci`: `ci` (incluindo `tauri-check`) e `native-build / windows` verdes. `conferidor-visual` olha `windows-smoke.png` (tela Hoje ou onboarding renderizada, sem página em branco).
- [ ] **Step 11:** Disparar `bootstrap-native.yml` com `task=cargo-lock` (snippet das Global Constraints), esperar o commit do bot e `git pull --ff-only`.

---

### Task 3: Lembretes nativos (Windows e Android)

**Files:**
- Create: `apps/client/src/platform/notifications-tauri.ts`, `apps/client/test/platform/notifications-tauri.test.ts`
- Modify: `apps/client/src/platform/notifications.ts`, `apps/client/src/features/settings/RemindersSection.tsx`, `apps/client/src/i18n/pt-BR.json` (`reminders.*`), `apps/client/test/platform/notifications.test.ts`, `apps/client/test/features/settings.test.tsx` (se usar `permissionState`), `apps/client/src-tauri/{Cargo.toml,src/lib.rs,capabilities/default.json}`, `apps/client/package.json`

**Interfaces:**
- Consumes: `PLATFORM`, `Platform` (Task 1); `ReminderSettings`, `DEFAULT_REMINDERS` (`src/db`)
- Produces:
  - `type ReminderKind = 'movement' | 'activeBreak' | 'water' | 'bedtime'` (exportado; substitui o `Kind` local)
  - `type PermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported'`
  - `interface NotificationAdapter { persistent: boolean; requestPermission(): Promise<boolean>; getPermission(): Promise<PermissionStatus>; schedule(rules: ReminderSettings): Promise<void>; cancelAll(): Promise<void> }`
  - `createTimerNotifications(deps: { show(title: string, body: string): void; getPermission(): Promise<PermissionStatus>; requestPermission(): Promise<boolean> }): NotificationAdapter` (o agendamento por timers atual, com `persistent: false`)
  - `webNotifications`, `desktopNotifications` (timers + `sendNotification` do plugin), `androidNotifications` (`persistent: true`)
  - `REMINDER_ID_BASE = { movement: 1000, activeBreak: 2000, water: 3000, bedtime: 4000 }`
  - `interface ReminderSlot { id: number; kind: ReminderKind; hour: number; minute: number }`; `reminderSlots(rules: ReminderSettings): ReminderSlot[]`
  - `getNotificationAdapter(platform: Platform = PLATFORM): NotificationAdapter`

Por que dois caminhos: o código do plugin no desktop ignora `schedule` (`plugins/notification/src/desktop.rs`: "the scheduling and grouping options are ignored"), então no Windows os timers do app disparam a notificação nativa enquanto o app está aberto (pode estar minimizado). No Android, `Schedule.interval({ hour, minute }, true)` reagenda sozinho todo dia, recai em alarme inexato sem `SCHEDULE_EXACT_ALARM` e é restaurado no boot pelo próprio plugin.

- [ ] **Step 1:** `@tauri-apps/plugin-notification@^2` no client; `tauri-plugin-notification = "2"` no `Cargo.toml`, registrado em `lib.rs`; `notification:default` em `capabilities/default.json`.
- [ ] **Step 2: Testes que falham** (`vi.mock('@tauri-apps/plugin-notification')`):
  - `reminderSlots`: só `movement` 08:00 ligado → `[{ id: 1000, kind: 'movement', hour: 8, minute: 0 }]`; `water` a cada 120 min de 08:00 a 12:00 → ids 3000, 3001, 3002 em 08:00, 10:00, 12:00; `everyMinutes: 10` é limitado a 30; horário inválido (`'25:00'`) ou desligado → nenhum slot.
  - `androidNotifications.schedule`: com permissão concedida, cancela os ids pendentes dentro das faixas de `REMINDER_ID_BASE` (via `pending()` + `cancel(ids)`) e chama `sendNotification` uma vez por slot com `id`, título/corpo de `reminders.notifications.*` e `schedule` igual a `Schedule.interval({ hour, minute }, true)`; chamar duas vezes com as mesmas regras não duplica (o segundo `schedule` cancela os ids do primeiro); sem permissão não chama `sendNotification`. (Review Focus 4.)
  - `desktopNotifications`: com fake timers e `movement` 08:00 às 07:00, avançar 1 h chama `sendNotification({ title, body })` uma vez e rearma para o dia seguinte.
  - `useReminderScheduling`: desmontar com o adaptador `persistent: true` não chama `cancelAll`; com `persistent: false` chama. (Review Focus 4.)
  - Os testes existentes de `webNotifications` continuam passando com a nova interface (ajustar só as chamadas de permissão).
- [ ] **Step 3:** `pnpm --filter client test platform` → FAIL.
- [ ] **Step 4:** Implementar. O canal Android `reminders` é criado (`createChannel`, importância padrão) antes do primeiro agendamento. Em `RemindersSection`, a permissão vem de `getNotificationAdapter().getPermission()` (estado assíncrono). Texto da limitação por plataforma: `reminders.limitation` (web, já existe), `reminders.limitationDesktop` = "No Windows, os lembretes aparecem enquanto o app estiver aberto, mesmo minimizado.", `reminders.limitationAndroid` = "Os lembretes podem atrasar alguns minutos por causa da economia de bateria."; bloqueio nativo: `reminders.deniedNative` = "As notificações do NEXO Check estão bloqueadas. Libere nas configurações do sistema."
- [ ] **Step 5:** Testes → PASS; `pnpm lint && pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 6:** Commit `feat(client): native reminders via tauri notification plugin`; push; `monitor-ci`: `ci` e `native-build / windows` verdes; disparar `bootstrap-native.yml` `cargo-lock` e `git pull --ff-only`.

---

### Checkpoint U1 (usuário): chave do updater e secrets do Windows

> **Depende do usuário.** Ninguém digita a senha por ele. Pode ser feito logo depois da Task 2 (o CLI do Tauri já está instalado). Recomendado fazer U2 na mesma hora.

- [ ] **U1.1** — Gerar a chave (o comando pede a senha; o usuário escolhe e guarda):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\nexo-check-chaves" | Out-Null
pnpm --filter client exec tauri signer generate -w "$env:USERPROFILE\nexo-check-chaves\updater.key"
```

- [ ] **U1.2** — Cadastrar os secrets em <https://github.com/JoaoGabrielOT/nexo-check/settings/secrets/actions> ("New repository secret"):
  - `TAURI_SIGNING_PRIVATE_KEY`: copiar com `Get-Content -Raw "$env:USERPROFILE\nexo-check-chaves\updater.key" | Set-Clipboard` e colar.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: a senha escolhida em U1.1, digitada pelo usuário.
  - Alternativa com GitHub CLI (não instalado hoje: `winget install --id GitHub.cli`, depois `gh auth login`):
    `Get-Content -Raw "$env:USERPROFILE\nexo-check-chaves\updater.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY -R JoaoGabrielOT/nexo-check` e `gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R JoaoGabrielOT/nexo-check` (pede o valor sem mostrar).
- [ ] **U1.3** — Guardar a pasta `nexo-check-chaves` num backup privado. Perder a chave impede atualizar o app Windows já instalado.
- [ ] **U1.4 (controlador)** — Conferir na página de secrets que os dois nomes existem; ler o conteúdo **público** de `updater.key.pub` para a Task 4.

---

### Task 4: Atualização automática no Windows

**Files:**
- Create: `apps/client/src/platform/updater/{types.ts,store.ts,desktop.ts}`, `apps/client/src/features/update/{UpdateDialog.tsx,useUpdateChecks.ts,index.ts}`, `apps/client/src-tauri/capabilities/desktop.json` (`platforms: ["windows","linux","macOS"]`), `apps/client/test/platform/updater-store.test.ts`, `apps/client/test/features/update-dialog.test.tsx`
- Modify: `packages/shared/src/constants.ts`, `packages/shared/test/constants.test.ts`, `apps/client/src/app/layout.tsx:110,239`, `apps/client/src/features/settings/AboutSection.tsx`, `apps/client/test/features/settings.test.tsx`, `apps/client/src/i18n/pt-BR.json` (`update.*`), `apps/client/src-tauri/{Cargo.toml,src/lib.rs,tauri.conf.json}`, `.github/workflows/native-build.yml`, `apps/client/test/native-config.test.ts`, `apps/client/package.json`

**Interfaces:**
- Consumes: `PLATFORM` (Task 1), `MarkdownView` (`src/components`), `Dialog*` de `@nexo/ui`
- Produces:
  - `packages/shared`: `UPDATE_CHECK_INTERVAL_MS = 21_600_000`
  - `interface UpdateInfo { version: string; notes: string }`; `interface InstallProgress { downloaded: number; total: number | null }`; `type InstallOutcome = 'restarting' | 'installing' | 'needs_permission'`
  - `interface UpdaterAdapter { check(): Promise<UpdateInfo | null>; install(onProgress: (p: InstallProgress) => void): Promise<InstallOutcome> }`
  - `createDesktopUpdater(): UpdaterAdapter` (`check()` de `@tauri-apps/plugin-updater`; `install` = `downloadAndInstall` com eventos `Started`/`Progress`/`Finished` → `relaunch()` de `@tauri-apps/plugin-process` → `'restarting'`)
  - `type UpdaterState = { status: 'idle' } | { status: 'available'; info: UpdateInfo } | { status: 'downloading'; info: UpdateInfo; progress: InstallProgress } | { status: 'needs_permission'; info: UpdateInfo } | { status: 'error'; info: UpdateInfo }`
  - `getUpdaterAdapter(platform?: Platform): UpdaterAdapter | null` (web → null; desktop → `createDesktopUpdater()`; android → entra na Task 7)
  - `setUpdaterAdapterForTests(a: UpdaterAdapter | null | undefined): void` (`undefined` restaura o padrão)
  - `checkForUpdates(opts: { manual: boolean }): Promise<'available' | 'none' | 'error' | 'unsupported' | 'busy'>`; `installUpdate(): Promise<void>`; `dismissUpdate(): void`; `useUpdaterState(): UpdaterState` (`useSyncExternalStore`)
  - `useUpdateChecks(): void` (verifica ao montar e a cada `UPDATE_CHECK_INTERVAL_MS`, só se houver adaptador); `<UpdateDialog />`

- [ ] **Step 1:** Client: `@tauri-apps/plugin-updater@^2`, `@tauri-apps/plugin-process@^2`. Rust: `tauri-plugin-updater = "2"` e `tauri-plugin-process = "2"`; o updater registrado só sob `#[cfg(desktop)]` com `tauri_plugin_updater::Builder::new().build()`. `capabilities/desktop.json`: `updater:default`, `process:allow-restart`. `tauri.conf.json`: `bundle.createUpdaterArtifacts: true`, `plugins.updater.pubkey` = conteúdo de `updater.key.pub` (U1), `plugins.updater.endpoints` e `plugins.updater.windows.installMode` conforme as Global Constraints.
- [ ] **Step 2: Testes que falham:**
  - `constants.test.ts`: `UPDATE_CHECK_INTERVAL_MS === 21_600_000`.
  - `native-config.test.ts`: `plugins.updater.endpoints` igual a `['https://github.com/JoaoGabrielOT/nexo-check/releases/latest/download/latest.json']`; `pubkey` não vazio; `installMode === 'passive'`.
  - `updater-store.test.ts` (adaptador falso): sem adaptador → `'unsupported'`; `check` → `null` → `'none'` e estado `idle`; `check` → `{ version: '0.2.0', notes: '- x' }` → `'available'` e estado `available`; `check` rejeitando (offline, 403) com `manual: false` → `'error'` e estado continua `idle` (Review Focus 5); `installUpdate` passa por `downloading` com o progresso repassado e, com `'needs_permission'`, vai para `needs_permission`; com `'installing'` (Android entregou ao instalador do sistema) ou `'restarting'` volta para `idle`; `install` rejeitando → `error`; `checkForUpdates` durante `downloading` → `'busy'` sem chamar `check`; `dismissUpdate` → `idle`.
  - `update-dialog.test.tsx`: estado `available` mostra "Nova versão 0.2.0", as notas renderizadas como Markdown e os botões "Atualizar agora" e "Depois"; "Depois" fecha; `downloading` com `{ downloaded: 50, total: 100 }` mostra 50% num `role="progressbar"` com `aria-valuenow=50`; `needs_permission` mostra o texto de permissão e o botão continua disponível.
  - `useUpdateChecks` (fake timers): chama `check` ao montar e de novo após 6 h; desmontar limpa o intervalo.
  - `settings.test.tsx`: com adaptador cujo `check` devolve `null`, "Verificar atualizações" mostra o toast `update.upToDate`; com `check` rejeitando, `errors.generic`; sem adaptador (web) continua no caminho do service worker atual.
- [ ] **Step 3:** `pnpm test` → FAIL.
- [ ] **Step 4:** Implementar. No `layout.tsx`: `useUpdateChecks()` e `{isNative() ? <UpdateDialog /> : <PwaUpdateToast />}`. Textos `update.*`: `title` "Nova versão {{version}}", `notes` "O que mudou", `now` "Atualizar agora", `later` "Depois", `downloading` "Baixando… {{percent}}%", `needsPermission` "Permita que o NEXO Check instale apps desta fonte e toque em \"Atualizar agora\" de novo.", `error` "Não foi possível atualizar agora. Tente de novo mais tarde.", `upToDate` "Você já está na versão mais recente.".
- [ ] **Step 5:** `native-build.yml`, job `windows`: env `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` dos secrets; `updaterJsonPreferNsis: true`; o artefato inclui os `.sig`.
- [ ] **Step 6:** Testes → PASS; `pnpm lint && pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 7:** Commit `feat(client): windows auto-update dialog`; push; `monitor-ci`: `native-build / windows` verde e o artefato contém `*-setup.exe`, `*-setup.exe.sig`, `*.msi`, `*.msi.sig`. Disparar `cargo-lock` e `git pull --ff-only`.

---

### Task 5: Bootstrap do Android (`gen/android`) e build no CI

**Files:**
- Modify: `.github/workflows/bootstrap-native.yml` (opção `android-init`), `.github/workflows/native-build.yml` (jobs `android` e `android-smoke`)
- Generated by CI: `apps/client/src-tauri/gen/android/**`, ícones Android

**Interfaces:**
- Consumes: `src-tauri` da Task 2 (lib `nexo_check_lib` com `mobile_entry_point`)
- Produces: projeto Gradle commitado em `apps/client/src-tauri/gen/android`; artefato `android-apk` (`nexo-check-<versão>.apk`) e `android-smoke.png`; nome do projeto Gradle do app registrado no ledger (saída de `./gradlew projects`).

- [ ] **Step 1:** `bootstrap-native.yml`, `task: android-init`: `actions/setup-java@v4` (temurin 17), `android-actions/setup-android@v3`, `sdkmanager "ndk;27.2.12479018"`, `NDK_HOME=$ANDROID_HOME/ndk/27.2.12479018` no `$GITHUB_ENV`, Rust stable com targets `aarch64-linux-android,armv7-linux-androideabi,x86_64-linux-android`, `pnpm install --frozen-lockfile`, `pnpm --filter client tauri android init --ci`, `pnpm --filter client tauri icon public/icons/icon.svg` (mesma fonte da Task 2), `cargo generate-lockfile`, `(cd apps/client/src-tauri/gen/android && ./gradlew projects)` no log, commit `chore(android): bootstrap gen/android project` e push.
- [ ] **Step 2:** Commit `ci: add android bootstrap task`; push; disparar `bootstrap-native.yml` com `task=android-init`; `monitor-ci` verde; `git pull --ff-only`; conferir que `gen/android/.gitignore` exclui `build/`, `.gradle/` e `local.properties`, e que nenhum `keystore.properties` foi commitado.
- [ ] **Step 3:** `native-build.yml`, job `android` (ubuntu-latest): mesmo setup do Step 1 + `swatinem/rust-cache@v2`; `pnpm --filter client tauri android build --apk --target aarch64 --target armv7 --target x86_64` com `VITE_API_URL`; localizar o APK em `apps/client/src-tauri/gen/android/app/build/outputs/apk/universal/release/`; se ele não estiver assinado (ainda sem keystore), assiná-lo com uma chave descartável gerada no job (`keytool` + `apksigner` do `build-tools`) só para o smoke, com sufixo `-smoke`; renomear para `nexo-check-<versão do package.json raiz>.apk`; `upload-artifact` `android-apk`.
- [ ] **Step 4:** Job `android-smoke` (`needs: android`): habilitar KVM (regra udev `KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"` + `udevadm trigger --name-match=kvm`), baixar o artefato, `reactivecircus/android-emulator-runner@v2` (`api-level: 34`, `arch: x86_64`, `target: google_apis`) com o script: `adb install -r <apk>`; `adb shell monkey -p io.github.joaogabrielot.nexocheck -c android.intent.category.LAUNCHER 1`; `sleep 25`; `adb shell pidof io.github.joaogabrielot.nexocheck` (falha se vazio); `adb exec-out screencap -p > android-smoke.png`; upload da captura.
- [ ] **Step 5:** Commit `ci: android build and emulator smoke test`; push; `monitor-ci`: `android` e `android-smoke` verdes; `conferidor-visual` em `android-smoke.png` (conteúdo visível, sem tela branca, nada escondido sob a barra de status).

---

### Task 6: Plugin `tauri-plugin-apk-updater` (Rust + Kotlin)

**Files:**
- Create: tudo em `packages/tauri-plugin-apk-updater/` listado na estrutura
- Modify: `apps/client/src-tauri/{Cargo.toml,src/lib.rs}`, `apps/client/src-tauri/capabilities/mobile.json` (novo), `apps/client/package.json`, `.github/workflows/native-build.yml`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  - Crate `tauri-plugin-apk-updater` (plugin `apk-updater`); `build.rs`: `const COMMANDS: &[&str] = &["download_and_install", "registerListener"]` com `.android_path("android")`; `permissions/default.toml`: `allow-download-and-install`, `allow-register-listener` (conferir os nomes gerados em `permissions/autogenerated`).
  - Rust: `init<R: Runtime>() -> TauriPlugin<R>`; comando `download_and_install(payload: DownloadRequest) -> Result<DownloadResult>`; `DownloadRequest { url: String, expected_size: u64 }` (serde `camelCase`); `DownloadResult { status: InstallStatus }`, `enum InstallStatus { Installing, NeedsPermission }` (serde `snake_case`); `mobile.rs`: `register_android_plugin("io.github.joaogabrielot.apkupdater", "ApkUpdaterPlugin")` e `run_mobile_plugin("downloadAndInstall", payload)`; `desktop.rs`: `Err(Error::Unsupported)`.
  - Kotlin: `ApkUpdaterPlugin(activity): Plugin` com `@Command fun downloadAndInstall(invoke: Invoke)`; evento `trigger("progress", { downloaded: Long, total: Long })`; `object ApkFiles { fun isComplete(actual: Long, expected: Long): Boolean; fun canReuse(file: File, expected: Long): Boolean }`.
  - JS `@nexo/tauri-plugin-apk-updater` (`exports: "./guest-js/index.ts"`, como o `@nexo/shared`): `type InstallStatus = 'installing' | 'needs_permission'`; `downloadAndInstall(req: { url: string; expectedSize: number }, onProgress?: (p: { downloaded: number; total: number }) => void): Promise<InstallStatus>` (usa `invoke('plugin:apk-updater|download_and_install', { payload })` e `addPluginListener('apk-updater', 'progress', …)`, removendo o listener no fim).

Comportamento do Kotlin (spec §10): baixa em thread de fundo para `cacheDir/updates/nexo-check-update.apk` (reaproveita se `canReuse`), com `HttpURLConnection` seguindo redirecionamentos e timeouts de 30 s, emitindo `progress` no máximo a cada 250 ms; se `!isComplete`, apaga e rejeita com `size_mismatch`; se `!packageManager.canRequestPackageInstalls()`, abre `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` com `package:<pacote>` e resolve `needs_permission`; senão abre `ACTION_VIEW` com URI do `FileProvider` (autoridade `${applicationId}.apkupdater.fileprovider`), tipo `application/vnd.android.package-archive`, `FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK`, e resolve `installing`. Manifesto do plugin: `REQUEST_INSTALL_PACKAGES`, `INTERNET` e o `<provider>` com `res/xml/apk_updater_paths.xml` = `<cache-path name="updates" path="updates/" />`.

- [ ] **Step 1:** Gerar o esqueleto com o CLI (sem Rust): conferir as flags com `pnpm --filter client exec tauri plugin new --help` e criar em `packages/tauri-plugin-apk-updater` com Android, sem iOS e sem exemplo; trocar o `guest-js` com rollup pelo TS consumido como fonte; remover o que for de iOS.
- [ ] **Step 2: Teste que falha (JUnit)** — `ApkFilesTest.kt`: `isComplete(100, 100)` true; `isComplete(99, 100)` false; `isComplete(0, 0)` false (tamanho esperado precisa ser > 0); `canReuse` com arquivo temporário de 100 bytes e esperado 100 → true, esperado 101 → false, arquivo inexistente → false.
- [ ] **Step 2b: RED no CI, sem quebrar a `main`:** com `ApkFiles` em stub (corpos `TODO()`) e o passo de JUnit do Step 4 já no `native-build.yml`, criar o branch temporário `tdd/apk-files`, fazer push e disparar `native-build.yml` com `ref: tdd/apk-files` → o job `android` falha no `ApkFilesTest`. Registrar no ledger e apagar o branch remoto depois.
- [ ] **Step 3:** Implementar Rust, Kotlin, manifesto e guest-js conforme **Interfaces**. No app: dependência `tauri-plugin-apk-updater = { path = "../../../packages/tauri-plugin-apk-updater" }`, `.plugin(tauri_plugin_apk_updater::init())` em `lib.rs`; `capabilities/mobile.json` (`platforms: ["android"]`, `apk-updater:default`); `@nexo/tauri-plugin-apk-updater: workspace:*` no client.
- [ ] **Step 4:** `ci.yml`, job `tauri-check`: `cargo check --manifest-path packages/tauri-plugin-apk-updater/Cargo.toml`. `native-build.yml`, job `android`, após o build: `./gradlew :tauri-plugin-apk-updater:testReleaseUnitTest` em `gen/android` (o nome do projeto vem da saída de `./gradlew projects` registrada na Task 5; ajustar se for outro).
- [ ] **Step 5:** `pnpm lint && pnpm typecheck && pnpm test` → PASS localmente.
- [ ] **Step 6:** Commit `feat(android): apk updater plugin`; push; disparar `cargo-lock`; `monitor-ci`: `tauri-check`, `android` (com o JUnit passando) e `android-smoke` verdes; `git pull --ff-only`.

---

### Task 7: Fluxo de atualização do Android no client

**Files:**
- Create: `apps/client/src/platform/updater/{github.ts,android.ts}`, `apps/client/test/platform/{updater-github,updater-android}.test.ts`
- Modify: `apps/client/src/platform/updater/store.ts` (`getUpdaterAdapter` para `android`), `apps/client/src/config.ts`

**Interfaces:**
- Consumes: `UpdaterAdapter`, `UpdateInfo`, `InstallOutcome` (Task 4); `downloadAndInstall` do guest-js (Task 6); `compareSemver` de `@nexo/shared`; `APP_VERSION`
- Produces:
  - `config.ts`: `RELEASES_LATEST_API = 'https://api.github.com/repos/JoaoGabrielOT/nexo-check/releases/latest'`, `RELEASE_DOWNLOAD_PREFIX = 'https://github.com/JoaoGabrielOT/nexo-check/releases/download/'`
  - `githubReleaseSchema` (Zod: `tag_name`, `body` nullable/opcional, `draft`/`prerelease` opcionais, `assets[]` com `name`, `size` inteiro ≥ 0, `browser_download_url`)
  - `interface ApkAsset { name: string; size: number; url: string }`
  - `pickApkAsset(assets: { name: string; size: number; browser_download_url: string }[], version: string): ApkAsset | null`
  - `evaluateRelease(json: unknown, currentVersion: string): { info: UpdateInfo; asset: ApkAsset } | null`
  - `createAndroidUpdater(deps: { fetchFn: typeof fetch; currentVersion: string; installer: (req: { url: string; expectedSize: number }, onProgress: (p: { downloaded: number; total: number }) => void) => Promise<'installing' | 'needs_permission'> }): UpdaterAdapter`

- [ ] **Step 1: Testes que falham:**
  - `pickApkAsset`: prefere `nexo-check-0.2.0.apk` a outro `.apk`; aceita `.APK`; ignora `.exe`, `.sig`, `latest.json`; ignora `size: 0`; ignora URL fora de `RELEASE_DOWNLOAD_PREFIX` (ex.: `https://evil.example/nexo-check-0.2.0.apk`); nenhum válido → `null`.
  - `evaluateRelease`: `tag_name: 'v0.2.0'` com versão atual `0.1.0` → `info.version === '0.2.0'` e `info.notes` = `body`; `body: null` → `notes: ''`; tag igual (`v0.1.0`) ou menor → `null`; `draft: true` ou `prerelease: true` → `null`; JSON inválido (sem `assets`) → `null`; release nova sem `.apk` → `null` (Review Focus 5).
  - `createAndroidUpdater.check`: `fetchFn` chamado com `RELEASES_LATEST_API` e header `Accept: application/vnd.github+json`; resposta 403 ou 500 → rejeita (o store trata como erro silencioso); fetch rejeitando (offline) → rejeita.
  - `createAndroidUpdater.install`: depois de um `check` com update, chama `installer({ url, expectedSize: asset.size }, …)`, converte o progresso para `InstallProgress` e devolve `'installing'` ou `'needs_permission'` como `InstallOutcome`; `install` sem `check` anterior rejeita.
- [ ] **Step 2:** `pnpm --filter client test updater` → FAIL.
- [ ] **Step 3:** Implementar; `fetchLatestRelease` com `AbortSignal.timeout(15_000)`. Em `getUpdaterAdapter('android')`: `createAndroidUpdater({ fetchFn: fetch, currentVersion: APP_VERSION, installer: downloadAndInstall })`. Confirmar que a CSP da Task 2 já permite `https://api.github.com`.
- [ ] **Step 4:** Testes → PASS; `pnpm lint && pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat(client): android update check via github releases`; push; disparar `native-build.yml` por `workflow_dispatch` (a mudança é só em TS) e conferir `android` + `android-smoke` verdes.

---

### Checkpoint U2 (usuário): keystore do Android e secrets

> **Depende do usuário.** Ele escolhe e guarda a senha. Com PKCS12, a senha da chave é a mesma da keystore.

- [ ] **U2.1** — Gerar a keystore (o `keytool` do JDK 25 local já está no PATH; o comando pede a senha):

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore "$env:USERPROFILE\nexo-check-chaves\nexo-check.keystore" `
  -alias nexo-check -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=NEXO Check, O=NEXO Consultoria, C=BR"
```

- [ ] **U2.2** — Cadastrar em <https://github.com/JoaoGabrielOT/nexo-check/settings/secrets/actions>:
  - `ANDROID_KEYSTORE_BASE64`: copiar com `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\nexo-check-chaves\nexo-check.keystore")) | Set-Clipboard` e colar.
  - `ANDROID_KEYSTORE_PASSWORD`: a senha de U2.1.
  - `ANDROID_KEY_ALIAS`: `nexo-check`.
  - `ANDROID_KEY_PASSWORD`: a mesma senha de U2.1.
  - Com GitHub CLI: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\nexo-check-chaves\nexo-check.keystore")) | gh secret set ANDROID_KEYSTORE_BASE64 -R JoaoGabrielOT/nexo-check`; `gh secret set ANDROID_KEY_ALIAS -R JoaoGabrielOT/nexo-check -b nexo-check`; `gh secret set ANDROID_KEYSTORE_PASSWORD -R JoaoGabrielOT/nexo-check` e `gh secret set ANDROID_KEY_PASSWORD -R JoaoGabrielOT/nexo-check` (pedem o valor sem mostrar).
- [ ] **U2.3** — Incluir `nexo-check.keystore` no mesmo backup de U1.3. Perder a keystore impede atualizar o app Android já instalado.
- [ ] **U2.4 (controlador)** — Conferir os quatro nomes na página de secrets.

---

### Task 8: Assinatura do APK de release

**Files:**
- Modify: `apps/client/src-tauri/gen/android/app/build.gradle.kts`, `.github/workflows/native-build.yml` (job `android`)
- Create: `apps/client/src-tauri/android-signing.sha256`

**Interfaces:**
- Consumes: secrets de U2; job `android` (Task 5)
- Produces: APK `nexo-check-<versão>.apk` assinado com a keystore do projeto; `android-signing.sha256` com o SHA-256 do certificado (hex maiúsculo, sem dois-pontos, uma linha), que é informação pública.

- [ ] **Step 1:** `build.gradle.kts` (conforme <https://v2.tauri.app/distribute/sign/android/>): `signingConfigs.create("release")` carrega `rootProject.file("keystore.properties")` **só se existir** (`storeFile`, `password`, `keyAlias`, `keyPassword`), e `buildTypes.release` só usa esse `signingConfig` quando o arquivo existe. Assim o build sem secrets continua funcionando para o smoke.
- [ ] **Step 2:** Job `android`, antes do build: se `ANDROID_KEYSTORE_BASE64` existir, decodificar para `$RUNNER_TEMP/nexo-check.keystore` e escrever `gen/android/keystore.properties` com `storeFile`, `password`, `keyAlias`, `keyPassword` (`printf`, nunca `echo` dos valores no log); se não existir e `inputs.tag` não estiver vazio, `::error::` e exit 1 (Review Focus 2). Depois do build: `apksigner verify --print-certs` no APK; se `android-signing.sha256` existir, o SHA-256 do certificado tem de ser igual ao arquivo (senão exit 1); se não existir, `::warning::` com o valor; com `inputs.tag` não vazio, o arquivo é obrigatório. A assinatura descartável da Task 5 só acontece quando não há keystore e não há tag.
- [ ] **Step 3:** Commit `build(android): release signing with project keystore`; push (dispara `native-build`); `monitor-ci`: `android` verde, sem o sufixo `-smoke`, e o aviso com o SHA-256 no log.
- [ ] **Step 4:** Gravar esse SHA-256 em `apps/client/src-tauri/android-signing.sha256`; commit `build(android): pin release signing certificate`; push; `monitor-ci`: `android` verde comparando o certificado e `android-smoke` verde.

---

### Task 9: Versão única (`versionCode` e `sync-version`)

**Files:**
- Create: `scripts/vitest.config.mjs`, `scripts/lib/{version.mjs,sync-version.mjs}`, `scripts/sync-version.mjs`, `scripts/test/{version,sync-version}.test.mjs`
- Modify: `package.json` (raiz), `eslint.config.mjs` (globals de Node para `scripts/**/*.mjs`; adicionar `globals` às devDependencies se faltar)

**Interfaces:**
- Produces:
  - `versionCode(version: string): number` (fórmula das Global Constraints; lança se a versão não for `X.Y.Z`, ou se `minor` ou `patch` > 99)
  - `androidVersionCode(version: string): number` = `Math.max(1, versionCode(version))`
  - `bumpVersion(version: string, kind: 'patch' | 'minor' | 'major'): string` (lança se o resultado tiver `minor`/`patch` > 99)
  - `syncVersionInFiles(files: Record<string, string>, version: string): Record<string, string>`: recebe caminho → conteúdo e devolve só os que mudaram. Troca o texto preservando a formatação: `"version"` de topo em todo `package.json` de workspace e no `tauri.conf.json`; `"versionCode": N` no `tauri.conf.json`; `version = "…"` dentro de `[package]` no `Cargo.toml`; o `version` do bloco `[[package]] name = "nexo-check"` no `Cargo.lock` (ausente → ignora)
  - CLI `node scripts/sync-version.mjs`: lê a versão do `package.json` raiz, os arquivos de `apps/*/package.json`, `packages/*/package.json`, `apps/client/src-tauri/{tauri.conf.json,Cargo.toml,Cargo.lock}`, grava os que mudaram e lista os caminhos
  - Scripts raiz: `"version:sync": "node scripts/sync-version.mjs"`, `"test:scripts": "vitest run --config scripts/vitest.config.mjs"`, e `test` passa a ser `turbo run test && pnpm test:scripts`

- [ ] **Step 1: Testes que falham:**
  - `versionCode('0.1.0')` → 100; `('1.2.3')` → 10203; `('v2.0.1')` → 20001; `('0.1.100')` lança; `('0.100.0')` lança; `('abc')` lança; `androidVersionCode('0.0.0')` → 1.
  - `bumpVersion('0.0.0','minor')` → `'0.1.0'`; `('0.1.9','patch')` → `'0.1.10'`; `('0.9.3','minor')` → `'0.10.0'`; `('1.4.2','major')` → `'2.0.0'`; `('0.1.99','patch')` lança.
  - `syncVersionInFiles` com fixtures (strings no teste) para `0.2.0`: no `package.json` muda só o `version` de topo (uma dependência `"version"` aninhada, se houver, não muda) e o resto do texto fica idêntico; no `tauri.conf.json` `version` vira `0.2.0` e `versionCode` vira 200; no `Cargo.toml` muda só `[package].version` (a linha `tauri = { version = "2" … }` não muda); no `Cargo.lock` muda só o bloco `name = "nexo-check"`; arquivo já na versão não aparece no resultado; todo JSON devolvido continua válido para `JSON.parse`.
- [ ] **Step 2:** `pnpm test:scripts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test:scripts` → PASS; `pnpm version:sync` com a raiz em `0.0.0` → nenhum arquivo muda (ou só o `versionCode` vira 1); `pnpm lint && pnpm test` → PASS.
- [ ] **Step 5:** Commit `build: single version source with sync-version`.

---

### Task 10: `release.yml` e verificação da release

**Files:**
- Create: `.github/workflows/release.yml`, `scripts/lib/{changelog.mjs,minisign.mjs}`, `scripts/{changelog-section.mjs,verify-updater.mjs}`, `scripts/test/{changelog,minisign}.test.mjs`
- Modify: `.github/workflows/native-build.yml` (upload do APK na release quando `inputs.tag` não for vazio)

**Interfaces:**
- Consumes: `native-build.yml` (inputs `release-id`, `tag`, `notes`); `tauri.conf.json` `plugins.updater.pubkey`
- Produces:
  - `changelogSection(markdown: string, version: string): string`: corpo entre `## [<versão>]` (com ou sem `v`, com ou sem data) e o próximo `## `, sem o título; lança se a versão não existir
  - `verifyMinisign(data: Buffer, signatureB64: string, publicKeyB64: string): boolean`: o `.sig` do Tauri e o `pubkey` são base64 de arquivos de texto do minisign
  - CLI `node scripts/verify-updater.mjs <pasta-com-assets> <tag>`: lê `latest.json`; exige `version` = tag sem `v`; para `platforms["windows-x86_64"]`, exige `url` começando por `https://github.com/JoaoGabrielOT/nexo-check/releases/download/<tag>/`, o arquivo correspondente na pasta e `verifyMinisign(arquivo, signature, pubkey do tauri.conf)` verdadeiro; exit 1 com mensagem em qualquer falha

Algoritmo do minisign (o que a assinatura não determina): chave pública = base64(`"Ed"` + key id de 8 bytes + chave Ed25519 de 32 bytes), na 2ª linha do arquivo. Assinatura: 2ª linha = base64(alg de 2 bytes + key id de 8 + assinatura de 64); 3ª linha `trusted comment: <texto>`; 4ª linha = base64(assinatura global de 64). Alg `Ed` assina o arquivo; alg `ED` assina o BLAKE2b-512 do arquivo (`createHash('blake2b512')`). A assinatura global cobre `assinatura(64) ‖ texto do trusted comment`. Os key ids precisam coincidir. Verificar com `crypto.verify(null, msg, chavePublica, sig)`, montando a chave por SPKI DER (`302a300506032b6570032100` + 32 bytes).

- [ ] **Step 1: Testes que falham:**
  - `changelogSection`: com um CHANGELOG de duas versões no formato do git-cliff (`## [0.2.0] - 2026-12-01`, `### Funcionalidades`, itens), `('0.2.0')` devolve só os itens da 0.2.0; `('v0.2.0')` idem; versão ausente lança.
  - `verifyMinisign`: o teste gera um par Ed25519 com `generateKeyPairSync('ed25519')`, monta chave e assinatura no formato acima para `ED` e para `Ed` → `true`; um byte alterado no arquivo → `false`; trusted comment alterado → `false`; key id diferente → `false`. (Review Focus 1.)
- [ ] **Step 2:** `pnpm test:scripts` → FAIL. **Step 3:** Implementar. **Step 4:** `pnpm test:scripts` → PASS.
- [ ] **Step 5:** `release.yml`, `on: push: tags: ['v*.*.*']`, `permissions: contents: write`:
  - job `draft` (ubuntu): checkout; conferir que a tag é igual a `v` + `version` do `package.json` raiz (senão falha); `node scripts/changelog-section.mjs <tag> > notes.md`; `gh release create <tag> --draft --title "NEXO Check <tag>" --notes-file notes.md`; outputs `release-id` (de `gh release view <tag> --json databaseId`) e `notes`.
  - job `build`: `uses: ./.github/workflows/native-build.yml` com `release-id`, `tag`, `notes` e `secrets: inherit` (o job `windows` sobe `.exe`, `.msi`, `.sig` e `latest.json` pela `tauri-action`; o job `android` faz `gh release upload <tag> nexo-check-<versão>.apk`).
  - job `publish` (`needs: [draft, build]`): `gh release download <tag> -D assets`; `node scripts/verify-updater.mjs assets <tag>`; conferir que existe exatamente um `nexo-check-<versão>.apk`; `gh release edit <tag> --draft=false --latest`. Assim nenhum updater vê uma release incompleta ou com assinatura que não confere.
- [ ] **Step 6:** `pnpm lint && pnpm test` → PASS. Commit `ci: release workflow with updater signature check`; push; `monitor-ci`: `ci` verde (o `release.yml` só roda com tag; ele é exercitado na Task 12).

---

### Task 11: `pnpm release` e changelog

**Files:**
- Create: `cliff.toml`, `scripts/lib/release-plan.mjs`, `scripts/release.mjs`, `scripts/test/release-plan.test.mjs`
- Modify: `package.json` (raiz: devDependency `git-cliff`, script `"release": "node scripts/release.mjs"`)

**Interfaces:**
- Consumes: `bumpVersion` (Task 9), `syncVersionInFiles` via CLI (Task 9)
- Produces:
  - `planRelease(input: { current: string; kind: string; branch: string; dirty: boolean; behind: number }): { version: string; tag: string; commands: string[][] }`, que lança com mensagem em pt-BR se `kind` não for `patch|minor|major`, se `branch !== 'main'`, se `dirty` ou se `behind > 0`
  - `commands`, nesta ordem: `['node','scripts/sync-version.mjs']`, `['pnpm','exec','git-cliff','--tag',tag,'-o','CHANGELOG.md']`, `['git','add','package.json','apps','packages','CHANGELOG.md']`, `['git','commit','-m',`chore(release): ${tag}`]`, `['git','tag','-a',tag,'-m',tag]`, `['git','push','--follow-tags','origin','main']`
  - `release.mjs`: lê o estado (`git rev-parse --abbrev-ref HEAD`, `git status --porcelain`, `git fetch` + `git rev-list --count HEAD..origin/main`), grava a versão nova no `package.json` raiz, executa `commands` com `spawnSync` (sem shell, `stdio: 'inherit'`) e para no primeiro erro
  - `cliff.toml`: Conventional Commits; grupos `feat` → "Funcionalidades", `fix` → "Correções", `perf` → "Desempenho", `docs` → "Documentação"; ignora `chore(release)`, `ci`, `test`, `style`; cabeçalho de versão `## [{{ version | trim_start_matches(pat="v") }}] - {{ timestamp | date(format="%Y-%m-%d") }}` (o formato que `changelogSection` lê)

- [ ] **Step 1: Testes que falham:** `planRelease({ current: '0.0.0', kind: 'minor', branch: 'main', dirty: false, behind: 0 })` → `version: '0.1.0'`, `tag: 'v0.1.0'` e os `commands` exatamente na ordem acima; `kind: 'banana'` lança; `branch: 'feat/x'` lança; `dirty: true` lança; `behind: 2` lança; `current: '0.1.99'` com `patch` lança (vem de `bumpVersion`).
- [ ] **Step 2:** `pnpm test:scripts` → FAIL. **Step 3:** Implementar. **Step 4:** `pnpm test:scripts` → PASS.
- [ ] **Step 5:** Conferir o `cliff.toml` sem criar tag: `pnpm exec git-cliff --unreleased --tag v0.1.0` imprime as seções em pt-BR com o cabeçalho `## [0.1.0] - <data>`, e `changelogSection` dessa saída devolve o corpo (rodar num arquivo temporário do scratchpad; não commitar).
- [ ] **Step 6:** `pnpm lint && pnpm test` → PASS. Commit `build: pnpm release script and changelog config`.

---

### Task 12: README e release `v0.1.0`

**Files:**
- Modify: `README.md`; o `CHANGELOG.md` e os arquivos de versão são gerados pelo `pnpm release`

- [ ] **Step 1:** README: trocar "Fase B (planejada)" por:
  - Downloads: links para `releases/latest` (Windows `.exe`/`.msi`, Android `.apk`).
  - Windows: aviso do SmartScreen ("editor desconhecido": "Mais informações" → "Executar assim mesmo"); lembretes só com o app aberto; atualização automática.
  - Android: permitir "instalar apps desconhecidos" para o navegador/gerenciador de arquivos na primeira instalação e para o NEXO Check nas atualizações.
  - Comandos novos (`pnpm tauri`, `pnpm version:sync`, `pnpm release patch|minor|major`, `pnpm test:scripts`) e os workflows (`ci`, `native-build`, `bootstrap-native`, `release`).
  - Seção "Chaves e secrets": os seis nomes, para que serve cada um, os comandos de U1 e U2 e o aviso de backup (spec §11: "a lista final com os comandos vai para o README").
  - Na tabela de arquitetura, as linhas de `apps/client/src-tauri` e `packages/tauri-plugin-apk-updater`.
- [ ] **Step 2:** Commit `docs: native apps, release process and signing keys`; push; `monitor-ci`: `ci` verde.
- [ ] **Step 3:** Pré-condições: U1 e U2 concluídos; último `native-build` verde em `main`; `git status` limpo; `git pull --ff-only`.
- [ ] **Step 4:** `pnpm release minor` (0.0.0 → 0.1.0): cria `chore(release): v0.1.0` (passa pelo commitlint), a tag `v0.1.0` e faz o push.
- [ ] **Step 5:** `monitor-ci` acompanha `release.yml` até o fim: `draft`, `build / windows`, `build / android`, `build / android-smoke`, `publish` verdes.
- [ ] **Step 6:** Pela API pública (sem login): `GET /repos/JoaoGabrielOT/nexo-check/releases/latest` → `tag_name: "v0.1.0"`, `draft: false`, e assets com `*_0.1.0_x64-setup.exe`, `.exe.sig`, `*_0.1.0_x64_en-US.msi` (ou o nome que a tauri-action gerar), `.msi.sig`, `latest.json` e `nexo-check-0.1.0.apk`. `https://github.com/JoaoGabrielOT/nexo-check/releases/latest/download/latest.json` responde e tem `version: "0.1.0"`. Passar o JSON da API por `evaluateRelease(json, '0.0.9')` num teste temporário (ou num script no scratchpad) → encontra o APK.
- [ ] **Step 7:** `conferidor-visual` olha as capturas do smoke da release. Registrar no ledger: SHA da release, links dos assets e o SHA-256 do certificado Android.
- [ ] **Step 8:** Pendências para o fechamento (não bloqueiam a v0.1.0): a troca real de versão pelo updater (0.1.0 → 0.1.1) só pode ser vista numa segunda release, instalando a 0.1.0 num aparelho; o admin em produção continua sem teste do controlador (ledger da Fase A, Task 23).
