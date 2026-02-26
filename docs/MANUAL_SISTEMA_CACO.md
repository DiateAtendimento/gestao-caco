# Manual do Sistema - Gestao CACO

![Logo CACO](../frontend/assets/icons/logo.svg)

Versao: 1.0  
Data: 26/02/2026

## Sumario
1. Visao geral
2. Perfis de acesso
3. Login
4. Painel do Admin
5. Configuracoes do Atendente
6. Fluxo de Solicitacoes (Admin)
7. Painel do Colaborador
8. Registro SIGA
9. Regras de calculo
10. FAQ
11. Erros comuns

## 1. Visao geral
O Gestao CACO organiza atividades e demandas da equipe.  
O sistema possui dois perfis: `admin` e `colaborador`.

## 2. Perfis de acesso
## 2.1 Admin
- Gerencia colaboradores.
- Ativa/desativa atividades.
- Cria solicitacoes e atribui para atendentes.
- Acompanha percentual, em andamento e nao iniciadas.

## 2.2 Colaborador
- Visualiza atividades habilitadas.
- Atualiza status das demandas atribuidas.
- Usa Registro SIGA quando possuir permissao.
- Registra demandas de WhatsApp quando atividade estiver habilitada.

## 3. Login
Tela de entrada:

![Tela de login](../frontend/assets/img-login.svg)

Passos:
1. Informar usuario e senha.
2. Clicar para entrar.
3. O sistema abre o painel conforme o perfil.

## 4. Painel do Admin
Elementos principais:
- Sidebar com avatar e botao `Sair`.
- Cards de colaboradores.
- Indicadores: `%`, `Em andamento`, `Nao iniciadas`.
- Badge de humor no card.

Exemplo de avatar do admin:

![Avatar admin](../frontend/img/admin.png)

## 5. Configuracoes do Atendente
Ao clicar no lapis de um card, abre `Configuracoes - Nome`.

Abas:
1. `Atividades`
2. `Solicitacoes`

### 5.1 Atividades
Permite ligar/desligar servicos do atendente.

Exemplos de icones de atividade:

![WhatsApp](../frontend/assets/icons/whatsapp.svg)
![Email](../frontend/assets/icons/email.svg)
![Registro SIGA](../frontend/assets/icons/registros-siga.svg)
![SEI](../frontend/assets/icons/sei.svg)

## 6. Fluxo de Solicitacoes (Admin)
Fluxo correto:
1. Admin abre `Configuracoes` do atendente.
2. Entra na aba `Solicitacoes`.
3. Clica em `Adicionar solicitacao`.
4. Preenche `Area`, `Meta` e `Descricao`.
5. Clica em `Salvar`.
6. A solicitacao fica na lista pendente para envio.
7. Admin clica no botao de aviao azul.
8. Atribuicao e enviada para o atendente selecionado.
9. A linha sai da lista pendente do admin.

Observacoes:
- Metas disponiveis: `0.5` ate `5.0`.
- Exemplo de soma: `5 + 5 = 10%`.
- A atribuicao efetiva acontece no clique do aviao.

## 7. Painel do Colaborador
Secoes principais:
1. `Minhas Atividades`
2. `Demandas Atribuidas`
3. `Registros SIGA` (apenas quando habilitado)
4. `Registro WhatsApp` (apenas quando habilitado)

No bloco de demandas atribuidas, o colaborador pode:
- Marcar `Em andamento`.
- Marcar `Concluido`.

## 8. Registro SIGA
Quando o colaborador tem perfil SIGA:
- A tela `Registros SIGA` e exibida.
- A tabela mostra `Data do Registro`.
- Cada linha pode ser finalizada com botao `Registrado`.

## 9. Regras de calculo
## 9.1 Percentual do card
Percentual do colaborador = soma das metas abertas atribuidas a ele.

Se tiver perfil `Registro SIGA`:
- Soma tambem a meta dos registros SIGA pendentes.
- Considera a coluna `Meta registro siga` (padrao 0.5).

## 9.2 Limite visual
- Barra mostra no maximo `100%`.
- Se ultrapassar 100%, aparece aviso:
`Atendente ultrapassou o limite de atividades`.

## 9.3 Nao iniciadas
- Conta demandas nao concluidas.
- Para perfil SIGA, tambem incorpora pendencias de SIGA nao finalizadas.

## 9.4 Humor do card
O humor varia pelo volume de demandas:
1. Fluxo Leve
2. Ritmo Bom
3. Atencao
4. No Limite
5. Sobrecarregado

## 10. FAQ
1. A solicitacao some quando salvo?
Nao. Ela some da lista do admin apos clicar no aviao (envio/atribuicao).

2. Por que minha barra nao passa de 100%?
O sistema limita visualmente em 100%.

3. A meta 5.0 representa quanto?
Representa 5%.

4. Quem ve Registro SIGA?
Somente quem possui permissao `Registrosiga = Sim`.

5. A data do registro aparece onde?
Na tabela de `Registros SIGA`.

## 11. Erros comuns
1. Solicitação nao aparece para atribuir: validar se foi salva na aba correta.
2. Avatar antigo em cache: atualizar pagina com Ctrl+F5.
3. Card com percentual inesperado: conferir metas das demandas abertas.
4. SIGA zerado com filas pendentes: validar coluna `Finalizado`.
5. Botao de envio sem efeito: validar token de sessao/logado como admin.
6. Atividade nao aparece para colaborador: conferir se atividade esta `Sim` no perfil.
7. Sem dados no dashboard: validar conexao com planilha e permissoes.
8. Erro de login: conferir senha configurada no perfil.
9. Nao conclui demanda: verificar permissao do usuario para a demanda atribuida.
10. Data de registro vazia: validar preenchimento no momento de criacao.

---

## Guia rapido (1 pagina)
1. Admin abre o card do atendente (lapis).
2. Aba `Solicitacoes` -> `Adicionar solicitacao`.
3. Preenche dados e salva.
4. Clica no aviao azul para atribuir.
5. Linha sai da lista do admin.
6. Colaborador recebe em `Demandas Atribuidas`.
7. Colaborador atualiza status ate concluir.

