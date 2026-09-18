import { useEffect, useRef, useState, useMemo } from "react";
import {
  Search,
  Package,
  Phone,
  Mail,
  MessageCircle,
  Trophy,
  Timer,
  Boxes,
  Loader2,
  History,
  Building2,
  X,
  Check,
  Receipt,
  LayoutList,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
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

const ehCelular = (s: string) => {
  const d = soDigitos(s).replace(/^55(?=\d{11}$)/, "");
  return d.length === 11 && d[2] === "9";
};

const waLink = (s: string) => `https://wa.me/55${soDigitos(s).replace(/^55(?=\d{11}$)/, "")}`;

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  RECEBIDO: {
    label: "Recebido",
    badgeCls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dotCls: "bg-emerald-500",
  },
  ABERTO: {
    label: "Em aberto",
    badgeCls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    dotCls: "bg-blue-500",
  },
  NAO_RECEBIDO: {
    label: "Não recebido",
    badgeCls: "bg-muted/80 text-muted-foreground border-border/60",
    dotCls: "bg-muted-foreground/50",
  },
};

function prazoTexto(f: ProdutoFornecedor) {
  if (f.prazo_medio_item != null) {
    return {
      valor: `${brNum(f.prazo_medio_item, 1)} dias`,
      hint: `${f.prazo_amostras_item} entrega(s) deste item`,
      curto: `${brNum(f.prazo_medio_item, 0)}d`,
    };
  }
  if (f.prazo_medio_geral != null) {
    return {
      valor: `${brNum(f.prazo_medio_geral, 1)} dias`,
      hint: `Média geral (${f.prazo_pedidos_geral} pedidos/12m)`,
      curto: `${brNum(f.prazo_medio_geral, 0)}d`,
    };
  }
  return { valor: "—", hint: "Sem histórico de entrega", curto: "—" };
}

function getIniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function ContatosCompactos({ f }: { f: ProdutoFornecedor }) {
  const c = f.contato;
  const [copiado, setCopiado] = useState<string | null>(null);

  const fones = useMemo(() => {
    return [...new Set([c.whatsapp, c.celular, c.fone1, c.fone2].filter((t): t is string => !!t && soDigitos(t).length >= 8))];
  }, [c.whatsapp, c.celular, c.fone1, c.fone2]);

  const copiar = (texto: string, rotulo: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(rotulo);
    setTimeout(() => setCopiado(null), 1800);
  };

  if (!fones.length && !c.email) {
    return <span className="text-xs text-muted-foreground/60 italic">Sem contato cadastrado</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.nome && (
        <span className="w-full text-[11px] font-medium text-muted-foreground truncate mb-0.5">
          {c.nome}
        </span>
      )}
      {fones.map((tel) => {
        const celular = ehCelular(tel);
        return (
          <div key={tel} className="inline-flex items-center gap-1">
            {celular ? (
              <a
                href={waLink(tel)}
                target="_blank"
                rel="noreferrer"
                title="Abrir conversa no WhatsApp"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-all hover:scale-[1.02] active:scale-95 shadow-2xs"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-emerald-500/20" />
                <span className="tabular-nums">{tel}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => copiar(soDigitos(tel), tel)}
                title="Clique para copiar telefone"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-secondary/80 hover:bg-secondary text-foreground border border-border/60 transition-all hover:scale-[1.02] active:scale-95"
              >
                {copiado === tel ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Phone className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="tabular-nums">{tel}</span>
              </button>
            )}
          </div>
        );
      })}

      {c.email && (
        <a
          href={`mailto:${c.email.split(/[;,\s]/)[0]}`}
          title={`Enviar e-mail para ${c.email}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-secondary/60 hover:bg-secondary text-foreground hover:text-primary border border-border/60 transition-colors max-w-[200px] truncate"
        >
          <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="truncate">{c.email.replace(/[;,\s]+$/, "")}</span>
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

  // Controles de visualização
  const [abaAtiva, setAbaAtiva] = useState<"fornecedores" | "pedidos">("fornecedores");
  const [modoVisualizacao, setModoVisualizacao] = useState<"tabela" | "cards">("cards");
  const [filtroStatusPedido, setFiltroStatusPedido] = useState<string>("TODOS");
  const [buscaHistorico, setBuscaHistorico] = useState("");

  const seqBusca = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    }, 280);
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

  const limparBusca = () => {
    setBusca("");
    setDetalhe(null);
    setResultados([]);
    setAberto(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const melhor = detalhe?.fornecedores[0] ?? null;

  // Estatísticas calculadas do produto
  const economiaMelhorCusto = useMemo(() => {
    if (!melhor || !detalhe?.produto.custo_erp || detalhe.produto.custo_erp <= 0) return null;
    const dif = detalhe.produto.custo_erp - melhor.ultimo_custo_final;
    const perc = (dif / detalhe.produto.custo_erp) * 100;
    return { dif, perc };
  }, [melhor, detalhe]);

  const pedidosFiltrados = useMemo(() => {
    if (!detalhe?.compras) return [];
    return detalhe.compras.filter((c) => {
      const passaStatus = filtroStatusPedido === "TODOS" || c.status === filtroStatusPedido;
      const q = buscaHistorico.toLowerCase().trim();
      const passaBusca =
        !q ||
        c.fornecedor.toLowerCase().includes(q) ||
        c.pedido.toLowerCase().includes(q) ||
        c.empresa.toLowerCase().includes(q);
      return passaStatus && passaBusca;
    });
  }, [detalhe?.compras, filtroStatusPedido, buscaHistorico]);

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="px-6 pt-5 pb-3 shrink-0 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                  Produtos & Fornecedores
                </h1>
                <p className="text-xs text-muted-foreground">
                  Compare fornecedores, histórico de compras, custos e prazos de entrega
                </p>
              </div>
            </div>
          </div>

          {/* Barra de Pesquisa Moderna */}
          <div ref={boxRef} className="relative w-full sm:w-96 md:w-[460px]">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                ref={inputRef}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setAberto(true);
                }}
                onFocus={() => setAberto(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resultados[0]) selecionar(resultados[0]);
                  if (e.key === "Escape") setAberto(false);
                }}
                placeholder="Pesquisar produto, código, ref ou barras..."
                className="w-full pl-10 pr-16 h-10.5 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all shadow-2xs"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {buscando ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : busca ? (
                  <button
                    type="button"
                    onClick={limparBusca}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Limpar pesquisa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80 bg-secondary/80 border border-border/60 rounded">
                    ↵ Enter
                  </kbd>
                )}
              </div>
            </div>

            {/* Dropdown de Autocomplete */}
            {aberto && busca.trim().length >= 2 && !buscando && (
              <div className="absolute z-30 mt-1.5 w-full max-h-96 overflow-y-auto bg-card/95 backdrop-blur-md border border-border/80 rounded-2xl shadow-xl p-1 animate-in fade-in-50 zoom-in-95 duration-100">
                {resultados.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nenhum produto localizado para "{busca}".
                  </div>
                ) : (
                  resultados.map((p) => (
                    <button
                      key={p.cod}
                      onClick={() => selecionar(p)}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-secondary/70 transition-colors flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {p.produto}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-secondary text-foreground/80 border border-border/40">
                            #{p.cod}
                          </span>
                          {p.referencia && <span>Ref: {p.referencia}</span>}
                          {p.marca && <span>• {p.marca}</span>}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs px-2.5 py-1 rounded-full font-medium tabular-nums",
                          p.compras > 0
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {p.compras > 0 ? `${p.compras} compras` : "Sem compras"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {carregando ? (
          <div className="flex flex-col items-center justify-center gap-4 py-28 text-center">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Carregando informações do produto...</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Buscando histórico de compras e custos de fornecedores
              </p>
            </div>
          </div>
        ) : erro ? (
          <div className="py-16 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
              <X className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-destructive">{erro}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Verifique a conexão ou tente pesquisar outro código.
            </p>
          </div>
        ) : !detalhe ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center max-w-lg mx-auto">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary shadow-inner">
                <Package className="w-10 h-10 stroke-[1.5]" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-card border border-border flex items-center justify-center text-emerald-500 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Consulte qualquer produto</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Digite o nome, código interno (#cód), referência ou código de barras no campo de busca acima para visualizar todos os fornecedores, custos históricos e prazos de entrega.
              </p>
            </div>
          </div>
        ) : (
          /* Visualização do Produto Selecionado */
          <div className="space-y-6">
            {/* HERO CARD - Informações do Produto & KPIs */}
            <div className="relative overflow-hidden bg-card border border-border/70 rounded-2xl p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Dados Cadastrais */}
                <div className="space-y-3 min-w-0 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-md bg-secondary text-foreground border border-border/70">
                      #{detalhe.produto.cod}
                    </span>
                    {detalhe.produto.referencia && (
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-secondary/80 text-muted-foreground border border-border/40">
                        Ref: {detalhe.produto.referencia}
                      </span>
                    )}
                    {detalhe.produto.marca && (
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                        {detalhe.produto.marca}
                      </span>
                    )}
                  </div>

                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug">
                      {detalhe.produto.produto}
                    </h2>
                    {detalhe.produto.fornecedor_cadastro && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span>Fornecedor no cadastro:</span>
                        <strong className="text-foreground/90 font-medium">
                          {detalhe.produto.fornecedor_cadastro}
                        </strong>
                      </p>
                    )}
                  </div>
                </div>

                {/* KPI Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
                  {/* Estoque */}
                  <div className="bg-secondary/40 border border-border/60 rounded-xl p-3.5 min-w-[130px]">
                    <div className="flex items-center justify-between text-muted-foreground mb-1">
                      <span className="text-[11px] font-medium uppercase tracking-wider">Estoque</span>
                      <Boxes className="w-4 h-4" />
                    </div>
                    <p className="text-xl font-bold text-foreground tabular-nums">
                      {detalhe.produto.saldo != null ? brNum(detalhe.produto.saldo) : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">unidades atuais</p>
                  </div>

                  {/* Custo no ERP */}
                  <div className="bg-secondary/40 border border-border/60 rounded-xl p-3.5 min-w-[140px]">
                    <div className="flex items-center justify-between text-muted-foreground mb-1">
                      <span className="text-[11px] font-medium uppercase tracking-wider">Custo ERP</span>
                      <Receipt className="w-4 h-4" />
                    </div>
                    <p className="text-xl font-bold text-foreground tabular-nums">
                      {detalhe.produto.custo_erp != null ? brMoney(detalhe.produto.custo_erp) : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">custo cadastrado</p>
                  </div>

                  {/* Melhor Custo Histórico */}
                  {melhor && (
                    <div className="col-span-2 sm:col-span-1 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 min-w-[150px]">
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5" /> Melhor Custo
                        </span>
                        {economiaMelhorCusto && economiaMelhorCusto.perc > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                            -{economiaMelhorCusto.perc.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {brMoney(melhor.ultimo_custo_final)}
                      </p>
                      <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5 truncate font-medium" title={melhor.fornecedor}>
                        {melhor.fornecedor}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* BARRA DE NAVEGAÇÃO / ABAS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAbaAtiva("fornecedores")}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                    abaAtiva === "fornecedores"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Fornecedores</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                      abaAtiva === "fornecedores"
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {detalhe.fornecedores.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAbaAtiva("pedidos")}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                    abaAtiva === "pedidos"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <History className="w-4 h-4" />
                  <span>Histórico de Pedidos</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                      abaAtiva === "pedidos"
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {detalhe.compras.length}
                  </span>
                </button>
              </div>

              {/* Ações contextuais da aba ativa */}
              {abaAtiva === "fornecedores" ? (
                <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border/50 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("cards")}
                    className={cn(
                      "p-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                      modoVisualizacao === "cards"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Visualizar em Cards"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("tabela")}
                    className={cn(
                      "p-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                      modoVisualizacao === "tabela"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Visualizar em Tabela"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tabela</span>
                  </button>
                </div>
              ) : (
                /* Filtros para Histórico de Pedidos */
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={buscaHistorico}
                      onChange={(e) => setBuscaHistorico(e.target.value)}
                      placeholder="Filtrar pedido ou fornecedor..."
                      className="pl-8 pr-3 h-8 text-xs rounded-lg bg-card border border-border/70 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary w-48"
                    />
                  </div>

                  <select
                    value={filtroStatusPedido}
                    onChange={(e) => setFiltroStatusPedido(e.target.value)}
                    className="h-8 px-2.5 text-xs font-medium rounded-lg bg-card border border-border/70 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="TODOS">Todos os status</option>
                    <option value="RECEBIDO">Recebidos</option>
                    <option value="ABERTO">Em aberto</option>
                    <option value="NAO_RECEBIDO">Não recebidos</option>
                  </select>
                </div>
              )}
            </div>

            {/* CONTEÚDO DA ABA 1: FORNECEDORES */}
            {abaAtiva === "fornecedores" && (
              <div className="space-y-4">
                {detalhe.fornecedores.length === 0 ? (
                  <div className="bg-card border border-border/70 rounded-2xl p-12 text-center">
                    <p className="text-sm font-semibold text-foreground">Nenhum fornecedor registrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ainda não constam compras cadastradas em pedidos para este item.
                    </p>
                  </div>
                ) : modoVisualizacao === "tabela" ? (
                  /* Modo Tabela Moderna */
                  <div className="bg-card border border-border/70 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left border-collapse min-w-[960px]">
                        <thead>
                          <tr className="border-b border-border/60 bg-secondary/30 text-xs font-semibold text-muted-foreground">
                            <th className="py-3 px-4">Fornecedor</th>
                            <th className="py-3 px-3 text-right">Último Custo</th>
                            <th className="py-3 px-3 text-right">Menor Custo</th>
                            <th className="py-3 px-3 text-right">Custo Médio</th>
                            <th className="py-3 px-3 text-center">Compras</th>
                            <th className="py-3 px-3 text-center">Prazo Médio</th>
                            <th className="py-3 px-3 text-center">Última Compra</th>
                            <th className="py-3 px-4">Contatos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {detalhe.fornecedores.map((f) => {
                            const ehMelhor = melhor?.cod_fornecedor === f.cod_fornecedor;
                            const prazo = prazoTexto(f);
                            const iniciais = getIniciais(f.fornecedor);

                            return (
                              <tr
                                key={f.cod_fornecedor}
                                className={cn(
                                  "hover:bg-secondary/40 transition-colors group",
                                  ehMelhor && "bg-emerald-500/5 hover:bg-emerald-500/10"
                                )}
                              >
                                {/* Fornecedor */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={cn(
                                        "w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs font-bold transition-all shadow-2xs",
                                        ehMelhor
                                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                          : "bg-secondary text-muted-foreground border border-border/60 group-hover:border-primary/40 group-hover:text-primary"
                                      )}
                                    >
                                      {iniciais}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-foreground text-sm leading-tight">
                                          {f.fornecedor}
                                        </span>
                                        {ehMelhor && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                            <Trophy className="w-2.5 h-2.5" /> Melhor Custo
                                          </span>
                                        )}
                                        {f.fornecedor_cadastro && (
                                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                            Cadastro
                                          </span>
                                        )}
                                      </div>
                                      <p
                                        className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs"
                                        title={f.razao_social || ""}
                                      >
                                        <span className="font-mono text-[11px]">#{f.cod_fornecedor}</span>
                                        {f.razao_social && f.razao_social !== f.fornecedor ? ` · ${f.razao_social}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                {/* Último Custo */}
                                <td className="py-3.5 px-3 text-right tabular-nums">
                                  <span
                                    className={cn(
                                      "font-bold text-sm block",
                                      ehMelhor ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                                    )}
                                  >
                                    {brMoney(f.ultimo_custo_final)}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {brMoney(f.ultimo_custo_unit)} s/ imp.
                                  </span>
                                </td>

                                {/* Menor Custo */}
                                <td className="py-3.5 px-3 text-right tabular-nums">
                                  <span className="font-medium text-foreground text-sm block">
                                    {brMoney(f.menor_custo_final)}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {brData(f.menor_custo_data)}
                                  </span>
                                </td>

                                {/* Custo Médio */}
                                <td className="py-3.5 px-3 text-right tabular-nums font-medium text-foreground text-sm">
                                  {brMoney(f.custo_medio_final)}
                                </td>

                                {/* Compras Realizadas */}
                                <td className="py-3.5 px-3 text-center tabular-nums">
                                  <span className="font-semibold text-foreground text-sm block">{f.compras}</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {brNum(f.qtd_total)} un
                                  </span>
                                </td>

                                {/* Prazo Médio */}
                                <td className="py-3.5 px-3 text-center">
                                  <span className="inline-flex items-center gap-1 font-semibold text-foreground text-xs">
                                    <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                                    {prazo.valor}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground block">
                                    {prazo.hint}
                                  </span>
                                </td>

                                {/* Última Compra */}
                                <td className="py-3.5 px-3 text-center tabular-nums">
                                  <span className="font-medium text-foreground text-xs block">
                                    {brData(f.ultima_compra)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[90px] block mx-auto">
                                    {f.ultima_cond_pag || "—"}
                                  </span>
                                </td>

                                {/* Contatos com Ação Rápida */}
                                <td className="py-3.5 px-4">
                                  <ContatosCompactos f={f} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Modo Cards Modernos */
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {detalhe.fornecedores.map((f) => {
                      const ehMelhor = melhor?.cod_fornecedor === f.cod_fornecedor;
                      const prazo = prazoTexto(f);
                      const iniciais = getIniciais(f.fornecedor);

                      return (
                        <div
                          key={f.cod_fornecedor}
                          className={cn(
                            "bg-card border rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4 transition-all hover:shadow-sm",
                            ehMelhor
                              ? "border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                              : "border-border/70 hover:border-border"
                          )}
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                                    ehMelhor
                                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                      : "bg-secondary text-muted-foreground border border-border/70"
                                  )}
                                >
                                  {iniciais}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-bold text-foreground text-sm truncate leading-tight">
                                    {f.fornecedor}
                                  </h4>
                                  <p className="text-xs text-muted-foreground truncate">
                                    #{f.cod_fornecedor} {f.razao_social ? `· ${f.razao_social}` : ""}
                                  </p>
                                </div>
                              </div>
                              {ehMelhor && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                  <Trophy className="w-3 h-3" /> Melhor Custo
                                </span>
                              )}
                            </div>

                            {/* Grid de Custos */}
                            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50 text-center">
                              <div className="p-2 rounded-xl bg-secondary/40 border border-border/40">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase block">
                                  Último Custo
                                </span>
                                <span
                                  className={cn(
                                    "text-sm font-bold tabular-nums block mt-0.5",
                                    ehMelhor ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                                  )}
                                >
                                  {brMoney(f.ultimo_custo_final)}
                                </span>
                              </div>

                              <div className="p-2 rounded-xl bg-secondary/40 border border-border/40">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase block">
                                  Menor Custo
                                </span>
                                <span className="text-sm font-semibold text-foreground tabular-nums block mt-0.5">
                                  {brMoney(f.menor_custo_final)}
                                </span>
                              </div>

                              <div className="p-2 rounded-xl bg-secondary/40 border border-border/40">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase block">
                                  Prazo Médio
                                </span>
                                <span className="text-sm font-semibold text-foreground block mt-0.5">
                                  {prazo.curto}
                                </span>
                              </div>
                            </div>

                            {/* Informações adicionais */}
                            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {f.compras} compras ({brNum(f.qtd_total)} un)
                              </span>
                              <span>Última: {brData(f.ultima_compra)}</span>
                            </div>
                          </div>

                          {/* Contatos */}
                          <div className="pt-3 border-t border-border/50">
                            <ContatosCompactos f={f} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: HISTÓRICO DE PEDIDOS */}
            {abaAtiva === "pedidos" && (
              <div className="bg-card border border-border/70 rounded-2xl overflow-hidden shadow-2xs">
                <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Pedidos de Compra Registrados
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({pedidosFiltrados.length} de {detalhe.compras.length})
                    </span>
                  </div>
                  {filtroStatusPedido !== "TODOS" && (
                    <button
                      type="button"
                      onClick={() => setFiltroStatusPedido("TODOS")}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Limpar filtro de status
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-sm text-left border-collapse min-w-[900px]">
                    <thead className="sticky top-0 bg-card/95 backdrop-blur-xs z-10">
                      <tr className="border-b border-border/60 text-xs font-semibold text-muted-foreground bg-secondary/30">
                        <th className="py-3 px-4">Data</th>
                        <th className="py-3 px-3">Fornecedor</th>
                        <th className="py-3 px-3">Pedido ERP</th>
                        <th className="py-3 px-3 text-right">Qtd</th>
                        <th className="py-3 px-3 text-right">Custo Unit.</th>
                        <th className="py-3 px-3 text-right">C/ IPI + ST</th>
                        <th className="py-3 px-3 text-center">Prazo</th>
                        <th className="py-3 px-3">Pagamento</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {pedidosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                            Nenhum pedido encontrado com os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        pedidosFiltrados.map((c, i) => {
                          const st = STATUS_CONFIG[c.status] || {
                            label: c.status,
                            badgeCls: "bg-muted text-muted-foreground border-border",
                            dotCls: "bg-muted-foreground",
                          };

                          return (
                            <tr
                              key={`${c.empresa}-${c.pedido}-${i}`}
                              className="hover:bg-secondary/40 transition-colors"
                            >
                              <td className="py-2.5 px-4 tabular-nums text-xs font-medium text-foreground">
                                {brData(c.data_pedido)}
                              </td>
                              <td className="py-2.5 px-3 text-xs font-semibold text-foreground">
                                {c.fornecedor}
                              </td>
                              <td className="py-2.5 px-3 text-xs font-mono text-muted-foreground tabular-nums">
                                {c.empresa} · #{c.pedido.replace(/^0+/, "")}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-xs font-medium text-foreground">
                                {brNum(c.qtd)} {c.unidade || "un"}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-xs text-muted-foreground">
                                {brMoney(c.custo_unit)}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-xs font-bold text-foreground">
                                {brMoney(c.custo_final)}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums text-xs text-foreground">
                                {c.prazo_dias != null ? (
                                  <span className="font-medium">{c.prazo_dias}d</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-muted-foreground truncate max-w-[130px]">
                                {c.cond_pag || "—"}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border",
                                    st.badgeCls
                                  )}
                                >
                                  <span className={cn("w-1.5 h-1.5 rounded-full", st.dotCls)} />
                                  {st.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rodapé Informativo */}
            <p className="text-[11px] text-muted-foreground/80 px-1 leading-relaxed">
              Fonte dos dados: Pedidos de compra integrados ao ERP. O custo final inclui impostos (IPI e ST) informados no faturamento do pedido. O prazo em dias é calculado pela diferença entre a data do pedido e a previsão/entrega cadastrada.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
