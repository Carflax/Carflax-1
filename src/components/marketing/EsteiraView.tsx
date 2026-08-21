import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Calendar,
  Tag,
  User,
  Check,
  X,
  Eye,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Users,
  Lock,
  Repeat,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface KanbanCard {
  id: string;
  title: string;
  description: string;
  column_id: "A FAZER" | "FAZENDO" | "CONCLUIDOS";
  order_index: number;
  tag_name?: string;
  tag_color?: string;
  due_date?: string;
  owner_id: string | null;
  created_by: string | null;
  created_at?: string;
  // Recorrente: ao ser concluído, volta sozinho para "A FAZER" no dia seguinte.
  recurring?: boolean;
  completed_at?: string | null;
}

interface UserProfile {
  id?: string;
  name: string;
  role: string;
  department?: string;
  is_admin?: boolean;
}

interface EsteiraUser {
  id: string;
  name: string;
  avatar?: string;
  department: string | null;
}

interface EsteiraViewProps {
  userProfile?: UserProfile | null;
  // Quando presente, mostra o quadro de equipe do subquadro (agrega os cards
  // de todo mundo que faz parte dele), em vez da esteira pessoal.
  subquadroId?: string;
}

const COLUMNS: {
  id: KanbanCard["column_id"];
  title: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}[] = [
  {
    id: "A FAZER",
    title: "A Fazer",
    bgClass: "bg-sky-500/5 dark:bg-sky-500/10",
    borderClass: "border-sky-500/20",
    textClass: "text-sky-500",
  },
  {
    id: "FAZENDO",
    title: "Fazendo",
    bgClass: "bg-amber-500/5 dark:bg-amber-500/10",
    borderClass: "border-amber-500/20",
    textClass: "text-amber-500",
  },
  {
    id: "CONCLUIDOS",
    title: "Concluídos",
    bgClass: "bg-emerald-500/5 dark:bg-emerald-500/10",
    borderClass: "border-emerald-500/20",
    textClass: "text-emerald-500",
  },
];

const TAG_OPTIONS = [
  {
    name: "Baixa",
    color:
      "bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20",
  },
  {
    name: "Média",
    color:
      "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
  },
  {
    name: "Alta",
    color:
      "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20",
  },
  {
    name: "Urgente",
    color: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
  },
];

const SEM_SETOR = "Sem setor";

const toTitleCase = (name?: string | null) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getCleanDescriptionText = (description?: string) => {
  if (!description) return "";
  return description
    .split("\n")
    .filter((line) => !line.match(/^\s*[-*•]?\s*\[([ xX])\]\s*(.*)$/))
    .join("\n");
};

const updateDescriptionText = (description: string, newCleanText: string): string => {
  const lines = description.split("\n");
  const subtaskLines = lines.filter((line) => line.match(/^\s*[-*•]?\s*\[([ xX])\]\s*(.*)$/));
  if (newCleanText === "") {
    return subtaskLines.join("\n");
  }
  if (subtaskLines.length === 0) {
    return newCleanText;
  }
  return `${newCleanText}\n${subtaskLines.join("\n")}`;
};

// Desmarca todos os subtasks de uma descrição ([x] -> [ ]). Usado ao reciclar um
// card recorrente concluído, para a rotina recomeçar do zero no dia seguinte.
const uncheckAllSubtasks = (description = "") =>
  description
    .split("\n")
    .map((line) => line.replace(/^(\s*[-*•]?\s*)\[[xX]\]/, "$1[ ]"))
    .join("\n");

// Patch de conclusão ao mover um card entre colunas: carimba/limpa completed_at
// apenas quando a coluna realmente muda (base da recorrência do dia seguinte).
const completionPatch = (
  fromCol?: KanbanCard["column_id"],
  toCol?: KanbanCard["column_id"],
): { completed_at?: string | null } => {
  if (fromCol === toCol) return {};
  if (toCol === "CONCLUIDOS") return { completed_at: new Date().toISOString() };
  if (fromCol === "CONCLUIDOS") return { completed_at: null };
  return {};
};

interface Subtask {
  index: number;
  text: string;
  completed: boolean;
}

const getChecklistStats = (description?: string) => {
  if (!description) return { total: 0, completed: 0 };
  const lines = description.split("\n");
  let total = 0;
  let completed = 0;
  lines.forEach((line) => {
    const match = line.match(/^\s*[-*•]?\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      total++;
      if (match[1].toLowerCase() === "x") {
        completed++;
      }
    }
  });
  return { total, completed };
};

const parseSubtasks = (description?: string): Subtask[] => {
  if (!description) return [];
  const lines = description.split("\n");
  const subtasks: Subtask[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/^\s*[-*•]?\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      subtasks.push({
        index,
        text: match[2].trim(),
        completed: match[1].toLowerCase() === "x",
      });
    }
  });
  return subtasks;
};

const toggleSubtaskInDescription = (
  description: string,
  lineIndex: number,
): string => {
  const lines = description.split("\n");
  const line = lines[lineIndex];
  if (line !== undefined) {
    const match = line.match(/^(\s*[-*•]?\s*\[)([ xX])(\]\s*.*)$/);
    if (match) {
      const newChar = match[2].toLowerCase() === "x" ? " " : "x";
      lines[lineIndex] = `${match[1]}${newChar}${match[3]}`;
    }
  }
  return lines.join("\n");
};

const addSubtaskToDescription = (description: string, text: string): string => {
  const newline = `- [ ] ${text.trim()}`;
  if (!description || description.trim() === "") {
    return newline;
  }
  return `${description.trimEnd()}\n${newline}`;
};

const deleteSubtaskFromDescription = (
  description: string,
  lineIndex: number,
): string => {
  const lines = description.split("\n");
  lines.splice(lineIndex, 1);
  return lines.join("\n");
};

