import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Alerta de SLA de Tráfego / WhatsApp: quando um lead envia mensagem e fica
 * mais de 1 minuto sem resposta de um vendedor, notifica os supervisores de
 * tráfego/vendas (João Paulo, Guilherme, Administradores e Gerentes).
 */

const CHECK_INTERVAL_MS = 15 * 1000; // Checa a cada 15 segundos
const SLA_LIMIT_MS = 60 * 1000;      // 1 minuto sem resposta

type ShowNotification = (
  type: "success" | "error" | "info",
  title: string,
  message: string,
  persistent?: boolean,
  tag?: string,
  duration?: number,
  avatarUrl?: string,
  action?: { label: string; onClick: () => void | Promise<void> }
) => void;

interface UP {
  id?: string;
  name?: string;
  role?: string;
  is_admin?: boolean;
  is_leader?: boolean;
  operator_code?: string;
  operatorCode?: string;
}

/**
 * Verifica se o usuário atual é supervisor de tráfego/vendas (João Paulo, Guilherme, Gerentes, Admins)
 */
function isSupervisorTrafego(up?: UP | null): boolean {
  if (!up) return false;
  if (up.is_admin || up.is_leader) return true;

  const role = (up.role || "").toUpperCase();
  if (role.includes("SUPERVISOR") || role.includes("GERENTE") || role.includes("DIRETOR") || role.includes("ADMIN")) {
    return true;
  }

  const normName = (up.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  // João Paulo / Guilherme
  if (normName.includes("JOAO") || normName.includes("GUILHERME")) {
    return true;
  }

  return false;
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

function playAlertSound() {
  try {
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function useTrafegoSemRespostaAlert(
  showNotification: ShowNotification,
  userProfile?: UP | null
) {
  const showRef = useRef(showNotification);
  useEffect(() => {
    showRef.current = showNotification;
  }, [showNotification]);

  // Guarda os JIDs já alertados recentemente para não repetir o alerta a cada 15s
  const notifiedJidsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isSupervisorTrafego(userProfile)) return;

    requestBrowserPermission();

    let cancelled = false;

    async function checkUnansweredLeads() {
      if (cancelled || !isSupervisorTrafego(userProfile)) return;

      try {
        const now = Date.now();
        const limitTime = new Date(now - SLA_LIMIT_MS).toISOString();
        const maxAge = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // últimas 24h

        // Busca clientes com mensagens não lidas ou cuja última conversa ocorreu há > 1 min
        const { data: clientes, error } = await supabase
          .from("marketing_clientes")
          .select("remote_jid, nome, push_name, ultima_mensagem, ultima_conversa_em, mensagens_nao_lidas, arquivado, status, foto_url")
          .eq("arquivado", false)
          .gt("mensagens_nao_lidas", 0)
          .lt("ultima_conversa_em", limitTime)
          .gt("ultima_conversa_em", maxAge)
          .order("ultima_conversa_em", { ascending: true })
          .limit(10);

        if (error || !clientes || clientes.length === 0) return;

        for (const cliente of clientes) {
          const remoteJid = cliente.remote_jid;
          if (!remoteJid) continue;

          // Se já alertou nos últimos 3 minutos, pula para evitar flood
          const lastNotified = notifiedJidsRef.current.get(remoteJid) || 0;
          if (now - lastNotified < 3 * 60 * 1000) continue;

          const nomeCliente = cliente.nome || cliente.push_name || remoteJid.split("@")[0];
          const tempoEsperaMin = Math.max(1, Math.round((now - new Date(cliente.ultima_conversa_em).getTime()) / 60000));

          notifiedJidsRef.current.set(remoteJid, now);

          // 1. Som de alerta
          playAlertSound();

          // 2. Notificação no App
          showRef.current(
            "error",
            "⚠️ Conversa sem resposta (> 1 min)",
            `O cliente ${nomeCliente} está aguardando resposta há ${tempoEsperaMin} min no WhatsApp!`,
            true,
            `sla-trafego-${remoteJid}`,
            8000,
            cliente.foto_url || undefined,
            {
              label: "Abrir WhatsApp",
              onClick: () => {
                localStorage.setItem("carflax-active-section", "WhatsApp");
                window.dispatchEvent(new CustomEvent("carflax-navigate-tab", { detail: "WhatsApp" }));
              },
            }
          );

          // 3. Notificação nativa / Push no Google Chrome (mesmo com navegador minimizado ou em outra aba)
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistration().then((reg) => {
                  if (reg && reg.showNotification) {
                    reg.showNotification(`⚠️ Tráfego: ${nomeCliente} sem resposta`, {
                      body: `Aguardando há ${tempoEsperaMin} min: "${cliente.ultima_mensagem || "Nova mensagem"}"`,
                      icon: cliente.foto_url || "/favicon.png",
                      badge: "/favicon.png",
                      tag: `sla-trafego-${remoteJid}`,
                      requireInteraction: true,
                    });
                    return;
                  }
                  // Fallback padrão se não houver registration ativa
                  const notif = new Notification(`⚠️ Tráfego: ${nomeCliente} sem resposta`, {
                    body: `Aguardando há ${tempoEsperaMin} min: "${cliente.ultima_mensagem || "Nova mensagem"}"`,
                    icon: cliente.foto_url || "/favicon.png",
                    badge: "/favicon.png",
                    tag: `sla-trafego-${remoteJid}`,
                    requireInteraction: true,
                  });
                  notif.onclick = () => {
                    window.focus();
                    localStorage.setItem("carflax-active-section", "WhatsApp");
                    window.dispatchEvent(new CustomEvent("carflax-navigate-tab", { detail: "WhatsApp" }));
                  };
                }).catch(() => {
                  const notif = new Notification(`⚠️ Tráfego: ${nomeCliente} sem resposta`, {
                    body: `Aguardando há ${tempoEsperaMin} min: "${cliente.ultima_mensagem || "Nova mensagem"}"`,
                    icon: cliente.foto_url || "/favicon.png",
                    badge: "/favicon.png",
                    tag: `sla-trafego-${remoteJid}`,
                    requireInteraction: true,
                  });
                  notif.onclick = () => {
                    window.focus();
                    localStorage.setItem("carflax-active-section", "WhatsApp");
                    window.dispatchEvent(new CustomEvent("carflax-navigate-tab", { detail: "WhatsApp" }));
                  };
                });
              } else {
                const notif = new Notification(`⚠️ Tráfego: ${nomeCliente} sem resposta`, {
                  body: `Aguardando há ${tempoEsperaMin} min: "${cliente.ultima_mensagem || "Nova mensagem"}"`,
                  icon: cliente.foto_url || "/favicon.png",
                  badge: "/favicon.png",
                  tag: `sla-trafego-${remoteJid}`,
                  requireInteraction: true,
                });
                notif.onclick = () => {
                  window.focus();
                  localStorage.setItem("carflax-active-section", "WhatsApp");
                  window.dispatchEvent(new CustomEvent("carflax-navigate-tab", { detail: "WhatsApp" }));
                };
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        console.error("[SLA TRAFEGO] Erro ao verificar conversas sem resposta:", err);
      }
    }

    // Primeira checagem 5 segundos após montar
    const timeout = setTimeout(checkUnansweredLeads, 5000);
    const interval = setInterval(checkUnansweredLeads, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [userProfile]);
}
