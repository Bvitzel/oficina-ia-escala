// Regras da casa: confere a escala da semana e devolve os alertas.
// As regras vêm do banco (tabelas `regras` e `configuracoes`) e podem ser
// mudadas na tela "Regras". Aqui fica só a lógica de conferência.

import type { Configuracao, Escala, Funcionario, Regra, Turno } from "@/lib/tipos";
import { DIAS_SEMANA, diaMes, paraData, somarDias } from "@/lib/datas";

export type ConfigRegras = {
  minimos: Regra[];
  folgasMinimas: number; // folgas por semana (0 = regra desligada)
  bloquearFecharEAbrir: boolean;
};

export type Alerta = {
  tipo: "minimo" | "folga" | "fechar-abrir";
  texto: string; // frase completa, para a lista do resumo
  curto: string; // aviso curto, para a grade
  // Células afetadas ("data|turnoId") e, quando houver, o funcionário.
  celulas: string[];
  funcionarioId?: string;
};

export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_ABRIR = "bloquear_fechar_e_abrir";

export function chaveCelula(data: string, turnoId: string): string {
  return `${data}|${turnoId}`;
}

/** Lê as configurações do banco, com valores padrão se faltar alguma. */
export function lerConfiguracoes(configs: Configuracao[]) {
  const valor = (chave: string) => configs.find((c) => c.chave === chave)?.valor;
  const folgas = Number(valor(CHAVE_FOLGAS) ?? "1");
  return {
    folgasMinimas: Number.isFinite(folgas) && folgas >= 0 ? folgas : 1,
    bloquearFecharEAbrir: (valor(CHAVE_FECHAR_ABRIR) ?? "true") === "true",
  };
}

/**
 * Mínimo exigido de uma função num turno e dia da semana.
 * Uma regra do dia específico vale mais que a de "todos os dias".
 */
export function minimoExigido(
  regras: Regra[],
  diaSemana: number,
  turnoId: string,
  funcao: string,
): number {
  const doTurno = regras.filter((r) => r.turno_id === turnoId && r.funcao === funcao);
  const doDia = doTurno.filter((r) => r.dia_semana === diaSemana);
  const usadas = doDia.length > 0 ? doDia : doTurno.filter((r) => r.dia_semana === null);
  return usadas.reduce((maior, r) => Math.max(maior, r.minimo), 0);
}

/**
 * Confere a semana inteira.
 * `escalas` pode incluir o domingo anterior e a segunda seguinte, para a
 * regra de fechar e abrir funcionar na virada da semana.
 */
export function conferirSemana(params: {
  dias: string[]; // os 7 dias da semana, de segunda a domingo
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  config: ConfigRegras;
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas, config } = params;
  const alertas: Alerta[] = [];
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const primeiroNome = (id: string) => porId.get(id)?.nome.split(" ")[0] ?? "Alguém";
  const nomeDia = (iso: string) => `${DIAS_SEMANA[paraData(iso).getDay()]} ${diaMes(iso)}`;

  const escaladosNa = (data: string, turnoId: string) =>
    escalas.filter((e) => e.data === data && e.turno_id === turnoId).map((e) => e.funcionario_id);

  // 1. Mínimo de pessoas por turno e função.
  const funcoesComRegra = Array.from(new Set(config.minimos.map((r) => r.funcao)));
  for (const turno of turnos) {
    for (const data of dias) {
      const diaSemana = paraData(data).getDay();
      const escalados = escaladosNa(data, turno.id);
      for (const funcao of funcoesComRegra) {
        const minimo = minimoExigido(config.minimos, diaSemana, turno.id, funcao);
        if (minimo === 0) continue;
        const tem = escalados.filter((id) => porId.get(id)?.funcao === funcao).length;
        if (tem < minimo) {
          const falta = minimo - tem;
          alertas.push({
            tipo: "minimo",
            curto: `Falta ${falta} ${funcao}`,
            texto: `${turno.nome} de ${nomeDia(data)}: ${tem} de ${minimo} em ${funcao}.`,
            celulas: [chaveCelula(data, turno.id)],
          });
        }
      }
    }
  }

  // 2. Folga semanal: dias com pelo menos um turno não podem passar de 7 - folgas.
  if (config.folgasMinimas > 0) {
    const maximoDias = 7 - config.folgasMinimas;
    const diasDaSemana = new Set(dias);
    const diasPorFuncionario = new Map<string, Set<string>>();
    for (const e of escalas) {
      if (!diasDaSemana.has(e.data)) continue;
      const conjunto = diasPorFuncionario.get(e.funcionario_id) ?? new Set<string>();
      conjunto.add(e.data);
      diasPorFuncionario.set(e.funcionario_id, conjunto);
    }
    for (const [id, diasTrabalhados] of diasPorFuncionario) {
      if (diasTrabalhados.size <= maximoDias) continue;
      const folgas = 7 - diasTrabalhados.size;
      alertas.push({
        tipo: "folga",
        curto: "sem folga",
        texto: `${primeiroNome(id)} tem ${folgas} folga(s) na semana; o mínimo é ${config.folgasMinimas}.`,
        celulas: escalas
          .filter((e) => e.funcionario_id === id && diasDaSemana.has(e.data))
          .map((e) => chaveCelula(e.data, e.turno_id)),
        funcionarioId: id,
      });
    }
  }

  // 3. Fechar um dia (último turno) e abrir o seguinte (primeiro turno).
  if (config.bloquearFecharEAbrir && turnos.length >= 2) {
    const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
    const abrir = ordenados[0];
    const fechar = ordenados[ordenados.length - 1];
    // Inclui o domingo anterior para pegar a virada para a segunda.
    const noites = [somarDias(dias[0], -1), ...dias];
    for (const noite of noites) {
      const manha = somarDias(noite, 1);
      const abremNoDiaSeguinte = new Set(escaladosNa(manha, abrir.id));
      for (const id of escaladosNa(noite, fechar.id)) {
        if (!abremNoDiaSeguinte.has(id)) continue;
        alertas.push({
          tipo: "fechar-abrir",
          curto: "fecha e abre",
          texto: `${primeiroNome(id)} fecha ${nomeDia(noite)} (${fechar.nome}) e abre ${nomeDia(manha)} (${abrir.nome}).`,
          celulas: [chaveCelula(noite, fechar.id), chaveCelula(manha, abrir.id)],
          funcionarioId: id,
        });
      }
    }
  }

  return alertas;
}
