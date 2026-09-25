import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Calendar,
  User,
  Check,
  X,
  ChevronDown,
  Users,
  Lock,
  Repeat,
  Circle,
  Zap,
  CheckCircle2,
  AlignLeft,
  AlignJustify,
  Bold,
  Italic,
  List,
  ListOrdered,
  Link2,
  Code,
  SquareCheck,
  MoreHorizontal,
  Sun,
  CalendarDays,
  Flag,
  Paperclip,
  CloudUpload,
  Loader2,
  FileText,
  Tag as TagIcon,
  Clock,
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
  attachments?: Anexo[];
  labels?: Etiqueta[];
}

interface Anexo {
  name: string;
  url: string;
  /** Caminho no bucket esteira-anexos; nulo quando é link colado. */
  path: string | null;
  type: string;
  size?: number;
}

interface Etiqueta {
  name: string;
  color: string;
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

// Cor do ponto da prioridade no card (o chip colorido virou só um ponto).
const COR_TAG: Record<string, string> = {
  Baixa: "bg-slate-400",
  Média: "bg-amber-400",
  Alta: "bg-orange-500",
  Urgente: "bg-red-500",
};

function MiniAvatar({
  user,
  label,
  tamanho = "sm",
}: {
  user?: EsteiraUser;
  label: string;
  tamanho?: "sm" | "lg";
}) {
  const [quebrou, setQuebrou] = useState(false);
  const dim = tamanho === "lg" ? "w-9 h-9 text-[12px]" : "w-6 h-6 text-[9px]";
  if (user?.avatar && !quebrou) {
    return (
      <img
        src={user.avatar}
        alt={label}
        title={label}
        onError={() => setQuebrou(true)}
        className={`${dim} rounded-full object-cover ring-2 ring-card shrink-0`}
      />
    );
  }
  return (
    <div
      title={label}
      className={`${dim} rounded-full bg-secondary ring-2 ring-card flex items-center justify-center font-bold text-muted-foreground shrink-0`}
    >
      {(user?.name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Cores das etiquetas: bolinha (seletor) e chip (card e modal). */
const COR_ETIQUETA: Record<string, { ponto: string; chip: string }> = {
  violet: { ponto: "bg-violet-500", chip: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  blue: { ponto: "bg-blue-500", chip: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  emerald: { ponto: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  amber: { ponto: "bg-amber-400", chip: "bg-amber-400/15 text-amber-500 border-amber-400/30" },
  orange: { ponto: "bg-orange-500", chip: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  red: { ponto: "bg-red-500", chip: "bg-red-500/15 text-red-500 border-red-500/30" },
};

const tamanhoArquivo = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Rótulo de seção do modal: ícone + texto (+ asterisco) e o controle abaixo. */
function RotuloModal({
  icone,
  texto,
  obrigatorio,
  children,
}: {
  icone: React.ReactNode;
  texto: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-[13px] font-semibold text-foreground">
        <span className="text-foreground/80">{icone}</span>
        {texto}
        {obrigatorio && <span className="text-muted-foreground -ml-1.5">*</span>}
      </div>
      {children}
    </div>
  );
}

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
  // Card acabou de ser marcado: mostra o check verde um instante antes de ir
  // para Concluídos, em vez de sumir da coluna no mesmo clique.
  const [marcandoIds, setMarcandoIds] = useState<Set<string>>(new Set());
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
  // Modal: textarea da descrição (barra de formatação), input do checklist,
  // input de data (botão do calendário) e o menu "..." aberto de um item.
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const checklistInputRef = useRef<HTMLInputElement>(null);
  const prazoRef = useRef<HTMLInputElement>(null);
  const [menuItemAberto, setMenuItemAberto] = useState<number | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [linkAnexo, setLinkAnexo] = useState("");
  const [etiquetaTexto, setEtiquetaTexto] = useState("");
  const [etiquetaCor, setEtiquetaCor] = useState("violet");
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  // Etiquetas já usadas nos cards do quadro, para sugerir e manter a mesma cor.
  const etiquetasUsadas = useMemo(() => {
    const mapa = new Map<string, Etiqueta>();
    for (const c of cards) {
      for (const l of c.labels ?? []) {
        if (!mapa.has(l.name.toLowerCase())) mapa.set(l.name.toLowerCase(), l);
      }
    }
    return [...mapa.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [cards]);

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
          attachments: cardData.attachments ?? [],
          labels: cardData.labels ?? [],
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
          attachments: cardData.attachments ?? [],
          labels: cardData.labels ?? [],
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

  // O quadro fica memorizado: sem isto, cada tecla digitada no modal
  // (título, descrição, busca de responsável) redesenhava todos os cards por
  // trás, e o modal ficava lento. Só o que muda o quadro entra nas dependências.
  const quadro = useMemo(
    () => (
      <>
      {/* KANBAN BOARD — visual enxuto: colunas sem fundo colorido, cards com
          só o essencial (título, prazo, prioridade, progresso e quem faz). */}
      <div className="flex-1 overflow-x-auto min-h-0 flex gap-5 pb-4 select-none custom-scrollbar">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.column_id === col.id);
          const isOver = draggedOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex-1 min-w-[280px] h-full flex flex-col rounded-2xl border transition-colors duration-200 ${
                isOver ? "bg-primary/5 border-primary/40" : "bg-secondary/40 border-border/50"
              }`}
            >
              {/* Column Header */}
              <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full bg-current ${col.textClass}`} />
                  <h3 className="text-[13px] font-semibold text-foreground">{col.title}</h3>
                  <span className="text-[12px] font-medium text-muted-foreground tabular-nums">
                    {colCards.length}
                  </span>
                </div>
                <button
                  onClick={() => openNewCard(col.id)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Nova atividade"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2.5 pb-1 pt-1 flex flex-col gap-2 custom-scrollbar min-h-[48px]">
                {loading ? (
                  Array.from({ length: 2 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="bg-card border border-border/50 p-3.5 rounded-xl animate-pulse h-[92px] shrink-0 space-y-2.5"
                    >
                      <div className="h-3.5 bg-secondary rounded w-3/4" />
                      <div className="h-3 bg-secondary rounded w-1/2" />
                    </div>
                  ))
                ) : colCards.length > 0 ? (
                  colCards.map((card) => {
                    const expired = isOverdue(card.due_date, card.column_id);
                    const stats = getChecklistStats(card.description);
                    const subtasks = parseSubtasks(card.description);
                    const visibleSubtasks = subtasks.slice(0, 5);
                    const remainingCount = subtasks.length - 5;
                    const cleanDesc = getCleanDescriptionText(card.description).trim();
                    const isExpanded = expandedCards[card.id] || false;
                    const concluido = card.column_id === "CONCLUIDOS";
                    const creatorUser = usersList.find((u) => u.id === card.created_by);
                    const responsibleUser = usersList.find((u) => u.id === card.owner_id);
                    const creatorName = toTitleCase(creatorUser?.name) || "Marketing";
                    const responsibleName = toTitleCase(responsibleUser?.name) || "Marketing";
                    const selfAssigned = !!card.created_by && card.created_by === card.owner_id;

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isBottom = e.clientY - rect.top > rect.height / 2;
                          setDraggedOverCardId(card.id);
                          setDraggedOverCardPart(isBottom ? "bottom" : "top");
                        }}
                        onDragLeave={() => {
                          setDraggedOverCardId(null);
                          setDraggedOverCardPart(null);
                        }}
                        onDrop={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isBottom = e.clientY - rect.top > rect.height / 2;
                          setDraggedOverCardId(null);
                          setDraggedOverCardPart(null);
                          handleCardDrop(e, card.id, isBottom ? "bottom" : "top");
                        }}
                        onClick={() => {
                          setSelectedCard(card);
                          setIsViewOnly(!canManageCard(card));
                          setIsCardModalOpen(true);
                        }}
                        className={`group relative shrink-0 bg-card rounded-xl border overflow-hidden cursor-pointer active:cursor-grabbing transition-all duration-150 hover:ring-2 hover:ring-primary/60 ${
                          "border-border/60"
                        } ${
                          draggedOverCardId === card.id && draggedOverCardPart === "top"
                            ? "border-t-2 border-t-primary"
                            : draggedOverCardId === card.id && draggedOverCardPart === "bottom"
                              ? "border-b-2 border-b-primary"
                              : ""
                        }`}
                      >
                        {/* Capa: primeira imagem anexada, na largura toda do card */}
                        {(() => {
                          const capa = card.attachments?.find((a) => a.type.startsWith("image/"));
                          if (!capa) return null;
                          return (
                            <div className="h-36 bg-secondary">
                              <img
                                src={capa.url}
                                alt=""
                                loading="lazy"
                                draggable={false}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          );
                        })()}

                        {/* Editar/excluir: só no hover, no canto */}
                        {canManageCard(card) && (
                          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCard(card);
                                setIsViewOnly(false);
                                setIsCardModalOpen(true);
                              }}
                              className="p-1.5 rounded-full bg-card/90 backdrop-blur text-muted-foreground hover:text-foreground shadow-sm"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCard(card.id);
                              }}
                              className="p-1.5 rounded-full bg-card/90 backdrop-blur text-muted-foreground hover:text-red-500 shadow-sm"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="px-3 pt-2.5 pb-2.5 flex flex-col gap-2">
                          {/* Etiquetas e prioridade como barrinhas; o nome aparece no hover */}
                          {((card.labels?.length ?? 0) > 0 || card.tag_name) && (
                            <div className="flex flex-wrap gap-1">
                              {card.tag_name && (
                                <span
                                  title={`Prioridade: ${card.tag_name}`}
                                  className={`h-2 w-10 rounded-full ${COR_TAG[card.tag_name] || "bg-slate-400"}`}
                                />
                              )}
                              {card.labels?.map((l) => (
                                <span
                                  key={l.name}
                                  title={l.name}
                                  className={`h-2 w-10 rounded-full ${COR_ETIQUETA[l.color]?.ponto ?? COR_ETIQUETA.violet.ponto}`}
                                />
                              ))}
                            </div>
                          )}

                          {/* Bolinha de concluir + título */}
                          <div className="flex items-start gap-2 pr-1">
                            <button
                              type="button"
                              disabled={!canManageCard(card)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (marcandoIds.has(card.id)) return;
                                // Reaproveita o mesmo caminho do arrastar entre colunas
                                // (reindexa, grava completed_at e notifica).
                                const mover = () =>
                                  handleDrop(
                                    {
                                      preventDefault: () => {},
                                      dataTransfer: { getData: () => card.id },
                                    } as unknown as React.DragEvent,
                                    concluido ? "A FAZER" : "CONCLUIDOS",
                                  );
                                if (concluido) {
                                  mover();
                                  return;
                                }
                                setMarcandoIds((prev) => new Set(prev).add(card.id));
                                setTimeout(() => {
                                  mover();
                                  setMarcandoIds((prev) => {
                                    const n = new Set(prev);
                                    n.delete(card.id);
                                    return n;
                                  });
                                }, 700);
                              }}
                              className={`mt-[1px] w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-all duration-200 disabled:cursor-default ${
                                concluido || marcandoIds.has(card.id)
                                  ? "bg-emerald-500 text-card scale-100"
                                  : "border-[1.5px] border-muted-foreground/60 text-transparent hover:border-emerald-500"
                              }`}
                              title={concluido ? "Voltar para A Fazer" : "Marcar como concluída"}
                            >
                              <Check className="w-3 h-3 stroke-[3.5]" />
                            </button>
                            <h4
                              className={`flex-1 text-[14px] leading-snug break-words transition-colors ${
                                concluido || marcandoIds.has(card.id) ? "text-muted-foreground" : "text-foreground"
                              }`}
                              title={card.title}
                            >
                              {card.title}
                            </h4>
                          </div>

                          {/* Selos: prazo, descrição, checklist, anexos, repetição, pessoas */}
                          {(card.due_date || cleanDesc || stats.total > 0 || (card.attachments?.length ?? 0) > 0 || card.recurring || card.owner_id) && (
                            <div className="flex items-center gap-2.5 flex-wrap text-[12px] text-muted-foreground">
                              {card.due_date && (
                                <span
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors duration-200 ${
                                    // Concluída: selo verde cheio, como no Trello
                                    concluido || marcandoIds.has(card.id)
                                      ? "bg-emerald-500 text-card font-medium"
                                      : expired
                                        ? "bg-red-500/20 text-red-400"
                                        : ""
                                  }`}
                                  title="Prazo"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  {formatDate(card.due_date)}
                                </span>
                              )}
                              {cleanDesc && (
                                <span title="Tem descrição">
                                  <AlignLeft className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {stats.total > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCardExpanded(card.id);
                                  }}
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-secondary ${
                                    stats.completed === stats.total ? "bg-emerald-500/15 text-emerald-500" : ""
                                  }`}
                                  title={isExpanded ? "Esconder checklist" : "Ver checklist"}
                                >
                                  <SquareCheck className="w-3.5 h-3.5" />
                                  {stats.completed}/{stats.total}
                                </button>
                              )}
                              {(card.attachments?.length ?? 0) > 0 && (
                                <span className="flex items-center gap-1" title="Anexos">
                                  <Paperclip className="w-3.5 h-3.5" />
                                  {card.attachments!.length}
                                </span>
                              )}
                              {card.recurring && (
                                <span title="Repete todo dia">
                                  <Repeat className="w-3.5 h-3.5" />
                                </span>
                              )}
                              <div className="ml-auto flex items-center -space-x-1.5">
                                {!selfAssigned && <MiniAvatar user={creatorUser} label={`Criado por ${creatorName}`} />}
                                <MiniAvatar user={responsibleUser} label={`Responsável: ${responsibleName}`} />
                              </div>
                            </div>
                          )}

                          {/* Checklist aberto pelo selo */}
                          {isExpanded && visibleSubtasks.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                              {visibleSubtasks.map((task) => (
                                <div key={task.index} className="flex items-start gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSubtaskInViewMode(card.id, task.index)}
                                    className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center mt-0.5 transition-colors shrink-0 ${
                                      task.completed
                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                        : "border-border hover:border-muted-foreground text-transparent"
                                    }`}
                                  >
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </button>
                                  <span
                                    className={`text-[12px] leading-tight break-words ${
                                      task.completed ? "line-through text-muted-foreground/60" : "text-foreground/90"
                                    }`}
                                  >
                                    {task.text}
                                  </span>
                                </div>
                              ))}
                              {remainingCount > 0 && (
                                <div className="text-[11px] text-muted-foreground pl-5.5">
                                  + {remainingCount} item{remainingCount > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-3 text-center text-[12px] text-muted-foreground/50">Nada por aqui</div>
                )}
              </div>
              <button
                onClick={() => openNewCard(col.id)}
                className="m-2 mt-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                Adicionar um cartão
              </button>
            </div>
          );
        })}
      </div>
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, loading, draggedOverColumn, draggedOverCardId, draggedOverCardPart, expandedCards, marcandoIds, usersList, userProfile?.id, isManager, boardOwnerId],
  );

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

      {quadro}

      {/* CARD MODAL — conteúdo à esquerda (título, descrição, checklist) e
          propriedades à direita. */}
      <AnimatePresence>
        {isCardModalOpen && selectedCard && (() => {
          const fechar = () => {
            setIsCardModalOpen(false);
            setSelectedCard(null);
            setMenuItemAberto(null);
          };
          const podeSalvar = !saving && !!selectedCard.title?.trim() && !!selectedCard.owner_id;
          const subtasks = parseSubtasks(selectedCard.description || "");
          const descTexto = getCleanDescriptionText(selectedCard.description || "");
          const anexos = selectedCard.attachments ?? [];
          const etiquetas = selectedCard.labels ?? [];

          // Sobe para o bucket e já grava no card aberto. Card novo ainda não
          // tem id, então a pasta é aleatória; o vínculo é a lista no card.
          const enviarArquivos = async (arquivos: FileList) => {
            setEnviandoAnexo(true);
            const novos: Anexo[] = [];
            const pasta = selectedCard.id || `novo-${crypto.randomUUID()}`;
            for (const f of Array.from(arquivos)) {
              const limpo = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
              const path = `${pasta}/${Date.now()}-${limpo}`;
              const { error } = await supabase.storage.from("esteira-anexos").upload(path, f, {
                contentType: f.type || undefined,
              });
              if (error) {
                alert(`Não foi possível anexar ${f.name}: ${error.message}`);
                continue;
              }
              const { data } = supabase.storage.from("esteira-anexos").getPublicUrl(path);
              novos.push({ name: f.name, url: data.publicUrl, path, type: f.type || "application/octet-stream", size: f.size });
            }
            setSelectedCard((prev) => (prev ? { ...prev, attachments: [...(prev.attachments ?? []), ...novos] } : prev));
            setEnviandoAnexo(false);
          };
          const adicionarLink = () => {
            let url = linkAnexo.trim();
            if (!url) return;
            if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
            let nome = url;
            try {
              const u = new URL(url);
              nome = u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
            } catch {
              // link fora do padrão: guarda como veio
            }
            setSelectedCard({ ...selectedCard, attachments: [...anexos, { name: nome, url, path: null, type: "link" }] });
            setLinkAnexo("");
          };
          const removerAnexo = (i: number) => {
            const alvo = anexos[i];
            if (alvo?.path) supabase.storage.from("esteira-anexos").remove([alvo.path]);
            setSelectedCard({ ...selectedCard, attachments: anexos.filter((_, j) => j !== i) });
          };
          const adicionarEtiqueta = (nome: string, cor: string) => {
            const n = nome.trim();
            if (!n || etiquetas.some((l) => l.name.toLowerCase() === n.toLowerCase())) {
              setEtiquetaTexto("");
              return;
            }
            // Etiqueta que já existe em outro card mantém a cor de lá.
            const existente = etiquetasUsadas.find((l) => l.name.toLowerCase() === n.toLowerCase());
            setSelectedCard({ ...selectedCard, labels: [...etiquetas, existente ?? { name: n, color: cor }] });
            setEtiquetaTexto("");
          };
          const setDesc = (texto: string) =>
            setSelectedCard({
              ...selectedCard,
              description: updateDescriptionText(selectedCard.description || "", texto),
            });
          const addSubtask = () => {
            if (!newSubtaskText.trim()) return;
            setSelectedCard({
              ...selectedCard,
              description: addSubtaskToDescription(selectedCard.description || "", newSubtaskText),
            });
            setNewSubtaskText("");
          };

          // Barra de formatação: envolve a seleção (ou insere no cursor) com a
          // marcação em Markdown. A descrição é texto puro no banco.
          const formatar = (antes: string, depois = "", porLinha = false) => {
            const el = descRef.current;
            if (!el || isViewOnly) return;
            const ini = el.selectionStart;
            const fim = el.selectionEnd;
            const sel = descTexto.slice(ini, fim);
            let novo: string;
            if (porLinha) {
              const linhas = (sel || "").split("\n");
              novo = linhas
                .map((l, i) => (antes === "1. " ? `${i + 1}. ` : antes) + l)
                .join("\n");
            } else {
              novo = antes + sel + depois;
            }
            setDesc(descTexto.slice(0, ini) + novo + descTexto.slice(fim));
            requestAnimationFrame(() => {
              el.focus();
              const pos = sel ? ini + novo.length : ini + antes.length;
              el.setSelectionRange(pos, pos);
            });
          };

          const isoDia = (offset: number) => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          };
          // "Esta semana" = sexta desta semana (ou hoje, se já for sexta/fim de semana).
          const diasAteSexta = Math.max(0, 5 - new Date().getDay());
          const prazoAtual = selectedCard.due_date ? selectedCard.due_date.split("T")[0] : "";
          const atalhosPrazo = [
            { label: "Hoje", valor: isoDia(0) },
            { label: "Amanhã", valor: isoDia(1) },
            { label: "Esta semana", valor: isoDia(diasAteSexta) },
          ];
          const responsavel = usersList.find((u) => u.id === selectedCard.owner_id);
          const colunaAtual = selectedCard.column_id || "A FAZER";
          const ICONE_STATUS: Record<string, React.ReactNode> = {
            "A FAZER": <Circle className="w-4 h-4" />,
            FAZENDO: <Zap className="w-4 h-4" />,
            CONCLUIDOS: <CheckCircle2 className="w-4 h-4" />,
          };

          const CAMPO = "w-full rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all disabled:cursor-default";

          return (
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6"
            onKeyDown={(e) => {
              if (e.key === "Escape") fechar();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isViewOnly && podeSalvar) {
                e.preventDefault();
                saveCard(selectedCard);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={fechar}
              transition={{ duration: 0.1 }}
              className="absolute inset-0 bg-black/70"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="relative w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
            >
              <button
                onClick={fechar}
                className="absolute top-3 right-3 z-20 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Fechar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar lg:overflow-hidden lg:flex">
                {/* ── Coluna esquerda: conteúdo ─────────────── */}
                <div className="flex-1 min-w-0 px-5 sm:px-6 py-5 space-y-4 lg:overflow-y-auto custom-scrollbar">
                  <RotuloModal icone={<AlignLeft className="w-4 h-4" />} texto="Título da tarefa" obrigatorio={!isViewOnly}>
                    <input
                      autoFocus={!selectedCard.id}
                      disabled={isViewOnly}
                      type="text"
                      placeholder="Ex: Criar campanha para Instagram"
                      className={CAMPO}
                      value={selectedCard.title || ""}
                      onChange={(e) => setSelectedCard({ ...selectedCard, title: e.target.value })}
                    />
                  </RotuloModal>

                  <RotuloModal icone={<AlignJustify className="w-4 h-4" />} texto="Descrição">
                    <div className="rounded-xl border border-border bg-secondary/40 overflow-hidden focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
                      {!isViewOnly && (
                        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
                          {[
                            { icone: <Bold className="w-4 h-4" />, t: "Negrito", f: () => formatar("**", "**") },
                            { icone: <Italic className="w-4 h-4" />, t: "Itálico", f: () => formatar("_", "_") },
                            null,
                            { icone: <List className="w-4 h-4" />, t: "Lista", f: () => formatar("- ", "", true) },
                            { icone: <ListOrdered className="w-4 h-4" />, t: "Lista numerada", f: () => formatar("1. ", "", true) },
                            null,
                            { icone: <Link2 className="w-4 h-4" />, t: "Link", f: () => formatar("[", "](https://)") },
                            { icone: <Code className="w-4 h-4" />, t: "Código", f: () => formatar("`", "`") },
                          ].map((b, i) =>
                            b ? (
                              <button
                                key={i}
                                type="button"
                                title={b.t}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={b.f}
                                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              >
                                {b.icone}
                              </button>
                            ) : (
                              <span key={i} className="w-px h-5 bg-border mx-1" />
                            ),
                          )}
                        </div>
                      )}
                      {isViewOnly ? (
                        <p className="px-4 py-3 min-h-[96px] text-[14px] leading-relaxed text-foreground/90 whitespace-pre-line">
                          {descTexto.trim() || <span className="italic text-muted-foreground/60">Sem descrição.</span>}
                        </p>
                      ) : (
                        <textarea
                          ref={(el) => {
                            descRef.current = el;
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = Math.min(Math.max(el.scrollHeight, 110), 320) + "px";
                            }
                          }}
                          placeholder="Adicione detalhes, links de referência ou o roteiro..."
                          className="block w-full resize-none bg-transparent border-none outline-none px-4 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/60"
                          value={descTexto}
                          onChange={(e) => setDesc(e.target.value)}
                        />
                      )}
                    </div>
                  </RotuloModal>

                  {/* Checklist */}
                  {(subtasks.length > 0 || !isViewOnly) && (
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
                          <SquareCheck className="w-4 h-4" /> Checklist
                          {subtasks.length > 0 && (
                            <span className="text-[12px] font-medium text-muted-foreground tabular-nums">
                              {subtasks.filter((t) => t.completed).length}/{subtasks.length}
                            </span>
                          )}
                        </span>
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => checklistInputRef.current?.focus()}
                            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary text-[13px] font-medium hover:bg-primary/15 transition-colors"
                          >
                            <Plus className="w-4 h-4" /> Adicionar item
                          </button>
                        )}
                      </div>

                      <div className="divide-y divide-border border-y border-border">
                        {subtasks.map((task) => (
                          <div key={task.index} className="relative flex items-center gap-3 py-2.5 px-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (isViewOnly) {
                                  handleToggleSubtaskInViewMode(selectedCard.id!, task.index);
                                } else {
                                  setSelectedCard({
                                    ...selectedCard,
                                    description: toggleSubtaskInDescription(selectedCard.description || "", task.index),
                                  });
                                }
                              }}
                              className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors shrink-0 ${
                                task.completed
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/50 hover:border-primary text-transparent"
                              }`}
                            >
                              <Check className="w-3 h-3 stroke-[3]" />
                            </button>
                            <span
                              className={`flex-1 text-[14px] break-words ${
                                task.completed ? "line-through text-muted-foreground" : "text-foreground"
                              }`}
                            >
                              {task.text}
                            </span>
                            {!isViewOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setMenuItemAberto(menuItemAberto === task.index ? null : task.index)}
                                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                  title="Opções"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                {menuItemAberto === task.index && (
                                  <div className="absolute right-0 top-full z-20 -mt-1 w-40 rounded-xl border border-border bg-card shadow-xl p-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedCard({
                                          ...selectedCard,
                                          description: deleteSubtaskFromDescription(selectedCard.description || "", task.index),
                                        });
                                        setMenuItemAberto(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] text-red-500 hover:bg-red-500/10"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Remover item
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                        {!isViewOnly && (
                          <div className="flex items-center gap-3 py-2.5 px-1">
                            <Plus className="w-[18px] h-[18px] text-primary shrink-0" />
                            <input
                              ref={checklistInputRef}
                              type="text"
                              placeholder="Adicionar item"
                              className="flex-1 bg-transparent border-none outline-none text-[14px] text-foreground placeholder:text-primary"
                              value={newSubtaskText}
                              onChange={(e) => setNewSubtaskText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                  addSubtask();
                                }
                              }}
                            />
                            {newSubtaskText.trim() && (
                              <span className="text-[11px] text-muted-foreground">Enter ↵</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Anexos */}
                  {(anexos.length > 0 || !isViewOnly) && (
                    <RotuloModal icone={<Paperclip className="w-4 h-4" />} texto="Anexos">
                      {!isViewOnly && (
                        <>
                          <input
                            ref={anexoInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.length) enviarArquivos(e.target.files);
                              e.target.value = "";
                            }}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => anexoInputRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setArrastandoArquivo(true);
                            }}
                            onDragLeave={() => setArrastandoArquivo(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setArrastandoArquivo(false);
                              if (e.dataTransfer.files?.length) enviarArquivos(e.dataTransfer.files);
                            }}
                            className={`flex items-center justify-center gap-4 rounded-xl border-2 border-dashed px-4 py-5 cursor-pointer transition-colors ${
                              arrastandoArquivo
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50 hover:bg-secondary/30"
                            }`}
                          >
                            {enviandoAnexo ? (
                              <Loader2 className="w-7 h-7 text-primary animate-spin" />
                            ) : (
                              <CloudUpload className="w-8 h-8 text-primary" />
                            )}
                            <div className="text-center">
                              <p className="text-[14px] text-foreground">
                                {enviandoAnexo ? "Enviando…" : "Arraste arquivos aqui ou clique para anexar"}
                              </p>
                              <p className="text-[12px] text-muted-foreground">Imagens, PDFs, documentos ou links</p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 focus-within:border-primary/60">
                              <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                              <input
                                type="url"
                                placeholder="Ou cole um link e aperte Enter"
                                className="flex-1 bg-transparent border-none outline-none text-[13px] placeholder:text-muted-foreground/60"
                                value={linkAnexo}
                                onChange={(e) => setLinkAnexo(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                                    e.preventDefault();
                                    adicionarLink();
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </>
                      )}
                      {anexos.length > 0 && (
                        <div className="grid sm:grid-cols-2 gap-2 mt-3">
                          {anexos.map((a, i) => {
                            const ehImagem = a.type.startsWith("image/");
                            return (
                              <div
                                key={a.url + i}
                                className="group/anexo flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-2 pr-2.5"
                              >
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0"
                                >
                                  {ehImagem ? (
                                    <img src={a.url} alt="" className="w-full h-full object-cover" />
                                  ) : a.type === "link" ? (
                                    <Link2 className="w-4 h-4 text-primary" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-primary" />
                                  )}
                                </a>
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 min-w-0 hover:underline"
                                >
                                  <p className="text-[13px] text-foreground truncate">{a.name}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {a.type === "link" ? "Link" : a.size ? tamanhoArquivo(a.size) : "Arquivo"}
                                  </p>
                                </a>
                                {!isViewOnly && (
                                  <button
                                    type="button"
                                    onClick={() => removerAnexo(i)}
                                    className="p-1 rounded-md text-muted-foreground hover:text-red-500 opacity-0 group-hover/anexo:opacity-100 transition-opacity"
                                    title="Remover anexo"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </RotuloModal>
                  )}
                </div>

                {/* ── Coluna direita: propriedades ───────────── */}
                <aside className="lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-border px-5 sm:px-6 pt-12 lg:pt-5 pb-5 space-y-4 lg:overflow-y-auto custom-scrollbar">
                  <div className="lg:pr-8">
                  <RotuloModal icone={<Sun className="w-4 h-4" />} texto="Status">
                    <div className="grid grid-cols-3 gap-2">
                      {COLUMNS.map((c) => {
                        const ativo = colunaAtual === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={isViewOnly}
                            onClick={() => setSelectedCard({ ...selectedCard, column_id: c.id })}
                            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-default ${
                              ativo
                                ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                : "border-border text-foreground/85 hover:border-muted-foreground/50 hover:bg-secondary/50"
                            }`}
                          >
                            {ICONE_STATUS[c.id]}
                            {c.title}
                          </button>
                        );
                      })}
                    </div>
                  </RotuloModal>
                  </div>

                  <RotuloModal icone={<User className="w-4 h-4" />} texto="Responsável">
                    <div className="relative">
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 pl-2.5 pr-3 py-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
                        <MiniAvatar user={responsavel} label={responsavel ? toTitleCase(responsavel.name) : "Sem responsável"} tamanho="lg" />
                        <input
                          type="text"
                          disabled={isViewOnly}
                          placeholder="Escolher responsável"
                          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] text-foreground placeholder:text-muted-foreground/60 disabled:cursor-default"
                          value={responsibleSearch}
                          onChange={(e) => {
                            setResponsibleSearch(e.target.value);
                            setShowUserDropdown(true);
                            // Texto livre não corresponde a um usuário até selecionar na lista.
                            setSelectedCard((prev) => (prev ? { ...prev, owner_id: null } : null));
                          }}
                          onFocus={(e) => {
                            if (!isViewOnly) {
                              e.target.select();
                              setShowUserDropdown(true);
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
                        />
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                      {showUserDropdown && !isViewOnly && (() => {
                        const busca = selectedCard.owner_id ? "" : responsibleSearch.toLowerCase();
                        const filtrados = usersList.filter((u) => u.name.toLowerCase().includes(busca));
                        return (
                          <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-card border border-border rounded-xl shadow-xl custom-scrollbar p-1">
                            {filtrados.length > 0 ? (
                              filtrados.map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => {
                                    setResponsibleSearch(toTitleCase(user.name));
                                    setSelectedCard((prev) => (prev ? { ...prev, owner_id: user.id } : null));
                                    setShowUserDropdown(false);
                                  }}
                                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-secondary text-[14px] transition-colors flex items-center gap-2.5"
                                >
                                  <MiniAvatar user={user} label={toTitleCase(user.name)} />
                                  <span className="truncate">{toTitleCase(user.name)}</span>
                                  {user.id === selectedCard.owner_id && <Check className="w-4 h-4 text-primary ml-auto" />}
                                </button>
                              ))
                            ) : (
                              <div className="px-2.5 py-2 text-[13px] text-muted-foreground">Ninguém encontrado</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </RotuloModal>

                  <RotuloModal icone={<CalendarDays className="w-4 h-4" />} texto="Prazo">
                    {!isViewOnly && (
                      <div className="flex flex-wrap gap-2 mb-2.5">
                        {atalhosPrazo.map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            onClick={() =>
                              setSelectedCard({
                                ...selectedCard,
                                due_date: prazoAtual === a.valor ? undefined : a.valor,
                              })
                            }
                            className={`px-4 py-2 rounded-xl border text-[14px] transition-all ${
                              prazoAtual === a.valor
                                ? "border-primary bg-primary/15 text-primary font-medium"
                                : "border-border bg-secondary/40 text-foreground/85 hover:border-muted-foreground/50"
                            }`}
                          >
                            {a.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          title="Escolher no calendário"
                          onClick={() => prazoRef.current?.showPicker?.()}
                          className="px-3 py-2 rounded-xl border border-border bg-secondary/40 text-foreground/85 hover:border-muted-foreground/50 transition-all"
                        >
                          <CalendarDays className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 focus-within:border-primary/60 transition-all">
                      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        ref={prazoRef}
                        type="date"
                        disabled={isViewOnly}
                        className="relative flex-1 bg-transparent border-none outline-none text-[14px] text-foreground disabled:cursor-default [color-scheme:light] dark:[color-scheme:dark]"
                        value={prazoAtual}
                        onChange={(e) => setSelectedCard({ ...selectedCard, due_date: e.target.value || undefined })}
                      />
                      {!isViewOnly && prazoAtual && (
                        <button
                          type="button"
                          onClick={() => setSelectedCard({ ...selectedCard, due_date: undefined })}
                          className="relative z-10 p-0.5 rounded text-muted-foreground hover:text-foreground"
                          title="Tirar prazo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </RotuloModal>

                  <RotuloModal icone={<Flag className="w-4 h-4" />} texto="Prioridade">
                    <div className="grid grid-cols-4 gap-1.5">
                      {TAG_OPTIONS.map((opt) => {
                        const isSelected = selectedCard.tag_name === opt.name;
                        return (
                          <button
                            key={opt.name}
                            type="button"
                            disabled={isViewOnly}
                            onClick={() =>
                              setSelectedCard({
                                ...selectedCard,
                                tag_name: isSelected ? "" : opt.name,
                                tag_color: isSelected ? "" : opt.color,
                              })
                            }
                            className={`flex items-center justify-center gap-1.5 px-1.5 py-2 rounded-xl border text-[13px] transition-colors disabled:cursor-default ${
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40"
                                : "border-border bg-secondary/40 text-foreground/85 hover:border-muted-foreground/50"
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${COR_TAG[opt.name]}`} />
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  </RotuloModal>


                  {(etiquetas.length > 0 || !isViewOnly) && (
                  <RotuloModal icone={<TagIcon className="w-4 h-4" />} texto="Etiquetas">
                    {etiquetas.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {etiquetas.map((l) => (
                          <span
                            key={l.name}
                            className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-[12px] font-medium ${COR_ETIQUETA[l.color]?.chip ?? COR_ETIQUETA.violet.chip}`}
                          >
                            {l.name}
                            {!isViewOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedCard({
                                    ...selectedCard,
                                    labels: etiquetas.filter((x) => x.name !== l.name),
                                  })
                                }
                                className="p-0.5 rounded hover:bg-black/10"
                                title="Tirar etiqueta"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {!isViewOnly && (
                      <>
                        <div className="relative">
                          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 pl-4 pr-3 py-2.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
                            <input
                              type="text"
                              placeholder="Adicionar etiquetas..."
                              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-foreground placeholder:text-muted-foreground/60"
                              value={etiquetaTexto}
                              onChange={(e) => {
                                setEtiquetaTexto(e.target.value);
                                setMostrarEtiquetas(true);
                              }}
                              onFocus={() => setMostrarEtiquetas(true)}
                              onBlur={() => setTimeout(() => setMostrarEtiquetas(false), 200)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                  adicionarEtiqueta(etiquetaTexto, etiquetaCor);
                                }
                              }}
                            />
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          </div>
                          {mostrarEtiquetas && (() => {
                            const q = etiquetaTexto.trim().toLowerCase();
                            const sugestoes = etiquetasUsadas.filter(
                              (l) =>
                                !etiquetas.some((x) => x.name.toLowerCase() === l.name.toLowerCase()) &&
                                l.name.toLowerCase().includes(q),
                            );
                            const podeCriar = q && !etiquetasUsadas.some((l) => l.name.toLowerCase() === q);
                            if (!sugestoes.length && !podeCriar) return null;
                            return (
                              <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-card border border-border rounded-xl shadow-xl custom-scrollbar p-1">
                                {sugestoes.map((l) => (
                                  <button
                                    key={l.name}
                                    type="button"
                                    onClick={() => adicionarEtiqueta(l.name, l.color)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-secondary text-[13px] text-left"
                                  >
                                    <span className={`w-2.5 h-2.5 rounded-full ${COR_ETIQUETA[l.color]?.ponto ?? COR_ETIQUETA.violet.ponto}`} />
                                    {l.name}
                                  </button>
                                ))}
                                {podeCriar && (
                                  <button
                                    type="button"
                                    onClick={() => adicionarEtiqueta(etiquetaTexto, etiquetaCor)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-secondary text-[13px] text-left"
                                  >
                                    <Plus className="w-3.5 h-3.5 text-primary" />
                                    Criar “{etiquetaTexto.trim()}”
                                    <span className={`ml-auto w-2.5 h-2.5 rounded-full ${COR_ETIQUETA[etiquetaCor].ponto}`} />
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          {Object.entries(COR_ETIQUETA).map(([cor, c]) => (
                            <button
                              key={cor}
                              type="button"
                              onClick={() => setEtiquetaCor(cor)}
                              className={`w-7 h-7 rounded-lg ${c.ponto} transition-all ${
                                etiquetaCor === cor ? "ring-2 ring-offset-2 ring-offset-card ring-foreground/70 scale-105" : "opacity-80 hover:opacity-100"
                              }`}
                              title="Cor da nova etiqueta"
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() => adicionarEtiqueta(etiquetaTexto, etiquetaCor)}
                            disabled={!etiquetaTexto.trim()}
                            className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 disabled:opacity-40 transition-colors"
                            title="Criar etiqueta"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </RotuloModal>
                  )}
                </aside>
              </div>

              {/* Rodapé */}
              <div className="px-5 sm:px-6 py-3 border-t border-border flex items-center gap-3 shrink-0">
                <button
                  onClick={fechar}
                  className="px-6 py-2.5 rounded-xl border border-border text-[14px] font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  {isViewOnly ? "Fechar" : "Cancelar"}
                </button>
                {!isViewOnly && selectedCard.id && (
                  <button
                    type="button"
                    onClick={() => deleteCard(selectedCard.id!)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir
                  </button>
                )}
                {!isViewOnly && (
                  <div className="ml-auto flex items-center gap-3">
                    {!selectedCard.owner_id && (
                      <span className="hidden sm:block text-[12px] text-amber-500">Escolha um responsável</span>
                    )}
                    <button
                      onClick={() => saveCard(selectedCard)}
                      disabled={!podeSalvar}
                      className="flex items-center gap-2.5 pl-4 pr-2 py-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold shadow-lg shadow-primary/25 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      {saving ? "Salvando…" : selectedCard.id ? "Salvar tarefa" : "Criar tarefa"}
                      <kbd className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-black/20 text-[11px] font-medium">
                        Ctrl + Enter
                      </kbd>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
          );
        })()}
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

