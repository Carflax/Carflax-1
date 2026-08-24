import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  X,
  Send,
  Loader2,
  Package,
  ShoppingBag,
  Maximize2,
  Minimize2,
  RefreshCw,
  Building2,
  User2,
  MessageSquare,
  Phone,
  AlertCircle,
} from "lucide-react";
import { cn, formatBrTime, shortenName } from "@/lib/utils";
import { resolverUsuario } from "@/lib/user-lookup";
import { getConversas, addConversa, getResponsavelIdForVendedor, marcarVista, type CrmConversa } from "@/lib/crm-service";
import { supabase } from "@/lib/supabase";
import { apiCrmOrcamentos, apiCrmOrcamentoItens, mapCrmItem, type CrmItem } from "@/lib/api";

interface UserProfile {
  id?: string;
  name: string;
  role: string;
  avatar?: string;
}

interface ParsedStatusUpdate {
  orcamento: string;
  cliente: string;
  vendedor: string;
  status: string;
  contato: string;
  canal: string;
  motivo: string;
  observacao: string | null;
  itens: string | null;
}

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  documento: string;
  empresa: string;
  title: string;
  userProfile?: UserProfile;
  sellerName?: string;
  sellerCode?: string;
  itemsInitial?: CrmItem[];
  onUpdateLastMessage?: (msg: string, time: string) => void;
  isMinimized?: boolean;
  isForced?: boolean;
  onForcedResolved?: () => void;
}


