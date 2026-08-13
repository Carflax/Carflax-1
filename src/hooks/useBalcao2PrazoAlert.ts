import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { isBalcao2, parseOrderCreated, b2RemainingMs, B2_AVISO_MS, formatB2Remaining } from "@/lib/balcao2-prazo";

/**
 * Alerta de prazo dos pedidos de BALCÃO 2: cada pedido B2 tem 72h para retirada.
 * Notifica em dois momentos:
 *  - AVISO (48h): quando faltar 1 dia (24h) ou menos e o prazo ainda não estourou; e
 *  - VENCIDO (72h): quando o prazo de 72h estourar → além da notificação, o gerente
 *    de estoque envia automaticamente uma mensagem no chat para o vendedor avisando
 *    que o pedido poderá ser cancelado se não for retirado em 24h.
 * Destinatários (ambos os eventos):
 *  - o VENDEDOR do pedido (quando é o usuário logado); e
 *  - o GERENTE DE ESTOQUE.
 *
 * Gated pelo toggle "Prazo Balcão 2" (localStorage: carflax_notif_prefs → alertas.balcao2Prazo,
 * padrão: ligado). Dispara uma vez por pedido para cada evento (dedup em localStorage).
 */

const API_SERVER = "https://marketing-banco-de-dados.velbav.easypanel.host";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const INITIAL_DELAY_MS = 20 * 1000; // primeira checagem 20s após entrar
const AVISADOS_KEY = "carflax_b2_avisados";
const AVISADO_TTL_MS = 5 * 24 * 60 * 60 * 1000; // limpa avisos com mais de 5 dias

type ShowNotification = (
  type: "success" | "error" | "info",
  title: string,
  message: string,
  persistent?: boolean,
  tag?: string,
  duration?: number,
  avatarUrl?: string,
) => void;

interface UP {
  id?: string;
  name?: string;
  avatar?: string;
  operator_code?: string;
  operatorCode?: string;
  role?: string;
  notification_prefs?: Record<string, Record<string, boolean>>;
}

/** Master toggle do alerta de prazo B2 (padrão: ligado). */
function masterEnabled(up?: UP | null): boolean {
  try {
    const raw = localStorage.getItem("carflax_notif_prefs");
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.alertas && s.alertas.balcao2Prazo !== undefined) return !!s.alertas.balcao2Prazo;
    }
    if (up?.notification_prefs) {
      const prefs = up.notification_prefs;
      if (prefs?.alertas && prefs.alertas.balcao2Prazo !== undefined) return !!prefs.alertas.balcao2Prazo;
    }
    return true;
  } catch {
    return true;
  }
}

/** True quando o cargo do usuário é Gerente de Estoque. */
function isGerenteEstoque(role?: string): boolean {
  const r = (role || "").toUpperCase();
  return r.includes("GERENTE") && r.includes("ESTOQUE");
}

function loadAvisados(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AVISADOS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    // Limpa entradas antigas.
    let changed = false;
    for (const k of Object.keys(obj)) {
      if (now - obj[k] > AVISADO_TTL_MS) {
        delete obj[k];
        changed = true;
      }
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
  } catch {
    /* ignore */
  }
}

const MSG_ENVIADAS_KEY = "carflax_b2_msg_enviadas";

