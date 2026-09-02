import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/uploadImage";
import { PERMISSION_GROUPS } from "@/lib/menu-config";
import {
  UserPlus,
  Search,
  Shield,
  Edit3,
  Trash2,
  X,
  ShieldCheck,
  UserCog,
  UserCheck,
  Building2,
  Briefcase,
  Camera,
  Phone,
  Puzzle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import { gerarRamaisPDF } from "@/lib/ramais-pdf";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ativo" | "suspenso";
  avatar: string;
  lastLogin: string;
  permissions: string[];
  operatorCode?: string;
  company: "Carflax" | "Zelex" | "JCM" | "Consultoria";
  department: string;
  birthDate?: string;
  admissionDate?: string;
  coletorPermissions?: Record<string, boolean>;
  is_admin?: boolean;
  responsavelId?: string;
  isLeader?: boolean;
  ramal?: string;
}

export function UsersView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters State
  const [filterRole, setFilterRole] = useState("Todos os Cargos");
  const [filterCompany, setFilterCompany] = useState("Todas as Empresas");
  const [filterDepartment, setFilterDepartment] = useState("Todos os Setores");

  interface NewUser {
    name: string;
    email: string;
    role: string;
    company: User["company"];
    department: string;
    avatar: string;
    permissions: string[];
    operatorCode: string;
    birthDate: string;
    admissionDate: string;
    coletorPermissions: Record<string, boolean>;
    _avatarFile?: File;
    is_admin: boolean;
    responsavelId: string;
    isLeader: boolean;
    ramal: string;
  }

  // User State for Modal
  const [newUser, setNewUser] = useState<NewUser>({
    name: "",
    email: "",
    role: "vendedor",
    company: "Carflax",
    department: "Comercial",
    avatar: "",
    permissions: ["Geral"],
    operatorCode: "",
    birthDate: "",
    admissionDate: "",
    coletorPermissions: {
      can_conferencia: false,
      can_separacao: false,
      can_consulta_estoque: false,
      can_armazenamento: false,
      can_etiquetas: false,
      can_localizacao: false,
      can_embalagens: false,
      can_inventario: false
    },
    is_admin: false,
    responsavelId: "",
    isLeader: false,
    ramal: ""
  });

  const permissionGroups = PERMISSION_GROUPS;

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName]
    );
  };

  const companies = ["Carflax", "Zelex", "JCM", "Consultoria"];

  const applyDateMask = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const maskedToISO = (masked: string) => {
    const digits = masked.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  };

  const isoToMasked = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };

  const getAvatarSrc = (avatar: string, name: string) =>
    avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setNewUser(u => ({ ...u, avatar: URL.createObjectURL(file), _avatarFile: file }));
  };

  // Mapa setor → cargos disponíveis
  const ROLES_BY_DEPARTMENT: Record<string, string[]> = {
    "Estoque":      ["Gerente de Estoque", "Conferente", "Auxiliar de Expedição", "Auxiliar de Estoque", "Ajudante Geral", "Motorista"],
    "Segurança":    ["Gerente de Segurança", "Auxiliar de Segurança"],
    "Vendas":       ["Gerente de Vendas", "Supervisor de Vendas", "Supervisora de Vendas", "Vendedor B2B", "Vendedor B2C", "Auxiliar de Vendas", "Check-out"],
    "Compras":      ["Gerente de Compras", "Auxiliar de Compras"],
    "Marketing":    ["Gerente de Marketing", "Auxiliar de Marketing", "Atendente do Tráfego"],
    "Recursos H":   ["Gerente de RH", "Auxiliar de RH"],
    "Financeiro":   ["Gerente Administrativo", "Assistente Administrativo", "Gerente Contábil", "Auxiliar Contábil", "Faturista", "Caixa"],
    "Administrativo": ["Auxiliar Administrativo"],
    "Tecnologia":   ["Gerente de TI", "Auxiliar de TI", "admin"],
    "Limpeza":      ["Gerente de Limpeza", "Auxiliar de Limpeza"],
    "Consultoria":  ["Consultor"],
    "Diretoria":    ["Diretor", "Diretora"],
  };

  const departments = [
    "Estoque", "Segurança", "Vendas", "Compras",
    "Marketing", "Recursos H", "Financeiro", "Administrativo", "Tecnologia", "Limpeza",
    "Consultoria", "Diretoria",
  ];

  // Cargos filtrados pelo setor selecionado (ou todos se não mapeado)
  const allRoles = [...new Set(Object.values(ROLES_BY_DEPARTMENT).flat())].sort();
  const rolesForDepartment = (dept: string): string[] =>
    ROLES_BY_DEPARTMENT[dept] ?? allRoles;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .order("name");

      if (!error && data) {
        setUsers(data.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          avatar: u.avatar || "",
          lastLogin: u.last_login ? new Date(u.last_login).toLocaleString("pt-BR") : "Nunca",
          permissions: u.permissions || ["Geral"],
          operatorCode: u.operator_code || "",
          company: u.company,
          department: u.department,
          birthDate: isoToMasked(u.birth_date || ""),
          admissionDate: isoToMasked(u.admission_date || ""),
          coletorPermissions: u.coletor_permissions || {},
          is_admin: u.is_admin || false,
          responsavelId: u.responsavel_id || "",
          isLeader: u.is_leader || false,
          ramal: u.ramal || ""
        })));
      }
      setLoading(false);
    }
    fetchUsers();
  }, []);

  const responsavelOptions = useMemo(() => {
    const candidates = users.filter((u) => u.isLeader && u.id !== editingUser?.id);
    return [
      { label: "Nenhum", value: "" },
      ...candidates.map((u) => ({ label: `${u.name} (${u.role})`, value: u.id })),
    ];
  }, [users, editingUser?.id]);

  const filteredUsers = users
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === "Todos os Cargos" || user.role === filterRole;
      const matchesCompany = filterCompany === "Todas as Empresas" || user.company === filterCompany;
      const matchesDept = filterDepartment === "Todos os Setores" || user.department === filterDepartment;

      return matchesSearch && matchesRole && matchesCompany && matchesDept;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setNewUser({
      name: user.name,
      email: user.email,
      role: user.role,
      company: user.company,
      department: user.department,
      avatar: user.avatar,
      permissions: user.permissions || [],
      operatorCode: user.operatorCode || "",
      birthDate: isoToMasked(user.birthDate || ""),
      admissionDate: isoToMasked(user.admissionDate || ""),
      coletorPermissions: user.coletorPermissions || {
        can_conferencia: false,
        can_separacao: false,
        can_consulta_estoque: false,
        can_armazenamento: false,
        can_etiquetas: false,
        can_localizacao: false,
        can_embalagens: false,
        can_inventario: false
      },
      is_admin: user.is_admin || false,
      responsavelId: user.responsavelId || "",
      isLeader: user.isLeader || false,
      ramal: user.ramal || ""
    });
    setAvatarLoading(false);
    setSaving(false);
    setIsAddModalOpen(true);
  };

  const handleSaveUser = async () => {
    setSaving(true);
    const avatarFile = newUser._avatarFile;
    let avatarUrl: string | null | undefined;

    if (avatarFile) {
      try {
        console.log("[Users] Fazendo upload de avatar para bucket 'avatares'...");
        avatarUrl = await uploadImage(avatarFile, "avatares");
        console.log("[Users] Resultado do upload:", avatarUrl);
        if (!avatarUrl) {
          console.error("[Users] Upload falhou — verifique a policy de INSERT no bucket 'avatares'");
        }
      } catch (err: unknown) {
        console.error("[Users] Erro no upload:", err);
        if (err instanceof Error && err.message?.includes("Refresh Token Not Found")) {
          alert("Sua sessão expirou. Por favor, saia e entre novamente para continuar.");
          setSaving(false);
          return;
        }
      }
    }

    // Se upload falhou ou não havia arquivo novo, manter avatar existente
    const finalAvatar = avatarUrl
      ?? (newUser.avatar?.startsWith("blob:") ? editingUser?.avatar || "" : newUser.avatar)
      ?? editingUser?.avatar
      ?? "";

    const finalPayload = {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      company: newUser.company,
      department: newUser.department,
      avatar: finalAvatar,
      permissions: newUser.permissions,
      operator_code: newUser.operatorCode || null,
      birth_date: maskedToISO(newUser.birthDate || "") || null,
      admission_date: maskedToISO(newUser.admissionDate || "") || null,
      coletor_permissions: newUser.coletorPermissions,
      is_admin: newUser.is_admin,
      responsavel_id: newUser.responsavelId || null,
      is_leader: newUser.isLeader,
      ramal: newUser.ramal || null
    };

    console.log("[Users] Salvando usuário. Payload final:", finalPayload);

    try {
      if (editingUser) {
        const { error } = await supabase.from("usuarios").update(finalPayload).eq("id", editingUser.id);
        if (error) { console.error("[Users] Erro ao editar:", error); return; }
        
        // Update local state immediately
        setUsers(prev => prev.map(u => u.id === editingUser.id ? {
          ...u,
          ...newUser,
          avatar: finalAvatar,
          operatorCode: newUser.operatorCode,
          birthDate: newUser.birthDate,
          admissionDate: newUser.admissionDate,
          coletorPermissions: newUser.coletorPermissions,
        } : u));
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("usuarios")
          .insert({ ...finalPayload, status: "ativo" })
          .select("id")
          .single();
        if (insertError) { console.error("[Users] Erro ao criar:", insertError); setSaving(false); return; }

        // Cria automaticamente a conta no Auth do Supabase (senha: @carflax@)
        if (newUser.email) {
          supabase.functions.invoke("create-auth-user", {
            body: {
              email: newUser.email,
              name: newUser.name,
              hub_user_id: inserted?.id ?? null,
            },
          }).then(({ error: fnError }) => {
            if (fnError) console.warn("[Users] Aviso: não foi possível criar conta no Auth:", fnError.message);
            else console.log("[Users] Conta no Auth criada automaticamente para:", newUser.email);
          });
        }

        const { data: all } = await supabase.from("usuarios").select("*").order("name");
        if (all) setUsers(all.map(u => ({
          id: u.id, name: u.name, email: u.email, role: u.role,
          status: u.status, avatar: u.avatar || "", lastLogin: u.last_login ? new Date(u.last_login).toLocaleString("pt-BR") : "Nunca",
          permissions: u.permissions || [], operatorCode: u.operator_code || "",
          company: u.company, department: u.department,
          birthDate: isoToMasked(u.birth_date || ""),
          admissionDate: isoToMasked(u.admission_date || ""),
          coletorPermissions: u.coletor_permissions || {},
          is_admin: u.is_admin || false,
          responsavelId: u.responsavel_id || "",
          isLeader: u.is_leader || false,
          ramal: u.ramal || ""
        })));

      }
      setIsAddModalOpen(false);
      setEditingUser(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;

    // Busca o email antes de excluir
    const userToDelete = users.find(u => u.id === id);

    // ─── Nullificar / deletar todas as FKs que referenciam este usuário ─────
    // Mapeado a partir das migrations — evita erro 23503 ao deletar.
    const cleanupResults = await Promise.allSettled([
      // esteira_notificacoes: destino é NOT NULL → deletar; actor_id → nulificar
      supabase.from("esteira_notificacoes").delete().eq("destino", id),
      supabase.from("esteira_notificacoes").update({ actor_id: null }).eq("actor_id", id),
      // esteira_subquadros: created_by → nulificar
      supabase.from("esteira_subquadros").update({ created_by: null }).eq("created_by", id),
      // marketing_esteira: owner_id e created_by → nulificar
      supabase.from("marketing_esteira").update({ owner_id: null }).eq("owner_id", id),
      supabase.from("marketing_esteira").update({ created_by: null }).eq("created_by", id),
      // marketing_clientes: vendedor_id → nulificar
      supabase.from("marketing_clientes").update({ vendedor_id: null }).eq("vendedor_id", id),
      // usuarios: responsavel_id tem ON DELETE SET NULL na migration → automático,
      // mas forçamos manualmente por segurança
      supabase.from("usuarios").update({ responsavel_id: null }).eq("responsavel_id", id),
    ]);

    // Log de qualquer cleanup que falhou (informativo, não bloqueia)
    cleanupResults.forEach((r, i) => {
      if (r.status === "rejected") console.warn(`[Users] Cleanup FK[${i}] falhou:`, r.reason);
    });

    const { error } = await supabase.from("usuarios").delete().eq("id", id);
    if (error) {
      console.error("[Users] Erro ao excluir — JSON:", JSON.stringify(error, null, 2));
      alert(`Não foi possível excluir o usuário.\nTabela bloqueando: ${error.details || error.message}`);
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== id));

    // Remove também do Auth do Supabase (em segundo plano)
    if (userToDelete?.email) {
      supabase.functions.invoke("delete-auth-user", {
        body: { email: userToDelete.email },
      }).then(({ error: fnError }) => {
        if (fnError) console.warn("[Users] Aviso: não foi possível remover do Auth:", fnError.message);
        else console.log("[Users] Conta removida do Auth para:", userToDelete.email);
      });
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin": return "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50";
      case "vendedor": return "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50";
      case "logistica": return "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50";
      default: return "bg-secondary/50 dark:bg-slate-800/50 text-muted-foreground border-border";
    }
  };

  const Switch = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
      onClick={(e) => { e.preventDefault(); onChange(); }}
      className={cn(
        "relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
        enabled ? "bg-blue-600" : "bg-slate-200"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
        enabled ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  );

  return (
    <div className="flex-1 flex flex-col gap-4 pb-6 overflow-hidden bg-background">
      {/* TINY TOOLBAR */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">Gestão de Equipe</h2>
            <p className="text-muted-foreground text-[9px] font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
              <UserCog className="w-3 h-3 text-blue-500" />
              Controle de Acessos por Empresa e Setor
            </p>
          </div>

          <div className="flex items-center gap-2">
          <button
            onClick={() => gerarRamaisPDF(users)}
            title="Abrir lista de ramais em PDF (A4)"
            className="h-8 w-8 shrink-0 bg-card border border-border rounded-lg text-muted-foreground hover:text-blue-600 hover:border-blue-600/50 transition-all flex items-center justify-center shadow-sm active:scale-95"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const a = document.createElement("a");
              a.href = "/ramais-extension.zip";
              a.download = "ramais-extension.zip";
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(
                () =>
                  alert(
                    "Extensão Carflax Hub baixada!\n\nInclui: Ramais, Entregas e Fretes.\n\nComo instalar no Chrome/Edge:\n1) Descompacte o arquivo .zip\n2) Abra chrome://extensions (ou edge://extensions)\n3) Ative o \"Modo do desenvolvedor\"\n4) Clique em \"Carregar sem compactação\" e selecione a pasta descompactada"
                  ),
                400
              );
            }}
            title="Baixar extensão Carflax Hub (Ramais, Entregas, Fretes)"
            className="h-8 w-8 shrink-0 bg-card border border-border rounded-lg text-muted-foreground hover:text-blue-600 hover:border-blue-600/50 transition-all flex items-center justify-center shadow-sm active:scale-95"
          >
            <Puzzle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setEditingUser(null);
              setNewUser({ 
                name: "", 
                email: "", 
                role: "vendedor", 
                company: "Carflax", 
                department: "Comercial", 
                avatar: "", 
                permissions: ["Geral"], 
                operatorCode: "", 
                birthDate: "", 
                admissionDate: "",
                coletorPermissions: {
                  can_conferencia: false,
                  can_separacao: false,
                  can_consulta_estoque: false,
                  can_armazenamento: false,
                  can_etiquetas: false,
                  can_localizacao: false,
                  can_embalagens: false,
                  can_inventario: false
                },
                is_admin: false,
                responsavelId: "",
                isLeader: false,
                ramal: ""
              });
              setAvatarLoading(false);
              setSaving(false);
              setIsAddModalOpen(true);
            }}
            className="h-8 px-4 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Novo Usuário
          </button>
          </div>
        </div>

        {/* FILTERS BAR (Simplified with TinyDropdown) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold text-foreground outline-none focus:border-blue-600/50 transition-all placeholder:text-muted-foreground/50 shadow-sm"
            />
          </div>

          <TinyDropdown
            value={filterCompany}
            options={["Todas as Empresas", ...companies]}
            onChange={setFilterCompany}
            icon={Building2}
            variant="blue"
            placeholder="Todas as Empresas"
          />

          <TinyDropdown
            value={filterDepartment}
            options={["Todos os Setores", ...departments]}
            onChange={setFilterDepartment}
            icon={Briefcase}
            variant="amber"
            placeholder="Todos os Setores"
          />

          <TinyDropdown
            value={filterRole}
          options={["Todos os Cargos", ...allRoles]}
            onChange={setFilterRole}
            icon={Shield}
            variant="emerald"
            placeholder="Todos os Cargos"
          />
        </div>
      </div>

      {/* USERS TABLE */}
      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-secondary/50 backdrop-blur-md border-b border-border">
              <tr>
                <th className="py-2.5 px-6 text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Colaborador</th>
                <th className="py-2.5 px-6 text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Empresa / Setor</th>
                <th className="py-2.5 px-6 text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Cargo</th>
                <th className="py-2.5 px-6 text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Ramal</th>
                <th className="py-2.5 px-6 text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Status</th>
                <th className="py-2.5 px-6 text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <>
                  {Array.from({ length: 15 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-secondary/50" />
                          <div className="space-y-2">
                            <div className="h-2 w-24 bg-secondary/50 rounded" />
                            <div className="h-2 w-32 bg-secondary/20 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <div className="space-y-2">
                          <div className="h-2 w-20 bg-secondary/50 rounded" />
                          <div className="h-2 w-16 bg-secondary/20 rounded" />
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <div className="h-5 w-16 bg-secondary/50 rounded-lg" />
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-secondary/50" />
                          <div className="h-2 w-12 bg-secondary/20 rounded" />
                        </div>
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <div className="w-7 h-7 bg-secondary/20 rounded-lg" />
                          <div className="w-7 h-7 bg-secondary/20 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!loading && filteredUsers.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground text-[10px] font-black uppercase tracking-widest">Nenhum usuário encontrado.</td></tr>
              )}
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-secondary/20 transition-colors group">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-secondary border border-border relative shrink-0 flex items-center justify-center">
                        <img
                          src={getAvatarSrc(user.avatar, user.name)}
                          alt={user.name}
                          className="w-full h-full object-cover transition-opacity duration-300"
                          onLoad={(e) => {
                            e.currentTarget.style.opacity = "1";
                          }}
                          onError={(e) => {
                            e.currentTarget.src = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`;
                          }}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-black text-foreground uppercase tracking-tight leading-none truncate">{user.name}</span>
                        <span className="text-[9px] font-bold text-muted-foreground truncate mt-0.5">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-foreground/80 uppercase leading-none tracking-tight">{user.company}</span>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter mt-1">{user.department}</span>
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-tight",
                      getRoleBadge(user.role)
                    )}>
                      {user.role}
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    {user.ramal ? (
                      <span className="text-[10px] font-black text-foreground/80 tabular-nums tracking-tight">{user.ramal}</span>
                    ) : (
                      <span className="text-[9px] font-bold text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-1.5 h-1.5 rounded-full", user.status === "ativo" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-500")} />
                      <span className={cn("text-[9px] font-black uppercase tracking-widest", user.status === "ativo" ? "text-emerald-500" : "text-rose-500")}>
                        {user.status}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleEditClick(user)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-blue-500 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteUser(user.id)} className="p-2 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL REDESIGNED WITH COMPANY & DEPT */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => setIsAddModalOpen(false)} className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-900/50"><UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" /></div>
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-tight">{editingUser ? "Editar Perfil" : "Nova Conta"}</h3>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Vínculo Corporativo e Permissões</p>
                </div>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-secondary rounded-xl text-muted-foreground transition-all"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-8 overflow-y-auto scrollbar-hide flex flex-col gap-6">
              {/* Profile Photo Section */}
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl border-4 border-secondary shadow-xl overflow-hidden bg-secondary/50 flex items-center justify-center transition-transform duration-500 group-hover:scale-105 relative">
                    <>
                      {avatarLoading && <div className="absolute inset-0 bg-secondary animate-pulse z-10" />}
                      <img
                        src={getAvatarSrc(newUser.avatar, newUser.name || "user")} alt="Avatar"
                        onLoad={() => setAvatarLoading(false)}
                        style={{ opacity: avatarLoading ? 0 : 1, transition: "opacity 0.3s", position: "relative", zIndex: 1 }}
                        className="w-full h-full object-cover"
                      />
                    </>
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center cursor-pointer backdrop-blur-[2px] z-10">
                      <Camera className="w-6 h-6 text-white mb-1" />
                      <span className="text-[8px] font-black text-white uppercase tracking-widest">Alterar</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                  </div>
                </div>
                <div className="text-center mt-2">
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Foto de Perfil</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value.toUpperCase() })} placeholder="DANILO OLIVEIRA" className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-blue-600/50 transition-all uppercase placeholder:text-muted-foreground/30" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">E-mail Corporativo</label>
                  <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="email@carflax.com" className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-blue-600/50 transition-all placeholder:text-muted-foreground/30" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Empresa</label>
                  <TinyDropdown
                    value={newUser.company}
                    options={companies}
                    onChange={(val) => setNewUser({ ...newUser, company: val as User["company"] })}
                    icon={Building2}
                    variant="blue"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Setor</label>
                  <TinyDropdown
                    value={newUser.department}
                    options={departments}
                    onChange={(val) => {
                      const firstRole = rolesForDepartment(val)[0] ?? "";
                      setNewUser({ ...newUser, department: val, role: firstRole });
                    }}
                    icon={Briefcase}
                    variant="slate"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo</label>
                  <TinyDropdown
                    value={newUser.role}
                    options={rolesForDepartment(newUser.department)}
                    onChange={(val) => setNewUser({ ...newUser, role: val })}
                    icon={Shield}
                    variant="emerald"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Cód. Operador</label>
                  <input 
                    type="text" 
                    maxLength={5}
                    value={newUser.operatorCode}
                    onChange={(e) => setNewUser({ ...newUser, operatorCode: e.target.value.replace(/\D/g, "") })}
                    placeholder="00000"
                    className="w-full h-11 bg-background border border-border rounded-xl px-4 text-xs font-bold text-foreground outline-none focus:border-blue-600/50 transition-all text-center placeholder:text-muted-foreground/30" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Ramal</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={newUser.ramal}
                    onChange={(e) => setNewUser({ ...newUser, ramal: e.target.value.replace(/\D/g, "") })}
                    placeholder="0000"
                    className="w-full h-11 bg-background border border-border rounded-xl px-4 text-xs font-bold text-foreground outline-none focus:border-blue-600/50 transition-all text-center placeholder:text-muted-foreground/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Data de Nascimento</label>
                  <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={newUser.birthDate} onChange={(e) => setNewUser({ ...newUser, birthDate: applyDateMask(e.target.value) })} className="w-full h-11 bg-background border border-border rounded-xl px-4 text-xs font-bold text-foreground outline-none focus:border-blue-600/50 transition-all placeholder:text-muted-foreground/30" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Data de Admissão</label>
                  <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={newUser.admissionDate} onChange={(e) => setNewUser({ ...newUser, admissionDate: applyDateMask(e.target.value) })} className="w-full h-11 bg-background border border-border rounded-xl px-4 text-xs font-bold text-foreground outline-none focus:border-blue-600/50 transition-all placeholder:text-muted-foreground/30" />
                </div>

                <div className="col-span-2 flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/10">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-foreground uppercase tracking-tight">Líder</span>
                      <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tight">Pode ser selecionado como responsável de outros colaboradores</span>
                    </div>
                  </div>
                  <Switch enabled={newUser.isLeader} onChange={() => setNewUser({ ...newUser, isLeader: !newUser.isLeader })} />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Responsável (Líder Direto)</label>
                  <TinyDropdown
                    value={newUser.responsavelId}
                    options={responsavelOptions}
                    onChange={(val) => setNewUser({ ...newUser, responsavelId: val })}
                    icon={UserCheck}
                    variant="blue"
                    placeholder="Nenhum"
                    className="w-full"
                  />
                </div>
              </div>



              {/* Permissions Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-[10px] font-black text-foreground uppercase tracking-widest">Módulos do Sistema</span>
                </div>
                
                <div className="space-y-2">
                  {permissionGroups.map((group) => {
                    const isExpanded = expandedGroups.includes(group.name);
                    const activeCount = group.modules.filter(m => newUser.permissions.includes(m)).length;
                    
                    return (
                      <div key={group.name} className="border border-border rounded-2xl overflow-hidden bg-secondary/10">
                        <button
                          onClick={(e) => { e.preventDefault(); toggleGroup(group.name); }}
                          className="w-full flex items-center justify-between p-3 hover:bg-secondary/20 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{group.name}</span>
                            {activeCount > 0 && (
                              <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{activeCount}</span>
                            )}
                          </div>
                          <svg className={cn("w-3 h-3 text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div className="p-3 pt-0 grid grid-cols-1 gap-2 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
                            {group.modules.map((module) => {
                              const hasAccess = newUser.permissions.includes(module);
                              return (
                                <div key={module} onClick={() => {
                                  const updated = hasAccess ? newUser.permissions.filter(p => p !== module) : [...newUser.permissions, module];
                                  setNewUser({ ...newUser, permissions: updated });
                                }} className={cn("flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer", hasAccess ? "bg-blue-500/10 border-blue-600/30" : "bg-background border-border")}>
                                  <span className={cn("text-[10px] font-bold uppercase tracking-tight", hasAccess ? "text-blue-500" : "text-muted-foreground/60")}>{module}</span>
                                  <Switch enabled={hasAccess} onChange={() => { }} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coletor Permissions Section */}

            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <button onClick={() => setIsAddModalOpen(false)} disabled={saving} className="flex-1 py-3 bg-secondary text-muted-foreground rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-secondary/70 transition-all disabled:opacity-50">Cancelar</button>
              <button onClick={handleSaveUser} disabled={saving} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/10 disabled:opacity-70 flex items-center justify-center gap-2">
                {saving && <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>}
                {saving ? "Salvando..." : editingUser ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
