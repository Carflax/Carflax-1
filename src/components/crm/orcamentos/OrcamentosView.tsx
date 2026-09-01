import { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Package,
  MessageSquare,
  X,
  Send,
  Handshake,
  XCircle,
  Download,
  Tag,
  PhoneIncoming,
  PhoneOff,
  MapPin,
  Loader2,
  Clock
} from "lucide-react";

import { cn, formatTeamName } from "@/lib/utils";
import { MiniCalendar } from "@/components/ui/MiniCalendar";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import { useNotification } from "@/hooks/useNotification";
import {
  User as UserIcon,
  FileCheck,
  AlertCircle,
} from "lucide-react";
import { apiCrmOrcamentos, apiCrmOrcamentoItens, apiCrmFaturamento, mapCrmItem, type CrmOrcamento, type CrmItem, type FaturamentoResumo } from "@/lib/api";
import {
  getCrmStatusMap,
  upsertCrmStatus,
  addConversa,
  getResponsavelIdForVendedor,
  useLossReasons,
  isEstoqueLossReason,
  LOSS_REASON_ALL,
  type CrmStatus,
} from "@/lib/crm-service";
import { evolutionApi } from "@/lib/evolution-v2";

export interface Orcamento {
  id: string;
  seller: string;
  client: string;
  date: string;
  time: string;
  /** Data da baixa/faturamento (venda) vinda do ERP — só existe quando faturado. */
  saleDate?: string;
  total: string;
  markup: string;
  status: string;
  totalValue: number;
  markupValue: number;
  lossReason?: string;
  lembreteData?: string;
  empresa?: string;
  docGerado?: string;
  /** Orçamento trocado de empresa: o ERP o "faturou" em outro orçamento. Documento fantasma. */
  transferido?: boolean;
  items: CrmItem[];
  sellerCode?: string;
  phone?: string;
  enderecoObra?: string;
  fechamentoPrevisto?: string;
  entregaPrevista?: string;
  /** Status que veio do ERP/Citel (fonte: MOTIVO_CANCELAMENTO, PEDIDO, NOTA_FISCAL) */
  citelStatus?: string;
  /** Status + motivo que o vendedor registrou manualmente no CRM (Supabase) */
  crmStatusVendedor?: string;
  crmMotivoVendedor?: string;
}


interface UserProfile {
  id?: string;
  name: string;
  role: string;
  avatar?: string;
  operator_code?: string;
  operatorCode?: string;
  responsavel_id?: string;
}

function parseName(raw: string): string {
  // Remove apenas o código inicial (tudo antes do primeiro dash)
  const clean = raw.includes("-") 
    ? raw.slice(raw.indexOf("-") + 1).trim() 
    : raw.trim();
  
  return clean;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 13 && digits.startsWith("55")) return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 12 && digits.startsWith("55")) return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  return raw;
}

function parseOrcamentos(raw: CrmOrcamento[]): Orcamento[] {
  return raw.map((r) => {
    const id = r.ORCAMENTO;
    const total = parseFloat(r.VALOR_TOTAL_ORCAMENTO) || 0;
    
    const products = (r.PRODUTOS || []).map(mapCrmItem);
    const validProducts = products.filter((p) => {
      const cod = String(p.COD_PRODUTO || "").trim();
      const custoUnit = parseFloat(String(p.CUSTO_UNITARIO)) || 0;
      return !(cod.startsWith("999") && custoUnit <= 0.10);
    });
    const totalVenda = validProducts.reduce((acc, p) => acc + (parseFloat(String(p.QUANTIDADE)) || 0) * (parseFloat(String(p.PRECO_UNITARIO)) || 0), 0);
    const totalCusto = validProducts.reduce((acc, p) => acc + (parseFloat(String(p.QUANTIDADE)) || 0) * (parseFloat(String(p.CUSTO_UNITARIO)) || 0), 0);
    const avgMarkup = totalCusto > 0
      ? ((totalVenda / totalCusto) - 1) * 100
      : (r.MARKUP_DOC != null ? Number(r.MARKUP_DOC) : 0);

    const dateStr = r.DATA_ORCAMENTO || "";
    const dateBR = dateStr.length >= 10
      ? `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)}`
      : "";
    const hora = String(r.HORA_ORCAMENTO || "00:00:00").slice(0, 5);

    // Data da venda: prefere DATA_VENDA (baixa ou, na falta, data do pedido); cai para DATA_BAIXA.
    const vendaRaw = r.DATA_VENDA || (r.DATA_BAIXA && r.DATA_BAIXA !== "SEM DATA" ? r.DATA_BAIXA : "");
    const saleDate = vendaRaw && vendaRaw.length >= 10
      ? `${vendaRaw.slice(8, 10)}/${vendaRaw.slice(5, 7)}/${vendaRaw.slice(0, 4)}`
      : undefined;

    let defaultStatus = "EMITIDO";
    if (r.MOTIVO_CANCELAMENTO !== "SEM MOTIVO") defaultStatus = "PERDIDO";
    else if (r.PEDIDO === "Sim" || r.NOTA_FISCAL || (r.DATA_BAIXA && r.DATA_BAIXA !== "SEM DATA")) defaultStatus = "VENDA";

    return {
      id,
      seller: parseName(r.VENDEDOR),
      client: parseName(r.CLIENTE),
      date: dateBR,
      time: hora,
      saleDate,
      total: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      markup: `${avgMarkup.toFixed(1)}%`,
      status: defaultStatus,
      totalValue: total,
      markupValue: avgMarkup,
      lossReason: r.MOTIVO_CANCELAMENTO !== "SEM MOTIVO" ? r.MOTIVO_CANCELAMENTO : undefined,
      empresa: r.EMPRESA,
      docGerado: r.DOC_GERADO ?? undefined,
      transferido: Number(r.TRANSFERIDO ?? 0) === 1,
      items: products,
      sellerCode: r.COD_VENDEDOR,
      phone: r.TELEFONE_CLIENTE ? formatPhone(r.TELEFONE_CLIENTE.trim()) : ''
    };
  });
}

function isGerente(role?: string) {
  if (!role) return false;
  const r = role.toLowerCase();
  return r.includes("gerente") || r.includes("diretor") || r.includes("marketing") || r.includes("admin");
}

// Supervisor de vendas: vê apenas os vendedores sob sua responsabilidade (não todos)
function isSupervisor(role?: string) {
  if (!role) return false;
  return role.toLowerCase().includes("supervisor");
}

// Gerência ampla: enxerga a loja inteira. `isGerente` casa com QUALQUER cargo que
// contenha "gerente", então sem essa distinção um gerente setorial (balcão, estoque)
// via o faturamento da loja toda. Mesmo corte que o alerta de follow-up já fazia.
function isGerenteGeral(role?: string) {
  if (!role) return false;
  const r = role.toUpperCase();
  return (
    r === "ADMIN" ||
    r.includes("DIRETOR") ||
    r.includes("MARKETING") ||
    r.includes("GERENTE GERAL") ||
    r.includes("GERENTE COMERCIAL") ||
    r.includes("GERENTE DE VENDAS")
  );
}

// Quem enxerga um time e não a loja: supervisor ou gerência setorial. O time vem do
// `responsavel_id` dos usuários; sem subordinados cadastrados, sobra o próprio código.
function temEscopoDeTime(role?: string) {
  return isSupervisor(role) || (isGerente(role) && !isGerenteGeral(role));
}

// Vendedor vê só os próprios orçamentos; supervisor vê o time; gerente/diretor vê tudo.
function filtrarPorPermissao(
  orcamentos: Orcamento[],
  userProfile: UserProfile | null | undefined,
  subordinateCodes: Set<string> | null,
): Orcamento[] {
  if (!userProfile || isGerenteGeral(userProfile.role)) return orcamentos;

  if (temEscopoDeTime(userProfile.role)) {
    const codes = subordinateCodes ?? new Set<string>();
    return orcamentos.filter((o) =>
      codes.has(String(o.sellerCode || "").trim().replace(/^0+/, ""))
    );
  }

  const myCode = String(userProfile.operator_code || userProfile.operatorCode || "").trim().replace(/^0+/, "");
  if (myCode) {
    return orcamentos.filter((o) =>
      String(o.sellerCode || "").trim().replace(/^0+/, "") === myCode
    );
  }

  // Fallback por nome se não tiver código de operador
  const nomeUser = (userProfile.name || "").toUpperCase();
  const palavras = nomeUser.split(" ").filter((p: string) => p.length > 2);
  return orcamentos.filter((o) => {
    const vend = o.seller.toUpperCase();
    return palavras.some((p: string) => vend.includes(p));
  });
}

// ── Demandas do Dia ────────────────────────────────────────────────────────
// Filtro de status que junta tudo que cobra ação do vendedor hoje (ou que já
// venceu e ficou parado): follow-up do ENVIADO, retorno da NEGOCIAÇÃO e as datas
// de LIB. CRÉDITO / AGUARD. PEDIDO. Orçamento decidido (VENDA ou PERDIDO) nunca
// entra: a demanda acabou junto com a decisão.
const DEMANDAS_FILTER = "Demandas do Dia";
// Janela de atraso: demanda vencida há mais que isso já é histórico morto, não
// pauta do dia — e sem esse corte a consulta cresce indefinidamente.
const DEMANDA_LOOKBACK_DIAS = 90;
const DEMANDA_STATUSES = ["ENVIADO", "NEGOCIAÇÃO", "LIB. CRÉDITO", "AGUARD. PEDIDO"];

export interface Demanda {
  tipo: "FOLLOW-UP" | "RETORNO" | "CRÉDITO" | "PEDIDO";
  /** Data prometida, em ISO (YYYY-MM-DD). */
  data: string;
  /** 0 = vence hoje; N > 0 = venceu há N dias. */
  atrasoDias: number;
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** As datas do CRM chegam como ISO, dd/mm/aaaa ou timestamp — normaliza para ISO. */
function toIsoDate(raw?: string | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
    const [d, m, y] = t.split("/");
    return `${y}-${m}-${d}`;
  }
  const parsed = new Date(t);
  return isNaN(parsed.getTime()) ? null : toLocalIso(parsed);
}

function diffDias(deIso: string, ateIso: string): number {
  const de = Date.parse(`${deIso}T00:00:00`);
  const ate = Date.parse(`${ateIso}T00:00:00`);
  if (isNaN(de) || isNaN(ate)) return 0;
  return Math.round((ate - de) / 86400000);
}

/** Devolve a demanda do orçamento se ela vence hoje ou já venceu; senão, null. */
function getDemanda(item: Orcamento, todayStr: string): Demanda | null {
  const status = (item.status || "").toUpperCase();
  let tipo: Demanda["tipo"];
  let data: string | null;

  switch (status) {
    case "ENVIADO":
      tipo = "FOLLOW-UP";
      data = toIsoDate(item.lembreteData);
      break;
    case "NEGOCIAÇÃO":
      // O retorno da negociação é o fechamento previsto; lembrete é o fallback
      // de quem marcou a data ainda no passo de Enviado.
      tipo = "RETORNO";
      data = toIsoDate(item.fechamentoPrevisto) ?? toIsoDate(item.lembreteData);
      break;
    case "LIB. CRÉDITO":
      tipo = "CRÉDITO";
      data = toIsoDate(item.lembreteData) ?? toIsoDate(item.fechamentoPrevisto);
      break;
    case "AGUARD. PEDIDO":
      tipo = "PEDIDO";
      data = toIsoDate(item.lembreteData) ?? toIsoDate(item.fechamentoPrevisto);
      break;
    // VENDA e PERDIDO caem aqui: já decididos, não há o que cobrar. (A
    // entrega_prevista continua gravada de quando o orçamento estava em
    // negociação, então tratá-la como demanda marcava toda venda antiga
    // como atrasada.)
    default:
      return null;
  }

  if (!data || data > todayStr) return null;
  return { tipo, data, atrasoDias: diffDias(data, todayStr) };
}



