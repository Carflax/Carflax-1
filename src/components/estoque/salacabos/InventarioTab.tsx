import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarraFiltros, Carregando, Filtro, Vazio } from "./ui";
import {
  fmtMetros,
  salaCabosApi,
  type InventarioLinha,
  type ProdutoCabo,
} from "./sala-cabos-api";

// Inventário da sala de cabos: o gestor conta cada cabo separando o que está na
// bobina do que está picado. A última contagem aparece para quem vai cortar.

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function InventarioTab({ barraFiltros }: { barraFiltros?: HTMLElement | null }) {
  const [linhas, setLinhas] = useState<InventarioLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [contando, setContando] = useState<ProdutoCabo | "novo" | null>(null);

  const carregar = useCallback(() => {
    salaCabosApi.inventario()
      .then((r) => { setErro(null); setLinhas(r); })
      .catch((e: Error) => { setErro(e.message); setLinhas([]); });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const f = semAcento(filtro.trim());
    return (linhas || []).filter((l) => !f || semAcento(`${l.cod_produto} ${l.descricao}`).includes(f));
  }, [linhas, filtro]);

  return (
    <div className="space-y-4">
      <BarraFiltros alvo={barraFiltros}>
        <Filtro valor={filtro} onChange={setFiltro} placeholder="Código ou cabo" />
        <button onClick={() => setContando("novo")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Fazer inventário
        </button>
      </BarraFiltros>
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {!linhas ? <Carregando /> : lista.length === 0 ? (
        <Vazio texto="Nenhum cabo inventariado ainda. Clique em Fazer inventário para contar o primeiro." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Cabo</th>
                <th className="text-right px-3 py-2 font-bold whitespace-nowrap">Na bobina</th>
                <th className="text-right px-3 py-2 font-bold whitespace-nowrap">Picado</th>
                <th className="text-right px-3 py-2 font-bold whitespace-nowrap">Cortado desde</th>
                <th className="text-right px-3 py-2 font-bold whitespace-nowrap">Disponível ERP</th>
                <th className="text-left px-3 py-2 font-bold whitespace-nowrap">Contagem</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.cod_produto} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-3 py-2 min-w-[260px]"><p className="font-semibold">{l.descricao}</p><p className="text-muted-foreground">Cód. {l.cod_produto}</p></td>
                  {/* Saldo agora = contagem menos os cortes tirados de cada um depois dela. */}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <p className="tabular-nums font-black">{fmtMetros(l.saldo_bobina)}</p>
                    {l.saldo_bobina !== l.metros_bobina && <p className="text-[10px] text-muted-foreground">contado {fmtMetros(l.metros_bobina)}</p>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <p className="tabular-nums font-black">{fmtMetros(l.saldo_picado)}</p>
                    {l.saldo_picado !== l.metros_picado && <p className="text-[10px] text-muted-foreground">contado {fmtMetros(l.metros_picado)}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">{l.cortado_desde > 0 ? fmtMetros(l.cortado_desde) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMetros(l.disponivel_erp)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <p>{fmtDataHora(l.contado_em)}</p>
                    <p className="text-muted-foreground">{l.contado_por_nome}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setContando({ codigo: l.cod_produto, descricao: l.descricao, saldo_erp: l.saldo_erp, disponivel_erp: l.disponivel_erp, inventario: l })}
                      className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-bold hover:bg-secondary whitespace-nowrap"
                    >
                      Contar de novo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {contando && (
        <InventarioModal
          produtoInicial={contando === "novo" ? null : contando}
          onClose={() => setContando(null)}
          onSalvo={() => { setContando(null); carregar(); }}
        />
      )}
    </div>
  );
}

const campo = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30";
const paraNumero = (v: string) => Number(v.replace(",", "."));

function InventarioModal({ produtoInicial, onClose, onSalvo }: { produtoInicial: ProdutoCabo | null; onClose: () => void; onSalvo: () => void }) {
  const [produto, setProduto] = useState<ProdutoCabo | null>(produtoInicial);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoCabo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [bobina, setBobina] = useState("");
  const [picado, setPicado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  useEffect(() => {
    const t = busca.trim();
    const timer = setTimeout(() => {
      if (t.length < 2) { setResultados([]); setBuscando(false); return; }
      setBuscando(true);
      salaCabosApi.produtos(t)
        .then(setResultados)
        .catch((e: Error) => setErro(e.message))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const total = (paraNumero(bobina) || 0) + (paraNumero(picado) || 0);
  const preenchido = bobina !== "" && picado !== "" && !isNaN(paraNumero(bobina)) && !isNaN(paraNumero(picado));

  const salvar = async () => {
    if (!produto || !preenchido) return;
    setSalvando(true);
    setErro(null);
    try {
      await salaCabosApi.registrarInventario({
        cod_produto: produto.codigo,
        metros_bobina: paraNumero(bobina),
        metros_picado: paraNumero(picado),
        observacao: observacao.trim() || undefined,
      });
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ClipboardList className="w-5 h-5" /></div>
            <p className="text-sm font-black uppercase tracking-tight">Inventário de cabo</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {!produto ? (
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Cabo</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: flex 2,5 pt cobrecom" className={cn(campo, "pl-9")} />
                {buscando && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
              </div>
              {resultados.length > 0 && (
                <div className="rounded-xl border border-border divide-y divide-border/60 max-h-72 overflow-y-auto">
                  {resultados.map((r) => (
                    <button key={r.codigo} onClick={() => setProduto(r)} className="w-full text-left px-3 py-2.5 hover:bg-secondary/50">
                      <p className="text-sm font-semibold leading-tight">{r.descricao}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Cód. {r.codigo} · disponível {fmtMetros(r.disponivel_erp)}
                        {r.inventario && ` · último inventário: bobina ${fmtMetros(r.inventario.metros_bobina)}, picado ${fmtMetros(r.inventario.metros_picado)}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum cabo vendido a metro encontrado.</p>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-secondary/50 p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold leading-tight">{produto.descricao}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cód. {produto.codigo} · disponível no sistema <b className="text-foreground">{fmtMetros(produto.disponivel_erp)}</b>
                    {produto.saldo_erp !== produto.disponivel_erp && ` (físico ${fmtMetros(produto.saldo_erp)})`}
                  </p>
                </div>
                {!produtoInicial && (
                  <button onClick={() => { setProduto(null); setBobina(""); setPicado(""); }} className="text-[11px] font-bold text-primary whitespace-nowrap">Trocar</button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Na bobina (m)</span>
                  <input autoFocus inputMode="decimal" value={bobina} onChange={(e) => setBobina(e.target.value.replace(/[^\d,.]/g, ""))} className={cn(campo, "text-lg font-black")} />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Picado (m)</span>
                  <input inputMode="decimal" value={picado} onChange={(e) => setPicado(e.target.value.replace(/[^\d,.]/g, ""))} className={cn(campo, "text-lg font-black")} />
                </label>
              </div>

              {preenchido && (
                <p className={cn("text-xs font-semibold", Math.abs(total - produto.disponivel_erp) < 0.01 ? "text-emerald-600" : "text-amber-600")}>
                  Total contado {fmtMetros(total)} · sistema {fmtMetros(produto.disponivel_erp)}
                  {Math.abs(total - produto.disponivel_erp) >= 0.01 && ` · diferença de ${fmtMetros(Math.abs(total - produto.disponivel_erp))} ${total < produto.disponivel_erp ? "a menos" : "a mais"}`}
                </p>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Observação (opcional)</span>
                <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campo} />
              </label>

              {erro && <p className="text-xs font-semibold text-destructive">{erro}</p>}
              <button onClick={salvar} disabled={salvando || !preenchido} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar inventário
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
