// Regras da casa: confere a escala da semana e devolve os alertas.
// As regras ficam em src/config/restaurante.ts. Aqui fica só a conferência.
//
// Como funciona a cobertura: o dia é dividido em fatias de 30 minutos.
// Em cada fatia, conta quem está escalado num turno que cobre aquele horário
// e compara com o mínimo (alto movimento nos picos, baixo fora deles, mais as
// faixas de abertura, fechamento e saladeiros). Os intervalos são considerados
// fora dos picos, então não descontam a cobertura.

import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import { DIAS_SEMANA, diaMes, horaParaMinutos, paraData, somarDias } from "@/lib/datas";
import {
  BLOQUEAR_FECHAR_E_ABRIR,
  FAIXAS_EXTRAS,
  FOLGAS_POR_SEMANA,
  FUNCIONAMENTO,
  FUNCOES,
  HORAS_SEMANAIS_MAXIMAS,
  INTERVALO_MAXIMO_MINUTOS,
  INTERVALO_MINIMO_MINUTOS,
  MINIMO_ALTO_MOVIMENTO,
  MINIMO_BAIXO_MOVIMENTO,
  PARES_FECHAR_ABRIR,
  PICOS,
  TURNOS,
  type Setor,
} from "@/config/restaurante";

export type Alerta = {
  tipo: "cobertura" | "folga" | "horas" | "fechar-abrir" | "configuracao";
  texto: string; // frase completa, para a lista do resumo
  curto: string; // aviso curto, para a grade
  celulas: string[]; // células afetadas ("data|turnoId")
  funcionarioId?: string;
};

const FATIA = 30; // minutos

export function chaveCelula(data: string, turnoId: string): string {
  return `${data}|${turnoId}`;
}

/** 750 -> "12h30"; 720 -> "12h" */
export function formatarHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Setor de um turno do banco, pelo nome cadastrado em restaurante.ts. */
export function setorDoTurno(turno: Turno): Setor | null {
  return TURNOS.find((t) => t.nome === turno.nome)?.setor ?? null;
}

/** Setor de uma função, pelo que está em restaurante.ts. */
export function setorDaFuncao(funcao: string): Setor | null {
  return FUNCOES.find((f) => f.nome === funcao)?.setor ?? null;
}

/** Minutos trabalhados num turno, já sem o intervalo. */
export function minutosLiquidos(turno: Turno): number {
  const duracao = horaParaMinutos(turno.hora_fim) - horaParaMinutos(turno.hora_inicio);
  const config = TURNOS.find((t) => t.nome === turno.nome);
  const intervalo = config ? config.intervaloMinutos : duracao > 360 ? INTERVALO_MINIMO_MINUTOS : 0;
  return Math.max(0, duracao - intervalo);
}

/** Função que conta no mínimo (estagiário conta como Cumim). */
function funcaoQueConta(funcao: string): string {
  return FUNCOES.find((f) => f.nome === funcao)?.contaComo ?? funcao;
}

function dentro(minuto: number, inicio: string, fim: string): boolean {
  return minuto >= horaParaMinutos(inicio) && minuto < horaParaMinutos(fim);
}

/** Mínimo exigido por função numa fatia de um dia, para um setor. */
function minimosNaFatia(setor: Setor, diaSemana: number, minuto: number): Map<string, number> {
  const exigido = new Map<string, number>();
  const exigir = (minimos: Record<string, number> | undefined) => {
    for (const [funcao, n] of Object.entries(minimos ?? {})) {
      exigido.set(funcao, Math.max(exigido.get(funcao) ?? 0, n));
    }
  };
  const aberto = FUNCIONAMENTO.some(
    (f) => f.setor === setor && dentro(minuto, f.horaInicio, f.horaFim),
  );
  if (aberto) {
    const pico = PICOS.some((p) => p.dias.includes(diaSemana) && dentro(minuto, p.horaInicio, p.horaFim));
    exigir(pico ? MINIMO_ALTO_MOVIMENTO[setor] : MINIMO_BAIXO_MOVIMENTO[setor]);
  }
  for (const faixa of FAIXAS_EXTRAS) {
    if (faixa.setor === setor && faixa.dias.includes(diaSemana) && dentro(minuto, faixa.horaInicio, faixa.horaFim)) {
      exigir(faixa.minimos);
    }
  }
  return exigido;
}

