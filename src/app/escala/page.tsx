"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Configuracao, Escala, Funcionario, Regra, Turno } from "@/lib/tipos";
import { chaveCelula, conferirSemana, lerConfiguracoes, type Alerta, type ConfigRegras } from "@/lib/regras";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

type CelulaAberta = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [config, setConfig] = useState<ConfigRegras | null>(null);
  const [verAlertas, setVerAlertas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [celula, setCelula] = useState<CelulaAberta | null>(null);
  const [gravando, setGravando] = useState<string | null>(null); // id do funcionário

  const semVariaveis = !variaveisConfiguradas();

  function irParaSemana(novaSegunda: string) {
    if (novaSegunda === segunda) return;
    setCarregando(true);
    setSegunda(novaSegunda);
  }

  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) return;
      const db = supabase();
      const [t, f, r, c] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
        db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
        db.from("configuracoes").select("chave, valor"),
      ]);
      const falha = t.error ?? f.error ?? r.error ?? c.error;
      if (falha) {
        setErro(`Não foi possível carregar os dados: ${falha.message}`);
        return;
      }
      setTurnos(t.data as Turno[]);
      setFuncionarios(f.data as Funcionario[]);
      setConfig({
        minimos: r.data as Regra[],
        ...lerConfiguracoes(c.data as Configuracao[]),
      });
    }
    carregarBase();
  }, []);

  // Escala da semana: recarregada a cada troca de semana.
  // Inclui o domingo anterior e a segunda seguinte para a regra de fechar e abrir.
  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    let cancelado = false;
    supabase()
      .from("escalas")
      .select("id, data, turno_id, funcionario_id")
      .gte("data", somarDias(segunda, -1))
      .lte("data", somarDias(segunda, 7))
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) setErro(`Não foi possível carregar a escala: ${error.message}`);
        else setEscalas(data as Escala[]);
        setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [segunda]);

  const porId = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f])),
    [funcionarios],
  );

  // Regras da casa: alertas recalculados a cada mudança na escala.
  const alertas = useMemo<Alerta[]>(
    () => (config ? conferirSemana({ dias, turnos, funcionarios, escalas, config }) : []),
    [config, dias, turnos, funcionarios, escalas],
  );

  // Avisos por célula e por funcionário dentro da célula.
  const { avisosCelula, avisosPessoa } = useMemo(() => {
    const avisosCelula = new Map<string, string[]>();
    const avisosPessoa = new Map<string, string[]>();
    for (const a of alertas) {
      for (const c of a.celulas) {
        if (a.funcionarioId) {
          const chave = `${c}|${a.funcionarioId}`;
          const lista = avisosPessoa.get(chave) ?? [];
          if (!lista.includes(a.curto)) lista.push(a.curto);
          avisosPessoa.set(chave, lista);
        } else {
          avisosCelula.set(c, [...(avisosCelula.get(c) ?? []), a.curto]);
        }
      }
    }
    return { avisosCelula, avisosPessoa };
  }, [alertas]);

  function celulaTemAlerta(data: string, turnoId: string): boolean {
    const c = chaveCelula(data, turnoId);
    if (avisosCelula.has(c)) return true;
    return escalas.some(
      (e) => e.data === data && e.turno_id === turnoId && avisosPessoa.has(`${c}|${e.funcionario_id}`),
    );
  }

  function escaladosNa(data: string, turnoId: string): Funcionario[] {
    return escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => porId.get(e.funcionario_id))
      .filter((f): f is Funcionario => Boolean(f))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async function alternar(funcionario: Funcionario, marcado: boolean) {
    if (!celula) return;
    const { data, turno } = celula;
    setGravando(funcionario.id);
    setErro(null);
    const tabela = supabase().from("escalas");
    if (marcado) {
      const { data: nova, error } = await tabela
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível escalar ${funcionario.nome}: ${error.message}`);
      else setEscalas((atual) => [...atual, nova as Escala]);
    } else {
      const { error } = await tabela
        .delete()
        .eq("data", data)
        .eq("turno_id", turno.id)
        .eq("funcionario_id", funcionario.id);
      if (error) setErro(`Não foi possível tirar ${funcionario.nome}: ${error.message}`);
      else
        setEscalas((atual) =>
          atual.filter(
            (e) =>
              !(e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id),
          ),
        );
    }
    setGravando(null);
  }

  // Na janela: ativos + quem já está escalado mesmo se desativado depois.
  const opcoesDaCelula = useMemo(() => {
    if (!celula) return [];
    const escaladosIds = new Set(
      escalas
        .filter((e) => e.data === celula.data && e.turno_id === celula.turno.id)
        .map((e) => e.funcionario_id),
    );
    return funcionarios
      .filter((f) => f.ativo || escaladosIds.has(f.id))
      .map((f) => ({ funcionario: f, marcado: escaladosIds.has(f.id) }));
  }, [celula, escalas, funcionarios]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          Semana de {diaMes(dias[0])} a {diaMes(dias[6])}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="botao-secundario" onClick={() => irParaSemana(somarDias(segunda, -7))}>
            ◀ Anterior
          </button>
          <button className="botao-secundario" onClick={() => irParaSemana(somarDias(segunda, 7))}>
            Próxima ▶
          </button>
        </div>
        {segunda !== inicioDaSemana(hoje) && (
          <button
            className="botao-secundario w-full"
            onClick={() => irParaSemana(inicioDaSemana(hoje))}
          >
            Voltar para esta semana
          </button>
        )}
      </div>

      {semVariaveis && (
        <p className="cartao border-red-300 text-red-700">
          As variáveis do Supabase não foram configuradas. Veja a tela Início.
        </p>
      )}
      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {config && !carregando && (
        <div className={`cartao ${alertas.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}>
          {alertas.length === 0 ? (
            <p className="font-semibold text-green-800">Nenhum alerta nesta semana ✓</p>
          ) : (
            <>
              <button
                className="flex w-full items-center justify-between gap-2 text-left font-semibold text-red-800"
                onClick={() => setVerAlertas(!verAlertas)}
                aria-expanded={verAlertas}
              >
                <span>
                  ⚠ Esta semana tem {alertas.length} {alertas.length === 1 ? "alerta" : "alertas"}
                </span>
                <span className="text-sm underline">{verAlertas ? "Esconder" : "Ver lista"}</span>
              </button>
              {verAlertas && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-900">
                  {alertas.map((a, i) => (
                    <li key={i}>{a.texto}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-sm text-neutral-600">
        Toque em uma célula para escolher quem trabalha. Arraste a grade para o lado para ver
        todos os dias.
      </p>

      <div className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm ${carregando ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] w-24 min-w-24 border-b border-r border-neutral-200 bg-white p-2 text-sm">
                Turno
              </th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-32 border-b border-neutral-200 p-2 text-center text-sm font-semibold ${
                    d === hoje ? "bg-principal text-white" : ""
                  }`}
                >
                  {rotuloDia(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <th className="sticky left-0 z-[1] border-b border-r border-neutral-200 bg-white p-2 align-top">
                  <span className="block font-semibold">{t.nome}</span>
                  <span className="block text-xs font-normal text-neutral-600">
                    {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const escalados = escaladosNa(d, t.id);
                  const chave = chaveCelula(d, t.id);
                  const comAlerta = celulaTemAlerta(d, t.id);
                  return (
                    <td key={d} className="border-b border-neutral-200 p-1 align-top">
                      <button
                        className={`flex min-h-24 w-full flex-col items-stretch gap-1 rounded-xl border p-2 text-left ${
                          comAlerta
                            ? "border-red-400 bg-red-50 active:bg-red-100"
                            : "border-dashed border-neutral-300 active:bg-neutral-100"
                        }`}
                        onClick={() => setCelula({ data: d, turno: t })}
                        aria-label={`${t.nome} de ${rotuloDia(d)}: escolher funcionários`}
                      >
                        {escalados.length === 0 && (
                          <span className="m-auto text-sm text-neutral-400">+ Escalar</span>
                        )}
                        {escalados.map((f) => {
                          const avisos = avisosPessoa.get(`${chave}|${f.id}`);
                          return (
                            <span
                              key={f.id}
                              className={`rounded-lg px-2 py-1 text-sm font-medium ${
                                avisos ? "bg-red-100 text-red-800" : "bg-neutral-100"
                              }`}
                            >
                              <span className="block truncate">
                                {avisos && "⚠ "}
                                {f.nome.split(" ")[0]}
                              </span>
                              {avisos && (
                                <span className="block text-xs font-normal">{avisos.join(", ")}</span>
                              )}
                            </span>
                          );
                        })}
                        {avisosCelula.get(chave)?.map((aviso) => (
                          <span key={aviso} className="text-xs font-semibold text-red-700">
                            ⚠ {aviso}
                          </span>
                        ))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {celula && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelula(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-xl font-bold">
              {celula.turno.nome} · {DIAS_SEMANA[paraData(celula.data).getDay()]}{" "}
              {diaMes(celula.data)}
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Marque quem trabalha. Cada mudança é salva na hora.
            </p>
            {erro && <p className="mb-3 text-red-700">{erro}</p>}
            {(() => {
              const chave = chaveCelula(celula.data, celula.turno.id);
              const daCelula = alertas.filter((a) => a.celulas.includes(chave));
              if (daCelula.length === 0) return null;
              return (
                <ul className="mb-3 space-y-1 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                  {daCelula.map((a, i) => (
                    <li key={i}>⚠ {a.texto}</li>
                  ))}
                </ul>
              );
            })()}
            <ul className="space-y-2">
              {opcoesDaCelula.map(({ funcionario: f, marcado }) => (
                <li key={f.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                      marcado ? "border-principal bg-neutral-50" : "border-neutral-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-6 w-6 accent-principal"
                      checked={marcado}
                      disabled={gravando !== null}
                      onChange={(e) => alternar(f, e.target.checked)}
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">{f.nome}</span>
                      <span className="block text-sm text-neutral-600">
                        {f.funcao}
                        {!f.ativo && " · desativado"}
                      </span>
                    </span>
                    {gravando === f.id && (
                      <span className="text-sm text-neutral-500">Salvando...</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            <button className="botao mt-4 w-full" onClick={() => setCelula(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