interface RowProps {
  item: Orcamento;
  isAdmin?: boolean;
  showDualColumns?: boolean;
  /** Modo "Demandas do Dia": destaca o prazo (hoje / atrasado) na coluna de status. */
  demandaMode?: boolean;
  /** Hoje em ISO — passado pronto para não recalcular por linha e não quebrar o memo. */
  todayStr?: string;
  onOpenItems: (o: Orcamento) => void;
  onOpenStatus: (o: Orcamento) => void;
  onOpenChat: (o: Orcamento) => void;
}

const OrcamentoRow = memo(({ item, isAdmin, showDualColumns, demandaMode, todayStr, onOpenItems, onOpenStatus, onOpenChat }: RowProps) => {
  const demanda = demandaMode && todayStr ? getDemanda(item, todayStr) : null;
  const atrasada = !!demanda && demanda.atrasoDias > 0;
  const hasDivergence = showDualColumns && item.crmStatusVendedor === "PERDIDO" && (
    item.citelStatus !== "PERDIDO" ||
    (item.citelStatus === "PERDIDO" &&
      (item.crmMotivoVendedor ?? "").trim().toUpperCase() !== (item.lossReason ?? "").trim().toUpperCase())
  );
  return (
    <tr className={cn(
      "transition-colors group relative",
      hasDivergence
        ? "bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500/60"
        : atrasada
        ? "bg-rose-500/5 hover:bg-rose-500/10 border-l-2 border-l-rose-500/60"
        : demanda
        ? "bg-blue-500/5 hover:bg-blue-500/10 border-l-2 border-l-blue-500/60"
        : "hover:bg-secondary/50"
    )}>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
            {item.id.replace("-OR", "")}
          </span>
          {item.empresa && (
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tight">
              {{ "001": "Carflax", "002": "Zelex", "003": "JCM" }[item.empresa] ?? item.empresa}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 max-w-[140px]"><span className="block truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight" title={item.seller}>{item.seller}</span></td>
      <td className="px-6 py-4 max-w-[200px]">
        <div className="flex flex-col gap-0.5">
          <span className="block truncate text-[11px] font-black text-foreground uppercase tracking-tighter transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400" title={item.client}>{item.client}</span>
          {item.phone && (
            <span className="text-[9px] font-medium text-muted-foreground tracking-tight">{item.phone}</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.date}</span>
          <span className="text-[9px] font-medium text-slate-400">{item.time}</span>
        </div>
      </td>
      <td className="px-6 py-4"><span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{item.total}</span></td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[11px] font-black text-foreground">{item.markup}</span>
        </div>
      </td>

      {/* Coluna STATUS — oculta quando as colunas duplas estão ativas */}
      {!showDualColumns && (
        <td className="px-6 py-4">
          <div className="flex flex-col items-center gap-1">
            <div
              onClick={(e) => {
                e.stopPropagation();
                const blocked = item.status === "VENDA" || (item.status === "PERDIDO" && !isAdmin);
                if (!blocked) onOpenStatus(item);
              }}
              className={cn(
                "inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black tracking-tighter transition-all border",
                item.status === "VENDA" || (item.status === "PERDIDO" && !isAdmin) ? "cursor-default opacity-80" : "cursor-pointer hover:brightness-110 active:scale-95 shadow-sm",
                item.status === "VENDA" ? "bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-600/20" :
                item.status === "EMITIDO" ? "bg-slate-500/10 dark:bg-slate-400/10 text-slate-600 dark:text-slate-400 border-slate-500/20" :
                item.status === "ENVIADO" ? "bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-600/20" :
                item.status === "NEGOCIAÇÃO" ? "bg-amber-600/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-600/20" :
                item.status === "LIB. CRÉDITO" ? "bg-orange-600/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-600/20" :
                item.status === "AGUARD. PEDIDO" ? "bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-600/20" :
                item.status === "PERDIDO" ? "bg-rose-600/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-600/20" :
                "bg-secondary text-muted-foreground border-border"
              )}
            >
              {item.status}
            </div>
            {item.status === "PERDIDO" && (
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">{item.lossReason || "Não Informado"}</span>
            )}
            {item.status === "VENDA" && item.saleDate && (
              <div className="flex items-center gap-0.5 text-[8px] font-bold text-emerald-600 dark:text-emerald-400" title="Data da venda (faturamento)">
                <Calendar className="w-2.5 h-2.5" />
                <span>{item.saleDate}</span>
              </div>
            )}
            {demanda && (
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-tight",
                  atrasada
                    ? "bg-rose-600/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-600/20"
                    : "bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-600/20"
                )}
                title={`${demanda.tipo} previsto para ${demanda.data.slice(8, 10)}/${demanda.data.slice(5, 7)}/${demanda.data.slice(0, 4)}`}
              >
                <Clock className="w-2.5 h-2.5" />
                <span>
                  {demanda.tipo} · {atrasada ? `ATRASADO ${demanda.atrasoDias}D` : "HOJE"}
                </span>
              </div>
            )}
            {!demanda && (item.status === "ENVIADO" || item.status === "NEGOCIAÇÃO") && item.lembreteData && (() => {
              const raw = item.lembreteData!;
              const display = /^\d{2}\/\d{2}\/\d{4}$/.test(raw)
                ? raw
                : /^\d{4}-\d{2}-\d{2}/.test(raw)
                ? raw.slice(8, 10) + "/" + raw.slice(5, 7) + "/" + raw.slice(0, 4)
                : (() => { const d = new Date(raw); return isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); })();
              const color = item.status === "NEGOCIAÇÃO" ? "text-amber-400" : "text-blue-400";
              return (
                <div className={`flex items-center gap-0.5 text-[8px] font-bold ${color}`}>
                  <Calendar className="w-2.5 h-2.5" />
                  <span>{display}</span>
                </div>
              );
            })()}
          </div>
        </td>
      )}


      {/* Colunas duplas: Status Vendedor + Status Citel — apenas para admin em modo Perdido */}
      {showDualColumns && (
        <>
          {/* Status Vendedor (CRM/Supabase) */}
          <td className="px-6 py-4">
            <div className="flex flex-col items-center gap-0.5">
              {item.crmStatusVendedor ? (
                <>
                  <span className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black tracking-tighter border",
                    item.crmStatusVendedor === "PERDIDO"
                      ? "bg-rose-600/10 dark:bg-rose-500/20 text-rose-500 dark:text-rose-400 border-rose-600/20"
                      : "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20"
                  )}>
                    {item.crmStatusVendedor}
                  </span>
                  {item.crmMotivoVendedor && (
                    <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-tight text-center">{item.crmMotivoVendedor}</span>
                  )}
                </>
              ) : (
                <span className="text-[8px] font-bold text-slate-500 italic">não declarado</span>
              )}
            </div>
          </td>

          {/* Status Citel (ERP) */}
          <td className="px-6 py-4">
            <div className="flex flex-col items-center gap-0.5">
              <span className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black tracking-tighter border",
                item.citelStatus === "PERDIDO"
                  ? "bg-rose-600/10 dark:bg-rose-500/20 text-rose-500 dark:text-rose-400 border-rose-600/20"
                  : "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20"
              )}>
                {item.citelStatus || "—"}
              </span>
              {item.citelStatus === "PERDIDO" && item.lossReason && (
                <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-tight text-center">{item.lossReason}</span>
              )}

            </div>
          </td>
        </>
      )}

      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onOpenItems(item)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-all"
            title="Ver Itens"
          >
            <Package className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onOpenChat(item)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-all"
            title="Conversas / Observações"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});





