import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Users,
  Wallet,
  Percent,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  UserSquare2,
  AlertTriangle,
  Building2,
  RefreshCw,
  Eye,
  ArrowLeftRight,
  X,
  Check,
  Cake,
  MessageCircle,
  ClipboardList,
  Loader2,
  Sparkles,
  Trophy,
  Medal,
} from "lucide-react";
import { cn, formatTeamName } from "@/lib/utils";
import { ClienteKnowledgeChat } from "./ClienteKnowledgeChat";
import {
  apiCarteira,
  apiTransferirCliente,
  apiAtualizarCadastroCliente,
  type CarteiraResponse,
  type CarteiraCliente,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import { fmtBRL, fmtBRLCompact, fmtData } from "../clientes/frv-utils";
import { supabase } from "@/lib/supabase";
import { buildAvatarResolver } from "@/lib/avatar-by-code";
import carflaxLogo from "@/assets/Carflax.png";

// ── Config ───────────────────────────────────────────────────────────────────
const NOW = new Date();
const MES_LABEL = NOW.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const POR_PAGINA = 12; // vendedores por página
const CLI_POR_PAGINA = 100; // clientes por página no drill-down

// ── Ranking IA Modal ─────────────────────────────────────────────────────────
interface RankingEntry {
  cod_vendedor: string;
  nome_vendedor: string;
  total_clientes: number;
  clientes_com_ia: number;
  pct: number;
}

function RankingIAModal({
  carteiraClientes,
  onClose,
}: {
  carteiraClientes?: CarteiraCliente[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);

  useEffect(() => {
    async function load() {
      try {
        // 1. Obter lista de clientes da carteira
        let listaClientes = carteiraClientes || [];
        if (!listaClientes.length) {
          const resp = await apiCarteira();
          listaClientes = resp.clientes || [];
        }

        // 2. Busca todos os registros de cliente_conhecimento do Supabase
        const { data: conhecimento, error: errSupabase } = await supabase
          .from("cliente_conhecimento")
          .select("cliente_id, dados_extraidos, historico, resumo");

        if (errSupabase) {
          console.error("[RankingIA] Erro ao buscar conhecimento no Supabase:", errSupabase);
        }

        // Monta conjunto de cliente_ids com IA preenchida
        const comIA = new Set(
          (conhecimento || [])
            .filter((r) => {
              const d = r.dados_extraidos;
              const h = r.historico;
              const res = r.resumo;
              if (d && typeof d === "object" && !Array.isArray(d) && Object.keys(d as object).length > 0) return true;
              if (Array.isArray(h) && h.length > 0) return true;
              if (res && String(res).trim().length > 0) return true;
              return false;
            })
            .map((r) => String(r.cliente_id).trim())
        );

        // Agrupa por vendedor
        const map = new Map<string, { nome: string; total: number; comIA: number }>();
        for (const c of listaClientes) {
          const key = c.cod_vendedor || "0";
          const nome = c.nome_vendedor || `Vendedor ${key}`;
          const entry = map.get(key) ?? { nome, total: 0, comIA: 0 };
          entry.total += 1;
          if (comIA.has(String(c.cliente_id).trim())) {
            entry.comIA += 1;
          }
          map.set(key, entry);
        }

        const result: RankingEntry[] = Array.from(map.entries())
          .map(([cod, v]) => ({
            cod_vendedor: cod,
            nome_vendedor: v.nome,
            total_clientes: v.total,
            clientes_com_ia: v.comIA,
            pct: v.total > 0 ? Math.round((v.comIA / v.total) * 100) : 0,
          }))
          .sort((a, b) => b.clientes_com_ia - a.clientes_com_ia || b.pct - a.pct)
          .filter((e) => e.total_clientes > 0);

        setRanking(result);
      } catch (err) {
        console.error("[RankingIA]", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [carteiraClientes]);

  const medalColors = ["text-yellow-400", "text-slate-400", "text-amber-600"];
  const medalBg = ["bg-yellow-400/10 border-yellow-400/30", "bg-slate-400/10 border-slate-400/30", "bg-amber-600/10 border-amber-600/30"];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-black text-foreground uppercase tracking-wide">Ranking de Preenchimento IA</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Clientes com dados preenchidos via IA</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
              <p className="text-xs text-muted-foreground font-semibold">Calculando ranking...</p>
            </div>
          ) : ranking.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm font-semibold">
              Nenhum dado encontrado.
            </div>
          ) : (
            ranking.map((entry, idx) => {
              const isTop3 = idx < 3;
              return (
                <div
                  key={entry.cod_vendedor}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isTop3
                      ? `${medalBg[idx]} shadow-sm`
                      : "border-border/50 bg-muted/20"
                  }`}
                >
                  {/* Posição */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isTop3 ? `border ${medalBg[idx]}` : "bg-muted/50"
                  }`}>
                    {isTop3 ? (
                      <Medal className={`w-4 h-4 ${medalColors[idx]}`} />
                    ) : (
                      <span className="text-xs font-black text-muted-foreground">{idx + 1}</span>
                    )}
                  </div>

                  {/* Nome */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{entry.nome_vendedor}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold">Cód. {entry.cod_vendedor}</p>
                  </div>

                  {/* Contagens */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-sm font-black text-foreground">{entry.clientes_com_ia}</span>
                      <span className="text-[10px] text-muted-foreground font-semibold">/ {entry.total_clientes}</span>
                    </div>
                    {/* Barra de progresso */}
                    <div className="mt-1 h-1.5 w-24 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isTop3 ? "bg-yellow-400" : "bg-primary/60"
                        }`}
                        style={{ width: `${entry.pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold mt-0.5">{entry.pct}% preenchido</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/60 bg-muted/20">
          <p className="text-[10px] text-muted-foreground font-semibold text-center">
            Baseado em conversas com o assistente de carteira (IA Gemini)
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface UserProfile {
  id?: string;
  name?: string;
  avatar?: string;
  role?: string;
  department?: string;
  operator_code?: string;
  operatorCode?: string;
  is_admin?: boolean;
  is_leader?: boolean;
}

// Normaliza código de vendedor (remove zeros à esquerda p/ comparação)
// Código do vendedor "ALTERAR VENDEDOR" no ERP: a carteira-depósito onde ficam os
// clientes sem dono (hoje ~15,5 mil). É de lá que o supervisor puxa clientes para
// os vendedores dele, então ela aparece para todo supervisor, além do próprio time.
// Fica FORA dos KPIs — não é carteira de ninguém, e somar 15 mil clientes sem
// faturamento distorceria "clientes ativos" e a margem da equipe.
const COD_CARTEIRA_POOL = "888";

const normCod = (s?: string) => {
  const t = String(s || "").trim();
  return t.replace(/^0+/, "") || t;
};

const isCarteiraPool = (cod?: string) => normCod(cod) === COD_CARTEIRA_POOL;

// Avatar do vendedor na tabela e no cabeçalho do drill-down. A carteira
// ALTERAR VENDEDOR não é uma pessoa: leva o logo da empresa sobre fundo branco
// (o logo é azul e dourado — sobre o card escuro ele sumiria) e inteiro, sem o
// crop do object-cover.
function VendedorAvatar({
  cod,
  nome,
  foto,
  size,
}: {
  cod: string;
  nome: string;
  foto?: string;
  size: "sm" | "md";
}) {
  const box = size === "sm" ? "w-9 h-9" : "w-10 h-10";
  const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  if (isCarteiraPool(cod)) {
    return (
      <div className={cn(box, "shrink-0 rounded-xl bg-white flex items-center justify-center border border-primary/20 overflow-hidden")}>
        <img src={carflaxLogo} alt="Alterar Vendedor" className="w-full h-full object-contain p-1" />
      </div>
    );
  }

  return (
    <div className={cn(box, "shrink-0 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/10 overflow-hidden")}>
      {foto ? (
        <img src={foto} alt={nome} className="w-full h-full object-cover" />
      ) : (
        <UserSquare2 className={cn(icon, "text-primary")} />
      )}
    </div>
  );
}

// Carteira agregada de um vendedor (mês atual)
interface Carteira {
  cod: string;
  nome: string;
  clientes: CarteiraCliente[];
  numClientes: number;
  valorTotal: number;
  margemTotal: number;
  margemPct: number;
  pedidos: number;
  ticketMedio: number;
}

interface RadarOpportunity {
  cliente: CarteiraCliente;
  recenciaDias: number;
  score: number;
}

type VendSortKey = "nome" | "numClientes" | "valorTotal" | "margemTotal" | "pedidos";
type CliSortKey = "nome_cliente" | "valor_mes" | "conversao" | "pedidos_mes" | "recencia_dias";

// Taxa de conversão: vendas faturadas no mês por orçamento aberto no mês. Pode
// passar de 100% (venda direta, sem orçamento). -1 quando não há orçamento, para
// esses clientes irem ao fim na ordenação decrescente.
const taxaConversao = (c: CarteiraCliente) =>
  c.orc_total && c.orc_total > 0 ? (c.pedidos_mes || 0) / c.orc_total : -1;

const getRecenciaDias = (ultimaCompra: string | null) => {
  if (!ultimaCompra) return Infinity;
  const d = new Date(ultimaCompra);
  if (isNaN(d.getTime())) return Infinity;
  const diffTime = Math.abs(NOW.getTime() - d.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// ── Pendências de cadastro ────────────────────────────────────────────────────
// Nascimento e WhatsApp só são cobrados de pessoa física; PJ (CNPJ) não entra.
const pendNascimento = (c: CarteiraCliente) => !!c.pessoa_fisica && !c.data_nascimento;
const pendWhatsapp = (c: CarteiraCliente) => !!c.pessoa_fisica && !c.celular;
const isPendente = (c: CarteiraCliente) => pendNascimento(c) || pendWhatsapp(c);

const formatPhone = (phone?: string | null) => {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.startsWith("55") && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }
  
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
  }
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return phone;
};

// ── Componentes de apoio ─────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  icon: Icon,
  colorClass,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  colorClass: string;
  sub?: string;
}) {
  return (
    <div className="bg-card/40 backdrop-blur-md border border-border/60 rounded-2xl p-5 relative overflow-hidden group hover:border-border/100 hover:bg-card/60 transition-all duration-300 shadow-sm">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">{label}</span>
          <h3 className="text-2xl font-black text-foreground tabular-nums tracking-tight">{value}</h3>
        </div>
        <div className={cn("p-2.5 rounded-xl bg-secondary/50 border border-border/40", colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {sub && (
        <div className="mt-3 pt-2.5 border-t border-border/30">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{sub}</span>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all select-none hover:text-foreground cursor-pointer",
        active ? "text-primary font-black" : "text-muted-foreground",
        className
      )}
    >
      {label}
      <span className="flex flex-col opacity-75">
        <ChevronUp className={cn("w-2 h-2 -mb-0.5 transition-all duration-250", active && direction === "asc" ? "text-primary opacity-100 scale-110" : "opacity-30")} />
        <ChevronDown className={cn("w-2 h-2 transition-all duration-250", active && direction === "desc" ? "text-primary opacity-100 scale-110" : "opacity-30")} />
      </span>
    </button>
  );
}

function Pagination({
  page,
  totalItems,
  perPage,
  onPage,
}: {
  page: number;
  totalItems: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  if (totalItems === 0) return null;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const inicio = (page - 1) * perPage + 1;
  const subTotal = page * perPage;
  const fim = subTotal > totalItems ? totalItems : subTotal;
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/60 bg-muted/10">
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest tabular-nums">
        Exibindo <span className="text-foreground">{inicio}</span>–<span className="text-foreground">{fim}</span> de <span className="text-foreground">{totalItems}</span> registros
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-black text-foreground uppercase tracking-widest tabular-nums">
          Página {page} de {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── View principal ───────────────────────────────────────────────────────────
export function CarteiraView({ userProfile }: { userProfile?: UserProfile }) {
  const [data, setData] = useState<CarteiraResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [vendSort, setVendSort] = useState<{ key: VendSortKey; dir: "asc" | "desc" }>({
    key: "valorTotal",
    dir: "desc",
  });
  const [page, setPage] = useState(1);

  // vendedor selecionado (drill-down)
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [buscaCli, setBuscaCli] = useState("");
  const [cliSort, setCliSort] = useState<{ key: CliSortKey; dir: "asc" | "desc" }>({
    key: "valor_mes",
    dir: "desc",
  });
  const [cliPage, setCliPage] = useState(1);
  const [avatarRows, setAvatarRows] = useState<{ operator_code: string | null; avatar: string | null }[]>([]);
  // Usuários (para montar os times: supervisor via responsavel_id + operator_code)
  const [usuariosOrg, setUsuariosOrg] = useState<
    { id: string; operator_code: string | null; name: string | null; responsavel_id: string | null }[]
  >([]);

  // Transferência de cliente para outro vendedor (admin)
  const [transferindo, setTransferindo] = useState<CarteiraCliente | null>(null);
  const [destinoCod, setDestinoCod] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferErro, setTransferErro] = useState<string | null>(null);

  // Modo "completar cadastro": lista só clientes com nascimento/WhatsApp faltando,
  // com edição inline para preencher e gravar no ERP.
  const [soPendentes, setSoPendentes] = useState(false);
  // Filtro por tipo de pessoa dentro da carteira ALTERAR VENDEDOR (888): são ~15 mil
  // clientes sem dono, e o supervisor puxa de lá separando PJ (CNPJ) de PF (CPF).
  const [filtroPessoa, setFiltroPessoa] = useState<"todos" | "pj" | "pf">("todos");
  const [chatCliente, setChatCliente] = useState<CarteiraCliente | null>(null);
  const [radarAberto, setRadarAberto] = useState(false);
  const [radarDispensado, setRadarDispensado] = useState(false);
  const [showRankingIA, setShowRankingIA] = useState(false);
  const [editNasc, setEditNasc] = useState<Record<string, string>>({});
  const [editWpp, setEditWpp] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErro, setSaveErro] = useState<Record<string, string>>({});

  // Elevado (is_leader/gestor/admin): carrega usuários e habilita ações de gestão.
  const isAdmin =
    userProfile?.is_admin === true ||
    userProfile?.is_leader === true ||
    (userProfile?.role || "").toUpperCase().includes("GERENTE") ||
    (userProfile?.role || "").toUpperCase().includes("DIRETOR") ||
    (userProfile?.role || "").toUpperCase() === "ADMIN";
  // Acesso TOTAL (vê todos os vendedores): admin, diretoria ou gerência. Supervisor de
  // vendas NÃO é acesso total — fica limitado ao próprio time (ver carteirasVisiveis).
  const isFullAccess =
    userProfile?.is_admin === true ||
    (userProfile?.role || "").toUpperCase().includes("GERENTE") ||
    (userProfile?.role || "").toUpperCase().includes("DIRETOR") ||
    (userProfile?.role || "").toUpperCase() === "ADMIN";
  const meuCod = normCod(userProfile?.operator_code || userProfile?.operatorCode);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const resp = await apiCarteira();
      setData(resp);
    } catch (err) {
      console.error("Erro ao carregar Carteira:", err);
      setErro("Não foi possível carregar as carteiras de clientes. Tente novamente.");
    } finally {
      setTimeout(() => setLoading(false), 150);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carrega fotos/avatars de perfil de todos os vendedores do banco de dados (Supabase)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("operator_code, avatar")
        .not("avatar", "is", null);
      if (error) {
        console.error("[CarteiraView] Erro ao carregar avatars dos vendedores:", error);
      }
      if (cancelled || !data) return;
      setAvatarRows(data);
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve avatar por código de vendedor sem colisão de zeros à esquerda.
  const getAvatar = useMemo(() => buildAvatarResolver(avatarRows), [avatarRows]);

  // Carrega os usuários para montar os times (supervisor = responsável por ≥1 pessoa).
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, operator_code, name, responsavel_id");
      if (error) {
        console.error("[CarteiraView] Erro ao carregar usuários (times):", error);
        return;
      }
      if (!cancelled && data) setUsuariosOrg(data);
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Agrupa clientes por vendedor
  const carteiras = useMemo<Carteira[]>(() => {
    if (!Array.isArray(data?.clientes) || data.clientes.length === 0) return [];
    const mapa = new Map<string, CarteiraCliente[]>();
    for (const c of data.clientes) {
      const cod = (c.cod_vendedor || "").trim() || "—";
      if (!mapa.has(cod)) mapa.set(cod, []);
      mapa.get(cod)!.push(c);
    }
    const out: Carteira[] = [];
    for (const [cod, clientes] of mapa) {
      const valorTotal = clientes.reduce((s, c) => s + c.valor_mes, 0);
      const margemTotal = clientes.reduce((s, c) => s + c.margem_mes, 0);
      const pedidos = clientes.reduce((s, c) => s + c.pedidos_mes, 0);
      const nome =
        clientes.find((c) => (c.nome_vendedor || "").trim())?.nome_vendedor?.trim() ||
        (cod === "—" ? "Sem vendedor" : cod);
      out.push({
        cod,
        nome,
        clientes,
        numClientes: clientes.length,
        valorTotal,
        margemTotal,
        margemPct: valorTotal > 0 ? (margemTotal / valorTotal) * 100 : 0,
        pedidos,
        ticketMedio: pedidos > 0 ? valorTotal / pedidos : 0,
      });
    }
    return out;
  }, [data]);

  // Time do usuário LOGADO, se ele for supervisor (responsável por ≥1 pessoa).
  // Usado para limitar a visão de um supervisor de vendas ao próprio time.
  const meuTimeCodes = useMemo(() => {
    if (isFullAccess) return null; // acesso total não precisa de escopo
    const eu = userProfile?.id
      ? usuariosOrg.find((u) => u.id === userProfile.id)
      : usuariosOrg.find((u) => meuCod && normCod(u.operator_code || undefined) === meuCod);
    if (!eu) return null;
    const reports = usuariosOrg.filter((u) => u.responsavel_id === eu.id);
    if (reports.length === 0) return null; // não é supervisor
    const codes = new Set<string>();
    if (eu.operator_code) codes.add(normCod(eu.operator_code));
    reports.forEach((m) => { if (m.operator_code) codes.add(normCod(m.operator_code)); });
    return codes;
  }, [isFullAccess, usuariosOrg, userProfile?.id, meuCod]);

  // Escopo por permissão: acesso total vê todos; supervisor vê só o próprio time;
  // vendedor comum vê só a própria carteira.
  const carteirasVisiveis = useMemo(() => {
    if (isFullAccess) return carteiras;
    if (meuTimeCodes)
      return carteiras.filter(
        (v) => meuTimeCodes.has(normCod(v.cod)) || normCod(v.cod) === COD_CARTEIRA_POOL
      );
    if (meuCod) return carteiras.filter((v) => normCod(v.cod) === meuCod);
    return carteiras;
  }, [carteiras, isFullAccess, meuTimeCodes, meuCod]);

  const showBackButton = isAdmin || carteirasVisiveis.length > 1;

  // Times: agrupa vendedores por supervisor (responsavel_id). Só inclui times com ao
  // menos um vendedor que tenha carteira visível. Valor do filtro: "time:<supId>".
  const times = useMemo(() => {
    if (!isFullAccess || usuariosOrg.length === 0) return [];
    const membrosPorResp = new Map<string, typeof usuariosOrg>();
    for (const u of usuariosOrg) {
      if (!u.responsavel_id) continue;
      if (!membrosPorResp.has(u.responsavel_id)) membrosPorResp.set(u.responsavel_id, []);
      membrosPorResp.get(u.responsavel_id)!.push(u);
    }
    const byId = new Map(usuariosOrg.map((u) => [u.id, u]));
    const out: { id: string; nome: string; codes: string[] }[] = [];
    for (const [supId, membros] of membrosPorResp) {
      const sup = byId.get(supId);
      if (!sup) continue;
      const codes = new Set<string>();
      if (sup.operator_code) codes.add(normCod(sup.operator_code));
      membros.forEach((m) => { if (m.operator_code) codes.add(normCod(m.operator_code)); });
      const codesComDados = [...codes].filter((c) =>
        carteirasVisiveis.some((v) => normCod(v.cod) === c)
      );
      if (codesComDados.length === 0) continue;
      out.push({ id: supId, nome: formatTeamName(sup.name), codes: codesComDados });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [isFullAccess, usuariosOrg, carteirasVisiveis]);

  // Códigos (normalizados) do time atualmente selecionado no filtro, se houver.
  const codesDoTimeFiltrado = useMemo(() => {
    if (!filtroVendedor.startsWith("time:")) return null;
    return times.find((t) => `time:${t.id}` === filtroVendedor)?.codes ?? [];
  }, [filtroVendedor, times]);

  // Testa se uma carteira passa no filtro de vendedor/time selecionado.
  const matchFiltro = useCallback(
    (v: Carteira) => {
      if (filtroVendedor === "todos") return true;
      if (codesDoTimeFiltrado) return codesDoTimeFiltrado.includes(normCod(v.cod));
      return v.cod === filtroVendedor;
    },
    [filtroVendedor, codesDoTimeFiltrado]
  );

  // Opções do filtro: Todos + grupo de Times + grupo de Vendedores
  const vendedorOptions = useMemo(() => {
    const vendedores = [...carteirasVisiveis]
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((v) => ({ label: `${v.nome} (${v.cod})`, value: v.cod }));
    return [
      { label: "Todos os vendedores", value: "todos" },
      ...(times.length > 0
        ? [
            { label: "Times", value: "__hdr_times", isHeader: true },
            ...times.map((t) => ({ label: t.nome, value: `time:${t.id}` })),
            { label: "Vendedores", value: "__hdr_vend", isHeader: true },
          ]
        : []),
      ...vendedores,
    ];
  }, [carteirasVisiveis, times]);

  // KPIs globais
  const kpis = useMemo(() => {
    // Em "todos", a carteira-depósito (ALTERAR VENDEDOR) fica fora dos totais da
    // equipe. Se o usuário selecionar ela no filtro, aí sim os KPIs são dela.
    const base =
      filtroVendedor !== "todos"
        ? carteirasVisiveis.filter(matchFiltro)
        : carteirasVisiveis.filter((v) => normCod(v.cod) !== COD_CARTEIRA_POOL);
    const totalVend = base.length;
    const totalCli = base.reduce((s, v) => s + v.numClientes, 0);
    const totalValor = base.reduce((s, v) => s + v.valorTotal, 0);
    const totalMargem = base.reduce((s, v) => s + v.margemTotal, 0);
    return {
      totalVend,
      totalCli,
      totalValor,
      margemPct: totalValor > 0 ? (totalMargem / totalValor) * 100 : 0,
    };
  }, [carteirasVisiveis, filtroVendedor, matchFiltro]);

  // Lista ordenada + filtrada
  const carteirasFiltradas = useMemo(() => {
    let arr = carteirasVisiveis;
    if (filtroVendedor !== "todos") arr = arr.filter(matchFiltro);
    const q = busca.trim().toLowerCase();
    if (q) arr = arr.filter((v) => v.nome.toLowerCase().includes(q) || v.cod.toLowerCase().includes(q));
    const { key, dir } = vendSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (key === "nome") return a.nome.localeCompare(b.nome) * mult;
      return ((a[key] as number) - (b[key] as number)) * mult;
    });
  }, [carteirasVisiveis, filtroVendedor, busca, vendSort, matchFiltro]);

  useEffect(() => {
    setPage(1);
  }, [busca, filtroVendedor, vendSort]);

  const totalPages = Math.max(1, Math.ceil(carteirasFiltradas.length / POR_PAGINA));
  const pageSafe = Math.min(page, totalPages);
  const carteirasPagina = useMemo(
    () => carteirasFiltradas.slice((pageSafe - 1) * POR_PAGINA, pageSafe * POR_PAGINA),
    [carteirasFiltradas, pageSafe]
  );

  const carteiraSel = useMemo(
    () => carteirasVisiveis.find((v) => v.cod === selecionado) || null,
    [carteirasVisiveis, selecionado]
  );

  // MVP do Radar Comercial: prioriza clientes que já compram bem, mas estão há
  // tempo suficiente sem comprar. Quando houver dados de mix/estoque/rota no
  // backend, estes sinais entram aqui para substituir a estimativa local.
  const radarOportunidade = useMemo<RadarOpportunity | null>(() => {
    if (!carteiraSel || isCarteiraPool(carteiraSel.cod)) return null;
    const candidatos = carteiraSel.clientes
      .map((cliente) => {
        const recenciaDias = getRecenciaDias(cliente.ultima_compra);
        const conversao = taxaConversao(cliente);
        const score =
          Math.min(recenciaDias, 120) * 1.2 +
          Math.min(cliente.valor_mes || 0, 15000) / 180 +
          Math.max(0, conversao) * 18;
        return { cliente, recenciaDias, score };
      })
      .filter(({ cliente, recenciaDias }) =>
        Number.isFinite(recenciaDias) && recenciaDias >= 14 && recenciaDias <= 120 && (cliente.valor_mes || 0) > 0,
      )
      .sort((a, b) => b.score - a.score);
    return candidatos[0] || null;
  }, [carteiraSel]);

  useEffect(() => {
    if (!radarOportunidade) return;
    const key = `carflax-radar-dismissed-${new Date().toISOString().slice(0, 10)}-${radarOportunidade.cliente.cliente_id}`;
    setRadarDispensado(localStorage.getItem(key) === "1");
    const timeout = window.setTimeout(() => setRadarAberto(true), 700);
    return () => window.clearTimeout(timeout);
  }, [radarOportunidade]);

  const dispensarRadar = useCallback(() => {
    if (radarOportunidade) {
      const key = `carflax-radar-dismissed-${new Date().toISOString().slice(0, 10)}-${radarOportunidade.cliente.cliente_id}`;
      localStorage.setItem(key, "1");
    }
    setRadarDispensado(true);
    setRadarAberto(false);
  }, [radarOportunidade]);

  useEffect(() => {
    if (!loading && !isAdmin && carteirasVisiveis.length === 1 && !selecionado) {
      setSelecionado(carteirasVisiveis[0].cod);
    }
  }, [loading, isAdmin, carteirasVisiveis, selecionado]);

  // Nº de clientes com cadastro pendente (nascimento p/ PF e/ou WhatsApp)
  const pendentesCount = useMemo(
    () => (carteiraSel ? carteiraSel.clientes.filter(isPendente).length : 0),
    [carteiraSel]
  );

  // Quantos clientes da carteira são PJ (CNPJ) e PF (CPF) — rótulo do filtro
  const contagemPessoa = useMemo(() => {
    const base = carteiraSel ? carteiraSel.clientes : [];
    const pf = base.filter((c) => !!c.pessoa_fisica).length;
    return { pf, pj: base.length - pf, todos: base.length };
  }, [carteiraSel]);

  // Sai do modo pendências ao trocar de vendedor
  useEffect(() => {
    setSoPendentes(false);
    setFiltroPessoa("todos");
    setSaveErro({});
  }, [selecionado]);

  // Clientes do vendedor selecionado
  const clientesSel = useMemo(() => {
    if (!carteiraSel) return [];
    let arr = carteiraSel.clientes;
    if (soPendentes) arr = arr.filter(isPendente);
    if (isCarteiraPool(carteiraSel.cod) && filtroPessoa !== "todos")
      arr = arr.filter((c) => (filtroPessoa === "pf" ? !!c.pessoa_fisica : !c.pessoa_fisica));
    const q = buscaCli.trim().toLowerCase();
    if (q) arr = arr.filter((c) => (c.nome_cliente || "").toLowerCase().includes(q));
    const { key, dir } = cliSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (key === "nome_cliente") return (a.nome_cliente || "").localeCompare(b.nome_cliente || "") * mult;
      if (key === "recencia_dias") {
        const aDays = getRecenciaDias(a.ultima_compra);
        const bDays = getRecenciaDias(b.ultima_compra);
        return (aDays - bDays) * mult;
      }
      if (key === "conversao") return (taxaConversao(a) - taxaConversao(b)) * mult;
      return (((a[key] as number) || 0) - ((b[key] as number) || 0)) * mult;
    });
  }, [carteiraSel, buscaCli, cliSort, soPendentes, filtroPessoa]);

  useEffect(() => {
    setCliPage(1);
  }, [buscaCli, cliSort, selecionado, soPendentes, filtroPessoa]);

  const cliTotalPages = Math.max(1, Math.ceil(clientesSel.length / CLI_POR_PAGINA));
  const cliPageSafe = Math.min(cliPage, cliTotalPages);
  const clientesPagina = useMemo(
    () => clientesSel.slice((cliPageSafe - 1) * CLI_POR_PAGINA, cliPageSafe * CLI_POR_PAGINA),
    [clientesSel, cliPageSafe]
  );

  const toggleVendSort = (key: VendSortKey) =>
    setVendSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const toggleCliSort = (key: CliSortKey) =>
    setCliSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  // Vendedores de destino para transferência (todos com meta no mês, exclui o vendedor atual).
  // Supervisor só transfere para dentro do próprio time — ele enxerga a carteira
  // ALTERAR VENDEDOR justamente para puxar cliente de lá, não para mandar cliente
  // a outra equipe.
  const destinoOptions = useMemo(() => {
    const atual = (transferindo?.cod_vendedor || "").trim();
    const permitido = (cod: string) =>
      cod !== atual && (isFullAccess || !meuTimeCodes || meuTimeCodes.has(normCod(cod)));

    // Usa a lista de vendedores com meta vinda do backend (CADMET)
    if (data?.vendedores?.length) {
      return data.vendedores
        .filter((v) => permitido(v.cod))
        .map((v) => ({ label: `${v.nome} (${v.cod})`, value: v.cod }));
    }
    // Fallback: usa os vendedores que já têm clientes na carteira
    return [...carteiras]
      .filter((v) => v.cod !== "—" && permitido(v.cod))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((v) => ({ label: `${v.nome} (${v.cod})`, value: v.cod }));
  }, [data?.vendedores, carteiras, transferindo, isFullAccess, meuTimeCodes]);

  const abrirTransferencia = (c: CarteiraCliente) => {
    setTransferindo(c);
    setDestinoCod("");
    setTransferErro(null);
  };

  const handleTransferir = async () => {
    if (!transferindo || !destinoCod || transferLoading) return;
    setTransferLoading(true);
    setTransferErro(null);
    try {
      await apiTransferirCliente(transferindo.cliente_id, destinoCod);
      setTransferindo(null);
      await loadData(); // recarrega para refletir a nova carteira
    } catch (err) {
      console.error("Erro ao transferir cliente:", err);
      setTransferErro("Não foi possível transferir o cliente no ERP. Tente novamente.");
    } finally {
      setTransferLoading(false);
    }
  };

  // Salva nascimento/WhatsApp de um cliente no ERP e reflete localmente.
  const handleSalvarCadastro = async (c: CarteiraCliente) => {
    const id = c.cliente_id;
    if (savingId) return;

    const nascInput = pendNascimento(c) ? (editNasc[id] || "").trim() : "";
    const wppInput = pendWhatsapp(c) ? (editWpp[id] || "").trim() : "";
    if (!nascInput && !wppInput) return;

    // Validação leve do WhatsApp (10 ou 11 dígitos)
    if (wppInput) {
      const digits = wppInput.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 11) {
        setSaveErro((s) => ({ ...s, [id]: "WhatsApp inválido (DDD + número)" }));
        return;
      }
    }

    setSavingId(id);
    setSaveErro((s) => { const n = { ...s }; delete n[id]; return n; });
    try {
      const resp = await apiAtualizarCadastroCliente(id, {
        dataNascimento: nascInput || undefined,
        telefoneCelular: wppInput || undefined,
      });
      // Reflete no estado local para a pendência sumir sem recarregar tudo
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          clientes: prev.clientes.map((cli) =>
            cli.cliente_id === id
              ? {
                  ...cli,
                  data_nascimento: resp.data_nascimento ?? cli.data_nascimento,
                  celular: resp.celular ?? cli.celular,
                }
              : cli
          ),
        };
      });
      setEditNasc((s) => { const n = { ...s }; delete n[id]; return n; });
      setEditWpp((s) => { const n = { ...s }; delete n[id]; return n; });
    } catch (err) {
      console.error("Erro ao salvar cadastro do cliente:", err);
      setSaveErro((s) => ({ ...s, [id]: "Não foi possível salvar no ERP. Tente novamente." }));
    } finally {
      setSavingId(null);
    }
  };

  // Helper para renderizar crachá de margem de forma elegante
  const renderMarginBadge = (pct: number) => {
    let color = "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (pct >= 30) color = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    else if (pct >= 18) color = "text-blue-500 bg-blue-500/10 border-blue-500/20";
    else if (pct >= 12) color = "text-amber-500 bg-amber-500/10 border-amber-500/20";

    return (
      <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black border tracking-wider", color)}>
        {pct.toFixed(1).replace(".", ",")}%
      </span>
    );
  };

  // Conversão do mês: orçamentos abertos (esquerda) x vendas faturadas (direita).
  // As duas pontas vêm de fontes diferentes — orçamento da FATGOR, venda do
  // faturamento — então o par não é subconjunto: venda direta (pedido que não
  // passou por orçamento) aparece como 0/1, e o % pode passar de 100%.
  const renderConversao = (c: CarteiraCliente) => {
    const orcamentos = c.orc_total || 0;
    const vendas = c.pedidos_mes || 0;

    // Sem nenhum movimento no mês: nada a converter.
    if (orcamentos === 0 && vendas === 0) {
      return (
        <div className="inline-flex flex-col items-end gap-0.5">
          <span className="font-black text-muted-foreground/50 tabular-nums">0/0</span>
          <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider">
            sem movimento no mês
          </span>
        </div>
      );
    }

    const pct = orcamentos > 0 ? (vendas / orcamentos) * 100 : null;
    let color = "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (pct !== null) {
      if (pct >= 60) color = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      else if (pct >= 30) color = "text-amber-500 bg-amber-500/10 border-amber-500/20";
    }

    return (
      <div className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="font-black text-foreground tabular-nums"
            title={`${orcamentos} orçamento(s) no mês · ${vendas} venda(s) faturada(s)`}
          >
            {orcamentos}/{vendas}
          </span>
          {pct !== null ? (
            <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-black border tracking-wider", color)}>
              {pct.toFixed(0)}%
            </span>
          ) : (
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-black border tracking-wider text-blue-500 bg-blue-500/10 border-blue-500/20"
              title="Faturou sem orçamento aberto no mês"
            >
              direta
            </span>
          )}
        </span>
        <span className="text-[9px] font-bold text-muted-foreground tabular-nums">
          {fmtBRLCompact(c.orc_valor_total || 0)} / {fmtBRLCompact(c.valor_mes || 0)}
        </span>
      </div>
    );
  };

  // Helper para renderizar recência do cliente com bolinha de status
  const renderRecenciaBadge = (ultimaCompra: string | null) => {
    if (!ultimaCompra) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-secondary/50 text-muted-foreground border border-border/40">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
          Sem compras
        </span>
      );
    }
    const days = getRecenciaDias(ultimaCompra);
    let text = `Há ${days} dias`;
    let color = "bg-rose-500";
    let badgeCls = "bg-rose-500/10 text-rose-500 border-rose-500/20";

    if (days === 0) {
      text = "Hoje";
      color = "bg-emerald-500";
      badgeCls = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    } else if (days === 1) {
      text = "Ontem";
      color = "bg-emerald-500";
      badgeCls = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    } else if (days <= 30) {
      color = "bg-emerald-500";
      badgeCls = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    } else if (days <= 60) {
      color = "bg-amber-500";
      badgeCls = "bg-amber-500/10 text-amber-500 border-amber-500/20";
    }

    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border", badgeCls)}>
        <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", color)} />
        {text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="h-full bg-background overflow-y-auto scrollbar-hide p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-border/60 pb-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="h-full bg-background flex flex-col items-center justify-center gap-4 p-6">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
          <AlertTriangle className="w-8 h-8 text-rose-500" />
        </div>
        <p className="text-sm font-bold text-foreground text-center max-w-sm">{erro}</p>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  // ── Drill-down: carteira de um vendedor ───────────────────────────────────────
  if (carteiraSel) {
    return (
      <div className="h-full bg-background overflow-y-auto scrollbar-hide p-6 space-y-6">
        {/* Header — tudo numa linha só */}
        <div className="flex flex-wrap items-center gap-3">
          {showBackButton && (
            <button
              onClick={() => {
                setSelecionado(null);
                setBuscaCli("");
              }}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border hover:shadow-sm transition-all cursor-pointer"
              title="Voltar para a lista"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <VendedorAvatar cod={carteiraSel.cod} nome={carteiraSel.nome} foto={getAvatar(carteiraSel.cod)} size="md" />
          <div className="min-w-0 mr-auto">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded uppercase tracking-wider whitespace-nowrap">Cód. {carteiraSel.cod}</span>
              <h2 className="text-lg font-black text-foreground tracking-tight leading-none truncate">{carteiraSel.nome}</h2>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 truncate">
              Análise da carteira de clientes ativos · {MES_LABEL}
            </p>
          </div>

          {/* Filtro CNPJ / CPF — só na carteira ALTERAR VENDEDOR (888) */}
          {isCarteiraPool(carteiraSel.cod) && (
            <div className="inline-flex shrink-0 items-center h-10 p-1 rounded-xl border border-border/80 bg-card/50">
              {([
                { key: "todos", label: "Todos", count: contagemPessoa.todos },
                { key: "pj", label: "CNPJ", count: contagemPessoa.pj },
                { key: "pf", label: "CPF", count: contagemPessoa.pf },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setFiltroPessoa(opt.key)}
                  title={
                    opt.key === "pj"
                      ? "Somente pessoa jurídica (CNPJ)"
                      : opt.key === "pf"
                      ? "Somente pessoa física (CPF)"
                      : "Todos os clientes da carteira"
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95",
                    filtroPessoa === opt.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                  <span
                    className={cn(
                      "text-[10px] font-black tabular-nums",
                      filtroPessoa === opt.key ? "opacity-80" : "opacity-60"
                    )}
                  >
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setSoPendentes((v) => !v)}
            title="Clientes sem data de nascimento (pessoa física) ou WhatsApp cadastrado"
            className={cn(
              "inline-flex shrink-0 items-center gap-2 px-3.5 h-10 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 whitespace-nowrap",
              soPendentes
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-border/80 bg-card/50 text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <ClipboardList className="w-4 h-4" />
            Completar cadastro
            {pendentesCount > 0 && (
              <span className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black tabular-nums",
                soPendentes ? "bg-amber-500 text-white" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              )}>
                {pendentesCount}
              </span>
            )}
          </button>

          <div className="relative min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={buscaCli}
              onChange={(e) => setBuscaCli(e.target.value)}
              placeholder="Pesquisar cliente..."
              className="w-full pl-9 pr-3 h-10 rounded-xl border border-border/80 bg-card/50 text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Tabela de completar cadastro (nascimento / WhatsApp) */}
        {soPendentes && (
          <div className="bg-card border border-amber-500/25 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-500/20 bg-amber-500/5">
              <ClipboardList className="w-4 h-4 text-amber-500" />
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Completar cadastro
              </p>
              <span className="text-[10px] font-bold text-muted-foreground normal-case tracking-normal">
                Preencha os dados faltantes e salve direto no ERP. Nascimento é cobrado só de pessoa física.
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                    <th className="text-left px-5 py-3.5">
                      <SortHeader label="Cliente / Razão Social" active={cliSort.key === "nome_cliente"} direction={cliSort.dir} onClick={() => toggleCliSort("nome_cliente")} />
                    </th>
                    <th className="text-left px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">
                        <Cake className="w-3.5 h-3.5" /> Nascimento
                      </span>
                    </th>
                    <th className="text-left px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </span>
                    </th>
                    <th className="text-right px-5 py-3.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">Ação</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/65">
                  {clientesPagina.map((c) => {
                    const id = c.cliente_id;
                    const precisaNasc = pendNascimento(c);
                    const precisaWpp = pendWhatsapp(c);
                    const nascVal = editNasc[id] ?? "";
                    const wppVal = editWpp[id] ?? "";
                    const podeSalvar =
                      (precisaNasc && nascVal.trim() !== "") || (precisaWpp && wppVal.trim() !== "");
                    const salvando = savingId === id;
                    return (
                      <tr key={id} className="hover:bg-muted/30 transition-colors align-top">
                        <td className="px-5 py-4">
                          <p className="font-black text-foreground leading-snug">{c.nome_cliente}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                            Cód. {id} · {c.pessoa_fisica ? "Pessoa Física" : "Pessoa Jurídica"}
                          </p>
                          {saveErro[id] && (
                            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-1">{saveErro[id]}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {precisaNasc ? (
                            <input
                              type="date"
                              value={nascVal}
                              onChange={(e) => setEditNasc((s) => ({ ...s, [id]: e.target.value }))}
                              className="w-40 px-3 h-9 rounded-lg border border-border bg-card text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            />
                          ) : c.data_nascimento ? (
                            <span className="font-bold text-foreground tabular-nums">{fmtData(c.data_nascimento)}</span>
                          ) : (
                            <span className="text-muted-foreground/45 font-medium">N/A</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {precisaWpp ? (
                            <input
                              type="tel"
                              inputMode="numeric"
                              value={wppVal}
                              onChange={(e) => setEditWpp((s) => ({ ...s, [id]: e.target.value }))}
                              placeholder="11 91234-5678"
                              className="w-44 px-3 h-9 rounded-lg border border-border bg-card text-xs font-semibold text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            />
                          ) : (
                            <span className="font-bold text-foreground tabular-nums">{formatPhone(c.celular)}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => handleSalvarCadastro(c)}
                            disabled={!podeSalvar || salvando}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                          >
                            {salvando ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando</>
                            ) : (
                              <><Check className="w-3.5 h-3.5" /> Salvar</>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {clientesSel.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/5">
                        {pendentesCount === 0
                          ? "Nenhuma pendência de cadastro nesta carteira 🎉"
                          : "Nenhum cliente pendente encontrado na busca"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={cliPageSafe} totalItems={clientesSel.length} perPage={CLI_POR_PAGINA} onPage={setCliPage} />
          </div>
        )}

        {/* Tabela de clientes */}
        {!soPendentes && (
        <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                  <th className="text-left px-5 py-3.5">
                    <SortHeader label="Cliente / Razão Social" active={cliSort.key === "nome_cliente"} direction={cliSort.dir} onClick={() => toggleCliSort("nome_cliente")} />
                  </th>
                  <th className="text-left px-5 py-3.5 hidden sm:table-cell">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">Telefone</span>
                  </th>
                  <th className="text-right px-5 py-3.5">
                    <SortHeader label="Faturamento" active={cliSort.key === "valor_mes"} direction={cliSort.dir} onClick={() => toggleCliSort("valor_mes")} className="justify-end" />
                  </th>
                  <th className="text-right px-5 py-3.5 hidden md:table-cell">
                    <SortHeader label="Conversão" active={cliSort.key === "conversao"} direction={cliSort.dir} onClick={() => toggleCliSort("conversao")} className="justify-end" />
                  </th>
                  <th className="text-left px-5 py-3.5 hidden lg:table-cell">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">Vend. Última Venda</span>
                  </th>
                  <th className="text-right px-5 py-3.5">
                    <SortHeader label="Recência" active={cliSort.key === "recencia_dias"} direction={cliSort.dir} onClick={() => toggleCliSort("recencia_dias")} className="justify-end" />
                  </th>
                  {isAdmin && (
                    <th className="text-right px-5 py-3.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">Ações</span>
                    </th>
                  )}
                  <th className="text-center px-3 py-3.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">Info</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/65">
                {clientesPagina.map((c) => {
                  return (
                    <tr key={c.cliente_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-black text-foreground leading-snug">{c.nome_cliente}</p>
                        {c.empresa && (
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mt-1">
                            <Building2 className="w-3.5 h-3.5 text-primary/70" /> {c.empresa}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell text-left">
                        {c.telefone_cliente ? (
                          <span className="font-bold text-foreground tabular-nums select-all hover:text-primary transition-colors">
                            {formatPhone(c.telefone_cliente)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/45 font-medium">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-black text-foreground tabular-nums">{fmtBRL(c.valor_mes)}</td>
                      <td className="px-5 py-4 text-right tabular-nums hidden md:table-cell">
                        {renderConversao(c)}
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        {c.nome_vendedor_ultima_venda ? (
                          <div className="min-w-0">
                            <p className="font-bold text-foreground leading-tight truncate max-w-[160px]">{c.nome_vendedor_ultima_venda}</p>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{c.cod_vendedor_ultima_venda}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/45 font-medium">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums">
                        <div className="inline-flex flex-col items-end gap-1">
                          {renderRecenciaBadge(c.ultima_compra)}
                          {c.ultima_compra && <span className="text-[9px] font-bold text-muted-foreground/60">{fmtData(c.ultima_compra)}</span>}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => abrirTransferencia(c)}
                            title="Transferir cliente para outro vendedor"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" /> Transferir
                          </button>
                        </td>
                      )}
                      <td className="px-3 py-4 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setChatCliente(c); }}
                          title="Conhecimento do cliente"
                          className="inline-flex items-center justify-center p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {clientesSel.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-5 py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/5">
                      Nenhum cliente com movimento nesta carteira
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={cliPageSafe} totalItems={clientesSel.length} perPage={CLI_POR_PAGINA} onPage={setCliPage} />
        </div>
        )}

        {transferindo &&
          createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => !transferLoading && setTransferindo(null)}
              />
              <div className="relative w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ArrowLeftRight className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-foreground leading-tight">Transferir cliente</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Altera o vendedor no ERP</p>
                    </div>
                  </div>
                  <button
                    onClick={() => !transferLoading && setTransferindo(null)}
                    className="p-2 hover:bg-secondary rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-card p-3 mb-3">
                  <p className="font-black text-foreground leading-tight">{transferindo.nome_cliente}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                    Cód. {transferindo.cliente_id} · Atual: {transferindo.nome_vendedor || transferindo.cod_vendedor || "—"}
                  </p>
                </div>

                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Novo vendedor</label>
                <select
                  value={destinoCod}
                  onChange={(e) => setDestinoCod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Selecione o vendedor de destino…</option>
                  {destinoOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {transferErro && (
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-2">{transferErro}</p>
                )}

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={handleTransferir}
                    disabled={!destinoCod || transferLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-[11px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {transferLoading ? "Transferindo…" : <><Check className="w-4 h-4" /> Confirmar transferência</>}
                  </button>
                  <button
                    onClick={() => setTransferindo(null)}
                    disabled={transferLoading}
                    className="rounded-xl border border-border bg-card px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {chatCliente && (
          <ClienteKnowledgeChat
            cliente={chatCliente}
            userName={userProfile?.name}
            userAvatar={userProfile?.avatar || getAvatar(chatCliente.cod_vendedor)}
            initialPrompt={
              radarOportunidade?.cliente.cliente_id === chatCliente.cliente_id
                ? `Analise a melhor oportunidade de recompra para ${chatCliente.nome_cliente}. Considere que a última compra foi há ${radarOportunidade.recenciaDias} dias e monte uma abordagem comercial objetiva.`
                : undefined
            }
            onClose={() => setChatCliente(null)}
          />
        )}

        {radarOportunidade && radarAberto && !radarDispensado && !chatCliente && (
          <div className="fixed right-5 bottom-5 z-[150] w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-violet-500/25 bg-card shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-primary to-cyan-400" />
            <div className="p-5 pt-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-500">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-500">Radar Carflax · oportunidade</p>
                  <h3 className="mt-1 truncate text-sm font-black text-foreground">{radarOportunidade.cliente.nome_cliente}</h3>
                </div>
                <button onClick={dispensarRadar} title="Dispensar por hoje" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-xs font-medium leading-relaxed text-muted-foreground">
                Comprou <strong className="font-black text-foreground">{fmtBRL(radarOportunidade.cliente.valor_mes)}</strong> neste mês e está há <strong className="font-black text-foreground">{radarOportunidade.recenciaDias} dias</strong> sem comprar. Vale analisar a próxima necessidade antes de uma nova cotação.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => {
                    setRadarAberto(false);
                    setChatCliente(radarOportunidade.cliente);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="h-4 w-4" /> Ver sugestão
                </button>
                <button onClick={dispensarRadar} className="rounded-xl border border-border px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Hoje não</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Lista de carteiras ────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-background overflow-y-auto scrollbar-hide p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase leading-none">
            {isAdmin ? "Gestão de Carteiras" : "Minha Carteira"}
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Métricas consolidadas de clientes por vendedor · {MES_LABEL}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowRankingIA(true)}
              title="Ranking de preenchimento IA"
              className="w-10 h-10 rounded-xl border border-yellow-400/40 bg-yellow-400/10 flex items-center justify-center text-yellow-400 hover:bg-yellow-400/20 hover:border-yellow-400/60 active:scale-95 transition-all cursor-pointer"
            >
              <Trophy className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/80 bg-card text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {/* Cards de KPIs Globais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Vendedores Ativos" value={String(kpis.totalVend)} icon={UserSquare2} colorClass="text-blue-500 bg-blue-500/10 border-blue-500/20" sub="equipe com faturamento" />
        <KpiCard label="Clientes Ativos" value={String(kpis.totalCli)} icon={Users} colorClass="text-cyan-500 bg-cyan-500/10 border-cyan-500/20" sub="compraram no período" />
        <KpiCard label="Faturamento Total" value={fmtBRL(kpis.totalValor)} icon={Wallet} colorClass="text-emerald-500 bg-emerald-500/10 border-emerald-500/20" sub={MES_LABEL} />
        <KpiCard label="Margem Média" value={`${kpis.margemPct.toFixed(1).replace(".", ",")}%`} icon={Percent} colorClass="text-violet-500 bg-violet-500/10 border-violet-500/20" sub="consolidada da equipe" />
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar vendedor por nome ou código..."
            className="w-full pl-9 pr-3 h-10 rounded-xl border border-border/85 bg-card/50 text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        {isAdmin && (
          <TinyDropdown
            icon={UserSquare2}
            value={filtroVendedor}
            options={vendedorOptions}
            onChange={setFiltroVendedor}
            variant="blue"
            className="min-w-[220px] max-w-[280px]"
          />
        )}
      </div>

      {/* Tabela Principal */}
      <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                <th className="text-left px-5 py-3.5">
                  <SortHeader label="Vendedor" active={vendSort.key === "nome"} direction={vendSort.dir} onClick={() => toggleVendSort("nome")} />
                </th>
                <th className="text-right px-5 py-3.5">
                  <SortHeader label="Clientes Ativos" active={vendSort.key === "numClientes"} direction={vendSort.dir} onClick={() => toggleVendSort("numClientes")} className="justify-end" />
                </th>
                <th className="text-right px-5 py-3.5">
                  <SortHeader label="Faturamento" active={vendSort.key === "valorTotal"} direction={vendSort.dir} onClick={() => toggleVendSort("valorTotal")} className="justify-end" />
                </th>
                <th className="text-right px-5 py-3.5 hidden md:table-cell">
                  <SortHeader label="Margem Média" active={vendSort.key === "margemTotal"} direction={vendSort.dir} onClick={() => toggleVendSort("margemTotal")} className="justify-end" />
                </th>
                <th className="text-right px-5 py-3.5 hidden sm:table-cell">
                  <SortHeader label="Pedidos" active={vendSort.key === "pedidos"} direction={vendSort.dir} onClick={() => toggleVendSort("pedidos")} className="justify-end" />
                </th>
                <th className="w-14 px-3 py-3.5 text-center text-muted-foreground uppercase font-black tracking-widest">Detalhar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/65">
              {carteirasPagina.map((v) => (
                <tr
                  key={v.cod}
                  onClick={() => {
                    setSelecionado(v.cod);
                    setCliSort({ key: "valor_mes", dir: "desc" });
                  }}
                  className="hover:bg-muted/40 transition-colors cursor-pointer group"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <VendedorAvatar cod={v.cod} nome={v.nome} foto={getAvatar(v.cod)} size="sm" />
                      <div className="min-w-0">
                        <p className="font-black text-foreground leading-tight truncate group-hover:text-primary transition-colors">{v.nome}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Cód. {v.cod}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-black text-foreground tabular-nums">{v.numClientes}</td>
                  <td className="px-5 py-4 text-right font-black text-foreground tabular-nums">{fmtBRL(v.valorTotal)}</td>
                  <td className="px-5 py-4 text-right tabular-nums hidden md:table-cell">
                    {renderMarginBadge(v.margemPct)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums hidden sm:table-cell font-bold text-muted-foreground">{v.pedidos}</td>
                  <td className="px-3 py-4 text-center">
                    <button className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border bg-card/60 text-muted-foreground group-hover:text-primary group-hover:border-primary/40 group-hover:shadow-sm active:scale-90 transition-all cursor-pointer">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {carteirasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/5">
                    Nenhum registro de carteira encontrado para {MES_LABEL}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pageSafe} totalItems={carteirasFiltradas.length} perPage={POR_PAGINA} onPage={setPage} />
      </div>

      {chatCliente && (
        <ClienteKnowledgeChat
          cliente={chatCliente}
          userName={userProfile?.name}
          userAvatar={userProfile?.avatar || getAvatar(chatCliente.cod_vendedor)}
          onClose={() => setChatCliente(null)}
        />
      )}

      {showRankingIA && (
        <RankingIAModal carteiraClientes={data?.clientes} onClose={() => setShowRankingIA(false)} />
      )}
    </div>
  );
}
