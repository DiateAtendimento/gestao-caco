const PROFILE_SHEET = 'Perfil';
const DEMANDS_SHEET = 'Registro de Demandas';
const WEBCONF_SHEET = 'Reg webconferencia';
const DAYS_WEBCONF_SHEET = 'Dias webconferencia';
const REDIRECT_SHEET = 'Demandas redirecionadas';

const PROFILE_HEADERS = [
  'Atendente',
  'Ramal',
  'Ativo',
  'Role',
  'Senha',
  'Ti',
  'Whatsapp',
  'Email',
  'Webconferencia',
  'Programaregularidade',
  'Sei',
  'Falabr',
  'Registrosiga',
  'Servicoprotocolo',
  'Gescon',
  'Taxigov',
  'Salareuniao400',
  'Benspatrimonio',
  'Materialescritorio',
  'Phplist',
  'Registroviagem'
];

const PROFILE_NON_ACTIVITY_HEADERS = ['Atendente', 'Ramal', 'Ativo', 'Role', 'Senha'];
const ACTIVITY_COLUMNS = PROFILE_HEADERS.filter((header) => !PROFILE_NON_ACTIVITY_HEADERS.includes(header));

const DEMANDS_HEADERS = [
  'ID',
  'Assunto',
  'Descrição',
  'Data do Registro',
  'Finalizado',
  'Atribuida para',
  'Registrador por',
  'Registrado por',
  'Meta',
  'Finalizado por',
  'Meta registro siga',
  'Categoria',
  'Medidas adotadas',
  'Demanda reaberta qtd',
  'Motivo reabertura',
  'Resposta final',
  'Origem'
];

const WEBCONF_HEADERS = [
  'ID',
  'Qual a Webconferencia',
  'Data',
  'Horário',
  'Atendente',
  'Ente não compareceu ao agendamento',
  'Quantidade atendida',
  'Participantes'
];

const REDIRECT_HEADERS = [
  'ID Redirecionamento',
  'ID Demanda',
  'De Colaborador',
  'Para Colaborador',
  'Área',
  'Categoria',
  'Descrição Snapshot',
  'Status Redirecionamento',
  'Data/Hora Envio',
  'Data/Hora Resposta',
  'Respondido por',
  'Motivo Devolução',
  'Tentativa',
  'Ativo',
  'Data/Hora Conclusão Fluxo',
  'Observações'
];

const STATUS = {
  NAO_INICIADA: 'Não iniciada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
};

const DASHBOARD_URL = 'https://docs.google.com/spreadsheets/d/16k4heNHfta1LBhSjbmeskHQY-NPAo41pqHwyZT8nSbM/edit?gid=0#gid=0';

module.exports = {
  PROFILE_SHEET,
  DEMANDS_SHEET,
  WEBCONF_SHEET,
  DAYS_WEBCONF_SHEET,
  REDIRECT_SHEET,
  PROFILE_HEADERS,
  PROFILE_NON_ACTIVITY_HEADERS,
  ACTIVITY_COLUMNS,
  DEMANDS_HEADERS,
  WEBCONF_HEADERS,
  REDIRECT_HEADERS,
  STATUS,
  DASHBOARD_URL
};