export function OrcamentosView({ userProfile }: { userProfile?: UserProfile }) {
  const { showNotification } = useNotification();
  const [orçamentosData, setOrçamentosData] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [faturamento, setFaturamento] = useState<FaturamentoResumo | null>(null);
  const sellerCodeRef = useRef<Map<string, string>>(new Map());
  // Trava contra reentrada: evita que cliques repetidos no botão de status
  // disparem múltiplos envios (ex.: notificações de WhatsApp duplicadas).
  const isUpdatingStatusRef = useRef(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const visibleCount = 50;

  // Códigos de vendedor que um supervisor pode enxergar (subordinados + ele mesmo).
  // null = ainda não carregado; Set vazio = supervisor sem vendedores atribuídos.
  const [subordinateCodes, setSubordinateCodes] = useState<Set<string> | null>(null);
  // Demandas cujo orçamento está fora do período filtrado (ver efeito mais abaixo).
  const [demandasExtras, setDemandasExtras] = useState<Orcamento[]>([]);
  const [loadingDemandas, setLoadingDemandas] = useState(false);

  useEffect(() => {
    if (!userProfile || !temEscopoDeTime(userProfile.role) || !userProfile.id) {
      setSubordinateCodes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("usuarios")
        .select("operator_code")
        .eq("responsavel_id", userProfile.id);
      if (cancelled) return;
      const codes = new Set(
        (data || [])
          .map((u) => String(u.operator_code || "").trim().replace(/^0+/, ""))
          .filter(Boolean)
      );
      const myCode = String(userProfile.operator_code || userProfile.operatorCode || "").trim().replace(/^0+/, "");
      if (myCode) codes.add(myCode);
      setSubordinateCodes(codes);
    })();
    return () => { cancelled = true; };
  }, [userProfile]);

  const [teamOptions, setTeamOptions] = useState<{ label: string; value: string; codes: Set<string> }[]>([]);

  useEffect(() => {
    // Times só fazem sentido para quem enxerga a loja toda; gerência setorial já vem
    // recortada pelo próprio time.
    if (!userProfile || !isGerenteGeral(userProfile.role)) return;
    let cancelled = false;
    (async () => {
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("id, operator_code, name, role, responsavel_id, is_leader");
      if (cancelled || !usuarios) return;

      const membrosPorResponsavel = new Map<string, typeof usuarios>();
      for (const u of usuarios) {
        if (!u.responsavel_id) continue;
        if (!membrosPorResponsavel.has(u.responsavel_id)) membrosPorResponsavel.set(u.responsavel_id, []);
        membrosPorResponsavel.get(u.responsavel_id)!.push(u);
      }

      const activeSellerCodes = new Set(
        orçamentosData
          .map((item) => String(item.sellerCode || "").trim().replace(/^0+/, ""))
          .filter(Boolean)
      );

      const teams: { label: string; value: string; codes: Set<string> }[] = [];
      for (const sup of usuarios) {
        const membros = membrosPorResponsavel.get(sup.id);
        if (!membros || membros.length === 0) continue;
        const codes = new Set<string>();
        if (sup.operator_code) codes.add(String(sup.operator_code).trim().replace(/^0+/, ""));
        membros.forEach(m => {
          if (m.operator_code) codes.add(String(m.operator_code).trim().replace(/^0+/, ""));
        });

        // Só exibe o time se pelo menos um membro do time estiver ativo/presente nos orçamentos carregados
        const hasActiveMembers = Array.from(codes).some(code => activeSellerCodes.has(code));
        if (!hasActiveMembers) continue;

        if (codes.size > 0) {
          teams.push({
            label: formatTeamName(sup.name),
            value: `TEAM:${sup.id}`,
            codes,
          });
        }
      }
      setTeamOptions(teams);
    })();
    return () => { cancelled = true; };
  }, [userProfile, orçamentosData]);


  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" | null }>({ key: "id", direction: "desc" });
  const [filterStatus, setFilterStatus] = useState("Todos os Status");
  const [filterSeller, setFilterSeller] = useState("Todos os Vendedores");
  const [filterReason, setFilterReason] = useState("Todos os Motivos");
  const [insightsOpen, setInsightsOpen] = useState(() => {
    try { return sessionStorage.getItem("crm_insights_open") !== "false"; } catch { return true; }
  });
  const [searchTerm, setSearchTerm] = useState("");

  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
  const [itens, setItens] = useState<CrmItem[]>([]);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusStep, setStatusStep] = useState<"selection" | "enviado" | "negociacao" | "perdido">("selection");
  const [selectedItem, setSelectedItem] = useState<Orcamento | null>(null);

  // Status modal form state
  const [statusObs, setStatusObs] = useState("");
  const [statusData, setStatusData] = useState("");
  const [statusEnderecoObra, setStatusEnderecoObra] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [statusFechamento, setStatusFechamento] = useState("");
  const [statusEntrega, setStatusEntrega] = useState("");
  const [statusMotivoPerdido, setStatusMotivoPerdido] = useState("");
  const [lostItemsIds, setLostItemsIds] = useState<string[]>([]);

  const handleEnderecoObraChange = useCallback(async (value: string) => {
    setStatusEnderecoObra(value);
    const digits = value.replace(/\D/g, "");
    if (digits.length === 8 && /^\d{5}-?\d{3}$/.test(value.trim())) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          const parts = [data.logradouro, data.bairro, `${data.localidade}/${data.uf}`].filter(Boolean);
          setStatusEnderecoObra(parts.join(", "));
        }
      } catch { /* silêncio */ }
      setCepLoading(false);
    }
  }, []);

  // Follow-up fields (inside "Enviado" status step)
  const [fuContatoRealizado, setFuContatoRealizado] = useState<boolean | null>(null);
  const [fuCanalContato, setFuCanalContato] = useState<"whatsapp" | "ligacao" | null>(null);

  // Filtro padrão: do dia 1 do mês atual até hoje
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const cacheKey = useMemo(() => {
    if (!startDate || !endDate) return null;
    return `crm_orcamentos_${startDate.getTime()}_${endDate.getTime()}_${userProfile?.id || 'anon'}`;
  }, [startDate, endDate, userProfile?.id]);

  // 1. Carregar cache inicial (Instantâneo)
  useEffect(() => {
    if (!cacheKey) return;
    const saved = sessionStorage.getItem(cacheKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrçamentosData(parsed);
          // Se temos cache, podemos pular o skeleton inicial
          // mas o fetchData ainda rodará em background para atualizar
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }
  }, [cacheKey]);

  // ── Fetch data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const toLocalDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const params: Record<string, string> = {};
      if (startDate) params.inicio = toLocalDateStr(startDate);
      if (endDate) params.fim = toLocalDateStr(endDate);

      const raw = await apiCrmOrcamentos(params);
      let orcamentos = parseOrcamentos(raw);

      // Deduplicar: mesmo documento em lojas diferentes → manter o de status mais avançado
      const statusPriority: Record<string, number> = { "VENDA": 3, "PERDIDO": 2 };
      const byDoc = new Map<string, typeof orcamentos[number]>();
      for (const o of orcamentos) {
        const key = o.id.trim();
        const existing = byDoc.get(key);
        if (!existing) {
          byDoc.set(key, o);
        } else {
          const existingPrio = statusPriority[existing.status] || 0;
          const currentPrio = statusPriority[o.status] || 0;
          if (currentPrio > existingPrio) {
            byDoc.set(key, o);
          }
        }
      }
      orcamentos = Array.from(byDoc.values());

      // Deduplicar orçamentos "migrados" entre empresas usando o vínculo real do ERP:
      // um orçamento faturado guarda em docGerado (FGO_NUMFAT) o número do pedido/venda
      // que gerou. Se esse número aparece como outro documento na lista, o orçamento de
      // origem (em aberto) deve sumir — mantemos o resultante (a venda).
      const normDoc = (s?: string) =>
        String(s || "").split("-")[0].replace(/\D/g, "").padStart(12, "0");
      const idsPresentes = new Set(orcamentos.map((o) => normDoc(o.id)));
      orcamentos = orcamentos.filter((o) => {
        if (o.status === "VENDA" || o.status === "PERDIDO") return true; // nunca esconde definitivo
        // Transferido para outra empresa: o ERP marca a origem com TIPFAT='OR'. Não
        // depende do destino estar carregado — ele quase nunca está.
        if (o.transferido) return false;
        if (!o.docGerado) return true;
        const gerado = normDoc(o.docGerado);
        if (gerado === normDoc(o.id)) return true; // aponta pra si mesmo: ignora
        // Se o documento gerado está na lista (a venda resultante), esconde a origem
        return !idsPresentes.has(gerado);
      });

      // Atualizar mapa de sellerCode (ref, sem causar re-render)
      const map = new Map<string, string>();
      orcamentos.forEach((o) => { if (o.sellerCode) map.set(o.seller, o.sellerCode); });
      sellerCodeRef.current = map;

      // Vendedor só vê seus próprios orçamentos; supervisor vê apenas seu time
      orcamentos = filtrarPorPermissao(orcamentos, userProfile, subordinateCodes);

      // Overlay with Supabase CRM status
      const docs = orcamentos.map((o) => o.id.trim());
      const statusMap = await getCrmStatusMap(docs);

      const docsToSync: { documento: string; empresa: string; status_crm: string; vendedor?: string; vendedor_codigo?: string; motivo_perda?: string | null }[] = [];

      const merged = orcamentos.map((o) => {
        const crm = statusMap.get(o.id.trim());
        // citelStatus = status que o ERP/Citel indica (antes de qualquer overlay)
        const citelStatus: string = o.status;
        // crmStatusVendedor = status que o vendedor declarou manualmente no CRM
        const crmStatusVendedor: string | undefined = crm ? crm.status_crm.toUpperCase() : undefined;
        const crmMotivoVendedor: string | undefined = crm?.motivo_perda ?? undefined;

        // Prioridade ABSOLUTA para o ERP se for VENDA ou PERDIDO
        if (o.status === "VENDA" || o.status === "PERDIDO") {
          if (crm && crm.status_crm.toUpperCase() !== o.status) {
            docsToSync.push({
              documento: o.id.trim(),
              empresa: o.empresa ?? "001",
              status_crm: o.status,
              vendedor: o.seller,
              vendedor_codigo: o.sellerCode,
              motivo_perda: o.lossReason ?? crm.motivo_perda ?? null,
            });
          }
          if (!crm) return { ...o, citelStatus, crmStatusVendedor, crmMotivoVendedor };
          return {
            ...o,
            citelStatus,
            crmStatusVendedor,
            crmMotivoVendedor,
            lossReason: o.lossReason ?? crm.motivo_perda ?? undefined,
            lembreteData: crm.lembrete_data ?? undefined,
            enderecoObra: crm.endereco_obra ?? undefined,
            fechamentoPrevisto: crm.fechamento_previsto ?? undefined,
            entregaPrevista: crm.entrega_prevista ?? undefined,
          };
        }

        if (!crm) return { ...o, citelStatus, crmStatusVendedor, crmMotivoVendedor };

        // Para orçamentos em aberto (EMITIDO), o CRM manual tem precedência,
        // exceto PERDIDO que só pode vir da API
        const crmStatus = crm.status_crm.toUpperCase();
        return {
          ...o,
          citelStatus,
          crmStatusVendedor,
          crmMotivoVendedor,
          status: crmStatus,
          lossReason: o.lossReason ?? crm.motivo_perda ?? undefined,
          lembreteData: crm.lembrete_data ?? crm.fechamento_previsto ?? undefined,
          enderecoObra: crm.endereco_obra ?? undefined,
          fechamentoPrevisto: crm.fechamento_previsto ?? undefined,
          entregaPrevista: crm.entrega_prevista ?? undefined,
        };
      });


      if (docsToSync.length > 0) {
        Promise.all(
          docsToSync.map((d) =>
            supabase.from("crm_status").update({ status_crm: d.status_crm, motivo_perda: d.motivo_perda, updated_at: new Date().toISOString() }).eq("documento", d.documento)
          )
        ).catch(() => {});
      }

      setOrçamentosData(merged);

      // Salvar no Cache
      if (cacheKey && merged.length > 0) {
        try {
          Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith("crm_orcamentos_")) sessionStorage.removeItem(key);
          });
          sessionStorage.setItem(cacheKey, JSON.stringify(merged));
        } catch (err) {
          console.warn("[CRM] Falha ao salvar cache (quota cheia):", err);
        }
      }
    } catch (e) {
      console.error("CRM fetch:", e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userProfile, cacheKey, subordinateCodes]);

  useEffect(() => {
    // Se já temos dados carregados via cache (useEffect acima), fazemos o fetch "silencioso"
    const hasCache = cacheKey ? !!sessionStorage.getItem(cacheKey) : false;
    fetchData(hasCache);
  }, [fetchData, cacheKey]);

  // Buscar faturamento (reage a datas, filtro de vendedor e perfil do usuário)
  useEffect(() => {
    if (!startDate || !endDate) return;
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const params: Record<string, string> = {
      inicio: toLocalDateStr(startDate),
      fim: toLocalDateStr(endDate),
    };

    // Escopo de time (supervisor ou gerência setorial): faturamento só do time. Sem
    // isso o card do Resumo Geral mostrava o faturado da loja inteira para quem só
    // pode ver o próprio time — a lista de orçamentos vinha filtrada, o resumo não.
    if (userProfile && temEscopoDeTime(userProfile.role)) {
      if (filterSeller !== "Todos os Vendedores") {
        const code = sellerCodeRef.current.get(filterSeller);
        if (code) params.vendedor = code;
      } else if (subordinateCodes && subordinateCodes.size > 0) {
        params.vendedor = Array.from(subordinateCodes).join(",");
      } else {
        // Time ainda não carregado ou sem subordinados: cai no próprio código em vez
        // de consultar sem filtro nenhum (que traria a loja toda).
        const myCode = String(userProfile.operator_code || userProfile.operatorCode || "").trim();
        params.vendedor = myCode || "__sem_vendedor__";
      }
    } else if (userProfile && !isGerenteGeral(userProfile.role)) {
      const myCode = String(userProfile.operator_code || userProfile.operatorCode || "").trim();
      if (myCode) params.vendedor = myCode;
    } else if (filterSeller !== "Todos os Vendedores") {
      if (filterSeller.startsWith("TEAM:")) {
        const team = teamOptions.find(t => t.value === filterSeller);
        if (team) {
          params.vendedor = Array.from(team.codes).join(",");
        }
      } else {
        const code = sellerCodeRef.current.get(filterSeller);
        if (code) params.vendedor = code;
      }
    }

    apiCrmFaturamento(params).then(setFaturamento).catch(() => {});
  }, [filterSeller, startDate, endDate, userProfile, subordinateCodes, teamOptions]);

  // ── Demandas do Dia: busca o que vence hoje (e o que venceu) fora do período ──
  // A lista em tela é recortada pela data DO ORÇAMENTO, então um follow-up marcado
  // para hoje num orçamento de meses atrás simplesmente não estaria em `orçamentosData`.
  // Aqui partimos do crm_status (onde moram as datas de retorno) e buscamos no ERP só
  // os documentos que faltam.
  useEffect(() => {
    if (filterStatus !== DEMANDAS_FILTER) return;
    let cancelled = false;

    (async () => {
      setLoadingDemandas(true);
      try {
        const hoje = new Date();
        const todayStr = toLocalIso(hoje);
        const piso = new Date(hoje);
        piso.setDate(piso.getDate() - DEMANDA_LOOKBACK_DIAS);
        const pisoStr = toLocalIso(piso);

        // Uma data qualquer dentro da janela já qualifica a linha; o tipo/status certo
        // é decidido depois por getDemanda().
        const janela = (col: string) => `and(${col}.gte.${pisoStr},${col}.lte.${todayStr})`;

        const { data, error } = await supabase
          .from("crm_status")
          .select("documento, status_crm, motivo_perda, lembrete_data, fechamento_previsto, entrega_prevista")
          .in("status_crm", DEMANDA_STATUSES)
          .or([janela("lembrete_data"), janela("fechamento_previsto")].join(","))
          .limit(500);

        if (error) throw new Error(error.message);
        if (cancelled) return;

        const rows = data || [];
        const jaNaLista = new Set(orçamentosData.map((o) => o.id.trim()));
        const faltantes = Array.from(
          new Set(
            rows
              .map((r) => String(r.documento || "").trim())
              .filter((doc) => doc && !jaNaLista.has(doc))
          )
        );

        if (faltantes.length === 0) {
          setDemandasExtras([]);
          return;
        }

        // Lotes para não estourar o tamanho da URL — o endpoint aceita lista.
        const lotes: string[][] = [];
        for (let i = 0; i < faltantes.length; i += 80) lotes.push(faltantes.slice(i, i + 80));

        const raw = (
          await Promise.all(
            lotes.map((lote) => apiCrmOrcamentos({ documento: lote.join(",") }).catch(() => [] as CrmOrcamento[]))
          )
        ).flat();
        if (cancelled) return;

        const crmByDoc = new Map(rows.map((r) => [String(r.documento || "").trim(), r]));
        let extras = parseOrcamentos(raw).map((o) => {
          const crm = crmByDoc.get(o.id.trim());
          if (!crm) return o;
          const erpStatus = o.status;
          const crmStatus = String(crm.status_crm || "").toUpperCase();
          return {
            ...o,
            citelStatus: erpStatus,
            crmStatusVendedor: crmStatus,
            crmMotivoVendedor: crm.motivo_perda ?? undefined,
            status: erpStatus === "VENDA" || erpStatus === "PERDIDO" ? erpStatus : crmStatus,
            lossReason: o.lossReason ?? crm.motivo_perda ?? undefined,
            lembreteData: crm.lembrete_data ?? crm.fechamento_previsto ?? undefined,
            fechamentoPrevisto: crm.fechamento_previsto ?? undefined,
            entregaPrevista: crm.entrega_prevista ?? undefined,
          };
        });

        // Excluir orçamentos transferidos (flag do ERP; ou docGerado apontando para
        // outro doc existente). Sem a flag, o follow-up de um orçamento trocado de
        // empresa ficava cobrando eternamente: o destino é de outra empresa e nunca
        // entra em allIds.
        const normDoc = (s?: string) =>
          String(s || "").split("-")[0].replace(/\D/g, "").padStart(12, "0");
        const allIds = new Set([
          ...orçamentosData.map((o) => normDoc(o.id)),
          ...extras.map((o) => normDoc(o.id)),
        ]);
        extras = extras.filter((o) => {
          if (o.status === "VENDA" || o.status === "PERDIDO") return true;
          if (o.transferido) return false;
          if (!o.docGerado) return true;
          const gerado = normDoc(o.docGerado);
          if (gerado === normDoc(o.id)) return true;
          return !allIds.has(gerado);
        });

        setDemandasExtras(filtrarPorPermissao(extras, userProfile, subordinateCodes));
      } catch (err) {
        console.warn("[CRM] Falha ao carregar demandas do dia:", err);
        if (!cancelled) setDemandasExtras([]);
      } finally {
        if (!cancelled) setLoadingDemandas(false);
      }
    })();

    return () => { cancelled = true; };
  }, [filterStatus, orçamentosData, userProfile, subordinateCodes]);

  // ── Ouve evento do FollowUpReminder para aplicar o filtro automaticamente ──
  // O alerta de follow-up pendente cai nas Demandas do Dia, que já contém os
  // follow-ups (ENVIADO com retorno vencido) e o resto da pauta.
  useEffect(() => {
    const handler = () => setFilterStatus(DEMANDAS_FILTER);
    window.addEventListener("carflax-filter-followups", handler);
    return () => window.removeEventListener("carflax-filter-followups", handler);
  }, []);

  // ── Status update ────────────────────────────────────────────────────────



  // ── Status update ────────────────────────────────────────────────────────
  const handleUpdateStatus = async (newStatus: string, extra?: Partial<CrmStatus>) => {
    if (!selectedItem) return;
    // Bloqueia execuções concorrentes (duplo/triplo clique) que gerariam
    // notificações e gravações duplicadas.
    if (isUpdatingStatusRef.current) return;
    isUpdatingStatusRef.current = true;
    setIsUpdatingStatus(true);

    // 1. Preparar Payload Completo
    const payload: CrmStatus = {
      documento: selectedItem.id,
      empresa: selectedItem.empresa ?? "001",
      status_crm: newStatus.toUpperCase(),
      vendedor: selectedItem.seller,
      vendedor_codigo: selectedItem.sellerCode,
      motivo_perda: extra?.motivo_perda?.toUpperCase() ?? null,
      lembrete_data: extra?.lembrete_data ?? null,
      endereco_obra: extra?.endereco_obra !== undefined ? (extra.endereco_obra ?? null) : (selectedItem.enderecoObra ?? null),
      fechamento_previsto: extra?.fechamento_previsto !== undefined ? (extra.fechamento_previsto ?? null) : (selectedItem.fechamentoPrevisto ?? null),
      entrega_prevista: extra?.entrega_prevista !== undefined ? (extra.entrega_prevista ?? null) : (selectedItem.entregaPrevista ?? null),
      updated_at: new Date().toISOString()
    };

    // Tratamento específico para itens perdidos
    if (newStatus.toUpperCase() === "PERDIDO") {
      if (extra?.motivo_perda?.toUpperCase().includes("ESTOQUE")) {
        payload.itens_estoque = lostItemsIds;
      } else if (extra?.motivo_perda?.toUpperCase().includes("PREÇO")) {
        payload.itens_preco = lostItemsIds;
      }
    }

    try {
      // 2. Salvar no Supabase
      await upsertCrmStatus(payload);

      // 3. Cadastrar no Calendário de Eventos (Opcional se houver data de retorno)
      const returnDate = extra?.lembrete_data || extra?.fechamento_previsto;
      if (returnDate) {
        try {
          const dateParts = returnDate.includes("-") ? returnDate.split("-") : returnDate.split("/");
          let y, m, d;
          
          if (dateParts.length === 3) {
            if (dateParts[0].length === 4) {
              [y, m, d] = dateParts.map(Number);
            } else {
              [d, m, y] = dateParts.map(Number);
            }

            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
              const { error: calError } = await supabase.from("eventos_calendario").insert([{
                title: `FOLLOW-UP: ${selectedItem.client.toUpperCase()} - Vendedor: ${selectedItem.seller.split(' ')[0]}`,
                description: `Vendedor: ${selectedItem.seller}. Orçamento: #${selectedItem.id.replace("-OR", "")}. Status: ${newStatus.toUpperCase()}.`,
                type: "follow-up",
                vendedor_codigo: selectedItem.sellerCode,
                day: d,
                month: m,
                year: y
              }]);
              
              if (calError) {
                console.error("Erro Supabase Calendário:", calError.message);
              }
            }
          }
        } catch (calErr) {
          console.error("Erro ao agendar no calendário:", calErr);
        }
      }

      // 4. Notificação Automática para o Responsável do Vendedor
      const triggerStatuses = ["ENVIADO", "NEGOCIAÇÃO", "LIB. CRÉDITO", "AGUARD. PEDIDO", "PERDIDO"];
      if (triggerStatuses.includes(newStatus.toUpperCase())) {
        try {
          const responsavelId = await getResponsavelIdForVendedor(selectedItem.sellerCode);

          if (responsavelId) {
            const statusEmblema: Record<string, string> = {
              "ENVIADO": "🔵 ENVIADO",
              "NEGOCIAÇÃO": "🤝 NEGOCIAÇÃO",
              "LIB. CRÉDITO": "💳 LIB. CRÉDITO",
              "AGUARD. PEDIDO": "⏳ AGUARD. PEDIDO",
              "PERDIDO": "❌ PERDIDO"
            };
            
            const lostItemsList = (lostItemsIds.length > 0 && selectedItem.items)
              ? selectedItem.items
                  .filter(it => lostItemsIds.includes(String(it.COD_PRODUTO)))
                  .map(it => `  • ${it.PRODUTO}`)
                  .join("\n")
              : "";
            
            const header = `━━━━━━━━━━━━━━━━━━━━━━━━\n   🔄  *ATUALIZAÇÃO DE STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━━`;
            const footer = `━━━━━━━━━━━━━━━━━━━━━━━━`;

            const msgFormatada = [
              header,
              `📑 *ORÇAMENTO:*  #${selectedItem.id.replace("-OR", "")}`,
              `🏢 *CLIENTE:*    ${selectedItem.client}`,
              `👤 *VENDEDOR:*   ${selectedItem.seller}`,
              ``,
              `📢 *STATUS:*     ${statusEmblema[newStatus.toUpperCase()] || newStatus.toUpperCase()}`,
              newStatus.toUpperCase() === "ENVIADO" && fuContatoRealizado !== null ? `📞 *CONTATO:*    ${fuContatoRealizado ? "CONECTOU" : "NÃO CONECTOU"}` : "",
              newStatus.toUpperCase() === "ENVIADO" && fuCanalContato ? `📱 *CANAL:*      ${fuCanalContato === "whatsapp" ? "WhatsApp" : "Ligação"}` : "",
              extra?.motivo_perda ? `📉 *MOTIVO:*     ${extra.motivo_perda.toUpperCase()}` : "",
              lostItemsList ? `\n📦 *ITENS AFETADOS:*\n${lostItemsList}` : "",
              statusObs && !lostItemsList ? `\n💬 *OBSERVAÇÃO:*\n${statusObs}` : "",
              footer
            ].filter(Boolean).join("\n");

            await addConversa({
              documento: selectedItem.id,
              empresa: selectedItem.empresa ?? "001",
              obs: msgFormatada,
              enviado_por_nome: "SISTEMA",
              destino: responsavelId,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error("Erro ao enviar notificação automática:", err);
        }
      }

      // 5. Notificação Automática por WhatsApp para Responsáveis de Acordo com o Motivo
      if (newStatus.toUpperCase() === "PERDIDO" && extra?.motivo_perda) {
        const motivoUpper = extra.motivo_perda.toUpperCase().trim();

        try {
          // Idempotência: se este orçamento JÁ teve o alerta de perda enviado,
          // não dispara de novo (evita duplicidade em remarcações/recargas/sessões).
          const { data: notifStatus } = await supabase
            .from("crm_status")
            .select("perda_notificada_em")
            .eq("documento", selectedItem.id)
            .eq("empresa", selectedItem.empresa ?? "001")
            .maybeSingle();

          if (notifStatus?.perda_notificada_em) {
            console.log(`[CRM] Alerta de perda do orçamento ${selectedItem.id} já enviado em ${notifStatus.perda_notificada_em}. Ignorando reenvio.`);
            throw new Error("__ALREADY_NOTIFIED__");
          }

          // Busca a lista de responsáveis configurada
          const { data: configData } = await supabase
            .from("crm_config")
            .select("value")
            .eq("key", "crm_loss_responsibles")
            .maybeSingle();

          if (configData?.value) {
            interface LossResponsible {
              id: string;
              motivo: string;
              nome: string;
              telefone: string;
            }
            const responsiblesList: LossResponsible[] = JSON.parse(configData.value);

            // Normaliza o telefone para o mesmo formato usado no envio (com DDI 55),
            // garantindo que a deduplicação bata com o destinatário real.
            const normalizePhone = (phone: string) => {
              const cleaned = (phone || "").replace(/\D/g, "");
              if (!cleaned) return "";
              return cleaned.length >= 10 && !cleaned.startsWith("55") ? "55" + cleaned : cleaned;
            };

            // Filtra e deduplica pelo telefone JÁ normalizado para evitar envio em duplicidade
            const seenPhones = new Set<string>();
            const matchingResponsibles = responsiblesList.filter(r => {
              const normalizedPhone = normalizePhone(r.telefone);
              if (!normalizedPhone) return false;

              const isMatch = r.motivo === "Todos os Motivos" || r.motivo.toUpperCase().trim() === motivoUpper;
              if (isMatch && !seenPhones.has(normalizedPhone)) {
                seenPhones.add(normalizedPhone);
                return true;
              }
              return false;
            });

            if (matchingResponsibles.length > 0) {
              const toWhatsappJid = (phone: string) => {
                const normalized = normalizePhone(phone);
                return normalized ? `${normalized}@s.whatsapp.net` : "";
              };

              const lostItemsList = (lostItemsIds.length > 0 && selectedItem.items)
                ? selectedItem.items
                    .filter(it => lostItemsIds.includes(String(it.COD_PRODUTO)))
                    .map(it => `• ${it.PRODUTO} (${parseFloat(String(it.QUANTIDADE)).toFixed(0)} un)`)
                    .join("\n")
                : "";

              const msgWpp = [
                `⚠️ *PERDA DE ORÇAMENTO* ⚠️`,
                `━━━━━━━━━━━━━━━━━━━━━━━━`,
                `📑 *ORÇAMENTO:* #${selectedItem.id.replace("-OR", "")}`,
                `🏢 *CLIENTE:*    ${selectedItem.client}`,
                `👤 *VENDEDOR:*   ${selectedItem.seller}`,
                `💰 *VALOR:*      ${selectedItem.total}`,
                ``,
                `❌ *MOTIVO:*     ${motivoUpper}`,
                lostItemsList ? `\n📦 *ITENS AFETADOS:*\n${lostItemsList}` : "",
                statusObs ? `\n💬 *OBSERVAÇÃO:* ${statusObs}` : "",
                `━━━━━━━━━━━━━━━━━━━━━━━━`,
                `🚨 _Por favor, verifiquem a situação com urgência._`
              ].filter(Boolean).join("\n");

              // Envia mensagens em paralelo para todos os destinatários filtrados
              await Promise.all(
                matchingResponsibles.map(async (resp) => {
                  const jid = toWhatsappJid(resp.telefone);
                  if (jid) {
                    const msgPersonalizada = `Olá, *${resp.nome}*.\n\n${msgWpp}`;
                    await evolutionApi.sendText(jid, msgPersonalizada)
                      .catch(e => console.error(`Erro ao enviar wpp para ${resp.nome}:`, e));
                  }
                })
              );

              // Marca o orçamento como notificado para bloquear reenvios futuros.
              await supabase
                .from("crm_status")
                .update({ perda_notificada_em: new Date().toISOString() })
                .eq("documento", selectedItem.id)
                .eq("empresa", selectedItem.empresa ?? "001");
            }
          }
        } catch (wppErr) {
          // Sentinela de idempotência: não é erro real, apenas indica que o
          // orçamento já havia sido notificado antes.
          if (!(wppErr instanceof Error && wppErr.message === "__ALREADY_NOTIFIED__")) {
            console.error("Erro ao processar envio de WhatsApp para responsáveis:", wppErr);
          }
        }
      }

      setOrçamentosData((prev) =>
        prev.map((item) =>
          item.id === selectedItem.id
            ? { 
                ...item, 
                status: newStatus.toUpperCase(), 
                lossReason: extra?.motivo_perda ?? item.lossReason,
                lembreteData: extra?.lembrete_data ?? extra?.fechamento_previsto ?? item.lembreteData,
                enderecoObra: extra?.endereco_obra !== undefined ? (extra.endereco_obra ?? undefined) : item.enderecoObra,
                fechamentoPrevisto: extra?.fechamento_previsto !== undefined ? (extra.fechamento_previsto ?? undefined) : item.fechamentoPrevisto,
                entregaPrevista: extra?.entrega_prevista !== undefined ? (extra.entrega_prevista ?? undefined) : item.entregaPrevista
              }
            : item
        )
      );
      
      showNotification("success", "Status Atualizado", "O status e lembretes foram salvos com sucesso.");
      setIsStatusModalOpen(false);
      setStatusObs("");
      setLostItemsIds([]);
      setFuContatoRealizado(null);
      setFuCanalContato(null);
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      showNotification("error", "Erro ao Salvar", "Não foi possível salvar a alteração. Tente novamente.");
    } finally {
      isUpdatingStatusRef.current = false;
      setIsUpdatingStatus(false);
    }
  };

  const handleRangeSelect = (start: Date, end: Date | null) => {
    if (start) {
      start.setHours(0, 0, 0, 0);
    }
    if (end) {
      end.setHours(23, 59, 59, 999);
    }
    setStartDate(start);
    setEndDate(end);
    if (start && end) setIsDateModalOpen(false);
  };

  const uniqueSellers = useMemo(() => {
    const sellers = Array.from(new Set(orçamentosData.map((item) => item.seller))).sort();
    
    if (userProfile && isGerenteGeral(userProfile.role)) {
      const options: (string | { label: string; value: string; isHeader?: boolean })[] = [
        { label: "Todos os Vendedores", value: "Todos os Vendedores" }
      ];
      
      if (teamOptions.length > 0) {
        options.push({ label: "Times de Vendas", value: "HEADER_TEAMS", isHeader: true });
        teamOptions.forEach(t => {
          options.push({ label: t.label, value: t.value });
        });
      }
      
      if (sellers.length > 0) {
        options.push({ label: "Vendedores", value: "HEADER_SELLERS", isHeader: true });
        sellers.forEach(s => {
          options.push({ label: s, value: s });
        });
      }
      return options;
    }
    
    return ["Todos os Vendedores", ...sellers];
  }, [orçamentosData, teamOptions, userProfile]);

  // Motivos vindos do cadastro do ERP (CADCOC) — mesma lista do Citel.
  const erpLossReasons = useLossReasons();
  const lossReasons = [LOSS_REASON_ALL, ...erpLossReasons];

  const hojeIso = useMemo(() => toLocalIso(new Date()), []);
  const isDemandas = filterStatus === DEMANDAS_FILTER;

  const filteredAndSortedItems = useMemo(() => {
    // Em Demandas do Dia a lista da tela é somada às demandas de orçamentos antigos.
    let result = isDemandas
      ? (() => {
          const vistos = new Set(orçamentosData.map((o) => o.id.trim()));
          return [...orçamentosData, ...demandasExtras.filter((o) => !vistos.has(o.id.trim()))];
        })()
      : [...orçamentosData];

    if (searchTerm) {
      result = result.filter(
        (item) =>
          item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.seller.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.id.includes(searchTerm)
      );
    }

    if (filterStatus !== "Todos os Status") {
      if (isDemandas) {
        result = result.filter((item) => getDemanda(item, hojeIso) !== null);
      } else if (filterStatus === "Em Aberto") {
        result = result.filter((item) => !["VENDA", "PERDIDO"].includes(item.status));
      } else {
        const statusMap: Record<string, string> = {
          Emitido: "EMITIDO",
          Enviado: "ENVIADO",
          Negociação: "NEGOCIAÇÃO",
          "Lib. Crédito": "LIB. CRÉDITO",
          "Aguard. Pedido": "AGUARD. PEDIDO",
          Venda: "VENDA",
          Perdido: "PERDIDO",
        };
        const mapped = statusMap[filterStatus];
        if (mapped) result = result.filter((item) => item.status === mapped);
      }
    }

    if (filterSeller !== "Todos os Vendedores") {
      if (filterSeller.startsWith("TEAM:")) {
        const team = teamOptions.find((t) => t.value === filterSeller);
        if (team) {
          result = result.filter((item) => {
            const code = String(item.sellerCode || "").trim().replace(/^0+/, "");
            return team.codes.has(code);
          });
        }
      } else {
        result = result.filter((item) => item.seller === filterSeller);
      }
    }

    if (filterReason !== "Todos os Motivos")
      result = result.filter((item) => item.lossReason?.toUpperCase().trim() === filterReason.toUpperCase().trim());

    // Demandas do Dia ignora o período: o que importa é a data de retorno, não a
    // data do orçamento — senão o follow-up de hoje num orçamento de maio sumiria.
    if (!isDemandas && startDate !== null && endDate !== null) {
      result = result.filter((item) => {
        const [d, m, y] = item.date.split("/").map(Number);
        const itemDate = new Date(y, m - 1, d);
        return itemDate >= startDate && itemDate <= endDate;
      });
    }

    // Pauta do dia: mais atrasado primeiro. Só cede se o gestor clicar em outra coluna
    // (a ordenação padrão da tela é por documento, que aqui não diz nada).
    if (isDemandas && sortConfig.key === "id") {
      return result.sort((a, b) => {
        const da = getDemanda(a, hojeIso);
        const db = getDemanda(b, hojeIso);
        return (da?.data || "9999-12-31").localeCompare(db?.data || "9999-12-31");
      });
    }

    if (sortConfig.key !== null && sortConfig.direction !== null) {
      result.sort((a, b) => {
        // Em Demandas do Dia, clicar na coluna Status ordena pela data de retorno
        if (sortConfig.key === "status" && isDemandas) {
          const parseDate = (raw?: string) => {
            if (!raw) return 0;
            const t = raw.trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t.slice(0, 10)).getTime();
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
              const [d, m, y] = t.split("/");
              return new Date(`${y}-${m}-${d}`).getTime();
            }
            return 0;
          };
          // A data que vale é a da demanda (pode vir de fechamento ou entrega
          // previstos, não só do lembrete).
          const aTime = parseDate(getDemanda(a, hojeIso)?.data);
          const bTime = parseDate(getDemanda(b, hojeIso)?.data);
          return sortConfig.direction === "asc" ? aTime - bTime : bTime - aTime;
        }

        let aValue: string | number = a[sortConfig.key as keyof Orcamento] as string | number;
        let bValue: string | number = b[sortConfig.key as keyof Orcamento] as string | number;
        if (sortConfig.key === "total") { aValue = a.totalValue; bValue = b.totalValue; }
        if (sortConfig.key === "markup") { aValue = a.markupValue; bValue = b.markupValue; }
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [orçamentosData, demandasExtras, isDemandas, hojeIso, searchTerm, filterStatus, filterSeller, filterReason, startDate, endDate, sortConfig, teamOptions]);

  const resumoDemandas = useMemo(() => {
    if (!isDemandas) return null;
    let hoje = 0;
    let atrasadas = 0;
    for (const item of filteredAndSortedItems) {
      const d = getDemanda(item, hojeIso);
      if (!d) continue;
      if (d.atrasoDias > 0) atrasadas++;
      else hoje++;
    }
    return { hoje, atrasadas };
  }, [isDemandas, filteredAndSortedItems, hojeIso]);

  // ── Insights (calculados dos dados reais) ───────────────────────────────
  const visibleProducts = useMemo(() => {
    return filteredAndSortedItems.slice(0, visibleCount);
  }, [filteredAndSortedItems, visibleCount]);

  const insights = useMemo(() => {
    const total = filteredAndSortedItems.length;
    const statusCounts = filteredAndSortedItems.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});
    const statusValues = filteredAndSortedItems.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + o.totalValue;
      return acc;
    }, {});
    // Usar dados reais de faturamento (VW_FATURAMENTO) quando disponíveis E não-zero.
    // Se a API retornar 0 mas já temos orçamentos com VENDA na lista filtrada,
    // usamos os dados locais como fallback (ex.: supervisores com filtro de time).
    const localVendas = statusCounts["VENDA"] || 0;
    const localVendasValor = statusValues["VENDA"] || 0;
    const fatQtd = faturamento ? Number(faturamento.QTD_VENDAS) || 0 : 0;
    const fatValor = faturamento ? Number(faturamento.TOTAL_VENDIDO) || 0 : 0;
    // Usa faturamento somente quando ele traz dados reais (QTD > 0 ou VALOR > 0).
    // Caso contrário, cai para os valores da lista filtrada.
    const useFaturamento = faturamento != null && (fatQtd > 0 || fatValor > 0);
    const vendas = useFaturamento ? fatQtd : localVendas;
    const vendasValor = useFaturamento ? fatValor : localVendasValor;
    if (useFaturamento) {
      statusCounts["VENDA"] = vendas;
      statusValues["VENDA"] = vendasValor;
    }

    const perdidos = statusCounts["PERDIDO"] || 0;
    const perdidosValor = statusValues["PERDIDO"] || 0;
    const pipeline = filterStatus === "Perdido"
      ? filteredAndSortedItems.reduce((s, o) => s + o.totalValue, 0)
      : filteredAndSortedItems
          .filter((o) => !["VENDA", "PERDIDO"].includes(o.status))
          .reduce((s, o) => s + o.totalValue, 0);

    // Valor total de todos os orçamentos
    const totalOrcamentosValor = filteredAndSortedItems.reduce((s, o) => s + o.totalValue, 0);

    // Pedido vendido esperando faturamento (FATGOR sem NF) — nada a ver com o
    // `pipeline` acima, que é orçamento ainda não decidido.
    const emAbertoPedidos = faturamento ? Number(faturamento.EM_ABERTO) || 0 : 0;

    // Motivos que não representam perda comercial real — excluídos da taxa de conversão.
    const MOTIVOS_NAO_COMERCIAIS = ["MÃO DE OBRA E MATERIAL", "MAO DE OBRA E MATERIAL"];
    const perdidosConversao = filteredAndSortedItems
      .filter((o) => o.status === "PERDIDO" && !MOTIVOS_NAO_COMERCIAIS.includes((o.lossReason || "").toUpperCase().trim()))
      .reduce((s, o) => s + o.totalValue, 0);

    // Taxa de conversão real = vendas / (vendas + perdidos comerciais)
    const decididos = vendasValor + perdidosConversao;
    const convValor = decididos > 0 ? ((vendasValor / decididos) * 100) : 0;

    const reasonCounts = filteredAndSortedItems
      .filter((o) => o.status === "PERDIDO" && o.lossReason)
      .reduce<Record<string, number>>((acc, o) => {
        const r = o.lossReason!.toUpperCase().trim();
        acc[r] = (acc[r] || 0) + 1;
        return acc;
      }, {});
    const reasonValues = filteredAndSortedItems
      .filter((o) => o.status === "PERDIDO" && o.lossReason)
      .reduce<Record<string, number>>((acc, o) => {
        const r = o.lossReason!.toUpperCase().trim();
        acc[r] = (acc[r] || 0) + o.totalValue;
        return acc;
      }, {});

    return { statusCounts, statusValues, vendas, vendasValor, perdidos, perdidosValor, pipeline, totalOrcamentosValor, emAbertoPedidos, convValor, total, reasonCounts, reasonValues };
  }, [filteredAndSortedItems, filterStatus, faturamento]);

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === "asc"
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevronDown className="w-3 h-3 text-primary" />;
  };

  const handleExportCSV = () => {
    const headers = ["ID", "Vendedor", "Cliente", "Data", "Hora", "Total", "Markup", "Status", "Motivo"];
    const rows = filteredAndSortedItems.map((item) => [
      item.id,
      item.seller,
      item.client,
      item.date,
      item.time,
      item.total.replace("R$ ", ""),
      item.markup,
      item.status,
      item.lossReason || "",
    ]);
    const csvContent = [headers, ...rows].map((e) => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `orcamentos_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dateLabel =
    endDate !== null
      ? `${startDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} até ${endDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
      : startDate
      ? `${startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}...`
      : "Selecione o período...";

  const statusBarData = [
    { label: "Emitido", key: "EMITIDO", color: "bg-slate-400" },
    { label: "Enviado", key: "ENVIADO", color: "bg-blue-500" },
    { label: "Negociação", key: "NEGOCIAÇÃO", color: "bg-amber-400" },
    { label: "Aguard. Pedido", key: "AGUARD. PEDIDO", color: "bg-orange-500" },
    { label: "Venda", key: "VENDA", color: "bg-emerald-500" },
    { label: "Perdido", key: "PERDIDO", color: "bg-rose-500" },
  ];
  const maxStatusCount = Math.max(...statusBarData.map((s) => insights.statusCounts[s.key] || 0), 1);

  const reasonEntries = Object.entries(insights.reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count, value: insights.reasonValues[label] || 0 }));
  const fmtCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const maxReasonCount = Math.max(...reasonEntries.map((e) => e.count), 1);

  return (
    <div className="h-full flex flex-col pt-4 px-3 sm:px-6 pb-2 overflow-y-auto scrollbar-hide bg-background">
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between shrink-0 mb-4 px-1">
        <div className="flex flex-col sm:flex-row gap-2 items-center w-full lg:w-auto flex-1 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Pesquisar orçamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-secondary/30 dark:bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold text-foreground outline-none focus:border-blue-500/50 transition-all placeholder:text-muted-foreground/50 shadow-sm"
            />
          </div>

          {/* Date */}
          <div className="relative">
            <button
              onClick={() => setIsDateModalOpen(!isDateModalOpen)}
              className={cn(
                "h-10 px-4 rounded-xl border text-[10px] font-black uppercase tracking-tight flex items-center gap-2 transition-all outline-none",
                startDate 
                  ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20 text-blue-600 dark:text-blue-400 shadow-sm" 
                  : "bg-card border-border text-muted-foreground hover:border-slate-300 dark:hover:border-slate-700 shadow-sm",
                isDateModalOpen && "ring-4 ring-blue-500/5 border-blue-500/50"
              )}
            >
              <Calendar className="w-3.5 h-3.5 opacity-40 shrink-0" />
              <span className="truncate max-w-[200px]">{dateLabel}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform duration-300 opacity-40 shrink-0", isDateModalOpen && "rotate-180")} />
            </button>
            {isDateModalOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDateModalOpen(false)} />
                <div className="absolute top-full left-0 mt-2 z-50">
                  <MiniCalendar mode="range" onSelectRange={handleRangeSelect} initialStartDate={startDate} initialEndDate={endDate} />
                </div>
              </>
            )}
          </div>

          <TinyDropdown value={filterStatus} options={["Todos os Status", DEMANDAS_FILTER, "Em Aberto", "Emitido", "Enviado", "Negociação", "Lib. Crédito", "Aguard. Pedido", "Venda", "Perdido"]} onChange={setFilterStatus} icon={FileCheck} variant="blue" placeholder="Todos os Status" />
          
          {(isGerente(userProfile?.role) || isSupervisor(userProfile?.role)) && (
            <TinyDropdown value={filterSeller} options={uniqueSellers} onChange={setFilterSeller} icon={UserIcon} variant="slate" placeholder="Todos os Vendedores" />
          )}

          <TinyDropdown value={filterReason} options={lossReasons} onChange={setFilterReason} icon={AlertCircle} variant="amber" placeholder="Todos os Motivos" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="w-10 h-10 bg-card border border-border hover:bg-secondary text-muted-foreground rounded-xl transition-all active:scale-95 shadow-sm flex items-center justify-center group"
            title="Exportar CSV"
          >
            <Download className="w-4 h-4 group-hover:text-blue-600 transition-colors" />
          </button>
        </div>
      </div>



      {/* Barra da pauta do dia — deixa explícito que aqui o período não vale */}
      {resumoDemandas && (
        <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mb-3 px-4 py-2.5 rounded-xl bg-card border border-border shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pauta do dia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-600/20">
              {resumoDemandas.hoje} PARA HOJE
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-600/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-600/20">
              {resumoDemandas.atrasadas} ATRASADA{resumoDemandas.atrasadas === 1 ? "" : "S"}
            </span>
          </div>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">
            Filtro de período ignorado · atrasos dos últimos {DEMANDA_LOOKBACK_DIAS} dias
          </span>
          {loadingDemandas && (
            <span className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-tight">
              <Loader2 className="w-3 h-3 animate-spin" />
              Buscando orçamentos antigos...
            </span>
          )}
        </div>
      )}

      {/* INSIGHTS toggle */}
      <button
        onClick={() => {
          const next = !insightsOpen;
          setInsightsOpen(next);
          try { sessionStorage.setItem("crm_insights_open", String(next)); } catch (err) { console.warn(err); }
        }}
        className="flex items-center gap-2 mb-2 px-1 group shrink-0"
      >
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200", !insightsOpen && "-rotate-90")} />
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">Insights</span>
      </button>
      <div className={cn(
        "grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4 shrink-0 transition-all duration-300 overflow-hidden",
        insightsOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 mb-0"
      )}>
        {/* Distribuição por Status */}
        <div className="lg:col-span-4 bg-card border border-border rounded-xl p-4 shadow-sm">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">Distribuição por Status</h3>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-2 w-16 bg-secondary dark:bg-slate-800 rounded" />
                    <div className="h-2 w-4 bg-secondary dark:bg-slate-800 rounded" />
                  </div>
                  <div className="h-1 w-full bg-secondary dark:bg-slate-800 rounded-full" />
                </div>
              ))
            ) : (
              statusBarData.map((s, i) => {
                const val = insights.statusCounts[s.key] || 0;
                const valMoney = insights.statusValues[s.key] || 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-start text-[9px] font-bold text-muted-foreground">
                      <span className="uppercase tracking-tight truncate pr-2">{s.label}</span>
                        <div className="text-right shrink-0 leading-snug">
                        <span className="text-foreground block">{val}</span>
                        {valMoney > 0 && <span className="text-[10px] font-black text-emerald-500 dark:text-emerald-400">{fmtCurrency(valMoney)}</span>}
                      </div>
                    </div>
                    <div className="h-1 bg-secondary dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", s.color)} style={{ width: `${(val / maxStatusCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Motivos de Perda */}
        <div className="lg:col-span-4 bg-card border border-border rounded-xl p-4 shadow-sm">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">Motivos de Perda</h3>
          <div className="space-y-3.5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-2 w-24 bg-secondary dark:bg-slate-800 rounded" />
                    <div className="h-2 w-4 bg-secondary dark:bg-slate-800 rounded" />
                  </div>
                  <div className="h-2.5 w-full bg-secondary dark:bg-slate-800 rounded-sm" />
                </div>
              ))
            ) : reasonEntries.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic">Nenhum registro ainda</p>
            ) : (
              reasonEntries.map(({ label, count, value }, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-start text-[9px] font-bold text-muted-foreground">
                    <span className="uppercase tracking-tight truncate pr-2">{label}</span>
                    <div className="text-right shrink-0 leading-snug">
                      <span className="text-foreground block">{count}</span>
                      {value > 0 && <span className="text-[10px] font-black text-rose-400">{fmtCurrency(value)}</span>}
                    </div>
                  </div>
                  <div className="h-2.5 bg-secondary dark:bg-slate-800 rounded-sm overflow-hidden border border-border/50">
                    <div className="h-full rounded-r-sm bg-rose-500 transition-all duration-700" style={{ width: `${(count / maxReasonCount) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Resumo Geral */}
        <div className="lg:col-span-4 bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 shrink-0">Resumo Geral</h3>
          {loading ? (
            <div className="flex flex-col flex-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-1 justify-between items-center border-b border-border/50 last:border-0 animate-pulse py-2">
                  <div className="h-2 w-20 bg-secondary dark:bg-slate-800 rounded" />
                  <div className="h-3 w-24 bg-secondary dark:bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : (() => {
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            const donuts = [
              { id: "convGradientValor", label: "Por Valor", pct: insights.convValor, from: "#3b82f6", to: "#60a5fa" },
            ];
            return (
              <div className="flex flex-col flex-1 gap-2">
                {/* Donut: taxa de conversão por valor */}
                <div className="flex items-center justify-center gap-4 py-1">
                  {donuts.map((d) => {
                    const strokeOffset = circumference - (Math.min(d.pct, 200) / 200) * circumference;
                    return (
                      <div key={d.id} className="flex flex-col items-center gap-1">
                        <div className="relative w-[92px] h-[92px]">
                          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                            <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-secondary dark:text-slate-800" strokeWidth="10" />
                            <circle cx="60" cy="60" r={radius} fill="none" stroke={`url(#${d.id})`} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeOffset} className="transition-all duration-1000 ease-out" />
                            <defs>
                              <linearGradient id={d.id} x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor={d.from} />
                                <stop offset="100%" stopColor={d.to} />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[16px] font-black text-foreground leading-none">{d.pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Metrics */}
                <div className="flex flex-col flex-1">
                  {[
                    { label: "Valor Total Orçamentos", value: fmtCurrency(insights.totalOrcamentosValor), color: "text-foreground" },
                    { label: "Qtde. Orçamentos", value: String(insights.total), color: "text-foreground" },
                    { label: "Valor em Aberto", value: fmtCurrency(insights.pipeline), color: "text-blue-500 dark:text-blue-400" },
                    { label: "Valor Perdido", value: fmtCurrency(insights.perdidosValor), color: "text-rose-500 dark:text-rose-400" },
                    { label: "Valor de Venda", value: fmtCurrency(insights.vendasValor), color: "text-emerald-600 dark:text-emerald-400" },
                    // As duas linhas abaixo espelham EM ABERTO e TOTAL do card do vendedor
                    // no Dashboard Geral — mesma fonte, para os números baterem entre as telas.
                    { label: "Pedidos em Aberto", value: fmtCurrency(insights.emAbertoPedidos), color: "text-amber-500 dark:text-amber-400" },
                    { label: "Faturado + Em Aberto", value: fmtCurrency(insights.vendasValor + insights.emAbertoPedidos), color: "text-foreground" },
                  ].map((r, i) => (
                    <div key={i} className="flex flex-1 justify-between items-center border-b border-border/50 last:border-0">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{r.label}</span>
                      <span className={cn("text-[12px] font-black", r.color)}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="sticky top-0 z-20">
                <tr className="bg-secondary/80 border-b border-border backdrop-blur-md">
                  {[
                    { id: "id", label: "Orçamento" },
                    { id: "seller", label: "Vendedor" },
                    { id: "client", label: "Cliente" },
                    { id: "date", label: "Data/Hora" },
                    { id: "total", label: "Total" },
                    { id: "markup", label: "Markup" },
                    ...((isGerente(userProfile?.role) || isSupervisor(userProfile?.role)) && filterStatus === "Perdido" ? [] : [{ id: "status", label: "Status" }]),
                  ].map((col) => (
                    <th
                      key={col.id}
                      onClick={() => !loading && requestSort(col.id)}
                      className={cn("px-6 py-3 text-[9px] font-black uppercase tracking-[0.1em] transition-colors text-muted-foreground group/th", col.id === "status" && "text-center", !loading && "cursor-pointer hover:bg-secondary/40")}
                    >
                      <div className={cn("flex items-center gap-2", col.id === "status" && "justify-center")}>
                        <span className={cn(sortConfig.key === col.id ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 group-hover/th:text-foreground")}>{col.label}</span>
                        {!loading && getSortIcon(col.id)}
                      </div>
                    </th>
                  ))}
                  {/* Colunas extras de declínio — apenas para admins filtrando por Perdido */}
                  {(isGerente(userProfile?.role) || isSupervisor(userProfile?.role)) && filterStatus === "Perdido" && (
                    <>
                      <th className="px-6 py-3 text-[9px] font-black uppercase tracking-[0.1em] text-center text-blue-400">
                        Status Vendedor
                        <div className="text-[7px] font-medium text-slate-500 normal-case tracking-normal mt-0.5">declarado no CRM</div>
                      </th>
                      <th className="px-6 py-3 text-[9px] font-black uppercase tracking-[0.1em] text-center text-amber-400">
                        Status Citel
                        <div className="text-[7px] font-medium text-slate-500 normal-case tracking-normal mt-0.5">ERP / sistema Citel</div>
                      </th>
                    </>
                  )}
                  <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-3 w-12 bg-secondary dark:bg-slate-800 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-3 w-24 bg-secondary dark:bg-slate-800/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-3 w-48 bg-secondary dark:bg-slate-800 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-3 w-20 bg-secondary dark:bg-slate-800/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-3 w-24 bg-emerald-500/10 dark:bg-emerald-500/10 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-3 w-12 bg-secondary dark:bg-slate-800/50 rounded" /></td>
                      {(isGerente(userProfile?.role) || isSupervisor(userProfile?.role)) && filterStatus === "Perdido" && (
                        <>
                          <td className="px-6 py-4"><div className="flex justify-center"><div className="h-5 w-16 bg-blue-500/10 rounded-full" /></div></td>
                          <td className="px-6 py-4"><div className="flex justify-center"><div className="h-5 w-16 bg-amber-500/10 rounded-full" /></div></td>
                        </>
                      )}
                      <td className="px-6 py-4"><div className="flex justify-end gap-2"><div className="h-6 w-6 bg-secondary dark:bg-slate-800/50 rounded" /><div className="h-6 w-6 bg-secondary dark:bg-slate-800/50 rounded" /></div></td>
                    </tr>
                  ))
                ) : filteredAndSortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={(isGerente(userProfile?.role) || isSupervisor(userProfile?.role)) && filterStatus === "Perdido" ? 10 : 8} className="px-6 py-12 text-center text-[11px] text-slate-400 font-bold">
                      {isDemandas
                        ? (loadingDemandas ? "Buscando demandas..." : "Nenhuma demanda pendente — nada vencendo hoje nem atrasado.")
                        : "Nenhum orçamento encontrado para o período selecionado."}
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map((item) => (
                    <OrcamentoRow
                      key={item.id}
                      item={item}
                      isAdmin={isGerente(userProfile?.role) || isSupervisor(userProfile?.role)}
                      showDualColumns={(isGerente(userProfile?.role) || isSupervisor(userProfile?.role)) && filterStatus === "Perdido"}
                      demandaMode={isDemandas}
                      todayStr={hojeIso}
                      onOpenItems={async (o) => {
                        setSelectedItem(o);
                        setIsItemsModalOpen(true);
                        setItens(o.items);
                        try {
                          const fatdorItens = await apiCrmOrcamentoItens(o.id, o.empresa);
                          setItens(fatdorItens.map(mapCrmItem));
                        } catch {
                          // mantém o.items como fallback
                        }
                      }}
                      onOpenStatus={(o) => {
                        setSelectedItem(o);
                        setStatusData(o.lembreteData || "");
                        setStatusFechamento(o.fechamentoPrevisto || "");
                        setStatusEntrega(o.entregaPrevista || "");
                        setStatusEnderecoObra(o.enderecoObra || "");
                        setStatusMotivoPerdido(o.lossReason || "");
                        setStatusObs("");
                        setFuContatoRealizado(null);
                        setIsStatusModalOpen(true);
                        setStatusStep("selection");
                      }}
                      onOpenChat={(o) => {
                        window.dispatchEvent(new CustomEvent('open-crm-chat', { 
                          detail: { 
                            doc: o.id, 
                            title: o.client,
                            sellerName: o.seller,
                            sellerCode: o.sellerCode,
                            items: o.items
                          } 
                        }));
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
      </div>



      {/* ITEMS MODAL */}
      {isItemsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-sm">
          <div className="fixed inset-0" onClick={() => setIsItemsModalOpen(false)} />
          <div className="relative w-full max-w-4xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 pb-4 flex items-center justify-between border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600/10 dark:bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-600/10">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground uppercase tracking-tight leading-none">Itens do Orçamento</h2>
                  {selectedItem && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-secondary px-2 py-0.5 rounded border border-border">
                        #{selectedItem.id.replace("-OR", "")}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter truncate max-w-[200px]">
                        {selectedItem.client}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setIsItemsModalOpen(false)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {itens.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-[11px] text-slate-400 font-bold">Nenhum item encontrado</div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur-md border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left font-black text-muted-foreground uppercase tracking-wider w-16">Cód.</th>
                      <th className="px-4 py-3 text-left font-black text-muted-foreground uppercase tracking-wider">Descrição</th>
                      <th className="px-4 py-3 text-right font-black text-muted-foreground uppercase tracking-wider w-16">Qtd</th>
                      <th className="px-4 py-3 text-center font-black text-muted-foreground uppercase tracking-wider w-12">UN</th>
                      <th className="px-4 py-3 text-right font-black text-muted-foreground uppercase tracking-wider w-28">Val. Unit</th>
                      <th className="px-4 py-3 text-right font-black text-muted-foreground uppercase tracking-wider w-28">Margem</th>
                      <th className="px-4 py-3 text-right font-black text-muted-foreground uppercase tracking-wider w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {itens.map((it, i) => {
                      const qtd = parseFloat(String(it.QUANTIDADE)) || 0;
                      const valuni = parseFloat(String(it.PRECO_UNITARIO)) || 0;
                      const mkpRaw = it.MARKUP_PERCENTUAL;
                      const mkpNull = mkpRaw === null || mkpRaw === undefined;
                      const mkp = mkpNull ? 0 : (parseFloat(String(mkpRaw)) || 0);
                      const total = qtd * valuni;
                      const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                      return (
                        <tr key={i} className="hover:bg-secondary/40 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground font-mono">{it.COD_PRODUTO}</td>
                          <td className="px-4 py-3 text-foreground font-bold" title={it.PRODUTO}>{it.PRODUTO}</td>
                          <td className="px-4 py-3 text-right text-foreground font-black">{qtd.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground font-bold">{it.UN || "UN"}</td>
                          <td className="px-4 py-3 text-right text-foreground font-bold">{fmt(valuni)}</td>
                          <td className={cn("px-4 py-3 text-right font-bold", mkpNull ? "text-muted-foreground" : mkp >= 30 ? "text-emerald-500" : "text-amber-500")}>
                            {mkpNull ? "N/A" : `${mkp.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">{fmt(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-secondary/50">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider">Total do Orçamento</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-600">
                        {itens.reduce((acc, it) => acc + (parseFloat(String(it.QUANTIDADE)) || 0) * (parseFloat(String(it.PRECO_UNITARIO)) || 0), 0)
                          .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="p-6 border-t border-border bg-secondary/50 shrink-0">
              <button onClick={() => setIsItemsModalOpen(false)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATUS MODAL */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-sm">
          <div className="fixed inset-0" onClick={() => setIsStatusModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-card rounded-2xl p-8 shadow-2xl border border-border overflow-hidden">
            <button onClick={() => setIsStatusModalOpen(false)} className="absolute top-6 right-6 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-all">
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-6">
              {statusStep === "selection" ? (
                <>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600/10 dark:bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-600/10">
                      <ChevronsUpDown className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Alterar Status</h3>
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">Fluxo de Vendas</p>
                    </div>
                  </div>
                  {selectedItem && (
                    <div className="p-4 rounded-xl bg-secondary/40 border border-border">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Orçamento Selecionado</p>
                      <p className="text-sm font-black text-foreground tracking-tighter">{selectedItem.id.replace("-OR", "")} — {selectedItem.client}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Emitido", color: "text-slate-600 dark:text-slate-400", dot: "bg-slate-600 dark:bg-slate-400", next: null },
                      { label: "Enviado", color: "text-blue-600 dark:text-blue-400", dot: "bg-blue-600 dark:bg-blue-400", next: "enviado" },
                      { label: "Negociação", color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-600 dark:bg-amber-400", next: "negociacao" },
                      { label: "Lib. Crédito", color: "text-orange-600 dark:text-orange-400", dot: "bg-orange-600 dark:bg-orange-400", next: null },
                      { label: "Aguard. Pedido", color: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-600 dark:bg-indigo-400", next: null },
                      { label: "Perdido", color: "text-rose-600 dark:text-rose-400", dot: "bg-rose-600 dark:bg-rose-400", next: "perdido" },
                    ].map((btn, i) => (
                      <button
                        key={i}
                        onClick={() => btn.next ? setStatusStep(btn.next as "enviado" | "negociacao" | "perdido") : handleUpdateStatus(btn.label.toUpperCase())}
                        className="flex items-center gap-3 py-3 px-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/80 transition-all text-left"
                      >
                        <div className={cn("w-2 h-2 rounded-full", btn.dot)} />
                        <span className={cn("text-[11px] font-bold uppercase tracking-tight", btn.color)}>{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : statusStep === "enviado" ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600/10 dark:bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-600/10">
                      <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">Status: Enviado</h3>
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">Registro de Contato</p>
                    </div>
                  </div>
                  <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 scrollbar-hide">
                    {/* Follow-up: Ligou? */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Realizou contato com o cliente?</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => { setFuContatoRealizado(true); setFuCanalContato(null); }}
                          className={cn(
                            "py-2.5 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                            fuContatoRealizado === true
                              ? "bg-blue-600/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                              : "bg-secondary/20 border-border hover:bg-secondary/60 text-muted-foreground"
                          )}
                        >
                          <PhoneIncoming className="w-3.5 h-3.5" /> Conectou
                        </button>
                        <button
                          onClick={() => { setFuContatoRealizado(false); setFuCanalContato(null); }}
                          className={cn(
                            "py-2.5 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                            fuContatoRealizado === false
                              ? "bg-rose-600/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                              : "bg-secondary/20 border-border hover:bg-secondary/60 text-muted-foreground"
                          )}
                        >
                          <PhoneOff className="w-3.5 h-3.5" /> Não Conectou
                        </button>
                      </div>
                    </div>

                    {/* Follow-up: Canal de Contato */}
                    {fuContatoRealizado !== null && (
                      <div className="space-y-1.5 animate-fadeIn">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">
                          {fuContatoRealizado ? "Via qual canal conectou?" : "Via qual canal tentou?"}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setFuCanalContato("whatsapp")}
                            className={cn(
                              "py-2.5 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                              fuCanalContato === "whatsapp"
                                ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                : "bg-secondary/20 border-border hover:bg-secondary/60 text-muted-foreground"
                            )}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.85L.057 23.93l6.225-1.635A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.372l-.36-.213-3.694.97.985-3.6-.234-.37A9.818 9.818 0 0112 2.182c5.424 0 9.818 4.394 9.818 9.818S17.424 21.818 12 21.818z"/></svg>
                            WhatsApp
                          </button>
                          <button
                            onClick={() => setFuCanalContato("ligacao")}
                            className={cn(
                              "py-2.5 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                              fuCanalContato === "ligacao"
                                ? "bg-blue-600/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                                : "bg-secondary/20 border-border hover:bg-secondary/60 text-muted-foreground"
                            )}
                          >
                            <PhoneIncoming className="w-3.5 h-3.5" /> Ligação
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="border-t border-border/30 my-1" />

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Endereço da Obra</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                        <input
                          type="text"
                          placeholder="CEP ou endereço completo..."
                          value={statusEnderecoObra}
                          onChange={(e) => handleEnderecoObraChange(e.target.value)}
                          className="w-full bg-secondary/40 border border-border rounded-xl pl-10 pr-10 py-3 text-sm font-semibold text-foreground outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-muted-foreground/30"
                        />
                        {cepLoading && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500 animate-spin" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Prev. Fechamento</label>
                        <div className="relative group">
                          <input
                            type="date"
                            value={statusFechamento}
                            onChange={(e) => setStatusFechamento(e.target.value)}
                            className="w-full bg-secondary/40 border border-border rounded-xl pl-4 pr-10 py-3 text-sm font-semibold text-foreground outline-none focus:border-blue-500/50 uppercase [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                          />
                          <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Prev. Entrega</label>
                        <div className="relative group">
                          <input
                            type="date"
                            value={statusEntrega}
                            onChange={(e) => setStatusEntrega(e.target.value)}
                            className="w-full bg-secondary/40 border border-border rounded-xl pl-4 pr-10 py-3 text-sm font-semibold text-foreground outline-none focus:border-blue-500/50 uppercase [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                          />
                          <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Próximo Contato / Data de Retorno</label>
                      <div className="relative group">
                        <input
                          type="date"
                          value={statusData}
                          onChange={(e) => setStatusData(e.target.value)}
                          className="w-full bg-secondary/40 border border-border rounded-xl pl-4 pr-10 py-3 text-sm font-semibold text-foreground outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all uppercase [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                        />
                        <CalendarDays className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Observação</label>
                      <textarea placeholder="Ex: Cliente solicitou retorno na segunda..." rows={3} value={statusObs} onChange={(e) => setStatusObs(e.target.value)} className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-semibold text-foreground outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none placeholder:text-muted-foreground/30" />
                    </div>
                    <button onClick={() => {
                      handleUpdateStatus("ENVIADO", {
                        lembrete_data: statusData,
                        endereco_obra: statusEnderecoObra,
                        fechamento_previsto: statusFechamento,
                        entrega_prevista: statusEntrega
                      });
                    }} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/10 active:scale-[0.98] transition-all">
                      Confirmar Envio
                    </button>
                  </div>
                </div>
              ) : statusStep === "negociacao" ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 dark:bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/10">
                      <Handshake className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">Negociação</h3>
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">Dados da Proposta</p>
                    </div>
                  </div>
                  <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 scrollbar-hide">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Data de Retorno</label>
                      <div className="relative group">
                        <input 
                          type="date" 
                          value={statusData} 
                          onChange={(e) => setStatusData(e.target.value)} 
                          className="w-full bg-secondary/40 border border-border rounded-xl pl-4 pr-10 py-3 text-sm font-semibold text-foreground outline-none focus:border-amber-600/50 uppercase [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0" 
                        />
                        <CalendarDays className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 group-focus-within:text-amber-500 transition-colors pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Observações</label>
                      <textarea placeholder="Detalhes da negociação..." rows={4} value={statusObs} onChange={(e) => setStatusObs(e.target.value)} className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-semibold text-foreground outline-none resize-none placeholder:text-muted-foreground/30 focus:border-amber-600/50 focus:ring-4 focus:ring-amber-600/5 transition-all" />
                    </div>
                    <button
                      onClick={() => handleUpdateStatus("NEGOCIAÇÃO", { lembrete_data: statusData })}
                      className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
                    >
                      Salvar Negociação
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-500/10 dark:bg-rose-500/20 rounded-xl flex items-center justify-center border border-rose-500/10">
                      <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">Status: Perdido</h3>
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">Motivo da Perda</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Selecione o Motivo *</label>
                      <TinyDropdown 
                        value={statusMotivoPerdido} 
                        options={erpLossReasons}
                        onChange={(val) => setStatusMotivoPerdido(val)} 
                        icon={Tag} 
                        variant="slate" 
                        placeholder="Selecione o motivo..."
                        className="w-full" 
                      />
                    </div>
                    {isEstoqueLossReason(statusMotivoPerdido) ? (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Marque os Itens Perdidos *</label>
                        <div className="max-h-[220px] overflow-y-auto border border-border rounded-xl bg-secondary/40 divide-y divide-border/50 scrollbar-hide">
                          {selectedItem?.items.map((it) => (
                            <label key={it.COD_PRODUTO} className="flex items-center gap-3 p-3 hover:bg-secondary/60 cursor-pointer transition-colors group">
                                <div className="relative flex items-center justify-center">
                                  <input 
                                    type="checkbox" 
                                    id={`lost-${it.COD_PRODUTO}`}
                                    checked={lostItemsIds.includes(String(it.COD_PRODUTO))}
                                    onChange={(e) => {
                                      const id = String(it.COD_PRODUTO);
                                      if (e.target.checked) setLostItemsIds(prev => [...prev, id]);
                                      else setLostItemsIds(prev => prev.filter(x => x !== id));
                                    }}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-rose-500 checked:bg-rose-500"
                                  />
                                  <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" strokeWidth="1"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                                  </span>
                                </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-black text-foreground uppercase tracking-tight group-hover:text-rose-500 transition-colors leading-none">{it.PRODUTO}</p>
                                <p className="text-[9px] font-bold text-muted-foreground mt-0.5">Cód: {it.COD_PRODUTO}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">Observação Adicional</label>
                        <textarea placeholder="Explique por que o negócio não avançou..." rows={4} value={statusObs} onChange={(e) => setStatusObs(e.target.value)} className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-semibold text-foreground outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/5 transition-all resize-none placeholder:text-muted-foreground/50" />
                      </div>
                    )}
                    <button
                      onClick={() => handleUpdateStatus("PERDIDO", { motivo_perda: statusMotivoPerdido })}
                      disabled={isUpdatingStatus || !statusMotivoPerdido || (isEstoqueLossReason(statusMotivoPerdido) && lostItemsIds.length === 0)}
                      className="w-full h-14 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-500/20 active:scale-[0.98] transition-all"
                    >
                      {isUpdatingStatus ? "Confirmando..." : "Confirmar Perda"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
