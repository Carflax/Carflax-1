import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getNotifPref } from "@/lib/notif-prefs";

const CHECK_INTERVAL_MS = 15 * 1000;
const SLA_LIMIT_MS = 60 * 1000;

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
  notification_prefs?: Record<string, Record<string, boolean>> | null;
}

/** Mesmo toggle do escalador do servidor: silenciar SLA silencia os dois. */
function slaAtivo(up?: UP | null): boolean {
  return getNotifPref(up, "alertas", "whatsappSla", true);
}

function isSupervisorTrafego(up?: UP | null): boolean {
  if (!up) return false;

  const normName = (up.name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  return normName.includes("JOAO PAULO") || normName.includes("GUILHERME");
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

  const notifiedJidsRef = useRef<Map<string, number>>(new Map());

  // Muda quando o usuário mexe nos toggles — entra na dep list do efeito para
  // ele parar (ou voltar) na hora, sem depender de recarregar a página.
  const prefsKey = JSON.stringify(userProfile?.notification_prefs ?? null);

  useEffect(() => {
    if (!isSupervisorTrafego(userProfile) || !slaAtivo(userProfile)) return;

    requestBrowserPermission();

    let cancelled = false;

    async function checkUnansweredLeads() {
      if (cancelled || !isSupervisorTrafego(userProfile) || !slaAtivo(userProfile)) return;

      try {
        const now = Date.now();
        const limitTime = new Date(now - SLA_LIMIT_MS).toISOString();
        const maxAge = new Date(now - 24 * 60 * 60 * 1000).toISOString();

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

          const lastNotified = notifiedJidsRef.current.get(remoteJid) || 0;
          if (now - lastNotified < 3 * 60 * 1000) continue;

          const nomeCliente = cliente.nome || cliente.push_name || remoteJid.split("@")[0];
          const tempoEsperaMin = Math.max(1, Math.round((now - new Date(cliente.ultima_conversa_em).getTime()) / 60000));

          notifiedJidsRef.current.set(remoteJid, now);

          playAlertSound();

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

    const timeout = setTimeout(checkUnansweredLeads, 5000);
    const interval = setInterval(checkUnansweredLeads, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
    // `notification_prefs` na dep list: sem ele o efeito não reavalia quando o
    // usuário mexe no toggle, e o intervalo antigo continuaria disparando.
  }, [userProfile, prefsKey]);
}
