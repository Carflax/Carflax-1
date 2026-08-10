import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Kanban,
  Plus,
  X,
  AlertTriangle,
  Trash2,
  Building2,
  Flag,
  User as UserIcon,
  CheckCircle2,
  RefreshCw,
  Pencil,
  AlertCircle,
  Zap,
  Repeat,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import {
  listOcorrencias,
  createOcorrencia,
  updateOcorrencia,
  deleteOcorrencia,
  type ScrumOcorrencia,
  type ScrumStatus,
  type ScrumPrioridade,
} from "@/lib/scrum-service";

interface UserProfile {
  id?: string;
  name?: string;
  role?: string;
  department?: string;
  is_admin?: boolean;
  is_leader?: boolean;
}

const COLUNAS: { key: ScrumStatus; label: string; desc: string; color: string }[] = [
  { key: "aberto", label: "Aberto", desc: "Registrado pelo líder", color: "#64748b" },
  { key: "analise", label: "Em Análise", desc: "Reunião de segunda", color: "#3b82f6" },
  { key: "andamento", label: "Em Andamento", desc: "Solução em execução", color: "#f59e0b" },
  { key: "resolvido", label: "Resolvido", desc: "Concluído", color: "#10b981" },
];

const PRIOS: Record<ScrumPrioridade, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "#64748b" },
  media: { label: "Média", color: "#3b82f6" },
  alta: { label: "Alta", color: "#f59e0b" },
  critica: { label: "Crítica", color: "#ef4444" },
};

const PRIO_ORDER: Record<ScrumPrioridade, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };


const emptyForm = (setor = ""): Partial<ScrumOcorrencia> => ({
  titulo: "",
  setor,
  descricao: "",
  solucao_proposta: "",
  prioridade: "media",
});

