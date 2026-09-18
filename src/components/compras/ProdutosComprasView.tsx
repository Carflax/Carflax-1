import { useEffect, useRef, useState } from "react";
import { Search, Package, Mail, MessageCircle, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiComprasBuscarProdutos,
  apiComprasProdutoFornecedores,
  type ProdutoBusca,
  type ProdutoFornecedoresResponse,
  type ProdutoFornecedor,
} from "@/lib/api";

const brNum = (n: number, dec = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const brMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brData = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const soDigitos = (s: string) => s.replace(/\D/g, "");
// Celular BR com DDD (11 dígitos, 3º dígito 9) → dá para abrir no WhatsApp.
const ehCelular = (s: string) => {
  const d = soDigitos(s).replace(/^55(?=\d{11}$)/, "");
  return d.length === 11 && d[2] === "9";
};
const waLink = (s: string) => `https://wa.me/55${soDigitos(s).replace(/^55(?=\d{11}$)/, "")}`;

const STATUS: Record<string, { txt: string; dot: string }> = {
  RECEBIDO: { txt: "Recebido", dot: "bg-emerald-500" },
  ABERTO: { txt: "Em aberto", dot: "bg-blue-500" },
  NAO_RECEBIDO: { txt: "Não recebido", dot: "bg-muted-foreground/40" },
};

const HIST_INICIAL = 8;

function prazo(f: ProdutoFornecedor) {
  if (f.prazo_medio_item != null) {
    return { valor: `${brNum(f.prazo_medio_item, 0)}d`, hint: `${f.prazo_amostras_item} entrega(s) deste item` };
  }
  if (f.prazo_medio_geral != null) {
    return { valor: `~${brNum(f.prazo_medio_geral, 0)}d`, hint: `média geral do fornecedor (${f.prazo_pedidos_geral} pedidos em 12m)` };
  }
  return { valor: "—", hint: "sem histórico de entrega" };
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "green" | "blue" }) {
  return (
    <span className={cn(
      "px-1.5 py-px rounded text-[9px] font-medium leading-4",
      tone === "green" && "bg-emerald-500/10 text-emerald-500",
      tone === "blue" && "bg-primary/10 text-primary",
    )}>{children}</span>
  );
}

const iconBtn = "w-6 h-6 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors";

