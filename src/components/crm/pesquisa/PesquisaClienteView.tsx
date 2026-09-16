import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  MapPin,
  Package,
  Phone,
  ScanSearch,
  Search,
  ShoppingBag,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiBuscarClientesErp,
  apiRelatorioCliente,
  type ClienteErpBusca,
  type RelatorioCliente,
} from "@/lib/api";

// ── Formatação ───────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtBRLCompact = (v: number) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return fmtBRL(n);
};

const fmtNum = (v: number, casas = 0) =>
  (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });

// "2026-09-16" → "16/09/2026" sem passar por Date (evita cair no dia anterior em UTC-3).
const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : "—";
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

type Aba = "geral" | "produtos" | "pedidos";

// ── Componentes pequenos ─────────────────────────────────────────────────────
function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-black mt-1 tabular-nums">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { mes: string; valor: number; pedidos: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-bold">{fmtMes(p.mes)}</p>
      <p>{fmtBRL(p.valor)}</p>
      <p className="text-muted-foreground">{p.pedidos} pedido(s)</p>
    </div>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
export function PesquisaClienteView() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteErpBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioCliente | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("geral");
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroPedido, setFiltroPedido] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const buscaSeq = useRef(0);
  const relatorioSeq = useRef(0);

  // Busca com debounce. Código puro vale com qualquer tamanho; nome a partir de 3 letras.
  useEffect(() => {
    const t = termo.trim();
    const seq = ++buscaSeq.current;
    const timer = setTimeout(() => {
      if (!t || (t.length < 3 && !/^\d+$/.test(t))) {
        setResultados([]);
        setBuscando(false);
        return;
      }
      setBuscando(true);
      apiBuscarClientesErp(t)
        .then((r) => { if (seq === buscaSeq.current) { setResultados(r); setListaAberta(true); } })
        .catch(() => { if (seq === buscaSeq.current) setResultados([]); })
        .finally(() => { if (seq === buscaSeq.current) setBuscando(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [termo]);

  const abrirCliente = (codigo: string) => {
    const seq = ++relatorioSeq.current;
    setListaAberta(false);
    setCarregando(true);
    setErro(null);
    setRelatorio(null);
    setAba("geral");
    setFiltroProduto("");
    setFiltroPedido("");
    setAbertos(new Set());
    apiRelatorioCliente(codigo)
      .then((r) => { if (seq === relatorioSeq.current) setRelatorio(r); })
      .catch((e: Error) => {
        if (seq !== relatorioSeq.current) return;
        setErro(e.message.includes("404") ? "Cliente não encontrado." : "Não foi possível carregar o relatório. Tente novamente.");
      })
      .finally(() => { if (seq === relatorioSeq.current) setCarregando(false); });
  };

  const enviarBusca = () => {
    const t = termo.trim();
    // Enter com código puro abre direto; com nome, abre o primeiro resultado.
    if (/^\d+$/.test(t)) abrirCliente(t);
    else if (resultados.length > 0) abrirCliente(resultados[0].codigo);
  };

  const produtosFiltrados = useMemo(() => {
    if (!relatorio) return [];
    const f = semAcento(filtroProduto.trim());
    if (!f) return relatorio.produtos;
    return relatorio.produtos.filter((p) =>
      semAcento(`${p.codigo} ${p.descricao} ${p.marca}`).includes(f));
  }, [relatorio, filtroProduto]);

  const pedidosFiltrados = useMemo(() => {
    if (!relatorio) return [];
    const f = semAcento(filtroPedido.trim());
    if (!f) return relatorio.pedidos;
    return relatorio.pedidos.filter((p) =>
      semAcento(`${p.documento} ${p.vendedor} ${fmtData(p.data)}`).includes(f) ||
      p.itens.some((i) => semAcento(`${i.codigo} ${i.descricao} ${i.marca}`).includes(f)));
  }, [relatorio, filtroPedido]);

  const serieMensal = useMemo(() => {
    if (!relatorio?.meses.length) return [];
    // Preenche os meses sem compra com zero, do primeiro mês até hoje.
    const porMes = new Map(relatorio.meses.map((m) => [m.mes, m]));
    const out: { mes: string; valor: number; pedidos: number }[] = [];
    const [y0, m0] = relatorio.meses[0].mes.split("-").map(Number);
    const hoje = new Date();
    for (let d = new Date(y0, m0 - 1, 1); d <= hoje; d.setMonth(d.getMonth() + 1)) {
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = porMes.get(ym);
      out.push({ mes: ym, valor: m?.valor || 0, pedidos: m?.pedidos || 0 });
    }
    return out;
  }, [relatorio]);

  const exportarExcel = () => {
    if (!relatorio) return;
    const { cliente, resumo } = relatorio;
    const wb = XLSX.utils.book_new();
    const round = (v: number) => Math.round(v * 100) / 100;

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Código", cliente.codigo],
      ["Cliente", cliente.nome],
      ["CNPJ/CPF", cliente.documento || ""],
      ["Cidade", [cliente.cidade, cliente.uf].filter(Boolean).join(" - ")],
      ["Telefone", cliente.telefone || ""],
      [],
      ["Total comprado", round(resumo.total)],
      ["Margem", round(resumo.margem)],
      ["Pedidos", resumo.pedidos],
      ["Ticket médio", round(resumo.ticket_medio)],
      ["Produtos distintos", resumo.itens_distintos],
      ["Primeira compra", fmtData(resumo.primeira_compra)],
      ["Última compra", fmtData(resumo.ultima_compra)],
    ]), "Resumo");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(relatorio.produtos.map((p) => ({
      Código: p.codigo, Produto: p.descricao, Marca: p.marca, Quantidade: p.qtd,
      "Valor total": round(p.valor), Pedidos: p.pedidos,
      "Primeira compra": fmtData(p.primeira_compra), "Última compra": fmtData(p.ultima_compra),
    }))), "Produtos");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(relatorio.pedidos.flatMap((p) => p.itens.map((i) => ({
      Data: fmtData(p.data), Empresa: p.empresa, Documento: p.documento, Vendedor: p.vendedor,
      Código: i.codigo, Produto: i.descricao, Marca: i.marca, Quantidade: i.qtd,
      Unitário: round(i.unitario), Total: round(i.valor),
    })))), "Itens por pedido");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(relatorio.marcas.map((m) => ({
      Marca: m.marca, "Valor total": round(m.valor), Pedidos: m.pedidos, "Última compra": fmtData(m.ultima_compra),
    }))), "Marcas");

    const nome = cliente.nome.replace(/[\\/:*?"<>|]/g, "").slice(0, 40).trim();
    XLSX.writeFile(wb, `Cliente ${cliente.codigo} - ${nome}.xlsx`);
  };

  const togglePedido = (chave: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(chave)) n.delete(chave); else n.add(chave);
      return n;
    });

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-background text-foreground overflow-hidden">
      {/* Cabeçalho + busca */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ScanSearch className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-tight">Pesquisa do cliente</h1>
            <p className="text-[11px] text-muted-foreground">Tudo o que o cliente já comprou na Carflax.</p>
          </div>
        </div>

        <div className="relative mt-4 max-w-2xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onFocus={() => resultados.length > 0 && setListaAberta(true)}
            onBlur={() => setTimeout(() => setListaAberta(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && enviarBusca()}
            placeholder="Nome, código ou CNPJ/CPF do cliente"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          {buscando ? (
            <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : termo && (
            <button onClick={() => { setTermo(""); setResultados([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}

          {listaAberta && resultados.length > 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl max-h-80 overflow-y-auto">
              {resultados.map((c) => (
                <button
                  key={c.codigo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => abrirCliente(c.codigo)}
                  className="w-full text-left px-3 py-2.5 hover:bg-secondary border-b border-border/40 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold truncate">{c.nome}</span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">{c.codigo}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[c.documento, [c.cidade, c.uf].filter(Boolean).join("/"), c.ultima_compra ? `última compra ${fmtData(String(c.ultima_compra))}` : "sem compra registrada"]
                      .filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
            </div>
          )}
          {listaAberta && !buscando && resultados.length === 0 && termo.trim().length >= 3 && (
            <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl px-3 py-3 text-xs text-muted-foreground">
              Nenhum cliente encontrado.
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {carregando && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Montando o histórico de compras…
          </div>
        )}

        {erro && !carregando && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
        )}

        {!relatorio && !carregando && !erro && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground text-center gap-2">
            <ScanSearch className="w-10 h-10 opacity-30" />
            <p className="text-sm">Pesquise um cliente pelo nome ou pelo código.</p>
          </div>
        )}

        {relatorio && !carregando && (
          <div className="space-y-5">
            {/* Cartão do cliente */}
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-black">{relatorio.cliente.nome}</h2>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-secondary">{relatorio.cliente.codigo}</span>
                  {relatorio.cliente.tipo_pessoa && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{relatorio.cliente.tipo_pessoa}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                  {relatorio.cliente.documento && <span>{relatorio.cliente.documento}</span>}
                  {(relatorio.cliente.cidade || relatorio.cliente.endereco) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[relatorio.cliente.endereco, relatorio.cliente.bairro, [relatorio.cliente.cidade, relatorio.cliente.uf].filter(Boolean).join("/")].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {relatorio.cliente.telefone && (
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{relatorio.cliente.telefone}</span>
                  )}
                  {relatorio.vendedores[0] && (
                    <span className="flex items-center gap-1"><UserRound className="w-3 h-3" />Principal vendedor: {relatorio.vendedores[0].nome}</span>
                  )}
                </div>
              </div>
              {relatorio.resumo.pedidos > 0 && (
                <button onClick={exportarExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background hover:bg-secondary text-xs font-bold">
                  <Download className="w-3.5 h-3.5" /> Exportar Excel
                </button>
              )}
            </div>

            {relatorio.resumo.pedidos === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground text-center">
                Nenhuma compra faturada para este cliente.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <Kpi label="Total comprado" valor={fmtBRLCompact(relatorio.resumo.total)} sub={fmtBRL(relatorio.resumo.total)} />
                  <Kpi label="Pedidos" valor={fmtNum(relatorio.resumo.pedidos)} sub={`Ticket médio ${fmtBRLCompact(relatorio.resumo.ticket_medio)}`} />
                  <Kpi label="Margem" valor={`${relatorio.resumo.margem_pct.toFixed(1).replace(".", ",")}%`} sub={fmtBRLCompact(relatorio.resumo.margem)} />
                  <Kpi label="Produtos" valor={fmtNum(relatorio.resumo.itens_distintos)} sub={`${relatorio.resumo.marcas} marca(s)`} />
                  <Kpi label="Primeira compra" valor={fmtData(relatorio.resumo.primeira_compra)} sub={relatorio.resumo.intervalo_medio_dias != null ? `Compra a cada ~${relatorio.resumo.intervalo_medio_dias} dias` : undefined} />
                  <Kpi
                    label="Última compra"
                    valor={fmtData(relatorio.resumo.ultima_compra)}
                    sub={relatorio.resumo.dias_sem_comprar === 0 ? "Hoje" : `Há ${relatorio.resumo.dias_sem_comprar} dias`}
                  />
                </div>

                <div className="flex gap-1 overflow-x-auto">
                  {([
                    { id: "geral", label: "Visão geral", icon: Tag },
                    { id: "produtos", label: `Produtos (${relatorio.produtos.length})`, icon: Package },
                    { id: "pedidos", label: `Pedidos (${relatorio.resumo.pedidos})`, icon: ShoppingBag },
                  ] as const).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAba(a.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors",
                        aba === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <a.icon className="w-3.5 h-3.5" /> {a.label}
                    </button>
                  ))}
                </div>

                {aba === "geral" && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-border bg-card p-4">
                      <p className="text-xs font-black uppercase tracking-tight mb-3">Compras por mês</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={serieMensal} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.4} />
                            <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 9, fontWeight: 700, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tickFormatter={(v) => fmtBRLCompact(v)} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={60} />
                            <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--secondary))", opacity: 0.5 }} />
                            <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-5">
                      <Tabela
                        titulo="Por ano"
                        colunas={["Ano", "Valor", "Pedidos", "Margem"]}
                        linhas={relatorio.anos.map((a) => [String(a.ano), fmtBRL(a.valor), fmtNum(a.pedidos), fmtBRL(a.margem)])}
                      />
                      <Tabela
                        titulo="Marcas"
                        colunas={["Marca", "Valor", "Pedidos", "Última"]}
                        linhas={relatorio.marcas.map((m) => [m.marca, fmtBRL(m.valor), fmtNum(m.pedidos), fmtData(m.ultima_compra)])}
                      />
                      <Tabela
                        titulo="Vendedores"
                        colunas={["Vendedor", "Valor", "Pedidos", "Última"]}
                        linhas={relatorio.vendedores.map((v) => [v.nome, fmtBRL(v.valor), fmtNum(v.pedidos), fmtData(v.ultima_venda)])}
                      />
                    </div>
                  </div>
                )}

                {aba === "produtos" && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="p-3 border-b border-border/60">
                      <FiltroInput valor={filtroProduto} onChange={setFiltroProduto} placeholder="Filtrar por código, produto ou marca" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-secondary/50 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold">Código</th>
                            <th className="text-left px-3 py-2 font-bold">Produto</th>
                            <th className="text-left px-3 py-2 font-bold">Marca</th>
                            <th className="text-right px-3 py-2 font-bold">Qtd</th>
                            <th className="text-right px-3 py-2 font-bold">Valor</th>
                            <th className="text-right px-3 py-2 font-bold">Pedidos</th>
                            <th className="text-right px-3 py-2 font-bold whitespace-nowrap">1ª compra</th>
                            <th className="text-right px-3 py-2 font-bold whitespace-nowrap">Última</th>
                          </tr>
                        </thead>
                        <tbody>
                          {produtosFiltrados.map((p) => (
                            <tr key={p.codigo} className="border-t border-border/40 hover:bg-secondary/30">
                              <td className="px-3 py-2 font-mono text-muted-foreground">{p.codigo}</td>
                              <td className="px-3 py-2 font-semibold min-w-[220px]">{p.descricao}</td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{p.marca}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.qtd, 2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap">{fmtBRL(p.valor)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{p.pedidos}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmtData(p.primeira_compra)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmtData(p.ultima_compra)}</td>
                            </tr>
                          ))}
                          {produtosFiltrados.length === 0 && (
                            <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum produto com esse filtro.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {aba === "pedidos" && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="p-3 border-b border-border/60 space-y-2">
                      <FiltroInput valor={filtroPedido} onChange={setFiltroPedido} placeholder="Filtrar por documento, vendedor, data ou produto" />
                      {relatorio.pedidos_truncados && (
                        <p className="text-[11px] text-muted-foreground">
                          Mostrando os {relatorio.pedidos.length} pedidos mais recentes. Os totais e as abas acima consideram todos.
                        </p>
                      )}
                    </div>
                    <div className="divide-y divide-border/40">
                      {pedidosFiltrados.map((p) => {
                        const chave = `${p.empresa}|${p.documento}`;
                        const aberto = abertos.has(chave);
                        return (
                          <div key={chave}>
                            <button onClick={() => togglePedido(chave)} className="w-full flex items-center gap-3 px-3 py-2.5 text-xs hover:bg-secondary/30 text-left">
                              {aberto ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                              <span className="tabular-nums w-20 shrink-0">{fmtData(p.data)}</span>
                              <span className="font-mono text-muted-foreground shrink-0 hidden sm:inline">Emp {p.empresa}</span>
                              <span className="font-mono font-bold shrink-0">{p.documento.replace(/^0+/, "")}</span>
                              <span className="text-muted-foreground truncate flex-1 min-w-0">{p.vendedor}</span>
                              <span className="text-muted-foreground shrink-0 hidden sm:inline">{p.itens.length} item(ns)</span>
                              <span className="font-bold tabular-nums shrink-0 w-28 text-right">{fmtBRL(p.valor)}</span>
                            </button>
                            {aberto && (
                              <div className="bg-secondary/20 px-3 pb-3 overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead className="text-muted-foreground">
                                    <tr>
                                      <th className="text-left py-1.5 pr-3 font-bold">Código</th>
                                      <th className="text-left py-1.5 pr-3 font-bold">Produto</th>
                                      <th className="text-left py-1.5 pr-3 font-bold">Marca</th>
                                      <th className="text-right py-1.5 pr-3 font-bold">Qtd</th>
                                      <th className="text-right py-1.5 pr-3 font-bold">Unitário</th>
                                      <th className="text-right py-1.5 font-bold">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.itens.map((i, idx) => (
                                      <tr key={`${i.codigo}-${idx}`} className="border-t border-border/30">
                                        <td className="py-1.5 pr-3 font-mono text-muted-foreground">{i.codigo}</td>
                                        <td className="py-1.5 pr-3 min-w-[200px]">{i.descricao}</td>
                                        <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{i.marca}</td>
                                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(i.qtd, 2)}</td>
                                        <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{fmtBRL(i.unitario)}</td>
                                        <td className="py-1.5 text-right tabular-nums font-bold whitespace-nowrap">{fmtBRL(i.valor)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {pedidosFiltrados.length === 0 && (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum pedido com esse filtro.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FiltroInput({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-md">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: string[][] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <p className="text-xs font-black uppercase tracking-tight px-4 pt-4 pb-2">{titulo}</p>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50 text-muted-foreground sticky top-0">
            <tr>
              {colunas.map((c, i) => (
                <th key={c} className={cn("px-3 py-2 font-bold", i === 0 ? "text-left" : "text-right")}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, r) => (
              <tr key={r} className="border-t border-border/40">
                {l.map((v, i) => (
                  <td key={i} className={cn("px-3 py-2", i === 0 ? "font-semibold" : "text-right tabular-nums whitespace-nowrap")}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