export function conferirSemana(params: {
  dias: string[]; // os 7 dias da semana, de segunda a domingo
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[]; // pode incluir o domingo anterior e a segunda seguinte
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas } = params;
  const alertas: Alerta[] = [];
  const pessoa = new Map(funcionarios.map((f) => [f.id, f]));
  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  const primeiroNome = (id: string) => pessoa.get(id)?.nome.split(" ")[0] ?? "Alguém";
  const nomeDia = (iso: string) => `${DIAS_SEMANA[paraData(iso).getDay()]} ${diaMes(iso)}`;
  const diasDaSemana = new Set(dias);
  const daSemana = escalas.filter((e) => diasDaSemana.has(e.data) && turnoPorId.has(e.turno_id));

  // 1. Cobertura por horário (turno descoberto).
  const setores = Array.from(
    new Set<Setor>([
      ...FUNCIONAMENTO.map((f) => f.setor),
      ...FAIXAS_EXTRAS.map((f) => f.setor),
    ]),
  );
  const minutosDoDia = Array.from({ length: (24 * 60) / FATIA }, (_, i) => i * FATIA);

  for (const data of dias) {
    const diaSemana = paraData(data).getDay();
    const doDia = daSemana.filter((e) => e.data === data);

    for (const setor of setores) {
      // falta[função][fatia] = quantas pessoas faltam
      const faltas = new Map<string, { minuto: number; falta: number; tem: number; exigido: number }[]>();
      for (const minuto of minutosDoDia) {
        const exigido = minimosNaFatia(setor, diaSemana, minuto);
        if (exigido.size === 0) continue;
        for (const [funcao, n] of exigido) {
          const tem = doDia.filter((e) => {
            const t = turnoPorId.get(e.turno_id)!;
            const f = pessoa.get(e.funcionario_id);
            return (
              f !== undefined &&
              funcaoQueConta(f.funcao) === funcao &&
              horaParaMinutos(t.hora_inicio) <= minuto &&
              horaParaMinutos(t.hora_fim) >= minuto + FATIA
            );
          }).length;
          if (tem < n) {
            const lista = faltas.get(funcao) ?? [];
            lista.push({ minuto, falta: n - tem, tem, exigido: n });
            faltas.set(funcao, lista);
          }
        }
      }

      // Junta fatias seguidas num alerta só.
      for (const [funcao, lista] of faltas) {
        let grupo: typeof lista = [];
        const fechar = () => {
          if (grupo.length === 0) return;
          const inicio = grupo[0].minuto;
          const fim = grupo[grupo.length - 1].minuto + FATIA;
          const pior = grupo.reduce((a, b) => (b.falta > a.falta ? b : a));
          const faixa = `${formatarHora(inicio)}–${formatarHora(fim)}`;
          const celulas = turnos
            .filter(
              (t) =>
                setorDoTurno(t) === setor &&
                horaParaMinutos(t.hora_inicio) < fim &&
                horaParaMinutos(t.hora_fim) > inicio,
            )
            .map((t) => chaveCelula(data, t.id));
          alertas.push({
            tipo: "cobertura",
            curto: `Falta ${pior.falta} ${funcao} ${faixa}`,
            texto: `${nomeDia(data)} · ${setor}: ${pior.tem} de ${pior.exigido} ${funcao} das ${formatarHora(inicio)} às ${formatarHora(fim)}.`,
            celulas,
          });
          grupo = [];
        };
        for (const item of lista) {
          const anterior = grupo[grupo.length - 1];
          if (anterior && item.minuto !== anterior.minuto + FATIA) fechar();
          grupo.push(item);
        }
        fechar();
      }
    }
  }

  // 2. Folgas e horas por funcionário.
  const porFuncionario = new Map<string, Escala[]>();
  for (const e of daSemana) {
    porFuncionario.set(e.funcionario_id, [...(porFuncionario.get(e.funcionario_id) ?? []), e]);
  }
  for (const [id, suas] of porFuncionario) {
    const config = FUNCOES.find((f) => f.nome === pessoa.get(id)?.funcao);
    const celulasDe = (lista: Escala[]) => lista.map((e) => chaveCelula(e.data, e.turno_id));

    const diasTrabalhados = new Set(suas.map((e) => e.data));
    const folgas = 7 - diasTrabalhados.size;
    if (folgas < FOLGAS_POR_SEMANA) {
      alertas.push({
        tipo: "folga",
        curto: `${folgas} folga(s)`,
        texto: `${primeiroNome(id)} tem ${folgas} folga(s) na semana; o mínimo é ${FOLGAS_POR_SEMANA}.`,
        celulas: celulasDe(suas),
        funcionarioId: id,
      });
    }

    const minutosSemana = suas.reduce((soma, e) => soma + minutosLiquidos(turnoPorId.get(e.turno_id)!), 0);
    const limiteSemana = (config?.horasSemana ?? HORAS_SEMANAIS_MAXIMAS) * 60;
    if (minutosSemana > limiteSemana) {
      alertas.push({
        tipo: "horas",
        curto: `${formatarHora(minutosSemana)} na semana`,
        texto: `${primeiroNome(id)} soma ${formatarHora(minutosSemana)} na semana; o limite é ${formatarHora(limiteSemana)}.`,
        celulas: celulasDe(suas),
        funcionarioId: id,
      });
    }

    if (config?.horasDia) {
      for (const data of diasTrabalhados) {
        const doDia = suas.filter((e) => e.data === data);
        const minutosDia = doDia.reduce((soma, e) => soma + minutosLiquidos(turnoPorId.get(e.turno_id)!), 0);
        if (minutosDia > config.horasDia * 60) {
          alertas.push({
            tipo: "horas",
            curto: `${formatarHora(minutosDia)} no dia`,
            texto: `${primeiroNome(id)} (${config.nome}) faz ${formatarHora(minutosDia)} em ${nomeDia(data)}; o limite é ${config.horasDia}h por dia.`,
            celulas: celulasDe(doDia),
            funcionarioId: id,
          });
        }
      }
    }
  }

  // 3. Fechar um dia e abrir o seguinte (desligado por padrão).
  if (BLOQUEAR_FECHAR_E_ABRIR) {
    for (const [nomeFecha, nomeAbre] of PARES_FECHAR_ABRIR) {
      const fecha = turnos.find((t) => t.nome === nomeFecha);
      const abre = turnos.find((t) => t.nome === nomeAbre);
      if (!fecha || !abre) continue;
      for (const noite of [somarDias(dias[0], -1), ...dias]) {
        const manha = somarDias(noite, 1);
        const abrem = new Set(
          escalas.filter((e) => e.data === manha && e.turno_id === abre.id).map((e) => e.funcionario_id),
        );
        for (const e of escalas.filter((x) => x.data === noite && x.turno_id === fecha.id)) {
          if (!abrem.has(e.funcionario_id)) continue;
          alertas.push({
            tipo: "fechar-abrir",
            curto: "fecha e abre",
            texto: `${primeiroNome(e.funcionario_id)} fecha ${nomeDia(noite)} (${fecha.nome}) e abre ${nomeDia(manha)} (${abre.nome}).`,
            celulas: [chaveCelula(noite, fecha.id), chaveCelula(manha, abre.id)],
            funcionarioId: e.funcionario_id,
          });
        }
      }
    }
  }

  // 4. Intervalo dos turnos fora da regra da casa (1h a 4h).
  for (const t of TURNOS) {
    const duracao = horaParaMinutos(t.horaFim) - horaParaMinutos(t.horaInicio);
    if (duracao <= 360) continue;
    if (t.intervaloMinutos < INTERVALO_MINIMO_MINUTOS || t.intervaloMinutos > INTERVALO_MAXIMO_MINUTOS) {
      alertas.push({
        tipo: "configuracao",
        curto: "intervalo fora da regra",
        texto: `O turno ${t.nome} está com intervalo de ${formatarHora(t.intervaloMinutos)}; a regra é de 1h a 4h.`,
        celulas: [],
      });
    }
  }

  return alertas;
}