export function ScrumView({ userProfile }: { userProfile?: UserProfile }) {
  const [ocorrencias, setOcorrencias] = useState<ScrumOcorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; name: string; avatar?: string | null }[]>([]);
  const [dragOverCol, setDragOverCol] = useState<ScrumStatus | null>(null);
  const draggingId = useRef<string | null>(null);

  const [filterSetor, setFilterSetor] = useState("todos");
  const [filterPrio, setFilterPrio] = useState("todos");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState<ScrumOcorrencia | null>(null);
  const [form, setForm] = useState<Partial<ScrumOcorrencia>>(emptyForm());
  const [saving, setSaving] = useState(false);

  // ── Permissões ──────────────────────────────────────────────────────────────
  const role = (userProfile?.role || "").toUpperCase();
  const isAdmin = !!userProfile?.is_admin || role === "ADMIN";
  const isDiretor = role.includes("DIRETOR");
  const canManage = isAdmin || isDiretor; // move status, atribui, resolve, exclui qualquer
  const canCreate =
    canManage || !!userProfile?.is_leader || role.includes("GERENTE") || role.includes("SUPERVISOR");

  // silent=true → atualiza dados sem mostrar skeleton (evita flash nas operações internas)
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await listOcorrencias();
    setOcorrencias(data);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase
      .from("usuarios")
      .select("id, name, avatar")
      .order("name")
      .then(({ data }) => setUsers((data || []) as { id: string; name: string; avatar?: string | null }[]));
  }, []);

  // Realtime: mantém o quadro ao vivo durante a reunião (silent para não piscar)
  useEffect(() => {
    const ch = supabase
      .channel("scrum_ocorrencias_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "scrum_ocorrencias" }, () => load(true))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const setores = useMemo(() => {
    const s = Array.from(new Set(ocorrencias.map((o) => o.setor).filter(Boolean))).sort();
    return ["todos", ...s];
  }, [ocorrencias]);

  const filtered = useMemo(() => {
    const myId = userProfile?.id;
    return ocorrencias.filter(
      (o) =>
        (filterSetor === "todos" || o.setor === filterSetor) &&
        (filterPrio === "todos" || o.prioridade === filterPrio) &&
        (canManage || !myId || o.autor_id === myId || (o.responsavel_ids || []).includes(myId) || o.responsavel_id === myId),
    );
  }, [ocorrencias, filterSetor, filterPrio, canManage, userProfile?.id]);

  const porColuna = useCallback(
    (status: ScrumStatus) =>
      filtered
        .filter((o) => o.status === status)
        .sort(
          (a, b) =>
            PRIO_ORDER[a.prioridade] - PRIO_ORDER[b.prioridade] ||
            b.created_at.localeCompare(a.created_at),
        ),
    [filtered],
  );

  // ── Ações ─────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(userProfile?.department || ""));
    setIsModalOpen(true);
  };

  const openEdit = (o: ScrumOcorrencia) => {
    setEditing(o);
    const ids = o.responsavel_ids?.length ? o.responsavel_ids : o.responsavel_id ? [o.responsavel_id] : [];
    const nomes = o.responsavel_nomes?.length ? o.responsavel_nomes : o.responsavel_nome ? [o.responsavel_nome] : [];
    setForm({ ...o, responsavel_ids: ids, responsavel_nomes: nomes });
    setIsModalOpen(true);
  };

  const canEditThis = (o: ScrumOcorrencia | null) =>
    !!o && !!userProfile?.id && (canManage || o.autor_id === userProfile.id);

  const isResponsavel = (o: ScrumOcorrencia | null) =>
    !!o && !!userProfile?.id && ((o.responsavel_ids || []).includes(userProfile.id) || o.responsavel_id === userProfile.id);

  const handleSave = async () => {
    const isResp = editing ? isResponsavel(editing) : false;
    const canOnlyResp = isResp && !canEditThis(editing) && !canManage;
    if (!canOnlyResp && (!form.titulo?.trim() || !form.setor?.trim() || !form.descricao?.trim())) return;
    if (editing && !canEditThis(editing) && !isResp) {
      alert("Você não tem permissão para editar esta ocorrência.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        if (canOnlyResp) {
          await updateOcorrencia(editing.id, {
            resposta_responsavel: form.resposta_responsavel || null,
          });
        } else {
          const patch: Partial<ScrumOcorrencia> = {
            titulo: form.titulo,
            setor: form.setor,
            descricao: form.descricao,
            solucao_proposta: form.solucao_proposta || null,
            prioridade: form.prioridade as ScrumPrioridade,
            resposta_responsavel: form.resposta_responsavel || null,
          };
          if (canManage) {
            patch.status = form.status as ScrumStatus;
            patch.responsavel_ids = form.responsavel_ids || [];
            patch.responsavel_nomes = form.responsavel_nomes || [];
            patch.responsavel_id = (form.responsavel_ids || [])[0] || null;
            patch.responsavel_nome = (form.responsavel_nomes || [])[0] || null;
            patch.decisao = form.decisao || null;
            patch.resolved_at =
              form.status === "resolvido" ? editing.resolved_at || new Date().toISOString() : null;
          }
          await updateOcorrencia(editing.id, patch);
        }
      } else {
        await createOcorrencia({
          titulo: form.titulo,
          setor: form.setor,
          descricao: form.descricao,
          solucao_proposta: form.solucao_proposta || null,
          prioridade: (form.prioridade as ScrumPrioridade) || "media",
          status: "aberto",
          autor_id: userProfile?.id || null,
          autor_nome: userProfile?.name || null,
        });
      }
      setIsModalOpen(false);
      await load(true);
    } catch {
      /* erro já logado no serviço */
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (targetStatus: ScrumStatus) => {
    if (!canManage) return;
    const id = draggingId.current;
    if (!id) return;
    const o = ocorrencias.find((x) => x.id === id);
    if (!o || o.status === targetStatus) return;

    // Update otimista: move o card no estado local imediatamente (sem skeleton)
    const resolvedAt = targetStatus === "resolvido" ? o.resolved_at || new Date().toISOString() : null;
    setOcorrencias((prev) =>
      prev.map((x) => x.id === id ? { ...x, status: targetStatus, resolved_at: resolvedAt } : x),
    );

    // Persiste em background; o realtime sincroniza os outros clientes
    await updateOcorrencia(id, { status: targetStatus, resolved_at: resolvedAt });
  };

  const handleDelete = async (o: ScrumOcorrencia) => {
    if (!confirm(`Excluir a ocorrência "${o.titulo}"?`)) return;
    // Remove do estado local imediatamente
    setOcorrencias((prev) => prev.filter((x) => x.id !== o.id));
    setIsModalOpen(false);
    await deleteOcorrencia(o.id);
  };

  const abertas = ocorrencias.filter((o) => o.status !== "resolvido").length;
  const criticas = ocorrencias.filter((o) => o.prioridade === "critica" && o.status !== "resolvido").length;

  return (
    <div className="h-full flex flex-col bg-background p-3 sm:p-5 gap-3 sm:gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-black text-foreground uppercase tracking-tighter flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Kanban className="w-5 h-5 text-primary" />
            </div>
            Scrum — Ocorrências
          </h1>
          <button
            onClick={() => setShowInfo(true)}
            title="Como funciona o Scrum?"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all shrink-0"
          >
            <AlertCircle className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-secondary/60 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              {abertas} abertas
            </span>
            {criticas > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {criticas} críticas
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <TinyDropdown
            icon={Building2}
            value={filterSetor}
            options={setores.map((s) => ({ label: s === "todos" ? "Todos os Setores" : s, value: s }))}
            onChange={setFilterSetor}
            className="w-44"
            variant="slate"
          />
          <TinyDropdown
            icon={Flag}
            value={filterPrio}
            options={[
              { label: "Todas as Prioridades", value: "todos" },
              ...(Object.keys(PRIOS) as ScrumPrioridade[]).map((p) => ({ label: PRIOS[p].label, value: p })),
            ]}
            onChange={setFilterPrio}
            className="w-44"
            variant="amber"
          />
          <button
            onClick={() => load()}
            title="Atualizar"
            className="h-10 w-10 flex items-center justify-center bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all shrink-0"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              className="h-10 px-4 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 shrink-0"
            >
              <Plus className="w-4 h-4" /> Nova Ocorrência
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 flex flex-row md:grid md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto md:overflow-x-visible xl:overflow-hidden pb-3">
        {COLUNAS.map((col) => {
          const items = porColuna(col.key);
          const isOver = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              className={cn(
                "flex flex-col min-h-0 border rounded-2xl overflow-hidden transition-all duration-150 shrink-0 w-[280px] sm:w-[320px] md:w-auto md:shrink",
                isOver
                  ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
                  : "bg-secondary/20 border-border/60",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null);
              }}
              onDrop={(e) => { e.preventDefault(); setDragOverCol(null); handleDrop(col.key); }}
            >
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-card/40">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                  <div>
                    <p className="text-[11px] font-black text-foreground uppercase tracking-tight leading-none">{col.label}</p>
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{col.desc}</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-muted-foreground tabular-nums bg-secondary/60 px-2 py-0.5 rounded-md">{items.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3">
                {loading ? (
                  [1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-card/60 animate-pulse" />)
                ) : items.length === 0 ? (
                  <div className={cn(
                    "py-8 text-center text-[9px] font-bold uppercase tracking-widest transition-colors",
                    isOver ? "text-primary" : "text-muted-foreground",
                  )}>
                    {isOver ? "Soltar aqui" : "Nenhuma ocorrência"}
                  </div>
                ) : (
                  items.map((o) => (
                    <ScrumCard
                      key={o.id}
                      o={o}
                      canManage={canManage}
                      userId={userProfile?.id}
                      users={users}
                      onOpen={() => openEdit(o)}
                      onDragStart={() => { draggingId.current = o.id; }}
                      onDragEnd={() => { draggingId.current = null; setDragOverCol(null); }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showInfo && <ScrumInfoModal onClose={() => setShowInfo(false)} />}

      {isModalOpen && (
        <OcorrenciaModal
          editing={editing}
          form={form}
          setForm={setForm}
          canManage={canManage}
          canEdit={editing ? canEditThis(editing) : true}
          isResponsavel={editing ? isResponsavel(editing) : false}
          users={users}
          saving={saving}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          onDelete={editing && canManage ? () => handleDelete(editing) : undefined}
        />
      )}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
function ScrumCard({
  o,
  canManage,
  userId,
  users,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  o: ScrumOcorrencia;
  canManage: boolean;
  userId?: string;
  users: { id: string; name: string; avatar?: string | null }[];
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const prio = PRIOS[o.prioridade];
  const canEdit = canManage || (!!userId && o.autor_id === userId);
  return (
    <div
      draggable={canManage}
      onDragStart={() => { setIsDragging(true); onDragStart(); }}
      onDragEnd={() => { setIsDragging(false); onDragEnd(); }}
      className={cn(
        "bg-card border border-border rounded-xl p-3 shadow-sm hover:border-primary/40 hover:shadow-md transition-all group",
        canManage && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 scale-95",
      )}
    >
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: prio.color }} title={`Prioridade ${prio.label}`} />
          <p className="text-[11px] font-black text-foreground uppercase tracking-tight leading-tight truncate group-hover:text-primary transition-colors">{o.titulo}</p>
        </div>
        {canEdit ? (
          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        ) : (
          <Eye className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest" style={{ backgroundColor: `${prio.color}1a`, color: prio.color }}>{prio.label}</span>
        <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-secondary text-muted-foreground flex items-center gap-1">
          <Building2 className="w-2.5 h-2.5" /> {o.setor}
        </span>
      </div>

      <p className="mt-2 text-[10px] font-medium text-muted-foreground leading-snug line-clamp-2 cursor-pointer" onClick={onOpen}>{o.descricao}</p>

      {o.resposta_responsavel && (() => {
        const respIds = o.responsavel_ids?.length ? o.responsavel_ids : o.responsavel_id ? [o.responsavel_id] : [];
        const respNomes = o.responsavel_nomes?.length ? o.responsavel_nomes : o.responsavel_nome ? [o.responsavel_nome] : [];
        const respUsers = respIds.map(id => users.find(u => u.id === id)).filter(Boolean);
        return (
          <div className="mt-2 px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-2">
            <div className="flex -space-x-1.5 shrink-0 mt-0.5">
              {respUsers.length > 0 ? respUsers.map((u) => (
                u?.avatar ? (
                  <img key={u.id} src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover border border-background" />
                ) : (
                  <div key={u?.id} className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center border border-background">
                    <UserIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                )
              )) : (
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <UserIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              {respNomes.length > 0 && (
                <p className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-0.5">{respNomes.join(", ")}</p>
              )}
              <p className="text-[9px] font-medium text-emerald-700 dark:text-emerald-400 leading-snug line-clamp-2">{o.resposta_responsavel}</p>
            </div>
          </div>
        );
      })()}

      <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest truncate flex items-center gap-1">
            <UserIcon className="w-2.5 h-2.5" /> {o.autor_nome || "—"}
          </p>
          {(() => {
            const rIds = o.responsavel_ids?.length ? o.responsavel_ids : o.responsavel_id ? [o.responsavel_id] : [];
            if (!rIds.length) return null;
            const rUsers = rIds.map(id => users.find(u => u.id === id)).filter(Boolean);
            return (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[8px] font-black text-primary">→</span>
                <div className="flex -space-x-1">
                  {rUsers.map((u) => (
                    u?.avatar ? (
                      <img key={u.id} src={u.avatar} alt={u.name} title={u.name} className="w-4 h-4 rounded-full object-cover border border-background" />
                    ) : (
                      <div key={u?.id} title={u?.name} className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center border border-background">
                        <UserIcon className="w-2.5 h-2.5 text-primary" />
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
        <span className="text-[8px] font-bold text-muted-foreground/60 tabular-nums shrink-0">
          {new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ── Modal de criação/edição ──────────────────────────────────────────────────
function OcorrenciaModal({
  editing,
  form,
  setForm,
  canManage,
  canEdit,
  isResponsavel,
  users,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  editing: ScrumOcorrencia | null;
  form: Partial<ScrumOcorrencia>;
  setForm: React.Dispatch<React.SetStateAction<Partial<ScrumOcorrencia>>>;
  canManage: boolean;
  canEdit: boolean;
  isResponsavel: boolean;
  users: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const set = <K extends keyof ScrumOcorrencia>(k: K, v: ScrumOcorrencia[K]) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls =
    "w-full bg-background border border-border rounded-xl px-3 py-2.5 text-[12px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60";
  const labelCls = "text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block";
  const canOnlyRespond = isResponsavel && !canEdit;
  const readOnly = !canEdit && !isResponsavel;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/20 shrink-0">
          <h3 className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Kanban className="w-4 h-4 text-primary" />
            {editing ? (readOnly ? "Visualizar Ocorrência" : "Editar Ocorrência") : "Nova Ocorrência"}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-4">
          <div>
            <label className={labelCls}>Título *</label>
            <input className={inputCls} value={form.titulo || ""} disabled={readOnly || canOnlyRespond} onChange={(e) => set("titulo", e.target.value)} placeholder="Resumo da ocorrência" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Setor *</label>
              <input className={inputCls} value={form.setor || ""} disabled={readOnly || canOnlyRespond} onChange={(e) => set("setor", e.target.value)} placeholder="Ex.: Comercial, Logística..." />
            </div>
            <div>
              <label className={labelCls}>Prioridade</label>
              <select className={inputCls} value={form.prioridade || "media"} disabled={readOnly || canOnlyRespond} onChange={(e) => set("prioridade", e.target.value as ScrumPrioridade)}>
                {(Object.keys(PRIOS) as ScrumPrioridade[]).map((p) => (
                  <option key={p} value={p}>{PRIOS[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Ocorrência / Problema *</label>
            <textarea className={cn(inputCls, "min-h-[90px] resize-y")} value={form.descricao || ""} disabled={readOnly || canOnlyRespond} onChange={(e) => set("descricao", e.target.value)} placeholder="Descreva o problema do setor" />
          </div>

          <div>
            <label className={labelCls}>Solução Proposta</label>
            <textarea className={cn(inputCls, "min-h-[70px] resize-y")} value={form.solucao_proposta || ""} disabled={readOnly || canOnlyRespond} onChange={(e) => set("solucao_proposta", e.target.value)} placeholder="Sugestão de solução (opcional)" />
          </div>

          {/* Área da diretoria */}
          {editing && canManage && (
            <div className="mt-2 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-4">
              <p className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Análise da Diretoria
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={form.status || "aberto"} onChange={(e) => set("status", e.target.value as ScrumStatus)}>
                    {COLUNAS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Responsáveis</label>
                  <div className={cn(inputCls, "max-h-[120px] overflow-y-auto space-y-1 !py-1.5")}>
                    {users.map((u) => {
                      const ids = form.responsavel_ids || [];
                      const checked = ids.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-primary/5">
                          <input
                            type="checkbox"
                            checked={checked}
                            className="accent-primary w-3.5 h-3.5"
                            onChange={() => {
                              const nomes = form.responsavel_nomes || [];
                              if (checked) {
                                const idx = ids.indexOf(u.id);
                                setForm((f) => ({
                                  ...f,
                                  responsavel_ids: ids.filter((_, i) => i !== idx),
                                  responsavel_nomes: nomes.filter((_, i) => i !== idx),
                                }));
                              } else {
                                setForm((f) => ({
                                  ...f,
                                  responsavel_ids: [...ids, u.id],
                                  responsavel_nomes: [...nomes, u.name],
                                }));
                              }
                            }}
                          />
                          <span className="text-[10px] font-medium truncate">{u.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Decisão / Observação</label>
                <textarea className={cn(inputCls, "min-h-[60px] resize-y")} value={form.decisao || ""} onChange={(e) => set("decisao", e.target.value)} placeholder="Encaminhamento definido na reunião" />
              </div>
            </div>
          )}

          {/* Somente leitura da decisão para não-gestores */}
          {editing && !canManage && form.decisao && (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Decisão da Diretoria</p>
              <p className="text-[12px] font-medium text-foreground whitespace-pre-wrap">{form.decisao}</p>
            </div>
          )}

          {/* Campo de resposta do responsável */}
          {editing && (isResponsavel || canManage) && (
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <p className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5" /> Resposta do Responsável
              </p>
              <textarea
                className={cn(inputCls, "min-h-[70px] resize-y")}
                value={form.resposta_responsavel || ""}
                onChange={(e) => set("resposta_responsavel", e.target.value)}
                placeholder="Descreva o que foi feito ou o andamento da ação..."
              />
            </div>
          )}

          {/* Somente leitura da resposta para quem não é responsável nem gestor */}
          {editing && !isResponsavel && !canManage && form.resposta_responsavel && (
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <p className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">Resposta do Responsável</p>
              <p className="text-[12px] font-medium text-foreground whitespace-pre-wrap">{form.resposta_responsavel}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-secondary/10 flex items-center justify-between gap-3 shrink-0">
          {onDelete ? (
            <button onClick={onDelete} className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-all" title="Excluir">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-secondary transition-all">
              {readOnly ? "Fechar" : "Cancelar"}
            </button>
            {!readOnly && (
              <button
                onClick={onSave}
                disabled={saving || (!canOnlyRespond && (!form.titulo?.trim() || !form.setor?.trim() || !form.descricao?.trim()))}
                className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-40"
              >
                {saving ? "Salvando..." : editing ? "Salvar" : "Registrar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal "Como funciona o Scrum?" ───────────────────────────────────────────
function ScrumInfoModal({ onClose }: { onClose: () => void }) {
  const pilares = [
    { icon: Eye, titulo: "Transparência", texto: "Todos enxergam as ocorrências e o andamento no mesmo quadro." },
    { icon: RefreshCw, titulo: "Inspeção", texto: "Na reunião de segunda revisamos cada problema e o que já foi feito." },
    { icon: Repeat, titulo: "Adaptação", texto: "Ajustamos as ações a cada ciclo até o problema ser resolvido." },
  ];

  const empresas = [
    "Spotify", "Google", "Amazon", "Microsoft", "Netflix", "Apple",
    "Meta", "IBM", "Salesforce", "Adobe", "Tesla",
    "Nubank", "Mercado Livre", "iFood", "Magalu",
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/20 shrink-0">
          <h3 className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Como funciona o Scrum?
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-5">
          <p className="text-[12px] font-medium text-muted-foreground leading-relaxed">
            <span className="font-black text-foreground">Scrum</span> é uma das <span className="font-black text-foreground">metodologias ágeis</span> —
            uma forma de resolver problemas em <span className="font-black text-foreground">ciclos curtos e frequentes</span>, em vez de esperar
            tudo estar perfeito. A ideia é simples: registrar o problema, discutir em equipe, definir uma ação, executar e revisar no ciclo
            seguinte — melhorando continuamente.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {pilares.map((p) => (
              <div key={p.titulo} className="p-3 rounded-xl bg-secondary/30 border border-border/60">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <p.icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-[10px] font-black text-foreground uppercase tracking-tight mb-0.5">{p.titulo}</p>
                <p className="text-[10px] font-medium text-muted-foreground leading-snug">{p.texto}</p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-2">Como aplicamos aqui</p>
            <p className="text-[11px] font-medium text-foreground leading-relaxed">
              Cada líder registra as ocorrências do seu setor no quadro (coluna <span className="font-black">Aberto</span>).
              Toda <span className="font-black">segunda-feira</span> nos reunimos: a diretoria analisa cada ocorrência (<span className="font-black">Em Análise</span>),
              define responsável e ação (<span className="font-black">Em Andamento</span>) e acompanha até concluir (<span className="font-black">Resolvido</span>).
            </p>
          </div>

          <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">
              Grandes empresas que usam metodologias ágeis / Scrum
            </p>
            <div className="flex flex-wrap gap-1.5">
              {empresas.map((e) => (
                <span key={e} className="px-2.5 py-1 rounded-lg bg-secondary/60 border border-border/60 text-[10px] font-bold text-foreground">
                  {e}
                </span>
              ))}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground leading-relaxed mt-3">
              A <span className="font-black text-foreground">Spotify</span> ficou famosa pelo seu modelo ágil de squads e tribes.
              <span className="font-black text-foreground"> Google</span>, <span className="font-black text-foreground">Amazon</span>,
              <span className="font-black text-foreground"> Microsoft</span> e <span className="font-black text-foreground">Netflix</span> usam
              times ágeis para lançar e melhorar produtos rápido. No Brasil, <span className="font-black text-foreground">Nubank</span>,
              <span className="font-black text-foreground"> Mercado Livre</span> e <span className="font-black text-foreground">iFood</span> crescem
              apoiados nessas práticas. A lógica é sempre a mesma: <span className="font-black text-foreground">resolver problemas em equipe, de forma contínua e transparente</span>.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-secondary/10 flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-all">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
