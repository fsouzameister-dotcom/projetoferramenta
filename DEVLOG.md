# Dev Log

## Checkpoint atual

- Data: 2026-04-19
- Commit de referência: `9a1b77a`
- Status: baseline funcional validado manualmente (backend + frontend)

## O que foi implementado

### Backend

- Build corrigido com remoção de rota legada inconsistente.
- Configuração centralizada com variáveis críticas obrigatórias.
- Segurança de autenticação fortalecida:
  - sem segredo JWT hardcoded
  - verificação de tenant no middleware
  - sessão JWT configurada para 24h
- Pool de banco centralizado.
- Script de seed para ambiente de desenvolvimento:
  - `npm run seed:dev`
  - cria tenant + usuário admin de teste.
- `.env.example` atualizado com variáveis de desenvolvimento.

### Frontend

- Alinhamento de contrato com API:
  - login em `/login`
  - rotas protegidas em `/api/...`
- Tela de login simplificada para email/senha.
- Sidebar e tema visual premium refinados.
- Dashboard remodelado com:
  - filtros por canal/campanha
  - status da API via `/health`
- Nova página dedicada de Fluxos (`/flows`), removendo redundância do dashboard.
- Editor de fluxo com melhorias de usabilidade:
  - edição de node por duplo clique
  - botão "Salvar fluxo"
  - indicador "Alterações não salvas"
  - persistência de posição de nodes via `config.ui.position`
  - paleta de nodes mais compacta e amigável.
- Botão global Login/Logout contextual com validação de sessão.

## Comandos úteis

### Backend

- Dev: `npm run dev`
- Build: `npm run build`
- Testes: `npm test`
- Seed dev admin: `npm run seed:dev`

### Frontend

- Dev: `npm run dev`
- Build: `npm run build`

## Credenciais de desenvolvimento (seed padrão)

- Email: `admin@local.dev`
- Senha: `AdminDev123!`
- Tenant padrão dev: `00000000-0000-4000-8000-000000000001`

> Obs.: trocar essas credenciais para qualquer ambiente compartilhado.

## Próximos passos recomendados

1. Persistência nativa de posição no backend (campo dedicado, se aplicável).
2. Padronização de erros/contratos de resposta da API.
3. Testes de integração para auth, tenant e CRUD de fluxo/nodes.
4. Início do motor de execução de fluxo (sessão, estado e eventos).

## Próxima sessão (roteiro rápido)

### Objetivo da sessão

Fechar persistência de posição de nodes no backend com contrato explícito, reduzindo dependência de `config.ui.position`.

### Tarefa 1 (primeira a executar)

- Backend:
  - revisar schema de `nodes` para campo de posição dedicado
  - ajustar `createNode`, `updateNode` e `listNodesByFlow` para aceitar/retornar `position`
  - manter fallback temporário para `config.ui.position` durante migração
- Frontend:
  - manter leitura prioritária de `position` retornada pela API
  - preservar fallback enquanto houver dados legados

### Critério de aceite

- Criar flow, mover nodes, salvar, recarregar página e confirmar posições idênticas.
- Nenhum node novo deve depender de posição aleatória para render inicial.

### Comandos de retomada

```bash
cd c:\projetoferramenta
git pull origin master
```

Backend:

```bash
cd c:\projetoferramenta\mvp-fluxo-backend
npm run dev
```

Frontend:

```bash
cd c:\projetoferramenta\mvp-fluxo-frontend
npm run dev
```
