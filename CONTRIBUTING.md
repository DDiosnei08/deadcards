# Contribuindo com o Deadlock Cards

Valeu por querer ajudar! Este guia mostra como rodar o projeto e mandar sua mudança.

## Rodando localmente

Requisitos: Node 24+ e uma conta Cloudflare (só para deploy; o dev roda 100% local).

```bash
npm install
cp .dev.vars.example .dev.vars   # preencha as chaves da Twitch se for mexer no login
npm run db:migrate               # cria as tabelas no D1 local
npm run dev                      # site + Worker + D1 + R2 em http://localhost:5173
```

Para ter dados locais, importe um save do app antigo:

```bash
npm run db:import -- caminho/do/save.json
```

## Stack

- **Front:** React 19, TypeScript, Vite, Tailwind v4, Motion
- **Back:** Cloudflare Workers (com Static Assets), D1 (SQLite), R2, Cron Triggers
- **Auth:** Better Auth sem banco (sessão em cookie), login só com Twitch
- **Dados externos:** [deadlock-api](https://api.deadlock-api.com), com cache no D1

## Fluxo de contribuição

1. Abra uma issue antes de mudanças grandes, para alinharmos a ideia.
2. Crie uma branch a partir da `main`: `feat/nome-curto`, `fix/nome-curto`.
3. Faça a menor mudança que resolve o problema por completo.
4. Rode `npm run build` (inclui checagem de tipos) antes de abrir o PR.
5. Abra o PR preenchendo o template. Mudança visual? Coloque print ou vídeo.

## Commits

Uma linha, no formato [Conventional Commits](https://www.conventionalcommits.org/):

```
tipo(escopo): descrição curta
```

Tipos: `feat`, `fix`, `refactor`, `style`, `perf`, `docs`, `build`, `ci`, `chore`.
Exemplos: `feat(editor): add hero art upload`, `fix(card): keep tilt inside bounds`.

## Banco de dados

- Toda mudança de schema é uma nova migration em `migrations/` (`000N_descricao.sql`). Nunca edite uma migration que já foi aplicada.
- O deploy aplica as migrations remotas automaticamente.

## Visual

O visual é a alma do projeto. Ao mexer em UI:

- Teste em desktop e em celular (375px de largura, sem scroll horizontal).
- Animações com propósito: feedback, continuidade espacial ou mudança de estado. Nada de animar ação repetida o tempo todo.
- Respeite `prefers-reduced-motion`.

## Dúvidas

Abra uma issue com a etiqueta de pergunta ou comente no PR.
