// Restaurante Pecorino: tudo o que o dono descreveu, num lugar só.
// Para mudar uma regra, mude aqui, faça commit e a Vercel publica.
// Horários sempre no formato "HH:MM". Dias: 0 = domingo, 1 = segunda ... 6 = sábado.

export type Setor = "Salão" | "Cozinha" | "Gerência";

export type FuncaoConfig = {
  nome: string;
  setor: Setor;
  quantidade: number; // quantas pessoas a casa tem nessa função
  contaComo?: string; // conta no mínimo de outra função (ex.: estagiário conta como Cumim)
  horasDia?: number; // limite de horas por dia, quando for diferente do padrão
  horasSemana?: number; // limite de horas por semana, quando for diferente do padrão
};

export type TurnoConfig = {
  nome: string; // precisa ser igual ao nome do turno no banco
  setor: Setor;
  horaInicio: string;
  horaFim: string;
  intervaloMinutos: number; // intervalo do dia (regra da casa: de 1h a 4h)
  ordem: number;
};

export type FaixaMinima = {
  descricao: string;
  setor: Setor;
  dias: number[];
  horaInicio: string;
  horaFim: string;
  minimos: Record<string, number>; // função -> mínimo de pessoas
};

const SEG_A_SEX = [1, 2, 3, 4, 5];
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------
export const FUNCOES: FuncaoConfig[] = [
  // Salão
  { nome: "Garçom", setor: "Salão", quantidade: 8 },
  { nome: "Cumim", setor: "Salão", quantidade: 4 },
  { nome: "Bar", setor: "Salão", quantidade: 1 },
  { nome: "Recepção", setor: "Salão", quantidade: 1 },
  // Estagiários: 5h por dia, fazem tarefas de cumim e contam como Cumim.
  // 30h por semana é o limite da Lei do Estágio.
  { nome: "Estagiário dia", setor: "Salão", quantidade: 1, contaComo: "Cumim", horasDia: 5, horasSemana: 30 },
  { nome: "Estagiário noite", setor: "Salão", quantidade: 2, contaComo: "Cumim", horasDia: 5, horasSemana: 30 },
  // Cozinha
  { nome: "Chefe", setor: "Cozinha", quantidade: 1 }, // boqueta
  { nome: "Cozinheiro", setor: "Cozinha", quantidade: 6 },
  { nome: "Saladeiro", setor: "Cozinha", quantidade: 3 }, // 2 buffet + 1 à la carte
  { nome: "Pia", setor: "Cozinha", quantidade: 3 }, // auxiliar de limpeza
  // Gerência
  { nome: "Gerente Geral", setor: "Gerência", quantidade: 1 },
  { nome: "Maître", setor: "Gerência", quantidade: 1 },
  { nome: "Coordenador", setor: "Gerência", quantidade: 1 },
];

// ---------------------------------------------------------------------
// Turnos (os mesmos nomes e horários ficam na tabela `turnos` do banco;
// veja supabase/turnos-pecorino.sql)
// ---------------------------------------------------------------------
export const TURNOS: TurnoConfig[] = [
  { nome: "Cozinha Dia", setor: "Cozinha", horaInicio: "08:00", horaFim: "16:00", intervaloMinutos: 60, ordem: 1 },
  { nome: "Cozinha Noite", setor: "Cozinha", horaInicio: "15:00", horaFim: "23:00", intervaloMinutos: 60, ordem: 2 },
  { nome: "Salão Abertura", setor: "Salão", horaInicio: "11:00", horaFim: "21:30", intervaloMinutos: 150, ordem: 3 },
  { nome: "Salão", setor: "Salão", horaInicio: "12:00", horaFim: "22:30", intervaloMinutos: 150, ordem: 4 },
  { nome: "Estágio Dia", setor: "Salão", horaInicio: "12:00", horaFim: "17:00", intervaloMinutos: 0, ordem: 5 },
  { nome: "Estágio Noite", setor: "Salão", horaInicio: "17:30", horaFim: "22:30", intervaloMinutos: 0, ordem: 6 },
  { nome: "Gerência Dia", setor: "Gerência", horaInicio: "08:00", horaFim: "16:00", intervaloMinutos: 60, ordem: 7 },
  { nome: "Gerência Tarde", setor: "Gerência", horaInicio: "12:00", horaFim: "23:00", intervaloMinutos: 180, ordem: 8 },
];

