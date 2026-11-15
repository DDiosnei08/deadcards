# AGENTS.md

Regras para agentes de IA (e humanos) trabalhando neste repositório.

## Projeto

Site de cartas estilo FIFA para jogadores de Deadlock. O visual é prioridade máxima.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Site + Worker + D1 + R2 locais (Vite + `@cloudflare/vite-plugin`) |
| `npm run build` | Checagem de tipos + build de produção |
| `npm run db:migrate` | Aplica migrations no D1 local |
| `npm run db:import -- <save.json> [--remote]` | Importa um save JSON para D1 e R2 |
| `npm run deploy` | Build + deploy no Cloudflare |

Não suba outro servidor de dev se já houver um rodando.

## Estrutura

```
src/worker.ts        Worker: /api/*, /img/* (R2), cron de sync da deadlock-api
src/auth.ts          Better Auth stateless (Twitch) + checagem de admin
src/lib/             Tipos, regras das cartas (OVR, tiers, raridade), DataProvider
src/components/      Card, Spotlight, Account e peças reutilizáveis
src/views/           Telas: Home, Teams, TierList, Collection, Editor, Login
src/styles/cards.css CSS das cartas portado do HTML original
migrations/          Schema do D1, uma migration por mudança
scripts/             Scripts de manutenção (import de save)
```

## Regras

- **Menor mudança completa.** Resolva o problema inteiro com o mínimo de código novo. Sem abstração, opção ou config que ninguém pediu.
- **Reuse antes de criar.** Procure helper/componente existente em `src/lib` e `src/components` antes de escrever outro.
- **Sem dependência nova para poucas linhas.** Dependência nova precisa de motivo claro.
- **Comentários só para o porquê** que o código não mostra (workaround, restrição escondida).
- **Atalho conhecido** recebe comentário `shortcut: <limite>, <quando melhorar>`.
- **Nunca corte:** validação em fronteira de confiança (APIs de escrita, upload), tratamento de erro que evita perda de dados, segurança, acessibilidade.
- **Escrita exige admin.** Toda rota que altera dados passa por `currentUser(...).admin`. Admins vêm de `ADMINS` no `wrangler.jsonc`.
- **SQL sempre com bind** (`prepare(...).bind(...)`), nunca concatenando valores.
- **Schema muda só por migration nova.** Não edite migrations aplicadas.
- **Imagens vão para o R2** e são servidas por `/img/<key>`; nada de base64 no banco.
- **Animação com propósito** (feedback, continuidade, estado), dentro do orçamento (UI < 300 ms), usando Motion. Nada de animar ação de alta frequência.
- **Layout responsivo:** funciona a 375 px sem scroll horizontal.
- **Verifique antes de dizer que terminou:** `npm run build` passa; mudança de UI conferida no navegador.

## Git

- Commits de uma linha em Conventional Commits: `tipo(escopo): descrição`. Sem corpo nem trailers.
- Nunca adicione `Co-Authored-By` ou atribuição a IA em commits ou PRs.
- Commits separados por etapa lógica.
- Não faça push nem deploy sem pedido explícito.

## Segredos

`BETTER_AUTH_SECRET`, `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` ficam em `.dev.vars` (local) e `wrangler secret put` (produção). Nunca commite `.dev.vars`.