function Contato({ f }: { f: ProdutoFornecedor }) {
  const c = f.contato;
  // Cadastro às vezes guarda só o DDD ("11") — descarta o que não é telefone.
  const fones = [...new Set([c.whatsapp, c.celular, c.fone1, c.fone2].filter((t): t is string => !!t && soDigitos(t).length >= 8))];
  const email = c.email?.split(/[;,\s]/).find(Boolean) ?? null;
  const cel = fones.find(ehCelular);
  if (!fones.length && !email) return <span className="text-muted-foreground/60">—</span>;

  return (
    <div className="flex items-center gap-0.5 justify-end">
      {fones[0] && (
        <a href={`tel:${soDigitos(fones[0])}`} className="mr-1 tabular-nums text-foreground/80 hover:text-foreground whitespace-nowrap"
          title={[c.nome, ...fones].filter(Boolean).join("\n")}>
          {fones[0]}
          {fones.length > 1 && <span className="ml-1 text-muted-foreground">+{fones.length - 1}</span>}
        </a>
      )}
      {cel && (
        <a href={waLink(cel)} target="_blank" rel="noreferrer" title={`WhatsApp ${cel}`} className={cn(iconBtn, "hover:text-emerald-500")}>
          <MessageCircle className="w-3.5 h-3.5" />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} title={email} className={iconBtn}>
          <Mail className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

export function ProdutosComprasView() {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const [detalhe, setDetalhe] = useState<ProdutoFornecedoresResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [histTodos, setHistTodos] = useState(false);

  const seqBusca = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Busca com debounce; descarta respostas fora de ordem.
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const seq = ++seqBusca.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await apiComprasBuscarProdutos(q);
        if (seq === seqBusca.current) setResultados(r.data || []);
      } catch {
        if (seq === seqBusca.current) setResultados([]);
      } finally {
        if (seq === seqBusca.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, []);

  const selecionar = async (p: ProdutoBusca) => {
    setAberto(false);
    setBusca(p.produto);
    setCarregando(true);
    setErro(null);
    setHistTodos(false);
    try {
      const r = await apiComprasProdutoFornecedores(p.cod);
      if (!r.success) throw new Error(r.error || "Falha ao carregar histórico.");
      setDetalhe(r);
    } catch (e) {
      setDetalhe(null);
      setErro(e instanceof Error ? e.message : "Falha ao carregar histórico.");
    } finally {
      setCarregando(false);
    }
  };

  const melhor = detalhe?.fornecedores[0] ?? null;
  const historico = detalhe ? (histTodos ? detalhe.compras : detalhe.compras.slice(0, HIST_INICIAL)) : [];
  const th = "py-2 px-3 font-medium text-[10px] text-muted-foreground";

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
          {/* Cabeçalho + busca */}
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Produtos</h2>
              <p className="text-xs text-muted-foreground">Quem já nos vendeu, por quanto, em quantos dias e como falar com eles.</p>
            </div>

            <div ref={boxRef} className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
                onFocus={() => setAberto(true)}
                onKeyDown={(e) => { if (e.key === "Enter" && resultados[0]) selecionar(resultados[0]); }}
                placeholder="Nome, código, referência ou código de barras"
                className="w-full pl-8 pr-8 h-9 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition"
              />
              {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}

              {aberto && busca.trim().length >= 2 && !buscando && (
                <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto bg-card border border-border rounded-lg shadow-lg py-1">
                  {resultados.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto encontrado.</p>
                  ) : resultados.map((p) => (
                    <button key={p.cod} onClick={() => selecionar(p)}
                      className="w-full text-left px-3 py-1.5 hover:bg-secondary/60 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-foreground truncate">{p.produto}</p>
                        <p className="text-[10px] text-muted-foreground">
                          #{p.cod}{p.referencia ? ` · ${p.referencia}` : ""}{p.marca ? ` · ${p.marca}` : ""}
                        </p>
                      </div>
                      <span className={cn("shrink-0 text-[10px] tabular-nums", p.compras > 0 ? "text-muted-foreground" : "text-muted-foreground/50")}>
                        {p.compras > 0 ? `${p.compras} compras` : "nunca comprado"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico…
            </div>
          ) : erro ? (
            <p className="py-24 text-center text-xs text-rose-500">{erro}</p>
          ) : !detalhe ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
              <Package className="w-6 h-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Pesquise um produto para ver o histórico de fornecedores.</p>
            </div>
          ) : (
            <>
              {/* Resumo do produto */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-border/60">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{detalhe.produto.produto}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    #{detalhe.produto.cod}
                    {detalhe.produto.referencia ? ` · ref ${detalhe.produto.referencia}` : ""}
                    {detalhe.produto.marca ? ` · ${detalhe.produto.marca}` : ""}
                    {detalhe.produto.fornecedor_cadastro ? ` · cadastro: ${detalhe.produto.fornecedor_cadastro}` : ""}
                  </p>
                </div>
                <div className="flex gap-6 shrink-0 text-right">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Estoque</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">{detalhe.produto.saldo != null ? brNum(detalhe.produto.saldo) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Custo ERP</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">{detalhe.produto.custo_erp != null ? brMoney(detalhe.produto.custo_erp) : "—"}</p>
                  </div>
                  {melhor && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Melhor custo</p>
                      <p className="text-sm font-semibold text-emerald-500 tabular-nums">{brMoney(melhor.ultimo_custo_final)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Fornecedores */}
              <section className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-semibold text-foreground">
                    Fornecedores <span className="text-muted-foreground font-normal">· {detalhe.fornecedores.length}</span>
                  </h3>
                  <span className="text-[10px] text-muted-foreground">custos com IPI + ST</span>
                </div>
                <div className="rounded-xl border border-border/70 bg-card overflow-x-auto">
                  <table className="w-full text-xs min-w-[860px]">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className={cn(th, "text-left pl-4")}>Fornecedor</th>
                        <th className={cn(th, "text-right")}>Último</th>
                        <th className={cn(th, "text-right")}>Menor</th>
                        <th className={cn(th, "text-right")}>Médio</th>
                        <th className={cn(th, "text-right")}>Compras</th>
                        <th className={cn(th, "text-right")}>Prazo</th>
                        <th className={cn(th, "text-right")}>Última compra</th>
                        <th className={cn(th, "text-right pr-4")}>Contato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.fornecedores.length === 0 ? (
                        <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Nunca compramos este item por pedido de compra.</td></tr>
                      ) : detalhe.fornecedores.map((f) => {
                        const ehMelhor = melhor?.cod_fornecedor === f.cod_fornecedor;
                        const pz = prazo(f);
                        const temImposto = Math.abs(f.ultimo_custo_final - f.ultimo_custo_unit) >= 0.005;
                        return (
                          <tr key={f.cod_fornecedor} className={cn("border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors")}>
                            <td className="py-2 px-3 pl-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground truncate max-w-[220px]" title={f.razao_social || f.fornecedor}>{f.fornecedor}</span>
                                {ehMelhor && <Tag tone="green">melhor custo</Tag>}
                                {f.fornecedor_cadastro && <Tag tone="blue">cadastro</Tag>}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums" title={temImposto ? `${brMoney(f.ultimo_custo_unit)} sem impostos` : undefined}>
                              <span className={cn("font-medium", ehMelhor ? "text-emerald-500" : "text-foreground")}>{brMoney(f.ultimo_custo_final)}</span>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-foreground/80" title={`em ${brData(f.menor_custo_data)}`}>{brMoney(f.menor_custo_final)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-foreground/80">{brMoney(f.custo_medio_final)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-foreground/80" title={`${brNum(f.qtd_total)} unidades`}>{f.compras}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-foreground/80" title={pz.hint}>{pz.valor}</td>
                            <td className="py-2 px-3 text-right tabular-nums" title={f.ultima_cond_pag || undefined}>
                              <span className="text-foreground/80">{brData(f.ultima_compra)}</span>
                            </td>
                            <td className="py-1.5 px-3 pr-4"><Contato f={f} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Histórico */}
              {detalhe.compras.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">
                    Pedidos de compra <span className="text-muted-foreground font-normal">· {detalhe.compras.length}</span>
                  </h3>
                  <div className="rounded-xl border border-border/70 bg-card overflow-x-auto">
                    <table className="w-full text-xs min-w-[760px]">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className={cn(th, "text-left pl-4")}>Data</th>
                          <th className={cn(th, "text-left")}>Fornecedor</th>
                          <th className={cn(th, "text-left")}>Pedido</th>
                          <th className={cn(th, "text-right")}>Qtd</th>
                          <th className={cn(th, "text-right")}>Unit.</th>
                          <th className={cn(th, "text-right")}>c/ IPI + ST</th>
                          <th className={cn(th, "text-right")}>Prazo</th>
                          <th className={cn(th, "text-left")}>Pagamento</th>
                          <th className={cn(th, "text-left pr-4")}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map((c, i) => {
                          const st = STATUS[c.status];
                          return (
                            <tr key={`${c.empresa}-${c.pedido}-${i}`} className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                              <td className="py-1.5 px-3 pl-4 tabular-nums text-foreground/80">{brData(c.data_pedido)}</td>
                              <td className="py-1.5 px-3 text-foreground">{c.fornecedor}</td>
                              <td className="py-1.5 px-3 tabular-nums text-muted-foreground">{c.empresa}·{c.pedido.replace(/^0+/, "")}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-foreground/80">{brNum(c.qtd)}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-foreground/80">{brMoney(c.custo_unit)}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums font-medium text-foreground">{brMoney(c.custo_final)}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-foreground/80">{c.prazo_dias != null ? `${c.prazo_dias}d` : "—"}</td>
                              <td className="py-1.5 px-3 text-muted-foreground truncate max-w-[160px]">{c.cond_pag || "—"}</td>
                              <td className="py-1.5 px-3 pr-4">
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                  <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />{st.txt}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {detalhe.compras.length > HIST_INICIAL && (
                      <button onClick={() => setHistTodos((v) => !v)}
                        className="w-full py-2 border-t border-border/60 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 transition-colors">
                        {histTodos ? "Mostrar menos" : `Ver todos os ${detalhe.compras.length}`}
                        <ChevronDown className={cn("w-3 h-3 transition-transform", histTodos && "rotate-180")} />
                      </button>
                    )}
                  </div>
                </section>
              )}

              <p className="text-[10px] text-muted-foreground/70">
                Prazo = entrega registrada no pedido − data do pedido; é uma estimativa. Passe o mouse nos valores para ver detalhes.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
