# Gestao CACO

Sistema web para gestao de equipe, distribuicao de atividades e acompanhamento de demandas operacionais.

## Visao Geral

O projeto atende dois perfis:

- `admin`: gerencia colaboradores, atividades, atribuicoes e visao consolidada da equipe.
- `colaborador`: acompanha demandas recebidas, atualiza status e registra operacoes permitidas.

O foco da plataforma e apoiar organizacao de rotina, cobertura de ferias e equilibrio de carga de trabalho.

## Principais Funcionalidades

- Autenticacao com JWT
- Cadastro e desativacao de colaboradores
- Controle de atividades por colaborador
- Criacao, edicao, atribuicao e exclusao de solicitacoes
- Atualizacao de status de demandas
- Reabertura controlada de demandas concluidas
- Painel com indicadores de carga (ex.: leve, medio, sobrecarregado)

## Arquitetura

- `frontend/`: HTML, CSS e JavaScript
- `backend/`: Node.js + Express
- Camada de dados: Google Sheets (integracao via API)

## Estrutura do Repositorio

```text
.
|-- backend/
|   |-- src/
|   `-- package.json
|-- frontend/
|   |-- js/
|   |-- assets/
|   `-- *.html
|-- render.yaml
`-- README.md
```

## Requisitos

- Node.js 18+
- Projeto Google Cloud com API Google Sheets habilitada
- Conta de servico com permissao de leitura e escrita na planilha utilizada pelo projeto

## Configuracao Local

1. Backend
- Entre em `backend/`
- Instale dependencias: `npm install`
- Crie `.env` com base em `.env.example`
- Execute: `npm run dev`

2. Frontend
- Publique a pasta `frontend/` como site estatico
- Configure a URL base da API via variavel global ou `localStorage`

## Variaveis de Ambiente (backend)

Defina no arquivo `.env`:

- `PORT`
- `JWT_SECRET`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `FRONTEND_URL`

## Seguranca

- Nao versionar `.env`, chaves privadas ou tokens.
- Limitar `FRONTEND_URL` aos dominios oficiais.
- Restringir o acesso da planilha apenas a contas autorizadas.

## Scripts (backend)

- `npm run dev`: ambiente de desenvolvimento
- `npm start`: ambiente de producao

