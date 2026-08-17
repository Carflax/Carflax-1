import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronRight, Clock, CalendarCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/App";

interface FollowUpItem {
  documento: string;
  lembrete_data: string;
  status_crm: string;
  vendedor?: string | null;
  vendedor_codigo?: string | null;
  clientName?: string;
}

interface Props {
  userProfile: UserProfile | null;
  onNavigateToFollowUps?: () => void;
}

const SNOOZE_DURATION_SELLER_MS = 5 * 60 * 1000; // 5 minutos
const SNOOZE_DURATION_ADMIN_MS = 24 * 60 * 60 * 1000; // 1 dia
const STORAGE_KEY = "carflax-followup-snoozed-until";

export function FollowUpReminder({ userProfile, onNavigateToFollowUps }: Props) {
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [visible, setVisible] = useState(false);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSnoozed = useCallback(() => {
    try {
      const until = localStorage.getItem(STORAGE_KEY);
      if (!until) return false;
      return Date.now() < Number(until);
    } catch {
      return false;
    }
  }, []);

  const fetchFollowUps = useCallback(async () => {
    if (!userProfile?.id) return;

    const operatorCode = userProfile.operator_code || userProfile.operatorCode;
    const todayStr = new Date().toISOString().split("T")[0];

    try {
      let query = supabase
        .from("crm_status")
        .select("documento, lembrete_data, status_crm, vendedor, vendedor_codigo")
        .eq("status_crm", "ENVIADO")
        .lt("lembrete_data", todayStr)
        .not("lembrete_data", "is", null)
        // Exclui datas vazias: string "" passa no filtro "< hoje" (é lexicograficamente
        // menor) e no "not null", entrando na lista sem data de retorno de verdade.
        .neq("lembrete_data", "");

      const role = userProfile.role?.toUpperCase() || "";
      const isSalesManager = role === "ADMIN" || role.includes("DIRETOR") || role.includes("GERENTE COMERCIAL") || role.includes("GERENTE DE VENDAS");

      if (!isSalesManager) {
        if (!operatorCode) return;
        query = query.eq("vendedor_codigo", operatorCode);
      }

      const { data, error } = await query.order("lembrete_data", { ascending: true }).limit(20);

      if (error) {
        console.warn("[FollowUpReminder] Erro ao buscar follow-ups:", error.message);
        return;
      }

      if (data && data.length > 0) {
        // Busca nomes dos clientes via API de orçamentos para cada documento
        let items = data as FollowUpItem[];

        try {
          const { apiCrmOrcamentos } = await import("@/lib/api");
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth() + 1).padStart(2, "0");
          // Busca com janela de 12 meses para cobrir orçamentos antigos
          const inicio = `${yyyy - 1}-${mm}-01`;
          const fim = `${yyyy}-${mm}-${String(today.getDate()).padStart(2, "0")}`;

          const params: Record<string, string> = { inicio, fim };
          if (!isSalesManager && operatorCode) params.vendedor = String(operatorCode);

          const orcamentos = await apiCrmOrcamentos(params).catch(() => null);

          if (orcamentos && orcamentos.length > 0) {
            const clientMap = new Map<string, string>();
            const finalizadosSet = new Set<string>();
            for (const o of orcamentos) {
              const doc = o.ORCAMENTO?.trim();
              clientMap.set(doc, o.CLIENTE || o.CLIENTE_NOME || "");
              const isCancelled = o.MOTIVO_CANCELAMENTO && o.MOTIVO_CANCELAMENTO !== "SEM MOTIVO";
              const isVenda = o.PEDIDO === "Sim" || o.NOTA_FISCAL || (o.DATA_BAIXA && o.DATA_BAIXA !== "SEM DATA");
              if (isCancelled || isVenda) finalizadosSet.add(doc);
            }
            items = items
              .filter((f) => !finalizadosSet.has(f.documento?.trim()))
              .map((f) => ({
                ...f,
                clientName: clientMap.get(f.documento?.trim()) || undefined,
              }));

            // Sincronizar crm_status dos finalizados no Supabase
            const docsToUpdate = data!.filter((d) => finalizadosSet.has(d.documento?.trim()));
            if (docsToUpdate.length > 0) {
              Promise.all(
                docsToUpdate.map((d) => {
                  const doc = d.documento?.trim();
                  const orc = orcamentos.find((o) => o.ORCAMENTO?.trim() === doc);
                  const isVenda = orc && (orc.PEDIDO === "Sim" || orc.NOTA_FISCAL || (orc.DATA_BAIXA && orc.DATA_BAIXA !== "SEM DATA"));
                  return supabase.from("crm_status").update({
                    status_crm: isVenda ? "VENDA" : "PERDIDO",
                    updated_at: new Date().toISOString(),
                  }).eq("documento", d.documento);
                })
              ).catch(() => {});
            }
          }
        } catch {
          // silêncio — usa o documento como fallback
        }

        setFollowUps(items);
        if (!isSnoozed()) {
          setVisible(true);
        }
      } else {
        setFollowUps([]);
        setVisible(false);
      }
    } catch (err) {
      console.warn("[FollowUpReminder] Erro:", err);
    }
  }, [userProfile, isSnoozed]);

  useEffect(() => {
    if (!userProfile?.id) return;

    const initialDelay = setTimeout(() => {
      fetchFollowUps();
    }, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchFollowUps();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(initialDelay);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userProfile?.id, fetchFollowUps]);

  useEffect(() => {
    return () => {
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    };
  }, []);

  const isManager = (() => {
    const role = userProfile?.role?.toUpperCase() || "";
    return role === "ADMIN" || role.includes("GERENTE") || role.includes("DIRETOR");
  })();

  const handleSnooze = () => {
    const duration = isManager ? SNOOZE_DURATION_ADMIN_MS : SNOOZE_DURATION_SELLER_MS;
    localStorage.setItem(STORAGE_KEY, String(Date.now() + duration));
    setVisible(false);

    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    snoozeTimerRef.current = setTimeout(() => {
      localStorage.removeItem(STORAGE_KEY);
      fetchFollowUps();
    }, duration);
  };

  const handleNavigate = () => {
    setVisible(false);
    if (onNavigateToFollowUps) onNavigateToFollowUps();
  };

  const formatDate = (raw: string) => {
    if (!raw) return "";
    const t = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
      const [y, m, d] = t.slice(0, 10).split("-");
      return `${d}/${m}/${y}`;
    }
    return t;
  };

  const overdueCount = followUps.filter((f) => {
    const t = f.lembrete_data?.trim();
    if (!t) return false;
    let iso: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) iso = t.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
      const [d, m, y] = t.split("/");
      iso = `${y}-${m}-${d}`;
    }
    const today = new Date().toISOString().split("T")[0];
    return iso !== null && iso < today;
  }).length;

  if (!visible || followUps.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="followup-reminder"
        initial={{ opacity: 0, x: 60, scale: 0.93 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 40, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        className="fixed bottom-6 right-6 z-[998] w-[380px] pointer-events-auto"
      >
        <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
          {/* Accent bar — azul primário, combina com o tema da app */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-blue-500 to-blue-700" />

          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 ring-1 ring-blue-200 dark:ring-blue-500/20">
              <Bell className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.12em] leading-none">
                Follow-up Pendente
              </h4>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
                {followUps.length} orçamento{followUps.length > 1 ? "s" : ""} aguardam contato
                {overdueCount > 0 && (
                  <span className="ml-1.5 text-rose-500 font-black">
                    ({overdueCount} atrasado{overdueCount > 1 ? "s" : ""})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Follow-up list */}
          <div className="px-5 pb-2 space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-hide">
            {followUps.slice(0, 5).map((f, i) => {
              const dateStr = formatDate(f.lembrete_data);
              const todayIso = new Date().toISOString().split("T")[0];
              const fIso = f.lembrete_data?.slice(0, 10);
              const isOverdue = fIso && fIso < todayIso;
              const isToday = fIso === todayIso;

              return (
                <div
                  key={f.documento + i}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors",
                    isOverdue
                      ? "bg-rose-50/60 dark:bg-rose-500/5 border-rose-200/50 dark:border-rose-500/15"
                      : "bg-blue-50/40 dark:bg-blue-500/5 border-blue-200/50 dark:border-blue-500/10"
                  )}
                >
                  <CalendarCheck
                    className={cn(
                      "w-4 h-4 shrink-0",
                      isOverdue ? "text-rose-400" : "text-blue-400"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">
                      {f.clientName || f.documento}
                    </p>
                    <p
                      className={cn(
                        "text-[9px] font-bold mt-0.5",
                        isOverdue
                          ? "text-rose-500"
                          : isToday
                          ? "text-blue-500"
                          : "text-slate-400"
                      )}
                    >
                      {isOverdue ? "⚠ Atrasado · " : isToday ? "📅 Hoje · " : ""}
                      Retorno: {dateStr}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600 shrink-0">
                    #{f.documento.replace("-OR", "")}
                  </span>
                </div>
              );
            })}
            {followUps.length > 5 && (
              <p className="text-center text-[9px] font-bold text-slate-400 dark:text-slate-500 pb-1">
                +{followUps.length - 5} mais...
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-5 pt-1 pb-4">
            <button
              onClick={handleSnooze}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
              title={isManager ? "Fechar por 1 dia" : "Lembrar em 5 minutos"}
            >
              <Clock className="w-3 h-3" />
              {isManager ? "Fechar por 1 dia" : "Lembrar em 5 min"}
            </button>
            <button
              onClick={handleNavigate}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-[10px] font-black text-white uppercase tracking-wider shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition-all active:scale-95"
            >
              Ver Demandas
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
