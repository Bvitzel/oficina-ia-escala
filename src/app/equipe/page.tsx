"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";

type Formulario = {
  id: string | null; // null = funcionário novo
  nome: string;
  funcao: string;
  telefone: string;
};

const FORMULARIO_VAZIO: Formulario = {
  id: null,
  nome: "",
  funcao: FUNCOES_PADRAO[0],
  telefone: "",
};

async function buscarFuncionarios(): Promise<{ dados: Funcionario[]; erro: string | null }> {
  const { data, error } = await supabase()
    .from("funcionarios")
    .select("id, nome, funcao, telefone, cpf, ativo")
    .order("nome");
  return { dados: (data ?? []) as Funcionario[], erro: error?.message ?? null };
}

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Atualiza a lista na tela a partir do banco.
  const aplicarResultado = useCallback((r: Awaited<ReturnType<typeof buscarFuncionarios>>) => {
    if (r.erro) setErro(`Não foi possível carregar a equipe: ${r.erro}`);
    else {
      setErro(null);
      setFuncionarios(r.dados);
    }
    setCarregando(false);
  }, []);

  const carregar = useCallback(async () => {
    aplicarResultado(await buscarFuncionarios());
  }, [aplicarResultado]);

  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    let cancelado = false;
    buscarFuncionarios().then((r) => {
      if (!cancelado) aplicarResultado(r);
    });
    return () => {
      cancelado = true;
    };
  }, [aplicarResultado]);

  // Funções padrão + qualquer função que já exista no banco.
  const funcoes = useMemo(() => {
    const todas = new Set(FUNCOES_PADRAO);
    funcionarios.forEach((f) => todas.add(f.funcao));
    return Array.from(todas);
  }, [funcionarios]);

  const semVariaveis = !variaveisConfiguradas();
  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    if (!nome) {
      setErro("Preencha o nome do funcionário.");
      return;
    }
    setSalvando(true);
    const dados = {
      nome,
      funcao: formulario.funcao,
      telefone: formulario.telefone.trim() || null,
    };
    const db = supabase().from("funcionarios");
    const { error } = formulario.id
      ? await db.update(dados).eq("id", formulario.id)
      : await db.insert(dados);
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }
    setFormulario(null);
    await carregar();
  }

  async function mudarAtivo(funcionario: Funcionario, ativo: boolean) {
    if (!ativo && !confirm(`Desativar ${funcionario.nome}? Ele(a) deixa de aparecer na escala.`)) {
      return;
    }
    const { error } = await supabase()
      .from("funcionarios")
      .update({ ativo })
      .eq("id", funcionario.id);
    if (error) setErro(`Não foi possível atualizar: ${error.message}`);
    else await carregar();
  }

  function editar(f: Funcionario) {
    setErro(null);
    setFormulario({ id: f.id, nome: f.nome, funcao: f.funcao, telefone: f.telefone ?? "" });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && (
          <button
            className="botao w-full sm:w-auto"
            onClick={() => {
              setErro(null);
              setFormulario({ ...FORMULARIO_VAZIO });
            }}
          >
            + Adicionar funcionário
          </button>
        )}
      </div>

      {semVariaveis && (
        <p className="cartao border-red-300 text-red-700">
          As variáveis do Supabase não foram configuradas. Veja a tela Início.
        </p>
      )}
      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-4">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
            >
              {funcoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" className="botao flex-1" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              className="botao-secundario flex-1"
              onClick={() => setFormulario(null)}
              disabled={salvando}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {semVariaveis ? null : carregando ? (
        <p className="text-neutral-600">Carregando equipe...</p>
      ) : (
        <>
          <section className="space-y-3">
            {ativos.length === 0 && (
              <p className="text-neutral-600">Nenhum funcionário ativo.</p>
            )}
            {ativos.map((f) => (
              <CartaoFuncionario key={f.id} funcionario={f}>
                <button className="botao-secundario flex-1" onClick={() => editar(f)}>
                  Editar
                </button>
                <button
                  className="botao-secundario flex-1 !border-red-600 !text-red-700"
                  onClick={() => mudarAtivo(f, false)}
                >
                  Desativar
                </button>
              </CartaoFuncionario>
            ))}
          </section>

          {inativos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-neutral-600">Desativados</h2>
              {inativos.map((f) => (
                <CartaoFuncionario key={f.id} funcionario={f} apagado>
                  <button className="botao-secundario flex-1" onClick={() => editar(f)}>
                    Editar
                  </button>
                  <button className="botao flex-1" onClick={() => mudarAtivo(f, true)}>
                    Reativar
                  </button>
                </CartaoFuncionario>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CartaoFuncionario({
  funcionario,
  apagado,
  children,
}: {
  funcionario: Funcionario;
  apagado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`cartao ${apagado ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">{funcionario.nome}</p>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
          {funcionario.funcao}
        </span>
      </div>
      {funcionario.telefone ? (
        <a href={`tel:${funcionario.telefone}`} className="mt-1 block text-neutral-700 underline">
          {funcionario.telefone}
        </a>
      ) : (
        <p className="mt-1 text-neutral-500">Sem telefone</p>
      )}
      <div className="mt-3 flex gap-2">{children}</div>
    </div>
  );
}
