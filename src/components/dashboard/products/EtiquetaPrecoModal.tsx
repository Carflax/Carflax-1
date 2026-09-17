import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ListPlus, Loader2, Minus, Plus, Printer, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { AjustesImpressoraEtiqueta } from "./AjustesImpressoraEtiqueta";
import { useNotification } from "@/hooks/useNotification";
import {
  definirImpressoraEtiquetaPreco,
  imprimirEtiquetasPreco,
  impressoraEtiquetaPreco,
  listarImpressorasLocais,
  type ImpressoraLocal,
} from "@/lib/impressao-local";

// Etiqueta de preço da loja: rolo amarelo térmico de 50×30 mm, igual à que já é
// colada nos produtos. Descrição em 2 linhas, preço no crédito (à vista no
// crédito) numa faixa preta, preço à vista (débito/dinheiro) na faixa de baixo e
// o código do produto no rodapé. A impressora só imprime preto: o amarelo é o
// papel, então "letra amarela" na faixa é área sem tinta.
//
// Imprime em lote: uma lista de produtos, cada um com a sua quantidade. A
// impressora da loja usa sempre rolo de 2 colunas: cada linha tem 2 etiquetas
// lado a lado (a última pode sair com uma só). A impressão vai pelo servidor de
// impressão local (src/lib/impressao-local.ts), sem a janela do Windows; o
// servidor desenha o mesmo layout (etiquetas-main/etiqueta-preco-tspl.js). A
// posição e a escuridão se ajustam em "Ajustar impressão" e ficam no Supabase.

export interface ProdutoEtiqueta {
  cod: string;
  desc: string;
  debit: number;
  credit: number;
}

interface ItemLista { produto: ProdutoEtiqueta; quantidade: number }

const LARGURA_MM = 50;
const ALTURA_MM = 30;
const COLUNAS = 2;
const ESPACO_COLUNAS_MM = 3; // vão entre as duas colunas do rolo
const LARGURA_PAGINA_MM = LARGURA_MM * COLUNAS + ESPACO_COLUNAS_MM;
const MAX_POR_ITEM = 200;
const MAX_FILTRADOS = 100;
const ZOOM_PREVIEW = 0.82; // pré-visualização do rolo reduzida para caber na janela

