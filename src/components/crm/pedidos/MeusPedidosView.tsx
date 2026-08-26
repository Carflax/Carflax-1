import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { authHeaders } from "@/lib/api";
import {
  Search,
  Package,
  Clock,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CalendarClock,
  List,
  Play,
  MessageSquare,
  CheckCircle2,
  User,
  Boxes,
  X,
  Loader2,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isBalcao2, parseOrderCreated, b2RemainingMs, formatB2Remaining, B2_AVISO_MS } from "@/lib/balcao2-prazo";

const API_SERVER = "https://marketing-banco-de-dados.velbav.easypanel.host";

/* ─── Contador de prazo Balcão 2 (72h) ───────────────────────── */

function Balcao2Prazo({
  tipoMov,
  localRet,
  dtaent,
  horent,
}: {
  tipoMov?: string;
  localRet?: string;
  dtaent?: string;
  horent?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(i);
  }, []);

  if (!isBalcao2(tipoMov, localRet)) return null;
  const created = parseOrderCreated(dtaent, horent);
  if (created == null) return null;

  const remaining = b2RemainingMs(created, now);
  const overdue = remaining <= 0;
  const critico = remaining <= B2_AVISO_MS; // faltando 1 dia ou menos

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border",
        "bg-red-500/15 text-red-400 border-red-500/40",
        (overdue || critico) && "animate-pulse"
      )}
      title={overdue ? "Prazo de 72h estourado" : "Prazo de retirada (72h)"}
    >
      <Clock className="w-3 h-3" />
      {overdue ? formatB2Remaining(remaining) : `${formatB2Remaining(remaining)} restantes`}
    </span>
  );
}

/* ─── Tipos ─────────────────────────────────────────────────── */

interface Order {
  FGO_CODEMP: string;
  FGO_NUMDOC: string;
  FGO_CODVEN: string;
  NOME_VENDEDOR: string;
  FGO_CODCLI: string;
  NOME_CLIENTE: string;
  FGO_DTAENT: string;
  FGO_HORENT: string;
  STA_DESCRI: string;
  NOME_SEPARADOR: string;
  CODIGO_SEPARADOR: string;
  OBSERVACAO: string;
  LOCAL_RETIRADA: string;
  TIPO_MOVIMENTACAO: string;
  FGO_ENTFUT: string;
  FGO_SEPIMP: string;
  isSeparating: boolean;
  separatorName: string;
  separatorCode: string;
  qtdeSeparada: number;
  qtdeTotal: number;
  divergencias: { codigo_produto: string; descricao_produto: string; quantidade_pedida: number; quantidade_separada: number }[];
}

interface ConferenciaOrder {
  FGO_CODEMP: string;
  PEDIDO: string;
  FGO_CODVEN: string;
  NOME_VENDEDOR: string;
  COD_CLIENTE: string;
  CLIENTE: string;
  DATA_ENTRADA: string;
  FGO_HORENT: string;
  STATUS: string;
  FGO_VOLUME: string | null;
  OBSERVACAO: string | null;
  SEPARADOR: string;
  CONFERENTE: string | null;
  LOCAL_RETIRADA: string;
  TIPO_MOVIMENTACAO: string;
  TIPO: string;
}

interface FaturamentoOrder {
  FGO_CODEMP: string;
  FGO_NUMDOC: string;
  FGO_CODVEN: string;
  NOME_VENDEDOR: string;
  FGO_CODCLI: string;
  NOME_CLIENTE: string;
  FGO_DTAENT: string;
  FGO_HORENT: string;
  STA_DESCRI: string;
  NOME_SEPARADOR: string | null;
  CODIGO_SEPARADOR: string | null;
  NOME_CONFERENTE: string | null;
  CODIGO_CONFERENTE: string | null;
  FGO_VOLUME: string | null;
  FGO_ESPECI: string | null;
  OBSERVACAO: string | null;
  LOCAL_RETIRADA: string;
  TIPO_MOVIMENTACAO: string;
  FGO_CONPAG: string | null;
}

interface PedidoItem {
  FDO_CODITE: string;
  FDO_DESCRI: string;
  FDO_QTDITE: number;
  ITE_LOCFIS: string | null;
  ITE_CODBAR: string | null;
}