function loadMsgEnviadas(): Record<string, number> {
  try {
    const raw = localStorage.getItem(MSG_ENVIADAS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    let changed = false;
    for (const k of Object.keys(obj)) {
      if (now - obj[k] > AVISADO_TTL_MS) {
        delete obj[k];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(MSG_ENVIADAS_KEY, JSON.stringify(obj));
    return obj;
  } catch {
    return {};
  }
}

function marcarMsgEnviada(id: string) {
  try {
    const obj = loadMsgEnviadas();
    obj[id] = Date.now();
    localStorage.setItem(MSG_ENVIADAS_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

async function enviarMensagemAutomatica(
  gerenteId: string,
  gerenteNome: string,
  gerenteAvatar: string | undefined,
  codVen: string,
  numDoc: string,
  empresa: string,
  cliente: string,
) {
  try {
    const normalized = codVen.replace(/^0+/, "") || codVen;
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, operator_code")
      .not("operator_code", "is", null);

    const vendedor = (usuarios || []).find((u) => {
      const code = String(u.operator_code || "").trim().replace(/^0+/, "");
      return code === normalized || String(u.operator_code || "").trim() === codVen;
    });

    if (!vendedor) return;

    const pedidoDisplay = String(Number(numDoc) || numDoc);
    const msg = `⚠️ *Aviso Automático — Prazo de Retirada*\n\nO pedido #${pedidoDisplay} (Balcão 2)${cliente ? ` do cliente *${cliente}*` : ""} ultrapassou 72h sem retirada.\n\nSe o cliente não retirar em até 24h, o pedido será *cancelado* e devolvido ao estoque.\n\nPor favor, entre em contato com o cliente urgentemente.`;

    const { error } = await supabase.from("crm_conversas").insert({
      documento: numDoc.padStart(12, "0"),
      empresa: empresa || "001",
      obs: msg,
      enviado_por: gerenteId,
      enviado_por_nome: gerenteNome,
      enviado_por_foto: gerenteAvatar || null,
      destino: vendedor.id,
      timestamp: new Date().toISOString(),
    });

    if (error) console.error("[Balcao2Prazo] erro ao enviar msg automática:", error);
  } catch (err) {
    console.error("[Balcao2Prazo] erro ao enviar msg automática:", err);
  }
}

function requestBrowserPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Promise.resolve(Notification.requestPermission()).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export function useBalcao2PrazoAlert(showNotification: ShowNotification, userProfile?: UP | null) {
  const showRef = useRef(showNotification);
  useEffect(() => { showRef.current = showNotification; }, [showNotification]);

  useEffect(() => {
    let cancelled = false;

    if (masterEnabled(userProfile)) requestBrowserPermission();

    async function check() {
      if (cancelled || !masterEnabled(userProfile)) return;
      try {
        const erpRes = await fetch(`${API_SERVER}/api/pedidos-separacao`).then((r) => r.json());
        if (cancelled || !erpRes?.success || !Array.isArray(erpRes.data)) return;

        const meuCodigo = String(userProfile?.operator_code || userProfile?.operatorCode || "").trim();
        const meuCodigoNorm = meuCodigo.replace(/^0+/, "") || meuCodigo;
        const souGerenteEstoque = isGerenteEstoque(userProfile?.role);

        const now = Date.now();
        const avisados = loadAvisados();

        for (const order of erpRes.data as Record<string, unknown>[]) {
          if (!isBalcao2(order.TIPO_MOVIMENTACAO as string, order.LOCAL_RETIRADA as string)) continue;

          const created = parseOrderCreated(order.FGO_DTAENT as string, order.FGO_HORENT as string);
          if (created == null) continue;

          const remaining = b2RemainingMs(created, now);
          // Dois eventos: AVISO (falta <=1 dia e ainda no prazo) e VENCIDO (prazo estourou).
          let evento: "aviso" | "vencido" | null = null;
          if (remaining > 0 && remaining <= B2_AVISO_MS) evento = "aviso";
          else if (remaining <= 0) evento = "vencido";
          if (!evento) continue;

          // Destinatários: o vendedor do pedido ou o gerente de estoque.
          const codVen = String(order.FGO_CODVEN || "").trim();
          const codVenNorm = codVen.replace(/^0+/, "") || codVen;
          const souVendedor = !!meuCodigoNorm && (codVenNorm === meuCodigoNorm || codVen === meuCodigo);
          if (!souVendedor && !souGerenteEstoque) continue;

          const numDoc = String(order.FGO_NUMDOC).trim();
          const normalizedId = numDoc.padStart(12, "0");
          const dedupId = `${normalizedId}-${evento}`;
          if (avisados[dedupId]) continue; // já avisado neste evento

          const pedidoDisplay = String(Number(numDoc) || numDoc);
          const cliente = String(order.NOME_CLIENTE || "").trim();
          const tag = `b2-prazo-${dedupId}`;

          let title: string;
          let message: string;
          if (evento === "aviso") {
            title = "⏰ PRAZO BALCÃO 2";
            message = `Pedido #${pedidoDisplay} (Balcão 2)${cliente ? ` — ${cliente}` : ""} vence em ${formatB2Remaining(remaining)}. Falta menos de 1 dia para a retirada.`;
          } else {
            title = "⛔ BALCÃO 2 VENCIDO";
            message = `Pedido #${pedidoDisplay} (Balcão 2)${cliente ? ` — ${cliente}` : ""} venceu o prazo de 72h de retirada (${formatB2Remaining(remaining)}). Se o cliente não vier retirar em 24h, o pedido será devolvido ao estoque e cancelado.`;
          }

          showRef.current("error", title, message, true, tag);
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(title, { body: message, tag });
            }
          } catch {
            /* ignore */
          }

          marcarAvisado(dedupId);

          if (evento === "vencido" && souGerenteEstoque && userProfile?.id) {
            const msgDedupId = `msg-${normalizedId}`;
            const msgEnviadas = loadMsgEnviadas();
            if (!msgEnviadas[msgDedupId]) {
              marcarMsgEnviada(msgDedupId);
              enviarMensagemAutomatica(
                userProfile.id,
                userProfile.name || "Gerente de Estoque",
                userProfile.avatar,
                codVen,
                numDoc,
                String((order as Record<string, unknown>).EMPRESA || "001"),
                cliente,
              );
            }
          }
        }
      } catch (err) {
        console.error("[Balcao2Prazo] erro ao verificar:", err);
      }
    }

    const timeout = setTimeout(check, INITIAL_DELAY_MS);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [userProfile]);
}
