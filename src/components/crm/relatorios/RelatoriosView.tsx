import { useState, useMemo, useEffect, Fragment } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  PackageX,
  Download,
  Search,
  Calendar,
  ChevronDown,
  DollarSign,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Tag,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiCrmOrcamentos, apiCrmFaturamento, apiCrmOrcamentoItens, mapCrmItem, type CrmItem, type FaturamentoResumo } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { MiniCalendar } from "@/components/ui/MiniCalendar";
import * as XLSX from "xlsx";

interface UserProfile {
  id?: string;
  name: string;
  role: string;
  avatar?: string;
}

interface OrcamentoItem {
  COD_PRODUTO?: string | number;
  cod?: string | number;
  PRODUTO?: string;
  nome?: string;
  VALOR_TOTAL?: string | number;
  total?: string | number;
  QUANTIDADE?: string | number;
  qtd?: string | number;
  PRECO_UNITARIO?: string | number;
  CUSTO_UNITARIO?: string | number;
  MARKUP_PERCENTUAL?: string | number;
  UN?: string;
}

interface Orcamento {
  id: string;
  client: string;
  seller: string;
  numericValue: number;
  value: string;
  status: string;
  lossReason: string;
  items: OrcamentoItem[];
  empresa: string;
  docGerado?: string;
}

interface RelatoriosViewProps {
  orcamentos?: Orcamento[];
  userProfile?: UserProfile;
}

type TabId = "overview" | "losses_stock" | "losses_price" | "losses_orders" | "sellers" | "clients";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Visão Geral", icon: Target },
  { id: "losses_stock", label: "Perdas por Estoque", icon: PackageX },
  { id: "losses_price", label: "Perdas por Preço", icon: Tag },
  { id: "losses_orders", label: "Perdas por Orçamento", icon: FileText },
  { id: "sellers", label: "Desempenho de Vendedores", icon: Award },
  { id: "clients", label: "Perdas por Clientes", icon: Users },
];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

// Arredonda a quantidade a 2 casas (remove o "ruído" de ponto flutuante tipo
// 54.510000000000005) e formata em pt-BR.
const formatQtd = (n: number) => Number((Number(n) || 0).toFixed(2)).toLocaleString("pt-BR");

const parseNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // Formato BRL "1.234,56" (ponto de milhar, vírgula decimal).
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
};

// Markup % do item: usa MARKUP_PERCENTUAL se vier; senão calcula por (preço/custo - 1).
const markupPct = (item: OrcamentoItem): number | null => {
  if (item.MARKUP_PERCENTUAL === null || item.MARKUP_PERCENTUAL === undefined) return null;
  const mkp = parseFloat(String(item.MARKUP_PERCENTUAL));
  if (mkp) return mkp;
  const preco = parseNum(item.PRECO_UNITARIO);
  const custo = parseNum(item.CUSTO_UNITARIO);
  return custo > 0 ? (preco / custo - 1) * 100 : null;
};

const INITIAL_ROWS = 8;

// Códigos de produto que NÃO devem aparecer nos rankings de itens perdidos
// (ex.: 99997 é um item genérico/coringa que distorce os valores). Comparado
// ignorando zeros à esquerda.
const CODIGOS_ITENS_OCULTOS = new Set(["99997"]);
const isCodOculto = (cod: string) =>
  CODIGOS_ITENS_OCULTOS.has(String(cod).trim().replace(/^0+/, ""));

