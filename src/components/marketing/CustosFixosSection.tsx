import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Loader2, X, Check } from "lucide-react";
import {
  apiSalvarCustoFixo,
  apiExcluirCustoFixo,
  type CustosFixosPeriodo,
  type CustoFixo,
} from "@/lib/api";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBr = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

const primeiroDiaDoMes = () => new Date().toISOString().slice(0, 8) + "01";

interface Props {
  custos?: CustosFixosPeriodo;
  /** recarrega os gastos depois de salvar/excluir */
  onChange: () => void;
}

interface Rascunho {
  id?: string;
  descricao: string;
  categoria: string;
  valorMensal: string;
  inicio: string;
  fim: string;
}

const VAZIO: Rascunho = {
  descricao: "",
  categoria: "Agência",
  valorMensal: "",
  inicio: primeiroDiaDoMes(),
  fim: "",
};

export function CustosFixosSection({ custos, onChange }: Props) {
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const itens = custos?.itens ?? [];
  const total = custos?.total ?? 0;

  const abrirEdicao = (c: CustoFixo) => {
    setErro(null);
    setEditando({
      id: c.id,
      descricao: c.descricao,
      categoria: c.categoria,
      valorMensal: String(c.valorMensal),
      inicio: c.inicio?.slice(0, 10) || primeiroDiaDoMes(),
      fim: c.fim?.slice(0, 10) || "",
    });
  };

  const salvar = async () => {
    if (!editando) return;
    // Aceita vírgula: quem digita valor em R$ escreve 3.000,00 sem pensar.
    const valor = Number(String(editando.valorMensal).replace(/\./g, "").replace(",", "."));
    if (!editando.descricao.trim()) return setErro("Informe a descrição.");
    if (!Number.isFinite(valor) || valor < 0) return setErro("Valor mensal inválido.");
    if (!editando.inicio) return setErro("Informe o início da vigência.");
    if (editando.fim && editando.fim < editando.inicio)
      return setErro("O fim da vigência é anterior ao início.");

    setSalvando(true);
    setErro(null);
    try {
      await apiSalvarCustoFixo({
        ...(editando.id ? { id: editando.id } : {}),
        descricao: editando.descricao.trim(),
        categoria: editando.categoria.trim() || "Agência",
        valor_mensal: valor,
        inicio: editando.inicio,
        fim: editando.fim || null,
      });
      setEditando(null);
      onChange();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (c: CustoFixo) => {
    if (!window.confirm(`Excluir "${c.descricao}"? Isso muda o investimento de todos os períodos.`))
      return;
    try {
      await apiExcluirCustoFixo(c.id);
      onChange();
    } catch {
      setErro("Falha ao excluir.");
    }
  };

  const campo =
    "w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary transition-colors";
  const rotulo = "text-[9px] font-black uppercase tracking-widest text-muted-foreground";

  return (
    <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-500" /> Custos Fixos
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
            Agência e ferramentas · rateado por dias no período
          </p>
        </div>
        <button
          onClick={() => {
            setErro(null);
            setEditando({ ...VAZIO });
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Novo custo
        </button>
      </div>

      {custos?.error && (
        <p className="text-[11px] font-bold text-rose-500 mb-3">
          Não foi possível carregar os custos fixos: {custos.error}
        </p>
      )}
      {erro && <p className="text-[11px] font-bold text-rose-500 mb-3">{erro}</p>}

      {editando && (
        <div className="border border-primary/30 bg-primary/5 rounded-2xl p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className={rotulo}>Descrição</label>
            <input
              value={editando.descricao}
              onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
              placeholder="Ex: Agência de tráfego"
              className={campo + " mt-1"}
            />
          </div>
          <div>
            <label className={rotulo}>Categoria</label>
            <input
              value={editando.categoria}
              onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}
              className={campo + " mt-1"}
            />
          </div>
          <div>
            <label className={rotulo}>Valor mensal</label>
            <input
              value={editando.valorMensal}
              onChange={(e) => setEditando({ ...editando, valorMensal: e.target.value })}
              placeholder="3000"
              inputMode="decimal"
              className={campo + " mt-1 text-right tabular-nums"}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={rotulo}>Início</label>
              <input
                type="date"
                value={editando.inicio}
                onChange={(e) => setEditando({ ...editando, inicio: e.target.value })}
                className={campo + " mt-1"}
              />
            </div>
            <div>
              <label className={rotulo}>Fim</label>
              <input
                type="date"
                value={editando.fim}
                onChange={(e) => setEditando({ ...editando, fim: e.target.value })}
                title="Deixe vazio se o custo ainda está ativo"
                className={campo + " mt-1"}
              />
            </div>
          </div>

          <div className="lg:col-span-5 flex items-center justify-end gap-2">
            <button
              onClick={() => setEditando(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {salvando ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Salvar
            </button>
          </div>
        </div>
      )}

      {itens.length === 0 && !editando ? (
        <div className="py-10 text-center">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            Nenhum custo fixo no período
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-sm mx-auto">
            Sem a agência e as ferramentas lançadas aqui, o investimento fica só com o que Meta e
            Google cobram — e o retorno do tráfego aparece melhor do que é.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Descrição", "Categoria", "Vigência"].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
                <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Valor mensal
                </th>
                <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  No período
                </th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/40 hover:bg-secondary/30 transition-colors group"
                >
                  <td className="py-2.5 px-2 font-bold text-foreground">{c.descricao}</td>
                  <td className="py-2.5 px-2">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500">
                      {c.categoria}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-muted-foreground font-bold tabular-nums">
                    {dataBr(c.inicio)}
                    {c.fim ? " – " + dataBr(c.fim) : " – ativo"}
                  </td>
                  <td className="py-2.5 px-2 text-right font-bold text-muted-foreground tabular-nums">
                    {brl(c.valorMensal)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-black text-foreground tabular-nums">
                    {brl(c.valorPeriodo)}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => abrirEdicao(c)}
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => excluir(c)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td
                  colSpan={4}
                  className="py-3 px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right"
                >
                  Total de custos fixos no período
                </td>
                <td className="py-3 px-2 text-right font-black text-amber-500 tabular-nums">
                  {brl(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