export function EsteiraView({ userProfile, subquadroId }: EsteiraViewProps) {
  const isSubquadroView = !!subquadroId;
  const [subquadro, setSubquadro] = useState<{ id: string; name: string } | null>(null);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [usersList, setUsersList] = useState<EsteiraUser[]>([]);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(
    {},
  );

  const toggleCardExpanded = (cardId: string) => {
    setExpandedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(
    null,
  );

  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Partial<KanbanCard> | null>(
    null,
  );
  const [responsibleSearch, setResponsibleSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);

  const [draggedOverCardId, setDraggedOverCardId] = useState<string | null>(
    null,
  );
  const [draggedOverCardPart, setDraggedOverCardPart] = useState<
    "top" | "bottom" | null
  >(null);
  const [newSubtaskText, setNewSubtaskText] = useState("");

  const role = userProfile?.role?.toUpperCase() || "";
  const isManager = role === "ADMIN" || role.includes("GERENTE");
  const [isCreateSubquadroOpen, setIsCreateSubquadroOpen] = useState(false);
  const [isAddPeopleOpen, setIsAddPeopleOpen] = useState(false);

  // Esteira sendo exibida no momento — a própria, por padrão. Gerente/admin
  // pode trocar via seletor para acompanhar a esteira de outra pessoa.
  const [boardOwnerId, setBoardOwnerId] = useState<string>(userProfile?.id || "");

  // Usuários (exceto eu) agrupados por setor, pra organizar o seletor de esteira.
  const usersByDepartment = useMemo(() => {
    const groups = new Map<string, EsteiraUser[]>();
    usersList
      .filter((u) => u.id !== userProfile?.id)
      .forEach((u) => {
        const dept = u.department?.trim() || SEM_SETOR;
        if (!groups.has(dept)) groups.set(dept, []);
        groups.get(dept)!.push(u);
      });
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === SEM_SETOR) return 1;
      if (b === SEM_SETOR) return -1;
      return a.localeCompare(b);
    });
  }, [usersList, userProfile?.id]);

  // Membros do subquadro atual (quando estamos numa visão de equipe).
  const subquadroMembers = useMemo(() => {
    if (!subquadro) return [];
    return usersList.filter((u) => u.department?.trim() === subquadro.name);
  }, [usersList, subquadro]);

  const isAllowedToViewSubquadro = useMemo(() => {
    if (!isSubquadroView || !subquadro || !userProfile) return true;
    const roleUpper = userProfile.role?.toUpperCase() || "";
    const isManagerOrAdmin = userProfile.is_admin || roleUpper === "ADMIN" || roleUpper.includes("GERENTE") || roleUpper.includes("DIRETOR");
    if (isManagerOrAdmin) return true;

    const userDept = userProfile.department?.trim().toLowerCase();
    return !!userDept && subquadro.name.trim().toLowerCase() === userDept;
  }, [isSubquadroView, subquadro, userProfile]);

  useEffect(() => {
    if (!subquadroId) {
      setSubquadro(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("esteira_subquadros")
      .select("id, name")
      .eq("id", subquadroId)
      .single()
      .then(({ data, error }) => {
        if (!cancelled && !error) setSubquadro(data);
      });
    return () => {
      cancelled = true;
    };
  }, [subquadroId]);

  useEffect(() => {
    if (!isSubquadroView && userProfile?.id && !boardOwnerId) setBoardOwnerId(userProfile.id);
  }, [userProfile?.id, boardOwnerId, isSubquadroView]);

  useEffect(() => {
    if (!isCardModalOpen || !selectedCard) {
      setResponsibleSearch("");
      return;
    }
    const owner = usersList.find((u) => u.id === selectedCard.owner_id);
    setResponsibleSearch(owner ? toTitleCase(owner.name) : "");
    // Sincroniza o nome apenas ao abrir o modal / carregar usuários — não a cada
    // tecla digitada, senão o texto do usuário seria apagado a cada caractere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardModalOpen, usersList]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, name, avatar, department")
        .eq("status", "ativo")
        .order("name");

      if (error) throw error;
      setUsersList(data || []);
    } catch (err) {
      console.error("[EsteiraView] Erro ao carregar usuários do hub:", err);
      try {
        const { data } = await supabase
          .from("usuarios")
          .select("id, name, avatar, department")
          .order("name");
        setUsersList(data || []);
      } catch (fallbackErr) {
        console.error(
          "[EsteiraView] Falha no fallback de usuários:",
          fallbackErr,
        );
      }
    }
  }, []);

  // Notifica uma pessoa sobre um evento da Esteira (silencioso — não trava o fluxo se falhar).
  const notifyEsteira = useCallback(
    async (
      destino: string,
      cardId: string,
      cardTitle: string,
      type: "assigned" | "completed",
    ) => {
      if (!userProfile?.id || destino === userProfile.id) return; // nunca notifica a si mesmo
      try {
        await supabase.from("esteira_notificacoes").insert([
          {
            destino,
            actor_id: userProfile.id,
            card_id: cardId,
            card_title: cardTitle,
            type,
          },
        ]);
      } catch (err) {
        console.error("[EsteiraView] Erro ao criar notificação:", err);
      }
    },
    [userProfile?.id]
  );

  // Recicla cards recorrentes concluídos: se um card marcado como recorrente foi
  // concluído num dia anterior, no dia seguinte ele volta para "A FAZER" com os
  // subtasks desmarcados. Roda a cada carregamento do quadro.
  const resetRecurringCompleted = useCallback(
    async (currentCards: KanbanCard[]) => {
      const hojeStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const paraReciclar = currentCards.filter(
        (c) =>
          c.recurring &&
          c.column_id === "CONCLUIDOS" &&
          !!c.completed_at &&
          c.completed_at.split("T")[0] < hojeStr,
      );
      if (paraReciclar.length === 0) return;

      const ids = new Set(paraReciclar.map((c) => c.id));
      setCards((prev) =>
        prev.map((c) =>
          ids.has(c.id)
            ? {
                ...c,
                column_id: "A FAZER",
                completed_at: null,
                order_index: 0,
                description: uncheckAllSubtasks(c.description),
              }
            : c,
        ),
      );

      for (const c of paraReciclar) {
        try {
          await supabase
            .from("marketing_esteira")
            .update({
              column_id: "A FAZER",
              completed_at: null,
              order_index: 0,
              description: uncheckAllSubtasks(c.description),
            })
            .eq("id", c.id);
        } catch (e) {
          console.warn("[EsteiraView] Falha ao reciclar card recorrente:", e);
        }
      }
    },
    [],
  );

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      if (isSubquadroView) {
        const memberIds = subquadroMembers.map((u) => u.id);
        if (memberIds.length === 0) {
          setCards([]);
          return;
        }
        const { data, error } = await supabase
          .from("marketing_esteira")
          .select("*")
          .in("owner_id", memberIds)
          .order("order_index", { ascending: true });
        if (error) throw error;
        const memberSet = new Set(memberIds);
        const filtered = (data || []).filter((c) => !c.created_by || memberSet.has(c.created_by));
        setCards(filtered);
        resetRecurringCompleted(filtered);
        return;
      }

      const { data, error } = await supabase
        .from("marketing_esteira")
        .select("*")
        .or(`owner_id.eq.${boardOwnerId},created_by.eq.${boardOwnerId}`)
        .order("order_index", { ascending: true });

      if (error) throw error;
      const loaded = data || [];
      setCards(loaded);
      resetRecurringCompleted(loaded);
    } catch (err) {
      console.error("[EsteiraView] Erro ao carregar cards:", err);
    } finally {
      setLoading(false);
    }
  }, [boardOwnerId, isSubquadroView, subquadroMembers, resetRecurringCompleted]);

  // ── Load cards and users ──────────────────────────────────────────────────
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (isSubquadroView) {
      if (subquadro) loadCards();
    } else if (boardOwnerId) {
      loadCards();
    }
  }, [boardOwnerId, loadCards, isSubquadroView, subquadro]);

  useEffect(() => {
    if (!isCardModalOpen) {
      setNewSubtaskText("");
    }
  }, [isCardModalOpen]);

  // Um card pertence à vista atual se: no modo subquadro, o responsável for
  // membro do subquadro; no modo pessoal, se eu for o responsável ou o criador.
  const belongsToCurrentView = (ownerId: string | null, createdBy: string | null) => {
    if (isSubquadroView) {
      // Dono E criador precisam ser do subquadro — delegação vinda de fora fica só
      // nos quadros pessoais, não vaza para o quadro de equipe.
      return (
        !!ownerId &&
        subquadroMembers.some((m) => m.id === ownerId) &&
        (!createdBy || subquadroMembers.some((m) => m.id === createdBy))
      );
    }
    return ownerId === boardOwnerId || createdBy === boardOwnerId;
  };

  // ── Save (Insert or Update) ───────────────────────────────────────────────
  const saveCard = async (cardData: Partial<KanbanCard>) => {
    if (!cardData.title?.trim() || !cardData.owner_id) return;
    setSaving(true);

    try {
      if (!cardData.id) {
        // INSERT
        const insertCol = cardData.column_id || "A FAZER";
        const payload = {
          title: cardData.title.trim(),
          description: cardData.description?.trim() || "",
          column_id: insertCol,
          order_index: cards.filter((c) => c.column_id === insertCol).length,
          tag_name: cardData.tag_name || null,
          tag_color: cardData.tag_color || null,
          due_date: cardData.due_date || null,
          owner_id: cardData.owner_id,
          created_by: userProfile?.id || null,
          recurring: cardData.recurring ?? false,
          completed_at: insertCol === "CONCLUIDOS" ? new Date().toISOString() : null,
        };

        const { data, error } = await supabase
          .from("marketing_esteira")
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        if (data && belongsToCurrentView(data.owner_id, data.created_by)) {
          setCards((prev) => [...prev, data]);
        }
        if (data) notifyEsteira(payload.owner_id, data.id, payload.title, "assigned");
      } else {
        // UPDATE
        const origCard = cards.find((c) => c.id === cardData.id);
        const payload = {
          title: cardData.title.trim(),
          description: cardData.description?.trim() || "",
          column_id: cardData.column_id,
          tag_name: cardData.tag_name || null,
          tag_color: cardData.tag_color || null,
          due_date: cardData.due_date || null,
          owner_id: cardData.owner_id,
          recurring: cardData.recurring ?? false,
          ...completionPatch(origCard?.column_id, cardData.column_id),
        };

        const { error } = await supabase
          .from("marketing_esteira")
          .update(payload)
          .eq("id", cardData.id);

        if (error) throw error;

        // Reatribuído pra outra pessoa: avisa a nova responsável.
        if (origCard && origCard.owner_id !== payload.owner_id) {
          notifyEsteira(payload.owner_id, cardData.id!, payload.title, "assigned");
        }
        // Movido pra Concluídos agora: avisa quem criou o card.
        if (
          origCard &&
          origCard.column_id !== "CONCLUIDOS" &&
          payload.column_id === "CONCLUIDOS" &&
          origCard.created_by
        ) {
          notifyEsteira(origCard.created_by, cardData.id!, payload.title, "completed");
        }

        const stillVisible = belongsToCurrentView(
          payload.owner_id,
          cardData.created_by ?? null,
        );

        if (stillVisible) {
          setCards((prev) =>
            prev.map((c) =>
              c.id === cardData.id ? ({ ...c, ...payload } as KanbanCard) : c,
            ),
          );
        } else {
          // Reatribuído pra fora da vista atual: some da lista.
          setCards((prev) => prev.filter((c) => c.id !== cardData.id));
        }
      }
    } catch (err) {
      console.error("[EsteiraView] Erro ao salvar card:", err);
    } finally {
      setSaving(false);
      setIsCardModalOpen(false);
      setSelectedCard(null);
    }
  };

  const handleToggleSubtaskInViewMode = async (
    cardId: string,
    lineIndex: number,
  ) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const newDescription = toggleSubtaskInDescription(
      card.description || "",
      lineIndex,
    );

    // Update local state first (optimistic update)
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, description: newDescription } : c,
      ),
    );
    if (selectedCard && selectedCard.id === cardId) {
      setSelectedCard((prev) => ({ ...prev, description: newDescription }));
    }

    try {
      const { error } = await supabase
        .from("marketing_esteira")
        .update({ description: newDescription })
        .eq("id", cardId);

      if (error) throw error;
    } catch (err) {
      console.error(
        "[EsteiraView] Erro ao salvar alteração da sub-tarefa:",
        err,
      );
      loadCards();
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const canManageCard = (card: KanbanCard) =>
    isManager ||
    card.created_by === userProfile?.id ||
    card.owner_id === userProfile?.id;

  const deleteCard = async (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    if (!canManageCard(card)) {
      alert("Você não tem permissão para excluir esta tarefa.");
      return;
    }

    if (!confirm("Deseja realmente excluir este card?")) return;

    try {
      const { error } = await supabase
        .from("marketing_esteira")
        .delete()
        .eq("id", cardId);

      if (error) throw error;
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (err) {
      console.error("[EsteiraView] Erro ao excluir card:", err);
    }

    if (selectedCard?.id === cardId) {
      setIsCardModalOpen(false);
      setSelectedCard(null);
    }
  };

  // ── Drag and Drop ─────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (
    e: React.DragEvent,
    columnId: KanbanCard["column_id"],
  ) => {
    e.preventDefault();
    setDraggedOverColumn(columnId);
  };

  const handleDragLeave = () => setDraggedOverColumn(null);

  const handleDrop = async (
    e: React.DragEvent,
    targetColumnId: KanbanCard["column_id"],
  ) => {
    e.preventDefault();
    setDraggedOverColumn(null);
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;

    const targetCard = cards.find((c) => c.id === cardId);
    if (!targetCard || targetCard.column_id === targetColumnId) return;

    const sourceColumnId = targetCard.column_id;
    const newOrderIndex = cards.filter(
      (x) => x.column_id === targetColumnId,
    ).length;

    // Move card to target column at the end
    const movedCard = {
      ...targetCard,
      column_id: targetColumnId,
      order_index: newOrderIndex,
      ...completionPatch(targetCard.column_id, targetColumnId),
    };

    // Re-index source column
    const sourceColCards = cards
      .filter((c) => c.column_id === sourceColumnId && c.id !== cardId)
      .sort((a, b) => a.order_index - b.order_index);

    const reindexedSourceCards = sourceColCards.map((c, idx) => ({
      ...c,
      order_index: idx,
    }));

    const updatedCardsMap = new Map<string, KanbanCard>();
    reindexedSourceCards.forEach((c) => updatedCardsMap.set(c.id, c));

    const newCards = cards.map((c) => {
      if (c.id === cardId) return movedCard;
      return updatedCardsMap.get(c.id) || c;
    });

    newCards.sort((a, b) => a.order_index - b.order_index);
    setCards(newCards);

    if (targetCard.column_id !== "CONCLUIDOS" && targetColumnId === "CONCLUIDOS" && targetCard.created_by) {
      notifyEsteira(targetCard.created_by, targetCard.id, targetCard.title, "completed");
    }

    try {
      const changedCards = newCards.filter((c) => {
        const orig = cards.find((oc) => oc.id === c.id);
        return (
          !orig ||
          orig.column_id !== c.column_id ||
          orig.order_index !== c.order_index
        );
      });

      for (const card of changedCards) {
        const orig = cards.find((oc) => oc.id === card.id);
        await supabase
          .from("marketing_esteira")
          .update({
            column_id: card.column_id,
            order_index: card.order_index,
            ...completionPatch(orig?.column_id, card.column_id),
          })
          .eq("id", card.id);
      }
    } catch (err) {
      console.error("[EsteiraView] Erro ao mover card:", err);
      loadCards();
    }
  };

  const handleCardDrop = async (
    e: React.DragEvent,
    targetCardId: string,
    position: "top" | "bottom",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverColumn(null);
    setDraggedOverCardId(null);
    setDraggedOverCardPart(null);

    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId || cardId === targetCardId) return;

    const draggedCard = cards.find((c) => c.id === cardId);
    const targetCard = cards.find((c) => c.id === targetCardId);
    if (!draggedCard || !targetCard) return;

    const targetColumnId = targetCard.column_id;
    const sourceColumnId = draggedCard.column_id;

    // Get all other cards in the target column
    const targetColCards = cards
      .filter((c) => c.column_id === targetColumnId && c.id !== cardId)
      .sort((a, b) => a.order_index - b.order_index);

    const targetCardIndex = targetColCards.findIndex(
      (c) => c.id === targetCardId,
    );

    // Determine the exact insertion index based on whether we dropped on the top or bottom half
    const targetIndex =
      position === "bottom" ? targetCardIndex + 1 : targetCardIndex;

    // Insert the dragged card
    const movedCard = {
      ...draggedCard,
      column_id: targetColumnId,
      order_index: targetIndex,
    };
    targetColCards.splice(targetIndex, 0, movedCard);

    // Re-index target column
    const reindexedTargetCards = targetColCards.map((c, idx) => ({
      ...c,
      order_index: idx,
    }));

    // Re-index source column if it's different
    let reindexedSourceCards: KanbanCard[] = [];
    if (sourceColumnId !== targetColumnId) {
      const sourceColCards = cards
        .filter((c) => c.column_id === sourceColumnId && c.id !== cardId)
        .sort((a, b) => a.order_index - b.order_index);

      reindexedSourceCards = sourceColCards.map((c, idx) => ({
        ...c,
        order_index: idx,
      }));
    }

    // Combine updates
    const updatedCardsMap = new Map<string, KanbanCard>();
    reindexedTargetCards.forEach((c) => updatedCardsMap.set(c.id, c));
    reindexedSourceCards.forEach((c) => updatedCardsMap.set(c.id, c));

    const newCards = cards.map((c) => {
      if (c.id === cardId) {
        return {
          ...draggedCard,
          column_id: targetColumnId,
          order_index: targetIndex,
          ...completionPatch(draggedCard.column_id, targetColumnId),
        };
      }
      return updatedCardsMap.get(c.id) || c;
    });

    newCards.sort((a, b) => a.order_index - b.order_index);
    setCards(newCards);

    if (draggedCard.column_id !== "CONCLUIDOS" && targetColumnId === "CONCLUIDOS" && draggedCard.created_by) {
      notifyEsteira(draggedCard.created_by, draggedCard.id, draggedCard.title, "completed");
    }

    try {
      const changedCards = newCards.filter((c) => {
        const orig = cards.find((oc) => oc.id === c.id);
        return (
          !orig ||
          orig.column_id !== c.column_id ||
          orig.order_index !== c.order_index
        );
      });

      for (const card of changedCards) {
        const orig = cards.find((oc) => oc.id === card.id);
        await supabase
          .from("marketing_esteira")
          .update({
            column_id: card.column_id,
            order_index: card.order_index,
            ...completionPatch(orig?.column_id, card.column_id),
          })
          .eq("id", card.id);
      }
    } catch (err) {
      console.error("[EsteiraView] Erro ao reordenar card:", err);
      loadCards();
    }
  };

  const isOverdue = (dateStr?: string, columnId?: KanbanCard["column_id"]) => {
    if (!dateStr || columnId === "CONCLUIDOS") return false;
    const due = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("T")[0].split("-");
    return `${day}/${month}/${year}`;
  };

  const openNewCard = (columnId: KanbanCard["column_id"] = "A FAZER") => {
    setSelectedCard({
      column_id: columnId,
      owner_id: boardOwnerId || userProfile?.id || null,
    });
    setIsViewOnly(false);
    setIsCardModalOpen(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isSubquadroView && subquadro && !isAllowedToViewSubquadro) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background text-foreground text-center">
        <div className="max-w-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-base font-black uppercase tracking-tight text-foreground">
            Acesso Restrito
          </h2>
          <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
            Você não faz parte do subquadro "{subquadro.name}". Apenas membros deste departamento podem acessar esta área.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground p-6 overflow-hidden relative font-sans">
      {/* Seletor de esteira — só para gerente/admin acompanhar a equipe */}
      {!isSubquadroView && isManager && (
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Esteira de
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBoardDropdown((v) => !v)}
              onBlur={() => setTimeout(() => setShowBoardDropdown(false), 150)}
              className="flex items-center gap-2 bg-secondary border border-border rounded-xl pl-2 pr-3 py-1.5 min-w-[190px] text-sm font-semibold hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            >
              {(() => {
                const isMe = boardOwnerId === userProfile?.id;
                const current = usersList.find((u) => u.id === boardOwnerId);
                return (
                  <>
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border border-border/40">
                      {!isMe && current?.avatar ? (
                        <img src={current.avatar} alt={current.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <span className="truncate flex-1 text-left">
                      {isMe ? "Minha esteira" : toTitleCase(current?.name)}
                    </span>
                  </>
                );
              })()}
              <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${showBoardDropdown ? "rotate-180" : ""}`} />
            </button>

            {showBoardDropdown && (
              <div className="absolute z-50 left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-card border border-border rounded-xl shadow-xl custom-scrollbar flex flex-col py-1">
                {userProfile?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setBoardOwnerId(userProfile.id!);
                      setShowBoardDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-secondary text-sm font-semibold transition-colors flex items-center gap-2 ${
                      boardOwnerId === userProfile.id ? "text-primary" : ""
                    }`}
                  >
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Minha esteira</span>
                  </button>
                )}
                {usersByDepartment.map(([dept, people]) => (
                  <div key={dept} className="py-0.5">
                    <div className="px-3 pt-1.5 pb-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                      {dept}
                    </div>
                    {people.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setBoardOwnerId(u.id);
                          setShowBoardDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-secondary text-sm font-semibold transition-colors flex items-center gap-2 ${
                          boardOwnerId === u.id ? "text-primary" : ""
                        }`}
                      >
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.name} className="w-5 h-5 rounded-full object-cover border border-border/40 shrink-0" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{toTitleCase(u.name)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isManager && (
            <button
              type="button"
              onClick={() => setIsCreateSubquadroOpen(true)}
              className="flex items-center gap-1.5 bg-secondary border border-border rounded-xl px-3 py-1.5 text-sm font-semibold hover:border-primary/40 transition-all"
              title="Criar um novo subquadro da Esteira"
            >
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>Criar Subquadro</span>
            </button>
          )}
        </div>
      )}

      {/* Cabeçalho do subquadro — quadro de equipe */}
      {isSubquadroView && (
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground uppercase tracking-tight leading-tight">
                {subquadro?.name || "Carregando..."}
              </h2>
              <p className="text-[10px] text-muted-foreground font-semibold">
                {subquadroMembers.length} pessoa{subquadroMembers.length !== 1 ? "s" : ""} nesse subquadro
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center -space-x-2">
              {subquadroMembers.slice(0, 6).map((u) => (
                <div
                  key={u.id}
                  title={toTitleCase(u.name)}
                  className="w-7 h-7 rounded-full bg-secondary border-2 border-background flex items-center justify-center overflow-hidden shrink-0"
                >
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              ))}
              {subquadroMembers.length > 6 && (
                <div className="w-7 h-7 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-[9px] font-black text-muted-foreground shrink-0">
                  +{subquadroMembers.length - 6}
                </div>
              )}
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => setIsAddPeopleOpen(true)}
                className="flex items-center gap-1.5 bg-secondary border border-border rounded-xl px-3 py-1.5 text-sm font-semibold hover:border-primary/40 transition-all"
              >
                <Plus className="w-4 h-4 text-muted-foreground" />
                <span>Adicionar Pessoas</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* KANBAN BOARD */}
      <div className="flex-1 overflow-x-auto min-h-0 flex gap-4 pr-1 pb-4 select-none custom-scrollbar">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.column_id === col.id);
          const isOver = draggedOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex-1 min-w-[280px] flex flex-col rounded-2xl border transition-all duration-200 ${col.bgClass} ${col.borderClass} ${
                isOver
                  ? "ring-2 ring-primary/20 scale-[0.99] border-primary/40"
                  : ""
              }`}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-border/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${col.textClass} bg-current`}
                  />
                  <h3 className="font-bold text-sm text-foreground uppercase tracking-tight">
                    {col.title}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-secondary/80 border border-border/50 text-[10px] font-black text-muted-foreground uppercase">
                  {colCards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar min-h-[150px]">
                {loading ? (
                  Array.from({ length: 2 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="bg-card border border-border/50 p-4 rounded-xl animate-pulse relative h-[145px] shrink-0"
                    >
                      <div className="space-y-3">
                        <div className="h-4 bg-secondary rounded w-3/4" />
                        <div className="h-3 bg-secondary rounded w-5/6" />
                      </div>
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center pt-2 border-t border-border/30">
                        <div className="h-5 bg-secondary rounded w-20" />
                        <div className="h-5 bg-secondary rounded-full w-5" />
                      </div>
                    </div>
                  ))
                ) : colCards.length > 0 ? (
                  colCards.map((card) => {
                    const expired = isOverdue(card.due_date, card.column_id);
                    const tagStyle =
                      TAG_OPTIONS.find((t) => t.name === card.tag_name)
                        ?.color ||
                      "bg-secondary text-muted-foreground border-border/50";
                    const stats = getChecklistStats(card.description);
                    const subtasks = parseSubtasks(card.description);
                    const visibleSubtasks = subtasks.slice(0, 5);
                    const remainingCount = subtasks.length - 5;
                    const cleanDesc = getCleanDescriptionText(card.description).trim();
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
                          handleCardDrop(
                            e,
                            card.id,
                            isBottom ? "bottom" : "top",
                          );
                        }}
                        className={`bg-card hover:shadow-md border border-border hover:border-border/80 transition-all duration-150 hover:-translate-y-0.5 rounded-xl p-3.5 flex flex-col gap-2.5 justify-between cursor-grab active:cursor-grabbing relative overflow-hidden group shrink-0 min-h-[160px] h-auto ${
                          draggedOverCardId === card.id &&
                          draggedOverCardPart === "top"
                            ? "border-t-primary border-t-2 scale-[1.01] shadow-md"
                            : draggedOverCardId === card.id &&
                                draggedOverCardPart === "bottom"
                              ? "border-b-primary border-b-2 scale-[1.01] shadow-md"
                              : ""
                        }`}
                      >
                        {/* Card top row */}
                        <div className="flex items-start justify-between gap-2 mb-0.5 shrink-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {card.tag_name ? (
                              <span
                                className={`px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${tagStyle}`}
                              >
                                {card.tag_name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/30 font-bold italic">
                                Sem tag
                              </span>
                            )}

                            {card.due_date && (
                              <span
                                className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                                  expired
                                    ? "text-red-500 bg-red-500/5 border-red-500/10 animate-pulse"
                                    : "bg-secondary/80 text-muted-foreground/80 border-border/50"
                                }`}
                              >
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{formatDate(card.due_date)}</span>
                              </span>
                            )}

                            {card.recurring && (
                              <span
                                className="px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-primary/5 text-primary border-primary/20"
                                title="Tarefa recorrente: volta para A Fazer no dia seguinte"
                              >
                                <Repeat className="w-3 h-3 shrink-0" />
                                <span>Diária</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canManageCard(card) ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCard(card);
                                    setIsViewOnly(false);
                                    setIsCardModalOpen(true);
                                  }}
                                  className="p-1 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors"
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteCard(card.id);
                                  }}
                                  className="p-1 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCard(card);
                                  setIsViewOnly(true);
                                  setIsCardModalOpen(true);
                                }}
                                className="p-1 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors"
                                title="Visualizar Detalhes"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title & Description & Checklist */}
                        <div className="flex-1 flex flex-col gap-1.5">
                          <h4
                            className="text-xs font-bold text-foreground leading-snug break-words"
                            title={card.title}
                          >
                            {card.title}
                          </h4>

                          {cleanDesc && (
                            <p 
                              onClick={(e) => { e.stopPropagation(); toggleCardExpanded(card.id); }}
                              className={`text-[11px] text-muted-foreground/85 leading-relaxed break-words whitespace-pre-line font-medium hover:text-primary cursor-pointer transition-colors ${
                                isExpanded ? "line-clamp-6" : "line-clamp-1"
                              }`}
                              title={isExpanded ? "Clique para recolher a descrição" : "Clique para ver a descrição completa"}
                            >
                              {cleanDesc}
                            </p>
                          )}

                          {isExpanded && visibleSubtasks.length > 0 && (
                            <div className="mt-1 space-y-1.5 bg-secondary/35 border border-border/30 rounded-xl p-2.5">
                              {visibleSubtasks.map((task) => (
                                <div
                                  key={task.index}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-start gap-2 py-0.5 group/subtask cursor-default"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleSubtaskInViewMode(
                                        card.id,
                                        task.index,
                                      )
                                    }
                                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center mt-0.5 transition-colors shrink-0 ${
                                      task.completed
                                        ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/35"
                                        : "bg-background border-border hover:border-muted-foreground/50 text-transparent hover:text-muted-foreground/50"
                                    }`}
                                  >
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </button>
                                  <span
                                    className={`text-[10px] leading-tight break-all select-none ${
                                      task.completed
                                        ? "line-through text-muted-foreground/50 opacity-60 font-medium"
                                        : "text-muted-foreground/95 font-semibold"
                                    }`}
                                  >
                                    {task.text}
                                  </span>
                                </div>
                              ))}
                              {remainingCount > 0 && (
                                <div className="text-[9px] text-muted-foreground/50 italic pl-5.5 mt-0.5 font-bold">
                                  + {remainingCount} sub-tarefa
                                  {remainingCount > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="pt-2 border-t border-border/30 flex items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground mt-auto shrink-0">
                          <div className="flex items-center gap-1.5 shrink-0">
                            {stats.total > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCardExpanded(card.id);
                                }}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-black transition-all shrink-0 ${
                                  stats.completed === stats.total
                                    ? "text-emerald-500 bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/15"
                                    : "text-sky-500 bg-sky-500/5 border-sky-500/10 hover:bg-sky-500/15"
                                }`}
                                title={
                                  isExpanded
                                    ? "Esconder sub-tarefas"
                                    : "Mostrar sub-tarefas"
                                }
                              >
                                <Check className="w-3 h-3 text-current" />
                                <span>
                                  {stats.completed}/{stats.total}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-current ml-0.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-current ml-0.5" />
                                )}
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {(() => {
                              const creatorUser = usersList.find(
                                (u) => u.id === card.created_by,
                              );
                              const responsibleUser = usersList.find(
                                (u) => u.id === card.owner_id,
                              );
                              const creatorDisplayName =
                                toTitleCase(creatorUser?.name) || "Marketing";
                              const responsibleDisplayName =
                                toTitleCase(responsibleUser?.name) || "Marketing";
                              const selfAssigned =
                                !!card.created_by && card.created_by === card.owner_id;

                              const ResponsibleBadge = (
                                <div
                                  className="flex items-center gap-1.5 bg-primary/10 pl-1.5 pr-2 py-0.5 rounded-lg border border-primary/20 shrink-0"
                                  title={
                                    selfAssigned
                                      ? `Criado por: ${responsibleDisplayName}`
                                      : `Responsável: ${responsibleDisplayName}`
                                  }
                                >
                                  {responsibleUser?.avatar ? (
                                    <img
                                      src={responsibleUser.avatar}
                                      alt={responsibleDisplayName}
                                      className="w-4.5 h-4.5 rounded-full object-cover border border-border/40 shrink-0"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <User className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                  )}
                                  <span className="truncate max-w-[50px] text-[9.5px] uppercase tracking-wider text-primary/95 font-black">
                                    {responsibleDisplayName.split(" ")[0]}
                                  </span>
                                </div>
                              );

                              // Criador === responsável: mostra só um avatar, sem o "X -> X" redundante.
                              if (selfAssigned) return ResponsibleBadge;

                              return (
                                <>
                                  <div
                                    className="flex items-center gap-1.5 bg-secondary/50 pl-1.5 pr-2 py-0.5 rounded-lg border border-border/30 shrink-0"
                                    title={`Criado por: ${creatorDisplayName}`}
                                  >
                                    {creatorUser?.avatar ? (
                                      <img
                                        src={creatorUser.avatar}
                                        alt={creatorDisplayName}
                                        className="w-4.5 h-4.5 rounded-full object-cover border border-border/40 shrink-0"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <User className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                    )}
                                    <span className="truncate max-w-[50px] text-[9.5px] uppercase tracking-wider text-muted-foreground/85 font-bold">
                                      {creatorDisplayName.split(" ")[0]}
                                    </span>
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0" />
                                  {ResponsibleBadge}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/30 rounded-xl min-h-[120px] text-center opacity-30">
                    <Plus className="w-6 h-6 text-muted-foreground mb-1" />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Coluna Vazia
                    </span>
                  </div>
                )}
              </div>

              {/* Column footer */}
              <div className="p-3 border-t border-border/40 shrink-0">
                <button
                  onClick={() => openNewCard(col.id)}
                  className="w-full py-2 bg-secondary/20 hover:bg-secondary/60 text-muted-foreground hover:text-foreground font-bold text-xs rounded-xl border border-dashed border-border/60 hover:border-border transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar Atividade
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* CARD MODAL */}
      <AnimatePresence>
        {isCardModalOpen && selectedCard && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsCardModalOpen(false);
                setSelectedCard(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl flex flex-col max-h-[82vh] overflow-hidden"
            >
              {/* Modal Header - Fixed */}
              <div className="p-6 pb-4 border-b border-border/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-black uppercase tracking-tighter">
                    {isViewOnly
                      ? "Detalhes da Atividade"
                      : selectedCard.id
                        ? "Editar Card"
                        : "Novo Card"}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsCardModalOpen(false);
                    setSelectedCard(null);
                  }}
                  className="p-1.5 hover:bg-secondary rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {/* Title */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Título *
                  </label>
                  <input
                    required
                    disabled={isViewOnly}
                    type="text"
                    placeholder="Ex: Criar banner de Dia dos Pais"
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold disabled:opacity-75 disabled:cursor-not-allowed"
                    value={selectedCard.title || ""}
                    onChange={(e) =>
                      setSelectedCard({
                        ...selectedCard,
                        title: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Descrição / Tarefas
                  </label>
                  {isViewOnly ? (
                    <div className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm min-h-[80px] max-h-[160px] overflow-y-auto custom-scrollbar whitespace-pre-line">
                      {getCleanDescriptionText(selectedCard.description || "").trim() || (
                        <span className="text-muted-foreground italic text-xs">
                          Nenhuma descrição informada.
                        </span>
                      )}
                    </div>
                  ) : (
                    <textarea
                      rows={3}
                      placeholder="Detalhes, links de referências ou roteiros..."
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-vertical font-semibold min-h-[80px] max-h-[300px]"
                      value={getCleanDescriptionText(selectedCard.description || "")}
                      onChange={(e) => {
                        setSelectedCard({
                          ...selectedCard,
                          description: updateDescriptionText(
                            selectedCard.description || "",
                            e.target.value
                          ),
                        });
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 300) + "px";
                      }}
                      onFocus={(e) => {
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 300) + "px";
                      }}
                    />
                  )}
                </div>

                {/* View-Only Subtasks list */}
                {isViewOnly && (() => {
                  const subtasks = parseSubtasks(selectedCard.description || "");
                  return subtasks.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                        Sub-tarefas
                      </label>
                      <div className="space-y-1.5 bg-secondary/35 border border-border/30 rounded-xl p-3 max-h-[160px] overflow-y-auto custom-scrollbar">
                        {subtasks.map((task) => (
                          <div
                            key={task.index}
                            className="flex items-center gap-2.5 py-1 border-b border-border/20 last:border-b-0"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleSubtaskInViewMode(
                                  selectedCard.id!,
                                  task.index,
                                )
                              }
                              className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 transition-colors shrink-0 ${
                                task.completed 
                                  ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/35" 
                                  : "bg-background border-border hover:border-muted-foreground/50 text-transparent hover:text-muted-foreground/50"
                              }`}
                            >
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </button>
                            <span
                              className={`text-xs select-none break-all ${task.completed ? "line-through text-muted-foreground/50 opacity-60 font-medium" : "text-foreground font-semibold"}`}
                            >
                              {task.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Visual Subtasks Builder (Only in Create/Edit Mode) */}
                {!isViewOnly && (
                  <div className="space-y-2 pt-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      Sub-tarefas
                    </label>

                    {/* Subtasks List */}
                    {(() => {
                      const subtasks = parseSubtasks(
                        selectedCard.description || "",
                      );
                      return (
                        <>
                          {subtasks.length > 0 && (
                            <div className="space-y-1.5 bg-secondary/35 border border-border/30 rounded-xl p-3 max-h-[160px] overflow-y-auto custom-scrollbar">
                              {subtasks.map((task) => (
                                <div
                                  key={task.index}
                                  className="flex items-center justify-between gap-3 py-1 border-b border-border/20 last:border-b-0 group/item"
                                >
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated =
                                          toggleSubtaskInDescription(
                                            selectedCard.description || "",
                                            task.index,
                                          );
                                        setSelectedCard({
                                          ...selectedCard,
                                          description: updated,
                                        });
                                      }}
                                      className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 transition-colors shrink-0 ${
                                        task.completed 
                                          ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/35" 
                                          : "bg-background border-border hover:border-muted-foreground/50 text-transparent hover:text-muted-foreground/50"
                                      }`}
                                    >
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </button>
                                    <span
                                      className={`text-xs select-none break-all ${task.completed ? "line-through text-muted-foreground/50 opacity-60 font-medium" : "text-foreground font-semibold"}`}
                                    >
                                      {task.text}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated =
                                        deleteSubtaskFromDescription(
                                          selectedCard.description || "",
                                          task.index,
                                        );
                                      setSelectedCard({
                                        ...selectedCard,
                                        description: updated,
                                      });
                                    }}
                                    className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                    title="Excluir sub-tarefa"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Subtask Input Form */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Adicionar sub-tarefa..."
                              className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                              value={newSubtaskText}
                              onChange={(e) =>
                                setNewSubtaskText(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (newSubtaskText.trim()) {
                                    const updated = addSubtaskToDescription(
                                      selectedCard.description || "",
                                      newSubtaskText,
                                    );
                                    setSelectedCard({
                                      ...selectedCard,
                                      description: updated,
                                    });
                                    setNewSubtaskText("");
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                  if (newSubtaskText.trim()) {
                                    const updated = addSubtaskToDescription(
                                      selectedCard.description || "",
                                      newSubtaskText,
                                    );
                                    setSelectedCard({
                                      ...selectedCard,
                                      description: updated,
                                    });
                                    setNewSubtaskText("");
                                  }
                              }}
                              disabled={!newSubtaskText.trim()}
                              className="px-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Responsável Autocomplete search dropdown */}
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Responsável
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled={isViewOnly}
                      placeholder="Pesquisar responsável..."
                      className="w-full bg-secondary border border-border rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold disabled:opacity-75 disabled:cursor-not-allowed text-foreground"
                      value={responsibleSearch}
                      onChange={(e) => {
                        setResponsibleSearch(e.target.value);
                        setShowUserDropdown(true);
                        // Texto livre não corresponde a um usuário até selecionar na lista.
                        setSelectedCard(prev => prev ? {
                          ...prev,
                          owner_id: null
                        } : null);
                      }}
                      onFocus={() => {
                        if (!isViewOnly) setShowUserDropdown(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowUserDropdown(false), 200);
                      }}
                    />
                    <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>

                  {showUserDropdown && !isViewOnly && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-card border border-border rounded-xl shadow-xl custom-scrollbar flex flex-col">
                      {usersList.filter(u => 
                        u.name.toLowerCase().includes(responsibleSearch.toLowerCase())
                      ).length > 0 ? (
                        usersList.filter(u => 
                          u.name.toLowerCase().includes(responsibleSearch.toLowerCase())
                        ).map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => {
                              setResponsibleSearch(toTitleCase(user.name));
                              setSelectedCard(prev => prev ? {
                                ...prev,
                                owner_id: user.id
                              } : null);
                              setShowUserDropdown(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-secondary text-sm font-semibold transition-colors flex items-center gap-2"
                          >
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full object-cover border border-border/40" />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span>{toTitleCase(user.name)}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-xs text-muted-foreground italic font-semibold">
                          Nenhum usuário encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Prazo */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Prazo
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      disabled={isViewOnly}
                      style={{ colorScheme: "dark" }}
                      className="w-full bg-secondary border border-border rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold disabled:opacity-75 disabled:cursor-not-allowed text-foreground"
                      value={
                        selectedCard.due_date
                          ? selectedCard.due_date.split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setSelectedCard({
                          ...selectedCard,
                          due_date: e.target.value || undefined,
                        })
                      }
                    />
                    <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Tag / Prioridade */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Prioridade
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {TAG_OPTIONS.map((opt) => {
                      const isSelected = selectedCard.tag_name === opt.name;
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          disabled={isViewOnly}
                          onClick={() => {
                            if (isViewOnly) return;
                            setSelectedCard({
                              ...selectedCard,
                              tag_name: isSelected ? "" : opt.name,
                              tag_color: isSelected ? "" : opt.color,
                            });
                          }}
                          className={`px-3 py-1 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-1.5 ${opt.color} ${
                            isSelected
                              ? "ring-2 ring-primary/40 font-black"
                              : "opacity-75"
                          } disabled:cursor-not-allowed`}
                        >
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {opt.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recorrência: card volta sozinho para "A Fazer" no dia seguinte */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Recorrência
                  </label>
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => {
                      if (isViewOnly) return;
                      setSelectedCard({
                        ...selectedCard,
                        recurring: !selectedCard.recurring,
                      });
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left disabled:cursor-not-allowed ${
                      selectedCard.recurring
                        ? "bg-primary/10 border-primary/30 ring-2 ring-primary/20"
                        : "bg-secondary border-border opacity-80 hover:opacity-100"
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        selectedCard.recurring
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Repeat className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black text-foreground">
                        Tarefa recorrente
                      </span>
                      <span className="block text-[10px] font-semibold text-muted-foreground leading-tight">
                        Ao concluir, volta para "A Fazer" no dia seguinte.
                      </span>
                    </span>
                    {selectedCard.recurring && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* Modal Actions - Fixed */}
              <div className="p-6 pt-4 border-t border-border/30 flex gap-3 shrink-0 bg-card">
                {isViewOnly ? (
                  <button
                    onClick={() => {
                      setIsCardModalOpen(false);
                      setSelectedCard(null);
                    }}
                    className="w-full py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs rounded-2xl border border-border transition-all flex items-center justify-center"
                  >
                    Fechar
                  </button>
                ) : (
                  <>
                    {selectedCard.id && (
                      <button
                        type="button"
                        onClick={() => deleteCard(selectedCard.id!)}
                        className="px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-xs rounded-2xl border border-red-500/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsCardModalOpen(false);
                        setSelectedCard(null);
                      }}
                      className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs rounded-2xl border border-border transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => saveCard(selectedCard)}
                      disabled={saving || !selectedCard.title?.trim() || !selectedCard.owner_id}
                      className="flex-1 py-3 bg-primary text-primary-foreground font-black text-xs rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isCreateSubquadroOpen && (
        <CriarSubquadroModal
          userId={userProfile?.id}
          onClose={() => setIsCreateSubquadroOpen(false)}
        />
      )}

      {isAddPeopleOpen && subquadro && (
        <AddPeopleModal
          subquadroName={subquadro.name}
          usersList={usersList}
          onClose={() => setIsAddPeopleOpen(false)}
          onUserUpdated={(id, department) => {
            setUsersList((prev) =>
              prev.map((u) => (u.id === id ? { ...u, department } : u)),
            );
          }}
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.3); }
        select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 1rem center;
          background-size: 1rem;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          background: transparent;
          bottom: 0;
          color: transparent;
          cursor: pointer;
          height: auto;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
          width: auto;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}

/* ─── Modal: criar subquadro ──────────────────────────────────────────── */

function CriarSubquadroModal({
  userId,
  onClose,
}: {
  userId?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirmCreate = async () => {
    const value = name.trim();
    if (!value) return;
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("esteira_subquadros")
        .insert([{ name: value, created_by: userId || null }]);
      if (err) {
        if (err.code === "23505") {
          setError(`Já existe um subquadro chamado "${value}".`);
        } else {
          throw err;
        }
        return;
      }
      onClose();
    } catch (err) {
      console.error("[CriarSubquadroModal] Erro ao criar subquadro:", err);
      setError("Erro ao criar subquadro. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 pb-4 border-b border-border/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-black uppercase tracking-tighter">Criar Subquadro</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Ele aparece no menu, dentro de Esteira. Depois de criado, você entra nele e
            adiciona as pessoas.
          </p>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Nome do quadro
            </label>
            <input
              autoFocus
              type="text"
              placeholder='Ex: "Marketing"'
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCreate();
              }}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {error && <p className="text-[11px] text-red-500 font-semibold">{error}</p>}
          </div>
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs rounded-2xl border border-border transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmCreate}
            disabled={!name.trim() || saving}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black text-xs rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal: adicionar pessoas a um subquadro ─────────────────────────── */

function AddPeopleModal({
  subquadroName,
  usersList,
  onClose,
  onUserUpdated,
}: {
  subquadroName: string;
  usersList: EsteiraUser[];
  onClose: () => void;
  onUserUpdated: (id: string, department: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const available = useMemo(
    () =>
      usersList
        .filter((u) => u.department?.trim() !== subquadroName)
        .filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase())),
    [usersList, subquadroName, search],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase
        .from("usuarios")
        .update({ department: subquadroName })
        .in("id", ids);
      if (error) throw error;
      ids.forEach((id) => onUserUpdated(id, subquadroName));
      onClose();
    } catch (err) {
      console.error("[AddPeopleModal] Erro ao adicionar pessoas:", err);
      alert("Erro ao adicionar pessoas. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div className="p-6 pb-4 border-b border-border/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-black uppercase tracking-tighter">Adicionar Pessoas</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <p className="text-[11px] text-muted-foreground mb-3">
            Entrar em "{subquadroName}" muda o setor real dessa pessoa — vale pro app
            inteiro, não só pra Esteira.
          </p>
          <input
            type="text"
            placeholder="Buscar pessoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-0.5 custom-scrollbar">
          {available.map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-secondary/50 cursor-pointer text-sm font-semibold"
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="accent-primary"
              />
              {u.avatar ? (
                <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1">{toTitleCase(u.name)}</span>
              {u.department?.trim() && (
                <span className="text-[9px] text-muted-foreground/60 shrink-0">{u.department}</span>
              )}
            </label>
          ))}
          {available.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground font-semibold">
              Nenhuma pessoa encontrada.
            </div>
          )}
        </div>

        <div className="p-6 pt-4 flex gap-3 shrink-0 border-t border-border/30">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs rounded-2xl border border-border transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmAdd}
            disabled={selected.size === 0 || saving}
            className="flex-1 py-3 bg-primary text-primary-foreground font-black text-xs rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Adicionando..." : `Adicionar${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

