import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Pencil, Calendar,
  User, Check, X, MessageSquare,
  Smile, Meh, Frown, Users, Star
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface PosVendaCard {
  id: string;
  remote_jid: string;
  cliente_nome: string;
  produtos?: string;
  vendedor_id?: string;
  nps_score?: number | null;
  nps_feedback?: string | null;
  column_id: "ENTREGA" | "CONTATO_7_DIAS" | "CONTATO_30_DIAS" | "RESOLVIDO";
  order_index: number;
  due_date?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface UserProfile {
  id?: string;
  name: string;
  role: string;
}

interface PosVendaViewProps {
  userProfile?: UserProfile | null;
}

const COLUMNS: { id: PosVendaCard["column_id"]; title: string; bgClass: string; borderClass: string; textClass: string }[] = [
  {
    id: "ENTREGA",
    title: "Pós-Entrega",
    bgClass: "bg-sky-500/5 dark:bg-sky-500/10",
    borderClass: "border-sky-500/20",
    textClass: "text-sky-500"
  },
  {
    id: "CONTATO_7_DIAS",
    title: "Feedback 7 Dias",
    bgClass: "bg-purple-500/5 dark:bg-purple-500/10",
    borderClass: "border-purple-500/20",
    textClass: "text-purple-500"
  },
  {
    id: "CONTATO_30_DIAS",
    title: "Fidelidade 30 Dias",
    bgClass: "bg-amber-500/5 dark:bg-amber-500/10",
    borderClass: "border-amber-500/20",
    textClass: "text-amber-500"
  },
  {
    id: "RESOLVIDO",
    title: "Finalizado",
    bgClass: "bg-emerald-500/5 dark:bg-emerald-500/10",
    borderClass: "border-emerald-500/20",
    textClass: "text-emerald-500"
  }
];

export function PosVendaView({ userProfile }: PosVendaViewProps) {
  const [cards, setCards] = useState<PosVendaCard[]>([]);
  const [usersList, setUsersList] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Partial<PosVendaCard> | null>(null);

  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);
  const [draggedOverCardId, setDraggedOverCardId] = useState<string | null>(null);
  const [draggedOverCardPart, setDraggedOverCardPart] = useState<"top" | "bottom" | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleCardExpanded = (cardId: string) => {
    setExpandedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const currentUserId = userProfile?.id;

  // Carregar cards e usuários
  useEffect(() => {
    loadCards();
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, name, avatar")
        .eq("status", "ativo")
        .order("name");

      if (error) throw error;
      setUsersList(data || []);
    } catch (err) {
      console.error("[PosVendaView] Erro ao carregar usuários:", err);
    }
  };

  const loadCards = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("marketing_pos_venda")
        .select("*")
        .order("order_index", { ascending: true });

      if (error) throw error;
      setCards(data || []);
    } catch (err) {
      console.error("[PosVendaView] Erro ao carregar cards:", err);
    } finally {
      setLoading(false);
    }
  };

  // Salvar (Inserir ou Atualizar)
  const saveCard = async (cardData: Partial<PosVendaCard>) => {
    if (!cardData.cliente_nome?.trim() || !cardData.remote_jid?.trim()) {
      alert("Nome do Cliente e WhatsApp são obrigatórios.");
      return;
    }

    setSaving(true);
    // Limpar o telefone digitado pelo usuário para o formato de JID do WhatsApp
    let cleanPhone = cardData.remote_jid.replace(/\D/g, "");
    if (cleanPhone.length > 0 && !cleanPhone.endsWith("@s.whatsapp.net")) {
      cleanPhone = `${cleanPhone}@s.whatsapp.net`;
    }

    const payload = {
      cliente_nome: cardData.cliente_nome.trim(),
      remote_jid: cleanPhone,
      produtos: cardData.produtos?.trim() || null,
      vendedor_id: cardData.vendedor_id || null,
      nps_score: cardData.nps_score !== undefined ? cardData.nps_score : null,
      nps_feedback: cardData.nps_feedback?.trim() || null,
      column_id: cardData.column_id || "ENTREGA",
      due_date: cardData.due_date || null,
      notes: cardData.notes?.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      if (!cardData.id) {
        // INSERÇÃO
        const orderIdx = cards.filter(c => c.column_id === (cardData.column_id || "ENTREGA")).length;
        const insertPayload = {
          ...payload,
          order_index: orderIdx
        };

        const { data, error } = await supabase
          .from("marketing_pos_venda")
          .insert([insertPayload])
          .select()
          .single();

        if (error) throw error;
        if (data) setCards(prev => [...prev, data]);
      } else {
        // ATUALIZAÇÃO
        const { error } = await supabase
          .from("marketing_pos_venda")
          .update(payload)
          .eq("id", cardData.id);

        if (error) throw error;
        setCards(prev => prev.map(c => c.id === cardData.id ? { ...c, ...payload } as PosVendaCard : c));
      }
    } catch (err) {
      console.error("[PosVendaView] Erro ao salvar card:", err);
      alert("Erro ao salvar informações de pós-venda.");
    } finally {
      setSaving(false);
      setIsCardModalOpen(false);
      setSelectedCard(null);
    }
  };

  // Excluir card
  const deleteCard = async (cardId: string) => {
    if (!confirm("Deseja realmente excluir este acompanhamento de pós-venda?")) return;

    try {
      const { error } = await supabase
        .from("marketing_pos_venda")
        .delete()
        .eq("id", cardId);

      if (error) throw error;
      setCards(prev => prev.filter(c => c.id !== cardId));
    } catch (err) {
      console.error("[PosVendaView] Erro ao excluir card:", err);
    }

    if (selectedCard?.id === cardId) {
      setIsCardModalOpen(false);
      setSelectedCard(null);
    }
  };

  // Drag and Drop de Colunas
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, columnId: PosVendaCard["column_id"]) => {
    e.preventDefault();
    setDraggedOverColumn(columnId);
  };

  const handleDragLeave = () => setDraggedOverColumn(null);

  const handleDrop = async (e: React.DragEvent, targetColumnId: PosVendaCard["column_id"]) => {
    e.preventDefault();
    setDraggedOverColumn(null);
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;

    const targetCard = cards.find(c => c.id === cardId);
    if (!targetCard || targetCard.column_id === targetColumnId) return;

    const sourceColumnId = targetCard.column_id;
    const newOrderIndex = cards.filter(x => x.column_id === targetColumnId).length;

    const movedCard = { ...targetCard, column_id: targetColumnId, order_index: newOrderIndex };

    const sourceColCards = cards
      .filter(c => c.column_id === sourceColumnId && c.id !== cardId)
      .sort((a, b) => a.order_index - b.order_index);

    const reindexedSourceCards = sourceColCards.map((c, idx) => ({
      ...c,
      order_index: idx
    }));

    const updatedCardsMap = new Map<string, PosVendaCard>();
    reindexedSourceCards.forEach(c => updatedCardsMap.set(c.id, c));

    const newCards = cards.map(c => {
      if (c.id === cardId) return movedCard;
      return updatedCardsMap.get(c.id) || c;
    });

    newCards.sort((a, b) => a.order_index - b.order_index);
    setCards(newCards);

    try {
      const changedCards = newCards.filter(c => {
        const orig = cards.find(oc => oc.id === c.id);
        return !orig || orig.column_id !== c.column_id || orig.order_index !== c.order_index;
      });

      for (const card of changedCards) {
        await supabase
          .from("marketing_pos_venda")
          .update({ column_id: card.column_id, order_index: card.order_index, updated_at: new Date().toISOString() })
          .eq("id", card.id);
      }
    } catch (err) {
      console.error("[PosVendaView] Erro ao salvar movimento de coluna:", err);
      loadCards();
    }
  };

  // Drag and Drop entre Cards (Reordenação)
  const handleCardDrop = async (e: React.DragEvent, targetCardId: string, position: "top" | "bottom") => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverColumn(null);
    setDraggedOverCardId(null);
    setDraggedOverCardPart(null);

    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId || cardId === targetCardId) return;

    const draggedCard = cards.find(c => c.id === cardId);
    const targetCard = cards.find(c => c.id === targetCardId);
    if (!draggedCard || !targetCard) return;

    const targetColumnId = targetCard.column_id;
    const sourceColumnId = draggedCard.column_id;

    const targetColCards = cards
      .filter(c => c.column_id === targetColumnId && c.id !== cardId)
      .sort((a, b) => a.order_index - b.order_index);

    const targetCardIndex = targetColCards.findIndex(c => c.id === targetCardId);
    const targetIndex = position === "bottom" ? targetCardIndex + 1 : targetCardIndex;

    const movedCard = { ...draggedCard, column_id: targetColumnId, order_index: targetIndex };
    targetColCards.splice(targetIndex, 0, movedCard);

    const reindexedTargetCards = targetColCards.map((c, idx) => ({
      ...c,
      order_index: idx
    }));

    let reindexedSourceCards: PosVendaCard[] = [];
    if (sourceColumnId !== targetColumnId) {
      const sourceColCards = cards
        .filter(c => c.column_id === sourceColumnId && c.id !== cardId)
        .sort((a, b) => a.order_index - b.order_index);
      
      reindexedSourceCards = sourceColCards.map((c, idx) => ({
        ...c,
        order_index: idx
      }));
    }

    const updatedCardsMap = new Map<string, PosVendaCard>();
    reindexedTargetCards.forEach(c => updatedCardsMap.set(c.id, c));
    reindexedSourceCards.forEach(c => updatedCardsMap.set(c.id, c));

    const newCards = cards.map(c => {
      if (c.id === cardId) {
        return { ...draggedCard, column_id: targetColumnId, order_index: targetIndex };
      }
      return updatedCardsMap.get(c.id) || c;
    });

    newCards.sort((a, b) => a.order_index - b.order_index);
    setCards(newCards);

    try {
      const changedCards = newCards.filter(c => {
        const orig = cards.find(oc => oc.id === c.id);
        return !orig || orig.column_id !== c.column_id || orig.order_index !== c.order_index;
      });

      for (const card of changedCards) {
        await supabase
          .from("marketing_pos_venda")
          .update({ column_id: card.column_id, order_index: card.order_index, updated_at: new Date().toISOString() })
          .eq("id", card.id);
      }
    } catch (err) {
      console.error("[PosVendaView] Erro ao reordenar card:", err);
      loadCards();
    }
  };

  const handleOpenChat = (jid: string) => {
    localStorage.setItem("carflax_pending_chat", jid);
    window.dispatchEvent(new CustomEvent("carflax-change-tab", { detail: "Whatsapp API" }));
    window.dispatchEvent(new CustomEvent("carflax-open-chat", { detail: jid }));
  };

  // Auxiliares visuais
  const isOverdue = (dateStr?: string | null, columnId?: PosVendaCard["column_id"]) => {
    if (!dateStr || columnId === "RESOLVIDO") return false;
    const due = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("T")[0].split("-");
    return `${day}/${month}/${year}`;
  };

  // Cálculo das Métricas de Gerenciamento
  const stats = useMemo(() => {
    const active = cards.filter(c => c.column_id !== "RESOLVIDO").length;
    const resolved = cards.filter(c => c.column_id === "RESOLVIDO").length;
    
    const cardsWithNps = cards.filter(c => c.nps_score !== null && c.nps_score !== undefined);
    const npsTotal = cardsWithNps.length;
    
    let npsAvg = 0;
    let promotersCount = 0;
    let detractorsCount = 0;

    if (npsTotal > 0) {
      const totalScore = cardsWithNps.reduce((acc, c) => acc + (c.nps_score || 0), 0);
      npsAvg = parseFloat((totalScore / npsTotal).toFixed(1));

      promotersCount = cardsWithNps.filter(c => (c.nps_score || 0) >= 9).length;
      detractorsCount = cardsWithNps.filter(c => (c.nps_score || 0) <= 6).length;
    }

    // NPS Score formula: % Promoters - % Detractors
    const npsScore = npsTotal > 0 
      ? Math.round(((promotersCount - detractorsCount) / npsTotal) * 100)
      : null;

    return {
      active,
      resolved,
      npsScore,
      npsTotal,
      promotersPct: npsTotal > 0 ? Math.round((promotersCount / npsTotal) * 100) : 0,
      detractorsPct: npsTotal > 0 ? Math.round((detractorsCount / npsTotal) * 100) : 0,
      npsAvg
    };
  }, [cards]);

  const getNpsBadge = (score?: number | null) => {
    if (score === null || score === undefined) {
      return { label: "Pendente NPS", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: <Meh className="w-3.5 h-3.5" /> };
    }
    if (score >= 9) {
      return { label: `Nota ${score} (Promotor)`, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: <Smile className="w-3.5 h-3.5" /> };
    }
    if (score >= 7) {
      return { label: `Nota ${score} (Neutro)`, color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: <Meh className="w-3.5 h-3.5" /> };
    }
    return { label: `Nota ${score} (Detrator)`, color: "text-rose-500 bg-rose-500/10 border-rose-500/20", icon: <Frown className="w-3.5 h-3.5" /> };
  };

  const openNewCard = (columnId: PosVendaCard["column_id"] = "ENTREGA") => {
    setSelectedCard({ column_id: columnId, vendedor_id: currentUserId || "" });
    setIsCardModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground p-6 overflow-hidden relative font-sans">
      
      {/* ── METRICS DASHBOARD ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0">
        
        {/* Ativos */}
        <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Em Andamento</span>
            <span className="text-2xl font-bold">{stats.active}</span>
          </div>
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Finalizados */}
        <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Finalizados</span>
            <span className="text-2xl font-bold text-emerald-500">{stats.resolved}</span>
          </div>
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
            <Check className="w-5 h-5" />
          </div>
        </div>

        {/* NPS Score */}
        <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Score NPS Geral</span>
            <span className={cn(
              "text-2xl font-bold",
              stats.npsScore === null ? "text-muted-foreground" : 
              stats.npsScore >= 75 ? "text-emerald-500" :
              stats.npsScore >= 50 ? "text-amber-500" : "text-rose-500"
            )}>
              {stats.npsScore === null ? "—" : stats.npsScore}
            </span>
          </div>
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            stats.npsScore === null ? "bg-slate-500/10 text-slate-400" :
            stats.npsScore >= 75 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
          )}>
            <Star className="w-5 h-5" fill="currentColor" />
          </div>
        </div>

        {/* Feedback NPS Stats */}
        <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm flex flex-col justify-center gap-1 text-[11px] font-semibold">
          <div className="flex items-center justify-between text-emerald-500">
            <span>Promotores (9-10)</span>
            <span>{stats.promotersPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${stats.promotersPct}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${stats.detractorsPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-rose-500">
            <span>Detratores (0-6)</span>
            <span>{stats.detractorsPct}%</span>
          </div>
        </div>

      </div>

      {/* ── KANBAN BOARD ── */}
      <div className="flex-1 overflow-x-auto min-h-0 flex gap-4 pr-1 pb-4 select-none custom-scrollbar">
        {COLUMNS.map(col => {
          const colCards = cards.filter(c => c.column_id === col.id);
          const isOver = draggedOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={cn(
                "flex-1 min-w-[280px] flex flex-col rounded-2xl border transition-all duration-200",
                col.bgClass,
                col.borderClass,
                isOver && "ring-2 ring-primary/20 scale-[0.99] border-primary/40"
              )}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-border/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", col.textClass, "bg-current")} />
                  <h3 className="font-bold text-sm text-foreground uppercase tracking-tight">{col.title}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-secondary/80 border border-border/50 text-[10px] font-black text-muted-foreground uppercase">
                  {colCards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar min-h-[150px]">
                {loading ? (
                  Array.from({ length: 2 }).map((_, idx) => (
                    <div key={idx} className="bg-card border border-border/50 p-4 rounded-xl animate-pulse relative h-[145px] shrink-0" />
                  ))
                ) : colCards.length > 0 ? (
                  colCards.map(card => {
                    const expired = isOverdue(card.due_date, card.column_id);
                    const npsInfo = getNpsBadge(card.nps_score);
                    const responsibleUser = usersList.find(u => u.id === card.vendedor_id);
                    const cleanPhone = card.remote_jid.split('@')[0];
                    const isExpanded = expandedCards[card.id] || false;

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const relativeY = e.clientY - rect.top;
                          const isBottom = relativeY > rect.height / 2;
                          setDraggedOverCardId(card.id);
                          setDraggedOverCardPart(isBottom ? "bottom" : "top");
                        }}
                        onDragLeave={() => {
                          setDraggedOverCardId(null);
                          setDraggedOverCardPart(null);
                        }}
                        onDrop={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const relativeY = e.clientY - rect.top;
                          const isBottom = relativeY > rect.height / 2;
                          setDraggedOverCardId(null);
                          setDraggedOverCardPart(null);
                          handleCardDrop(e, card.id, isBottom ? "bottom" : "top");
                        }}
                        className={cn(
                          "bg-card hover:shadow-md border border-border hover:border-border/80 transition-all duration-150 hover:-translate-y-0.5 rounded-xl p-4 flex flex-col gap-3 justify-between cursor-grab active:cursor-grabbing relative overflow-hidden group shrink-0",
                          isExpanded ? "min-h-[155px] h-auto" : "h-[155px] max-h-[155px]",
                          draggedOverCardId === card.id && draggedOverCardPart === "top" && "border-t-primary border-t-2 scale-[1.01] shadow-md",
                          draggedOverCardId === card.id && draggedOverCardPart === "bottom" && "border-b-primary border-b-2 scale-[1.01] shadow-md"
                        )}
                      >
                        {/* Tags / NPS & Due Date */}
                        <div className="flex items-start justify-between gap-2 mb-0.5 shrink-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn("px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-1", npsInfo.color)}>
                              {npsInfo.icon}
                              {npsInfo.label}
                            </span>

                            {card.due_date ? (
                              <span className={cn("px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0", 
                                expired ? "text-red-500 bg-red-500/5 border-red-500/10 animate-pulse" : "bg-secondary/80 text-muted-foreground/80 border-border/50"
                              )}>
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{formatDate(card.due_date)}</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full border border-border/50 bg-secondary/80 text-muted-foreground/80 text-[9px] font-black uppercase tracking-wider shrink-0">
                                {cleanPhone}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedCard(card); setIsCardModalOpen(true); }}
                              className="p-1 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}
                              className="p-1 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="flex-1 flex flex-col gap-1.5">
                          {/* Title */}
                          <h4 className="text-xs font-bold text-foreground leading-snug break-words line-clamp-1" title={card.cliente_nome}>
                            {card.cliente_nome}
                          </h4>

                          {/* Produtos */}
                          {card.produtos && (
                            <p className="text-[10px] text-primary font-black uppercase tracking-wider line-clamp-1">
                              {card.produtos}
                            </p>
                          )}

                          {/* Notes snippet */}
                          {card.notes && (
                            <p 
                              onClick={(e) => { e.stopPropagation(); toggleCardExpanded(card.id); }}
                              className={`text-[11px] text-muted-foreground/85 leading-relaxed break-words whitespace-pre-line font-medium hover:text-primary cursor-pointer transition-colors ${
                                isExpanded ? "line-clamp-6" : "line-clamp-1"
                              }`}
                              title={isExpanded ? "Clique para recolher as anotações" : "Clique para ver as anotações completas"}
                            >
                              {card.notes}
                            </p>
                          )}
                        </div>

                        {/* Bottom Bar */}
                        <div className="pt-2 border-t border-border/30 flex items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground mt-auto shrink-0">
                          
                          {/* Quick Message Button */}
                          <button
                            onClick={() => handleOpenChat(card.remote_jid)}
                            className="p-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-lg transition-all border border-primary/20 shrink-0"
                            title="Ver Conversa no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* Responsible Seller */}
                          {responsibleUser && (
                            <div 
                              className="flex items-center gap-1.5 bg-secondary/50 pl-1.5 pr-2 py-0.5 rounded-lg border border-border/30 shrink-0"
                              title={responsibleUser.name || "Responsável"}
                            >
                              {responsibleUser.avatar ? (
                                <img 
                                  src={responsibleUser.avatar} 
                                  alt={responsibleUser.name} 
                                  className="w-4.5 h-4.5 rounded-full object-cover shrink-0 border border-border/40" 
                                />
                              ) : (
                                <User className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                              )}
                              <span className="truncate max-w-[50px] text-[9.5px] uppercase tracking-wider text-muted-foreground/85 font-bold">
                                {responsibleUser.name.split(" ")[0]}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/30 rounded-xl min-h-[120px] text-center opacity-30">
                    <Plus className="w-6 h-6 text-muted-foreground mb-1" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Coluna Vazia</span>
                  </div>
                )}
              </div>

              {/* Column Footer */}
              <div className="p-3 border-t border-border/40 shrink-0">
                <button
                  onClick={() => openNewCard(col.id)}
                  className="w-full py-2 bg-secondary/20 hover:bg-secondary/60 text-muted-foreground hover:text-foreground font-bold text-xs rounded-xl border border-dashed border-border/60 hover:border-border transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Pós-Venda
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── CARD EDIT/NEW MODAL ── */}
      <AnimatePresence>
        {isCardModalOpen && selectedCard && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsCardModalOpen(false); setSelectedCard(null); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-primary" fill="currentColor" />
                    <h3 className="text-lg font-black uppercase tracking-tighter">
                      {selectedCard.id ? "Editar Pós-Venda" : "Novo Acompanhamento"}
                    </h3>
                  </div>
                  <button
                    onClick={() => { setIsCardModalOpen(false); setSelectedCard(null); }}
                    className="p-1.5 hover:bg-secondary rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-hide">
                  
                  {/* Cliente Nome */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome do Cliente *</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: João da Silva"
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                      value={selectedCard.cliente_nome || ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, cliente_nome: e.target.value })}
                    />
                  </div>

                  {/* Telefone WhatsApp */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">WhatsApp/Telefone *</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: 5511999998888"
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                      value={selectedCard.remote_jid ? selectedCard.remote_jid.replace("@s.whatsapp.net", "") : ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, remote_jid: e.target.value })}
                    />
                  </div>

                  {/* Produtos / Materiais */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Produtos / Materiais</label>
                    <input
                      type="text"
                      placeholder="Ex: Tubos Tigre, Disjuntores, Fios Sil..."
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                      value={selectedCard.produtos || ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, produtos: e.target.value })}
                    />
                  </div>

                  {/* NPS Nota */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Satisfação NPS (Nota 0 a 10)</label>
                    <div className="flex gap-1 justify-between bg-secondary p-1.5 rounded-xl border border-border">
                      {Array.from({ length: 11 }).map((_, idx) => {
                        const isSelected = selectedCard.nps_score === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedCard({ ...selectedCard, nps_score: idx })}
                            className={cn(
                              "w-8 h-8 rounded-lg text-xs font-black transition-all flex items-center justify-center hover:bg-primary/20",
                              isSelected ? "bg-primary text-white scale-110 shadow-md shadow-primary/20" : "text-muted-foreground"
                            )}
                          >
                            {idx}
                          </button>
                        );
                      })}
                      {selectedCard.nps_score !== undefined && selectedCard.nps_score !== null && (
                        <button
                          type="button"
                          onClick={() => setSelectedCard({ ...selectedCard, nps_score: null })}
                          className="px-2 text-xs text-rose-500 hover:bg-rose-500/10 rounded-lg"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* NPS Feedback */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Comentário NPS / Críticas / Elogios</label>
                    <textarea
                      rows={2}
                      placeholder="Relato de satisfação do cliente..."
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                      value={selectedCard.nps_feedback || ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, nps_feedback: e.target.value })}
                    />
                  </div>

                  {/* Responsável Vendedor */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vendedor Responsável</label>
                    <select
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                      value={selectedCard.vendedor_id || ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, vendedor_id: e.target.value || undefined })}
                    >
                      <option value="">Selecione o vendedor...</option>
                      {usersList.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Prazo */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prazo do Próximo Contato</label>
                    <input
                      type="date"
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      value={selectedCard.due_date ? selectedCard.due_date.split("T")[0] : ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, due_date: e.target.value || null })}
                    />
                  </div>

                  {/* Anotações Gerais */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Anotações Internas</label>
                    <textarea
                      rows={2}
                      placeholder="Informações sobre garantia, documentação, ou data de entrega..."
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                      value={selectedCard.notes || ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, notes: e.target.value })}
                    />
                  </div>

                </div>

                {/* Ações */}
                <div className="mt-6 flex gap-3">
                  {selectedCard.id && (
                    <button
                      type="button"
                      onClick={() => deleteCard(selectedCard.id!)}
                      className="px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-xs rounded-2xl border border-red-500/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setIsCardModalOpen(false); setSelectedCard(null); }}
                    className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs rounded-2xl border border-border transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => saveCard(selectedCard)}
                    disabled={saving || !selectedCard.cliente_nome?.trim() || !selectedCard.remote_jid?.trim()}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-black text-xs rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.3); }
        select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
          background-position: right 1rem center;
          background-repeat: no-repeat;
          background-size: 1.25em;
        }
      `}</style>

    </div>
  );
}
