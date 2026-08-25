import { useEffect, useRef } from "react";
import { getNotifPref } from "@/lib/notif-prefs";

/**
 * Alerta de VENDA GRANDE para o time de Compras: quando sai uma venda de um item
 * muito acima do normal daquele item (>= fator × a média histórica), sobe uma
 * notificação para avaliar recompra — especialmente se o estoque já está baixo.
 *
 * Destinatários: pessoas de COMPRAS (department/role) + admin/gerente/diretor.
 * Gated pelo toggle "Venda grande (Compras)" (usuarios.notification_prefs →
 * alertas.vendaGrande, padrão: ligado). Dispara uma vez por (documento+item).
 */

// /api-marketing → marketing-carflax (proxy no dev, rewrite no Vercel), mesmo host do api.ts.
const API_SERVER = "/api-marketing";
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const INITIAL_DELAY_MS = 25 * 1000;
const AVISADOS_KEY = "carflax_venda_grande_avisados";
const AVISADO_TTL_MS = 7 * 24 * 60 * 60 * 1000; // limpa após 7 dias
const JANELA_DIAS = 2; // vendas dos últimos 2 dias
const FATOR = 5;
const PISO = 10;
const STAGGER_MS = 8 * 1000; // espaço entre notificações para não chegarem todas juntas
const MAX_POR_CICLO = 4; // no máx. N alertas por verificação; o resto fica p/ o próximo ciclo

type ShowNotification = (
  type: "success" | "error" | "info",
  title: string,
  message: string,
  persistent?: boolean,
  tag?: string,
) => void;

interface UP {
  role?: string;
  department?: string;
  is_admin?: boolean;
  is_leader?: boolean;
  notification_prefs?: Record<string, Record<string, boolean>> | null;
}

interface VendaGrande {
  documento: string;
  cod_item: string;
  item: string;
  qtd: number;
  ratio: number;
  estoque_atual: number | null;
}

/** Só notifica quem é de Compras (ou gestão). */
function isPublicoCompras(up?: UP | null): boolean {
  if (!up) return false;
  const role = (up.role || "").toUpperCase();
  const dept = (up.department || "").toUpperCase();
  return (
    dept === "COMPRAS" ||
    role.includes("COMPRAS") ||
    up.is_admin === true ||
    role.includes("GERENTE") ||
    role.includes("DIRETOR")
  );
}

function masterEnabled(up?: UP | null): boolean {
  return getNotifPref(up, "alertas", "vendaGrande", true);
}

function loadAvisados(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AVISADOS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    let changed = false;
    for (const k of Object.keys(obj)) {
      if (now - obj[k] > AVISADO_TTL_MS) { delete obj[k]; changed = true; }
    }
    if (changed) localStorage.setItem(AVISADOS_KEY, JSON.stringify(obj));
    return obj;
  } catch {
    return {};
  }
}

function marcarAvisado(id: string) {
  try {
    const obj = loadAvisados();
    obj[id] = Date.now();
    localStorage.setItem(AVISADOS_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

function requestBrowserPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Promise.resolve(Notification.requestPermission()).catch(() => {});
    }
  } catch { /* ignore */ }
}

export function useVendaGrandeAlert(showNotification: ShowNotification, userProfile?: UP | null) {
  const showRef = useRef(showNotification);
  useEffect(() => { showRef.current = showNotification; }, [showNotification]);

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    if (!isPublicoCompras(userProfile) || !masterEnabled(userProfile)) return;
    requestBrowserPermission();

    async function check() {
      if (cancelled || !masterEnabled(userProfile) || !isPublicoCompras(userProfile)) return;
      try {
        const url = `${API_SERVER}/api/compras/vendas-grandes?dias=${JANELA_DIAS}&fator=${FATOR}&piso=${PISO}`;
        const res = await fetch(url).then((r) => r.json());
        if (cancelled || !res?.success || !Array.isArray(res.data)) return;

        const avisados = loadAvisados();
        const dismissedRaw = localStorage.getItem("carflax-dismissed-notifs-v2");
        const dismissedTags: string[] = dismissedRaw ? (JSON.parse(dismissedRaw)?.ids || []) : [];

        // Junta apenas os novos e limita quantos saem por ciclo; o restante
        // fica para a próxima verificação, evitando uma enxurrada de uma vez.
        const novos = (res.data as VendaGrande[]).filter((v) => {
          const id = `${String(v.documento).trim()}-${String(v.cod_item).trim()}`;
          const tag = `venda-grande-${id}`;
          return !avisados[id] && !dismissedTags.includes(tag);
        }).slice(0, MAX_POR_CICLO);

        novos.forEach((v, idx) => {
          const id = `${String(v.documento).trim()}-${String(v.cod_item).trim()}`;
          // Marca já como avisado para o próximo ciclo não reprocessar enquanto o stagger corre.
          marcarAvisado(id);

          const dispatch = () => {
            if (cancelled || !masterEnabled(userProfile) || !isPublicoCompras(userProfile)) return;
            const pedido = String(v.documento || "").replace(/^0+/, "") || v.documento;
            const estoqueTxt = v.estoque_atual == null
              ? ""
              : v.estoque_atual <= 0
                ? ` Estoque ZERADO (${v.estoque_atual}).`
                : ` Estoque atual: ${v.estoque_atual}.`;
            const message = `${v.qtd} un de ${v.item} (Pedido ${pedido}) — ${v.ratio}× a média do item.${estoqueTxt} Avaliar recompra.`;
            const tag = `venda-grande-${id}`;

            showRef.current("error", "🛒 VENDA GRANDE — COMPRAS", message, false, tag);
            try {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification("🛒 Venda grande (Compras)", { body: message, tag });
              }
            } catch { /* ignore */ }
          };

          if (idx === 0) {
            dispatch();
          } else {
            const t = setTimeout(dispatch, idx * STAGGER_MS);
            timers.add(t);
          }
        });
      } catch (err) {
        console.error("[VendaGrande] erro ao verificar:", err);
      }
    }

    const timeout = setTimeout(check, INITIAL_DELAY_MS);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [userProfile]);
}
