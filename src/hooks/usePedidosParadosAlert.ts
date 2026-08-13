import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Alerta de pedidos de separação parados: quando um pedido de BALCÃO 2 ou ENTREGA
 * foi criado há mais de 2h e ainda não tem ninguém separando, dispara uma notificação
 * in-app (e do navegador). Reaparece a cada 10 min enquanto não for separado.
 *
 * Gated pelo toggle "Pedido parado" das Notificações (localStorage: carflax_notif_prefs
 * → alertas.stalePedidos). Só age se estiver habilitado (padrão: desligado).
 */

const API_SERVER = "https://marketing-banco-de-dados.velbav.easypanel.host";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const INITIAL_DELAY_MS = 30 * 1000;       // primeira checagem 30s após entrar
const STALE_MS = 2 * 60 * 60 * 1000;      // 2 horas
const LOCK_STALE_MS = 30 * 60 * 1000;     // lock abandonado após 30 min (= ninguém separando)

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
  operator_code?: string;
  operatorCode?: string;
  role?: string;
  is_admin?: boolean;
  is_leader?: boolean;
  notification_prefs?: Record<string, Record<string, boolean>>;
}

/** Lê o toggle das Notificações (padrão: desligado). */
function alertEnabled(up?: UP | null): boolean {
  try {
    const raw = localStorage.getItem("carflax_notif_prefs");
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.alertas && s.alertas.stalePedidos !== undefined) return !!s.alertas.stalePedidos;
    }
    if (up?.notification_prefs) {
      const prefs = up.notification_prefs;
      if (prefs?.alertas && prefs.alertas.stalePedidos !== undefined) return !!prefs.alertas.stalePedidos;
    }
    return false;
  } catch {
    return false;
  }
}

/** Retorna "BALCÃO 2" / "ENTREGA" se o pedido for de um desses tipos; senão null. */
function tipoAlvo(tipoMov?: string, localRet?: string): string | null {
  const m = (tipoMov || "").toUpperCase();
  const l = (localRet || "").toUpperCase();
  if (m === "R" && l === "B2") return "BALCÃO 2";
  if (m === "E") return "ENTREGA";
  return null;
}

function requestBrowserPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Promise.resolve(Notification.requestPermission()).catch(() => {});
    }
  } catch { /* ignore */ }
}

export function usePedidosParadosAlert(
  showNotification: ShowNotification,
  userProfile?: UP | null,
) {
  const showRef = useRef(showNotification);
  useEffect(() => { showRef.current = showNotification; }, [showNotification]);

  useEffect(() => {
    let cancelled = false;

    if (alertEnabled(userProfile)) requestBrowserPermission();

    async function check() {
      if (cancelled || !alertEnabled(userProfile)) return;
      try {
        const [erpRes, locksRes] = await Promise.all([
          fetch(`${API_SERVER}/api/pedidos-separacao`).then((r) => r.json()),
          supabase.from("coletor_separacao").select("pedido_id, operador_nome, locked_at"),
        ]);
        if (cancelled || !erpRes?.success || !Array.isArray(erpRes.data)) return;

        // Pedidos com alguém separando de verdade (lock não-abandonado)
        const activeLocks = new Set<string>();
        for (const l of locksRes.data || []) {
          const lockedTime = l.locked_at ? new Date(l.locked_at as string).getTime() : 0;
          const abandonado = Date.now() - lockedTime > LOCK_STALE_MS;
          if (!abandonado && l.operador_nome) activeLocks.add(String(l.pedido_id).trim());
        }

        // Visibilidade: admin/líder/gerente/diretor veem tudo; vendedor só os seus
        const role = (userProfile?.role || "").toUpperCase();
        const isAdmin =
          userProfile?.is_admin === true ||
          userProfile?.is_leader === true ||
          role.includes("GERENTE") ||
          role.includes("DIRETOR");
        const meuCodigo = String(userProfile?.operator_code || userProfile?.operatorCode || "").trim();
        const meuCodigoNorm = meuCodigo.replace(/^0+/, "") || meuCodigo;

        const now = Date.now();

        for (const order of erpRes.data as Record<string, unknown>[]) {
          const codVen = String(order.FGO_CODVEN || "").trim();
          const codVenNorm = codVen.replace(/^0+/, "") || codVen;
          if (!isAdmin && codVenNorm !== meuCodigoNorm && codVen !== meuCodigo) continue;

          const tipo = tipoAlvo(order.TIPO_MOVIMENTACAO as string, order.LOCAL_RETIRADA as string);
          if (!tipo) continue;

          const numDoc = String(order.FGO_NUMDOC).trim();
          const normalizedId = numDoc.padStart(12, "0");
          if (activeLocks.has(normalizedId) || activeLocks.has(numDoc)) continue; // alguém já separando

          const dataPart = String(order.FGO_DTAENT || "").substring(0, 10);
          const horaPart = String(order.FGO_HORENT || "00:00:00").substring(0, 8);
          const created = new Date(`${dataPart}T${horaPart}`).getTime();
          if (!created || isNaN(created)) continue;
          if (now - created < STALE_MS) continue;

          const pedidoDisplay = String(Number(numDoc) || numDoc);
          const hhmm = horaPart.substring(0, 5);
          const message = `Pedido #${pedidoDisplay} (${tipo}) criado às ${hhmm} ainda não foi separado.`;
          const tag = `stale-pedido-${normalizedId}`;

          // In-app: persistente (fica até fechar) e dedup por tag enquanto visível.
          // Se o usuário fechar, na próxima checagem (10 min) volta a aparecer.
          showRef.current("error", "ATENÇÃO", message, true, tag);

          // Notificação do navegador (Chrome). tag evita empilhar duplicadas.
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("⚠️ Pedido parado", { body: message, tag });
            }
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error("[PedidosParados] erro ao verificar:", err);
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