interface ItemsModalTarget {
  pedido: string;
  empresa: string;
  cliente: string;
}

interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  operator_code?: string;
  operatorCode?: string;
  permissions?: string[];
  is_admin?: boolean;
  is_leader?: boolean;
}

interface Props {
  userProfile?: UserProfile;
}

type FilterTab = "all" | "aguardando" | "separando" | "separado";

/* ─── Helpers ────────────────────────────────────────────────── */

function getTipoInfo(tipo: string, tipoMov?: string, localRet?: string) {
  const t = (tipo || "").toUpperCase();
  const mov = (tipoMov || "").toUpperCase();
  const loc = (localRet || "").toUpperCase();

  if (mov === "R" && loc === "B")  return { label: "BALCÃO 1", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (mov === "R" && loc === "B2") return { label: "BALCÃO 2", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (t === "BALCÃO 1")            return { label: "BALCÃO 1", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (t === "BALCÃO 2")            return { label: "BALCÃO 2", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (t === "BALCÃO" || mov === "R") return { label: "RETIRA",   color: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
  if (t === "ENTREGA" || mov === "E") return { label: "ENTREGA", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { label: "OUTROS", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
}

/** Label do tipo (mesma regra do badge do card): BALCÃO 1/2, ENTREGA, etc. */
function tipoLabel(tipo: string, tipoMov?: string, localRet?: string) {
  return getTipoInfo(tipo, tipoMov, localRet).label;
}

/** Opções de filtro por tipo de pedido (multi-seleção). */
const TIPO_FILTERS: { label: string; short: string }[] = [
  { label: "BALCÃO 1", short: "Balcão 1" },
  { label: "BALCÃO 2", short: "Balcão 2" },
  { label: "ENTREGA", short: "Entrega" },
];

function getStatusInfo(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("faturamento"))      return { color: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
  if (s.includes("conferência") || s.includes("conferencia")) return { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (s.includes("entrega de compra")) return { color: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
  if (s.includes("negada"))           return { color: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (s.includes("compra"))           return { color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (s.includes("separação") || s.includes("separacao")) return { color: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
  return { color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
}

function formatDate(raw: string) {
  if (!raw) return "--/--/----";
  try {
    const datePart = (typeof raw === "string" ? raw : new Date(raw).toISOString()).substring(0, 10);
    const [y, m, d] = datePart.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return "--/--/----";
  }
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/* ─── Componente principal ───────────────────────────────────── */

export function MeusPedidosView({ userProfile }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [separatedOrders, setSeparatedOrders] = useState<ConferenciaOrder[]>([]);
  const [faturamentoOrders, setFaturamentoOrders] = useState<FaturamentoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [activeTipos, setActiveTipos] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("meuspedidos_tipos");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem("meuspedidos_tipos", JSON.stringify(activeTipos)); } catch { /* ignore */ }
  }, [activeTipos]);

  const toggleTipo = (label: string) =>
    setActiveTipos((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  const [usersCache, setUsersCache] = useState<Map<string, { name: string; avatar: string }>>(new Map());
  const [namesToCodesCache, setNamesToCodesCache] = useState<Map<string, string>>(new Map());
  const [itemsModalTarget, setItemsModalTarget] = useState<ItemsModalTarget | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [erpRes, conferenciaRes, faturamentoRes, supabaseRes, usersRes, faltasRes] = await Promise.all([
        fetch(`${API_SERVER}/api/pedidos-separacao`, { headers: await authHeaders() }).then((r) => r.json()),
        fetch(`${API_SERVER}/api/pedidos-conferencia`, { headers: await authHeaders() }).then((r) => r.json()),
        fetch(`${API_SERVER}/api/pedidos-faturamento`, { headers: await authHeaders() }).then((r) => r.json()),
        supabase.from("coletor_separacao").select("*"),
        supabase.from("usuarios").select("operator_code,name,avatar"),
        supabase.from("coletor_faltas")
          .select("pedido,codigo_produto,descricao_produto,quantidade_pedida,quantidade_separada,resolvido")
          .eq("resolvido", false),
      ]);

      // Build users cache
      if (usersRes.data) {
        const cache = new Map<string, { name: string; avatar: string }>();
        const nameToCode = new Map<string, string>();
        usersRes.data.forEach((u: { operator_code?: string | number; name?: string; avatar?: string }) => {
          const code = String(u.operator_code || "").trim();
          if (code) {
            const normalized = code.replace(/^0+/, "") || code;
            cache.set(normalized, { name: u.name || "", avatar: u.avatar || "" });
            cache.set(code, { name: u.name || "", avatar: u.avatar || "" });
            if (u.name) {
              nameToCode.set(u.name.toUpperCase().trim(), code);
            }
          }
        });
        setUsersCache(cache);
        setNamesToCodesCache(nameToCode);
      }



      const meuCodigo = String(userProfile?.operator_code || userProfile?.operatorCode || "").trim();
      const meuCodigoNorm = meuCodigo.replace(/^0+/, "") || meuCodigo;
      // Admin, líderes e gerentes/diretores veem TODOS os pedidos (não filtra por vendedor).
      // Ex: gerente de estoque não é vendedor, mas precisa acompanhar toda a operação.
      const role = (userProfile?.role || "").toUpperCase();
      const isAdmin =
        userProfile?.is_admin === true ||
        userProfile?.is_leader === true ||
        role.includes("GERENTE") ||
        role.includes("DIRETOR");

      // ── Pedidos em separação ──────────────────────────────
      if (erpRes.success && erpRes.data) {
        const locks = supabaseRes.data || [];
        const faltas = faltasRes.data || [];

        const faltasPorPedido = new Map<string, typeof faltas>();
        faltas.forEach((f: { pedido: string | number; codigo_produto: string; descricao_produto: string; quantidade_pedida: number; quantidade_separada: number; resolvido: boolean | null }) => {
          const key = String(f.pedido).trim();
          if (!faltasPorPedido.has(key)) faltasPorPedido.set(key, []);
          faltasPorPedido.get(key)!.push(f);
        });

        const pedidosDoVendedor = isAdmin
          ? erpRes.data
          : erpRes.data.filter((order: Record<string, unknown>) => {
              const codVendedor = String(order.FGO_CODVEN || "").trim();
              const codVendedorNorm = codVendedor.replace(/^0+/, "") || codVendedor;
              return codVendedorNorm === meuCodigoNorm || codVendedor === meuCodigo;
            });

        const mapped: Order[] = pedidosDoVendedor.map((order: Record<string, unknown>) => {
          const normalizedId = String(order.FGO_NUMDOC).padStart(12, "0");
          const lock = locks.find((l: Record<string, unknown>) => String(l.pedido_id).trim() === normalizedId);

          let isSeparating = false;
          let separatorName = "";
          let separatorCode = "";
          let qtdeSeparada = 0;
          let qtdeTotal = 0;

          if (lock) {
            const lockedTime = lock.locked_at ? new Date(lock.locked_at as string).getTime() : 0;
            const stale = Date.now() - lockedTime > 30 * 60 * 1000;
            qtdeSeparada = (lock.qtde_separada as number) || 0;
            qtdeTotal = (lock.qtde_total as number) || 0;
            if (!stale && lock.operador_nome) {
              separatorName = lock.operador_nome as string;
              separatorCode = String(lock.operador || "").trim();
              isSeparating = true;
            }
          }

          const numDoc = String(order.FGO_NUMDOC).trim();
          const pedidoFaltas = faltasPorPedido.get(numDoc) || faltasPorPedido.get(normalizedId) || [];

          return {
            ...order,
            isSeparating,
            separatorName,
            separatorCode,
            qtdeSeparada,
            qtdeTotal,
            divergencias: pedidoFaltas,
          } as unknown as Order;
        });

        setOrders(mapped);
      }

      // ── Pedidos aguardando conferência ───────────────────
      if (conferenciaRes.success && conferenciaRes.data) {
        const filtrados: ConferenciaOrder[] = isAdmin
          ? conferenciaRes.data
          : conferenciaRes.data.filter((o: ConferenciaOrder) => {
              const cod = String(o.FGO_CODVEN || "").trim();
              const codNorm = cod.replace(/^0+/, "") || cod;
              return codNorm === meuCodigoNorm || cod === meuCodigo;
            });
        setSeparatedOrders(filtrados);
      }

      // ── Pedidos aguardando faturamento ────────────────────
      if (faturamentoRes.success && faturamentoRes.data) {
        const filtrados: FaturamentoOrder[] = isAdmin
          ? faturamentoRes.data
          : faturamentoRes.data.filter((o: FaturamentoOrder) => {
              const cod = String(o.FGO_CODVEN || "").trim();
              const codNorm = cod.replace(/^0+/, "") || cod;
              return codNorm === meuCodigoNorm || cod === meuCodigo;
            });
        setFaturamentoOrders(filtrados);
      }
    } catch (err) {
      console.error("Erro ao buscar pedidos:", err);
    } finally {
      setLoading(false);
    }
  }, [userProfile?.operator_code, userProfile?.operatorCode, userProfile?.is_admin, userProfile?.is_leader, userProfile?.role]);

  useEffect(() => {
    fetchData();
    // Refresh a cada 30s, só com a aba visível (evita egress em segundo plano).
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchData();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("meus-pedidos-locks")
      .on("postgres_changes", { event: "*", schema: "public", table: "coletor_separacao" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_conversas" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  /* ── Bases filtradas por tipo (Balcão 1/2, Entrega) — alimentam contagens e listas ── */
  const ordersByTipo = useMemo(
    () => (activeTipos.length ? orders.filter((o) => activeTipos.includes(tipoLabel("", o.TIPO_MOVIMENTACAO, o.LOCAL_RETIRADA))) : orders),
    [orders, activeTipos],
  );
  const separatedByTipo = useMemo(
    () => (activeTipos.length ? separatedOrders.filter((o) => activeTipos.includes(tipoLabel(o.TIPO, o.TIPO_MOVIMENTACAO, o.LOCAL_RETIRADA))) : separatedOrders),
    [separatedOrders, activeTipos],
  );
  const faturamentoByTipo = useMemo(
    () => (activeTipos.length ? faturamentoOrders.filter((o) => activeTipos.includes(tipoLabel("", o.TIPO_MOVIMENTACAO, o.LOCAL_RETIRADA))) : faturamentoOrders),
    [faturamentoOrders, activeTipos],
  );

  /* ── Contagens (respeitam o filtro de tipo) ─────────────── */
  const countAguardando = ordersByTipo.filter((o) => !o.isSeparating).length;
  const countSeparando  = ordersByTipo.filter((o) => o.isSeparating).length;
  const countSeparado   = separatedByTipo.length + faturamentoByTipo.length;
  const countTotal      = ordersByTipo.length + countSeparado;

  /* ── Filtro de pedidos em andamento ─────────────────────── */
  const filteredOrders = useMemo(() => {
    let list = ordersByTipo;
    if (filterTab === "aguardando") list = list.filter((o) => !o.isSeparating);
    if (filterTab === "separando")  list = list.filter((o) => o.isSeparating);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.NOME_CLIENTE || "").toLowerCase().includes(q) ||
          String(Number(o.FGO_NUMDOC)).includes(q) ||
          (o.NOME_VENDEDOR || "").toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (a.isSeparating && !b.isSeparating) return -1;
      if (!a.isSeparating && b.isSeparating) return 1;
      const dateA = `${a.FGO_DTAENT || ""} ${a.FGO_HORENT || ""}`;
      const dateB = `${b.FGO_DTAENT || ""} ${b.FGO_HORENT || ""}`;
      return dateB.localeCompare(dateA);
    });
  }, [ordersByTipo, filterTab, search]);

  /* ── Filtro de já separados (conferência + faturamento) ─── */
  const filteredSeparated = useMemo(() => {
    let list = separatedByTipo;
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (o) =>
        (o.CLIENTE || "").toLowerCase().includes(q) ||
        String(Number(o.PEDIDO)).includes(q) ||
        (o.NOME_VENDEDOR || "").toLowerCase().includes(q) ||
        (o.SEPARADOR || "").toLowerCase().includes(q)
    );
  }, [separatedByTipo, search]);

  const filteredFaturamento = useMemo(() => {
    let list = faturamentoByTipo;
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (o) =>
        (o.NOME_CLIENTE || "").toLowerCase().includes(q) ||
        String(Number(o.FGO_NUMDOC)).includes(q) ||
        (o.NOME_VENDEDOR || "").toLowerCase().includes(q) ||
        (o.NOME_SEPARADOR || "").toLowerCase().includes(q)
    );
  }, [faturamentoByTipo, search]);

  const tabs: { key: FilterTab; label: string; icon: React.ElementType; count?: number; accent?: string }[] = [
    { key: "all",       label: "Todos",        icon: List,          count: countTotal },
    { key: "aguardando",label: "Aguardando",    icon: Clock,         count: countAguardando },
    { key: "separando", label: "Em Separação",  icon: Play,          count: countSeparando },
    { key: "separado",  label: "Já Separados",  icon: CheckCircle2,  count: countSeparado,  accent: "text-emerald-400" },
  ];

  const isShowingSeparated = filterTab === "separado";
  const isShowingAll       = filterTab === "all";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="px-3 sm:px-6 pt-5 pb-4 border-b border-border/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Meus Pedidos</h1>
              <p className="text-xs text-muted-foreground">
                {countTotal} pedidos · {countSeparado} finalizados
              </p>
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loading && "animate-spin")} />
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center gap-3">
          <div className="flex bg-muted/50 rounded-lg p-0.5 gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  filterTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className={cn("w-3.5 h-3.5", filterTab === tab.key && tab.accent)} />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                    filterTab === tab.key
                      ? tab.key === "separado"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, pedido ou vendedor..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {TIPO_FILTERS.map((f) => {
              const active = activeTipos.includes(f.label);
              return (
                <button
                  key={f.label}
                  onClick={() => toggleTipo(f.label)}
                  aria-pressed={active}
                  title={active ? `Removendo filtro ${f.short}` : `Filtrar ${f.short}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all",
                    active
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                      : "text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Store className="w-3.5 h-3.5" />
                  {f.short}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 sm:p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-52 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Já separados: conferência + faturamento */}
            {(isShowingSeparated || isShowingAll) && (filteredSeparated.length > 0 || filteredFaturamento.length > 0) && (
              <>
                {/* Aguardando conferência */}
                {filteredSeparated.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-400">Aguardando Conferência</span>
                      <span className="text-xs text-muted-foreground">({filteredSeparated.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-6">
                      {filteredSeparated.map((order, idx) => (
                        <SeparatedOrderCard
                          key={`conf-${order.PEDIDO}-${idx}`}
                          order={order}
                          namesToCodesCache={namesToCodesCache}
                          onViewItems={() => setItemsModalTarget({ pedido: order.PEDIDO, empresa: order.FGO_CODEMP, cliente: order.CLIENTE })}
                        />
                      ))}
                    </div>
                  </>
                )}
                {/* Aguardando faturamento */}
                {filteredFaturamento.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 text-sky-400" />
                      <span className="text-sm font-semibold text-sky-400">Aguardando Faturamento</span>
                      <span className="text-xs text-muted-foreground">({filteredFaturamento.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-6">
                      {filteredFaturamento.map((order, idx) => (
                        <FaturamentoOrderCard
                          key={`fat-${order.FGO_NUMDOC}-${order.FGO_CODEMP}-${idx}`}
                          order={order}
                          onViewItems={() => setItemsModalTarget({ pedido: order.FGO_NUMDOC, empresa: order.FGO_CODEMP, cliente: order.NOME_CLIENTE })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Em separação / aguardando */}
            {!isShowingSeparated && (
              <>
                {isShowingAll && filteredOrders.length > 0 && filteredSeparated.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Play className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Em andamento</span>
                    <span className="text-xs text-muted-foreground">({filteredOrders.length})</span>
                  </div>
                )}
                {filteredOrders.length === 0 && (!isShowingAll || filteredSeparated.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Package className="w-12 h-12 mb-3 opacity-30" />
                    <p className="font-semibold">Nenhum pedido encontrado</p>
                    <p className="text-sm">Tente ajustar os filtros</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {filteredOrders.map((order, idx) => (
                      <OrderCard
                        key={`${order.FGO_CODEMP}-${order.FGO_NUMDOC}-${idx}`}
                        order={order}
                        usersCache={usersCache}
                        onViewItems={() => setItemsModalTarget({ pedido: order.FGO_NUMDOC, empresa: order.FGO_CODEMP, cliente: order.NOME_CLIENTE })}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Separados vazios */}
            {isShowingSeparated && filteredSeparated.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-semibold">Nenhum pedido separado</p>
                <p className="text-sm">Os pedidos separados aparecerão aqui</p>
              </div>
            )}
          </>
        )}
      </div>

      {itemsModalTarget && (
        <ItemsModal target={itemsModalTarget} onClose={() => setItemsModalTarget(null)} />
      )}
    </div>
  );
}

/* ─── Modal: itens do pedido ──────────────────────────────────── */

function ItemsModal({ target, onClose }: { target: ItemsModalTarget; onClose: () => void }) {
  const [items, setItems] = useState<PedidoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // O efeito não é async, então o cabeçalho é resolvido antes do fetch.
    authHeaders()
      .then((headers) =>
        fetch(
          `${API_SERVER}/api/coletor/separacao?pedido=${encodeURIComponent(target.pedido)}&empresa=${encodeURIComponent(target.empresa)}&tipo=conferencia`,
          { headers },
        ),
      )
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success) setItems(res.data || []);
        else setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target.pedido, target.empresa]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] rounded-xl border border-border bg-card flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border/50">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-foreground">Itens do Pedido #{String(Number(target.pedido))}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{target.cliente}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Carregando itens...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm font-semibold">Erro ao carregar itens</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Boxes className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm font-semibold">Nenhum item encontrado</p>
            </div>
          ) : (
            items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/30">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{item.FDO_DESCRI}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">Cód: {item.FDO_CODITE}</span>
                    {item.ITE_LOCFIS && (
                      <span className="text-[10px] text-muted-foreground">· Local: {item.ITE_LOCFIS}</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {item.FDO_QTDITE}
                </span>
              </div>
            ))
          )}
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="p-3 border-t border-border/50 text-[11px] text-muted-foreground text-center">
            {items.length} ite{items.length > 1 ? "ns" : "m"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Card: pedido já separado ───────────────────────────────── */

function SeparatedOrderCard({
  order,
  namesToCodesCache,
  onViewItems,
}: {
  order: ConferenciaOrder;
  namesToCodesCache: Map<string, string>;
  onViewItems: () => void;
}) {
  const tipoInfo = getTipoInfo(order.TIPO, order.TIPO_MOVIMENTACAO, order.LOCAL_RETIRADA);
  const numDoc = String(order.PEDIDO).trim();

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-card p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:border-emerald-500/40 shadow-emerald-500/5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground tracking-tight">
              #{String(Number(order.PEDIDO))}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              EMP {order.FGO_CODEMP}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground mt-1 truncate">{order.CLIENTE}</p>
        </div>
        {/* Status and Chat */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onViewItems}
            className="p-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Ver itens do pedido"
          >
            <Boxes className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("open-crm-chat", {
                  detail: {
                    doc: numDoc,
                    title: order.CLIENTE,
                    sellerName: order.SEPARADOR || "Separador",
                    sellerCode: namesToCodesCache.get((order.SEPARADOR || "").toUpperCase().trim()) || "",
                  },
                })
              );
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-[10px] font-semibold transition-colors shrink-0"
            title="Conversar"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Mensagem</span>
          </button>
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400 whitespace-nowrap">Separado</span>
          </div>
        </div>
      </div>

      {/* Separador */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">
          {getInitials(order.SEPARADOR || "?")}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-foreground truncate">{order.SEPARADOR || "—"}</span>
          <span className="text-[10px] text-muted-foreground">Separador</span>
        </div>
        {order.FGO_VOLUME && (
          <span className="ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {Number(order.FGO_VOLUME).toFixed(0)} vol.
          </span>
        )}
      </div>

      {/* Status conferência */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
        <AlertCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span className="text-[11px] font-semibold text-sky-400 truncate">{order.STATUS}</span>
      </div>

      {/* Observação */}
      {order.OBSERVACAO && order.OBSERVACAO.trim() && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-amber-400 leading-tight line-clamp-2">{order.OBSERVACAO}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/30">
        {order.NOME_VENDEDOR && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-foreground">{order.NOME_VENDEDOR}</span>
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDate(order.DATA_ENTRADA)} - {order.FGO_HORENT || "--:--"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Balcao2Prazo
              tipoMov={order.TIPO_MOVIMENTACAO}
              localRet={order.LOCAL_RETIRADA}
              dtaent={order.DATA_ENTRADA}
              horent={order.FGO_HORENT}
            />
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", tipoInfo.color)}>
              {tipoInfo.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Card: pedido aguardando faturamento ────────────────────── */

function FaturamentoOrderCard({ order, onViewItems }: { order: FaturamentoOrder; onViewItems: () => void }) {
  const tipoInfo = getTipoInfo("", order.TIPO_MOVIMENTACAO, order.LOCAL_RETIRADA);
  const numDoc = String(order.FGO_NUMDOC).trim();

  // Se já tem separador e conferente, o status real é "Aguardando faturamento"
  // independente do que o ERP registrou (pode estar desatualizado)
  const statusEfetivo =
    order.NOME_SEPARADOR && order.NOME_CONFERENTE
      ? "Aguardando faturamento"
      : order.STA_DESCRI;

  const statusInfo = getStatusInfo(statusEfetivo);

  return (
    <div className="rounded-xl border border-sky-500/20 bg-card p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:border-sky-500/40">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground tracking-tight">
              #{String(Number(order.FGO_NUMDOC))}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              EMP {order.FGO_CODEMP}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground mt-1 truncate">{order.NOME_CLIENTE}</p>
        </div>
        {/* Status and Chat */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onViewItems}
            className="p-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Ver itens do pedido"
          >
            <Boxes className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("open-crm-chat", {
                  detail: {
                    doc: numDoc,
                    title: order.NOME_CLIENTE,
                    sellerName: order.NOME_SEPARADOR || "Separador",
                    sellerCode: order.CODIGO_SEPARADOR || "",
                  },
                })
              );
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-[10px] font-semibold transition-colors shrink-0"
            title="Conversar"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Mensagem</span>
          </button>
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-bold text-sky-400 whitespace-nowrap">Conferido</span>
          </div>
        </div>
      </div>

      {/* Separador + Conferente */}
      <div className="space-y-1.5">
        {order.NOME_SEPARADOR && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-[9px] font-bold text-emerald-400 shrink-0">
              {getInitials(order.NOME_SEPARADOR)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">{order.NOME_SEPARADOR}</span>
              <span className="text-[10px] text-muted-foreground">Separador</span>
            </div>
            {order.FGO_VOLUME && (
              <span className="ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {Number(order.FGO_VOLUME).toFixed(0)} vol.
              </span>
            )}
          </div>
        )}
        {order.NOME_CONFERENTE && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-sky-500/15 flex items-center justify-center text-[9px] font-bold text-sky-400 shrink-0">
              {getInitials(order.NOME_CONFERENTE)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">{order.NOME_CONFERENTE}</span>
              <span className="text-[10px] text-muted-foreground">Conferente</span>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border", statusInfo.color)}>
        <AlertCircle className="w-3.5 h-3.5 shrink-0 opacity-80" />
        <span className="text-[11px] font-semibold truncate">{statusEfetivo}</span>
      </div>

      {/* Observação */}
      {order.OBSERVACAO && order.OBSERVACAO.trim() && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-amber-400 leading-tight line-clamp-2">{order.OBSERVACAO}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/30">
        {order.NOME_VENDEDOR && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="w-3 h-3 shrink-0" />
            <span className="font-semibold text-foreground truncate">{order.NOME_VENDEDOR}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDate(order.FGO_DTAENT)} - {order.FGO_HORENT || "--:--"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Balcao2Prazo
              tipoMov={order.TIPO_MOVIMENTACAO}
              localRet={order.LOCAL_RETIRADA}
              dtaent={order.FGO_DTAENT}
              horent={order.FGO_HORENT}
            />
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", tipoInfo.color)}>
              {tipoInfo.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Card: pedido em separação / aguardando ─────────────────── */

function OrderCard({
  order,
  usersCache,
  onViewItems,
}: {
  order: Order;
  usersCache: Map<string, { name: string; avatar: string }>;
  onViewItems: () => void;
}) {
  const delivery = getTipoInfo("", order.TIPO_MOVIMENTACAO, order.LOCAL_RETIRADA);
  const pct = order.qtdeTotal > 0 ? Math.round((order.qtdeSeparada / order.qtdeTotal) * 100) : 0;
  const operatorInfo = usersCache.get(order.separatorCode) || null;

  const avatarSrc = operatorInfo?.avatar
    ? operatorInfo.avatar.startsWith("data:")
      ? operatorInfo.avatar
      : `data:image/jpeg;base64,${operatorInfo.avatar}`
    : "";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all hover:shadow-md",
        order.isSeparating
          ? "border-emerald-500/30 shadow-emerald-500/5"
          : "border-border/50 hover:border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground tracking-tight">
              #{String(Number(order.FGO_NUMDOC))}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              EMP {order.FGO_CODEMP}
            </span>
            {order.FGO_ENTFUT === "S" && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <CalendarClock className="w-3 h-3" />
                ENCOMENDA
              </span>
            )}
            {order.FGO_SEPIMP === "2" && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                <AlertCircle className="w-3 h-3" />
                ALTERADO
              </span>
            )}
            {order.divergencias.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <AlertTriangle className="w-3 h-3" />
                {order.divergencias.length} FALTA{order.divergencias.length > 1 ? "S" : ""}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground mt-1 truncate">{order.NOME_CLIENTE}</p>
        </div>
        {/* Chat + items buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onViewItems}
            className="p-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Ver itens do pedido"
          >
            <Boxes className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const numDoc = String(order.FGO_NUMDOC).trim();
              window.dispatchEvent(
                new CustomEvent("open-crm-chat", {
                  detail: {
                    doc: numDoc,
                    title: order.NOME_CLIENTE,
                    sellerName: order.separatorName || order.NOME_SEPARADOR || "Separador",
                    sellerCode: order.separatorCode || order.CODIGO_SEPARADOR || "",
                  },
                })
              );
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-[10px] font-semibold transition-colors shrink-0"
            title="Conversar"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Mensagem</span>
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status:</span>
          {order.isSeparating ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Em Separação
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
              Aguardando
            </span>
          )}
        </div>

        {order.isSeparating && (
          <>
            {/* Operator */}
            <div className="flex items-center gap-2.5">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  className="w-7 h-7 rounded-full object-cover"
                  alt={order.separatorName}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  {getInitials(order.separatorName)}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">{order.separatorName}</span>
                <span className="text-[10px] text-muted-foreground">Operador</span>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-semibold text-foreground">
                  {order.qtdeSeparada} / {order.qtdeTotal} SKUs ({pct}%)
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Divergências */}
      {order.divergencias.length > 0 && (
        <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[11px] font-bold text-orange-400">Itens em falta</span>
            </div>
            <button
              onClick={() => {
                const numDoc = String(order.FGO_NUMDOC).trim();
                window.dispatchEvent(
                  new CustomEvent("open-crm-chat", {
                    detail: {
                      doc: numDoc,
                      title: order.NOME_CLIENTE,
                      sellerName: order.separatorName || order.NOME_SEPARADOR || "Separador",
                      sellerCode: order.separatorCode || order.CODIGO_SEPARADOR || "",
                    },
                  })
                );
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-[10px] font-semibold transition-colors"
              title="Conversar com o separador"
            >
              <MessageSquare className="w-3 h-3" />
              Mensagem
            </button>
          </div>
          <div className="space-y-1">
            {order.divergencias.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-orange-300/80 truncate flex-1 mr-2">{d.descricao_produto || d.codigo_produto}</span>
                <span className="text-orange-400 font-semibold whitespace-nowrap">{d.quantidade_separada}/{d.quantidade_pedida}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observação */}
      {order.OBSERVACAO && order.OBSERVACAO.trim() && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-amber-400 leading-tight line-clamp-2">{order.OBSERVACAO}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/30">
        {order.NOME_VENDEDOR && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="w-3 h-3 shrink-0" />
            <span className="font-semibold text-foreground truncate">{order.NOME_VENDEDOR}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDate(order.FGO_DTAENT)} - {order.FGO_HORENT || "--:--"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Balcao2Prazo
              tipoMov={order.TIPO_MOVIMENTACAO}
              localRet={order.LOCAL_RETIRADA}
              dtaent={order.FGO_DTAENT}
              horent={order.FGO_HORENT}
            />
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", delivery.color)}>
              {delivery.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
