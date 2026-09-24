import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Building2, Check, ChevronDown, ClipboardList, Loader2, LogOut, LayoutGrid, Minus, Package,
  Plus, Search, ShoppingCart, Trash2, User, X,
} from "lucide-react";
import {
  apiVendedorClientes, apiVendedorCondicoes, apiVendedorCriarPedido, apiVendedorEmpresas, apiVendedorFormas,
  apiVendedorPedidos, apiVendedorProdutos, apiVendedorStatus,
  type VendedorCliente, type VendedorCondicao, type VendedorEmpresa, type VendedorForma, type VendedorPedidoResumo,
  type VendedorProduto, type VendedorStatus,
} from "@/lib/api";
import type { UserProfile } from "@/App";

/**
 * Vendedor — tela de celular (/vendedor, sem a barra lateral do HUB) para o
 * vendedor montar e enviar orçamento (OR) e pedido (PD) direto do balcão/rua.
 *
 * Consulta (produtos, clientes, pagamento) vem do backend só-leitura; criar
 * grava na API oficial Autcom, no nome do próprio vendedor (operator_code).
 * O envio só funciona com VENDAS_HABILITADAS='true' no servidor — sem isso, é
 * um preview e o botão de enviar fica desativado.
 */

type Aba = "nova" | "meus";

