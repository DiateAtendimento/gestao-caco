const PROFILE_SHEET = 'Perfil';
const DEMANDS_SHEET = 'Registro de Demandas';

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
  'Resposta final'
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
  PROFILE_HEADERS,
  PROFILE_NON_ACTIVITY_HEADERS,
  ACTIVITY_COLUMNS,
  DEMANDS_HEADERS,
  STATUS,
  DASHBOARD_URL
};
