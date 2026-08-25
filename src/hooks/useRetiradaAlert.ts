import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getNotifPref, type NotifProfile } from "@/lib/notif-prefs";

let audioCtx: AudioContext | null = null;
let beepInterval: ReturnType<typeof setInterval> | null = null;

export function startAlertSound() {
  stopAlertSound();
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
    
    if (!audioCtx) return;

    const playBeep = () => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz (A5)
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    };

    playBeep();
    beepInterval = setInterval(playBeep, 800);
  } catch (err) {
    console.error("Erro ao tocar som de alerta:", err);
  }
}

export function stopAlertSound() {
  if (beepInterval) {
    clearInterval(beepInterval);
    beepInterval = null;
  }
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch { /* ignore */ }
    audioCtx = null;
  }
}

function alertEnabled(up?: NotifProfile | null): boolean {
  return getNotifPref(up, "alertas", "clienteRetira", true); // habilitado por padrão
}

export function useRetiradaAlert(
  onAlert: (cliente: string, pedido: string) => void,
  userProfile?: NotifProfile | null,
) {
  const onAlertRef = useRef(onAlert);
  
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  // `notification_prefs` na dep list: se o perfil chegar depois (ou o usuário
  // mudar o toggle), o canal é reinscrito com a preferência atualizada.
  const prefsKey = JSON.stringify(userProfile?.notification_prefs ?? null);

  useEffect(() => {
    if (!alertEnabled(userProfile)) return;

    const channel = supabase
      .channel("realtime-retiradas-alerts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "retiradas",
        },
        (payload) => {
          if (!alertEnabled(userProfile)) return;
          const newRow = payload.new as Record<string, unknown> | null;
          if (newRow && newRow.status === "retirando") {
            onAlertRef.current(
              typeof newRow.cliente === "string" ? newRow.cliente : "Cliente",
              typeof newRow.pedido === "string" ? newRow.pedido : ""
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey]);
}