interface ItemCarrinho {
  cod: string;
  produto: string;
  marca: string | null;
  quantidade: number;
  precoUnitario: number;
  precoOriginal: number;
  disponivel: number;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function VendedorView({ userProfile, onLogout }: { userProfile: UserProfile | null; onLogout: () => void }) {
  const [aba, setAba] = useState<Aba>("nova");
  const [menuAberto, setMenuAberto] = useState(false);
  const [status, setStatus] = useState<VendedorStatus | null>(null);
  const [acessoNegado, setAcessoNegado] = useState(false);

  // Venda em montagem
  const [cliente, setCliente] = useState<VendedorCliente | null>(null);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [especie, setEspecie] = useState<"OR" | "PD">("OR");
  const [condicao, setCondicao] = useState<VendedorCondicao | null>(null);
  const [forma, setForma] = useState<VendedorForma | null>(null);
  const [observacao, setObservacao] = useState("");

  // Listas de apoio
  const [condicoes, setCondicoes] = useState<VendedorCondicao[]>([]);
  const [formas, setFormas] = useState<VendedorForma[]>([]);
  const [empresas, setEmpresas] = useState<VendedorEmpresa[]>([]);
  const [empresa, setEmpresa] = useState("");

  const [busca, setBusca] = useState<null | "cliente" | "produto">(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const primeiroNome = (userProfile?.name || "").split(" ")[0] || "vendedor";
  const total = useMemo(() => itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0), [itens]);
  const qtdItens = useMemo(() => itens.reduce((s, i) => s + i.quantidade, 0), [itens]);

  useEffect(() => {
    document.title = "Carflax Vendas";
    apiVendedorStatus()
      .then((s) => {
        setStatus(s);
        // Empresa padrão do vendedor; só define se ele ainda não escolheu outra.
        setEmpresa((atual) => atual || s.empresaPadrao);
      })
      .catch((e) => {
        if (String(e?.message || e).includes("403")) setAcessoNegado(true);
      });
    apiVendedorCondicoes().then((r) => setCondicoes(r.condicoes)).catch(() => {});
    apiVendedorFormas().then((r) => setFormas(r.formas)).catch(() => {});
    apiVendedorEmpresas().then((r) => setEmpresas(r.empresas)).catch(() => {});
  }, []);

  const limparVenda = useCallback(() => {
    setCliente(null);
    setItens([]);
    setCondicao(null);
    setForma(null);
    setObservacao("");
    setEspecie("OR");
  }, []);

  const adicionarProduto = useCallback((p: VendedorProduto) => {
    setItens((prev) => {
      const existe = prev.find((i) => i.cod === p.cod);
      if (existe) return prev.map((i) => (i.cod === p.cod ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [
        ...prev,
        { cod: p.cod, produto: p.produto, marca: p.marca, quantidade: 1, precoUnitario: p.preco, precoOriginal: p.preco, disponivel: p.disponivel },
      ];
    });
  }, []);

  const mudarQtd = (cod: string, delta: number) =>
    setItens((prev) => prev.map((i) => (i.cod === cod ? { ...i, quantidade: Math.max(1, i.quantidade + delta) } : i)));
  const definirQtd = (cod: string, q: number) =>
    setItens((prev) => prev.map((i) => (i.cod === cod ? { ...i, quantidade: Math.max(1, q || 1) } : i)));
  const definirPreco = (cod: string, p: number) =>
    setItens((prev) => prev.map((i) => (i.cod === cod ? { ...i, precoUnitario: Math.max(0, p || 0) } : i)));
  const removerItem = (cod: string) => setItens((prev) => prev.filter((i) => i.cod !== cod));

  const podeEnviar = !!status?.podeEnviar && !!cliente && itens.length > 0 && !enviando;

  const enviar = async () => {
    if (!cliente || !itens.length) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await apiVendedorCriarPedido({
        especie,
        cliente: cliente.cod,
        itens: itens.map((i) => ({ cod: i.cod, descricao: i.produto, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
        codigoEmpresa: empresa || undefined,
        condicaoPagamento: condicao?.codigo,
        condicaoRepresentacao: condicao?.representacao || undefined,
        formaPagamento: forma?.codigo,
        observacao: observacao.trim() || undefined,
      });
      const tipo = especie === "OR" ? "Orçamento" : "Pedido";
      setAviso({ tipo: "ok", texto: `${tipo} ${r.numero ? `#${r.numero} ` : ""}enviado — ${brl(r.total)}.` });
      limparVenda();
      setAba("meus");
    } catch (e) {
      setAviso({ tipo: "erro", texto: String((e as Error)?.message || e).replace(/^\d+\s*/, "") || "Não foi possível enviar." });
    } finally {
      setEnviando(false);
    }
  };

  if (acessoNegado) {
    return (
      <Pagina>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
          <Package size={40} className="text-muted-foreground" />
          <p className="text-lg font-semibold">Acesso restrito</p>
          <p className="text-sm text-muted-foreground">Este app é para a equipe de vendas. Fale com o gestor se precisar de acesso.</p>
          <a href="/" className="mt-2 text-sm font-medium text-emerald-600">Abrir o HUB</a>
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {busca && (
        <BuscaOverlay
          modo={busca}
          onFechar={() => setBusca(null)}
          onCliente={(c) => { setCliente(c); setBusca(null); }}
          onProduto={(p) => { adicionarProduto(p); }}
        />
      )}

      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative flex min-w-0 items-center gap-3">
          <button onClick={() => setMenuAberto((v) => !v)} className="shrink-0 rounded-full" aria-label="Menu">
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-emerald-500/60" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 ring-2 ring-emerald-500/60">
                <User size={20} />
              </span>
            )}
          </button>
          <div className="min-w-0 leading-tight">
            <p className="text-[12px] text-muted-foreground">Vendas</p>
            <p className="truncate text-[16px] font-bold">{primeiroNome}</p>
          </div>
          {menuAberto && (
            <div className="absolute left-0 top-14 z-20 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <a href="/" className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted"><LayoutGrid size={16} /> Abrir o HUB</a>
              <button onClick={onLogout} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-muted"><LogOut size={16} /> Sair</button>
            </div>
          )}
        </div>
        {aba === "nova" && qtdItens > 0 && (
          <div className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1.5 text-right text-emerald-700 dark:text-emerald-300">
            <p className="text-[11px] leading-none">{qtdItens} {qtdItens === 1 ? "item" : "itens"}</p>
            <p className="text-[15px] font-bold leading-tight">{brl(total)}</p>
          </div>
        )}
      </header>

      {aviso && (
        <div
          className={`mt-1 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            aviso.tipo === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"
          }`}
        >
          {aviso.tipo === "ok" ? <Check size={18} className="mt-0.5 shrink-0" /> : <X size={18} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-52 pt-3">
        {aba === "nova" ? (
          <NovaVenda
            cliente={cliente}
            itens={itens}
            empresas={empresas}
            empresa={empresa}
            condicoes={condicoes}
            formas={formas}
            condicao={condicao}
            forma={forma}
            observacao={observacao}
            onEmpresa={setEmpresa}
            onBuscarCliente={() => setBusca("cliente")}
            onTrocarCliente={() => setCliente(null)}
            onBuscarProduto={() => setBusca("produto")}
            onQtd={mudarQtd}
            onDefinirQtd={definirQtd}
            onPreco={definirPreco}
            onRemover={removerItem}
            onCondicao={setCondicao}
            onForma={setForma}
            onObservacao={setObservacao}
          />
        ) : (
          <MeusPedidos />
        )}
      </div>

      {aba === "nova" && (
        <div className="fixed inset-x-0 bottom-[64px] z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-[720px]">
            {itens.length > 0 && (
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[13px] text-muted-foreground">Total · {qtdItens} {qtdItens === 1 ? "item" : "itens"}</span>
                <span className="text-[22px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">{brl(total)}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex rounded-full bg-muted p-1 text-[13px] font-semibold">
                {(["OR", "PD"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEspecie(e)}
                    className={`rounded-full px-3 py-1.5 transition-colors ${especie === e ? "bg-emerald-500 text-white" : "text-muted-foreground"}`}
                  >
                    {e === "OR" ? "Orçamento" : "Pedido"}
                  </button>
                ))}
              </div>
              <button
                onClick={enviar}
                disabled={!podeEnviar}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-[15px] font-bold text-white disabled:opacity-40"
              >
                {enviando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {status && !status.podeEnviar ? "Envio desativado" : `Enviar ${especie === "OR" ? "orçamento" : "pedido"}`}
              </button>
            </div>
          </div>
          {status && !status.podeEnviar && (
            <p className="mx-auto mt-1 max-w-[720px] text-center text-[11px] text-muted-foreground">
              O envio ao ERP está desativado no servidor (modo preview).
            </p>
          )}
        </div>
      )}

      <BottomNav aba={aba} onAba={setAba} carrinho={qtdItens} />
    </Pagina>
  );
}

// ── Nova venda: cliente + itens + pagamento ──────────────────────────────────
function NovaVenda(props: {
  cliente: VendedorCliente | null;
  itens: ItemCarrinho[];
  empresas: VendedorEmpresa[];
  empresa: string;
  condicoes: VendedorCondicao[];
  formas: VendedorForma[];
  condicao: VendedorCondicao | null;
  forma: VendedorForma | null;
  observacao: string;
  onEmpresa: (cod: string) => void;
  onBuscarCliente: () => void;
  onTrocarCliente: () => void;
  onBuscarProduto: () => void;
  onQtd: (cod: string, d: number) => void;
  onDefinirQtd: (cod: string, q: number) => void;
  onPreco: (cod: string, p: number) => void;
  onRemover: (cod: string) => void;
  onCondicao: (c: VendedorCondicao | null) => void;
  onForma: (f: VendedorForma | null) => void;
  onObservacao: (v: string) => void;
}) {
  const { cliente, itens, empresas, empresa, condicoes, formas, condicao, forma, observacao } = props;
  const [obsAberta, setObsAberta] = useState(false);
  return (
    <div className="space-y-4">
      {/* Empresa de faturamento (só aparece com mais de uma) */}
      {empresas.length > 1 && (
        <CampoSheet
          icone={<Building2 size={16} />}
          rotulo="Empresa"
          titulo="Empresa de faturamento"
          valorTexto={empresas.find((e) => e.codigo === empresa)?.nome || null}
          opcoes={empresas.map((e) => ({ valor: e.codigo, texto: e.nome, sub: `Empresa ${e.codigo}` }))}
          valor={empresa}
          onSelect={props.onEmpresa}
        />
      )}

      {/* Cliente */}
      <Secao titulo="Cliente" icone={<User size={16} />}>
        {cliente ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{cliente.nome}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {cliente.tipo} · {cliente.documento || `cód. ${cliente.cod}`}{cliente.bairro ? ` · ${cliente.bairro}` : ""}
              </p>
            </div>
            <button onClick={props.onTrocarCliente} className="shrink-0 text-[13px] font-medium text-emerald-600">Trocar</button>
          </div>
        ) : (
          <button
            onClick={props.onBuscarCliente}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3.5 text-left text-muted-foreground"
          >
            <Search size={18} /> Selecionar cliente
          </button>
        )}
      </Secao>

      {/* Itens */}
      <Secao titulo={`Itens${itens.length ? ` (${itens.length})` : ""}`} icone={<ShoppingCart size={16} />}>
        <div className="space-y-2">
          {itens.map((i) => (
            <div key={i.cod} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{i.produto}</p>
                  <p className="text-[11px] text-muted-foreground">
                    cód. {i.cod}{i.marca ? ` · ${i.marca}` : ""} · disp. {num(i.disponivel)}
                  </p>
                </div>
                <button onClick={() => props.onRemover(i.cod)} className="shrink-0 text-muted-foreground" aria-label="Remover"><Trash2 size={16} /></button>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex items-center rounded-full border border-border">
                  <button onClick={() => props.onQtd(i.cod, -1)} className="px-2.5 py-1.5" aria-label="Menos"><Minus size={14} /></button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={i.quantidade}
                    onChange={(e) => props.onDefinirQtd(i.cod, Number(e.target.value))}
                    className="w-12 bg-transparent text-center text-[14px] font-semibold outline-none"
                  />
                  <button onClick={() => props.onQtd(i.cod, 1)} className="px-2.5 py-1.5" aria-label="Mais"><Plus size={14} /></button>
                </div>
                <label className="flex items-center gap-1 text-[13px] text-muted-foreground">
                  R$
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={i.precoUnitario}
                    onChange={(e) => props.onPreco(i.cod, Number(e.target.value))}
                    className={`w-16 rounded-lg border border-border bg-transparent px-2 py-1 text-right text-[14px] font-semibold outline-none ${
                      i.precoUnitario < i.precoOriginal ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                    }`}
                  />
                </label>
                <p className="ml-auto shrink-0 text-right text-[14px] font-bold tabular-nums">{brl(i.precoUnitario * i.quantidade)}</p>
              </div>
            </div>
          ))}
          <button
            onClick={props.onBuscarProduto}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3.5 text-left text-muted-foreground"
          >
            <Plus size={18} /> Adicionar produto
          </button>
        </div>
      </Secao>

      {/* Pagamento */}
      <Secao titulo="Pagamento" icone={<ClipboardList size={16} />}>
        <div className="space-y-2.5">
          <CampoSheet
            rotulo="Condição"
            titulo="Condição de pagamento"
            placeholder="Escolher"
            valorTexto={condicao ? condicao.descricao || condicao.formatada || condicao.codigo : null}
            opcoes={condicoes.map((c) => ({
              valor: c.codigo,
              texto: c.descricao || c.formatada || c.codigo,
              sub: c.formatada || (c.parcelas ? `${c.parcelas}x` : undefined),
            }))}
            valor={condicao?.codigo || ""}
            onSelect={(cod) => props.onCondicao(condicoes.find((c) => c.codigo === cod) || null)}
          />
          <CampoSheet
            rotulo="Forma"
            titulo="Forma de pagamento"
            placeholder="Escolher"
            valorTexto={forma ? forma.descricao || forma.codigo : null}
            opcoes={formas.map((f) => ({ valor: f.codigo, texto: f.descricao || f.codigo }))}
            valor={forma?.codigo || ""}
            onSelect={(cod) => props.onForma(formas.find((f) => f.codigo === cod) || null)}
          />
          {obsAberta || observacao ? (
            <textarea
              value={observacao}
              onChange={(e) => props.onObservacao(e.target.value.slice(0, 60))}
              placeholder="Observação (até 60 caracteres)"
              rows={2}
              autoFocus={obsAberta && !observacao}
              className="w-full resize-none rounded-xl border border-border bg-card p-3 text-[14px] outline-none placeholder:text-muted-foreground"
            />
          ) : (
            <button
              onClick={() => setObsAberta(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3 text-left text-[13px] text-muted-foreground"
            >
              <Plus size={16} /> Observação
            </button>
          )}
        </div>
      </Secao>
    </div>
  );
}

// ── Meus pedidos/orçamentos ──────────────────────────────────────────────────
function MeusPedidos() {
  const [pedidos, setPedidos] = useState<VendedorPedidoResumo[] | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(() => {
    apiVendedorPedidos().then((r) => { setErro(false); setPedidos(r.pedidos); }).catch(() => setErro(true));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        Não foi possível carregar seus pedidos.
        <button onClick={carregar} className="mt-2 block w-full font-medium text-emerald-600">Tentar de novo</button>
      </div>
    );
  }
  if (!pedidos) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (!pedidos.length) return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum pedido ou orçamento nos últimos 60 dias.</p>;

  const cor = (s: string) =>
    s === "Cancelado" ? "text-red-500" : s === "Faturado" || s === "Convertido" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";

  return (
    <div className="space-y-2">
      {pedidos.map((p) => (
        <div key={`${p.empresa}-${p.especie}-${p.doc}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{p.cliente || `Cliente ${p.doc}`}</p>
            <p className="text-[11px] text-muted-foreground">
              {p.especie === "OR" ? "Orçamento" : "Pedido"} #{p.doc.replace(/^0+/, "")} · {formatarData(p.data)}
              {p.nota_fiscal ? ` · NF ${p.nota_fiscal}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[14px] font-bold tabular-nums">{brl(p.total)}</p>
            <p className={`text-[11px] font-medium ${cor(p.status)}`}>{p.status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Busca em tela cheia (cliente ou produto) ─────────────────────────────────
function BuscaOverlay({
  modo, onFechar, onCliente, onProduto,
}: {
  modo: "cliente" | "produto";
  onFechar: () => void;
  onCliente: (c: VendedorCliente) => void;
  onProduto: (p: VendedorProduto) => void;
}) {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<VendedorCliente[]>([]);
  const [produtos, setProdutos] = useState<VendedorProduto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [adicionados, setAdicionados] = useState<Set<string>>(new Set());

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) { setClientes([]); setProdutos([]); return; }
    setCarregando(true);
    const id = window.setTimeout(async () => {
      try {
        if (modo === "cliente") setClientes((await apiVendedorClientes(termo)).clientes);
        else setProdutos((await apiVendedorProdutos(termo)).produtos);
      } catch {
        /* mantém a lista anterior */
      } finally {
        setCarregando(false);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [q, modo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[max(env(safe-area-inset-top),12px)]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={onFechar} className="p-1.5" aria-label="Voltar"><ArrowLeft size={22} /></button>
        <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-3 py-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={modo === "cliente" ? "Buscar cliente por nome ou CPF/CNPJ" : "Buscar produto por nome ou código"}
            className="flex-1 bg-transparent text-[15px] outline-none"
          />
          {q && <button onClick={() => setQ("")} aria-label="Limpar"><X size={16} className="text-muted-foreground" /></button>}
        </div>
        {modo === "produto" && <button onClick={onFechar} className="px-2 text-[14px] font-semibold text-emerald-600">Pronto</button>}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {carregando && q.trim().length >= 2 && <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-muted-foreground" /></div>}
        {q.trim().length < 2 && <p className="py-10 text-center text-sm text-muted-foreground">Digite ao menos 2 caracteres.</p>}

        {modo === "cliente" && (
          <div className="space-y-2">
            {clientes.map((c) => (
              <button key={c.cod} onClick={() => onCliente(c)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.nome}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{c.tipo} · {c.documento || `cód. ${c.cod}`}{c.bairro ? ` · ${c.bairro}` : ""}</p>
                </div>
                <ArrowLeft size={16} className="shrink-0 rotate-180 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {modo === "produto" && (
          <div className="space-y-2">
            {produtos.map((p) => {
              const feito = adicionados.has(p.cod);
              return (
                <button
                  key={p.cod}
                  onClick={() => { onProduto(p); setAdicionados((s) => new Set(s).add(p.cod)); }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{p.produto}</p>
                    <p className="text-[11px] text-muted-foreground">cód. {p.cod}{p.marca ? ` · ${p.marca}` : ""} · disp. {num(p.disponivel)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[14px] font-bold tabular-nums">{brl(p.preco)}</span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${feito ? "bg-emerald-500 text-white" : "bg-emerald-500/15 text-emerald-600"}`}>
                      {feito ? <Check size={16} /> : <Plus size={16} />}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pequenos componentes ──────────────────────────────────────────────────────
function Secao({ titulo, icone, children }: { titulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-bold text-muted-foreground">{icone} {titulo}</h2>
      {children}
    </section>
  );
}

interface Opcao { valor: string; texto: string; sub?: string }

/**
 * Campo de seleção que abre um "bottom sheet" no tema do app, no lugar do
 * <select> nativo (que no iPhone abre uma caixa branca por cima da tela escura).
 */
function CampoSheet({
  icone, rotulo, titulo, placeholder = "—", valorTexto, opcoes, valor, onSelect,
}: {
  icone?: ReactNode;
  rotulo: string;
  titulo: string;
  placeholder?: string;
  valorTexto: string | null;
  opcoes: Opcao[];
  valor: string;
  onSelect: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
      >
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground">{icone} {rotulo}</span>
        <span className={`ml-auto min-w-0 truncate text-[14px] ${valorTexto ? "font-semibold" : "text-muted-foreground"}`}>
          {valorTexto || placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
      </button>
      {aberto && (
        <BottomSheet titulo={titulo} onFechar={() => setAberto(false)}>
          {!opcoes.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma opção disponível.</p>}
          {opcoes.map((o) => {
            const ativo = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                onClick={() => { onSelect(o.valor); setAberto(false); }}
                className={`flex w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5 text-left last:border-0 ${ativo ? "bg-emerald-500/10" : ""}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[15px] ${ativo ? "font-bold text-emerald-700 dark:text-emerald-300" : ""}`}>{o.texto}</span>
                  {o.sub && <span className="block truncate text-[12px] text-muted-foreground">{o.sub}</span>}
                </span>
                {ativo && <Check size={18} className="shrink-0 text-emerald-500" />}
              </button>
            );
          })}
        </BottomSheet>
      )}
    </>
  );
}

function BottomSheet({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <style>{"@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}"}</style>
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onFechar} />
      <div
        style={{ animation: "sheetUp .22s ease-out" }}
        className="relative max-h-[72vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),12px)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h3 className="text-[15px] font-bold">{titulo}</h3>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-muted-foreground"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ABAS: { id: Aba; rotulo: string; Icone: typeof ShoppingCart }[] = [
  { id: "nova", rotulo: "Nova venda", Icone: ShoppingCart },
  { id: "meus", rotulo: "Meus pedidos", Icone: ClipboardList },
];

function BottomNav({ aba, onAba, carrinho }: { aba: Aba; onAba: (a: Aba) => void; carrinho: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch gap-1 border-t border-border bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-2 backdrop-blur">
      {ABAS.map(({ id, rotulo, Icone }) => {
        const ativo = aba === id;
        return (
          <button
            key={id}
            onClick={() => onAba(id)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-medium transition-colors ${ativo ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
          >
            <Icone size={22} strokeWidth={ativo ? 2.4 : 1.8} />
            {rotulo}
            {id === "nova" && carrinho > 0 && (
              <span className="absolute right-6 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{carrinho}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function Pagina({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-[720px] flex-col px-4 pt-[max(env(safe-area-inset-top),12px)]">{children}</div>
    </div>
  );
}

function formatarData(iso: string | null) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a.slice(2)}` : iso;
}
