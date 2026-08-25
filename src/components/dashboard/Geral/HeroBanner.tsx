import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/theme-provider";
import { Sparkles } from "@/components/ui/sparkles";
import { Bell } from "lucide-react";

interface DbNotifRow {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: { commenter_name?: string; commenter_avatar?: string; comunicado_id?: string | number } | null;
  created_at: string;
}

import { Check, MessageSquare, ThumbsUp, X, BellOff } from "lucide-react";

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [ringing, setRinging] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [notifs, setNotifs] = useState<DbNotifRow[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Pega o usuário logado
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const fetchCount = async (uid: string) => {
    const { count } = await supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("read", false);
    setUnreadCount(count ?? 0);
  };

  const fetchNotifs = async (uid: string) => {
    setLoadingNotifs(true);
    const { data } = await supabase
      .from("notificacoes")
      .select("id, type, title, message, read, data, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifs((data as DbNotifRow[]) || []);
    setLoadingNotifs(false);
  };

  useEffect(() => {
    if (!userId) return;
    fetchCount(userId);

    const channel = supabase
      .channel(`bell-notif-${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notificacoes",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setUnreadCount((prev) => prev + 1);
        setNotifs((prev) => [payload.new as DbNotifRow, ...prev].slice(0, 30));
        setRinging(true);
        setTimeout(() => setRinging(false), 1200);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notificacoes",
        filter: `user_id=eq.${userId}`,
      }, () => {
        fetchCount(userId);
        if (open) fetchNotifs(userId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, open]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById("notif-panel-floating");
      const bellBtn = document.getElementById("bell-trigger-btn");
      if (el && !el.contains(e.target as Node) && bellBtn && !bellBtn.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && userId) fetchNotifs(userId);
    setOpen((p) => !p);
  };

  const markAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    setUnreadCount(0);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notificacoes")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
  };

  const markSingleRead = async (notifId: number) => {
    setNotifs((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await supabase
      .from("notificacoes")
      .update({ read: true })
      .eq("id", notifId);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffDays = Math.floor(diffH / 24);
    if (diffDays === 1) return "ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  const displayedNotifs = activeTab === "unread" ? notifs.filter((n) => !n.read) : notifs;

  return (
    <>
      <button
        id="bell-trigger-btn"
        onClick={handleOpen}
        title="Notificações"
        className="relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 hover:bg-white/10 active:scale-95 group/bell focus:outline-none"
      >
        <motion.div
          animate={ringing ? { rotate: [0, -18, 18, -12, 12, -6, 6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        >
          <Bell
            className={`w-4.5 h-4.5 transition-colors duration-200 ${
              unreadCount > 0
                ? "text-blue-400"
                : "text-white/70 group-hover/bell:text-white"
            }`}
            strokeWidth={unreadCount > 0 ? 2.5 : 2}
          />
        </motion.div>

        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute top-0 right-0 min-w-[17px] h-[17px] px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-full shadow-sm leading-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Painel Flutuante Clean — Cobrindo o painel direito por inteiro */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              id="notif-panel-floating"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-4 bottom-4 right-6 w-[296px] h-[calc(100vh-2rem)] bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-slate-800/80 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-[999999] overflow-hidden flex flex-col pointer-events-auto"
            >
              {/* Header Clean */}
              <div className="p-4 pb-2.5 flex items-center justify-between border-b border-slate-800/40 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    Notificações
                  </span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      {unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-blue-400 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
                      title="Marcar todas como lidas"
                    >
                      <Check className="w-3 h-3 text-blue-400" />
                      Ler todas
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Abas Minimalistas */}
              <div className="flex items-center px-4 pt-2.5 gap-4 border-b border-slate-800/40 shrink-0">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`pb-2 text-[11px] font-bold transition-all relative ${
                    activeTab === "all" ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Todas ({notifs.length})
                  {activeTab === "all" && (
                    <motion.div
                      layoutId="activeCleanTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"
                    />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("unread")}
                  className={`pb-2 text-[11px] font-bold transition-all relative ${
                    activeTab === "unread" ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Não lidas ({unreadCount})
                  {activeTab === "unread" && (
                    <motion.div
                      layoutId="activeCleanTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"
                    />
                  )}
                </button>
              </div>

              {/* Lista de Notificações Super Clean — Ocupa toda a altura */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/30 scrollbar-thin scrollbar-thumb-slate-800">
                {loadingNotifs ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <div className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-[11px] font-medium text-slate-500">Carregando...</span>
                  </div>
                ) : displayedNotifs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
                    <BellOff className="w-6 h-6 text-slate-600 mb-1" />
                    <p className="text-xs font-bold text-slate-400">Nenhuma notificação</p>
                    <p className="text-[11px] text-slate-600 max-w-[200px]">
                      {activeTab === "unread" ? "Todas as notificações foram lidas." : "Sem atividades recentes."}
                    </p>
                  </div>
                ) : (
                  displayedNotifs.map((n) => {
                    const isLike = n.type === "like";
                    const comunicadoId = n.data?.comunicado_id;

                    const handleNotifClick = () => {
                      if (!n.read) markSingleRead(n.id);
                      if (comunicadoId) {
                        setOpen(false);
                        // Vai para a aba Geral
                        window.dispatchEvent(new CustomEvent("carflax-change-tab", { detail: "Geral" }));
                        // Pequeno delay para o tab renderizar antes de rolar
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("carflax-open-comunicado", {
                            detail: {
                              id: String(comunicadoId),
                              openComments: !isLike,
                            },
                          }));
                        }, 300);
                      }
                    };

                    return (
                      <div
                        key={n.id}
                        onClick={handleNotifClick}
                        className={`group relative flex items-start gap-3 p-3 transition-colors cursor-pointer ${
                          !n.read
                            ? "bg-blue-500/[0.04] hover:bg-blue-500/[0.08]"
                            : "hover:bg-slate-800/30 opacity-75 hover:opacity-100"
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0 mt-0.5">
                          <img
                            src={
                              n.data?.commenter_avatar ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${n.data?.commenter_name || "user"}`
                            }
                            className="w-8 h-8 rounded-full object-cover border border-slate-700/50 bg-slate-800"
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=user`;
                            }}
                          />
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border border-slate-900 text-white ${
                              isLike ? "bg-blue-600" : "bg-emerald-600"
                            }`}
                          >
                            {isLike ? (
                              <ThumbsUp className="w-2 h-2 fill-current" />
                            ) : (
                              <MessageSquare className="w-2 h-2 fill-current" />
                            )}
                          </div>
                        </div>

                        {/* Mensagem e Horário Clean */}
                        <div className="flex-1 min-w-0 pr-1">
                          <p className="text-[11px] text-slate-200 leading-snug font-normal">
                            <span className="font-bold text-white">
                              {n.data?.commenter_name || "Alguém"}
                            </span>{" "}
                            {isLike ? "curtiu seu comunicado" : "comentou no seu comunicado"}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5 italic">
                            {n.message.replace(/^.*?curtiu\s*|^.*?comentou em\s*/i, "").replace(/^"|"$/g, "")}
                          </p>
                          <span className="text-[9px] text-slate-500 font-semibold block mt-1">
                            {formatDate(n.created_at)}
                          </span>
                        </div>

                        {/* Ponto indicador de não lida */}
                        {!n.read && (
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)] shrink-0 mt-2" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}




export function HeroBanner({ loading }: { loading?: boolean }) {
  const { theme } = useTheme();
  
  if (loading) {
    return (
      <div className="relative rounded-2xl w-full bg-card border border-border h-[200px] sm:h-[280px] flex items-center justify-center animate-pulse">
        <div className="space-y-4 text-center">
          <div className="h-10 w-64 bg-secondary rounded-xl mx-auto" />
          <div className="h-4 w-96 bg-secondary/50 rounded-lg mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-3xl w-full bg-card border border-border h-[200px] sm:h-[280px] flex flex-col items-center justify-center group">
      {/* Camada decorativa com overflow-hidden para os Sparkles e Mesh, sem cortar o dropdown */}
      <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
        {/* Background/Ambient gradient & Mesh Grid */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
        <div 
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
          style={{ 
            backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px',
            color: 'var(--primary)'
          }} 
        />

        {/* Sparkles and Gfx Section */}
        <div className="absolute inset-0 w-full overflow-hidden [mask-image:radial-gradient(circle_at_center,white,transparent_90%)]">
          <div className="absolute inset-0 before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_bottom_center,var(--gradient-color),transparent_70%)] before:opacity-30" />
          <div className="absolute -left-1/2 bottom-[-10%] aspect-[1/0.6] z-10 w-[200%] rounded-[100%] border-t border-blue-500/20 bg-blue-500/5 dark:bg-blue-900/10 backdrop-blur-2xl" />
          
          <Sparkles
            density={600}
            className="absolute inset-0 h-full w-full [mask-image:radial-gradient(circle_at_center,white,transparent_80%)]"
            color={theme === "dark" ? "#ffffff" : "#2563eb"}
          />
        </div>
      </div>

      {/* Ícone de notificação — canto superior direito (livre de overflow-hidden) */}
      <div className="absolute top-4 right-4 z-40">
        <NotificationBell />
      </div>
      
      <div className="relative z-20 text-center space-y-4 px-6 mt-4 pointer-events-none">
        <div className="space-y-1">
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-foreground uppercase animate-in fade-in slide-in-from-bottom-4 duration-1000">
            Carflax <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">HUB</span>
          </h1>
          <p className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase tracking-[0.2em] max-w-xl mx-auto opacity-70">
            Sua produtividade em um só lugar. Tenha acesso ágil a indicadores diários.
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
    </div>
  );
}

