# Menu admin — sidebar agrupado (v2)

## Estrutura atual (v2)

| Seção | Itens | Quem vê |
|-------|--------|---------|
| **Painel** | Painel | Conforme permissão `dashboard` |
| **Plataforma** | Clientes, WhatsApp, Entrada | Somente `platform_admin` |
| **Automação** | Fluxos, Campanhas | `flows`, `campaigns` |
| **Operacional** | Monitoramento, Operação, Relatórios | permissões respectivas |
| **Inteligência** | IA, Insights IA | `ai` / `reports` |
| **Acessos** | Usuários, Perfis | `users`, `roles` |
| **FAQ** | Rodapé | `dashboard` |

WhatsApp e Entrada são **configuração técnica** — apenas operadores da plataforma ClientOn.

## Rollback para menu plano (v1)

Arquivo preservado:

`mvp-fluxo-frontend/src/components/Sidebar.legacy-flat-v1.tsx`

### Opção A — trocar componente

1. Renomeie `Sidebar.tsx` → `Sidebar.grouped-v2.tsx`
2. Copie `Sidebar.legacy-flat-v1.tsx` → `Sidebar.tsx`
3. Ajuste o export default se necessário
4. Rebuild e deploy do frontend

### Opção B — import direto

Em `main.tsx` (LayoutWithSidebar), troque:

```tsx
import Sidebar from "./components/Sidebar";
```

por:

```tsx
import Sidebar from "./components/Sidebar.legacy-flat-v1";
```

### Permissões no rollback

A v1 **exibia** WhatsApp/Entrada para `admin_local` se o perfil tivesse as permissões.  
Na v2, `whatsapp` e `inbound` são **platform-only** no backend e no catálogo de perfis.

Para rollback completo do comportamento antigo, reverta também:

- `mvp-fluxo-backend/src/auth-permissions.ts` (`DEFAULT_ROLE_PERMISSIONS`, `PLATFORM_ONLY_PERMISSIONS`)
- `mvp-fluxo-frontend/src/lib/permissions.ts`

Use `git show` ou o commit anterior à introdução da v2.

## Arquivos relacionados

- `mvp-fluxo-frontend/src/lib/sidebar-nav.ts` — configuração dos grupos
- `mvp-fluxo-frontend/src/lib/permissions.ts` — rotas e permissões platform-only
- `mvp-fluxo-backend/src/auth-permissions.ts` — espelho backend
