import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Building2, Check, ChevronDown, ChevronRight, ClipboardList,
  FileText, LayoutGrid, Loader2, LogOut,
  Minus, Moon, Package, Plus, RefreshCw, Search, Share2,
  ShoppingCart, Smartphone, Sparkles, Sun, Trash2, User,
  UserPlus, Wallet, X,
} from "lucide-react";
import {
  apiVendedorClientes, apiVendedorCondicoes, apiVendedorCriarPedido, apiVendedorEmpresas, apiVendedorFormas,
  apiVendedorPedidos, apiVendedorProdutos, apiVendedorStatus,
  type VendedorCliente, type VendedorCondicao, type VendedorEmpresa, type VendedorForma, type VendedorPedidoResumo,
  type VendedorProduto, type VendedorStatus,
} from "@/lib/api";
import type { UserProfile } from "@/App";
import { useTheme } from "@/context/theme-provider";
import "./vendedor.css";

/**
 * Vendedor — Interface mobile-first 100% responsiva (PWA nativo)
 * para a equipe de vendas montar e transmitir orçamentos (OR) e pedidos (PD)
 * direto do balcão ou da rua.
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

const triggerHaptic = (tipo: "light" | "medium" | "success" = "light") => {
  try {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      if (tipo === "light") navigator.vibrate(10);
      else if (tipo === "medium") navigator.vibrate(25);
      else if (tipo === "success") navigator.vibrate([15, 30, 20]);
    }
  } catch {}
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function VendedorView({ userProfile, onLogout }: { userProfile: UserProfile | null; onLogout: () => void }) {
  const [aba, setAba] = useState<Aba>("nova");
  const [menuAberto, setMenuAberto] = useState(false);
  const [status, setStatus] = useState<VendedorStatus | null>(null);
  const [acessoNegado, setAcessoNegado] = useState(false);
  const { theme, setTheme } = useTheme();

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

  // PWA install banner state
  const [showPwaPrompt, setShowPwaPrompt] = useState(false);

  useEffect(() => {
    if (!isStandalone()) {
      const dismiss = sessionStorage.getItem("vendedor-pwa-dismiss");
      if (!dismiss) setShowPwaPrompt(true);
    }
  }, []);

  const primeiroNome = (userProfile?.name || "").split(" ")[0] || "Vendedor";
  const total = useMemo(() => itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0), [itens]);
  const qtdItens = useMemo(() => itens.reduce((s, i) => s + i.quantidade, 0), [itens]);

  useEffect(() => {
    document.title = "Carflax Vendas";
    apiVendedorStatus()
      .then((s) => {
        setStatus(s);
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
    triggerHaptic("light");
    setItens((prev) => {
      const existe = prev.find((i) => i.cod === p.cod);
      if (existe) return prev.map((i) => (i.cod === p.cod ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [
        ...prev,
        { cod: p.cod, produto: p.produto, marca: p.marca, quantidade: 1, precoUnitario: p.preco, precoOriginal: p.preco, disponivel: p.disponivel },
      ];
    });
  }, []);

  const mudarQtd = (cod: string, delta: number) => {
    triggerHaptic("light");
    setItens((prev) => prev.map((i) => (i.cod === cod ? { ...i, quantidade: Math.max(1, i.quantidade + delta) } : i)));
  };
  const definirQtd = (cod: string, q: number) =>
    setItens((prev) => prev.map((i) => (i.cod === cod ? { ...i, quantidade: Math.max(1, q || 1) } : i)));
  const definirPreco = (cod: string, p: number) =>
    setItens((prev) => prev.map((i) => (i.cod === cod ? { ...i, precoUnitario: Math.max(0, p || 0) } : i)));
  const removerItem = (cod: string) => {
    triggerHaptic("medium");
    setItens((prev) => prev.filter((i) => i.cod !== cod));
  };

  const podeEnviar = !!status?.podeEnviar && !!cliente && itens.length > 0 && !enviando;

  const enviar = async () => {
    if (!cliente || !itens.length) return;
    setEnviando(true);
    setAviso(null);
    triggerHaptic("medium");
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
      triggerHaptic("success");
      const tipo = especie === "OR" ? "Orçamento" : "Pedido";
      setAviso({ tipo: "ok", texto: `${tipo} ${r.numero ? `#${r.numero} ` : ""}enviado com sucesso — ${brl(r.total)}.` });
      limparVenda();
      setAba("meus");
    } catch (e) {
      triggerHaptic("medium");
      setAviso({ tipo: "erro", texto: String((e as Error)?.message || e).replace(/^\d+\s*/, "") || "Não foi possível enviar ao ERP." });
    } finally {
      setEnviando(false);
    }
  };

  if (acessoNegado) {
    return (
      <Pagina>
        <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <Package size={36} />
          </div>
          <p className="text-xl font-bold">Acesso restrito</p>
          <p className="text-sm text-muted-foreground">
            Este aplicativo é exclusivo para a equipe de vendas Carflax. Solicite liberação ao seu gestor.
          </p>
          <a
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md active:opacity-90"
          >
            <LayoutGrid size={16} /> Abrir o HUB
          </a>
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
          onCliente={(c) => {
            setCliente(c);
            setBusca(null);
            triggerHaptic("light");
          }}
          onProduto={adicionarProduto}
          itensCarrinho={itens}
        />
      )}

      {/* Header Fixo Mobile com Safe Area e Blur */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-border/40 bg-background/85 px-4 pb-2.5 pt-[max(env(safe-area-inset-top),10px)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          {/* Perfil do vendedor com dropdown */}
          <div className="relative flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => {
                triggerHaptic("light");
                setMenuAberto((v) => !v);
              }}
              className="relative shrink-0 rounded-full focus:outline-none"
              aria-label="Menu do vendedor"
            >
              {userProfile?.avatar ? (
                <img
                  src={userProfile.avatar}
                  alt={userProfile.name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-emerald-500/80 shadow-sm"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/80 shadow-sm">
                  <User size={18} />
                </span>
              )}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-bold tracking-tight">{primeiroNome}</p>
                <ChevronDown size={14} className="text-muted-foreground transition-transform" />
              </div>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 leading-none">
                Carflax Vendas
              </p>
            </div>

            {/* Dropdown Menu */}
            {menuAberto && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuAberto(false)} />
                <div className="absolute left-0 top-12 z-40 w-56 overflow-hidden rounded-2xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="border-b border-border/50 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-foreground">{userProfile?.name || "Vendedor"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Status ERP: {status?.podeEnviar ? "🟢 Conectado" : "🟡 Preview"}
                    </p>
                  </div>
                  <a
                    href="/"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted active:bg-muted"
                  >
                    <LayoutGrid size={15} className="text-muted-foreground" /> Abrir o HUB Carflax
                  </a>
                  <button
                    onClick={() => {
                      setMenuAberto(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 active:bg-red-500/15"
                  >
                    <LogOut size={15} /> Encerrar sessão
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Lado Direito: Ações rápidas */}
          <div className="flex items-center gap-1.5">
            {/* Tema Claro / Escuro */}
            <button
              onClick={() => {
                triggerHaptic("light");
                setTheme(theme === "dark" ? "light" : "dark");
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground active:scale-95"
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Banner do PWA se não estiver instalado */}
        {showPwaPrompt && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-200">
              <Smartphone size={14} />
              <span className="text-[11px] font-medium">Instale como App para acesso rápido e offline</span>
            </div>
            <button
              onClick={() => {
                setShowPwaPrompt(false);
                sessionStorage.setItem("vendedor-pwa-dismiss", "1");
              }}
              className="text-muted-foreground p-0.5"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </header>

      {/* Avisos Flutuantes de Envio */}
      {aviso && (
        <div
          className={`mt-2 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs shadow-md animate-in slide-in-from-top-2 duration-200 ${
            aviso.tipo === "ok"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300"
          }`}
        >
          {aviso.tipo === "ok" ? <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : <X size={16} className="shrink-0 text-red-500" />}
          <span className="flex-1 font-medium">{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 p-1 text-muted-foreground" aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Conteúdo rolável principal */}
      <div className={`flex-1 overflow-y-auto pt-3 ${aba === "nova" && itens.length > 0 ? "vendedor-content-pad-cart" : "vendedor-content-pad-empty"}`}>
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
            especie={especie}
            onEspecie={(esp) => {
              triggerHaptic("light");
              setEspecie(esp);
            }}
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

      {/* Barra Inferior de Checkout (Apenas na aba Nova Venda quando houver carrinho) */}
      {aba === "nova" && (
        <div className="vendedor-action-bar fixed inset-x-0 z-20 border-t border-border/60 bg-background/95 px-4 py-2.5 shadow-2xl backdrop-blur-lg">
          <div className="mx-auto max-w-[720px] space-y-2">
            {itens.length > 0 ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Total · {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                  </p>
                  <p className="text-[20px] font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {brl(total)}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    especie === "PD" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                  }`}>
                    {especie === "PD" ? "Pedido" : "Orçamento"}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Botão de Envio com Alta Ergonomia Mobile */}
            <button
              onClick={enviar}
              disabled={!podeEnviar}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 px-4 text-[15px] font-bold text-white shadow-lg transition-all active:scale-[0.98] ${
                podeEnviar
                  ? especie === "PD"
                    ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/25"
                    : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-600/25"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-60 shadow-none"
              }`}
            >
              {enviando ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Transmitindo ao ERP...</span>
                </>
              ) : (
                <>
                  {especie === "PD" ? <Sparkles size={18} /> : <FileText size={18} />}
                  <span>
                    {!cliente
                      ? "Selecione o cliente para enviar"
                      : itens.length === 0
                      ? "Adicione produtos ao pedido"
                      : status && !status.podeEnviar
                      ? "Envio desativado no servidor"
                      : especie === "OR"
                      ? `Gerar Orçamento · ${brl(total)}`
                      : `Transmitir Pedido · ${brl(total)}`}
                  </span>
                </>
              )}
            </button>

            {status && !status.podeEnviar && (
              <p className="text-center text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ Modo demonstração: o envio direto ao Autcom está desativado pelo gestor.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Barra de Navegação Inferior Nativa PWA */}
      <BottomNav aba={aba} onAba={(a) => { triggerHaptic("light"); setAba(a); }} carrinho={qtdItens} />
    </Pagina>
  );
}

// ── Nova venda: Operação + Cliente + Itens + Pagamento ─────────────────────────
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
  especie: "OR" | "PD";
  onEspecie: (e: "OR" | "PD") => void;
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
  const { cliente, itens, empresas, empresa, condicoes, formas, condicao, forma, observacao, especie, onEspecie } = props;
  const [obsAberta, setObsAberta] = useState(false);

  return (
    <div className="space-y-3.5 pb-2">
      {/* Seletor Segmentado de Tipo de Documento: Orçamento vs Pedido */}
      <div className="rounded-2xl border border-border/80 bg-card p-1.5 shadow-sm">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => onEspecie("OR")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
              especie === "OR"
                ? "bg-card text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText size={15} />
            <span>Orçamento (OR)</span>
          </button>
          <button
            type="button"
            onClick={() => onEspecie("PD")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
              especie === "PD"
                ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles size={15} />
            <span>Pedido (PD)</span>
          </button>
        </div>
      </div>

      {/* Empresa de Faturamento (quando houver mais de uma) */}
      {empresas.length > 1 && (
        <CampoSheet
          icone={<Building2 size={16} />}
          rotulo="Empresa"
          titulo="Empresa de faturamento"
          valorTexto={empresas.find((e) => e.codigo === empresa)?.nome || null}
          opcoes={empresas.map((e) => ({ valor: e.codigo, texto: e.nome, sub: `Código ${e.codigo}` }))}
          valor={empresa}
          onSelect={props.onEmpresa}
        />
      )}

      {/* Seleção do Cliente */}
      <Secao titulo="Cliente" icone={<User size={15} />}>
        {cliente ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/90 bg-card p-3.5 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 font-black text-emerald-600 dark:text-emerald-400">
                {cliente.nome.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{cliente.nome}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.2 font-semibold text-[10px]">{cliente.tipo}</span>
                  <span>{cliente.documento || `Cód. ${cliente.cod}`}</span>
                  {cliente.bairro && <span>• {cliente.bairro}</span>}
                </div>
              </div>
            </div>
            <button
              onClick={props.onTrocarCliente}
              className="shrink-0 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-muted/80 active:scale-95"
            >
              Trocar
            </button>
          </div>
        ) : (
          <button
            onClick={props.onBuscarCliente}
            className="flex w-full items-center justify-between rounded-2xl border border-dashed border-border/90 bg-card p-4 text-left shadow-sm active:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <UserPlus size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Selecionar Cliente</p>
                <p className="text-[11px] text-muted-foreground">Razão social, nome fantasia ou CPF/CNPJ</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        )}
      </Secao>

      {/* Itens do Pedido */}
      <Secao
        titulo={`Itens do Pedido ${itens.length ? `(${itens.length})` : ""}`}
        icone={<ShoppingCart size={15} />}
        acao={
          itens.length > 0 ? (
            <button
              onClick={props.onBuscarProduto}
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"
            >
              <Plus size={14} /> Adicionar
            </button>
          ) : undefined
        }
      >
        {itens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/90 bg-card p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-2.5">
              <Package size={24} />
            </div>
            <p className="text-sm font-bold text-foreground">Seu carrinho está vazio</p>
            <p className="mt-0.5 text-xs text-muted-foreground max-w-[260px] mx-auto">
              Pesquise produtos por código ou descrição para incluir na venda.
            </p>
            <button
              onClick={props.onBuscarProduto}
              className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md active:scale-95"
            >
              <Search size={15} /> Consultar Catálogo
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {itens.map((i) => {
              const temDesconto = i.precoUnitario < i.precoOriginal;
              return (
                <div key={i.cod} className="rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
                  {/* Topo do item: Descrição e Remover */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-foreground leading-snug line-clamp-2">{i.produto}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="font-mono font-medium">Cód. {i.cod}</span>
                        {i.marca && <span className="rounded bg-muted px-1.5 py-0.2 font-semibold">{i.marca}</span>}
                        <span className={i.disponivel > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-500"}>
                          disp: {num(i.disponivel)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => props.onRemover(i.cod)}
                      className="shrink-0 p-1.5 text-muted-foreground hover:text-red-500 active:scale-95"
                      aria-label="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Linha de controles: Quantidade, Preço unitário e Subtotal */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                    {/* Stepper de Quantidade com alvos de toque generosos (38x38px) */}
                    <div className="flex items-center rounded-xl border border-border bg-muted/40">
                      <button
                        onClick={() => props.onQtd(i.cod, -1)}
                        className="flex h-9 w-9 items-center justify-center text-foreground hover:bg-muted active:scale-90"
                        aria-label="Diminuir quantidade"
                      >
                        <Minus size={15} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={i.quantidade}
                        onChange={(e) => props.onDefinirQtd(i.cod, Number(e.target.value))}
                        className="w-10 bg-transparent text-center text-sm font-bold outline-none"
                      />
                      <button
                        onClick={() => props.onQtd(i.cod, 1)}
                        className="flex h-9 w-9 items-center justify-center text-foreground hover:bg-muted active:scale-90"
                        aria-label="Aumentar quantidade"
                      >
                        <Plus size={15} />
                      </button>
                    </div>

                    {/* Preço Unitário */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={i.precoUnitario}
                        onChange={(e) => props.onPreco(i.cod, Number(e.target.value))}
                        className={`w-20 rounded-xl border border-border bg-card px-2 py-1.5 text-right text-xs font-bold outline-none ${
                          temDesconto ? "text-amber-600 dark:text-amber-400 border-amber-500/40" : "text-foreground"
                        }`}
                      />
                    </div>

                    {/* Subtotal do Item */}
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {brl(i.precoUnitario * i.quantidade)}
                      </p>
                      {temDesconto && (
                        <p className="text-[9px] text-amber-600 dark:text-amber-400 line-through">
                          {brl(i.precoOriginal * i.quantidade)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={props.onBuscarProduto}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 bg-card/60 p-3 text-xs font-bold text-muted-foreground hover:text-foreground active:bg-muted/40"
            >
              <Plus size={16} /> Adicionar mais produtos
            </button>
          </div>
        )}
      </Secao>

      {/* Condições de Pagamento e Observação */}
      <Secao titulo="Pagamento & Detalhes" icone={<Wallet size={15} />}>
        <div className="space-y-2.5">
          <CampoSheet
            rotulo="Condição"
            titulo="Condição de pagamento"
            placeholder="Selecione a condição"
            icone={<ClipboardList size={16} />}
            valorTexto={condicao ? condicao.descricao || condicao.formatada || condicao.codigo : null}
            opcoes={condicoes.map((c) => ({
              valor: c.codigo,
              texto: c.descricao || c.formatada || c.codigo,
              sub: c.formatada || (c.parcelas ? `${c.parcelas}x parcelas` : undefined),
            }))}
            valor={condicao?.codigo || ""}
            onSelect={(cod) => props.onCondicao(condicoes.find((c) => c.codigo === cod) || null)}
          />

          <CampoSheet
            rotulo="Forma"
            titulo="Forma de pagamento"
            placeholder="Selecione a forma"
            icone={<Wallet size={16} />}
            valorTexto={forma ? forma.descricao || forma.codigo : null}
            opcoes={formas.map((f) => ({ valor: f.codigo, texto: f.descricao || f.codigo }))}
            valor={forma?.codigo || ""}
            onSelect={(cod) => props.onForma(formas.find((f) => f.codigo === cod) || null)}
          />

          {obsAberta || observacao ? (
            <div className="relative">
              <textarea
                value={observacao}
                onChange={(e) => props.onObservacao(e.target.value.slice(0, 60))}
                placeholder="Observação da venda (máx 60 caracteres)"
                rows={2}
                autoFocus={obsAberta && !observacao}
                className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-emerald-500"
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground font-mono">
                {observacao.length}/60
              </span>
            </div>
          ) : (
            <button
              onClick={() => setObsAberta(true)}
              className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-border/80 bg-card p-3 text-left text-xs text-muted-foreground active:bg-muted/40"
            >
              <Plus size={15} /> Adicionar observação interna
            </button>
          )}
        </div>
      </Secao>
    </div>
  );
}

// ── Meus pedidos/orçamentos com busca, filtros e detalhes em bottom sheet ──────
function MeusPedidos() {
  const [pedidos, setPedidos] = useState<VendedorPedidoResumo[] | null>(null);
  const [erro, setErro] = useState(false);
  const [recarregando, setRecarregando] = useState(false);
  const [filtroEspecie, setFiltroEspecie] = useState<"todos" | "OR" | "PD" | "faturado">("todos");
  const [busca, setBusca] = useState("");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<VendedorPedidoResumo | null>(null);

  const carregar = useCallback(async () => {
    setRecarregando(true);
    try {
      setErro(false);
      const r = await apiVendedorPedidos();
      setPedidos(r.pedidos);
    } catch {
      setErro(true);
    } finally {
      setRecarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pedidosFiltrados = useMemo(() => {
    if (!pedidos) return [];
    return pedidos.filter((p) => {
      if (filtroEspecie === "OR" && p.especie !== "OR") return false;
      if (filtroEspecie === "PD" && p.especie !== "PD") return false;
      if (filtroEspecie === "faturado" && p.status !== "Faturado") return false;
      if (busca.trim()) {
        const t = busca.toLowerCase();
        const docMatch = p.doc.toLowerCase().includes(t);
        const cliMatch = (p.cliente || "").toLowerCase().includes(t);
        if (!docMatch && !cliMatch) return false;
      }
      return true;
    });
  }, [pedidos, filtroEspecie, busca]);

  const corStatus = (s: string) => {
    if (s === "Cancelado") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    if (s === "Faturado" || s === "Convertido") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  };

  const compartilharWhatsApp = (p: VendedorPedidoResumo) => {
    triggerHaptic("light");
    const tipo = p.especie === "OR" ? "Orçamento" : "Pedido";
    const texto = `*Carflax Vendas*\n\n${tipo} *#${p.doc.replace(/^0+/, "")}*\nCliente: ${p.cliente || "Consumidor"}\nData: ${formatarData(p.data)}\nStatus: ${p.status}\nTotal: ${brl(p.total)}${p.nota_fiscal ? `\nNF: ${p.nota_fiscal}` : ""}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, "_blank");
  };

  if (erro) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
        <p className="font-semibold text-foreground text-sm">Não foi possível carregar o histórico.</p>
        <p className="mt-1">Verifique sua conexão e tente novamente.</p>
        <button
          onClick={carregar}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-md active:scale-95"
        >
          <RefreshCw size={14} className={recarregando ? "animate-spin" : ""} /> Tentar de novo
        </button>
      </div>
    );
  }

  if (!pedidos) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {/* Barra de Filtros e Busca */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente ou número (#)"
            className="w-full rounded-2xl border border-border bg-card py-2.5 pl-10 pr-9 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X size={15} />
            </button>
          )}
        </div>

        {/* Chips de filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          {[
            { id: "todos", label: "Todos" },
            { id: "PD", label: "Pedidos" },
            { id: "OR", label: "Orçamentos" },
            { id: "faturado", label: "Faturados" },
          ].map((f) => {
            const ativo = filtroEspecie === f.id;
            return (
              <button
                key={f.id}
                onClick={() => {
                  triggerHaptic("light");
                  setFiltroEspecie(f.id as typeof filtroEspecie);
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-all ${
                  ativo
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            );
          })}

          <button
            onClick={carregar}
            disabled={recarregando}
            className="ml-auto flex items-center gap-1 rounded-full p-1.5 text-muted-foreground hover:text-foreground active:scale-90"
            title="Recarregar"
          >
            <RefreshCw size={14} className={recarregando ? "animate-spin text-emerald-600" : ""} />
          </button>
        </div>
      </div>

      {/* Lista de Pedidos */}
      {pedidosFiltrados.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-semibold text-foreground">Nenhum registro encontrado</p>
          <p className="mt-0.5">Tente ajustar seus filtros de busca.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pedidosFiltrados.map((p) => {
            const docLimpo = p.doc.replace(/^0+/, "");
            return (
              <div
                key={`${p.empresa}-${p.especie}-${p.doc}`}
                onClick={() => {
                  triggerHaptic("light");
                  setPedidoSelecionado(p);
                }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm active:bg-muted/50 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        p.especie === "PD" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      {p.especie}
                    </span>
                    <span className="text-xs font-mono font-bold text-foreground">#{docLimpo}</span>
                    <span className="text-[10px] text-muted-foreground">• {formatarData(p.data)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-foreground">{p.cliente || "Consumidor não informado"}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {brl(p.total)}
                  </p>
                  <span className={`inline-block mt-0.5 rounded-full border px-2 py-0.2 text-[9px] font-bold ${corStatus(p.status)}`}>
                    {p.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalhes do Pedido em Bottom Sheet */}
      {pedidoSelecionado && (
        <BottomSheet titulo={`Detalhes do ${pedidoSelecionado.especie === "OR" ? "Orçamento" : "Pedido"} #${pedidoSelecionado.doc.replace(/^0+/, "")}`} onFechar={() => setPedidoSelecionado(null)}>
          <div className="p-4 space-y-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Documento</span>
                <span className="text-xs font-mono font-bold">{pedidoSelecionado.especie} #{pedidoSelecionado.doc.replace(/^0+/, "")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cliente</span>
                <span className="text-xs font-bold text-foreground text-right">{pedidoSelecionado.cliente || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Data da Venda</span>
                <span className="text-xs font-medium">{formatarData(pedidoSelecionado.data)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status Autcom</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${corStatus(pedidoSelecionado.status)}`}>
                  {pedidoSelecionado.status}
                </span>
              </div>
              {pedidoSelecionado.nota_fiscal && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Nota Fiscal (NF)</span>
                  <span className="text-xs font-bold font-mono text-emerald-600">{pedidoSelecionado.nota_fiscal}</span>
                </div>
              )}
              <div className="border-t border-border/50 pt-2 flex items-center justify-between">
                <span className="text-sm font-bold">Valor Total</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{brl(pedidoSelecionado.total)}</span>
              </div>
            </div>

            <button
              onClick={() => compartilharWhatsApp(pedidoSelecionado)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] active:scale-95 py-3 text-xs font-bold text-white shadow-md"
            >
              <Share2 size={16} /> Compartilhar Resumo no WhatsApp
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ── Busca em tela cheia (cliente ou produto) otimizada para toque ──────────────
function BuscaOverlay({
  modo, onFechar, onCliente, onProduto, itensCarrinho,
}: {
  modo: "cliente" | "produto";
  onFechar: () => void;
  onCliente: (c: VendedorCliente) => void;
  onProduto: (p: VendedorProduto) => void;
  itensCarrinho: ItemCarrinho[];
}) {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<VendedorCliente[]>([]);
  const [produtos, setProdutos] = useState<VendedorProduto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mapaQtd = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of itensCarrinho) map.set(it.cod, it.quantidade);
    return map;
  }, [itensCarrinho]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setClientes([]);
      setProdutos([]);
      return;
    }
    setCarregando(true);
    const id = window.setTimeout(async () => {
      try {
        if (modo === "cliente") {
          const res = await apiVendedorClientes(termo);
          setClientes(res.clientes);
        } else {
          const res = await apiVendedorProdutos(termo);
          setProdutos(res.produtos);
        }
      } catch {
        /* mantém lista anterior */
      } finally {
        setCarregando(false);
      }
    }, 260);
    return () => window.clearTimeout(id);
  }, [q, modo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[max(env(safe-area-inset-top),10px)]">
      {/* Header da Busca */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-background px-3 py-2.5">
        <button
          onClick={onFechar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground active:scale-90"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex flex-1 min-w-0 items-center gap-2 rounded-2xl bg-muted/70 px-3.5 py-2">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              modo === "cliente" ? "Nome, razão ou CPF/CNPJ..." : "Descrição, código ou marca..."
            }
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Limpar texto" className="p-1 text-muted-foreground shrink-0">
              <X size={15} />
            </button>
          )}
        </div>

        {modo === "produto" && (
          <button
            onClick={onFechar}
            className="shrink-0 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm active:scale-95"
          >
            Pronto
          </button>
        )}
      </div>

      {/* Conteúdo da Busca */}
      <div className="flex-1 overflow-y-auto p-3">
        {carregando && q.trim().length >= 2 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 size={24} className="animate-spin text-emerald-600" />
            <p className="text-xs text-muted-foreground">Consultando base Autcom...</p>
          </div>
        )}

        {q.trim().length < 2 && !carregando && (
          <div className="py-14 text-center text-xs text-muted-foreground">
            {modo === "cliente" ? <User size={32} className="mx-auto mb-2 opacity-40" /> : <Package size={32} className="mx-auto mb-2 opacity-40" />}
            <p className="font-semibold text-foreground">Digite pelo menos 2 caracteres</p>
            <p className="mt-0.5">
              {modo === "cliente"
                ? "Pesquise por nome, documento ou código do cliente."
                : "Pesquise por descrição, código ou fabricante."}
            </p>
          </div>
        )}

        {/* Resultados de Clientes */}
        {modo === "cliente" && (
          <div className="space-y-2">
            {clientes.map((c) => (
              <button
                key={c.cod}
                onClick={() => onCliente(c)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left shadow-sm active:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-bold text-muted-foreground">{c.tipo}</span>
                    <p className="truncate text-xs font-bold text-foreground">{c.nome}</p>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {c.documento || `Cód. ${c.cod}`}{c.bairro ? ` • ${c.bairro}` : ""}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Resultados de Produtos */}
        {modo === "produto" && (
          <div className="space-y-2">
            {produtos.map((p) => {
              const qtdNoCarrinho = mapaQtd.get(p.cod) || 0;
              return (
                <div
                  key={p.cod}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3 text-left shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground leading-snug line-clamp-2">{p.produto}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono font-medium">Cód. {p.cod}</span>
                      {p.marca && <span className="rounded bg-muted px-1.5 py-0.2 font-semibold">{p.marca}</span>}
                      <span className={p.disponivel > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-500"}>
                        disp: {num(p.disponivel)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {brl(p.preco)}
                    </span>
                    <button
                      onClick={() => onProduto(p)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold transition-all active:scale-90 ${
                        qtdNoCarrinho > 0
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                      }`}
                      aria-label="Adicionar produto"
                    >
                      {qtdNoCarrinho > 0 ? (
                        <span className="text-xs font-extrabold">{qtdNoCarrinho}</span>
                      ) : (
                        <Plus size={18} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componentes de Seção e BottomSheet ────────────────────────────────────────
function Secao({ titulo, icone, acao, children }: { titulo: string; icone: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
          {icone} {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

interface Opcao { valor: string; texto: string; sub?: string }

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
  const [busca, setBusca] = useState("");

  const opcoesFiltradas = useMemo(() => {
    if (!busca.trim()) return opcoes;
    const t = busca.toLowerCase();
    return opcoes.filter((o) => o.texto.toLowerCase().includes(t) || (o.sub && o.sub.toLowerCase().includes(t)));
  }, [opcoes, busca]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          triggerHaptic("light");
          setAberto(true);
        }}
        className="flex w-full items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left shadow-sm active:bg-muted/50"
      >
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {icone} {rotulo}
        </span>
        <span className={`ml-auto min-w-0 truncate text-xs ${valorTexto ? "font-bold text-foreground" : "text-muted-foreground"}`}>
          {valorTexto || placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
      </button>

      {aberto && (
        <BottomSheet titulo={titulo} onFechar={() => { setAberto(false); setBusca(""); }}>
          {opcoes.length > 5 && (
            <div className="p-3 border-b border-border/40">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar opções..."
                  className="w-full rounded-xl border border-border bg-muted/40 py-2 pl-9 pr-3 text-xs outline-none"
                />
              </div>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto">
            {!opcoesFiltradas.length && (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma opção encontrada.</p>
            )}
            {opcoesFiltradas.map((o) => {
              const ativo = o.valor === valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    onSelect(o.valor);
                    setAberto(false);
                    setBusca("");
                  }}
                  className={`flex w-full items-center justify-between gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 ${
                    ativo ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block truncate text-xs ${ativo ? "font-bold" : "font-medium text-foreground"}`}>
                      {o.texto}
                    </span>
                    {o.sub && <span className="block truncate text-[10px] text-muted-foreground">{o.sub}</span>}
                  </span>
                  {ativo && <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}
    </>
  );
}

function BottomSheet({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <button className="vendedor-scrim absolute inset-0 bg-black/60 backdrop-blur-xs" aria-label="Fechar" onClick={onFechar} />
      <div className="vendedor-sheet relative max-h-[82vh] overflow-hidden rounded-t-[28px] border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),12px)] shadow-2xl">
        <div className="vendedor-sheet-handle" />
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
          <h3 className="text-sm font-bold text-foreground">{titulo}</h3>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-90"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ABAS: { id: Aba; rotulo: string; Icone: typeof ShoppingCart }[] = [
  { id: "nova", rotulo: "Nova Venda", Icone: ShoppingCart },
  { id: "meus", rotulo: "Meus Pedidos", Icone: ClipboardList },
];

function BottomNav({ aba, onAba, carrinho }: { aba: Aba; onAba: (a: Aba) => void; carrinho: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border/60 bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md">
      {ABAS.map(({ id, rotulo, Icone }) => {
        const ativo = aba === id;
        return (
          <button
            key={id}
            onClick={() => onAba(id)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 text-[11px] font-bold transition-all ${
              ativo ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="relative">
              <Icone size={20} strokeWidth={ativo ? 2.5 : 1.8} />
              {id === "nova" && carrinho > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-black text-white shadow-sm animate-in zoom-in-75 duration-150">
                  {carrinho}
                </span>
              )}
            </div>
            <span>{rotulo}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Pagina({ children }: { children: ReactNode }) {
  return (
    <div className="vendedor-app min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] max-w-[720px] flex-col px-4 pb-2">{children}</div>
    </div>
  );
}

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a.slice(2)}` : iso;
}