const fmtValor = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function Etiqueta({ produto, papel }: { produto: ProdutoEtiqueta; papel: string }) {
  const faixa = (valor: number) => (
    <div style={{ background: "#000", color: papel, height: "7.6mm", borderRadius: "0.6mm", position: "relative", padding: "0 1.4mm" }}>
      <span style={{ position: "absolute", left: "1.2mm", top: "0.5mm", fontSize: "7.5pt", fontWeight: 700, lineHeight: 1 }}>R$</span>
      <span style={{ position: "absolute", right: "1.2mm", bottom: "0.2mm", fontSize: "18pt", fontWeight: 700, lineHeight: 1 }}>
        {fmtValor(valor)}
      </span>
    </div>
  );

  return (
    <div
      style={{
        width: `${LARGURA_MM}mm`,
        height: `${ALTURA_MM}mm`,
        background: papel,
        color: "#000",
        padding: "1.6mm 1.8mm 0.8mm",
        boxSizing: "border-box",
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: "6.7pt",
          fontWeight: 800,
          lineHeight: 1.15,
          textTransform: "uppercase",
          height: "5.9mm",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {produto.desc}
      </div>
      <div style={{ marginTop: "0.9mm" }}>{faixa(produto.credit)}</div>
      <div style={{ fontSize: "5pt", fontWeight: 700, textAlign: "right", lineHeight: 1, margin: "0.4mm 0.6mm 0.4mm 0" }}>À VISTA CRÉDITO</div>
      {faixa(produto.debit)}
      <div style={{ fontSize: "5pt", fontWeight: 700, lineHeight: 1, marginTop: "0.4mm" }}>{produto.cod}</div>
    </div>
  );
}

interface Props {
  /** Todos os produtos carregados na tela, para a busca. */
  produtos: ProdutoEtiqueta[];
  /** Recorte atual da tela (filtros aplicados), para adicionar de uma vez. */
  filtrados: ProdutoEtiqueta[];
  onClose: () => void;
}

export function EtiquetaPrecoModal({ produtos, filtrados, onClose }: Props) {
  const { showNotification } = useNotification();
  const [lista, setLista] = useState<ItemLista[]>([]);
  const [busca, setBusca] = useState("");
  const [impressoras, setImpressoras] = useState<ImpressoraLocal[] | null>(null);
  const [servidorErro, setServidorErro] = useState<string | null>(null);
  const [impressora, setImpressora] = useState(impressoraEtiquetaPreco);
  const [imprimindo, setImprimindo] = useState(false);
  const [ajustando, setAjustando] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Confere se o servidor de impressão está aberto e traz as impressoras do Windows.
  useEffect(() => {
    listarImpressorasLocais()
      .then((r) => { setServidorErro(null); setImpressoras(r); })
      .catch((e: Error) => { setServidorErro(e.message); setImpressoras([]); });
  }, []);

  const trocarImpressora = (nome: string) => {
    setImpressora(nome);
    definirImpressoraEtiquetaPreco(nome);
  };

  const imprimir = async () => {
    setImprimindo(true);
    try {
      const r = await imprimirEtiquetasPreco(lista.map((i) => ({ ...i.produto, quantidade: i.quantidade })));
      showNotification("success", "Etiquetas enviadas", `${r.etiquetas} etiqueta${r.etiquetas === 1 ? "" : "s"} para ${r.impressora || "a impressora padrão"}.`);
      onClose();
    } catch (e) {
      showNotification("error", "Não foi possível imprimir", (e as Error).message);
    } finally {
      setImprimindo(false);
    }
  };

  const resultados = useMemo(() => {
    const t = semAcento(busca.trim());
    if (t.length < 2) return [];
    const palavras = t.split(/\s+/);
    return produtos
      .filter((p) => { const alvo = semAcento(`${p.cod} ${p.desc}`); return palavras.every((w) => alvo.includes(w)); })
      .slice(0, 8);
  }, [busca, produtos]);

  const adicionar = (novos: ProdutoEtiqueta[]) => {
    // Sem mutar os itens da lista anterior: no StrictMode o updater roda duas vezes.
    setLista((atual) => {
      let proxima = atual;
      for (const p of novos) {
        proxima = proxima.some((i) => i.produto.cod === p.cod)
          ? proxima.map((i) => (i.produto.cod === p.cod ? { ...i, quantidade: Math.min(i.quantidade + 1, MAX_POR_ITEM) } : i))
          : [...proxima, { produto: p, quantidade: 1 }];
      }
      return proxima;
    });
    setBusca("");
  };

  const mudarQuantidade = (cod: string, qtd: number) =>
    setLista((atual) => atual.map((i) => (i.produto.cod === cod ? { ...i, quantidade: Math.min(Math.max(qtd, 0), MAX_POR_ITEM) } : i)));

  const remover = (cod: string) => {
    setLista((atual) => atual.filter((i) => i.produto.cod !== cod));
  };

  // Etiquetas em sequência, e uma "página" por linha do rolo (2 lado a lado).
  const etiquetas = lista.flatMap((i) => Array.from({ length: i.quantidade }, () => i.produto));
  const paginas = Array.from({ length: Math.ceil(etiquetas.length / COLUNAS) }, (_, i) => etiquetas.slice(i * COLUNAS, i * COLUNAS + COLUNAS));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
        <div
          className="w-full max-w-5xl h-[min(88vh,720px)] rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Printer className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-black uppercase tracking-tight">Etiquetas de preço</p>
                <p className="text-[11px] text-muted-foreground">Rolo térmico 50×30 mm · 2 colunas</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Produtos */}
            <section className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="px-5 pt-4 pb-3 space-y-3 shrink-0">
                <div className="flex items-center justify-between gap-2 h-7">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Produtos {lista.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-secondary text-foreground">{lista.length}</span>}
                  </p>
                  {filtrados.length > 0 && filtrados.length <= MAX_FILTRADOS && filtrados.length < produtos.length && (
                    <button onClick={() => adicionar(filtrados)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 whitespace-nowrap">
                      <ListPlus className="w-3.5 h-3.5" /> Adicionar {filtrados.length} filtrados
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar produto por código ou descrição"
                    className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  {resultados.length > 0 && (
                    <div className="absolute z-10 mt-1.5 w-full rounded-xl border border-border bg-popover shadow-2xl max-h-80 overflow-y-auto p-1">
                      {resultados.map((p) => (
                        <button key={p.cod} onClick={() => adicionar([p])} className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg hover:bg-secondary">
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase truncate">{p.desc}</p>
                            <p className="text-[11px] text-muted-foreground">Cód. {p.cod}</p>
                          </div>
                          <span className="text-xs font-black tabular-nums whitespace-nowrap">R$ {fmtValor(p.debit)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {busca.trim().length >= 2 && resultados.length === 0 && (
                    <p className="absolute z-10 mt-1.5 w-full rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-muted-foreground shadow-xl">Nenhum produto encontrado.</p>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
                {lista.length === 0 ? (
                  <div className="h-full min-h-[160px] rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-2 text-center p-6">
                    <Search className="w-6 h-6 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">Busque um produto para montar a lista de etiquetas.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lista.map((i) => (
                      <div key={i.produto.cod} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold uppercase truncate" title={i.produto.desc}>{i.produto.desc}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            Cód. {i.produto.cod}
                            <span className="mx-1.5 opacity-40">|</span>crédito <b className="text-foreground tabular-nums">R$ {fmtValor(i.produto.credit)}</b>
                            <span className="mx-1.5 opacity-40">|</span>à vista <b className="text-foreground tabular-nums">R$ {fmtValor(i.produto.debit)}</b>
                          </p>
                        </div>
                        <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
                          <button onClick={() => mudarQuantidade(i.produto.cod, i.quantidade - 1)} className="w-8 h-8 hover:bg-secondary flex items-center justify-center" title="Menos"><Minus className="w-3 h-3" /></button>
                          <input
                            inputMode="numeric"
                            value={i.quantidade || ""}
                            onChange={(e) => mudarQuantidade(i.produto.cod, Number(e.target.value.replace(/\D/g, "").slice(0, 3)))}
                            className="w-10 h-8 bg-transparent border-x border-border text-center text-xs font-black outline-none"
                          />
                          <button onClick={() => mudarQuantidade(i.produto.cod, i.quantidade + 1)} className="w-8 h-8 hover:bg-secondary flex items-center justify-center" title="Mais"><Plus className="w-3 h-3" /></button>
                        </div>
                        <button onClick={() => remover(i.produto.cod)} title="Tirar da lista" className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Rolo e impressão */}
            <aside className="md:w-[380px] shrink-0 min-h-0 flex flex-col border-t md:border-t-0 md:border-l border-border bg-secondary/20">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-2 shrink-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{ajustando ? "Ajustar impressão" : "Pré-visualização do rolo"}</p>
                <button
                  onClick={() => setAjustando((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${ajustando ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> {ajustando ? "Voltar" : "Ajustar impressão"}
                </button>
              </div>
              <div className="flex-1 min-h-[140px] overflow-y-auto px-5">
                {ajustando ? <AjustesImpressoraEtiqueta impressora={impressora} /> : (
                <div className="rounded-xl bg-slate-200 p-2.5 min-h-full">
                  {paginas.length === 0 ? (
                    <p className="text-[11px] text-slate-500 text-center py-10">As etiquetas aparecem aqui.</p>
                  ) : (
                    <div style={{ zoom: ZOOM_PREVIEW }} className="flex flex-col items-center gap-[2mm]">
                      {paginas.map((pagina, i) => (
                        <div key={i} className="flex" style={{ gap: `${ESPACO_COLUNAS_MM}mm`, width: `${LARGURA_PAGINA_MM}mm` }}>
                          {pagina.map((p, j) => (
                            <div key={j} className="rounded-[1.2mm] overflow-hidden shadow-sm">
                              <Etiqueta produto={p} papel="#facc15" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>
              <div className="p-5 space-y-3 border-t border-border shrink-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Etiquetas</span>
                  <b className="tabular-nums">{etiquetas.length}</b>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Linhas do rolo</span>
                  <b className="tabular-nums">{paginas.length}</b>
                </div>
                {etiquetas.length % COLUNAS === 1 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">A última linha sai com a coluna da direita vazia.</p>
                )}
                <label className="block space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Impressora</span>
                  <select
                    value={impressora}
                    onChange={(e) => trocarImpressora(e.target.value)}
                    disabled={!impressoras || !!servidorErro}
                    className="w-full h-9 px-2 rounded-lg border border-border bg-background text-xs outline-none disabled:opacity-50"
                  >
                    {/* Vazio: o servidor escolhe a etiquetadora Elgin L42 instalada, senão a padrão. */}
                    <option value="">
                      Automática{impressoras?.find((i) => /l42/i.test(i.name))
                        ? ` (${impressoras.find((i) => /l42/i.test(i.name))!.name})`
                        : impressoras?.find((i) => i.default) ? ` (${impressoras.find((i) => i.default)!.name})` : ""}
                    </option>
                    {(impressoras || []).map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
                    {impressora && impressoras && !impressoras.some((i) => i.name === impressora) && <option value={impressora}>{impressora}</option>}
                  </select>
                </label>
                {servidorErro && <p className="text-[11px] text-destructive leading-snug">{servidorErro}</p>}
                <button
                  onClick={imprimir}
                  disabled={etiquetas.length === 0 || imprimindo}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {imprimindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
