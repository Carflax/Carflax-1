import { useState, useEffect, useCallback, useRef } from "react";
import { type Session } from "@supabase/supabase-js";
import { NotificationProvider } from "@/components/ui/NotificationProvider";
import { ThemeProvider } from "@/context/theme-provider";
import { AppSidebar } from "@/components/ui/AppSidebar";
import { ChatCenter } from "@/components/ui/ChatCenter";
import { supabase } from "@/lib/supabase";
import { CommunicationSection } from "@/components/dashboard/Geral/CommunicationSection";
import { CalendarSection } from "@/components/calendar";
import { SettingsSection } from "@/components/settings";
import { CrmSection } from "@/components/crm";
import {
  SalesMetricsCard,
  BirthdayList,
  UpcomingEventsCard,
  EmployeeOfMonthCard,
} from "@/components/dashboard/Geral/RightPanelComponents";
import { type VendedorResumo, type CrmItem, apiGerarComunicadoRecebimentos } from "@/lib/api";
import { marcarEntregue, type CrmConversa } from "@/lib/crm-service";
import { GeralView } from "@/components/dashboard/Geral/GeralView";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { SugestaoModal } from "@/components/sugestao";
import { OrcamentoIAModal } from "@/components/ui/OrcamentoIAModal";
import { SugestoesAdminView } from "@/components/admin/SugestoesAdminView";
import { ScrumView } from "@/components/scrum/ScrumView";
import { PwaInstallPrompt } from "@/components/ui/PwaInstallPrompt";
import { ColetorView } from "@/components/coletor/ColetorView";
import { SeparacaoView, ConferenciaView } from "@/components/estoque/ExpedicaoView";
import { RetiradaView } from "@/components/estoque/RetiradaView";
import { FurosView } from "@/components/estoque/FurosView";
import { ComprasView } from "@/components/compras/ComprasView";
import { RelatoriosComprasView } from "@/components/compras/RelatoriosComprasView";
import { RelatoriosEstoqueView } from "@/components/estoque/RelatoriosEstoqueView";
import { RelatoriosScrumView } from "@/components/scrum/RelatoriosScrumView";
import { EntregasView } from "@/components/entregas";
import { MotoristaView } from "@/components/entregas/motorista/MotoristaView";
import { UsersView } from "@/components/users/UsersView";
import { LoginView } from "@/components/auth/LoginView";
import { AvaliarPublicView } from "@/components/avaliacao/AvaliarPublicView";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { OrgChartView } from "@/components/ui/OrgChartModal";
import { SqlRunnerView } from "@/components/admin/SqlRunnerView";
import { MarketingView } from "@/components/marketing/MarketingView";
import { EsteiraView } from "@/components/marketing/EsteiraView";
import { RhView } from "@/components/rh/RhView";
import { ESTEIRA_SUBQUADRO_PREFIX, canAccessSection } from "@/lib/menu-config";
import { useNotification } from "@/hooks/useNotification";
import { runAnnouncementAutomation } from "@/lib/announcement-automation";
import { usePedidosParadosAlert } from "@/hooks/usePedidosParadosAlert";
import { useBalcao2PrazoAlert } from "@/hooks/useBalcao2PrazoAlert";
import { useVendaGrandeAlert } from "@/hooks/useVendaGrandeAlert";
import { useRetiradaAlert, startAlertSound, stopAlertSound } from "@/hooks/useRetiradaAlert";
import { BellRing } from "lucide-react";
import { SorteioRealtimeModal } from "@/components/ui/SorteioRealtimeModal";
import { RankingCopaView } from "@/components/crm/campanhas/RankingCopaView";
import { PrivacyPolicyView } from "@/components/public/PrivacyPolicyView";
import { TermsOfServiceView } from "@/components/public/TermsOfServiceView";
import { FollowUpReminder } from "@/components/ui/FollowUpReminder";
import { ConviteFornecedorPublicView } from "@/components/public/ConviteFornecedorPublicView";


export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  department?: string;
  operator_code?: string;
  operatorCode?: string;
  permissions?: string[];
  is_admin?: boolean;
  phone?: string;
  whatsapp?: string;
  ramal?: string;
  responsavel_id?: string;
  is_leader?: boolean;
}

interface DashboardContentProps {
  userProfile: UserProfile | null;
  vendedorMetrics: VendedorResumo | null;
  storeData: VendedorResumo | null;
  perdidoMap: Map<string, number>;
  geralLoading: boolean;
  onLogout: () => void;
}

