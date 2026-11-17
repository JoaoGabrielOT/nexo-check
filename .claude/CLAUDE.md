# Instruções do projeto

## Projeto
TODO: descreva o projeto aqui (o que é, stack, estrutura de pastas, comandos de teste, build e lint, convenções).

## Skills superpowers (obrigatório)
- Em toda sessão neste projeto, carregue `superpowers:using-superpowers` antes da primeira resposta ou ação, e siga a regra dela: invocar a skill aplicável antes de responder, explorar código ou perguntar.
- Fluxo padrão:
  - Funcionalidade nova ou mudança de comportamento: `superpowers:brainstorming` → `superpowers:writing-plans` → execução (`superpowers:subagent-driven-development` com os agentes de `.claude/agents`, ou `superpowers:executing-plans`).
  - Bug ou falha de teste: `superpowers:systematic-debugging` antes de propor correção.
  - Código novo ou correção: `superpowers:test-driven-development`.
  - Antes de dizer que terminou, fazer commit ou release: `superpowers:verification-before-completion`.
  - Depois de implementar e antes do commit: `superpowers:requesting-code-review` (agente `revisor`); ao receber revisão: `superpowers:receiving-code-review`.
  - Ao fechar o trabalho: `superpowers:finishing-a-development-branch`.

## Agentes (`.claude/agents`)
- `arquiteto`: planejamento de funcionalidades novas e mudanças que afetam dados, integrações ou várias plataformas ao mesmo tempo.
- `implementador`: execução de plano já definido e correções com causa conhecida.
- `revisor`: revisão do diff antes do commit.
- `explorador`: buscas rápidas no código.
- `terminal`: roda comandos (testes, lint, builds, git de leitura) e devolve só o resumo; não edita.
- `testador`: escreve os testes que falham antes da implementação (TDD); não mexe em código de produção.
- `depurador`: bug ou falha de teste com causa desconhecida; acha a causa raiz antes de corrigir.
- `monitor-ci`: acompanha o GitHub Actions e as releases pelas páginas e pela API públicas, sem login.
- `conferidor-visual`: confere imagens de teste de interface, capturas e screenshots contra um checklist; somente leitura.
- Agentes podem chamar outros agentes (até 3 níveis abaixo da conversa principal):
  - `implementador` → `terminal`, `testador`, `explorador`, `depurador`, `monitor-ci`
  - `depurador` → `terminal`, `explorador`, `testador`
  - `testador` → `terminal`, `explorador`
  - `arquiteto` → `explorador`, `terminal`
  - `revisor` → `terminal`, `conferidor-visual`, `monitor-ci` (nunca agentes que editam)
  - `terminal`, `explorador`, `monitor-ci` e `conferidor-visual` não chamam ninguém.
  - Quem implementa nunca chama `revisor`: a revisão vem de quem coordena, depois do relatório.

## TokenEconomizer (obrigatório)
- O plugin TokenEconomizer fica sempre ativo para a sessão principal e para todos os agentes (micro-skills, poda de ferramentas e loop guard ligados em `~/.tokeneconomizer/config.json`, escopo global). Não desativar nem contornar.
- Seguir os fatos que ele injeta no início da sessão e os redirecionamentos do loop guard.
- Consultar pelo terminal, sem custo de modelo, o comando `te --host claude status` do plugin (também `config`, `microskills`, `toolprune`), ou pelas skills `tokeneconomizer:*`.

## Contexto
- Ao iniciar, leia `CONTEXTO_SESSAO.md` (local, fora do git) para o estado atual e as pendências, se o arquivo existir.
