# Gestão CACO

Sistema web fullstack para gestão de colaboradores e demandas da CACO, com Google Sheets como base oficial de dados.

## Estrutura

- `backend/`: API Node.js + Express + JWT + Google Sheets API
- `frontend/`: interface web em HTML/CSS/JavaScript puro
- `render.yaml`: sugestão de deploy no Render
- `frontend/netlify.toml`: roteamento para Netlify

## Decisões de implementação

- Meta das solicitações: **Opção 1 aplicada**. O backend garante a coluna `Meta` na aba `Registro de Demandas` e lê/grava esse valor diretamente nessa aba.
- Registro WhatsApp: salvo na **mesma aba `Registro de Demandas`** como tipo especial (`Assunto` prefixado com `Registro WhatsApp:`), com `Meta = 0`.
- Exclusão de solicitação: implementada como **remoção física da linha** na aba `Registro de Demandas`.
- Campo `Número da solicitação`: salvo com a **parte numérica** do ID (ex.: `000001` para `S000001/2026`).

## Requisitos

- Node.js 18+
- Conta Google Cloud com API do Google Sheets habilitada
- Service Account com acesso de edição à planilha:
  `16k4heNHfta1LBhSjbmeskHQY-NPAo41pqHwyZT8nSbM`

## Configuração do backend

1. Entre em `backend/`.
2. Instale dependências:
   - `npm install`
3. Copie `.env.example` para `.env` e preencha:

```env
PORT=3000
JWT_SECRET=seu_segredo
GOOGLE_SHEET_ID=16k4heNHfta1LBhSjbmeskHQY-NPAo41pqHwyZT8nSbM
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FRONTEND_URL=http://localhost:5173
```

4. Rode:
   - `npm run dev`

## Configuração do frontend

1. Publicar `frontend/` como site estático (Netlify).
2. Ajustar base da API:
   - opção A: definir `window.GESTAO_API_URL` antes dos scripts
   - opção B: salvar no browser: `localStorage.setItem('apiBaseUrl', 'https://SEU-BACKEND.onrender.com')`

Rotas públicas esperadas:
- `/login`
- `/admin`
- `/me`

## Deploy no Render (backend)

1. Criar Web Service apontando para pasta `backend`.
2. Build command: `npm install`
3. Start command: `npm start`
4. Configurar variáveis de ambiente conforme `.env.example`.
5. Definir `FRONTEND_URL` com domínio do Netlify.

## Deploy no Netlify (frontend)

1. Publicar pasta `frontend`.
2. Build command: vazio (site estático).
3. Publish directory: `frontend`.
4. O arquivo `netlify.toml` já roteia `/login`, `/admin`, `/me`.

## Fluxos implementados

- Login por nome na aba `Perfil` com validação `Ativo = Sim` e JWT.
- Admin:
  - Lista de colaboradores ativos (`role=colaborador`)
  - Criação/desativação de colaborador
  - Modal de configurações com toggle de atividades
  - Gestão de solicitações pendentes (criar, editar, excluir, atribuir)
  - Link `Dashboard` abre diretamente a planilha do Google Sheets
  - Cálculo de percentual por meta de demandas não concluídas
- Colaborador:
  - Visualiza apenas atividades habilitadas
  - Lista demandas atribuídas e altera status para `Em andamento`/`Concluído`
  - Registro WhatsApp condicionado a `Whatsapp = Sim`

## Endpoints principais

- `POST /api/auth/login`
- `GET /api/profile/me`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:nome/atividades`
- `DELETE /api/users/:nome`
- `GET /api/solicitacoes?pendentes=true&atendente=Nome`
- `POST /api/solicitacoes`
- `PUT /api/solicitacoes/:id`
- `DELETE /api/solicitacoes/:id`
- `POST /api/solicitacoes/:id/atribuir`
- `GET /api/demandas?atendente=Nome`
- `POST /api/demandas/:id/status`
- `POST /api/demandas/registro-whatsapp`
- `GET /api/dashboard/admin`

## Observação

A máquina atual não possui `node` no PATH, então a validação de execução local não pôde ser feita aqui. A estrutura e o código foram entregues completos para rodar após instalar Node.js.