function DashboardContent({
  userProfile,
  vendedorMetrics,
  storeData,
  perdidoMap,
  geralLoading,
  onLogout,
}: DashboardContentProps) {
  const { showNotification } = useNotification();
  usePedidosParadosAlert(showNotification, userProfile);
  useBalcao2PrazoAlert(showNotification, userProfile);
  useVendaGrandeAlert(showNotification, userProfile);

  const [activeRetiradaAlert, setActiveRetiradaAlert] = useState<{ cliente: string; pedido: string } | null>(null);

  useRetiradaAlert((cliente, pedido) => {
    setActiveRetiradaAlert({ cliente, pedido });
    startAlertSound();
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isVendedor, setIsVendedor] = useState(false); // Mock role
  const [activeItem, setActiveItem] = useState(() => {
    return localStorage.getItem("carflax-active-section") || "Geral";
  });
  const [isSugestaoModalOpen, setIsSugestaoModalOpen] = useState(false);
  const [isOrcamentoIAOpen, setIsOrcamentoIAOpen] = useState(false);
  const [activeSorteio, setActiveSorteio] = useState<{
    mes: number;
    ano: number;
    elegiveis: {
      COD_VENDEDOR: string;
      NOME_VENDEDOR: string;
      avatar?: string | null;
      PERC_META_BATIDA?: string | number;
    }[];
    ganhador: {
      COD_VENDEDOR: string;
      NOME_VENDEDOR: string;
      avatar?: string | null;
      PERC_META_BATIDA?: string | number;
    };
    premio: {
      nome: string;
      descricao?: string | null;
      valor?: number | null;
      imagem?: string | null;
    } | null;
  } | null>(null);

  // Ctrl+O → Orçamento IA
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setIsOrcamentoIAOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Listener para troca de abas via eventos customizados
  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setActiveItem(customEvent.detail);
        localStorage.setItem("carflax-active-section", customEvent.detail);
      }
    };
    window.addEventListener("carflax-change-tab", handleTabChange);
    return () => window.removeEventListener("carflax-change-tab", handleTabChange);
  }, []);

  // Defesa em profundidade: se o localStorage restaurar uma seção que o usuário
  // não pode mais acessar (ex: permissão revogada), volta para Geral silenciosamente
  // no carregamento. A navegação por clique é barrada em handleActiveItemChange, que
  // mostra uma notificação e não troca de tela — então isso só dispara em casos raros.
  useEffect(() => {
    if (!userProfile || geralLoading) return; // Aguarda o perfil carregar
    if (activeItem === "Geral") return;
    if (!canAccessSection(userProfile, activeItem)) {
      setActiveItem("Geral");
      localStorage.setItem("carflax-active-section", "Geral");
    }
  }, [activeItem, userProfile, geralLoading]);

  // ── Sincronização Global do Chat (Realtime) ───────────────────────────
  // Chat Multijanelas
  interface ActiveChat {
    id: number;
    doc: string;
    title: string;
    sellerName?: string;
    sellerCode?: string;
    items?: CrmItem[];
    unreadCount?: number;
    lastMessage?: string;
    lastMessageTime?: string;
  }
  const [activeChats, setActiveChats] = useState<ActiveChat[]>(() => {
    try {
      const saved = localStorage.getItem("carflax-active-chats");
      const savedDismissed = localStorage.getItem("carflax-dismissed-chats");
      const dismissedSet: Set<string> = savedDismissed ? new Set(JSON.parse(savedDismissed)) : new Set();
      const all: ActiveChat[] = saved ? JSON.parse(saved) : [];
      // Filtra documentos que foram dispensados para não reaparecer ao recarregar
      return all.filter((c) => !dismissedSet.has(c.doc));
    } catch {
      return [];
    }
  });

  const [dismissedChatDocs, setDismissedChatDocs] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("carflax-dismissed-chats");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const dismissedChatDocsRef = useRef(dismissedChatDocs);
  useEffect(() => {
    dismissedChatDocsRef.current = dismissedChatDocs;
    localStorage.setItem("carflax-dismissed-chats", JSON.stringify([...dismissedChatDocs]));
  }, [dismissedChatDocs]);

  const [openChatDocs, setOpenChatDocs] = useState<string[]>([]);

  const openChatDocsRef = useRef<string[]>(openChatDocs);
  useEffect(() => {
    openChatDocsRef.current = openChatDocs;
  }, [openChatDocs]);

  // Ids dos líderes (supervisores/gerentes/diretores). Usado para abrir o chat do
  // destinatário em tempo real quando um líder envia uma mensagem, mesmo que ele
  // não seja o responsável_id exato daquele vendedor.
  const leaderIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("usuarios")
        .select("id")
        .eq("is_leader", true);
      if (!cancelled && data) {
        leaderIdsRef.current = new Set(data.map((u) => String(u.id)));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggleChatDoc = useCallback((doc: string) => {
    setOpenChatDocs((prev) => {
      if (prev.includes(doc)) return prev.filter((d) => d !== doc);
      const next = [...prev, doc];
      if (next.length > 3) next.shift();
      return next;
    });
    setActiveChats((prev) =>
      prev.map((c) => (c.doc === doc ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  const handleCloseChatDoc = useCallback((doc: string) => {
    setOpenChatDocs((prev) => prev.filter((d) => d !== doc));
  }, []);

  // Abre um chat de forma idempotente (nunca fecha). Usar nos disparos automáticos
  // (mensagem recebida, chat forçado, clique em notificação): se dois disparos
  // acontecerem para o mesmo doc, o handleToggleChatDoc os cancelaria (abre+fecha).
  const openChatDoc = useCallback((doc: string) => {
    setOpenChatDocs((prev) => {
      if (prev.includes(doc)) return prev;
      const next = [...prev, doc];
      if (next.length > 3) next.shift();
      return next;
    });
    setActiveChats((prev) =>
      prev.map((c) => (c.doc === doc ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  // Abrir/ter o chat aberto marca a mensagem como ENTREGUE (chegou no meu app), NÃO
  // como lida. "Lida/Vista" agora só é gravada pelo IntersectionObserver do ChatModal,
  // quando o balão realmente aparece na tela — impede o "abri, fechei e não vi".
  const markChatDelivered = useCallback(async (doc: string) => {
    if (!userProfile?.id) return;
    try {
      await supabase
        .from("crm_conversas")
        .update({ entregue_em: new Date().toISOString() })
        .eq("documento", doc)
        .is("entregue_em", null)
        .neq("enviado_por", userProfile.id)
        .eq("destino", userProfile.id);
    } catch { /* silently fail */ }
  }, [userProfile?.id]);

  useEffect(() => {
    openChatDocs.forEach((doc) => markChatDelivered(doc));
  }, [openChatDocs, markChatDelivered]);

  useEffect(() => {
    localStorage.setItem("carflax-active-chats", JSON.stringify(activeChats));
  }, [activeChats]);

  // ── Hidratação de lastMessage ao carregar do localStorage ─────────────
  // Busca a última mensagem de cada chat ativo no banco para exibir no painel
  useEffect(() => {
    if (!userProfile?.id) return;
    if (activeChats.length === 0) return;

    const docsParaHidratar = activeChats.filter(c => !c.lastMessage).map(c => c.doc);
    if (docsParaHidratar.length === 0) return;

    async function hidratarUltimasMensagens() {
      try {
        const { data } = await supabase
          .from("crm_conversas")
          .select("documento, obs, timestamp, enviado_por_nome")
          .in("documento", docsParaHidratar)
          .order("timestamp", { ascending: false });

        if (!data || data.length === 0) return;

        // Pega a mensagem mais recente de cada documento
        const mapaUltimas: Record<string, { obs: string; timestamp: string }> = {};
        for (const row of data) {
          if (!mapaUltimas[row.documento]) {
            mapaUltimas[row.documento] = { obs: row.obs, timestamp: row.timestamp };
          }
        }

        setActiveChats(prev =>
          prev.map(c => {
            const ultima = mapaUltimas[c.doc];
            if (ultima && !c.lastMessage) {
              return { ...c, lastMessage: ultima.obs, lastMessageTime: ultima.timestamp };
            }
            return c;
          })
        );
      } catch (e) {
        console.error("[CRM] Falha ao hidratar últimas mensagens:", e);
      }
    }

    hidratarUltimasMensagens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);

  // Reset de estado durante o render ao trocar de usuário (Recomendado pelo React 18+)
  const [prevUserId, setPrevUserId] = useState(userProfile?.id);
  if (userProfile?.id !== prevUserId) {
    setPrevUserId(userProfile?.id);
    setActiveChats([]);
    setDismissedChatDocs(new Set());
  }

  const initialCheckPerformed = useRef(false);

  // ── Notificações de Entregas (Realtime) ─────────────────────────────
  useEffect(() => {
    if (!userProfile?.id) return;
    
    const myCode = userProfile.operator_code || userProfile.operatorCode;
    if (!myCode) return;

    const channel = supabase
      .channel('vendedor_entregas_notify')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'entregas',
        filter: `vendedor_codigo=eq.${myCode}` 
      }, (payload) => {
        const newData = payload.new as { nf: string; client: string; status: string };
        const oldData = payload.old as { status: string };
        
        if (newData.status === 'completed' && oldData.status !== 'completed') {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`Entrega Concluída! ✅`, {
              body: `A NF #${newData.nf} para ${newData.client} foi finalizada pelo motorista.`,
              icon: "/favicon.png",
              tag: `entrega-${newData.nf}`
            });
          }
        }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [userProfile]);

  // ── Sorteio Real-Time (Realtime Broadcast) ───────────────────────────
  useEffect(() => {
    if (!userProfile?.id) return;

    const channel = supabase
      .channel('sorteio_campanha', {
        config: {
          broadcast: { self: true }
        }
      })
      .on('broadcast', { event: 'sorteio_iniciado' }, (response) => {
        console.log('[Sorteio] Evento recebido via realtime:', response.payload);
        if (response.payload) {
          setActiveSorteio(response.payload);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.id]);

  // ── Notificações Globais do WhatsApp (fora da página de Marketing) ───
  const activeItemRef = useRef(activeItem);
  useEffect(() => { activeItemRef.current = activeItem; }, [activeItem]);

  // Só quem tem acesso ao WhatsApp no HUB recebe as notificações globais dele.
  // Sem isso, qualquer usuário logado (com permissão de notificação no navegador)
  // recebia push das mensagens mesmo sem ter o WhatsApp liberado.
  const podeReceberWhatsapp = canAccessSection(userProfile, "Whatsapp API");

  useEffect(() => {
    if (!userProfile?.id) return;
    if (!podeReceberWhatsapp) return; // sem acesso ao WhatsApp → sem socket nem notificação

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Notificação global das mensagens da API Oficial: escuta o realtime do
    // Supabase (marketing_whatsapp, onde o webhook oficial grava as recebidas).
    // Substitui o antigo socket do Evolution v2 (descontinuado).
    const channel = supabase
      .channel(`global_wpp_notif_${userProfile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "marketing_whatsapp" },
        (payload) => {
          const row = payload.new as {
            remote_jid?: string;
            texto?: string;
            sender?: string;
          };
          // Só mensagens RECEBIDAS (do contato), nunca as que a gente enviou.
          if (!row || row.sender !== "contact") return;
          // Já está na tela do WhatsApp → não precisa notificar.
          if (activeItemRef.current === "Whatsapp API") return;
          if (Notification.permission !== "granted") return;

          const remoteJid = row.remote_jid || "";
          const numero = remoteJid.split("@")[0] || "Contato";
          const notif = new Notification(`💬 ${numero}`, {
            body: row.texto || "Nova mensagem",
            icon: "/favicon.png",
            tag: `wpp-global-${remoteJid}`,
          });
          notif.onclick = () => {
            window.focus();
            window.dispatchEvent(new CustomEvent("carflax-change-tab", { detail: "Whatsapp API" }));
          };
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.id, podeReceberWhatsapp]);

  // ── Web Push — Service Worker + Subscrição persistente ──────────────
  const pushSetupDone = useRef(false);
  const pushUserId = userProfile?.id;
  useEffect(() => {
    if (!pushUserId) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (pushSetupDone.current) return; // Executa apenas uma vez por sessão
    pushSetupDone.current = true;

    async function setupPush() {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Ouve mensagens do SW (clique na notificação → navega para a seção ou abrir chat)
      navigator.serviceWorker.onmessage = (e) => {
        if (e.data?.type === 'carflax-navigate') {
          window.dispatchEvent(new CustomEvent('carflax-change-tab', { detail: e.data.section }));
        }
        if (e.data?.type === 'carflax-open-chat' && e.data.documento) {
          window.dispatchEvent(new CustomEvent('carflax-open-chat', { detail: e.data.documento }));
        }
      };

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
      if (!vapidKey) {
        // Sem chave VAPID configurada: notificações push ficam desativadas (silencioso).
        return;
      }

      const padding = '='.repeat((4 - (vapidKey.length % 4)) % 4);
      const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = new Uint8Array([...atob(base64)].map(c => c.charCodeAt(0)));

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

      // Salva/atualiza a subscrição no Supabase vinculada ao usuário
      await supabase.from('push_subscriptions').upsert({
        user_id: pushUserId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      }, { onConflict: 'endpoint' });
    }

    setupPush();
  }, [pushUserId]);

  // 1. Cache Global de Usuários (Preload similar ao CRM Legado)
  useEffect(() => {
    if (!userProfile?.id) return;

    async function preloadUsers() {
      try {
        const { data } = await supabase
          .from("usuarios")
          .select("id, name, avatar, role, operator_code");
        if (data) {
          const cache: Record<
            string,
            { id: string; name: string; avatar: string | null; role?: string; operator_code?: string }
          > = {};
          data.forEach((u) => (cache[u.id] = u));
          (
            window as unknown as { _carflaxUserCache: typeof cache }
          )._carflaxUserCache = cache;
        }
      } catch (e) {
        console.error("[CRM] Falha ao carregar cache de usuários:", e);
      }
    }

    preloadUsers();
  }, [userProfile]);

  useEffect(() => {
    const role = userProfile?.role?.toUpperCase() || "";
    const isAdminGerente = role === "ADMIN" || role.includes("GERENTE");
    if (isAdminGerente) {
      runAnnouncementAutomation();
    }
    // Comunicado de recebimento de material: dispara também quando um líder/gestor
    // abre a página (além do agendador de 10 min). Throttle de ~10 min para não
    // bater no ERP a cada refresh. A rotina no servidor é idempotente (dedup/atualiza).
    if (isAdminGerente || userProfile?.is_leader === true) {
      try {
        const KEY = "carflax-recebimento-last";
        const last = Number(localStorage.getItem(KEY) || 0);
        if (Date.now() - last > 10 * 60 * 1000) {
          localStorage.setItem(KEY, String(Date.now()));
          apiGerarComunicadoRecebimentos().catch(() => {});
        }
      } catch {
        apiGerarComunicadoRecebimentos().catch(() => {});
      }
    }
  }, [userProfile]);

  // 0. Permissão para Notificações do Navegador
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (
        Notification.permission !== "granted" &&
        Notification.permission !== "denied"
      ) {
        Notification.requestPermission();
      }
    }
  }, []);

  // ── Forced chat (centralizador blocking modal) ─────────────────────────
  const [forcedChatDoc, setForcedChatDoc] = useState<string | null>(() => {
    try {
      return localStorage.getItem("carflax-forced-chat") || null;
    } catch { return null; }
  });
  const forcedChatDocRef = useRef(forcedChatDoc);
  useEffect(() => {
    forcedChatDocRef.current = forcedChatDoc;
    if (forcedChatDoc) {
      localStorage.setItem("carflax-forced-chat", forcedChatDoc);
    } else {
      localStorage.removeItem("carflax-forced-chat");
    }
  }, [forcedChatDoc]);

  const handleForcedChatResolved = useCallback(() => {
    setForcedChatDoc(null);
  }, []);

  // Clear orphaned forcedChatDoc if chats loaded but the forced one isn't among them
  useEffect(() => {
    if (!forcedChatDoc) return;
    if (activeChats.length === 0) return; // chats not loaded yet
    if (!activeChats.some(c => c.doc === forcedChatDoc)) {
      setForcedChatDoc(null);
    }
  }, [forcedChatDoc, activeChats]);

  // 2. Realtime e Verificação Inicial
  useEffect(() => {
    if (!userProfile || !userProfile.id) return;

    const myId = userProfile.id;
    const myRole = userProfile.role || "Membro";
    const myResponsavelId = userProfile.responsavel_id;

    // Uma mensagem é "diálogo" (digitada por uma pessoa) quando NÃO é do SISTEMA nem
    // um card de atualização de status (enviado/perdido/negociação, etc.). Só diálogos
    // aparecem e notificam no ChatCentral.
    const isDialogMessage = (m: CrmConversa): boolean => {
      const sender = (m.enviado_por_nome || "").toUpperCase().trim();
      if (sender === "SISTEMA") return false;
      if ((m.obs || "").includes("ATUALIZAÇÃO DE STATUS")) return false;
      return true;
    };

    async function carregarTodasConversas() {
      try {
        const isManager = myRole.toUpperCase() === "ADMIN" || myRole.toUpperCase().includes("GERENTE");
        const orConditions = [
          `enviado_por.eq.${myId}`,
          `destino.eq.${myId}`,
        ];
        if (isManager) {
          orConditions.push(`destino.eq.todos`);
        }

        const allMsgs: CrmConversa[] = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase
            .from("crm_conversas")
            .select("id, documento, empresa, obs, enviado_por, enviado_por_nome, timestamp, lida, fechada, destino, created_at, entregue_em, lida_em")
            .or(orConditions.join(","))
            .order("timestamp", { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (!data || data.length === 0) break;
          allMsgs.push(...data);
          if (data.length < pageSize) break;
          page++;
        }

        if (!allMsgs || allMsgs.length === 0) return;

        // ENTREGUE: ao entrar (mesmo que estivesse com o HUB fechado), tudo que é
        // endereçado a mim e ainda não tinha sido entregue passa a constar como
        // entregue agora. Não marca "vista" — isso só acontece com o balão na tela.
        const idsParaEntregar = allMsgs
          .filter((m) => m.destino === myId && m.enviado_por !== myId && !m.entregue_em && m.id)
          .map((m) => m.id as string);
        if (idsParaEntregar.length > 0) {
          marcarEntregue(idsParaEntregar).catch(() => {});
        }

        // Agrupa por documento
        const byDoc: Record<string, CrmConversa[]> = {};
        for (const msg of allMsgs) {
          if (!byDoc[msg.documento]) byDoc[msg.documento] = [];
          byDoc[msg.documento].push(msg);
        }

        // Conversas que ESTE usuário ocultou da própria central ("Limpar Todas").
        // Uma conversa oculta só reaparece se houver diálogo com timestamp
        // posterior a `ocultado_em`. É por usuário — não afeta os outros.
        const { getConversasOcultas } = await import("@/lib/crm-service");
        const ocultasMap = await getConversasOcultas(myId);
        const isDocOculto = (doc: string): boolean => {
          const ocultadoEm = ocultasMap.get(doc);
          if (!ocultadoEm) return false;
          const msgs = byDoc[doc] || [];
          // msgs vêm ordenadas por timestamp desc; pega o diálogo mais recente.
          const ultimoDialogo = msgs.find(isDialogMessage);
          if (!ultimoDialogo || !ultimoDialogo.timestamp) return true;
          return new Date(ultimoDialogo.timestamp) <= new Date(ocultadoEm);
        };

        // Reconcilia o "dismiss" local (localStorage legado) com a verdade do banco:
        // mantém só as entradas que continuam ocultas por este usuário no banco.
        // Fechamentos antigos por documento (de antes da migração para ocultar por
        // usuário) não estão na tabela e caem fora — o histórico volta a aparecer
        // sem precisar limpar cache. Uso o conjunto reconciliado já neste ciclo.
        const dismissedReconciled = new Set<string>();
        for (const d of dismissedChatDocsRef.current) {
          if (ocultasMap.has(d)) dismissedReconciled.add(d);
        }
        if (dismissedReconciled.size !== dismissedChatDocsRef.current.size) {
          dismissedChatDocsRef.current = dismissedReconciled;
          setDismissedChatDocs(dismissedReconciled);
        }

        setActiveChats((prev) => {
          const existingDocs = new Set(prev.map((c) => c.doc));

          // Função auxiliar para obter vendedor e título reais
          const resolverDadosVendedor = (doc: string, msgs: CrmConversa[]) => {
            const lastMsg = msgs[0];

            let sellerName: string | undefined = undefined;
            let sellerCode: string | undefined = undefined;

            // 1. Usa o campo "destino": mensagens endereçadas A MIM foram enviadas pelo vendedor
            const msgToMe = msgs.find(m =>
              m.destino === myId &&
              m.enviado_por !== myId &&
              m.enviado_por_nome?.toUpperCase() !== "SISTEMA"
            );
            if (msgToMe) {
              sellerName = msgToMe.enviado_por_nome;
              sellerCode = msgToMe.enviado_por || undefined;
            }

            // 2. Busca reversa: mensagens que EU enviei para alguém (o destino é o vendedor)
            if (!sellerName) {
              const msgFromMe = msgs.find(m =>
                m.enviado_por === myId &&
                m.destino &&
                m.destino !== "todos" &&
                m.destino !== myId
              );
              if (msgFromMe) {
                sellerCode = msgFromMe.destino || undefined;
                const userCache = (window as unknown as { _carflaxUserCache?: Record<string, { name: string }> })._carflaxUserCache || {};
                const cached = msgFromMe.destino ? userCache[msgFromMe.destino] : undefined;
                if (cached) sellerName = cached.name;
              }
            }

            // 3. Tenta extrair do texto de mensagens de sistema (contendo Vendedor:)
            if (!sellerName) {
              const systemMsg = msgs.find(m =>
                m.obs && /Vendedor:/i.test(m.obs)
              );
              if (systemMsg) {
                const vMatch = systemMsg.obs.match(/Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i);
                if (vMatch) {
                  sellerName = vMatch[1].replace(/\*/g, "").trim();
                }
              }
            }

            // 4. Qualquer mensagem de alguém que não sou eu nem sistema
            if (!sellerName) {
              const otherMsg = msgs.find(m =>
                m.enviado_por &&
                m.enviado_por !== myId &&
                m.enviado_por_nome?.toUpperCase() !== "SISTEMA"
              );
              if (otherMsg) {
                sellerName = otherMsg.enviado_por_nome;
                sellerCode = otherMsg.enviado_por || undefined;
              }
            }

            let displayTitle = `#${doc}`;
            const isSystem = lastMsg.enviado_por_nome?.toUpperCase() === "SISTEMA";

            if (isSystem && lastMsg.obs) {
              const vMatch = lastMsg.obs.match(
                /Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i
              );
              if (vMatch) {
                displayTitle = `Divergência: ${vMatch[1].replace(/\*/g, "").trim()}`;
              }
            } else if (sellerName && sellerName.toUpperCase() !== "SISTEMA") {
              displayTitle = sellerName;
            }

            return { sellerName, sellerCode, displayTitle };
          };

          // Atualiza chats existentes com lastMessage, unreadCount, sellerName e title reais
          const updatedPrev = prev.map((c) => {
            const msgs = byDoc[c.doc];
            if (!msgs) return c;
            // Só diálogos contam para última mensagem / não-lidas.
            const dialogMsgs = msgs.filter(isDialogMessage);
            const lastMsg = dialogMsgs[0] || msgs[0];
            const unread = dialogMsgs.filter(
              (m) =>
                !m.lida &&
                m.enviado_por !== myId &&
                m.destino === myId
            ).length;

            const resolved = resolverDadosVendedor(c.doc, msgs);

            return {
              ...c,
              sellerName: resolved.sellerName,
              sellerCode: resolved.sellerCode || c.sellerCode,
              title: resolved.displayTitle,
              lastMessage: c.lastMessage || lastMsg.obs,
              lastMessageTime: c.lastMessageTime || lastMsg.timestamp,
              unreadCount: unread,
            };
          });

          // Adiciona documentos novos (não estavam no localStorage nem foram descartados)
          const novosChats: ActiveChat[] = [];
          for (const [doc, msgs] of Object.entries(byDoc)) {
            if (existingDocs.has(doc)) continue;
            if (dismissedChatDocsRef.current.has(doc)) continue;
            // Oculta na central DESTE usuário (via "Limpar Todas") só reaparece com mensagem nova.
            if (isDocOculto(doc)) continue;
            // Conversa só com atualizações de status (sem diálogo) não entra no ChatCentral.
            const dialogMsgs = msgs.filter(isDialogMessage);
            if (dialogMsgs.length === 0) continue;

            const lastMsg = dialogMsgs[0];
            const unreadCount = dialogMsgs.filter(
              (m) =>
                !m.lida &&
                m.enviado_por !== myId &&
                m.destino === myId
            ).length;

            const resolved = resolverDadosVendedor(doc, msgs);

            novosChats.push({
              id: Date.now() + Math.random(),
              doc,
              title: resolved.displayTitle,
              sellerName: resolved.sellerName || undefined,
              sellerCode: resolved.sellerCode || undefined,
              unreadCount,
              lastMessage: lastMsg.obs,
              lastMessageTime: lastMsg.timestamp,
            });
          }

          // Rede de segurança: remove duplicatas por doc que já tenham sido
          // persistidas no localStorage por versões anteriores. Mantém a primeira
          // ocorrência (updatedPrev preserva os dados mais ricos). A cada sync a
          // lista se auto-cura e a versão limpa é regravada.
          const seenDocs = new Set<string>();
          return [...updatedPrev, ...novosChats].filter((c) => {
            if (seenDocs.has(c.doc)) return false;
            seenDocs.add(c.doc);
            const msgs = byDoc[c.doc];
            // Sem mensagens deste usuário no doc = ele NÃO é participante. É uma
            // entrada órfã vinda do localStorage (ex.: chat de pedido de um vendedor
            // subordinado que o supervisor abriu no "Meus Pedidos"). Não deve ficar
            // na central — o supervisor só vê o que é dele (enviado_por/destino).
            if (!msgs) return false;
            // Remove conversas que só têm status (sem diálogo).
            if (!msgs.some(isDialogMessage)) return false;
            // Remove conversas ocultas por este usuário (sem mensagem nova desde então).
            if (isDocOculto(c.doc)) return false;
            return true;
          });
        });

        // Abre automaticamente o chat com a mensagem não lida mais recente (só diálogos)
        const primeiraComUnread = allMsgs.find(
          (m) =>
            !m.lida &&
            m.enviado_por !== myId &&
            !dismissedChatDocsRef.current.has(m.documento) &&
            m.destino === myId &&
            isDialogMessage(m)
        );
        if (primeiraComUnread && openChatDocsRef.current.length === 0) {
          openChatDoc(primeiraComUnread.documento);
        }

        // Se tenho mensagem não respondida do meu responsável, força o modal
        if (myResponsavelId) {
          for (const [doc, msgs] of Object.entries(byDoc)) {
            const lastFromResponsavel = msgs.find(
              (m) => m.enviado_por === myResponsavelId && m.destino === myId && !m.lida
            );
            if (lastFromResponsavel) {
              const respondeuDepois = msgs.some(
                (m) =>
                  m.enviado_por === myId &&
                  m.timestamp &&
                  lastFromResponsavel.timestamp &&
                  m.timestamp > lastFromResponsavel.timestamp
              );
              if (!respondeuDepois) {
                setForcedChatDoc(doc);
                openChatDoc(doc);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error("[CRM] Falha ao carregar todas as conversas:", e);
      }
    }

    if (!initialCheckPerformed.current) {
      initialCheckPerformed.current = true;
      carregarTodasConversas();
    }

    // Listener de Mensagens
    const channelName = `global_crm_${myId}`;
    const channel = supabase.channel(channelName);
    let lastSeenTimestamp = new Date().toISOString();
    const seenMsgIds = new Set<string>();

    const processRealtimeMessage = (newMsg: CrmConversa) => {
      if (newMsg.enviado_por === myId) return;
      if (newMsg.id && seenMsgIds.has(newMsg.id)) return;
      if (newMsg.id) {
        seenMsgIds.add(newMsg.id);
        if (seenMsgIds.size > 500) {
          const arr = Array.from(seenMsgIds);
          arr.splice(0, 250).forEach(id => seenMsgIds.delete(id));
        }
      }

          // Ignora atualizações de status (SISTEMA): não entram no ChatCentral nem notificam.
          if (!isDialogMessage(newMsg)) return;

          const isForMe = newMsg.destino === myId;

          if (isForMe) {
            // ENTREGUE: chegou no meu app em tempo real (estou logado).
            if (newMsg.id && !newMsg.entregue_em) {
              marcarEntregue([newMsg.id]).catch(() => {});
            }

            const isSystem =
              newMsg.enviado_por_nome?.toUpperCase() === "SISTEMA";

            // Resolve o vendedor real a partir da mensagem recebida
            const senderIsNotMe = newMsg.enviado_por !== myId && !isSystem;

            let resolvedSellerName = senderIsNotMe ? newMsg.enviado_por_nome : undefined;
            const resolvedSellerCode = senderIsNotMe ? newMsg.enviado_por || undefined : undefined;

            // Para mensagens de sistema, tenta extrair vendedor do texto
            if (!resolvedSellerName && newMsg.obs) {
              const vMatch = newMsg.obs.match(/Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i);
              if (vMatch) {
                resolvedSellerName = vMatch[1].replace(/\*/g, "").trim();
              }
            }

            const displayTitle = isSystem
              ? (newMsg.obs?.includes("Divergência") ? `Divergência: ${resolvedSellerName || `#${newMsg.documento}`}` : `Aviso: #${newMsg.documento}`)
              : (resolvedSellerName || `#${newMsg.documento}`);

            // Se a conversa estava fechada/dispensada no painel, remove do dismissed para que ela possa voltar a ficar ativa
            if (dismissedChatDocsRef.current.has(newMsg.documento)) {
              dismissedChatDocsRef.current.delete(newMsg.documento);
              setDismissedChatDocs((prev) => {
                const next = new Set(prev);
                next.delete(newMsg.documento);
                return next;
              });
            }

            setActiveChats((prev) => {
              const existing = prev.find((c) => c.doc === newMsg.documento);
              if (existing) {
                const updated = {
                  ...existing,
                  unreadCount: !openChatDocsRef.current.includes(newMsg.documento) ? (existing.unreadCount || 0) + 1 : 0,
                  lastMessage: newMsg.obs,
                  lastMessageTime: newMsg.timestamp,
                  ...(resolvedSellerName && resolvedSellerCode ? {
                    sellerName: resolvedSellerName,
                    sellerCode: resolvedSellerCode,
                  } : {}),
                };
                return [updated, ...prev.filter(c => c.doc !== newMsg.documento)];
              }

              if (dismissedChatDocsRef.current.has(newMsg.documento)) return prev;

              return [
                {
                  id: Date.now(),
                  doc: newMsg.documento,
                  title: displayTitle,
                  sellerName: resolvedSellerName || undefined,
                  sellerCode: resolvedSellerCode || undefined,
                  unreadCount: 1,
                  lastMessage: newMsg.obs,
                  lastMessageTime: newMsg.timestamp
                },
                ...prev,
              ];
            });

            // Responsável → vendedor: bloqueia a tela até responder
            const forcarChat =
              isForMe && !!myResponsavelId && newMsg.enviado_por === myResponsavelId;

            // Remetente é um líder (supervisor/gerente/diretor)? Então abre o chat
            // do destinatário em tempo real (sem bloquear), mesmo que ele não seja
            // o responsável_id exato deste vendedor.
            const senderIsLeader = !!newMsg.enviado_por && leaderIdsRef.current.has(String(newMsg.enviado_por));

            // Abre o chat quando é forçado (responsável), quando o remetente é líder
            // ou quando não há nenhum aberto. openChatDoc é idempotente.
            if (isForMe && (forcarChat || senderIsLeader || openChatDocsRef.current.length === 0)) {
              openChatDoc(newMsg.documento);
            }
            if (forcarChat) {
              setForcedChatDoc(newMsg.documento);
            }

            // Notificação Nativa (Chrome/Edge/Safari)
            if ("Notification" in window) {
              if (Notification.permission === "granted") {
                try {
                  const notif = new Notification(displayTitle, {
                    body: newMsg.obs || "Nova mensagem recebida",
                    icon: "/favicon.png",
                    tag: `carflax-chat-${newMsg.documento}`,
                    silent: false,
                  });
                  notif.onclick = () => {
                    window.focus();
                    openChatDoc(newMsg.documento);
                  };
                } catch (err) {
                  console.error("[CRM] Erro ao disparar notificação:", err);
                }
              } else if (Notification.permission !== "denied") {
                Notification.requestPermission();
              }
            }

            try {
              const audio = new Audio(
                "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3",
              );
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch {
              /* silêncio */
            }
          }
    };

    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_conversas" },
        (payload) => {
          const newMsg = payload.new as CrmConversa;
          if (newMsg.enviado_por === myId) return;
          if (newMsg.timestamp) lastSeenTimestamp = newMsg.timestamp;
          processRealtimeMessage(newMsg);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[CRM] Realtime desconectado, tentando reconectar...");
          setTimeout(() => {
            supabase.removeChannel(channel);
            const retryChannel = supabase.channel(channelName);
            retryChannel
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_conversas" },
                (payload) => {
                  const newMsg = payload.new as CrmConversa;
                  if (newMsg.enviado_por === myId) return;
                  if (newMsg.timestamp) lastSeenTimestamp = newMsg.timestamp;
                  processRealtimeMessage(newMsg);
                })
              .subscribe();
          }, 2000);
        }
      });

    // Fallback: poll para mensagens perdidas a cada 15s.
    // Só roda com a aba visível — quando oculta, o handleVisibilityChange faz o
    // catch-up ao voltar. Evita egress contínuo com o app em segundo plano.
    const pollInterval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await supabase
          .from("crm_conversas")
          .select("id, documento, empresa, obs, enviado_por, enviado_por_nome, timestamp, lida, fechada, destino, created_at, entregue_em, lida_em")
          .gt("timestamp", lastSeenTimestamp)
          .or(`destino.eq.${myId},destino.eq.todos`)
          .neq("enviado_por", myId)
          .order("timestamp", { ascending: true })
          .limit(50);
        if (data && data.length > 0) {
          for (const msg of data) {
            if (msg.timestamp) lastSeenTimestamp = msg.timestamp;
            processRealtimeMessage(msg as CrmConversa);
          }
        }
      } catch {
        /* silêncio */
      }
    }, 15000);

    // Fallback: ao voltar à aba, busca mensagens perdidas
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        try {
          const { data } = await supabase
            .from("crm_conversas")
            .select("id, documento, empresa, obs, enviado_por, enviado_por_nome, timestamp, lida, fechada, destino, created_at, entregue_em, lida_em")
            .gt("timestamp", lastSeenTimestamp)
            .or(`destino.eq.${myId},destino.eq.todos`)
            .neq("enviado_por", myId)
            .order("timestamp", { ascending: true })
            .limit(50);
          if (data && data.length > 0) {
            for (const msg of data) {
              if (msg.timestamp) lastSeenTimestamp = msg.timestamp;
              processRealtimeMessage(msg as CrmConversa);
            }
          }
        } catch {
          /* silêncio */
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleOpenChat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log("[CRM] open-crm-chat recebido:", detail);
      if (detail) {
        const isSystem =
          detail.title?.toUpperCase() === "SISTEMA" ||
          detail.sellerName?.toUpperCase() === "SISTEMA";
        const resolvedSellerName = detail.sellerName;
        const displayTitle = isSystem ? `Aviso: #${detail.doc}` : detail.title;

        // Converte operator_code (ERP) → id (Supabase) para o sellerCode
        let resolvedSellerCode = detail.sellerCode;
        if (resolvedSellerCode) {
          const userCache = (window as unknown as { _carflaxUserCache?: Record<string, { id: string; operator_code?: string }> })._carflaxUserCache || {};
          const codeClean = String(resolvedSellerCode).replace(/^0+/, "");
          const matchedUser = Object.values(userCache).find(u =>
            u.operator_code && u.operator_code.replace(/^0+/, "") === codeClean
          );
          if (matchedUser) resolvedSellerCode = matchedUser.id;
        }

        setDismissedChatDocs((prev) => {
          if (!prev.has(detail.doc)) return prev;
          const next = new Set(prev);
          next.delete(detail.doc);
          return next;
        });

        // Dedup DENTRO do updater: o closure deste listener guarda um
        // `activeChats` defasado (as deps do effect não incluem a lista), então
        // checar `activeChats.some(...)` aqui fora via de false para um doc que
        // já existia — dois eventos seguidos criavam duas linhas iguais.
        setActiveChats((prev) => {
          if (prev.some((c) => c.doc === detail.doc)) return prev;
          return [
            ...prev,
            {
              id: Date.now(),
              doc: detail.doc,
              title: displayTitle,
              sellerName: resolvedSellerName,
              sellerCode: resolvedSellerCode,
              items: detail.items,
              unreadCount: 0,
            },
          ];
        });
        openChatDoc(detail.doc);
      }
    };
    window.addEventListener("open-crm-chat", handleOpenChat);

    const handlePushOpenChat = (e: Event) => {
      const doc = (e as CustomEvent<string>).detail;
      if (doc) {
        openChatDoc(doc);
      }
    };
    window.addEventListener("carflax-open-chat", handlePushOpenChat);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("open-crm-chat", handleOpenChat);
      window.removeEventListener("carflax-open-chat", handlePushOpenChat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id, openChatDoc]);

  const handleActiveItemChange = (item: string) => {
    if (item === "Sugestões") {
      const role = userProfile?.role?.toUpperCase() || "";
      const isAdmin = ["DIRETOR", "DIRETORA"].includes(role);
      if (isAdmin) {
        setActiveItem(item);
        localStorage.setItem("carflax-active-section", item);
      } else {
        setIsSugestaoModalOpen(true);
      }
      return;
    }

    // Sem permissão: não troca de tela, apenas avisa. Continua onde está.
    if (!canAccessSection(userProfile, item)) {
      showNotification(
        "error",
        "Acesso Restrito",
        "Você não tem permissão para acessar esta seção.",
      );
      return;
    }

    setActiveItem(item);
    localStorage.setItem("carflax-active-section", item);
    setIsSidebarCollapsed(true);
  };

  const isDashboardView = [
    "Geral",
    "Performance",
    "Campanhas",
    "Dashboard",
    "Orçamentos",
    "Ligações",
  ].includes(activeItem);
  const isSettingsView = [
    "Configurações",
    "Meu Perfil",
    "Notificações",
    "Segurança",
    "Aparência",
    "Assinatura",
    "Banners",
    "Extensão",
  ].includes(activeItem);
  const isCrmView = [
    "Orçamentos",
    "Meus Pedidos",
    "Comercial",
    "Produtos",
    "Análise FRV",
    "Carteira",
    "Campanhas",
    "Ligações",
    "Alugueis",
    "Relatórios",
    "Prospecções",
  ].includes(activeItem);
  const isMarketingView = [
    "Marketing",
    "Whatsapp API",
    "Automação",
    "Blog Marketing",
    "Blog Cards",
    "Cronograma",
    "Eventos Marketing",
    "Avaliações",
    "Leads",
    "Criativo",
    "Pós-Venda",
    "Relatórios Mkt",
  ].includes(activeItem);
  // Só o COMERCIAL vê o painel de métricas; os demais veem "Funcionário do Mês".
  // Gerente de outra área (ex.: logística) NÃO vê métricas.
  const roleUpper = userProfile?.role?.toUpperCase() || "";
  const deptUpper = userProfile?.department?.toUpperCase() || "";
  const isComercialDept = deptUpper === "COMERCIAL" || deptUpper === "VENDAS";
  const isVendedorRole =
    userProfile?.role?.toLowerCase().includes("vendedor") ||
    userProfile?.role?.toLowerCase().includes("venda");
  const isDiretoria = roleUpper.includes("DIRETOR"); // DIRETOR e DIRETORA
  const isGerenteVendas =
    roleUpper.includes("GERENTE") &&
    (isComercialDept || roleUpper.includes("VENDA") || roleUpper.includes("COMERCIAL"));

  const isComercial =
    isComercialDept ||
    isVendedorRole ||
    isDiretoria ||
    isGerenteVendas ||
    roleUpper === "ADMIN" ||
    isVendedor;

  const showRightPanel = activeItem === "Geral"; // Mostrar para todos no dashboard principal

  return (
    <div className="h-screen bg-background font-sans transition-colors duration-300 overflow-hidden flex relative">
      <AppSidebar
        userProfile={userProfile || undefined}
        activeItem={activeItem}
        onActiveItemChange={handleActiveItemChange}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onLogout={onLogout}
        loading={geralLoading}
        isChatOpen={isChatPanelOpen}
        onToggleChat={() => setIsChatPanelOpen(prev => !prev)}
        chatUnreadCount={activeChats.reduce((acc, c) => acc + (c.unreadCount || 0), 0)}
      />

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <main
        className={cn(
          "flex-1 flex flex-col h-screen w-full transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isSidebarCollapsed ? "lg:pl-20" : "lg:pl-64",
          showRightPanel ? "xl:pr-80" : "pr-0",
        )}
      >
        {/* Mobile Header */}
        <div
          className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-30"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 hover:bg-secondary rounded-xl text-primary transition-colors"
          >
            <LayoutGrid className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-primary tracking-tighter">
              CARFLAX
            </span>
          </div>
          <button
            onClick={() => setIsVendedor(!isVendedor)}
            className="w-10 h-10 rounded-full border border-border overflow-hidden"
          >
            <img
              src={
                userProfile?.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || "Danilo"}`
              }
              className="w-full h-full rounded-full"
              alt="User"
            />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-col h-full w-full mx-auto overflow-hidden">
          {["Calendário", "Agenda", "Férias"].includes(activeItem) ? (
            <CalendarSection activeTab={activeItem} userProfile={userProfile || undefined} />
          ) : isSettingsView ? (
            <SettingsSection
              externalTab={activeItem}
              userProfile={userProfile || undefined}
            />
          ) : isCrmView ? (
            <CrmSection activeTab={activeItem} userProfile={userProfile || undefined} />
          ) : isMarketingView ? (
            <MarketingView activeTab={activeItem} userProfile={userProfile || undefined} />
          ) : activeItem === "Esteira" || activeItem === "Minha Esteira" ? (
            <EsteiraView userProfile={userProfile || undefined} />
          ) : activeItem.startsWith(ESTEIRA_SUBQUADRO_PREFIX) ? (
            <EsteiraView
              userProfile={userProfile || undefined}
              subquadroId={activeItem.slice(ESTEIRA_SUBQUADRO_PREFIX.length)}
            />
          ) : ["Entregas", "Romaneios", "Relatórios Entregas", "Mapa Entregas"].includes(activeItem) ? (
            <EntregasView activeTab={activeItem} userProfile={userProfile || undefined} />
          ) : ["Coletor", "Painel Coletor"].includes(activeItem) ? (
            <div className="p-6 pt-4 h-full overflow-y-auto scrollbar-hide">
              <ColetorView />
            </div>
          ) : activeItem === "Separação" ? (
            <SeparacaoView />
          ) : activeItem === "Conferência" ? (
            <ConferenciaView />
          ) : activeItem === "Retirada" ? (
            <RetiradaView userProfile={userProfile || undefined} />
          ) : activeItem === "Furos" ? (
            <FurosView />
          ) : activeItem === "Relatórios Estoque" ? (
            <RelatoriosEstoqueView />
          ) : ["RH", "Triagem"].includes(activeItem) ? (
            <RhView activeTab={activeItem} userProfile={userProfile || undefined} />
          ) : activeItem === "Compras" ? (
            <ComprasView />
          ) : activeItem === "Relatórios Compras" ? (
            <RelatoriosComprasView />
          ) : activeItem === "Usuários" ? (
            <div className="p-6 pt-4 h-full overflow-y-auto scrollbar-hide">
              <UsersView />
            </div>
          ) : activeItem === "Sugestões" ? (
            <div className="p-6 pt-4 h-full overflow-y-auto scrollbar-hide">
              <SugestoesAdminView />
            </div>
          ) : activeItem === "Scrum" ? (
            <ScrumView userProfile={userProfile || undefined} />
          ) : activeItem === "Relatórios Scrum" ? (
            <RelatoriosScrumView userProfile={userProfile || undefined} />
          ) : activeItem === "DB Admin" ? (
            <SqlRunnerView />
          ) : activeItem === "Geral" ? (
            <GeralView
              userProfile={userProfile || undefined}
              loading={geralLoading}
            />
          ) : activeItem === "Organograma" ? (
            <OrgChartView />
          ) : isDashboardView ? (
            <CommunicationSection userProfile={userProfile || undefined} />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <LayoutGrid className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-4xl font-black text-foreground mb-4 uppercase tracking-tighter">
                  Seção: {activeItem}
                </h2>
                <p className="text-muted-foreground text-lg font-medium max-w-md mx-auto">
                  Esta página está em desenvolvimento e logo ocupará toda a
                  largura da sua tela de forma dinâmica.
                </p>
              </div>
            </div>
          )}
        </div>

        {showRightPanel && (
          <div className="hidden xl:flex flex-col w-80 fixed right-0 top-0 h-screen bg-transparent py-4 pr-6 pl-0 overflow-hidden z-40">
            <button
              onClick={() => setIsVendedor(!isVendedor)}
              className="absolute top-2 right-8 text-[8px] font-bold opacity-0 hover:opacity-100 transition-opacity text-primary uppercase z-50"
            >
              Simular {isVendedor ? "Interno" : "Vendedor"}
            </button>
            <div className="flex-1 flex flex-col gap-4 pb-0 overflow-y-auto scrollbar-hide">
              {isComercial ? (
                <SalesMetricsCard
                  userProfile={userProfile || undefined}
                  data={vendedorMetrics || undefined}
                  storeData={storeData || undefined}
                  loading={geralLoading}
                  perdidoMap={perdidoMap}
                />
              ) : (
                <>
                  <EmployeeOfMonthCard loading={geralLoading} />
                  <UpcomingEventsCard loading={geralLoading} operatorCode={userProfile?.operator_code || userProfile?.operatorCode} />
                </>
              )}

              <BirthdayList loading={geralLoading} />
            </div>
          </div>
        )}
      </main>

      <SugestaoModal
        isOpen={isSugestaoModalOpen}
        onClose={() => setIsSugestaoModalOpen(false)}
      />

      <OrcamentoIAModal
        isOpen={isOrcamentoIAOpen}
        onClose={() => setIsOrcamentoIAOpen(false)}
      />

      {activeSorteio && (
        <SorteioRealtimeModal
          isOpen={!!activeSorteio}
          onClose={() => setActiveSorteio(null)}
          mes={activeSorteio.mes}
          ano={activeSorteio.ano}
          elegiveis={activeSorteio.elegiveis}
          ganhador={activeSorteio.ganhador}
          premio={activeSorteio.premio}
        />
      )}

      {/* Blur overlay when centralizador forces chat — only if the forced chat is actually open */}
      {forcedChatDoc && openChatDocs.includes(forcedChatDoc) && activeChats.some(c => c.doc === forcedChatDoc) && (
        <div className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm pointer-events-auto" />
      )}

      {/* Chat Center - Side Panel */}
      <ChatCenter
        activeChats={activeChats}
        onCloseChat={async (doc) => {
          if (doc === forcedChatDoc) return;
          setActiveChats((prev) => prev.filter((c) => c.doc !== doc));
          setDismissedChatDocs((prev) => new Set(prev).add(doc));
          setOpenChatDocs((prev) => prev.filter((d) => d !== doc));

          if (userProfile?.id) {
            // Oculta na central deste usuário (persiste entre dispositivos, sem
            // afetar os outros participantes). NÃO marca como lida — fechar/ocultar
            // não é o mesmo que ler. "Vista" só é gravada quando o balão aparece na
            // tela (IntersectionObserver do ChatModal).
            try {
              const { ocultarConversas } = await import("@/lib/crm-service");
              await ocultarConversas(userProfile.id, [doc]);
            } catch (err) {
              console.error("[ChatCenter] Falha ao ocultar conversa no banco:", err);
            }
          }
        }}
        userProfile={userProfile || undefined}
        openChatDocs={openChatDocs}
        onToggleChatDoc={handleToggleChatDoc}
        onCloseChatDoc={handleCloseChatDoc}
        onClearAll={async () => {
          const docs = activeChats
            .map((c) => c.doc)
            .filter((d) => d !== forcedChatDoc);
          // Some da lista na hora
          setActiveChats((prev) => prev.filter((c) => c.doc === forcedChatDoc));
          setOpenChatDocs((prev) => prev.filter((d) => d === forcedChatDoc));
          setDismissedChatDocs((prev) => {
            const next = new Set(prev);
            docs.forEach((d) => next.add(d));
            return next;
          });
          // Oculta na central DESTE usuário (persiste entre dispositivos/sessões,
          // sem afetar a central dos outros participantes do orçamento).
          try {
            if (userProfile?.id) {
              const { ocultarConversas } = await import("@/lib/crm-service");
              await ocultarConversas(userProfile.id, docs);
            }
          } catch (err) {
            console.error("[ChatCenter] Falha ao ocultar conversas no banco:", err);
          }
        }}
        onUpdateChat={(doc, data) => {
          setActiveChats((prev) =>
            prev.map((c) => (c.doc === doc ? { ...c, ...data } : c)),
          );
        }}
        forcedChatDoc={forcedChatDoc}
        onForcedChatResolved={handleForcedChatResolved}
        isOpen={isChatPanelOpen}
        onClose={() => setIsChatPanelOpen(false)}
      />
      <FollowUpReminder
        userProfile={userProfile}
        onNavigateToFollowUps={() => {
          handleActiveItemChange("Orçamentos");
          // Aguarda o OrcamentosView montar antes de disparar o filtro
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("carflax-filter-followups"));
          }, 150);
        }}
      />

      {activeRetiradaAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-rose-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border-4 border-rose-500 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all duration-300">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
                <BellRing className="w-10 h-10 animate-bounce" />
              </div>
              <h2 className="text-3xl font-black text-rose-500 uppercase tracking-tighter">
                CLIENTE VEIO RETIRAR!
              </h2>
              <div className="bg-secondary/50 rounded-2xl p-6 border border-border">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">
                  Cliente
                </p>
                <p className="text-xl font-extrabold text-foreground leading-tight">
                  {activeRetiradaAlert.cliente}
                </p>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-4 mb-1">
                  Pedido
                </p>
                <p className="text-sm font-black text-foreground bg-secondary px-3 py-1 rounded-lg inline-block border border-border/80">
                  #{activeRetiradaAlert.pedido}
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveRetiradaAlert(null);
                  stopAlertSound();
                }}
                className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-rose-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Entendido / Fechar Alerta
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null); // From Supabase Auth
  const sessionRef = useRef<Session | null>(null); // Ref para evitar re-execução do useEffect
  const [loading, setLoading] = useState(true);
  // Carga inicial do dashboard: emenda no MESMO LoadingScreen do boot (login/refresh),
  // então a animação do lápis não reseta ao trocar de fase (auth → dashboard).
  const [geralLoading, setGeralLoading] = useState(true);
  useEffect(() => {
    if (loading || !session) return; // só conta depois que a autenticação termina
    const timer = setTimeout(() => setGeralLoading(false), 500);
    const safety = setTimeout(() => setGeralLoading(false), 3000);
    return () => { clearTimeout(timer); clearTimeout(safety); };
  }, [loading, session]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [vendedorMetrics, setVendedorMetrics] = useState<VendedorResumo | null>(
    null,
  );
  const [storeData, setStoreData] = useState<VendedorResumo | null>(null);
  const [perdidoMap, setPerdidoMap] = useState<Map<string, number>>(new Map());

  const fetchVendedorMetrics = useCallback(async (profile: UserProfile) => {
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const dataStr = `${yyyy}-${mm}-${dd}`;
      const primeiroDia = `${yyyy}-${mm}-01`;

      const { apiDashboardGeral } = await import("@/lib/api");
      const { buildPerdidoMap } = await import("@/lib/perdido-map");

      const role = profile.role?.toUpperCase() || "";
      const isManager = role.includes("GERENTE") || role === "ADMIN";
      const codVendedor =
        profile.operator_code || profile.operatorCode || "049";

      // Calcula perdidoMap antes de setar qualquer estado, para evitar flash de 100%
      // Para vendedor comum, busca também o total da loja em paralelo (sem filtro de cod)
      const [response, newPerdidoMap, storeResponse] = await Promise.all([
        apiDashboardGeral(isManager ? undefined : codVendedor, dataStr),
        buildPerdidoMap(primeiroDia, dataStr).catch(() => new Map<string, number>()),
        isManager ? Promise.resolve(null) : apiDashboardGeral(undefined, dataStr).catch(() => null),
      ]);

      // Extrai linha MEDIA (total da loja) e salva
      const sourceForMedia = isManager ? response : storeResponse;
      if (sourceForMedia && sourceForMedia.length > 0) {
        const mediaRow = sourceForMedia.find((r: VendedorResumo) => r.COD_VENDEDOR === "MEDIA");
        if (mediaRow) setStoreData(mediaRow);
      }

      if (isManager) {
        if (response && response.length > 0) {
          const mediaRow = response.find(r => r.COD_VENDEDOR === "MEDIA");
          const finalData = mediaRow || response[0];
          setVendedorMetrics((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(finalData)) return prev;
            return finalData;
          });
        }
      } else {
        // Vendedor comum: usa a própria linha do ERP. Se ainda não faturou no mês
        // (ex.: recém-admitido), o ERP não devolve linha dele — então monta com a
        // META real (CADMET) e zera o resto, para o painel não aparecer zerado.
        const myData = (response || []).find(
          (r: VendedorResumo) => r.COD_VENDEDOR === codVendedor,
        );
        if (myData) {
          setVendedorMetrics(myData);
        } else {
          const { apiDashboardMetas } = await import("@/lib/api");
          const metasMes = await apiDashboardMetas(dataStr).catch(
            () => [] as { COD_VENDEDOR: string; META: number | string }[],
          );
          const metaFound = (metasMes || []).find(
            (mt) => String(mt.COD_VENDEDOR).trim() === String(codVendedor).trim(),
          );
          const metaVal = metaFound ? parseFloat(String(metaFound.META)) || 0 : 0;
          setVendedorMetrics({
            COD_VENDEDOR: codVendedor,
            NOME_VENDEDOR: profile.name || "",
            META: metaVal, FATURADO: 0, EM_ABERTO: 0, TOTAL: 0, FALTANTE: metaVal,
            CUSTO: 0, MARGEM_REAL: 0, MARGEM_REAL_PERC: 0,
            QTD_VENDAS: 0, TICKET_MEDIO: 0, QTD_ORCAMENTOS: 0, ORC_FECHADOS: 0,
            PRAZO_MEDIO_DIAS: 0, TOTAL_VENDIDO_HOJE: 0,
          });
        }
      }
      setPerdidoMap(newPerdidoMap);
    } catch (error) {
      console.error("Erro ao buscar métricas:", error);
    }
  }, []);

  const fetchProfile = useCallback(
    async (uid: string) => {
      try {
        // 1. Tentar buscar pelo ID (vínculo direto)
        const { data: idMatches } = await supabase
          .from("usuarios")
          .select("*")
          .eq("id", uid);

        let data = idMatches?.[0];

        // 2. AUTO-CURA: Se não achou pelo ID, tenta pelo e-mail da sessão
        if (!data) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const user = session?.user;
          if (user?.email) {
            console.log(
              "[App] Perfil não achou ID, tentando por e-mail:",
              user.email,
            );
            const { data: emailMatches } = await supabase
              .from("usuarios")
              .select("*")
              .eq("email", user.email);

            const byEmail = emailMatches?.[0];

            if (byEmail) {
              console.log(
                "[App] Usuário achado por e-mail! Tentando sincronizar ID...",
              );
              // Atualiza o registro antigo com o novo ID do Auth
              const { error: syncError } = await supabase
                .from("usuarios")
                .update({ id: uid })
                .eq("email", user.email);

              if (syncError) {
                console.error("[App] Erro na sincronização de ID:", syncError);
                // Mesmo se falhar o sync físico, usamos os dados do e-mail para a sessão atual
                data = { ...byEmail };
              } else {
                data = { ...byEmail, id: uid };
              }
            }
          }
        }

        if (data) {
          const { data: sessionData } = await supabase.auth.getSession();
          const authUser = sessionData?.session?.user;
          const mergedProfile = {
            ...data,
            // Prefere o valor da tabela usuarios; cai para o Auth metadata se a
            // coluna ainda não existir ou estiver vazia.
            phone: data.phone || authUser?.user_metadata?.phone || authUser?.phone || "",
            whatsapp: data.whatsapp || authUser?.user_metadata?.whatsapp || "",
            ramal: data.ramal || authUser?.user_metadata?.ramal || "",
          };
          setProfile(mergedProfile);
          fetchVendedorMetrics(mergedProfile);

          // Script temporário para atualizar ganhadores antigos:
          if (data.email === "marketing@carflax.com.br" || data.is_admin || data.role?.toUpperCase() === "ADMIN") {
            const checkKey = "carflax-old-winners-updated-v2";
            if (localStorage.getItem(checkKey) !== "true") {
              const GUILHERME = {
                vendedor_codigo: '002',
                vendedor_nome: 'guilherme santana',
                vendedor_avatar: 'https://zwfvrmqffxcqurxpfewi.supabase.co/storage/v1/object/public/avatares/1776523243004-o7ru51g3ft.jfif',
                atualizado_em: new Date().toISOString()
              };
              const JULIANA = {
                vendedor_codigo: '009',
                vendedor_nome: 'Juliana Oliveira',
                vendedor_avatar: 'https://zwfvrmqffxcqurxpfewi.supabase.co/storage/v1/object/public/avatares/1776523254956-dky9p1i6vvu.jfif',
                atualizado_em: new Date().toISOString()
              };
              Promise.all([
                supabase.from('premio_mes').update(GUILHERME).eq('id', '022026'),
                supabase.from('premio_mes').update(JULIANA).eq('id', '032026'),
                supabase.from('premio_mes').update(GUILHERME).eq('id', '052026')
              ]).then(() => {
                localStorage.setItem(checkKey, "true");
                console.log("[Supabase] Vendedores premiados das campanhas antigas vinculados com sucesso!");
              }).catch(err => {
                console.error("[Supabase] Erro ao vincular vendedores das campanhas antigas:", err);
              });
            }
          }
        } else {
          // Fallback total para não travar a UI se o usuário for novo no banco
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const user = session?.user;
          const fallbackProfile = {
            name: user?.email?.split("@")[0].toUpperCase() || "Usuário",
            email: user?.email || "",
            role: "Membro",
            avatar: "",
          };
          setProfile(fallbackProfile);
        }
      } catch (err) {
        console.error("Erro perfil:", err);
      } finally {
        setLoading(false);
      }
    },
    [fetchVendedorMetrics],
  );

  const forceLogout = useCallback(() => {
    setProfile(null);
    setSession(null);
    sessionRef.current = null;
    setVendedorMetrics(null);
    setLoading(false);
    // Limpar localStorage do Supabase para evitar loop de refresh
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k));
  }, []);

  useEffect(() => {
    const isMotorista = window.location.pathname.includes("/motorista") || window.location.search.includes("v=");
    
    if (isMotorista) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      sessionRef.current = session;
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Quando a sessão expira e não pode ser renovada, o Supabase dispara SIGNED_OUT
      // Isso limpa o estado e volta para a tela de login automaticamente
      if (event === 'TOKEN_REFRESHED' && !session) {
        // Refresh falhou silenciosamente — forçar logout
        console.warn('[Auth] Token refresh falhou, forçando logout');
        forceLogout();
        return;
      }
      setSession(session);
      sessionRef.current = session;
      if (session) {
        fetchProfile(session.user.id);
      } else {
        // Token expirado ou logout → limpar tudo e voltar ao login
        forceLogout();
      }
    });

    // Interceptar erros de refresh token que o onAuthStateChange não captura
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      if (url.includes('/auth/v1/token') && res.status === 400) {
        try {
          const clone = res.clone();
          const body = await clone.json();
          if (body?.error_description?.includes('Refresh Token') || body?.msg?.includes('Refresh Token')) {
            console.warn('[Auth] Refresh token inválido detectado, forçando logout');
            forceLogout();
          }
        } catch (e) {
          // Ignorar erros de parse de JSON se a resposta não for JSON
          void e;
        }
      }
      return res;
    };

    const handleProfileUpdate = () => {
      // Usa a ref para não depender do estado 'session' (evita re-execução do efeito)
      const currentSession = sessionRef.current;
      if (currentSession) fetchProfile(currentSession.user.id);
    };
    window.addEventListener("carflax-profile-updated", handleProfileUpdate);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("carflax-profile-updated", handleProfileUpdate);
      window.fetch = originalFetch;
    };
  }, [fetchProfile, forceLogout]); // Removido 'session' da dependência para evitar loop de requisições

  const isPrivacyPolicy = window.location.pathname.includes("/politica-privacidade") || window.location.pathname.includes("/privacy-policy");
  if (isPrivacyPolicy) {
    return <PrivacyPolicyView />;
  }

  const isTermsOfService = window.location.pathname.includes("/termos-de-servico") || window.location.pathname.includes("/terms-of-service");
  if (isTermsOfService) {
    return <TermsOfServiceView />;
  }

  // Rota pública de convite para fornecedores: abre direto sem a LoadingScreen do HUB
  const isConviteFornecedorRoute =
    window.location.pathname.includes("/convite-fornecedor") ||
    window.location.pathname.includes("/fornecedor-2026") ||
    window.location.search.includes("view=convite-fornecedor");

  if (isConviteFornecedorRoute) {
    return (
      <ThemeProvider defaultTheme="light" storageKey="carflax-theme">
        <NotificationProvider>
          <ConviteFornecedorPublicView />
        </NotificationProvider>
      </ThemeProvider>
    );
  }

  const isMotoristaRoute =
    window.location.pathname.includes("/motorista") ||
    window.location.search.includes("v=");

  if (isMotoristaRoute) {
    return (
      <ThemeProvider defaultTheme="light" storageKey="carflax-theme">
        <NotificationProvider>
          <MotoristaView />
        </NotificationProvider>
      </ThemeProvider>
    );
  }

  const isAvaliarRoute = window.location.pathname.includes("/avaliar");
  if (isAvaliarRoute) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="carflax-theme">
        <AvaliarPublicView />
      </ThemeProvider>
    );
  }

  const isCopaRankingRoute =
    window.location.pathname.includes("/ranking-copa") ||
    window.location.search.includes("view=ranking-copa");

  if (isCopaRankingRoute) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="carflax-theme">
        <NotificationProvider>
          <RankingCopaView />
        </NotificationProvider>
      </ThemeProvider>
    );
  }

  if (loading || (session && geralLoading)) return <LoadingScreen />;


  return (
    <ThemeProvider defaultTheme="light" storageKey="carflax-theme">
      <NotificationProvider>
        {session ? (
          <DashboardContent
            userProfile={profile}
            vendedorMetrics={vendedorMetrics}
            storeData={storeData}
            perdidoMap={perdidoMap}
            geralLoading={geralLoading}
            onLogout={() => supabase.auth.signOut()}
          />
        ) : (
          <LoginView onLogin={() => {}} />
        )}
        <PwaInstallPrompt />
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
