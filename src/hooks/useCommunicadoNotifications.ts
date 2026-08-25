import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/hooks/useNotification";

interface DbNotificacao {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

interface UserProfile {
  id?: string;
  name: string;
  avatar?: string;
}

/**
 * Escuta em tempo real a tabela `notificacoes` via Supabase Realtime.
 * Quando chega um INSERT para o usuário logado, exibe um toast via showNotification.
 * Depois marca a notificação como lida automaticamente.
 */
export function useCommunicadoNotifications(userProfile?: UserProfile | null) {
  const { showNotification } = useNotification();
  const showRef = useRef(showNotification);
  useEffect(() => { showRef.current = showNotification; }, [showNotification]);

  useEffect(() => {
    const userId = userProfile?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`notificacoes-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const notif = payload.new as DbNotificacao;
          if (!notif) return;

          const avatarUrl =
            (notif.data?.commenter_avatar as string | undefined) ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${notif.data?.commenter_name || "user"}`;

          showRef.current(
            notif.type === "like" ? "success" : "info",
            notif.title,
            notif.message,
            false,
            undefined,
            6000,
            avatarUrl,
          );
        },
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.id]);
}
