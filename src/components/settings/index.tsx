import { useState, Fragment } from "react";
import {
  User,
  Smartphone,
  Mail,
  Camera,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Bell,
  Monitor,
  Sun,
  Moon,
  Check,
  MessageSquare,
  Briefcase,
  ShieldAlert,
  Palette,
  Image as ImageIcon,
  Sparkles,
  Plus,
  FileBadge,
  Trash2,
  Send,
  Loader2,
  Download,
  Copy,
  Phone,
  Globe,
  MapPin,
  Building2,
  Signature,
  Truck,
  DollarSign,
  ChevronDown,
  ChevronRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useLossReasons, LOSS_REASON_ALL } from "@/lib/crm-service";

interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  department?: string;
  phone?: string;
  whatsapp?: string;
  ramal?: string;
  permissions?: string[];
  is_admin?: boolean;
  is_leader?: boolean;
}

interface SettingsSectionProps {
  externalTab?: string;
  userProfile?: UserProfile | null;
}

/* ─────────────────────────────────────────────
   BANNERS
   Gestão de imagens de topo e avisos
   ───────────────────────────────────────────── */
function BannersTab({ userProfile }: { userProfile?: UserProfile | null }) {
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [banners] = useState([
    { id: 1, title: "Banner Promoção Abril", url: "https://images.unsplash.com/photo-1549416805-0e6d62635928?q=80&w=1200", dims: "1800 x 600px" },
    { id: 2, title: "Aviso Nova Filial", url: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=1200", dims: "1800 x 600px" },
  ]);
  const canManage = userProfile?.is_leader || userProfile?.role === "admin";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-50 dark:border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
              <ImageIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">Banners da Home</h4>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Altere as imagens e efeitos de transição</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 dark:bg-white/5 px-4 py-3 rounded-xl border border-slate-100 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Sparkles className={cn("w-4 h-4", transitionEnabled ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-700")} />
              <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest leading-none">Efeito Transição</span>
            </div>
            <Toggle checked={transitionEnabled} onChange={setTransitionEnabled} disabled={!canManage} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {banners.map((b) => (
            <div key={b.id} className="group relative bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden hover:border-blue-300 dark:hover:border-blue-500/50 transition-all duration-300">
              <div className="aspect-[3/1] bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
                <img src={b.url} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {canManage && (
                    <Button className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest border-none">
                      SUBSTITUIR IMAGEM
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">{b.title}</p>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Dimensões: {b.dims}</p>
                </div>
                {canManage && (
                  <Button className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 p-0 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-100 transition-all">
                    <ImageIcon className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* ADD NEW CARD */}
          {canManage && (
            <button className="aspect-[3/1] md:aspect-auto flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50/50 dark:bg-white/[0.02] hover:bg-blue-50/30 dark:hover:bg-blue-500/5 hover:border-blue-300 dark:hover:border-blue-500/30 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all">
                <Plus className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
              </div>
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 group-hover:text-blue-600 uppercase tracking-widest">Adicionar Banner</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-provider";

interface SettingsSectionProps {
  externalTab?: string;
}

/* ─────────────────────────────────────────────
   TINY TOGGLE
   Standardizado para o sistema Carflax
───────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ease-in-out",
        checked ? "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]" : "bg-slate-200 dark:bg-slate-800",
        disabled && "opacity-30 cursor-not-allowed shadow-none"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-300 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────
   TINY INPUT
   Estilo unificado de alta densidade
───────────────────────────────────────────── */
function SettingsInput({
  label,
  value,
  onChange,
  icon: Icon,
  type = "text",
  placeholder
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: LucideIcon;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5 px-0.5">
      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 opacity-80">{label}</label>
      <div className="relative group">
        <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-600 group-focus-within:text-blue-500 transition-colors" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600/50 focus:ring-4 focus:ring-blue-600/5 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700 shadow-sm"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TINY PASSWORD FIELD
───────────────────────────────────────────── */
function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  strength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  strength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-600 group-focus-within:text-blue-500 transition-colors" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-11 pr-11 py-3 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700 shadow-sm"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {strength !== undefined && value.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 mt-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1 flex-1 rounded-full transition-all",
                n <= strength
                  ? strength <= 1 ? "bg-rose-500" : strength === 2 ? "bg-amber-500" : strength === 3 ? "bg-blue-500" : "bg-emerald-500"
                  : "bg-slate-100"
              )}
            />
          ))}
          <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 tracking-tighter ml-1 uppercase">
            {strength <= 1 ? "Fraca" : strength === 2 ? "Média" : strength === 3 ? "Boa" : "Forte"}
          </span>
        </div>
      )}
    </div>
  );
}

function getStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

/* ─────────────────────────────────────────────
   MEU PERFIL
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   MEU PERFIL - REDESIGN ESTRUTURADO
   Foco em cards, hierarquia e organização
───────────────────────────────────────────── */
function formatPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 10) {
    digits = digits.slice(2);
  }
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function ProfileTab({ userProfile }: { userProfile?: UserProfile | null }) {
  const [form, setForm] = useState(() => ({
    nome: userProfile?.name || "",
    email: userProfile?.email || "",
    telefone: formatPhone(userProfile?.phone || userProfile?.whatsapp || ""),
    ramal: userProfile?.ramal || "",
    cargo: userProfile?.role || "",
    avatar: userProfile?.avatar || "",
  }));
  const [isSaved, setIsSaved] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Sincroniza quando o perfil muda (ex: após update ou recarregamento)
  useEffect(() => {
    if (!userProfile?.id) return;
    setForm({
      nome: userProfile.name || "",
      email: userProfile.email || "",
      telefone: formatPhone(userProfile.phone || userProfile.whatsapp || ""),
      ramal: userProfile.ramal || "",
      cargo: userProfile.role || "",
      avatar: userProfile.avatar || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id, userProfile?.avatar]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userProfile?.id) return;

    setIsUploading(true);
    try {
      const { uploadImage } = await import("@/lib/uploadImage");
      const url = await uploadImage(file, "avatares");

      if (url) {
        const { error } = await supabase
          .from("usuarios")
          .update({ avatar: url })
          .eq("id", userProfile.id);

        if (error) throw error;

        setForm(prev => ({ ...prev, avatar: url }));
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
        
        // Disparar evento para atualizar o perfil globalmente sem refresh
        window.dispatchEvent(new CustomEvent("carflax-profile-updated"));
      }
    } catch (err: unknown) {
      console.error("[Settings] Erro ao trocar foto:", err);
      const error = err as Error;
      if (error.message?.includes("Refresh Token Not Found")) {
        alert("Sua sessão expirou. Por favor, saia e entre novamente para continuar.");
      } else {
        alert("Erro ao enviar imagem. Verifique sua conexão ou tente novamente.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    if (!userProfile?.id) return;
    try {
      // 1. Salvar campos de texto no banco de dados (fonte de verdade do perfil).
      const { error: dbError } = await supabase
        .from("usuarios")
        .update({
          name: form.nome,
          email: form.email,
          role: form.cargo,
        })
        .eq("id", userProfile.id);

      if (dbError) throw dbError;

      // 2. Persistir telefone/whatsapp também na tabela usuarios, para que outros
      //    módulos (que leem direto do banco) enxerguem o valor atualizado.
      //    Tolerante a falha: se as colunas ainda não existirem, não quebra o save.
      const { error: phoneError } = await supabase
        .from("usuarios")
        .update({ phone: form.telefone, whatsapp: form.telefone, ramal: form.ramal })
        .eq("id", userProfile.id);

      if (phoneError) {
        console.warn(
          "[Settings] Não foi possível salvar phone/whatsapp/ramal na tabela usuarios (rode a migração de colunas). Usando apenas o Auth.",
          phoneError.message
        );
      }

      // 3. Manter telefone/whatsapp/ramal também no user_metadata do Supabase Auth.
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          phone: form.telefone,
          whatsapp: form.telefone,
          ramal: form.ramal,
        }
      });

      if (authError) throw authError;

      // 4. Se o e-mail mudou, atualizar também o e-mail de LOGIN (Auth). Isso
      //    dispara um e-mail de confirmação; o login só troca após o usuário
      //    confirmar. Comparamos com o e-mail atual do Auth para não reenviar à toa.
      let emailChanged = false;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const currentEmail = (authUser?.email || "").trim().toLowerCase();
      const newEmail = form.email.trim().toLowerCase();
      if (newEmail && newEmail !== currentEmail) {
        const { error: emailError } = await supabase.auth.updateUser({ email: form.email.trim() });
        if (emailError) throw emailError;
        emailChanged = true;
      }

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);

      // Disparar evento para atualizar o perfil globalmente sem refresh
      window.dispatchEvent(new CustomEvent("carflax-profile-updated"));

      if (emailChanged) {
        alert(
          "Enviamos um link de confirmação para o novo e-mail. Seu e-mail de LOGIN só será alterado depois que você clicar nesse link. Até lá, continue entrando com o e-mail atual."
        );
      }
    } catch (err: unknown) {
      console.error("[Settings] Erro ao salvar dados do perfil:", err);
      const error = err as Error;
      alert(`Erro ao salvar dados do perfil: ${error.message || String(error)}`);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* SEÇÃO 1: PERFIL (HEADER) */}
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow duration-300">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* Avatar e Ação de Foto */}
          <div className="relative group shrink-0">
            <div className={cn(
              "w-28 h-28 rounded-2xl border-2 border-slate-100 dark:border-white/10 shadow-sm overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center transition-all group-hover:shadow-md relative",
              isUploading && "animate-pulse"
            )}>
              {isUploading && (
                <div className="absolute inset-0 bg-white/20 dark:bg-black/20 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <img
                src={form.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'User'}&backgroundColor=0053FC`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                alt="Avatar"
              />
            </div>
            {/* Badge de Verificado */}
            <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-1.5 rounded-lg shadow-lg border-2 border-white dark:border-slate-900">
              <CheckCircle2 className="w-4 h-4" strokeWidth={3} />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="space-y-1">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase">
                {form.nome || "Usuário Carflax"}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start items-center">
                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-md uppercase tracking-wider">
                  {form.cargo}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-white/10" />
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  SÃO PAULO - MATRIZ
                </span>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
              Identificador interno verificado. Seu acesso de Administrador permite gerenciar todos os módulos do sistema Carflax com total autonomia.
            </p>
            
            <div className="flex justify-center md:justify-start pt-1">
              <label className={cn(
                "inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-sm active:scale-95",
                isUploading && "opacity-50 cursor-wait"
              )}>
                <Camera className="w-3.5 h-3.5" />
                {isUploading ? "ENVIANDO..." : "ALTERAR FOTO"}
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: DADOS PESSOAIS */}
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
        {/* Card Header com Título */}
        <div className="px-6 py-5 border-b border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
            <User className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Informações pessoais</h4>
        </div>

        {/* Card Content (Grid de Inputs) */}
        <div className="p-6 md:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <SettingsInput 
              label="NOME COMPLETO" 
              value={form.nome} 
              onChange={(v) => setForm({ ...form, nome: v })} 
              icon={User} 
            />
            <SettingsInput 
              label="E-MAIL CORPORATIVO" 
              value={form.email} 
              onChange={(v) => setForm({ ...form, email: v })} 
              icon={Mail} 
              type="email" 
            />
            <SettingsInput 
              label="WHATSAPP / CELULAR" 
              value={form.telefone} 
              onChange={(v) => setForm({ ...form, telefone: formatPhone(v) })} 
              icon={Smartphone} 
              type="tel" 
            />
            <SettingsInput
              label="CARGO / FUNÇÃO"
              value={form.cargo}
              onChange={(v) => setForm({ ...form, cargo: v })}
              icon={Briefcase}
            />
            <SettingsInput
              label="RAMAL"
              value={form.ramal}
              onChange={(v) => setForm({ ...form, ramal: v.replace(/\D/g, "") })}
              icon={Phone}
              placeholder="Ex: 1000"
            />
          </div>

          {/* Action Footer dentro do card */}
          <div className="pt-8 border-t border-slate-50 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 max-w-[300px] text-center md:text-left">
              Mantenha seus dados atualizados para facilitar a comunicação interna.
            </p>
            <Button
              onClick={handleSave}
              className={cn(
                "h-12 px-10 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl active:scale-95 w-full md:w-auto",
                isSaved
                  ? "bg-emerald-600 text-white shadow-emerald-500/20"
                  : "bg-[#2563EB] hover:bg-blue-700 text-white shadow-blue-600/20"
              )}
            >
              {isSaved ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" /> 
                  ALTERAÇÕES SALVAS
                </span>
              ) : (
                "SALVAR ALTERAÇÕES"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─────────────────────────────────────────────
   NOTIFICAÇÕES
───────────────────────────────────────────── */
const notifSections = [
  {
    key: "alertas",
    icon: Bell,
    title: "Alertas Críticos",
    desc: "Notificações urgentes do sistema",
    color: "rose",
    items: [
      { key: "updates", label: "Atualizações de Segurança" },
      { key: "maintenance", label: "Manutenção do Servidor" },
      { key: "stalePedidos", label: "Pedido parado (Balcão 2 / Entrega)" },
      { key: "clienteRetira", label: "Cliente veio retirar (Balcão 2)" },
      { key: "balcao2Prazo", label: "Prazo de retirada 72h (Balcão 2)" },
      { key: "vendaGrande", label: "Venda grande (Compras)" },
    ],
  },
  {
    key: "crm",
    icon: MessageSquare,
    title: "Vendas & Comercial",
    desc: "Atividades comerciais e leads",
    color: "blue",
    items: [
      { key: "newLead", label: "Novos Orçamentos Criados" },
      { key: "dealClosed", label: "Negociações Finalizadas" },
      { key: "mentions", label: "Comentários em Chat" },
    ],
  },
  {
    key: "equipe",
    icon: Smartphone,
    title: "Comunicação Interna",
    desc: "Comunicados e avisos da equipe",
    color: "amber",
    items: [
      { key: "broadcast", label: "Novos Comunicados no Geral" },
      { key: "priceChange", label: "Alterações de Preço" },
      { key: "productArrival", label: "Produtos que Chegaram" },
      { key: "events", label: "Eventos do Calendário" },
    ],
  },
];

function NotificationsTab({ userProfile }: { userProfile?: UserProfile | null }) {
  const [state, setState] = useState<StateMap>(loadNotifState);
  const [responsibles, setResponsibles] = useState<LossResponsible[]>([]);
  const [loadingResp, setLoadingResp] = useState(true);
  const [savingResp, setSavingResp] = useState(false);
  const [savedResp, setSavedResp] = useState(false);
  // Motivos do cadastro do ERP (CADCOC) — mesma lista do Citel.
  const lossReasons = useLossReasons();

  const isManager = userProfile?.is_admin ||
    userProfile?.role?.toUpperCase() === 'ADMIN' ||
    userProfile?.role?.toUpperCase().includes('GERENTE');

  const [testingId, setTestingId] = useState<string | null>(null);

  async function handleTestMessage(resp: LossResponsible) {
    if (!resp.telefone || !resp.nome) return;
    setTestingId(resp.id);
    try {
      let phone = resp.telefone.replace(/\D/g, "");
      if (phone.length >= 10 && !phone.startsWith("55")) phone = "55" + phone;

      const VITE_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "/api-marketing";
      const BACKEND_URL = VITE_BACKEND_URL.startsWith("http") ? VITE_BACKEND_URL : window.location.origin + VITE_BACKEND_URL;
      const msg = [
        `Olá, *${resp.nome}*.`,
        ``,
        `✅ *MENSAGEM DE TESTE* ✅`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📋 *Motivo:* ${resp.motivo}`,
        `📱 *Número:* ${phone}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `_Esta é uma mensagem de teste do Carflax HUB._`,
        `_Se você recebeu, as notificações estão funcionando!_`
      ].join('\n');

      const res = await fetch(`${BACKEND_URL}/api/whatsapp/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, text: msg }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("[Test] Resposta do servidor:", res.status, errorData);
      }
    } catch (err) {
      console.error("[Test] Erro ao enviar mensagem teste:", err);
    } finally {
      setTimeout(() => setTestingId(null), 2000);
    }
  }

  function toggle(section: string, item: string) {
    setState((prev) => ({ ...prev, [section]: { ...prev[section], [item]: !prev[section][item] } }));
  }

  const userId = userProfile?.id;
  const hydratedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Só mostra os toggles depois de carregar as preferências salvas, para não
  // "piscar" o valor padrão (ativo) antes de aplicar o que o usuário desativou.
  const [prefsReady, setPrefsReady] = useState(false);

  // Hidrata as preferências salvas por usuário no banco (sobrepõe o cache local).
  useEffect(() => {
    if (!userId) { setPrefsReady(true); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("notification_prefs")
        .eq("id", userId)
        .maybeSingle();
      if (!cancelled) {
        if (!error && data?.notification_prefs) {
          setState((prev) => mergeKnownPrefs(prev, data.notification_prefs));
        }
        hydratedRef.current = true; // libera o salvamento a partir daqui
        setPrefsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Cache local instantâneo + persistência por usuário no banco (debounced).
  useEffect(() => {
    try { localStorage.setItem("carflax_notif_prefs", JSON.stringify(state)); } catch { /* ignore */ }
    if (!userId || !hydratedRef.current) return; // não salva antes de hidratar do banco
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from("usuarios")
        .update({ notification_prefs: state })
        .eq("id", userId)
        .then(({ error }) => {
          if (error) console.error("[Notif] Erro ao salvar preferências:", error);
        });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, userId]);

  // Ao habilitar "Pedido parado", pede permissão de notificação do navegador.
  useEffect(() => {
    if (state.alertas?.stalePedidos && typeof Notification !== "undefined" && Notification.permission === "default") {
      Promise.resolve(Notification.requestPermission()).catch(() => {});
    }
  }, [state.alertas?.stalePedidos]);

  useEffect(() => {
    async function fetchResponsibles() {
      setLoadingResp(true);
      const { data } = await supabase
        .from("crm_config")
        .select("value")
        .eq("key", "crm_loss_responsibles")
        .maybeSingle();

      if (data?.value) {
        try {
          setResponsibles(JSON.parse(data.value));
        } catch (e) {
          console.error("Erro ao parsear crm_loss_responsibles:", e);
        }
      }
      setLoadingResp(false);
    }
    fetchResponsibles();
  }, []);

  async function handleSaveResponsibles() {
    setSavingResp(true);
    const { error } = await supabase
      .from("crm_config")
      .upsert([{ key: "crm_loss_responsibles", value: JSON.stringify(responsibles) }]);

    setSavingResp(false);
    if (!error) {
      setSavedResp(true);
      setTimeout(() => setSavedResp(false), 3000);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {notifSections.map(({ key, icon: Icon, title, desc, items, color }) => (
          <div key={key} className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-sm">
            <div className="p-5 border-b border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] flex items-center gap-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                color === 'rose' ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400" :
                  color === 'blue' ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight leading-none mb-1">{title}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{desc}</p>
              </div>
            </div>
            <div className="flex-1 p-5 space-y-4">
              {items.map((item) => (
                <div key={item.key} className="flex items-center justify-between group">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{item.label}</span>
                  {prefsReady ? (
                    <Toggle checked={state[key][item.key]} onChange={() => toggle(key, item.key)} />
                  ) : (
                    <div className="h-5 w-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Responsáveis por Notificações de Perda — apenas gerentes/admin */}
      {isManager && (
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-rose-50 dark:bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">
                Responsáveis por Notificações de Perda
              </h5>
              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
                Defina quem receberá alertas no WhatsApp de acordo com o motivo de perda do orçamento.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setResponsibles(prev => [
                ...prev,
                {
                  id: String(Date.now()),
                  motivo: "Todos os Motivos",
                  nome: "",
                  telefone: ""
                }
              ]);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Responsável
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/10 dark:bg-slate-900/10 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10 select-none">
              <tr>
                <th className="px-4 py-3.5 font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] w-[35%]">Motivo de Perda</th>
                <th className="px-4 py-3.5 font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] w-[35%]">Nome do Responsável</th>
                <th className="px-4 py-3.5 font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] w-[20%]">WhatsApp (com DDD)</th>
                <th className="px-4 py-3.5 font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] text-center w-[10%]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {loadingResp ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-600 font-bold uppercase tracking-wider text-[9px] animate-pulse">
                    Carregando responsáveis...
                  </td>
                </tr>
              ) : responsibles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-600 font-bold uppercase tracking-wider text-[9px]">
                    Nenhum responsável configurado. Os alertas de perda serão enviados apenas para o centralizador.
                  </td>
                </tr>
              ) : (
                responsibles.map((resp) => (
                  <tr key={resp.id} className="hover:bg-slate-50/30 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="px-3 py-2.5">
                      <select
                        value={resp.motivo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setResponsibles(prev => prev.map(r => r.id === resp.id ? { ...r, motivo: val } : r));
                        }}
                        className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600/50 focus:ring-2 focus:ring-blue-600/5 transition-all"
                      >
                        <option value={LOSS_REASON_ALL}>{LOSS_REASON_ALL}</option>
                        {/* Inclui o motivo já salvo mesmo que ele não exista mais no ERP —
                            sem isso o select apareceria vazio e o cadastro se perderia ao salvar. */}
                        {(lossReasons.includes(resp.motivo) || resp.motivo === LOSS_REASON_ALL
                          ? lossReasons
                          : [...lossReasons, resp.motivo]
                        ).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={resp.nome}
                        onChange={(e) => {
                          const val = e.target.value;
                          setResponsibles(prev => prev.map(r => r.id === resp.id ? { ...r, nome: val } : r));
                        }}
                        placeholder="Nome (ex: João do Estoque)"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600/50 focus:ring-2 focus:ring-blue-600/5 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={resp.telefone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setResponsibles(prev => prev.map(r => r.id === resp.id ? { ...r, telefone: val } : r));
                        }}
                        placeholder="Ex: 5511999999999"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600/50 focus:ring-2 focus:ring-blue-600/5 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTestMessage(resp)}
                          disabled={testingId === resp.id || !resp.telefone || !resp.nome}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            testingId === resp.id
                              ? "text-emerald-500 dark:text-emerald-400"
                              : "text-slate-400 hover:text-blue-500 dark:text-slate-600 dark:hover:text-blue-400 hover:bg-blue-500/10"
                          )}
                          title="Enviar mensagem teste"
                        >
                          {testingId === resp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResponsibles(prev => prev.filter(r => r.id !== resp.id));
                          }}
                          className="p-2 text-slate-400 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-50 dark:border-white/5 flex items-center justify-end">
          <Button
            onClick={handleSaveResponsibles}
            disabled={savingResp}
            className={cn(
              "h-12 px-10 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl active:scale-95",
              savedResp ? "bg-emerald-600 text-white shadow-emerald-500/20" : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20"
            )}
          >
            {savingResp ? "Salvando..." : savedResp ? "Responsáveis Salvos!" : "Salvar Responsáveis"}
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}

type StateMap = Record<string, Record<string, boolean>>;

function buildDefault(): StateMap {
  const s: StateMap = {};
  for (const sec of notifSections) {
    s[sec.key] = {};
    // "Pedido parado" começa desligado (é um alerta operacional que a pessoa habilita).
    for (const item of sec.items) s[sec.key][item.key] = item.key !== "stalePedidos";
  }
  return s;
}

/** Mescla preferências salvas sobre uma base, considerando só chaves conhecidas. */
function mergeKnownPrefs(base: StateMap, saved: unknown): StateMap {
  const out: StateMap = {};
  for (const sec of notifSections) {
    out[sec.key] = { ...base[sec.key] };
    for (const item of sec.items) {
      const v = (saved as StateMap | null | undefined)?.[sec.key]?.[item.key];
      if (typeof v === "boolean") out[sec.key][item.key] = v;
    }
  }
  return out;
}

/** Lê as preferências salvas por cima dos defaults (apenas chaves conhecidas). */
function loadNotifState(): StateMap {
  const def = buildDefault();
  try {
    const raw = localStorage.getItem("carflax_notif_prefs");
    if (!raw) return def;
    return mergeKnownPrefs(def, JSON.parse(raw));
  } catch { /* usa defaults */ }
  return def;
}

/* ─────────────────────────────────────────────
   SEGURANÇA
───────────────────────────────────────────── */

function SecurityTab() {
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const strength = getStrength(pw.next);
  const match = pw.next === pw.confirm && pw.next.length > 0;

  async function handleSave() {
    if (!pw.current || !pw.next || !match) return;
    setSaving(true);
    setErrorMsg("");

    try {
      // 1. Buscar e-mail do usuário logado
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) {
        setErrorMsg("Não foi possível identificar seu usuário. Faça login novamente.");
        return;
      }

      // 2. Verificar a senha atual tentando um login silencioso
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pw.current,
      });

      if (signInError) {
        setErrorMsg("Senha atual incorreta. Verifique e tente novamente.");
        return;
      }

      // 3. Atualizar para a nova senha
      const { error: updateError } = await supabase.auth.updateUser({
        password: pw.next,
      });

      if (updateError) {
        setErrorMsg("Erro ao atualizar a senha: " + updateError.message);
        return;
      }

      // 4. Sucesso
      setSaved(true);
      setPw({ current: "", next: "", confirm: "" });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("[Security] Erro ao trocar senha:", err);
      setErrorMsg("Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Pass Change Card - Centralizado/Destaque */}
        <div className="md:col-start-3 md:col-span-8 bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
          <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-50 dark:border-white/5">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Segurança da Conta</h4>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mt-1">Gerencie seu acesso e senha</p>
            </div>
          </div>

          <div className="space-y-6 flex-1">
            <h5 className="text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">Alterar Senha de Acesso</h5>
            
            <PasswordField label="Senha Atual" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} placeholder="••••••••" />
            <PasswordField label="Nova Senha" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} placeholder="Mínimo 8 caracteres" strength={strength} />
            <PasswordField label="Confirmar Nova Senha" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="Repita a nova senha" />

            {pw.confirm.length > 0 && !match && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span className="text-[10px] font-black text-rose-600 uppercase">As senhas não coincidem</span>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="text-[10px] font-black text-rose-600 dark:text-rose-400">{errorMsg}</span>
              </div>
            )}
          </div>

          <div className="mt-10 pt-6 border-t border-slate-50 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 max-w-[300px] text-center md:text-left leading-relaxed">
              Recomendamos o uso de senhas fortes com números e símbolos.
            </p>
            <Button
              onClick={handleSave}
              disabled={!pw.current || !pw.next || !match || saving}
              className={cn(
                "h-12 px-10 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl active:scale-95 w-full md:w-auto",
                saved
                  ? "bg-emerald-600 text-white shadow-emerald-500/20"
                  : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:shadow-none shadow-blue-600/20"
              )}
            >
              {saved ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" /> 
                  SENHA ATUALIZADA
                </span>
              ) : saving ? (
                <span className="flex items-center gap-2">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>
                  ATUALIZANDO...
                </span>
              ) : (
                "ATUALIZAR SENHA"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─────────────────────────────────────────────
   APARÊNCIA
───────────────────────────────────────────── */
function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Theme Cards */}
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
            <Palette className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">Tema & Interface</h4>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Escolha sua experiência visual</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { key: "light", label: "Brilhante", icon: Sun, color: "text-amber-500 bg-amber-50" },
            { key: "dark", label: "Profundo", icon: Moon, color: "text-blue-600 bg-blue-50" },
            { key: "system", label: "Automático", icon: Monitor, color: "text-slate-500 bg-slate-50" },
          ].map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setTheme(key as "light" | "dark" | "system")}
              className={cn(
                "relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 transition-all group",
                theme === key
                  ? "border-blue-600 bg-blue-50/20 dark:bg-blue-500/10 shadow-lg shadow-blue-600/10"
                  : "border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/30 hover:border-slate-200 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
              )}
            >
              {theme === key && (
                <div className="absolute top-4 right-4 text-blue-600 animate-in zoom-in duration-300">
                  <div className="w-5 h-5 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30">
                    <Check className="w-3 h-3 text-white" strokeWidth={4} />
                  </div>
                </div>
              )}
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 shadow-sm", color)}>
                <Icon className="w-8 h-8" />
              </div>
              <div className="text-center">
                <span className={cn("text-[11px] font-black uppercase tracking-widest block", theme === key ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-600")}>
                  {label}
                </span>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-600 mt-1 uppercase opacity-60">Modo {key}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Save Area */}
      <div className="flex justify-end pt-4 pb-2 border-t border-slate-50 dark:border-white/5">
        <Button
          onClick={handleSave}
          className={cn(
            "h-12 px-12 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-lg active:scale-95",
            saved
              ? "bg-emerald-600 text-white shadow-emerald-500/20"
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20"
          )}
        >
          {saved ? <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Preferências Aplicadas</span> : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ORÇAMENTOS - CONFIGURAÇÕES
───────────────────────────────────────────── */
interface LossResponsible {
  id: string;
  motivo: string;
  nome: string;
  telefone: string;
}

function OrcamentosTab() {
  return (
    <div className="max-w-[800px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
            <FileBadge className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">Comunicações de Orçamentos</h4>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
              Cada vendedor agora tem seu próprio responsável, definido em Usuários → Editar Perfil → Responsável.
              As notificações e mensagens do chat de orçamentos são enviadas direto para ele, não existe mais um único centralizador global.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL (TINY REDESIGN)
───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   ASSINATURA DE E-MAIL
   Usa o SVG oficial (public/carflax-assinatura.svg) como
   template e troca apenas os campos do usuário logado,
   preservando 100% do design (logo, notebook, ícones).
───────────────────────────────────────────── */

// Valores institucionais fixos (iguais para todos), apenas exibidos.
const SIGNATURE_COMPANY = {
  phoneBase: "(11) 4521-9777",
  website: "www.carflax.com.br",
  address: "Av. Américo Bruno Nº 75 | Jundiaí - SP",
};

// Strings originais presentes no SVG, usadas como âncora para substituição.
const SIG_TEMPLATE = {
  nameBlock:
    '<text class="st10" transform="translate(267.3 60.19)"><tspan class="st9" x="0" y="0">ZECA</tspan><tspan class="st7" x="57.62" y="0"> </tspan><tspan class="st0" x="63.04" y="0">MORTARELLI JR</tspan></text>',
  roleBlock:
    '<text class="st3" transform="translate(267.28 76.5)"><tspan x="0" y="0">Diretor</tspan></text>',
  phone: "(11) 4521-9777 | R: 1000",
  whatsapp: "(11) 96848-7958",
  email: "joao@carflax.com.br",
};

function xmlEscape(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Força largura/altura (em px) no <svg> raiz, removendo as existentes. Faz o
// navegador rasterizar o SVG nativamente nessa resolução (nítido) e sem distorcer.
function withSvgSize(svg: string, w: number, h: number) {
  return svg.replace(/<svg\b([^>]*?)>/, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "");
    return `<svg${cleaned} width="${w}" height="${h}">`;
  });
}

// Mede a proporção real (largura/altura) do SVG renderizado no DOM — é a mesma
// que aparece na pré-visualização, evitando "achatar" a imagem no PNG.
function measureSvgRatio(svg: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;left:-99999px;top:0;width:1000px;visibility:hidden;pointer-events:none";
  probe.innerHTML = svg;
  document.body.appendChild(probe);
  try {
    const el = probe.querySelector("svg");
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r.width / r.height;
      const vb = el.viewBox?.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) return vb.width / vb.height;
    }
  } finally {
    probe.remove();
  }
  return 850.32 / 234.24; // proporção do modelo como fallback
}

// ArrayBuffer -> base64 (em blocos, para não estourar a call stack).
function bufToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Monta um <style> com a fonte Montserrat embutida em base64, para que o SVG
// seja 100% autossuficiente ao ser rasterizado (imagem carregada isoladamente
// não baixa fontes externas). Resultado é cacheado entre chamadas.
let cachedFontStyle: string | null = null;
async function getEmbeddedFontStyle(): Promise<string> {
  if (cachedFontStyle !== null) return cachedFontStyle;
  try {
    const cssRes = await fetch("https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&display=swap");
    let css = await cssRes.text();
    const urls = Array.from(new Set([...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1])));
    await Promise.all(
      urls.map(async (u) => {
        const fontRes = await fetch(u);
        const b64 = bufToBase64(await fontRes.arrayBuffer());
        css = css.split(u).join(`data:font/woff2;base64,${b64}`);
      })
    );
    cachedFontStyle = `<style type="text/css"><![CDATA[\n${css}\n]]></style>`;
  } catch (err) {
    console.error("[Assinatura] Não foi possível embutir a fonte Montserrat:", err);
    cachedFontStyle = ""; // segue sem embutir (usa fallback do sistema)
  }
  return cachedFontStyle;
}

/** Gera o SVG personalizado a partir do template e dos dados do usuário. */
function buildSignatureSvg(template: string, data: { name: string; role: string; email: string; whatsapp: string; ramal: string }) {
  let out = template;

  // Nome: primeiro nome em azul (st9) + restante em cinza (st0), fluindo
  // naturalmente (sem x fixo) para funcionar com qualquer comprimento.
  const parts = data.name.trim().split(/\s+/).filter(Boolean);
  const first = xmlEscape((parts[0] || "").toUpperCase());
  const rest = xmlEscape(parts.slice(1).join(" ").toUpperCase());
  const nameSvg =
    `<text class="st10" transform="translate(267.3 60.19)">` +
    `<tspan class="st9" x="0" y="0">${first || "NOME"}</tspan>` +
    (rest ? `<tspan class="st0" y="0"> ${rest}</tspan>` : "") +
    `</text>`;
  out = out.replace(SIG_TEMPLATE.nameBlock, nameSvg);

  // Cargo
  const roleSvg =
    `<text class="st3" transform="translate(267.28 76.5)"><tspan x="0" y="0">${xmlEscape(data.role || "Cargo")}</tspan></text>`;
  out = out.replace(SIG_TEMPLATE.roleBlock, roleSvg);

  // Telefone fixo + ramal por usuário. Se não houver ramal, mostra só o fixo.
  const ramal = data.ramal.trim();
  const phoneLine = ramal ? `${SIGNATURE_COMPANY.phoneBase} | R: ${ramal}` : SIGNATURE_COMPANY.phoneBase;
  out = out.replace(SIG_TEMPLATE.phone, xmlEscape(phoneLine));

  // WhatsApp e e-mail (strings únicas no arquivo)
  if (data.whatsapp) out = out.replace(SIG_TEMPLATE.whatsapp, xmlEscape(data.whatsapp));
  if (data.email) out = out.replace(SIG_TEMPLATE.email, xmlEscape(data.email));

  return out;
}

function SignatureTab({ userProfile }: { userProfile?: UserProfile | null }) {
  const [template, setTemplate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [me, setMe] = useState(() => ({
    name: userProfile?.name || "",
    role: userProfile?.role || "",
    email: userProfile?.email || "",
    whatsapp: formatPhone(userProfile?.whatsapp || userProfile?.phone || ""),
    ramal: userProfile?.ramal || "",
  }));
  const [busy, setBusy] = useState<null | "png" | "copy" | "svg">(null);
  const [feedback, setFeedback] = useState("");

  // Reidrata os dados do usuário quando o perfil carrega/atualiza.
  useEffect(() => {
    if (!userProfile?.id) return;
    setMe({
      name: userProfile.name || "",
      role: userProfile.role || "",
      email: userProfile.email || "",
      whatsapp: formatPhone(userProfile.whatsapp || userProfile.phone || ""),
      ramal: userProfile.ramal || "",
    });
  }, [userProfile?.id, userProfile?.name, userProfile?.role, userProfile?.email, userProfile?.phone, userProfile?.whatsapp, userProfile?.ramal]);

  // Carrega o SVG template uma vez (arquivo já está em UTF-8).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}carflax-assinatura.svg`);
        const raw = await res.text();
        if (!cancelled) setTemplate(raw);
      } catch (err) {
        console.error("[Assinatura] Erro ao carregar template SVG:", err);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const personalizedSvg = template ? buildSignatureSvg(template, me) : null;

  // Versão responsiva para a pré-visualização (svg ocupa 100% da largura).
  const previewSvg = personalizedSvg
    ? personalizedSvg.replace(/<svg\b([^>]*?)>/, (_full, attrs) => {
        const cleaned = attrs.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "");
        return `<svg${cleaned} style="width:100%;height:auto;display:block">`;
      })
    : null;

  async function rasterize(targetWidth = 2400): Promise<HTMLCanvasElement | null> {
    if (!personalizedSvg) return null;
    // Proporção real do modelo (mesma da pré-visualização) → sem distorção.
    const ratio = measureSvgRatio(personalizedSvg);
    const outW = Math.round(targetWidth);
    const outH = Math.round(targetWidth / ratio);
    // SVG autossuficiente: fonte embutida + tamanho forçado em px (nítido).
    const fontStyle = await getEmbeddedFontStyle();
    let selfContained = withSvgSize(personalizedSvg, outW, outH);
    if (fontStyle) selfContained = selfContained.replace(/(<svg\b[^>]*>)/, `$1${fontStyle}`);
    const blob = new Blob([selfContained], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Falha ao carregar SVG"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const fileBase = me.name.trim().toLowerCase().replace(/\s+/g, "-") || "carflax";

  function flash(msg: string, ms = 3500) {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), ms);
  }

  async function handleDownloadSvg() {
    if (!personalizedSvg) return;
    setBusy("svg");
    try {
      const fontStyle = await getEmbeddedFontStyle();
      const selfContained = fontStyle
        ? personalizedSvg.replace(/(<svg\b[^>]*>)/, `$1${fontStyle}`)
        : personalizedSvg;
      const blob = new Blob([selfContained], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `assinatura-${fileBase}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      flash("Assinatura .SVG baixada!");
    } catch (err) {
      console.error("[Assinatura] Erro ao gerar SVG:", err);
      flash("Erro ao gerar o SVG.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadPng() {
    setBusy("png");
    try {
      const canvas = await rasterize(2400);
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `assinatura-${fileBase}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      flash("Imagem .PNG baixada!");
    } catch (err) {
      console.error("[Assinatura] Erro ao gerar PNG:", err);
      flash("Erro ao gerar a imagem.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyImage() {
    setBusy("copy");
    try {
      const canvas = await rasterize(2400);
      if (!canvas) return;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
      if (!blob) throw new Error("blob nulo");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Assinatura copiada! Cole no seu e-mail (Ctrl+V).", 4500);
    } catch (err) {
      console.error("[Assinatura] Erro ao copiar:", err);
      flash("Seu navegador bloqueou a cópia. Use 'Baixar PNG'.", 4500);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
            <Signature className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">Assinatura de E-mail</h4>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
              Seus dados já vêm preenchidos no modelo oficial Carflax. Copie ou baixe e use no seu e-mail.
            </p>
          </div>
        </div>
      </div>

      {/* Pré-visualização (largura total) */}
      <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
            <Mail className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Pré-visualização</h4>
        </div>
        <div className="p-4 md:p-6 bg-slate-100/50 dark:bg-slate-950/40">
          <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
            {loadError ? (
              <div className="p-10 text-center text-[11px] font-bold text-rose-500 uppercase tracking-widest">
                Não foi possível carregar o modelo da assinatura.
              </div>
            ) : previewSvg ? (
              <div dangerouslySetInnerHTML={{ __html: previewSvg }} />
            ) : (
              <div className="p-10 flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 py-5 border-b border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
              <User className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Seus dados</h4>
          </div>
          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
              <SettingsInput label="NOME COMPLETO" value={me.name} onChange={(v) => setMe({ ...me, name: v })} icon={User} />
              <SettingsInput label="CARGO / FUNÇÃO" value={me.role} onChange={(v) => setMe({ ...me, role: v })} icon={Briefcase} />
              <SettingsInput label="E-MAIL" value={me.email} onChange={(v) => setMe({ ...me, email: v })} icon={Mail} type="email" />
              <SettingsInput label="WHATSAPP" value={me.whatsapp} onChange={(v) => setMe({ ...me, whatsapp: formatPhone(v) })} icon={Smartphone} type="tel" />
              <SettingsInput label="RAMAL" value={me.ramal} onChange={(v) => setMe({ ...me, ramal: v.replace(/\D/g, "") })} icon={Phone} placeholder="Ex: 1000" />
            </div>

            {/* Dados institucionais (fixos) */}
            <div className="pt-6 border-t border-slate-50 dark:border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">Dados institucionais</span>
                <span className="text-[9px] font-bold text-slate-300 dark:text-slate-700 uppercase tracking-widest ml-auto">Fixos</span>
              </div>
              <div className="space-y-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" /> {me.ramal ? `${SIGNATURE_COMPANY.phoneBase} | R: ${me.ramal}` : SIGNATURE_COMPANY.phoneBase}</p>
                <p className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" /> {SIGNATURE_COMPANY.website}</p>
                <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" /> {SIGNATURE_COMPANY.address}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="bg-white dark:bg-slate-900/50 dark:backdrop-blur-xl border border-[#E5E7EB] dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 py-5 border-b border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
              <Download className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Exportar</h4>
          </div>
          <div className="p-6 md:p-8 flex-1 flex flex-col justify-center space-y-3">
            {feedback && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">{feedback}</span>
              </div>
            )}
            <Button
              onClick={handleCopyImage}
              disabled={busy !== null || !personalizedSvg}
              className="w-full h-12 rounded-xl font-black text-[11px] uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/20 active:scale-95 transition-all disabled:opacity-40"
            >
              {busy === "copy" ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> COPIANDO...</span>
              ) : (
                <span className="flex items-center gap-2"><Copy className="w-4 h-4" /> COPIAR ASSINATURA</span>
              )}
            </Button>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleDownloadPng}
                disabled={busy !== null || !personalizedSvg}
                className="flex-1 h-12 rounded-xl font-black text-[11px] uppercase tracking-widest bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm active:scale-95 transition-all disabled:opacity-40"
              >
                {busy === "png" ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> ...</span>
                ) : (
                  <span className="flex items-center gap-2"><Download className="w-4 h-4" /> BAIXAR PNG</span>
                )}
              </Button>
              <Button
                onClick={handleDownloadSvg}
                disabled={busy !== null || !personalizedSvg}
                className="flex-1 h-12 rounded-xl font-black text-[11px] uppercase tracking-widest bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm active:scale-95 transition-all disabled:opacity-40"
              >
                <span className="flex items-center gap-2"><FileBadge className="w-4 h-4" /> BAIXAR SVG</span>
              </Button>
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 text-center leading-relaxed pt-1">
              Dica: no Gmail vá em Configurações → Assinatura, clique em inserir imagem e cole. O SVG mantém qualidade vetorial.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ======================== EXTENSÃO TAB ========================

const DIAS_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX"] as const;
const DIAS_LABELS: Record<string, string> = {
  SEG: "Segunda-feira",
  TER: "Terça-feira",
  QUA: "Quarta-feira",
  QUI: "Quinta-feira",
  SEX: "Sexta-feira",
};

interface FreteBairro {
  bairro: string;
  minimo: number;
  frete: number;
}

interface FreteRow {
  cidade: string;
  minimo: number;
  frete: number;
  bairros?: FreteBairro[];
}

function corrigirNomeCidade(value: unknown): string {
  const cidade = String(value ?? "").trim();
  return cidade
    .replace(/jundia\?/gi, "Jundiaí")
    .replace(/v\?rzea/gi, "Várzea")
    .replace(/cabre\?va/gi, "Cabreúva")
    .replace(/s\?o paulo/gi, "São Paulo");
}

function normalizarEntregas(value: unknown): Record<string, string[]> {
  const origem = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return Object.fromEntries(
    DIAS_SEMANA.map((dia) => [
      dia,
      Array.isArray(origem[dia]) ? origem[dia].map(corrigirNomeCidade).filter(Boolean) : [],
    ])
  );
}

function normalizarFretes(value: unknown): FreteRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      cidade: corrigirNomeCidade(item.cidade),
      minimo: Number(item.minimo) || 0,
      frete: Number(item.frete) || 0,
      bairros: Array.isArray(item.bairros)
        ? item.bairros
            .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object" && Boolean(b.bairro))
            .map((b) => ({
              bairro: String(b.bairro || "").trim(),
              minimo: Number(b.minimo) || 0,
              frete: Number(b.frete) || 0,
            }))
        : [],
    }))
    .filter((item) => Boolean(item.cidade));
}

function ExtensaoTab({ userProfile }: { userProfile?: UserProfile | null }) {
  const [subTab, setSubTab] = useState<"entregas" | "fretes">("entregas");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isManager = Boolean(
    userProfile?.is_admin ||
    userProfile?.role?.toUpperCase() === 'ADMIN' ||
    userProfile?.role?.toUpperCase().includes('GERENTE') ||
    userProfile?.is_leader
  );

  const [entregas, setEntregas] = useState<Record<string, string[]>>({
    SEG: [],
    TER: [],
    QUA: [],
    QUI: [],
    SEX: [],
  });
  const [newCity, setNewCity] = useState<Record<string, string>>({
    SEG: "",
    TER: "",
    QUA: "",
    QUI: "",
    SEX: "",
  });

  const [fretes, setFretes] = useState<FreteRow[]>([]);
  const [newFrete, setNewFrete] = useState<FreteRow>({ cidade: "", minimo: 0, frete: 0 });

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from("crm_config")
      .select("key, value")
      .in("key", ["extensao_entregas", "extensao_fretes"]);

    if (data) {
      for (const row of data) {
        try {
          const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (row.key === "extensao_entregas") setEntregas(normalizarEntregas(parsed));
          if (row.key === "extensao_fretes") setFretes(normalizarFretes(parsed));
        } catch {
          // Ignorar erros de formato JSON inválido
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const isInitialMount = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-salvar automático sempre que entregas ou fretes mudarem
  useEffect(() => {
    if (loading || !isManager) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    setSaving(true);
    setSaved(false);

    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase.from("crm_config").upsert([
        { key: "extensao_entregas", value: JSON.stringify(entregas) },
        { key: "extensao_fretes", value: JSON.stringify(fretes) },
      ]);
      setSaving(false);
      if (!error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    }, 400);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [entregas, fretes, loading, isManager]);

  function addCityToDay(dia: string) {
    const city = newCity[dia]?.trim();
    if (!city) return;
    setEntregas((prev) => ({
      ...prev,
      [dia]: [...(prev[dia] || []), city],
    }));
    setNewCity((prev) => ({ ...prev, [dia]: "" }));
  }

  function removeCityFromDay(dia: string, idx: number) {
    setEntregas((prev) => ({
      ...prev,
      [dia]: prev[dia].filter((_, i) => i !== idx),
    }));
  }

  function addFrete() {
    if (!newFrete.cidade.trim()) return;
    setFretes((prev) => [...prev, { ...newFrete, cidade: newFrete.cidade.trim() }]);
    setNewFrete({ cidade: "", minimo: 0, frete: 0 });
  }

  function removeFrete(idx: number) {
    setFretes((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateFrete(idx: number, field: keyof FreteRow, value: string | number) {
    setFretes((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, [field]: value } : f))
    );
  }

  const [expandedCities, setExpandedCities] = useState<Record<number, boolean>>({});
  const [newBairroInput, setNewBairroInput] = useState<Record<number, { bairro: string; minimo: number; frete: number }>>({});

  function toggleExpandCity(idx: number) {
    setExpandedCities((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function addBairro(cidadeIdx: number) {
    const input = newBairroInput[cidadeIdx];
    if (!input || !input.bairro.trim()) return;
    setFretes((prev) =>
      prev.map((f, i) => {
        if (i !== cidadeIdx) return f;
        const bairros = f.bairros || [];
        return {
          ...f,
          bairros: [...bairros, { bairro: input.bairro.trim(), minimo: Number(input.minimo) || 0, frete: Number(input.frete) || 0 }],
        };
      })
    );
    setNewBairroInput((prev) => ({ ...prev, [cidadeIdx]: { bairro: "", minimo: 0, frete: 0 } }));
  }

  function removeBairro(cidadeIdx: number, bairroIdx: number) {
    setFretes((prev) =>
      prev.map((f, i) => {
        if (i !== cidadeIdx) return f;
        return {
          ...f,
          bairros: (f.bairros || []).filter((_, bIdx) => bIdx !== bairroIdx),
        };
      })
    );
  }

  function updateBairro(cidadeIdx: number, bairroIdx: number, field: keyof FreteBairro, value: string | number) {
    setFretes((prev) =>
      prev.map((f, i) => {
        if (i !== cidadeIdx) return f;
        const bairros = (f.bairros || []).map((b, bIdx) =>
          bIdx === bairroIdx ? { ...b, [field]: value } : b
        );
        return { ...f, bairros };
      })
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">


      <div className="inline-flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1.5 dark:border-white/10 dark:bg-slate-900 sm:w-auto">
        <button
          onClick={() => setSubTab("entregas")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all sm:flex-none ${
            subTab === "entregas"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700"
          }`}
        >
          <Truck className="w-4 h-4" />
          Dias de Entrega
        </button>
        <button
          onClick={() => setSubTab("fretes")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all sm:flex-none ${
            subTab === "fretes"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700"
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Fretes
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Gerencie os dados exibidos no popup da extensão. Qualquer alteração é salva automaticamente.
        </p>
        <div className="flex items-center gap-3">
          <a
            href="/ramais-extension.zip"
            download="ramais-extension.zip"
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
            Baixar extensão
          </a>

          {!isManager ? (
            <span className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Modo Leitura (Apenas gerentes alteram)
            </span>
          ) : saving ? (
            <span className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2 rounded-xl border border-amber-200 dark:border-amber-500/20">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Salvando...
            </span>
          ) : saved ? (
            <span className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
              <Check className="w-3.5 h-3.5" />
              Salvo automaticamente!
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-white/10">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              Salvo automaticamente
            </span>
          )}
        </div>
      </div>

      {subTab === "entregas" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {DIAS_SEMANA.map((dia) => (
            <div
              key={dia}
              className="flex min-h-72 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-slate-800"
            >
              <div className="border-b border-blue-500/30 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider">{DIAS_LABELS[dia]}</span>
                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold">{(entregas[dia] || []).length}</span>
                </div>
                <p className="mt-1 text-[10px] font-medium text-blue-100">cidades atendidas</p>
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="space-y-1.5">
                {(entregas[dia] || []).map((city, idx) => (
                  <div
                    key={idx}
                    className="group flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-slate-700/50"
                  >
                    <span className="min-w-0 truncate text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">
                      {city}
                    </span>
                    {isManager && (
                      <button
                        onClick={() => removeCityFromDay(dia, idx)}
                        aria-label={`Remover ${city}`}
                        className="shrink-0 text-slate-300 transition-colors hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                </div>
                {isManager && (
                  <div className="mt-auto flex gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                    <input
                      type="text"
                      value={newCity[dia] || ""}
                      onChange={(e) =>
                        setNewCity((prev) => ({ ...prev, [dia]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addCityToDay(dia)}
                      placeholder="Cidade..."
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      onClick={() => addCityToDay(dia)}
                      aria-label={`Adicionar cidade em ${DIAS_LABELS[dia]}`}
                      className="rounded-lg bg-blue-600 px-2.5 py-2 text-white transition-colors hover:bg-blue-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === "fretes" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 dark:bg-slate-900 text-white">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider">
                  Cidade
                </th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider">
                  Pedido Min.
                </th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider">
                  Frete
                </th>
                {isManager && <th className="px-4 py-3 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {fretes.map((f, idx) => {
                const temBairros = Boolean(f.bairros && f.bairros.length > 0);
                const isExpanded = Boolean(expandedCities[idx]);

                return (
                  <Fragment key={idx}>
                    <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpandCity(idx)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            title={isExpanded ? "Recolher bairros" : "Expandir bairros"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <input
                            type="text"
                            value={f.cidade}
                            readOnly={!isManager}
                            onChange={(e) => isManager && updateFrete(idx, "cidade", e.target.value)}
                            className={`flex-1 text-sm font-bold text-slate-800 dark:text-white bg-transparent outline-none rounded px-1 -mx-1 ${
                              isManager ? "focus:bg-blue-50 dark:focus:bg-slate-700" : ""
                            }`}
                          />
                          {temBairros && (
                            <button
                              type="button"
                              onClick={() => toggleExpandCity(idx)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 transition-colors"
                            >
                              <MapPin className="w-3 h-3" />
                              {f.bairros!.length} bairro(s)
                            </button>
                          )}
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!isExpanded) toggleExpandCity(idx);
                              }}
                              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Plus className="w-3 h-3" /> Bairro
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={f.minimo}
                          readOnly={!isManager}
                          onChange={(e) =>
                            isManager && updateFrete(idx, "minimo", parseFloat(e.target.value) || 0)
                          }
                          className={`w-full text-sm font-semibold text-right text-slate-700 dark:text-slate-200 bg-transparent outline-none rounded px-1 -mx-1 tabular-nums ${
                            isManager ? "focus:bg-blue-50 dark:focus:bg-slate-700" : ""
                          }`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={f.frete}
                          readOnly={!isManager}
                          onChange={(e) =>
                            isManager && updateFrete(idx, "frete", parseFloat(e.target.value) || 0)
                          }
                          className={`w-full text-sm font-semibold text-right text-slate-700 dark:text-slate-200 bg-transparent outline-none rounded px-1 -mx-1 tabular-nums ${
                            isManager ? "focus:bg-blue-50 dark:focus:bg-slate-700" : ""
                          }`}
                        />
                      </td>
                      {isManager && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => removeFrete(idx)}
                            className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>

                    {/* Sub-bairros expansíveis */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200 dark:border-white/10">
                        <td colSpan={isManager ? 4 : 3} className="px-6 py-3">
                          <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-slate-900/60 p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                Bairros com frete específico em {f.cidade}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500">
                                {(f.bairros || []).length} bairro(s) cadastrado(s)
                              </span>
                            </div>

                            <div className="space-y-2">
                              {(f.bairros || []).map((b, bIdx) => (
                                <div key={bIdx} className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-white/10">
                                  <span className="text-blue-500 font-bold text-xs pl-1">↳</span>
                                  <input
                                    type="text"
                                    value={b.bairro}
                                    readOnly={!isManager}
                                    onChange={(e) => updateBairro(idx, bIdx, "bairro", e.target.value)}
                                    placeholder="Nome do Bairro (ex: Eloy Chaves)..."
                                    className="flex-1 text-xs font-bold text-slate-800 dark:text-white bg-transparent outline-none px-2 py-1 rounded border border-slate-200 dark:border-white/10"
                                  />
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-400 font-medium">Ped. Mín:</span>
                                    <input
                                      type="number"
                                      value={b.minimo}
                                      readOnly={!isManager}
                                      onChange={(e) => updateBairro(idx, bIdx, "minimo", parseFloat(e.target.value) || 0)}
                                      className="w-20 text-xs font-semibold text-right text-slate-700 dark:text-slate-200 bg-transparent outline-none px-2 py-1 rounded border border-slate-200 dark:border-white/10 tabular-nums"
                                    />
                                    <span className="text-slate-400 font-medium">Frete:</span>
                                    <input
                                      type="number"
                                      value={b.frete}
                                      readOnly={!isManager}
                                      onChange={(e) => updateBairro(idx, bIdx, "frete", parseFloat(e.target.value) || 0)}
                                      className="w-20 text-xs font-semibold text-right text-slate-700 dark:text-slate-200 bg-transparent outline-none px-2 py-1 rounded border border-slate-200 dark:border-white/10 tabular-nums"
                                    />
                                    {isManager && (
                                      <button
                                        onClick={() => removeBairro(idx, bIdx)}
                                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {/* Form Novo Bairro */}
                              {isManager && (
                                <div className="flex items-center gap-2 bg-blue-500/5 p-2 rounded-lg border border-dashed border-blue-200 dark:border-blue-800">
                                  <span className="text-blue-500 font-bold text-xs pl-1">+</span>
                                  <input
                                    type="text"
                                    value={newBairroInput[idx]?.bairro || ""}
                                    onChange={(e) =>
                                      setNewBairroInput((prev) => ({
                                        ...prev,
                                        [idx]: { ...(prev[idx] || { minimo: 0, frete: 0 }), bairro: e.target.value },
                                      }))
                                    }
                                    onKeyDown={(e) => e.key === "Enter" && addBairro(idx)}
                                    placeholder="Novo bairro (ex: Eloy Chaves)..."
                                    className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none"
                                  />
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-400 font-medium">Ped. Mín:</span>
                                    <input
                                      type="number"
                                      value={newBairroInput[idx]?.minimo ?? ""}
                                      onChange={(e) =>
                                        setNewBairroInput((prev) => ({
                                          ...prev,
                                          [idx]: {
                                            ...(prev[idx] || { bairro: "" }),
                                            minimo: parseFloat(e.target.value) || 0,
                                            frete: prev[idx]?.frete || 0,
                                          },
                                        }))
                                      }
                                      onKeyDown={(e) => e.key === "Enter" && addBairro(idx)}
                                      placeholder="0"
                                      className="w-20 text-xs text-right px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-white outline-none tabular-nums"
                                    />
                                    <span className="text-slate-400 font-medium">Frete:</span>
                                    <input
                                      type="number"
                                      value={newBairroInput[idx]?.frete ?? ""}
                                      onChange={(e) =>
                                        setNewBairroInput((prev) => ({
                                          ...prev,
                                          [idx]: {
                                            ...(prev[idx] || { bairro: "" }),
                                            frete: parseFloat(e.target.value) || 0,
                                            minimo: prev[idx]?.minimo || 0,
                                          },
                                        }))
                                      }
                                      onKeyDown={(e) => e.key === "Enter" && addBairro(idx)}
                                      placeholder="0"
                                      className="w-20 text-xs text-right px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-white outline-none tabular-nums"
                                    />
                                    <button
                                      onClick={() => addBairro(idx)}
                                      className="px-2.5 py-1 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                      Adicionar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {isManager && (
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={newFrete.cidade}
                      onChange={(e) =>
                        setNewFrete((prev) => ({ ...prev, cidade: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addFrete()}
                      placeholder="Nova cidade..."
                      className="w-full text-sm px-1 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-white outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={newFrete.minimo || ""}
                      onChange={(e) =>
                        setNewFrete((prev) => ({
                          ...prev,
                          minimo: parseFloat(e.target.value) || 0,
                        }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addFrete()}
                      placeholder="0"
                      className="w-full text-sm text-right px-1 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-white outline-none focus:border-blue-500 tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={newFrete.frete || ""}
                      onChange={(e) =>
                        setNewFrete((prev) => ({
                          ...prev,
                          frete: parseFloat(e.target.value) || 0,
                        }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addFrete()}
                      placeholder="0"
                      className="w-full text-sm text-right px-1 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-white outline-none focus:border-blue-500 tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      onClick={addFrete}
                      className="p-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SettingsSection({ externalTab, userProfile }: SettingsSectionProps) {
  const tabMap: Record<string, string> = {
    "Meu Perfil": "profile",
    "Notificações": "notifications",
    "Segurança": "security",
    "Aparência": "appearance",
    "Banners": "banners",
    "Assinatura": "signature",
    "Extensão": "extensao",
    "Configurações": "profile",
  };

  const resolvedTab = (externalTab && tabMap[externalTab]) || "profile";
  const [activeTab, setActiveTab] = useState(resolvedTab);

  useEffect(() => {
    setActiveTab(resolvedTab);
  }, [resolvedTab]);

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC] dark:bg-slate-950">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-10 scrollbar-hide">
        <div className="max-w-[1200px] mx-auto">
          {activeTab === "profile" && <ProfileTab userProfile={userProfile} />}
          {activeTab === "orcamentos" && <OrcamentosTab />}
          {activeTab === "notifications" && <NotificationsTab userProfile={userProfile} />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "banners" && <BannersTab userProfile={userProfile} />}
          {activeTab === "signature" && <SignatureTab userProfile={userProfile} />}
          {activeTab === "extensao" && <ExtensaoTab userProfile={userProfile} />}
        </div>
      </div>
    </div>
  );
}