// Intervalo diário permitido (turnos de até 6h não têm intervalo).
export const INTERVALO_MINIMO_MINUTOS = 60;
export const INTERVALO_MAXIMO_MINUTOS = 240;

// ---------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------
// Horário em que cada setor precisa de gente.
export const FUNCIONAMENTO: { setor: Setor; horaInicio: string; horaFim: string }[] = [
  { setor: "Salão", horaInicio: "12:00", horaFim: "22:30" },
  { setor: "Cozinha", horaInicio: "08:00", horaFim: "23:00" },
];

export const PICOS: { dias: number[]; horaInicio: string; horaFim: string }[] = [
  { dias: SEG_A_SEX, horaInicio: "12:00", horaFim: "14:00" },
  { dias: SEG_A_SEX, horaInicio: "19:00", horaFim: "21:00" },
  { dias: [6], horaInicio: "13:00", horaFim: "17:00" },
  { dias: [6], horaInicio: "18:30", horaFim: "21:30" },
  { dias: [0], horaInicio: "12:00", horaFim: "17:00" },
];

export const MINIMO_BAIXO_MOVIMENTO: Partial<Record<Setor, Record<string, number>>> = {
  Salão: { Garçom: 4, Bar: 1, Recepção: 1, Cumim: 3 },
  Cozinha: { Chefe: 1, Cozinheiro: 2, Pia: 1 },
};

export const MINIMO_ALTO_MOVIMENTO: Partial<Record<Setor, Record<string, number>>> = {
  Salão: { Garçom: 6, Bar: 2, Recepção: 1, Cumim: 4 },
  Cozinha: { Chefe: 1, Cozinheiro: 3, Pia: 2 },
};

// Faixas fixas: abertura, fechamento e saladeiros (buffet x à la carte).
export const FAIXAS_EXTRAS: FaixaMinima[] = [
  {
    descricao: "abertura do salão (11h)",
    setor: "Salão",
    dias: TODOS_OS_DIAS,
    horaInicio: "11:00",
    horaFim: "11:30",
    minimos: { Garçom: 1, Cumim: 1 },
  },
  {
    descricao: "fechamento do salão",
    setor: "Salão",
    dias: TODOS_OS_DIAS,
    horaInicio: "22:00",
    horaFim: "22:30",
    minimos: { Garçom: 2, Cumim: 1, Bar: 1 },
  },
  {
    // Buffet funciona de segunda a sexta, de dia: 2 saladeiros.
    descricao: "buffet",
    setor: "Cozinha",
    dias: SEG_A_SEX,
    horaInicio: "08:00",
    horaFim: "16:00",
    minimos: { Saladeiro: 2 },
  },
  {
    // À la carte (noite e fins de semana): 1 saladeiro sempre.
    descricao: "à la carte",
    setor: "Cozinha",
    dias: TODOS_OS_DIAS,
    horaInicio: "08:00",
    horaFim: "23:00",
    minimos: { Saladeiro: 1 },
  },
];

// ---------------------------------------------------------------------
// Folgas e horas
// ---------------------------------------------------------------------
export const FOLGAS_POR_SEMANA = 2;
export const HORAS_SEMANAIS_MAXIMAS = 42;

// Fechar um dia e abrir o seguinte: não está nas regras da casa, fica desligado.
export const BLOQUEAR_FECHAR_E_ABRIR = false;
export const PARES_FECHAR_ABRIR: [fecha: string, abre: string][] = [
  ["Cozinha Noite", "Cozinha Dia"],
  ["Salão", "Salão Abertura"],
  ["Gerência Tarde", "Gerência Dia"],
];

// ---------------------------------------------------------------------
// Resumo do jeito que o dono descreveu (referência para as próximas entregas)
// ---------------------------------------------------------------------
export const RESTAURANTE = {
  nome: "Pecorino",
  saidas: ["Grade da semana", "Turno descoberto", "Escala x ponto"],
  quemUsa: {
    monta: "O dono, domingo à noite, para a semana seguinte",
    consulta: "A equipe, no celular, pelo link",
  },
  regrasExtras: [
    "Intervalo diário de 1h até 4h",
    "Estagiários trabalham 5h por dia e contam como cumim",
    "Buffet de segunda a sexta (2 saladeiros de dia); à la carte à noite e nos fins de semana (1 saladeiro)",
  ],
};