export function ChatModal({
  isOpen,
  onClose,
  documento,
  empresa,
  title,
  userProfile,
  sellerName,
  sellerCode,
  itemsInitial,
  onUpdateLastMessage,
  isMinimized = false,
  isForced = false,
  onForcedResolved
}: ChatModalProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [clientName, setClientName] = useState<string | null>(null);
  const [conversas, setConversas] = useState<CrmConversa[]>([]);
  const [loading, setLoading] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcast = useRef(0);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Ids das mensagens de divergência abertas neste chat: elas são reescritas pelo
  // coletor conforme a separação avança, então o poll precisa reler o texto delas.
  const divergenciaIdsRef = useRef<string[]>([]);
  // Último chat para o qual o nome do cliente foi resolvido (documento + título).
  const alvoClienteRef = useRef<string>("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [budgetOwner, setBudgetOwner] = useState<string | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<{ name: string; avatar: string } | null>(null);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [centralizer, setCentralizer] = useState<{ id: string; name: string; avatar: string } | null>(null);

  // sellerCode pode não chegar (ex.: conversa que só tem mensagens de SISTEMA, que
  // trazem o NOME do vendedor mas não o código). Sem ele, o responsável não é
  // resolvido → a mensagem sai com destino null (não chega na caixa de ninguém) e o
  // avatar não resolve. Fallback: pega o código do vendedor no crm_status do documento.
  const [fallbackSellerCode, setFallbackSellerCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (sellerCode) { setFallbackSellerCode(null); return; }
    const docId = documento.replace("#", "").split("-")[0].trim();
    if (!docId) { setFallbackSellerCode(null); return; }
    supabase
      .from("crm_status")
      .select("vendedor_codigo")
      .eq("documento", docId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFallbackSellerCode(data?.vendedor_codigo ? String(data.vendedor_codigo) : null);
      });
    return () => { cancelled = true; };
  }, [sellerCode, documento]);
  const effectiveSellerCode = sellerCode || fallbackSellerCode || undefined;

  // Resolve, a partir do vendedor desta conversa (effectiveSellerCode), quem é o responsável dele.
  // Isso substitui o antigo centralizador único global: cada vendedor tem o seu.
  const [resolvedResponsavelId, setResolvedResponsavelId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!effectiveSellerCode) {
      setResolvedResponsavelId(null);
      return;
    }
    getResponsavelIdForVendedor(effectiveSellerCode).then((id) => {
      if (!cancelled) setResolvedResponsavelId(id);
    });
    return () => { cancelled = true; };
  }, [effectiveSellerCode]);

  const amICentralizer = useMemo(() => {
    const role = userProfile?.role?.toUpperCase() || "";
    const isManager = role.includes("GERENTE") || role === "ADMIN" || role.includes("DIRETOR");
    return isManager || (!!userProfile?.id && !!resolvedResponsavelId && resolvedResponsavelId === userProfile.id);
  }, [userProfile, resolvedResponsavelId]);

  // Estados para Itens do Orçamento
  const [showItems, setShowItems] = useState(false);
  const [items, setItems] = useState<CrmItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const isChatWithSeparator = !amICentralizer && !!sellerName && sellerName.toUpperCase() !== "SISTEMA" && sellerName !== userProfile?.name;

  // Número sem os zeros de preenchimento do ERP: "000001030982-OR" → "1030982-OR".
  // O número completo continua no title, para conferir contra o Citel.
  const numeroDocCurto = useMemo(
    () => documento.replace("#", "").trim().replace(/^0+/, "") || documento,
    [documento]
  );

  // Markup consolidado do orçamento, exibido no cabeçalho ao lado do número.
  // Mesma conta da tela de Orçamentos: (venda / custo - 1), sobre os totais — não
  // é a média dos markups dos itens, que ignoraria o peso de cada item.
  const markupPct = useMemo(() => {
    if (items.length === 0) return null;
    let venda = 0;
    let custo = 0;
    for (const p of items) {
      const qtd = parseFloat(String(p.QUANTIDADE)) || 0;
      venda += qtd * (parseFloat(String(p.PRECO_UNITARIO)) || 0);
      custo += qtd * (parseFloat(String(p.CUSTO_UNITARIO)) || 0);
    }
    if (custo <= 0) return null;
    return (venda / custo - 1) * 100;
  }, [items]);

  // Busca os itens ao abrir, para o markup aparecer em todo chat de orçamento.
  // Só pula quando o `itemsInitial` recebido já permite calcular markup — itens
  // sem custo (que vêm de alguns eventos) não servem, e aí buscamos mesmo assim.
  // O painel de itens reaproveita este estado, então abri-lo não refaz a busca.
  const markupJaResolvido = markupPct !== null;
  useEffect(() => {
    if (!isOpen || !documento || markupJaResolvido) return;
    let cancelled = false;
    apiCrmOrcamentoItens(documento.replace("#", "").trim(), empresa || undefined)
      .then((rows) => { if (!cancelled && rows.length > 0) setItems(rows.map(mapCrmItem)); })
      .catch(() => { /* sem itens: o cabeçalho simplesmente não mostra markup */ });
    return () => { cancelled = true; };
  }, [isOpen, documento, empresa, markupJaResolvido]);

  // 1. Efeito Principal de Inicialização e Realtime
  useEffect(() => {
    if (!isOpen || !documento) return;
    
    // Solicitar permissão de notificação ao abrir o chat se ainda não tiver
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Resetar itens ao trocar de documento. Priorizar itemsInitial se vier do evento
    setItems(itemsInitial || []);
    setShowItems(false);

    interface CacheUser {
      id: string;
      name: string;
      avatar?: string;
      operator_code?: string;
    }
    const userCache = (window as unknown as { _carflaxUserCache: Record<string, CacheUser> })._carflaxUserCache || {};
    let resolvedImmediately = false;

    if (sellerName && sellerName.toUpperCase() !== "SISTEMA" && sellerName !== userProfile?.name) {
      const lookup = sellerName.toUpperCase().trim();
      const match = Object.values(userCache).find(u => 
        u.name?.toUpperCase() === lookup || lookup.includes(u.name?.toUpperCase())
      );
      
      if (match && match.id !== userProfile?.id) {
        setOwnerProfile({ name: match.name, avatar: match.avatar || "" });
        setBudgetOwner(match.id);
        resolvedImmediately = true;
      }
    }

    if (!resolvedImmediately) {
      setHeaderLoading(true);
      setOwnerProfile(null);
      setBudgetOwner(null);
    }

    // Buscar quem é a outra parte da conversa (Prioriza cache, fallback no banco)
    async function fetchOwner() {
      // Se for chat com separador, busca o separador em vez do responsável
      if (isChatWithSeparator) {
        try {
          const vCode = effectiveSellerCode;
          const vName = sellerName;

          // Tenta resolver pelo cache global primeiro
          if (vCode) {
            const cachedUser = Object.values(userCache).find((u) => u.operator_code === vCode);
            if (cachedUser && cachedUser.id !== userProfile?.id) {
              setBudgetOwner(cachedUser.id);
              setOwnerProfile({ name: cachedUser.name, avatar: cachedUser.avatar || "" });
              setHeaderLoading(false);
              return;
            }
          }

          if (vName && vName.toUpperCase() !== "SISTEMA" && vName !== userProfile?.name) {
            setOwnerProfile(prev => ({ name: vName, avatar: prev?.avatar || "" }));
          }

          // Fallback: busca no cadastro (por código ou nome) se o cache não resolveu
          const dbUser = await resolverUsuario(vCode, vName);
          if (dbUser && dbUser.id !== userProfile?.id) {
            setBudgetOwner(dbUser.id);
            setOwnerProfile({ name: dbUser.name, avatar: dbUser.avatar || "" });
          }
        } catch (e) {
          console.error("[Chat] Erro ao buscar separador:", e);
        } finally {
          setHeaderLoading(false);
        }
        return;
      }

      // Se sou Vendedor, busca o perfil do meu Responsável
      if (!amICentralizer) {
        try {
          // Tenta cache global primeiro (já resolvido pelo App.tsx)
          if (resolvedResponsavelId && userCache[resolvedResponsavelId]) {
            const cached = userCache[resolvedResponsavelId];
            setOwnerProfile({ name: cached.name, avatar: cached.avatar || "" });
            setCentralizer({ id: resolvedResponsavelId, name: cached.name, avatar: cached.avatar || "" });
            setHeaderLoading(false);
            return;
          }
          // Fallback: busca no banco
          if (resolvedResponsavelId) {
            const { data: user } = await supabase.from("usuarios").select("id, name, avatar").eq("id", resolvedResponsavelId).maybeSingle();
            if (user) {
              setOwnerProfile({ name: user.name, avatar: user.avatar || "" });
              setCentralizer(user);
            }
          }
        } catch (e) {
          console.error("[Chat] Erro ao buscar responsável:", e);
        } finally {
          setHeaderLoading(false);
        }
        return;
      }

      // Se sou Centralizador, busca o dono do orçamento (vendedor)
      try {
        const vCode = effectiveSellerCode;
        const vName = sellerName;

        // Tenta resolver pelo cache global primeiro (instantâneo)
        if (vCode) {
          const cachedUser = Object.values(userCache).find((u) => u.operator_code === vCode);
          if (cachedUser && cachedUser.id !== userProfile?.id) {
            setBudgetOwner(cachedUser.id);
            setOwnerProfile({ name: cachedUser.name, avatar: cachedUser.avatar || "" });
            setHeaderLoading(false);
            return;
          }
        }

        if (vName && vName.toUpperCase() !== "SISTEMA" && vName !== userProfile?.name) {
          setOwnerProfile(prev => ({ name: vName, avatar: prev?.avatar || "" }));
        }

        // Resolve no cadastro por código OU por nome. Sem o casamento por nome, um
        // chat sem código de vendedor ficava com o nome cru do ERP e sem foto.
        const dbUser = await resolverUsuario(vCode, vName);
        if (dbUser && dbUser.id !== userProfile?.id) {
          setBudgetOwner(dbUser.id);
          setOwnerProfile({ name: dbUser.name, avatar: dbUser.avatar || "" });
        } else if (!vCode) {
          // Última tentativa: o vendedor gravado no crm_status do documento.
          const docId = documento.replace("#", "").split("-")[0].trim();
          const { data: status } = await supabase.from("crm_status").select("vendedor_codigo, vendedor").eq("documento", docId).maybeSingle();
          const doStatus = await resolverUsuario(status?.vendedor_codigo, status?.vendedor);
          if (doStatus && doStatus.id !== userProfile?.id) {
            setBudgetOwner(doStatus.id);
            setOwnerProfile({ name: doStatus.name, avatar: doStatus.avatar || "" });
          } else if (status?.vendedor && status.vendedor.toUpperCase() !== "SISTEMA") {
            setOwnerProfile(prev => ({ name: status.vendedor, avatar: prev?.avatar || "" }));
          }
        }
      } catch (e) {
        console.error("[Chat] Erro fetchOwner:", e);
      } finally {
        setHeaderLoading(false);
      }
    }

    // Carregar mensagens e perfil em PARALELO (não sequencial)
    setLoading(true);

    const cleanDocForQuery = documento.replace("#", "").trim();

    Promise.all([
      fetchOwner(),
      getConversas(cleanDocForQuery),
    ]).then(([, data]) => {
      setConversas(data);
      setLoading(false);
      // Prévia da lista usa o último DIÁLOGO (ignora atualizações de status do SISTEMA).
      const lastDialog = [...data].reverse().find((m) => {
        const sender = (m.enviado_por_nome || "").toUpperCase().trim();
        return sender !== "SISTEMA" && !(m.obs || "").includes("ATUALIZAÇÃO DE STATUS");
      });
      if (lastDialog) {
        onUpdateLastMessage?.(lastDialog.obs, lastDialog.timestamp || new Date().toISOString());
      }
    }).catch(() => setLoading(false));

    // Realtime para este documento
    const cleanDoc = documento.replace("#", "").trim();

    const handleNewMsg = (newMsg: CrmConversa) => {
      const msgDoc = (newMsg.documento || "").replace("#", "").trim();
      if (msgDoc !== cleanDoc) return;
      if (newMsg.enviado_por === userProfile?.id) return;

      setPartnerTyping(false);
      setConversas((prev) => {
        const exists = prev.some(m => m.id === newMsg.id || (m.obs === newMsg.obs && m.enviado_por === newMsg.enviado_por));
        if (exists) return prev;

        return [...prev, newMsg];
      });
    };

    // Atualiza os "ticks" (entregue/vista) ao vivo quando a outra parte recebe/lê.
    // O texto (obs) também é mesclado: a mensagem de divergência é reescrita pelo
    // coletor a cada item conferido, então a tabela precisa mudar na tela.
    const handleMsgUpdate = (upd: CrmConversa) => {
      const msgDoc = (upd.documento || "").replace("#", "").trim();
      if (msgDoc !== cleanDoc) return;
      setConversas((prev) => {
        let mudou = false;
        const proximo = prev.map((m) => {
          if (m.id !== upd.id) return m;
          const novo = {
            ...m,
            obs: upd.obs ?? m.obs,
            lida: upd.lida,
            lida_em: upd.lida_em,
            entregue_em: upd.entregue_em,
          };
          if (
            novo.obs !== m.obs ||
            novo.lida !== m.lida ||
            novo.lida_em !== m.lida_em ||
            novo.entregue_em !== m.entregue_em
          ) {
            mudou = true;
            return novo;
          }
          return m;
        });
        return mudou ? proximo : prev;
      });
    };

    let chatChannel = supabase
      .channel(`chat_room_${cleanDoc}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_conversas' },
        (payload) => handleNewMsg(payload.new as CrmConversa))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_conversas' },
        (payload) => handleMsgUpdate(payload.new as CrmConversa))
      .subscribe((status) => {
        console.log(`[Chat] Realtime ${cleanDoc} status:`, status);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[Chat] Realtime ${cleanDoc} desconectado, reconectando...`);
          setTimeout(() => {
            supabase.removeChannel(chatChannel);
            chatChannel = supabase
              .channel(`chat_room_${cleanDoc}_${Date.now()}`)
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_conversas' },
                (payload) => handleNewMsg(payload.new as CrmConversa))
              .subscribe();
          }, 2000);
        }
      });

    // Poll de fallback: busca mensagens novas a cada 10s
    let lastPollTs = new Date().toISOString();
    const chatPoll = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("crm_conversas")
          .select("*")
          .eq("documento", cleanDoc)
          .gt("timestamp", lastPollTs)
          .order("timestamp", { ascending: true })
          .limit(20);
        if (data && data.length > 0) {
          for (const msg of data) {
            if (msg.timestamp) lastPollTs = msg.timestamp;
            handleNewMsg(msg as CrmConversa);
          }
        }

        // Divergência de separação é EDITADA (mesmo id, mesmo timestamp) a cada
        // item conferido no coletor — o filtro por timestamp acima nunca a traria.
        const divIds = divergenciaIdsRef.current;
        if (divIds.length > 0) {
          const { data: edits } = await supabase
            .from("crm_conversas")
            .select("id, obs")
            .in("id", divIds);
          if (edits && edits.length > 0) {
            setConversas((prev) => {
              let mudou = false;
              const proximo = prev.map((m) => {
                const upd = edits.find((e) => e.id === m.id);
                if (upd && upd.obs && upd.obs !== m.obs) {
                  mudou = true;
                  return { ...m, obs: upd.obs };
                }
                return m;
              });
              // Sem mudança real, devolve a MESMA lista: um array novo a cada 10s
              // re-dispararia os efeitos de header (nome do cliente piscando).
              return mudou ? proximo : prev;
            });
          }
        }
      } catch {
        /* silêncio */
      }
    }, 10000);

    // Canal de broadcast para indicador "digitando"
    const cleanDocTyping = documento.replace("#", "").trim();
    const typingChannel = supabase.channel(`typing_${cleanDocTyping}`);
    typingChannelRef.current = typingChannel;
    typingChannel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.userId === userProfile?.id) return;
        setPartnerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      clearInterval(chatPoll);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documento, userProfile?.id, userProfile?.name, itemsInitial, amICentralizer, resolvedResponsavelId, sellerCode, effectiveSellerCode, sellerName]);

  // 2. Efeito de Resolução Dinâmica de Perfil baseada em Mensagens e Cache Global
  useEffect(() => {
    if (!isOpen) return;

    // Tentar resolver pelo Cache Global primeiro (instantâneo)
    interface CacheUser {
      id: string;
      name: string;
      avatar?: string;
      operator_code?: string;
    }
    const userCache = (window as unknown as { _carflaxUserCache: Record<string, CacheUser> })._carflaxUserCache || {};
    
    const resolveFromCache = (name: string) => {
      const lookup = name.toUpperCase().trim();
      const match = Object.values(userCache).find(u => 
        u.name?.toUpperCase() === lookup || lookup.includes(u.name?.toUpperCase())
      );
      if (match && match.id !== userProfile?.id) {
        if (ownerProfile?.name !== match.name || ownerProfile?.avatar !== match.avatar) {
          setOwnerProfile({ name: match.name, avatar: match.avatar || "" });
        }
        if (budgetOwner !== match.id) {
          setBudgetOwner(match.id);
        }
        return true;
      }
      return false;
    };

    // Tenta resolver pelo nome que veio via props (se não for Sistema)
    if (sellerName && sellerName.toUpperCase() !== "SISTEMA" && sellerName !== userProfile?.name) {
      if (resolveFromCache(sellerName)) return;
    }

    if (conversas.length > 0 && (!ownerProfile || ownerProfile.name === userProfile?.name)) {
      // Tentar encontrar um humano que não sou eu nas mensagens
      const otherMessage = [...conversas].reverse().find(m => m.enviado_por && m.enviado_por !== userProfile?.id);
      
      if (otherMessage?.enviado_por) {
        const user = userCache[otherMessage.enviado_por];
        if (user) {
          setOwnerProfile({ name: user.name, avatar: user.avatar || "" });
          if (amICentralizer || isChatWithSeparator) setBudgetOwner(user.id);
          else setCentralizer({ id: user.id, name: user.name, avatar: user.avatar || "" });
        } else {
          supabase.from("usuarios").select("id, name, avatar").eq("id", otherMessage.enviado_por).maybeSingle().then(({ data: u }) => {
            if (u && u.id !== userProfile?.id) {
              setOwnerProfile({ name: u.name, avatar: u.avatar || "" });
              if (amICentralizer || isChatWithSeparator) setBudgetOwner(u.id);
            }
          });
        }
      } else {
        // Se só tem mensagem de Sistema, tenta "ler" o nome do vendedor dentro do texto
        const systemMsg = conversas.find(m => (m.enviado_por_nome?.toUpperCase() === "SISTEMA") && /vendedor:/i.test(m.obs));
        if (systemMsg) {
          const match = systemMsg.obs.match(/Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i);
          const extractedName = match ? match[1].replace(/\*/g, "").trim() : null;
          
          if (extractedName && extractedName.toUpperCase() !== userProfile?.name?.toUpperCase()) {
            if (!resolveFromCache(extractedName)) {
              setOwnerProfile(prev => ({ name: extractedName, avatar: prev?.avatar || "" }));
              // Fallback para banco se não estiver no cache
              supabase.from("usuarios").select("id, name, avatar").ilike("name", `%${extractedName}%`).maybeSingle().then(({ data: u }) => {
                if (u && u.id !== userProfile?.id) {
                  setOwnerProfile({ name: u.name, avatar: u.avatar || "" });
                  setBudgetOwner(u.id);
                }
              });
            }
          }
        }
      }
    }
  }, [conversas, userProfile?.id, userProfile?.name, amICentralizer, sellerName, isOpen, budgetOwner, ownerProfile, isChatWithSeparator]);

  // Efeito para carregar o nome do cliente do orçamento
  useEffect(() => {
    if (!isOpen || !documento) return;

    // Este efeito também roda quando chega/muda uma mensagem. Limpar o nome nesse
    // caso fazia o cliente sumir do header e voltar só quando a API respondia
    // (o "pisca" a cada atualização). Só zera quando o chat em si mudou.
    const alvo = `${documento}|${title}`;
    const mudouAlvo = alvoClienteRef.current !== alvo;
    alvoClienteRef.current = alvo;

    // Tenta primeiro obter a partir do `title` se ele não for um nome de sistema ou do centralizador/vendedor
    const isTitleNotSellerOrCentralizer = 
      title && 
      title !== sellerName && 
      !title.includes("Aviso:") && 
      !title.includes("Divergência:") && 
      title !== "Responsável" &&
      title !== "Centralizador" &&
      title !== userProfile?.name &&
      !title.startsWith("#") &&
      !/^\d+$/.test(title.replace("#", "").split("-")[0].trim());

    if (isTitleNotSellerOrCentralizer) {
      const cleanTitle = title.includes("-") && (title.includes("OR") || title.includes("PD"))
        ? title.split("-")[1].trim()
        : title;
      setClientName(cleanTitle);
    } else if (title.includes("Divergência:") && conversas.length > 0) {
      // Extrai o nome do cliente da mensagem de divergência (ex: "Cliente: *SM INDUSTRIA*")
      const divMsg = conversas.find(c => c.obs?.includes("Divergência de Separação"));
      const clienteMatch = divMsg?.obs?.match(/Cliente:\s*\*?([^*\n]+)\*?/i);
      if (clienteMatch) {
        setClientName(clienteMatch[1].trim());
      } else if (mudouAlvo) {
        setClientName(null);
      }
    } else if (mudouAlvo) {
      setClientName(null);
    }

    async function fetchClientName() {
      try {
        const cleanDocId = documento.replace("#", "").split("-")[0].trim();
        const raw = await apiCrmOrcamentos({ documento: cleanDocId });
        const isDivergencia = title.includes("Divergência:");
        // Divergências são sobre pedidos (PD). Se houver um PD e um OR com mesmo
        // número, prioriza o PD para mostrar o cliente correto.
        const matches = raw.filter(b => b.ORCAMENTO === cleanDocId || b.ORCAMENTO?.includes(cleanDocId));
        let budget = isDivergencia
          ? matches.find(b => (b as unknown as { ESPDOC?: string }).ESPDOC === "PD" || b.PEDIDO === "Sim") || matches[0]
          : matches[0];
        if (budget && budget.CLIENTE) {
          const cleanName = budget.CLIENTE.includes("-")
            ? budget.CLIENTE.slice(budget.CLIENTE.indexOf("-") + 1).trim()
            : budget.CLIENTE.trim();
          setClientName(cleanName);
        }
      } catch (err) {
        console.error("[ChatModal] Erro ao buscar dados do orçamento/cliente:", err);
      }
    }

    fetchClientName();
  }, [isOpen, documento, title, sellerName, userProfile?.name, conversas]);

  // Mantém a lista de mensagens de divergência (editáveis pelo coletor) atualizada.
  useEffect(() => {
    divergenciaIdsRef.current = conversas
      .filter((c) => (c.obs || "").includes("Divergência de Separação") && c.id)
      .map((c) => c.id as string);
  }, [conversas]);

  // Scroll automático
  useEffect(() => {
    if (conversas.length > 0) {
      const scroll = () => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      };
      
      // Tenta rolar imediatamente e novamente após um pequeno delay para garantir
      scroll();
      const timer = setTimeout(scroll, 100);
      return () => clearTimeout(timer);
    }
  }, [conversas, loading, headerLoading]);

  // 3. Lógica de exibição no Header: Memoizada para performance
  const displayUser = useMemo(() => {
    if (conversas && conversas.length > 0) {
      let otherMessageName = null;
      let otherMessageAvatar = null;

      for (let i = conversas.length - 1; i >= 0; i--) {
        const m = conversas[i];
        let senderName = m.enviado_por_nome;

        // Se for sistema, tentamos extrair o nome do vendedor
        if (senderName?.toUpperCase() === "SISTEMA" && m.obs) {
          const match = m.obs.match(/Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i);
          if (match) {
            senderName = match[1].replace(/\*/g, "").trim();
          }
        }

        // Se for outra pessoa que não eu e não sistema
        if (senderName && senderName.toUpperCase() !== "SISTEMA" && senderName.toUpperCase().trim() !== userProfile?.name?.toUpperCase().trim()) {
          otherMessageName = senderName;
          otherMessageAvatar = (m as CrmConversa & { enviado_por_foto?: string }).enviado_por_foto || null;
          break;
        }
      }

      if (otherMessageName) {
        const userCache = (window as unknown as { _carflaxUserCache: Record<string, UserProfile> })._carflaxUserCache || {};
        const lookup = otherMessageName.toUpperCase().trim();
        const cachedMatch = Object.values(userCache).find(u => 
          u.name?.toUpperCase() === lookup || lookup.includes(u.name?.toUpperCase())
        );

        return {
          name: otherMessageName,
          avatar: cachedMatch?.avatar || otherMessageAvatar || ownerProfile?.avatar || centralizer?.avatar || ""
        };
      }
    }

    const isLoggedUserTheSeller = sellerName && sellerName.toUpperCase().trim() === userProfile?.name?.toUpperCase().trim();

    if (amICentralizer || !isLoggedUserTheSeller) {
      const name = (ownerProfile?.name && ownerProfile.name.toUpperCase() !== "SISTEMA" && ownerProfile.name.toUpperCase().trim() !== userProfile?.name?.toUpperCase().trim() ? ownerProfile.name : null) || 
                   (sellerName && sellerName.toUpperCase() !== "SISTEMA" && sellerName.toUpperCase().trim() !== userProfile?.name?.toUpperCase().trim() ? sellerName : null) || 
                   (title.toUpperCase().includes(userProfile?.name?.toUpperCase() || "---") ? `Orçamento #${documento.replace("#", "")}` : title);
      return { 
        name,
        avatar: ownerProfile?.avatar || "" 
      };
    }

    return { 
      name: (centralizer?.name) || 
            (sellerName && sellerName.toUpperCase() !== "SISTEMA" && sellerName.toUpperCase().trim() !== userProfile?.name?.toUpperCase().trim() ? sellerName : null) || 
            "Responsável",
      avatar: centralizer?.avatar || "" 
    };
  }, [conversas, userProfile?.name, ownerProfile, centralizer, amICentralizer, sellerName, title, documento]);

  // O histórico do orçamento mostra TUDO: diálogos (balões) e atualizações de
  // status (SISTEMA: enviado, perdido, negociação, etc.), estas renderizadas como
  // cards via renderStatusUpdateCard. Assim o supervisor vê o histórico completo
  // ao abrir a conversa pelo orçamento.
  //
  // As atualizações de status continuam FORA do ChatCenter (lista) e NÃO abrem o
  // modal automaticamente — esse controle é feito em App.tsx (isDialogMessage no
  // carregarTodasConversas e o early-return no processRealtimeMessage). Aqui é só a
  // visão do histórico, então nada é escondido.
  const visibleConversas = useMemo(
    () => conversas.filter((m) => (m.obs || "").trim().length > 0),
    [conversas]
  );

  // ── VISTA: só marca "lida" quando o balão fica ~1s de fato na tela ────────────
  // Substitui o antigo "marcar tudo lido ao fechar" (que permitia o vendedor abrir,
  // fechar e depois alegar que não viu). Agora `lida`/`lida_em` só gravam via este
  // observer, quando a mensagem endereçada a mim aparece visível na tela.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const dwellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const vistaEnviadaRef = useRef<Set<string>>(new Set());
  const pendingElsRef = useRef<Set<HTMLDivElement>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    const dwellTimers = dwellTimersRef.current;
    const marcar = (id: string) => {
      if (vistaEnviadaRef.current.has(id)) return;
      vistaEnviadaRef.current.add(id);
      setConversas((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, lida: true, lida_em: m.lida_em || new Date().toISOString() } : m
        )
      );
      marcarVista([id]).catch(() => {});
    };
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const id = el.dataset.msgId;
          if (!id) continue;
          if (entry.isIntersecting) {
            if (!dwellTimers.has(id)) {
              const t = setTimeout(() => {
                marcar(id);
                obs.unobserve(el);
                dwellTimers.delete(id);
              }, 1000);
              dwellTimers.set(id, t);
            }
          } else {
            const t = dwellTimers.get(id);
            if (t) { clearTimeout(t); dwellTimers.delete(id); }
          }
        }
      },
      { threshold: 0.6 }
    );
    observerRef.current = obs;
    // Observa balões que já montaram antes do observer existir (corrida no 1º render).
    pendingElsRef.current.forEach((el) => obs.observe(el));
    return () => {
      obs.disconnect();
      dwellTimers.forEach((t) => clearTimeout(t));
      dwellTimers.clear();
      observerRef.current = null;
    };
  }, [isOpen]);

  // Reseta a trava de "já marquei vista" ao trocar de conversa.
  useEffect(() => {
    vistaEnviadaRef.current = new Set();
  }, [documento]);

  const observeBubble = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    pendingElsRef.current.add(el);
    if (observerRef.current) observerRef.current.observe(el);
  }, []);

  if (!isOpen) return null;

  const handleToggleItems = async () => {
    if (showItems) {
      setShowItems(false);
      return;
    }

    setShowItems(true);
    
    // Se já temos itens no estado ou no initial, não buscamos de novo
    if (items.length > 0) return;
    
    if (itemsInitial && itemsInitial.length > 0) {
      setItems(itemsInitial);
      return;
    }

    setItemsLoading(true);
    try {
      // Vai direto no endpoint de itens (FATDOR). Antes isso baixava a lista de
      // orçamentos sem filtro e procurava o documento nela — mas essa listagem só
      // traz o mês corrente, então qualquer orçamento de mês anterior aparecia
      // como "nenhum item encontrado".
      const docId = documento.replace("#", "").trim();
      const rows = await apiCrmOrcamentoItens(docId, empresa || undefined);
      setItems(rows.map(mapCrmItem));
    } catch (e) {
      console.error("[Chat] Erro ao buscar produtos:", e);
    } finally {
      setItemsLoading(false);
    }
  };

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);

    // destinoId é resolvido antecipadamente no useEffect (fetchOwner).
    let destinoId: string | null = (amICentralizer || isChatWithSeparator)
      ? (budgetOwner || null)
      : (resolvedResponsavelId || centralizer?.id || null);

    // Blindagem: se o destinatário não foi resolvido (perfil ainda carregando, ou
    // conversa só com mensagens de SISTEMA que não trazem o código), resolve agora —
    // caso contrário a mensagem grava com destino null e não chega na caixa de ninguém.
    if (!destinoId) {
      try {
        if (amICentralizer || isChatWithSeparator) {
          // Destinatário é o vendedor do orçamento.
          const code = String(effectiveSellerCode || "").trim();
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
          if (isUuid && code !== userProfile?.id) {
            destinoId = code;
          } else if (code) {
            const codeClean = code.replace(/^0+/, "");
            const { data: rows } = await supabase
              .from("usuarios")
              .select("id, operator_code")
              .or(`operator_code.eq.${code},operator_code.eq.${codeClean}`);
            const u = (rows || []).find((r) => r.id !== userProfile?.id);
            if (u?.id) destinoId = u.id;
          }
        } else if (effectiveSellerCode) {
          // Sou o vendedor: destinatário é o meu responsável.
          destinoId = await getResponsavelIdForVendedor(effectiveSellerCode);
        }
      } catch (e) {
        console.error("[Chat] Falha ao resolver destino no envio:", e);
      }
    }

    const cleanDoc = documento.replace("#", "").trim();
    const nova: Omit<CrmConversa, "id"> = {
      documento: cleanDoc,
      empresa,
      obs: text,
      enviado_por: userProfile?.id,
      enviado_por_nome: userProfile?.name || "Você",
      lida: false,
      fechada: false,
      destino: destinoId,
      timestamp: new Date().toISOString(),
    };

    setConversas((prev) => [...prev, { ...nova, id: `tmp-${Date.now()}` }]);
    setMessageText("");

    try {
      await addConversa({
        ...nova,
        enviado_por: userProfile?.id || null,
        enviado_por_nome: userProfile?.name || "Você"
      });
      onUpdateLastMessage?.(nova.obs, nova.timestamp || new Date().toISOString());

      // Ao responder, considera VISTAS todas as mensagens recebidas nesta conversa:
      // se eu respondi, obviamente li. Sem isso, um balão que nunca "descansou" 1s na
      // tela fica lida=false para sempre e a conversa reabre sozinha a cada login
      // (App.tsx → primeiraComUnread), mesmo com o pedido já respondido/faturado.
      const idsRecebidasNaoLidas = conversas
        .filter(
          (m) =>
            !isMe(m) &&
            m.destino === userProfile?.id &&
            !m.lida_em &&
            m.id &&
            !String(m.id).startsWith("tmp-"),
        )
        .map((m) => m.id as string);
      if (idsRecebidasNaoLidas.length > 0) {
        idsRecebidasNaoLidas.forEach((id) => vistaEnviadaRef.current.add(id));
        setConversas((prev) =>
          prev.map((m) =>
            m.id && idsRecebidasNaoLidas.includes(m.id)
              ? { ...m, lida: true, lida_em: m.lida_em || new Date().toISOString() }
              : m,
          ),
        );
        marcarVista(idsRecebidasNaoLidas).catch(() => {});
      }

      if (isForced) onForcedResolved?.();
    } catch (err) {
      console.error("[Chat] Erro no envio:", err);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts?: string) => {
    if (!ts) return "";
    try {
      return formatBrTime(ts);
    } catch {
      return "";
    }
  };

  const formatFull = (ts?: string | null) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "";
    }
  };

  // Status de entrega/leitura das mensagens que EU enviei (ticks estilo WhatsApp).
  const deliveryStatus = (msg: CrmConversa) => {
    const vista = !!msg.lida_em || !!msg.lida;
    const entregue = !!msg.entregue_em;
    const tooltip = [
      `Enviada: ${formatFull(msg.created_at || msg.timestamp) || "—"}`,
      `Entregue: ${msg.entregue_em ? formatFull(msg.entregue_em) : "—"}`,
      `Vista: ${msg.lida_em ? formatFull(msg.lida_em) : (msg.lida ? "sim" : "—")}`,
    ].join("\n");
    if (vista) return { label: `✓✓ Vista${msg.lida_em ? " " + formatTime(msg.lida_em) : ""}`, cls: "text-emerald-500", tooltip };
    if (entregue) return { label: "✓✓ Entregue", cls: "text-muted-foreground", tooltip };
    return { label: "✓ Enviada", cls: "text-muted-foreground/70", tooltip };
  };

  const formatDateSeparator = (ts?: string) => {
    if (!ts) return "";
    try {
      const date = new Date(ts);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const msgDate = new Date(date);
      msgDate.setHours(0, 0, 0, 0);
      
      if (msgDate.getTime() === today.getTime()) {
        return "Hoje";
      } else if (msgDate.getTime() === yesterday.getTime()) {
        return "Ontem";
      } else {
        return date.toLocaleDateString("pt-BR");
      }
    } catch {
      return "";
    }
  };


  const isMe = (msg: CrmConversa) => {
    if (!userProfile) return false;
    const myId = userProfile.id;
    const myName = userProfile.name?.toUpperCase().trim();
    
    // 1. Check ID
    if (myId && msg.enviado_por === myId) return true;
    
    // 2. Check Name OR System-Attributed Name
    const rawSender = msg.enviado_por_nome?.toUpperCase().trim();
    let resolvedSender = rawSender;

    if (rawSender === "SISTEMA") {
      const match = msg.obs.match(/Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i);
      if (match) resolvedSender = match[1].replace(/\*/g, "").trim().toUpperCase();
    }

    if (resolvedSender && myName && resolvedSender === myName) return true;
    
    return false;
  };

  const parseStatusUpdate = (text: string): ParsedStatusUpdate | null => {
    if (!text.includes("ATUALIZAÇÃO DE STATUS") && !text.includes("ORÇAMENTO:")) return null;

    const orcamento = text.match(/📑\s*\*?ORÇAMENTO:\*?\s*#?([^\n]+)/i)?.[1]?.trim();
    const cliente = text.match(/🏢\s*\*?CLIENTE:\*?\s*(.*?)(?:\n|$)/i)?.[1]?.trim();
    const vendedor = text.match(/👤\s*\*?VENDEDOR:\*?\s*(.*?)(?:\n|$)/i)?.[1]?.trim();
    const status = text.match(/📢\s*\*?STATUS:\*?\s*(.*?)(?:\n|$)/i)?.[1]?.trim();
    const contato = text.match(/📞\s*\*?CONTATO:\*?\s*(.*?)(?:\n|$)/i)?.[1]?.trim();
    const canal = text.match(/📱\s*\*?CANAL:\*?\s*(.*?)(?:\n|$)/i)?.[1]?.trim();
    const motivo = text.match(/📉\s*\*?MOTIVO:\*?\s*(.*?)(?:\n|$)/i)?.[1]?.trim();

    const observacaoMatch = text.match(/💬\s*\*?OBSERVAÇÃO:\*?\s*\n?([\s\S]*?)(?:\n━|$)/i);
    const observacao = observacaoMatch ? observacaoMatch[1].trim() : null;

    const itensMatch = text.match(/📦\s*\*?ITENS AFETADOS:\*?\s*\n?([\s\S]*?)(?:\n💬|\n━|$)/i);
    const itens = itensMatch ? itensMatch[1].trim() : null;

    if (!orcamento && !cliente && !status) return null;

    const cleanVal = (val?: string) => val ? val.replace(/\*/g, "").trim() : "";

    return {
      orcamento: cleanVal(orcamento),
      cliente: cleanVal(cliente),
      vendedor: cleanVal(vendedor),
      status: cleanVal(status),
      contato: cleanVal(contato),
      canal: cleanVal(canal),
      motivo: cleanVal(motivo),
      observacao,
      itens
    };
  };

  const renderStatusUpdateCard = (parsed: ParsedStatusUpdate, msg: CrmConversa) => {
    const statusUpper = (parsed.status || "").toUpperCase();
    let badgeColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
    let dotColor = "bg-blue-500 shadow-blue-500/50";
    
    if (statusUpper.includes("NEGOCIA")) {
      badgeColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
      dotColor = "bg-amber-500 shadow-amber-500/50";
    } else if (statusUpper.includes("CREDITO") || statusUpper.includes("CRÉDITO")) {
      badgeColor = "bg-orange-500/10 text-orange-500 border-orange-500/20";
      dotColor = "bg-orange-500 shadow-orange-500/50";
    } else if (statusUpper.includes("AGUARD")) {
      badgeColor = "bg-purple-500/10 text-purple-500 border-purple-500/20";
      dotColor = "bg-purple-500 shadow-purple-500/50";
    } else if (statusUpper.includes("PERDIDO")) {
      badgeColor = "bg-rose-500/10 text-rose-500 border-rose-500/20";
      dotColor = "bg-rose-500 shadow-rose-500/50";
    }

    const isWhatsApp = (parsed.canal || "").toLowerCase().includes("whatsapp");

    return (
      <div className={cn(
        "w-full bg-card border border-border/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm flex flex-col",
        // Maximizado (900px): sem cap, o card preenche a largura toda (menos o
        // padding da lista). No tamanho normal fica 420px para leitura confortável.
        isMaximized ? "max-w-none" : "max-w-[420px]"
      )}>
        {/* Header bar */}
        <div className={cn("bg-secondary/40 border-b border-border/30 flex items-center justify-between", isMaximized ? "px-6 py-3.5" : "px-4 py-2.5")}>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("text-blue-500", isMaximized ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />
            <span className={cn("font-black uppercase tracking-widest text-muted-foreground", isMaximized ? "text-[12px]" : "text-[9px]")}>
              Status do Orçamento
            </span>
          </div>
          <span className={cn("font-black text-muted-foreground uppercase tracking-wider bg-secondary/80 px-2 py-0.5 rounded border border-border/60", isMaximized ? "text-[12px]" : "text-[9px]")}>
            #{parsed.orcamento}
          </span>
        </div>

        {/* Content body */}
        <div className={cn("text-left", isMaximized ? "p-6 space-y-5" : "p-4 space-y-3.5")}>
          {/* Cliente and Seller Info */}
          <div className={cn(isMaximized ? "space-y-3" : "space-y-2")}>
            {parsed.cliente && (
              <div className="flex items-start gap-2.5">
                <Building2 className={cn("text-muted-foreground/60 shrink-0 mt-0.5", isMaximized ? "w-5 h-5" : "w-4 h-4")} />
                <div className="flex-1 min-w-0">
                  <span className={cn("font-black uppercase tracking-wider text-muted-foreground block leading-none mb-0.5", isMaximized ? "text-[11px]" : "text-[8px]")}>Cliente</span>
                  <span className={cn("font-bold text-foreground leading-snug block", isMaximized ? "text-sm" : "text-xs")}>{parsed.cliente}</span>
                </div>
              </div>
            )}

            {parsed.vendedor && (
              <div className="flex items-start gap-2.5">
                <User2 className={cn("text-muted-foreground/60 shrink-0 mt-0.5", isMaximized ? "w-5 h-5" : "w-4 h-4")} />
                <div className="flex-1 min-w-0">
                  <span className={cn("font-black uppercase tracking-wider text-muted-foreground block leading-none mb-0.5", isMaximized ? "text-[11px]" : "text-[8px]")}>Vendedor</span>
                  <span className={cn("font-bold text-foreground leading-snug block", isMaximized ? "text-sm" : "text-xs")}>{parsed.vendedor}</span>
                </div>
              </div>
            )}
          </div>

          {/* Status and Channel details */}
          <div className="pt-3 border-t border-border/30 grid grid-cols-2 gap-4">
            <div>
              <span className={cn("font-black uppercase tracking-wider text-muted-foreground block mb-1", isMaximized ? "text-[11px]" : "text-[8px]")}>Status</span>
              <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black uppercase border shadow-sm", isMaximized ? "text-[13px]" : "text-[10px]", badgeColor)}>
                <span className={cn("w-1.5 h-1.5 rounded-full shadow", dotColor)} />
                {parsed.status ? parsed.status.replace(/[^\w\sÀ-ÿ]/gi, '').trim() : ""}
              </span>
            </div>

            {parsed.canal && (
              <div>
                <span className={cn("font-black uppercase tracking-wider text-muted-foreground block mb-1", isMaximized ? "text-[11px]" : "text-[8px]")}>Contato</span>
                <span className={cn("flex items-center gap-1 font-bold text-foreground leading-snug mt-1", isMaximized ? "text-sm" : "text-xs")}>
                  {isWhatsApp ? (
                    <MessageSquare className={cn("text-emerald-500 shrink-0", isMaximized ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />
                  ) : (
                    <Phone className={cn("text-blue-500 shrink-0", isMaximized ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />
                  )}
                  <span className="break-words leading-tight">{parsed.canal} {parsed.contato ? `(${parsed.contato})` : ""}</span>
                </span>
              </div>
            )}
          </div>

          {/* Lost Quote / Motivo */}
          {parsed.motivo && (
            <div className={cn("bg-rose-500/5 border border-rose-500/10 rounded-xl flex gap-2", isMaximized ? "p-4" : "p-3")}>
              <AlertCircle className={cn("text-rose-500 shrink-0 mt-0.5", isMaximized ? "w-5 h-5" : "w-4 h-4")} />
              <div className="flex-1 min-w-0">
                <span className={cn("font-black uppercase tracking-wider text-rose-500 block leading-none mb-0.5", isMaximized ? "text-[11px]" : "text-[8px]")}>Motivo do Encerramento</span>
                <p className={cn("font-bold text-rose-600 dark:text-rose-400 uppercase leading-snug", isMaximized ? "text-[14px]" : "text-[11px]")}>{parsed.motivo}</p>
              </div>
            </div>
          )}

          {/* Itens Afetados */}
          {parsed.itens && (
            <div className={cn("bg-secondary/30 border border-border rounded-xl", isMaximized ? "p-4" : "p-3")}>
              <span className={cn("font-black uppercase tracking-wider text-muted-foreground block mb-1.5", isMaximized ? "text-[11px]" : "text-[8px]")}>Itens Perdidos/Afetados</span>
              <div className={cn("font-bold text-foreground/80 whitespace-pre-wrap leading-relaxed", isMaximized ? "text-[14px]" : "text-[11px]")}>
                {parsed.itens}
              </div>
            </div>
          )}

          {/* Observação / Comentário */}
          {parsed.observacao && (
            <div className={cn("bg-amber-500/5 border border-amber-500/10 rounded-xl relative overflow-hidden", isMaximized ? "p-4" : "p-3")}>
              <span className={cn("font-black uppercase tracking-wider text-amber-500 block", isMaximized ? "text-[15px] mb-2" : "text-[8px] mb-1")}>Observação do Atendimento</span>
              <p className={cn("leading-relaxed text-amber-700 dark:text-amber-300 font-semibold italic", isMaximized ? "text-[20px]" : "text-[11px]")}>
                "{parsed.observacao}"
              </p>
            </div>
          )}
        </div>

        {/* Footer timestamp */}
        <div className={cn("bg-secondary/25 px-4 py-2 border-t border-border/30 flex items-center justify-end text-muted-foreground font-bold", isMaximized ? "text-[11px]" : "text-[8px]")}>
          {formatTime(msg.timestamp)}
        </div>
      </div>
    );
  };

  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (tableRows.length > 0) {
        result.push(
          <div key={`table-${result.length}`} className="my-3 rounded-xl border border-border/50 overflow-hidden bg-background/50 shadow-inner">
            <table className={cn("w-full text-left transition-all", isMaximized ? "text-[14px]" : "text-[10px]")}>
              <thead className={cn("bg-secondary/60 text-muted-foreground uppercase tracking-widest font-black", isMaximized ? "text-[12px]" : "text-[8px]")}>
                <tr>
                  {tableRows[0].map((h, i) => <th key={i} className={cn("px-2 py-1.5 border-b border-border/50", i > 0 && "text-center")}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {tableRows.slice(2).map((row, i) => (
                  <tr key={i} className="hover:bg-secondary/40 transition-colors">
                    {row.map((cell, j) => {
                       const isRed = cell.includes('<red>');
                       const isGreen = cell.includes('<green>');
                       const cleanCell = cell.replace(/<\/?(red|green)>/g, '');
                       return (
                         <td key={j} className={cn(
                           "px-2 py-1.5 font-semibold", 
                           isRed ? "text-rose-500 font-black" : (isGreen ? "text-emerald-500 font-black" : "text-foreground/90"), 
                           j === 0 ? "text-[9px] uppercase tracking-tighter" : "text-center"
                         )}>
                           {cleanCell}
                         </td>
                       );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    lines.forEach((line, index) => {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cols = line.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cols);
      } else {
        flushTable();
        
        // Renderiza linha normal
        const renderLine = (str: string) => {
          // Processa <red>
          const parts = str.split(/(<red>.*?<\/red>)/g);
          return parts.map((part, k) => {
            if (part.startsWith('<red>')) {
              return <span key={k} className="text-rose-500 font-black">{part.replace(/<\/?red>/g, '')}</span>;
            }
            // Processa *bold*
            const boldParts = part.split(/(\*.*?\*)/g);
            return boldParts.map((bp, j) => {
              if (bp.startsWith('*') && bp.endsWith('*')) {
                return <span key={`${k}-${j}`} className="font-black text-foreground">{bp.slice(1, -1)}</span>;
              }
              // Processa dois pontos apenas se for a primeira palavra da linha, mantendo retrocompatibilidade
              if (j === 0 && k === 0 && bp.includes(':') && !bp.startsWith('http')) {
                const colonIdx = bp.indexOf(':');
                return (
                  <span key={`${k}-${j}-c`}>
                    <span className="text-amber-400 font-black">{bp.slice(0, colonIdx)}:</span>
                    <span className="text-foreground">{bp.slice(colonIdx + 1)}</span>
                  </span>
                );
              }
              return bp;
            });
          });
        };

        result.push(
          <div key={index} className="mb-0.5 leading-relaxed">
            {renderLine(line)}
          </div>
        );
      }
    });
    flushTable();

    return result;
  };

  const ChatSkeleton = () => (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn("flex flex-col space-y-1", i % 2 === 0 ? "items-end" : "items-start")}>
          <div className="h-2 w-16 bg-secondary/40 rounded-full mb-1" />
          <div className={cn("h-12 w-48 bg-secondary/20 rounded-2xl", i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none")} />
        </div>
      ))}
    </div>
  );

  const handleClose = async () => {
    if (isForced) return;
    // IMPORTANTE: fechar NÃO marca mais como lida. "Lida/Vista" agora só é gravada
    // pelo IntersectionObserver, quando o balão realmente apareceu na tela — assim
    // não dá para abrir, fechar e depois alegar que não recebeu/viu.
    onClose();
  };

  if (!isOpen || isMinimized) return null;

  return (
    <div className="pointer-events-none w-full h-full sm:w-auto sm:h-auto">
      <div className={cn(
          "bg-card/95 backdrop-blur-xl border border-border shadow-2xl flex flex-col pointer-events-auto transition-all duration-300 animate-in slide-in-from-bottom-4 overflow-hidden",
          "w-full h-[100dvh] fixed inset-0 sm:relative sm:inset-auto rounded-none sm:rounded-2xl",
          isMaximized ? "sm:w-[900px] sm:h-[85vh]" : "sm:w-[340px] sm:h-[480px]"
        )}>
        <div className="p-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-4 border-b border-border flex items-center justify-between gap-2 bg-secondary/30 rounded-t-none sm:rounded-t-2xl shrink-0 transition-all">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              "rounded-full flex items-center justify-center font-black overflow-hidden border border-blue-500/30",
              isMaximized ? "w-11 h-11 text-sm" : "w-8 h-8 text-xs",
              (headerLoading) ? "bg-secondary/40 animate-pulse" : "bg-blue-500/20 text-blue-500"
            )}>
              {displayUser?.avatar && !headerLoading ? (
                <img src={displayUser.avatar} alt={displayUser.name} className="w-full h-full object-cover" />
              ) : displayUser?.name && !headerLoading ? (
                <span>{displayUser.name.split(" ").filter(Boolean).map(n => n[0]).join("")}</span>
              ) : null}
            </div>
            {/* Cabeçalho estreito (340px) dividido com 4 botões: nomes vão abreviados
                e em uma linha só. O nome completo fica no title, ao passar o mouse. */}
            <div className="flex flex-col gap-1 min-w-0">
              {headerLoading ? (
                <div className="h-2 w-24 bg-secondary/40 rounded-full animate-pulse" />
              ) : (
                <span
                  className={cn("font-black text-foreground tracking-tight leading-none uppercase truncate", isMaximized ? "text-[16px]" : "text-[13px]")}
                  title={displayUser.name}
                >
                  {shortenName(displayUser.name)}
                </span>
              )}
              {documento && !headerLoading ? (
                <span className={cn("font-black text-blue-500 uppercase tracking-tighter opacity-80 flex items-center gap-1 min-w-0", isMaximized ? "text-[13px]" : "text-[11px]")}>
                  <span className="shrink-0" title={documento}>#{numeroDocCurto}</span>
                  {markupPct !== null && (
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[9px] font-black border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 tracking-wider shrink-0"
                      title="Markup do documento (venda ÷ custo)"
                    >
                      MKP {markupPct.toFixed(1).replace(".", ",")}%
                    </span>
                  )}
                </span>
              ) : (
                <div className="h-1.5 w-16 bg-secondary/20 rounded-full animate-pulse" />
              )}
              {clientName && !headerLoading && (
                <span
                  className={cn("font-black text-foreground/80 uppercase tracking-tight leading-none truncate", isMaximized ? "text-[12px]" : "text-[10px]")}
                  title={clientName}
                >
                  {shortenName(clientName)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {amICentralizer && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleToggleItems(); }} 
                className={cn(
                  "p-1.5 rounded-lg transition-all active:scale-95",
                  showItems ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "hover:bg-secondary text-muted-foreground hover:text-blue-600"
                )}
                title="Ver Itens do Orçamento"
              >
                <Package className="w-3.5 h-3.5" />
              </button>
            )}
            {isForced ? (
              <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest animate-pulse px-2">
                Responda para continuar
              </span>
            ) : (
              <>
                <button onClick={(e) => { e.stopPropagation(); setIsMaximized(!isMaximized); }} className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground" title={isMaximized ? "Restaurar" : "Maximizar"}>
                  {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className="p-1.5 hover:bg-rose-500/10 hover:text-rose-500 rounded-lg transition-colors text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* PAINEL DE ITENS DO ORCAMENTO */}
            {showItems && (
              <div className="absolute inset-0 z-50 bg-card flex flex-col animate-in slide-in-from-right-full duration-300">
                <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/20">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[10px] font-black text-foreground uppercase tracking-widest">Produtos do Orçamento</span>
                  </div>
                  <button onClick={() => setShowItems(false)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                  {itemsLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Carregando Itens...</span>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center px-4">
                      <Package className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">Nenhum item encontrado para este orçamento.</p>
                    </div>
                  ) : (
                    items.map((it, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-secondary/30 border border-border/50 hover:border-blue-500/30 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">CÓD: {it.COD_PRODUTO}</span>
                          <span className="text-[9px] font-black text-emerald-500">{parseFloat(String(it.QUANTIDADE)).toFixed(0)} {it.UN || 'UN'}</span>
                        </div>
                        <p className="text-[10px] font-bold text-foreground leading-tight uppercase tracking-tight mb-1">{it.PRODUTO}</p>
                        <div className="flex justify-between items-center text-[9px] font-black opacity-60">
                          <span>UNIT: {(parseFloat(String(it.PRECO_UNITARIO))).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL'})}</span>
                          <span className="text-foreground">TOTAL: {(parseFloat(String(it.QUANTIDADE)) * parseFloat(String(it.PRECO_UNITARIO))).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL'})}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                <div className="p-3 border-t border-border bg-secondary/10 shrink-0">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[9px] font-black text-muted-foreground uppercase">Valor Total:</span>
                    <span className="text-[11px] font-black text-emerald-500">
                      {items.reduce((acc, it) => acc + (parseFloat(String(it.QUANTIDADE)) * parseFloat(String(it.PRECO_UNITARIO))), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL'})}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {(loading || headerLoading) && <ChatSkeleton />}
              {!(loading || headerLoading) && visibleConversas.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="w-10 h-10 bg-secondary/30 rounded-full flex items-center justify-center border border-border">
                    <Send className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Nenhuma conversa ainda</p>
                </div>
              )}
              {!(loading || headerLoading) && visibleConversas.map((msg, index) => {
                const prevMsg = index > 0 ? visibleConversas[index - 1] : null;
                const showDateSeparator = !prevMsg || (() => {
                  if (!msg.timestamp || !prevMsg.timestamp) return false;
                  const d1 = new Date(msg.timestamp).toDateString();
                  const d2 = new Date(prevMsg.timestamp).toDateString();
                  return d1 !== d2;
                })();

                return (
                  <div key={msg.id} className="flex flex-col space-y-4">
                    {showDateSeparator && (
                      <div className="flex justify-center select-none my-2">
                        <span className={cn("font-black text-muted-foreground/80 uppercase bg-secondary/60 px-3 py-1 rounded-full border border-border/40 tracking-wider", isMaximized ? "text-[10px]" : "text-[8px]")}>
                          {formatDateSeparator(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    {(() => {
                      const parsedStatus = parseStatusUpdate(msg.obs);
                      if (parsedStatus) {
                        return (
                          <div className="flex justify-center my-3 w-full animate-in fade-in slide-in-from-bottom-1 duration-200">
                            {renderStatusUpdateCard(parsedStatus, msg)}
                          </div>
                        );
                      }

                      return (
                        <div className={cn("flex flex-col space-y-1", isMe(msg) ? "items-end" : "items-start")}>
                          {!isMe(msg) && (
                            <span className={cn("font-black text-muted-foreground uppercase ml-1 tracking-widest", isMaximized ? "text-[12px]" : "text-[10px]")}>
                              {(() => {
                                if (msg.enviado_por_nome?.toUpperCase() === "SISTEMA") {
                                  const match = msg.obs.match(/Vendedor:.*?\*?\s*(.*?)(?:\n|$)/i);
                                  return match ? match[1].replace(/\*/g, "").trim() : "Sistema";
                                }
                                return msg.enviado_por_nome;
                              })()}
                            </span>
                          )}
                          <div
                            ref={
                              !isMe(msg) && msg.destino === userProfile?.id && !msg.lida_em && msg.id && !String(msg.id).startsWith("tmp-")
                                ? observeBubble
                                : undefined
                            }
                            data-msg-id={msg.id}
                            className={cn(
                            "rounded-2xl max-w-full shadow-xl leading-relaxed transition-all",
                            isMaximized ? "p-5 text-[17px] font-bold" : "p-3.5 text-[13px] font-semibold",
                            isMe(msg) ? "bg-blue-600 text-white rounded-tr-none" : "bg-secondary/80 text-foreground/90 rounded-tl-none border border-border/40"
                          )}>
                            {renderFormattedText(msg.obs)}
                          </div>
                          <div className={cn("flex items-center gap-2", isMe(msg) ? "mr-1" : "ml-1")}>
                            <span className={cn("font-black text-muted-foreground uppercase opacity-50", isMaximized ? "text-[11px]" : "text-[9px]")}>{formatTime(msg.timestamp)}</span>
                            {isMe(msg) && (() => {
                              const s = deliveryStatus(msg);
                              return <span title={s.tooltip} className={cn("font-black uppercase", isMaximized ? "text-[11px]" : "text-[9px]", s.cls)}>{s.label}</span>;
                            })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {partnerTyping && (
                <div className="flex items-center gap-2 ml-1 mb-2 animate-pulse">
                  <span className="text-xs font-bold text-emerald-500 italic">digitando...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="p-4 border-t border-border bg-secondary/10">
              <div className="relative flex items-end gap-2">
                <textarea
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    const now = Date.now();
                    if (now - lastTypingBroadcast.current > 2000) {
                      lastTypingBroadcast.current = now;
                      typingChannelRef.current?.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: { userId: userProfile?.id, userName: userProfile?.name },
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Adicionar observação..." 
                  rows={1}
                  className={cn(
                    "w-full bg-secondary/50 border border-border rounded-xl pl-4 pr-10 outline-none focus:border-blue-500/50 transition-all placeholder:text-muted-foreground/30 font-bold resize-none py-3 scrollbar-hide",
                    isMaximized ? "text-[16px] min-h-[56px]" : "text-[13px] min-h-[44px]"
                  )} 
                />
                <button 
                  onClick={() => handleSend()}
                  disabled={sending || !messageText.trim()} 
                  className="absolute right-2 bottom-2 p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}