/** Rodapé de paginação reutilizável. Some quando há uma página ou menos. */
function Pagination({
  page,
  total,
  pageSize,
  onChange,
  label = "registros",
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  if (total <= pageSize) return null;

  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 border-t border-border bg-secondary/40">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        {from}–{to} de {total} {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(safePage - 1)}
          disabled={safePage <= 1}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-secondary text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary/70 transition-colors"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-black text-foreground tabular-nums px-1">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-secondary text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary/70 transition-colors"
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function RelatoriosView({
  orcamentos: propsOrcamentos = [],
  userProfile,
}: RelatoriosViewProps) {
  const [localOrcamentos, setLocalOrcamentos] = useState<Orcamento[]>([]);
  const [faturamentoData, setFaturamentoData] = useState<FaturamentoResumo | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [searchTerm, setSearchTerm] = useState("");

  // Orçamento com a lista de itens expandida (aba Perdas por Orçamento).
  // Os itens (com CUSTO/MARKUP reais) vêm do endpoint /itens sob demanda — o
  // endpoint de LISTA devolve custo/markup zerados, por isso não dá pra usar o.items.
  const [orcamentoExpandido, setOrcamentoExpandido] = useState<string | null>(null);
  const [itensCache, setItensCache] = useState<Record<string, CrmItem[]>>({});
  const [carregandoItens, setCarregandoItens] = useState<string | null>(null);

  const toggleOrcamentoItens = async (docId: string, empresa: string) => {
    if (orcamentoExpandido === docId) {
      setOrcamentoExpandido(null);
      return;
    }
    setOrcamentoExpandido(docId);
    if (itensCache[docId]) return; // já carregado
    setCarregandoItens(docId);
    try {
      const itens = await apiCrmOrcamentoItens(docId, empresa);
      setItensCache((prev) => ({ ...prev, [docId]: itens.map(mapCrmItem) }));
    } catch (e) {
      console.error("[Relatorios] Erro ao buscar itens do orçamento:", e);
      setItensCache((prev) => ({ ...prev, [docId]: [] }));
    } finally {
      setCarregandoItens(null);
    }
  };

  // Linhas por página DINÂMICAS: preenchem a altura da tela (mais linhas em telas
  // altas, menos em baixas) — evita sobrar espaço embaixo da tabela.
  const [pageSize, setPageSize] = useState(INITIAL_ROWS);
  useEffect(() => {
    const calcRows = () => {
      const ROW_H = 56; // altura aproximada de uma linha
      const CHROME = 280; // topo do HUB + abas + busca + cabeçalho da tabela + rodapé
      const n = Math.floor((window.innerHeight - CHROME) / ROW_H);
      setPageSize(Math.max(6, Math.min(30, n)));
    };
    calcRows();
    window.addEventListener("resize", calcRows);
    return () => window.removeEventListener("resize", calcRows);
  }, []);

  // Paginação (uma página por tabela)
  const [pageEstoque, setPageEstoque] = useState(1);
  const [pagePrecoItens, setPagePrecoItens] = useState(1);
  const [pagePreco, setPagePreco] = useState(1);
  const [pageVend, setPageVend] = useState(1);
  const [pageCli, setPageCli] = useState(1);

  // Dates: Default to start of current month until today
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Carregamento de Dados (Dinâmico por período ou via props)
  const loadData = async () => {
    if (propsOrcamentos.length > 0) {
      setLocalOrcamentos(propsOrcamentos);
      return;
    }

    setLoading(true);
    try {
      const startStr = startDate ? startDate.toISOString().split("T")[0] : "";
      const endStr = endDate ? endDate.toISOString().split("T")[0] : startStr;

      const [raw, fatRes] = await Promise.all([
        apiCrmOrcamentos({ inicio: startStr, fim: endStr }),
        apiCrmFaturamento({ inicio: startStr, fim: endStr }).catch(() => null),
      ]);

      if (fatRes && (Number(fatRes.QTD_VENDAS) > 0 || Number(fatRes.TOTAL_VENDIDO) > 0)) {
        setFaturamentoData(fatRes);
      } else {
        setFaturamentoData(null);
      }

      // Filtro de Privacidade (Vendedor só vê o dele)
      let filteredRaw = raw || [];
      if (userProfile?.role?.toUpperCase() === "VENDEDOR" && userProfile?.name) {
        const userName = userProfile.name.toUpperCase();
        filteredRaw = filteredRaw.filter((o) => {
          const sellerName = (o.VENDEDOR || "").toUpperCase();
          return sellerName.includes(userName) || userName.includes(sellerName);
        });
      }

      // Status do CRM no Supabase
      const { data: statuses } = await supabase.from("crm_status").select("*");

      let parsed: Orcamento[] = filteredRaw.map((o: any) => {
        const apiId = String(o.ORCAMENTO).replace("-OR", "").trim();

        const s = (statuses || []).find((st) => {
          const dbId = String(st.documento).replace("-OR", "").trim();
          return dbId === apiId || st.documento === o.ORCAMENTO;
        });

        // 1. ERP Status (CITEL/ERP):
        let erpStatus = "EMITIDO";
        const motCan = String(o.MOTIVO_CANCELAMENTO || "").trim();
        if (motCan && motCan !== "SEM MOTIVO") {
          erpStatus = "PERDIDO";
        } else if (
          o.PEDIDO === "Sim" ||
          (o.NOTA_FISCAL && String(o.NOTA_FISCAL).trim() !== "") ||
          (o.DATA_BAIXA && o.DATA_BAIXA !== "SEM DATA") ||
          (o.DOC_GERADO && String(o.DOC_GERADO).trim() !== "")
        ) {
          erpStatus = "VENDA";
        }

        // 2. Supabase CRM overlay:
        let status = erpStatus;
        if (s?.status_crm) {
          const crmStatus = s.status_crm.toUpperCase().trim();
          if (crmStatus === "VENDA" || crmStatus === "GANHO") {
            status = "VENDA";
          } else if (crmStatus === "PERDIDO" || crmStatus === "CANCELADO") {
            status = "PERDIDO";
          } else if (erpStatus === "EMITIDO") {
            status = crmStatus;
          }
        }

        const lossReason = (
          (motCan && motCan !== "SEM MOTIVO" ? motCan : s?.motivo_perda) || ""
        ).toUpperCase().trim();

        let itemsToCount: OrcamentoItem[] = [];

        if (status === "PERDIDO" || status === "CANCELADO") {
          const idsEstoque = s?.itens_estoque || [];
          const idsPreco = s?.itens_preco || [];
          const allSpecificIds = [
            ...(Array.isArray(idsEstoque) ? idsEstoque : []),
            ...(Array.isArray(idsPreco) ? idsPreco : []),
          ];

          if (allSpecificIds.length > 0) {
            itemsToCount = (o.PRODUTOS || []).filter((it: OrcamentoItem) =>
              allSpecificIds.map(String).includes(String(it.COD_PRODUTO))
            );
          } else {
            itemsToCount = o.PRODUTOS || [];
          }
        }

        const numVal = (o.PRODUTOS || []).reduce((acc: number, it: any) => {
          const q = parseFloat(String(it.QUANTIDADE || 0)) || 0;
          const p = parseFloat(String(it.PRECO_UNITARIO || 0)) || 0;
          return acc + q * p;
        }, 0) || parseFloat(String(o.VALOR_TOTAL_ORCAMENTO || 0)) || 0;

        return {
          id: o.ORCAMENTO,
          client: o.CLIENTE || "CLIENTE NÃO INFORMADO",
          seller: o.VENDEDOR || "SEM VENDEDOR",
          numericValue: numVal,
          value: numVal ? formatCurrency(numVal) : "R$ 0,00",
          status,
          lossReason,
          items: itemsToCount,
          empresa: o.EMPRESA || "",
          docGerado: o.DOC_GERADO || undefined,
        };
      });

      // 3. Deduplicação de orçamentos por documento entre lojas
      const statusPriority: Record<string, number> = { VENDA: 3, PERDIDO: 2 };
      const byDoc = new Map<string, Orcamento>();
      for (const o of parsed) {
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
      parsed = Array.from(byDoc.values());

      // 4. Deduplicação de orçamentos "migrados" entre empresas
      const normDoc = (s?: string) =>
        String(s || "").split("-")[0].replace(/\D/g, "").padStart(12, "0");
      const idsPresentes = new Set(parsed.map((o) => normDoc(o.id)));
      parsed = parsed.filter((o) => {
        if (o.status === "VENDA" || o.status === "PERDIDO") return true;
        if (!o.docGerado) return true;
        const gerado = normDoc(o.docGerado);
        if (gerado === normDoc(o.id)) return true;
        return !idsPresentes.has(gerado);
      });

      setLocalOrcamentos(parsed);
    } catch (e) {
      console.error("[RelatoriosView] Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [startDate, endDate, propsOrcamentos, userProfile?.name, userProfile?.role]);

  const orcamentos = localOrcamentos;

  // ─── Cálculos Globais ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalCount = orcamentos.length;
    const totalValue = orcamentos.reduce((acc, o) => acc + (o.numericValue || 0), 0);

    const ganhoArr = orcamentos.filter((o) => o.status === "GANHO" || o.status === "VENDA");
    const localWonCount = ganhoArr.length;
    const localWonValue = ganhoArr.reduce((acc, o) => acc + (o.numericValue || 0), 0);

    const fatQtd = faturamentoData ? Number(faturamentoData.QTD_VENDAS) || 0 : 0;
    const fatValor = faturamentoData ? Number(faturamentoData.TOTAL_VENDIDO) || 0 : 0;
    const useFaturamento = faturamentoData != null && (fatQtd > 0 || fatValor > 0);

    const wonCount = useFaturamento ? fatQtd : localWonCount;
    const wonValue = useFaturamento ? fatValor : localWonValue;

    const perdidosArr = orcamentos.filter((o) => o.status === "PERDIDO" || o.status === "CANCELADO");
    const lostCount = perdidosArr.length;
    const lostValue = perdidosArr.reduce((acc, o) => acc + (o.numericValue || 0), 0);

    const openCount = totalCount - (wonCount + lostCount);
    const openValue = Math.max(0, totalValue - (wonValue + lostValue));

    // Taxa de conversão real = vendas / (vendas + perdidos) -> igualzinho OrcamentosView
    const decididos = wonValue + lostValue;
    const convByValue = decididos > 0 ? (wonValue / decididos) * 100 : 0;
    const avgTicket = totalCount > 0 ? totalValue / totalCount : 0;

    return {
      totalCount,
      totalValue,
      wonCount,
      wonValue,
      lostCount,
      lostValue,
      openCount,
      openValue,
      convByValue,
      avgTicket,
    };
  }, [orcamentos, faturamentoData]);

  // ─── Perdas por Estoque ────────────────────────────────────────────────────────
  const perdasPorEstoque = useMemo(() => {
    const perdidos = orcamentos.filter((o) => {
      if (o.status !== "PERDIDO" && o.status !== "CANCELADO") return false;
      const reason = (o.lossReason || "").toUpperCase();
      return (
        reason.includes("ESTOQUE") ||
        reason.includes("FALTA") ||
        reason.includes("FURO") ||
        reason === "" ||
        reason === "SEM MOTIVO" ||
        (o.items && o.items.length > 0)
      );
    });

    const ranking: Record<
      string,
      { cod: string; nome: string; total: number; qtd: number; orcamentos: number }
    > = {};

    perdidos.forEach((o) => {
      const lostItems = o.items || [];

      lostItems.forEach((item: OrcamentoItem) => {
        const cod = String(item.COD_PRODUTO || item.cod || "S/C");
        if (isCodOculto(cod)) return;
        const nome = String(item.PRODUTO || item.nome || "PRODUTO NÃO IDENTIFICADO");
        const valor = parseFloat(
          String(
            item.VALOR_TOTAL ||
              item.total ||
              Number(item.QUANTIDADE || 0) * Number(item.PRECO_UNITARIO || 0) ||
              0
          )
        );
        const qtd = Number(item.QUANTIDADE || item.qtd || 1);

        if (!ranking[cod]) {
          ranking[cod] = { cod, nome, total: 0, qtd: 0, orcamentos: 0 };
        }
        ranking[cod].total += valor;
        ranking[cod].qtd += qtd;
        ranking[cod].orcamentos += 1;
      });
    });

    return Object.values(ranking).sort((a, b) => b.total - a.total);
  }, [orcamentos]);

  const totalPerdaEstoqueValor = useMemo(
    () => perdasPorEstoque.reduce((acc, curr) => acc + curr.total, 0),
    [perdasPorEstoque]
  );

  // ─── Perdas por Preço ──────────────────────────────────────────────────────────
  const perdasPorPreco = useMemo(() => {
    const perdidosPreco = orcamentos.filter((o) => {
      if (o.status !== "PERDIDO" && o.status !== "CANCELADO") return false;
      const reason = (o.lossReason || "").toUpperCase();
      return (
        reason.includes("PREÇO") ||
        reason.includes("PRECO") ||
        reason.includes("VALOR") ||
        reason.includes("ALTERAÇÃO DE PREÇO") ||
        reason.includes("PREÇO ALTO")
      );
    });

    return perdidosPreco.sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0));
  }, [orcamentos]);

  const totalPerdaPrecoValor = useMemo(
    () => perdasPorPreco.reduce((acc, curr) => acc + (curr.numericValue || 0), 0),
    [perdasPorPreco]
  );

  // ─── Itens perdidos por preço (ranking de produtos) ──────────────────────────
  const perdasPorPrecoItens = useMemo(() => {
    const ranking: Record<
      string,
      { cod: string; nome: string; total: number; qtd: number; orcamentos: number }
    > = {};

    perdasPorPreco.forEach((o) => {
      (o.items || []).forEach((item: OrcamentoItem) => {
        const cod = String(item.COD_PRODUTO || item.cod || "S/C");
        if (isCodOculto(cod)) return;
        const nome = String(item.PRODUTO || item.nome || "PRODUTO NÃO IDENTIFICADO");
        const valor = parseFloat(
          String(
            item.VALOR_TOTAL ||
              item.total ||
              Number(item.QUANTIDADE || 0) * Number(item.PRECO_UNITARIO || 0) ||
              0
          )
        );
        const qtd = Number(item.QUANTIDADE || item.qtd || 1);

        if (!ranking[cod]) {
          ranking[cod] = { cod, nome, total: 0, qtd: 0, orcamentos: 0 };
        }
        ranking[cod].total += valor;
        ranking[cod].qtd += qtd;
        ranking[cod].orcamentos += 1;
      });
    });

    return Object.values(ranking).sort((a, b) => b.total - a.total);
  }, [perdasPorPreco]);

  const perdasPorPrecoItensFiltradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return perdasPorPrecoItens;
    return perdasPorPrecoItens.filter(
      (p) => p.cod.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q)
    );
  }, [perdasPorPrecoItens, searchTerm]);

  const totalPerdaItensPrecoValor = useMemo(
    () => perdasPorPrecoItens.reduce((acc, curr) => acc + (curr.total || 0), 0),
    [perdasPorPrecoItens]
  );

  // ─── Métricas por Vendedor ───────────────────────────────────────────────────
  const metricasVendedores = useMemo(() => {
    const map: Record<
      string,
      {
        nome: string;
        sellerCode: string;
        total: number;
        valTotal: number;
        ganhos: number;
        valGanhos: number;
        perdidos: number;
        valPerdidos: number;
        abertos: number;
        valAbertos: number;
        conversao: number;
      }
    > = {};

    orcamentos.forEach((o) => {
      const rawSeller = o.seller || "SEM VENDEDOR";
      const parts = rawSeller.split("-");
      const sellerCode = parts.length > 1 ? parts[0].trim() : "";
      const cleanName = parts.length > 1 ? parts.slice(1).join("-").trim() : rawSeller.trim();
      const displayName = sellerCode ? `${sellerCode}-${cleanName}` : cleanName;

      if (!map[displayName]) {
        map[displayName] = {
          nome: displayName,
          sellerCode,
          total: 0,
          valTotal: 0,
          ganhos: 0,
          valGanhos: 0,
          perdidos: 0,
          valPerdidos: 0,
          abertos: 0,
          valAbertos: 0,
          conversao: 0,
        };
      }
      const v = map[displayName];
      const val = o.numericValue || 0;

      v.total += 1;
      v.valTotal += val;

      if (o.status === "GANHO" || o.status === "VENDA") {
        v.ganhos += 1;
        v.valGanhos += val;
      } else if (o.status === "PERDIDO" || o.status === "CANCELADO") {
        v.perdidos += 1;
        v.valPerdidos += val;
      } else {
        v.abertos += 1;
        v.valAbertos += val;
      }
    });

    return Object.values(map)
      .map((v) => {
        // Taxa de conversão real por valor (Decididos: Ganhos vs Perdidos) idêntica a OrcamentosView
        const decididosValor = v.valGanhos + v.valPerdidos;
        const convVal = decididosValor > 0 ? (v.valGanhos / decididosValor) * 100 : 0;

        return {
          ...v,
          conversao: convVal,
        };
      })
      .sort((a, b) => b.valGanhos - a.valGanhos);
  }, [orcamentos]);

  // ─── Métricas por Cliente ────────────────────────────────────────────────────
  const metricasClientes = useMemo(() => {
    const clients: Record<
      string,
      {
        nome: string;
        total: number;
        valTotal: number;
        fechados: number;
        valFechados: number;
        perdidos: number;
        valorPerdido: number;
      }
    > = {};

    orcamentos.forEach((o) => {
      const clientName = o.client || "CLIENTE NÃO IDENTIFICADO";
      if (!clients[clientName]) {
        clients[clientName] = {
          nome: clientName,
          total: 0,
          valTotal: 0,
          fechados: 0,
          valFechados: 0,
          perdidos: 0,
          valorPerdido: 0,
        };
      }
      const c = clients[clientName];
      c.total += 1;
      const val = o.numericValue || 0;
      c.valTotal += val;

      if (o.status === "GANHO" || o.status === "VENDA") {
        c.fechados += 1;
        c.valFechados += val;
      } else if (o.status === "PERDIDO" || o.status === "CANCELADO") {
        c.perdidos += 1;
        c.valorPerdido += val;
      }
    });

    return Object.values(clients).sort((a, b) => b.valorPerdido - a.valorPerdido);
  }, [orcamentos]);

  // ─── Filtros de Busca Aplicados ──────────────────────────────────────────────
  const perdasPorEstoqueFiltradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return perdasPorEstoque;
    return perdasPorEstoque.filter(
      (p) => p.cod.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q)
    );
  }, [perdasPorEstoque, searchTerm]);

  const perdasPorPrecoFiltradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return perdasPorPreco;
    return perdasPorPreco.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.seller.toLowerCase().includes(q) ||
        p.lossReason.toLowerCase().includes(q)
    );
  }, [perdasPorPreco, searchTerm]);

  const vendedoresFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return metricasVendedores;
    return metricasVendedores.filter((v) => v.nome.toLowerCase().includes(q));
  }, [metricasVendedores, searchTerm]);

  const clientesFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return metricasClientes;
    return metricasClientes.filter((c) => c.nome.toLowerCase().includes(q));
  }, [metricasClientes, searchTerm]);

  // Reset das páginas quando a busca ou a aba muda
  useEffect(() => {
    setPageEstoque(1);
    setPagePrecoItens(1);
    setPagePreco(1);
    setPageVend(1);
    setPageCli(1);
  }, [searchTerm, activeTab]);

  // Recortes paginados
  const estoquePaginadas = useMemo(
    () => perdasPorEstoqueFiltradas.slice((pageEstoque - 1) * pageSize, pageEstoque * pageSize),
    [perdasPorEstoqueFiltradas, pageEstoque]
  );
  const precoItensPaginados = useMemo(
    () => perdasPorPrecoItensFiltradas.slice((pagePrecoItens - 1) * pageSize, pagePrecoItens * pageSize),
    [perdasPorPrecoItensFiltradas, pagePrecoItens]
  );
  const precoPaginadas = useMemo(
    () => perdasPorPrecoFiltradas.slice((pagePreco - 1) * pageSize, pagePreco * pageSize),
    [perdasPorPrecoFiltradas, pagePreco]
  );
  const vendedoresPaginados = useMemo(
    () => vendedoresFiltrados.slice((pageVend - 1) * pageSize, pageVend * pageSize),
    [vendedoresFiltrados, pageVend]
  );
  const clientesPaginados = useMemo(
    () => clientesFiltrados.slice((pageCli - 1) * pageSize, pageCli * pageSize),
    [clientesFiltrados, pageCli]
  );

  // Funil Comercial (Orçamentos -> Abertos -> Ganhos)
  const funnelData = [
    {
      label: "Total Criado",
      value: totals.totalValue,
      count: totals.totalCount,
      color: "bg-blue-500",
      pct: 100,
    },
    {
      label: "Em Negociação",
      value: totals.openValue,
      count: totals.openCount,
      color: "bg-amber-500",
      pct: totals.totalValue > 0 ? (totals.openValue / totals.totalValue) * 100 : 0,
    },
    {
      label: "Vendas Ganhas",
      value: totals.wonValue,
      count: totals.wonCount,
      color: "bg-emerald-500",
      pct: totals.totalValue > 0 ? (totals.wonValue / totals.totalValue) * 100 : 0,
    },
    {
      label: "Perdidos",
      value: totals.lostValue,
      count: totals.lostCount,
      color: "bg-rose-500",
      pct: totals.totalValue > 0 ? (totals.lostValue / totals.totalValue) * 100 : 0,
    },
  ];

  // ─── Exportação Excel ───────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Resumo Geral
    const wsGeralData = [
      { Métrica: "Total Orçamentado (R$)", Valor: totals.totalValue },
      { Métrica: "Total Orçamentos (Qtd)", Valor: totals.totalCount },
      { Métrica: "Vendas Ganhas (R$)", Valor: totals.wonValue },
      { Métrica: "Vendas Ganhas (Qtd)", Valor: totals.wonCount },
      { Métrica: "Orçamentos Perdidos (R$)", Valor: totals.lostValue },
      { Métrica: "Orçamentos Perdidos (Qtd)", Valor: totals.lostCount },
      { Métrica: "Perda por Falta de Estoque (R$)", Valor: totalPerdaEstoqueValor },
      { Métrica: "Perda por Preço (R$)", Valor: totalPerdaPrecoValor },
      { Métrica: "Taxa Conversão (Valor)", Valor: `${totals.convByValue.toFixed(1)}%` },
      { Métrica: "Ticket Médio", Valor: totals.avgTicket },
    ];
    const wsGeral = XLSX.utils.json_to_sheet(wsGeralData);
    XLSX.utils.book_append_sheet(wb, wsGeral, "Resumo");

    // 2. Perdas Por Estoque
    const wsPerdasEstoqueData = perdasPorEstoque.map((p) => ({
      Código: p.cod,
      Produto: p.nome,
      "Qtd Perdida": p.qtd,
      "Ocorrências em Orçamentos": p.orcamentos,
      "Valor Perdido Total (R$)": p.total,
    }));
    const wsPerdasEstoque = XLSX.utils.json_to_sheet(wsPerdasEstoqueData);
    XLSX.utils.book_append_sheet(wb, wsPerdasEstoque, "Perdas Estoque");

    // 3. Perdas Por Preço (Valor do Orçamento)
    const wsPerdasPrecoData = perdasPorPreco.map((p) => ({
      Orçamento: p.id,
      Cliente: p.client,
      Vendedor: p.seller,
      Motivo: p.lossReason || "PREÇO ALTO",
      "Qtd Itens": p.items.length,
      "Valor do Orçamento (R$)": p.numericValue,
    }));
    const wsPerdasPreco = XLSX.utils.json_to_sheet(wsPerdasPrecoData);
    XLSX.utils.book_append_sheet(wb, wsPerdasPreco, "Perdas Preço");

    // 3b. Itens perdidos por preço (ranking de produtos)
    const wsItensPrecoData = perdasPorPrecoItens.map((p) => ({
      Código: p.cod,
      Produto: p.nome,
      "Qtd Perdida": p.qtd,
      "Ocorrências em Orçamentos": p.orcamentos,
      "Valor Perdido Total (R$)": p.total,
    }));
    const wsItensPreco = XLSX.utils.json_to_sheet(wsItensPrecoData);
    XLSX.utils.book_append_sheet(wb, wsItensPreco, "Itens Perdidos Preço");

    // 4. Vendedores
    const wsVendData = metricasVendedores.map((v) => ({
      Vendedor: v.nome,
      "Total Orçamentos": v.total,
      "Valor Total (R$)": v.valTotal,
      "Ganhos (Qtd)": v.ganhos,
      "Ganhos (R$)": v.valGanhos,
      "Perdidos (Qtd)": v.perdidos,
      "Perdidos (R$)": v.valPerdidos,
      "Conversão (%)": Number(v.conversao.toFixed(1)),
    }));
    const wsVend = XLSX.utils.json_to_sheet(wsVendData);
    XLSX.utils.book_append_sheet(wb, wsVend, "Desempenho Vendedores");

    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Relatorio_Comercial_${dateStr}.xlsx`);
  };

  const dateLabel =
    endDate !== null
      ? `${startDate?.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })} até ${endDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}`
      : startDate
      ? `${startDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}...`
      : "Selecione o período...";

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-background">
      <div className="w-full flex flex-col min-h-0 flex-1 px-6 md:px-8 pt-6">
        {/* Header Superior */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shrink-0 px-1">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              Desempenho Comercial & Perdas
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
              Análise de orçamentos, vendas ganhas, perdas por estoque e performance por vendedor
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-start md:justify-end">
            {/* Range Date Picker */}
            <div className="relative">
              <button
                onClick={() => setIsDateModalOpen(!isDateModalOpen)}
                className={cn(
                  "h-10 px-4 rounded-xl border text-[10px] font-black uppercase tracking-tight flex items-center gap-2 transition-all outline-none",
                  startDate && endDate
                    ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:border-border/80 shadow-sm",
                  isDateModalOpen && "ring-4 ring-blue-500/10 border-blue-500/50"
                )}
              >
                <Calendar className="w-3.5 h-3.5 opacity-40 shrink-0" />
                <span className="truncate max-w-[210px]">{dateLabel}</span>
                <ChevronDown
                  className={cn(
                    "w-3 h-3 transition-transform duration-300 opacity-40 shrink-0",
                    isDateModalOpen && "rotate-180"
                  )}
                />
              </button>

              {isDateModalOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsDateModalOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 z-50">
                    <MiniCalendar
                      mode="range"
                      onSelectRange={(start, end) => {
                        setStartDate(start);
                        setEndDate(end);
                        if (start && end) setIsDateModalOpen(false);
                      }}
                      initialStartDate={startDate}
                      initialEndDate={endDate}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Export button */}
            <button
              onClick={handleExportExcel}
              className="h-10 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2"
              title="Exportar dados em Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>
          </div>
        </div>

        {/* Minimal Tabs */}
        <div className="shrink-0 flex items-center gap-1 border-b border-border mt-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "relative px-4 py-3 text-[11px] font-black uppercase tracking-wider transition-colors flex items-center gap-2",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content Container */}
        <div className="flex-1 min-h-0 overflow-y-auto py-5 pr-1 scrollbar-hide">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">
                Gerando relatórios comerciais...
              </span>
            </div>
          ) : (
            <>
              {/* TAB 1: VISÃO GERAL */}
              {activeTab === "overview" && (
                <div className="flex flex-col gap-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Orçamentado */}
                    <div className="p-5 bg-card/60 border border-border rounded-2xl shadow-sm relative overflow-hidden group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                          <DollarSign className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                          {totals.totalCount} Orçamentos
                        </span>
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">
                        Total Orçamentado
                      </span>
                      <div className="text-2xl font-black text-foreground mt-1">
                        {formatCurrency(totals.totalValue)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-medium">
                        Ticket médio: <strong className="text-foreground">{formatCurrency(totals.avgTicket)}</strong>
                      </div>
                    </div>

                    {/* Vendas Ganhas */}
                    <div className="p-5 bg-card/60 border border-border rounded-2xl shadow-sm relative overflow-hidden group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <ArrowUpRight className="w-3 h-3" />
                          {totals.convByValue.toFixed(1)}% Conv
                        </span>
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">
                        Vendas Convertidas
                      </span>
                      <div className="text-2xl font-black text-emerald-500 mt-1">
                        {formatCurrency(totals.wonValue)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-medium">
                        <strong className="text-foreground">{totals.wonCount}</strong> pedidos ganhos
                      </div>
                    </div>

                    {/* Perdas Comerciais Totais */}
                    <div className="p-5 bg-card/60 border border-border rounded-2xl shadow-sm relative overflow-hidden group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                          <TrendingDown className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <ArrowDownRight className="w-3 h-3" />
                          {totals.lostCount} Perdidos
                        </span>
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">
                        Total de Perdas
                      </span>
                      <div className="text-2xl font-black text-rose-500 mt-1">
                        {formatCurrency(totals.lostValue)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-medium">
                        Em negociação: <strong className="text-foreground">{formatCurrency(totals.openValue)}</strong>
                      </div>
                    </div>

                    {/* Perdas por Falta de Estoque */}
                    <div className="p-5 bg-card/60 border border-border rounded-2xl shadow-sm relative overflow-hidden group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                          <PackageX className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                          {perdasPorEstoque.length} Itens
                        </span>
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">
                        Perda por Estoque
                      </span>
                      <div className="text-2xl font-black text-amber-500 mt-1">
                        {formatCurrency(totalPerdaEstoqueValor)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-medium">
                        Itens com ruptura reportada
                      </div>
                    </div>
                  </div>

                  {/* Funil Comercial & Destaques */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Funil Comercial */}
                    <div className="lg:col-span-2 bg-card/50 border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                            <Target className="w-4 h-4 text-primary" />
                            Funil Comercial do Período
                          </h3>
                          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                            Evolução dos orçamentos do valor total até os ganhos e perdas
                          </p>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-secondary px-2.5 py-1 rounded-lg">
                          {totals.totalCount} Registros
                        </span>
                      </div>

                      <div className="flex flex-col gap-4 my-2">
                        {funnelData.map((item, idx) => (
                          <div key={idx} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={cn("w-2.5 h-2.5 rounded-full", item.color)} />
                                <span className="font-bold text-foreground">{item.label}</span>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  ({item.count} orçamentos)
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-black text-foreground">{formatCurrency(item.value)}</span>
                                <span className="text-[10px] font-black text-muted-foreground w-12 text-right">
                                  {item.pct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all duration-700", item.color)}
                                style={{ width: `${Math.min(100, Math.max(2, item.pct))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resumo Rápido Top Perdas Estoque */}
                    <div className="bg-card/50 border border-border rounded-2xl p-6 shadow-sm flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                          Top Perdas por Estoque
                        </h3>
                        <button
                          onClick={() => setActiveTab("losses_stock")}
                          className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline"
                        >
                          Ver tudo
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {perdasPorEstoque.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-10">
                            <PackageX className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">
                              Sem registros de falta no período
                            </span>
                          </div>
                        ) : (
                          perdasPorEstoque.slice(0, 5).map((p, i) => (
                            <div
                              key={p.cod}
                              className="p-3 bg-secondary/30 border border-border/50 rounded-xl flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="w-5 h-5 shrink-0 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-black flex items-center justify-center">
                                  {i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span className="text-[10px] font-black text-blue-500 block truncate">
                                    {p.cod}
                                  </span>
                                  <span className="text-[10px] font-bold text-muted-foreground block truncate uppercase">
                                    {p.nome}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs font-black text-rose-500 shrink-0 tabular-nums">
                                {formatCurrency(p.total)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PERDAS POR ESTOQUE */}
              {activeTab === "losses_stock" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por código de produto ou descrição..."
                        className="w-full h-10 pl-9 pr-4 bg-secondary/40 border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <span className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-wider">
                      Total Perda Estoque: {formatCurrency(totalPerdaEstoqueValor)}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
                    <table className="w-full text-left">
                      <thead className="bg-secondary/60 border-b border-border sticky top-0 backdrop-blur-md z-10">
                        <tr>
                          <th className="p-3.5 pl-4 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">#</th>
                          <th className="p-3.5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Código / Produto</th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Qtd Perdida</th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Orçamentos Afetados</th>
                          <th className="p-3.5 pr-4 text-right text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Valor Total Perdido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {perdasPorEstoqueFiltradas.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-16 text-center">
                              <div className="flex flex-col items-center gap-2 opacity-50">
                                <PackageX className="w-8 h-8 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">
                                  Nenhuma perda por estoque encontrada
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          estoquePaginadas.map((p, idx) => {
                            const rank = (pageEstoque - 1) * pageSize + idx;
                            return (
                            <tr key={p.cod} className="hover:bg-secondary/20 transition-colors">
                              <td className="p-3.5 pl-4">
                                <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black", rank < 3 ? "bg-amber-500/15 text-amber-500 border border-amber-500/20" : "bg-secondary text-muted-foreground")}>
                                  {rank + 1}
                                </span>
                              </td>
                              <td className="p-3.5">
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-blue-500">CÓD: {p.cod}</span>
                                  <span className="text-[10px] font-bold text-foreground uppercase truncate max-w-[360px]">{p.nome}</span>
                                </div>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs font-black">{formatQtd(p.qtd)} un</span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="text-xs font-bold text-muted-foreground">{p.orcamentos} {p.orcamentos === 1 ? "orçamento" : "orçamentos"}</span>
                              </td>
                              <td className="p-3.5 pr-4 text-right">
                                <span className="text-sm font-black text-amber-500 tabular-nums">{formatCurrency(p.total)}</span>
                              </td>
                            </tr>
                          );})
                        )}
                      </tbody>
                    </table>
                    <Pagination page={pageEstoque} total={perdasPorEstoqueFiltradas.length} pageSize={pageSize} onChange={setPageEstoque} label="produtos" />
                  </div>
                </div>
              )}

              {/* TAB 3: PERDAS POR PREÇO (VALOR DO ORÇAMENTO) */}
              {activeTab === "losses_price" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por produto ou código..."
                        className="w-full h-10 pl-9 pr-4 bg-secondary/40 border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <span className="px-3 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-500 rounded-xl text-[10px] font-black uppercase tracking-wider">
                      Total Itens Perdidos: {formatCurrency(totalPerdaItensPrecoValor)}
                    </span>
                  </div>

                  {/* Ranking de ITENS perdidos por preço */}
                  <div className="flex flex-col gap-2">
                    <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
                      <table className="w-full text-left">
                        <thead className="bg-secondary/60 border-b border-border sticky top-0 backdrop-blur-md z-10">
                          <tr>
                            <th className="p-3.5 pl-4 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">#</th>
                            <th className="p-3.5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Código / Produto</th>
                            <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Qtd Perdida</th>
                            <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Orçamentos Afetados</th>
                            <th className="p-3.5 pr-4 text-right text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Valor Total Perdido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {perdasPorPrecoItensFiltradas.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-10 text-center">
                                <div className="flex flex-col items-center gap-2 opacity-50">
                                  <Tag className="w-7 h-7 text-muted-foreground" />
                                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">
                                    Nenhum item perdido por preço no período
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            precoItensPaginados.map((p, idx) => {
                              const rank = (pagePrecoItens - 1) * pageSize + idx;
                              return (
                              <tr key={p.cod} className="hover:bg-secondary/20 transition-colors">
                                <td className="p-3.5 pl-4">
                                  <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black", rank < 3 ? "bg-purple-500/15 text-purple-500 border border-purple-500/20" : "bg-secondary text-muted-foreground")}>
                                    {rank + 1}
                                  </span>
                                </td>
                                <td className="p-3.5">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-blue-500">CÓD: {p.cod}</span>
                                    <span className="text-[10px] font-bold text-foreground uppercase truncate max-w-[360px]">{p.nome}</span>
                                  </div>
                                </td>
                                <td className="p-3.5 text-center">
                                  <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs font-black">{formatQtd(p.qtd)} un</span>
                                </td>
                                <td className="p-3.5 text-center">
                                  <span className="text-xs font-bold text-muted-foreground">{p.orcamentos} {p.orcamentos === 1 ? "orçamento" : "orçamentos"}</span>
                                </td>
                                <td className="p-3.5 pr-4 text-right">
                                  <span className="text-sm font-black text-purple-500 tabular-nums">{formatCurrency(p.total)}</span>
                                </td>
                              </tr>
                            );})
                          )}
                        </tbody>
                      </table>
                      <Pagination page={pagePrecoItens} total={perdasPorPrecoItensFiltradas.length} pageSize={pageSize} onChange={setPagePrecoItens} label="itens" />
                    </div>
                  </div>

                </div>
              )}

              {/* TAB: PERDAS POR ORÇAMENTO */}
              {activeTab === "losses_orders" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por orçamento, cliente, vendedor ou motivo..."
                        className="w-full h-10 pl-9 pr-4 bg-secondary/40 border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <span className="px-3 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-500 rounded-xl text-[10px] font-black uppercase tracking-wider">
                      Total (Valor Orçamentos): {formatCurrency(totalPerdaPrecoValor)}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
                    <table className="w-full text-left">
                      <thead className="bg-secondary/60 border-b border-border sticky top-0 backdrop-blur-md z-10">
                        <tr>
                          <th className="p-3.5 pl-4 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]"># Orçamento</th>
                          <th className="p-3.5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Cliente</th>
                          <th className="p-3.5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Vendedor</th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Motivo da Perda</th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Qtd Itens</th>
                          <th className="p-3.5 pr-4 text-right text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Valor do Orçamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {perdasPorPrecoFiltradas.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-16 text-center">
                              <div className="flex flex-col items-center gap-2 opacity-50">
                                <FileText className="w-8 h-8 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">
                                  Nenhuma perda por orçamento registrada no período
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          precoPaginadas.map((o, idx) => {
                            const rank = (pagePreco - 1) * pageSize + idx;
                            const temItens = !!o.items?.length;
                            const aberto = orcamentoExpandido === o.id;
                            const itensDet = itensCache[o.id];
                            const carregando = carregandoItens === o.id;
                            return (
                            <Fragment key={o.id}>
                            <tr className={cn("hover:bg-secondary/20 transition-colors", aberto && "bg-secondary/20")}>
                              <td className="p-3.5 pl-4">
                                <div className="flex items-center gap-2">
                                  <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0", rank < 3 ? "bg-purple-500/15 text-purple-500 border border-purple-500/20" : "bg-secondary text-muted-foreground")}>
                                    {rank + 1}
                                  </span>
                                  <span className="text-xs font-black text-foreground">#{o.id}</span>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <span className="text-xs font-bold text-foreground uppercase truncate max-w-[220px] block">{o.client}</span>
                              </td>
                              <td className="p-3.5">
                                <span className="text-xs font-black text-blue-500 uppercase">{o.seller}</span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20 text-[10px] font-black uppercase">
                                  {o.lossReason || "PREÇO ALTO"}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleOrcamentoItens(o.id, o.empresa)}
                                  disabled={!temItens}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors",
                                    temItens ? "bg-secondary hover:bg-purple-500/15 text-foreground hover:text-purple-500" : "text-muted-foreground/50 cursor-default",
                                  )}
                                  title={temItens ? "Ver itens e markup" : "Sem itens detalhados"}
                                >
                                  {o.items?.length || 0} {o.items?.length === 1 ? "item" : "itens"}
                                  {temItens && <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", aberto && "rotate-180")} />}
                                </button>
                              </td>
                              <td className="p-3.5 pr-4 text-right">
                                <span className="text-sm font-black text-purple-500 tabular-nums">{formatCurrency(o.numericValue)}</span>
                              </td>
                            </tr>
                            {aberto && (
                              <tr className="bg-secondary/10">
                                <td colSpan={6} className="p-0">
                                  <div className="px-4 py-3 overflow-x-auto">
                                    {carregando ? (
                                      <div className="flex items-center justify-center gap-2 py-4">
                                        <span className="w-4 h-4 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Carregando itens…</span>
                                      </div>
                                    ) : !itensDet || itensDet.length === 0 ? (
                                      <div className="py-4 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic opacity-60">
                                        Nenhum item detalhado para este orçamento
                                      </div>
                                    ) : (
                                    <table className="w-full text-left min-w-[640px]">
                                      <thead>
                                        <tr className="border-b border-border/50">
                                          <th className="py-2 pr-3 text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Código</th>
                                          <th className="py-2 pr-3 text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Produto</th>
                                          <th className="py-2 px-3 text-center text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Qtd</th>
                                          <th className="py-2 px-3 text-right text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Custo Un.</th>
                                          <th className="py-2 px-3 text-right text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Preço Un.</th>
                                          <th className="py-2 px-3 text-right text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Markup</th>
                                          <th className="py-2 pl-3 text-right text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/30">
                                        {itensDet.map((it, i) => {
                                          const cod = String(it.COD_PRODUTO || "S/C");
                                          const nome = String(it.PRODUTO || "—");
                                          const qtd = parseNum(it.QUANTIDADE) || 1;
                                          const preco = parseNum(it.PRECO_UNITARIO);
                                          const custo = parseNum(it.CUSTO_UNITARIO);
                                          const total = preco * qtd;
                                          const mkp = markupPct(it);
                                          return (
                                            <tr key={i} className="hover:bg-secondary/20">
                                              <td className="py-2 pr-3 text-[10px] font-black text-blue-500 whitespace-nowrap">{cod}</td>
                                              <td className="py-2 pr-3 text-[10px] font-bold text-foreground uppercase truncate max-w-[300px]">{nome}</td>
                                              <td className="py-2 px-3 text-center text-[10px] font-bold text-muted-foreground whitespace-nowrap">{qtd} {it.UN || "un"}</td>
                                              <td className="py-2 px-3 text-right text-[10px] font-semibold text-muted-foreground tabular-nums">{custo > 0 ? formatCurrency(custo) : "—"}</td>
                                              <td className="py-2 px-3 text-right text-[10px] font-semibold text-foreground tabular-nums">{formatCurrency(preco)}</td>
                                              <td className="py-2 px-3 text-right">
                                                {mkp == null ? (
                                                  <span className="text-[10px] font-bold text-muted-foreground">—</span>
                                                ) : (
                                                  <span className={cn("text-[10px] font-black tabular-nums", mkp >= 30 ? "text-emerald-500" : mkp >= 0 ? "text-amber-500" : "text-rose-500")}>
                                                    {mkp.toFixed(1)}%
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-2 pl-3 text-right text-[10px] font-black text-purple-500 tabular-nums">{formatCurrency(total)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          );})
                        )}
                      </tbody>
                    </table>
                    <Pagination page={pagePreco} total={perdasPorPrecoFiltradas.length} pageSize={pageSize} onChange={setPagePreco} label="orçamentos" />
                  </div>
                </div>
              )}

              {/* TAB 3: DESEMPENHO DE VENDEDORES */}
              {activeTab === "sellers" && (
                <div className="flex flex-col gap-4">
                  {/* Busca */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nome do vendedor..."
                        className="w-full h-10 pl-9 pr-4 bg-secondary/40 border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <span className="px-3 py-2 bg-secondary/40 border border-border rounded-xl text-[10px] font-bold text-muted-foreground">
                      Total: <strong className="text-foreground font-black">{vendedoresFiltrados.length}</strong> vendedores
                    </span>
                  </div>

                  {/* Tabela de Vendedores */}
                  <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
                    <table className="w-full text-left">
                      <thead className="bg-secondary/60 border-b border-border sticky top-0 backdrop-blur-md z-10">
                        <tr>
                          <th className="p-3.5 pl-4 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Vendedor
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Total Orçamentos
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Vendas Ganhas
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Perdas
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Taxa de Conversão
                          </th>
                          <th className="p-3.5 pr-4 text-right text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Total Ganho (R$)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {vendedoresFiltrados.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-16 text-center">
                              <div className="flex flex-col items-center gap-2 opacity-50">
                                <Users className="w-8 h-8 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">
                                  Nenhum vendedor encontrado
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          vendedoresPaginados.map((v, idx) => {
                            const rank = (pageVend - 1) * pageSize + idx;
                            return (
                            <tr
                              key={v.nome}
                              className="hover:bg-secondary/20 transition-colors"
                            >
                              <td className="p-3.5 pl-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0",
                                      rank === 0
                                        ? "bg-amber-500/20 text-amber-500 border border-amber-500/20"
                                        : rank === 1
                                        ? "bg-slate-400/20 text-slate-400 border border-slate-400/20"
                                        : rank === 2
                                        ? "bg-orange-600/20 text-orange-600 border border-orange-600/20"
                                        : "bg-secondary text-muted-foreground"
                                    )}
                                  >
                                    {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : rank + 1}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-foreground uppercase">
                                      {v.nome}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground font-bold">
                                      {formatCurrency(v.valTotal)} orçamentados
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-center font-bold text-xs">
                                {v.total}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="text-xs font-black text-emerald-500">
                                  {v.ganhos}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="text-xs font-black text-rose-500">
                                  {v.perdidos}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-xs font-black text-foreground">
                                    {v.conversao.toFixed(1)}%
                                  </span>
                                  <div className="w-24 bg-secondary h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full"
                                      style={{ width: `${Math.min(100, v.conversao)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 pr-4 text-right">
                                <span className="text-sm font-black text-emerald-500 tabular-nums">
                                  {formatCurrency(v.valGanhos)}
                                </span>
                              </td>
                            </tr>
                          );})
                        )}
                      </tbody>
                    </table>
                    <Pagination page={pageVend} total={vendedoresFiltrados.length} pageSize={pageSize} onChange={setPageVend} label="vendedores" />
                  </div>
                </div>
              )}

              {/* TAB 4: CLIENTES & OCORRÊNCIAS */}
              {activeTab === "clients" && (
                <div className="flex flex-col gap-4">
                  {/* Busca */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por cliente..."
                        className="w-full h-10 pl-9 pr-4 bg-secondary/40 border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <span className="px-3 py-2 bg-secondary/40 border border-border rounded-xl text-[10px] font-bold text-muted-foreground">
                      Total: <strong className="text-foreground font-black">{clientesFiltrados.length}</strong> clientes
                    </span>
                  </div>

                  {/* Tabela de Clientes */}
                  <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
                    <table className="w-full text-left">
                      <thead className="bg-secondary/60 border-b border-border sticky top-0 backdrop-blur-md z-10">
                        <tr>
                          <th className="p-3.5 pl-4 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Cliente
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Orçamentos Totais
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Vendas Fechadas
                          </th>
                          <th className="p-3.5 text-center text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Perdas Registradas
                          </th>
                          <th className="p-3.5 pr-4 text-right text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            Valor Total Perdido
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {clientesFiltrados.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-16 text-center">
                              <div className="flex flex-col items-center gap-2 opacity-50">
                                <Users className="w-8 h-8 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">
                                  Nenhum cliente encontrado
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          clientesPaginados.map((c, idx) => {
                            const rank = (pageCli - 1) * pageSize + idx;
                            return (
                            <tr
                              key={c.nome}
                              className="hover:bg-secondary/20 transition-colors"
                            >
                              <td className="p-3.5 pl-4">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={cn(
                                      "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0",
                                      rank < 3
                                        ? "bg-rose-500/15 text-rose-500 border border-rose-500/20"
                                        : "bg-secondary text-muted-foreground"
                                    )}
                                  >
                                    {rank + 1}
                                  </span>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-foreground uppercase truncate max-w-[300px]">
                                      {c.nome}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground font-bold">
                                      Total Orçamentado: {formatCurrency(c.valTotal)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-center font-bold text-xs">
                                {c.total}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="text-xs font-black text-emerald-500">
                                  {c.fechados}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="text-xs font-black text-rose-500">
                                  {c.perdidos}
                                </span>
                              </td>
                              <td className="p-3.5 pr-4 text-right">
                                <span className="text-sm font-black text-rose-500 tabular-nums">
                                  {formatCurrency(c.valorPerdido)}
                                </span>
                              </td>
                            </tr>
                          );})
                        )}
                      </tbody>
                    </table>
                    <Pagination page={pageCli} total={clientesFiltrados.length} pageSize={pageSize} onChange={setPageCli} label="clientes" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
