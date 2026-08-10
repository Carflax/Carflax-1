import { useState, useEffect, useMemo } from "react";
import {
  LayoutGrid,
  Settings,
  LogOut,
  ChevronDown,
  ChevronLeft,
  Calendar,
  BarChart3,
  Megaphone,
  Truck,
  Hexagon,
  Users,
  User,
  Bell,
  ShieldCheck,
  Palette,
  Signature,
  Lightbulb,
  FileBadge,
  Plane,
  FileText,
  Image,
  PhoneCall,
  Smartphone,
  FileBarChart,
  Database,
  Key,
  Crosshair,
  Package,
  PackageX,
  ShoppingCart,
  Bot,
  Kanban,
  MessageSquare,
  Wallet,
  Warehouse,
  PackageCheck,
  ClipboardCheck,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/theme-provider";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/hooks/useNotification";
import { NAV_SECTIONS, ESTEIRA_SUBQUADRO_PREFIX } from "@/lib/menu-config";

// Reexporta para não quebrar imports existentes (ex: App.tsx). A fonte da verdade
// agora fica em menu-config.ts.
export { ESTEIRA_SUBQUADRO_PREFIX };

interface MenuItem {
  icon: LucideIcon;
  label: string;
  isDropdown?: boolean;
  subItems?: { label: string; icon?: LucideIcon; value?: string }[];
}

// Icon map — only place you need to add an icon when creating a new section
const ICON_MAP: Record<string, LucideIcon> = {
  Dashboard: LayoutGrid,
  Geral: LayoutGrid,
  Produtos: Hexagon,
  Calendário: Calendar,
  Eventos: Calendar,
  Férias: Plane,
  Comercial: BarChart3,
  Orçamentos: FileBadge,
  "Meus Pedidos": Package,
  "Análise FRV": BarChart3,
  Carteira: Wallet,
  Clientes: Users,
  Prospecções: Crosshair,
  Ligações: PhoneCall,
  Campanhas: Megaphone,
  Alugueis: Key,
  Relatórios: FileBarChart,
  "Relatórios Mkt": FileBarChart,
  Marketing: Megaphone,
  "Whatsapp API": MessageCircle,
  "Automação": Bot,
  Leads: Users,
  Cronograma: Calendar,
  Esteira: Kanban,
  Estoque: Warehouse,
  Coletor: Smartphone,
  "Painel Coletor": Smartphone,
  "Separação": PackageCheck,
  "Conferência": ClipboardCheck,
  "Retirada": Package,
  Furos: PackageX,
  Compras: ShoppingCart,
  Painel: ShoppingCart,
  "Relatórios Estoque": FileBarChart,
  "Relatórios Compras": FileBarChart,
  Entregas: Truck,
  Romaneios: FileText,
  Scrum: Kanban,
  Board: Kanban,
  "Relatórios Scrum": FileBarChart,
  Usuários: Users,
  "DB Admin": Database,
  Sugestões: Lightbulb,
};

function buildMenuItems(subquadros: { id: string; name: string }[]): MenuItem[] {
  return NAV_SECTIONS.map(section => {
    if (section.label === "Esteira") {
      return {
        icon: ICON_MAP.Esteira ?? LayoutGrid,
        label: "Esteira",
        isDropdown: true,
        subItems: [
          { label: "Minha Esteira", icon: ICON_MAP.Esteira ?? LayoutGrid },
          ...subquadros.map(s => ({
            label: s.name,
            value: `${ESTEIRA_SUBQUADRO_PREFIX}${s.id}`,
            icon: ICON_MAP.Esteira ?? LayoutGrid,
          })),
        ],
      };
    }
    return {
      icon: ICON_MAP[section.label] ?? LayoutGrid,
      label: section.label,
      isDropdown: !!section.subItems?.length,
      subItems: section.subItems?.map(sub => ({
        label: sub.label,
        value: sub.value,
        icon: ICON_MAP[sub.value ?? sub.label] ?? LayoutGrid,
      })),
    };
  });
}

const settingsItems: MenuItem[] = [
  { 
    icon: Settings, 
    label: "Configurações", 
    isDropdown: true,
    subItems: [
      { label: "Meu Perfil", icon: User },
      { label: "Config. Orçamentos", icon: FileBadge },
      { label: "Notificações", icon: Bell },
      { label: "Segurança", icon: ShieldCheck },
      { label: "Aparência", icon: Palette },
      { label: "Assinatura", icon: Signature },
      { label: "Banners", icon: Image },
    ]
  },
];

interface AppSidebarProps {
  userProfile?: {
    id?: string;
    name: string;
    avatar?: string;
    role?: string;
    department?: string;
    permissions?: string[];
    is_leader?: boolean;
    is_admin?: boolean;
  };
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  activeItem: string;
  onActiveItemChange: (item: string) => void;
  onLogout: () => void;
  loading?: boolean;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  chatUnreadCount?: number;
}

export function AppSidebar({ userProfile, isCollapsed, onToggle, isMobileOpen, onMobileClose, activeItem, onActiveItemChange, onLogout, loading, isChatOpen, onToggleChat, chatUnreadCount = 0 }: AppSidebarProps) {
  const { theme } = useTheme();
  const [openMenus, setOpenMenus] = useState<string[]>(["Dashboard"]);
  const [subquadros, setSubquadros] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadSubquadros = async () => {
      const { data, error } = await supabase
        .from("esteira_subquadros")
        .select("id, name")
        .order("name");
      if (!cancelled && !error) setSubquadros(data || []);
    };

    loadSubquadros();

    const channel = supabase
      .channel("sidebar-esteira-subquadros")
      .on("postgres_changes", { event: "*", schema: "public", table: "esteira_subquadros" }, () => {
        loadSubquadros();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const allowedSubquadros = useMemo(() => {
    if (!userProfile) return [];
    const role = userProfile.role?.toUpperCase() || "";
    const isManager = userProfile.is_admin || role === "ADMIN" || role.includes("GERENTE") || role.includes("DIRETOR");
    if (isManager) return subquadros;

    const userDept = userProfile.department?.trim().toLowerCase();
    if (!userDept) return [];

    return subquadros.filter(
      (s) => s.name.trim().toLowerCase() === userDept
    );
  }, [subquadros, userProfile]);

  const menuItems = useMemo(() => buildMenuItems(allowedSubquadros), [allowedSubquadros]);

  // ── Notificações da Esteira — toast igual às demais, sem painel/histórico ──
  const { showNotification } = useNotification();

  useEffect(() => {
    const userId = userProfile?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`sidebar-esteira-notificacoes-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "esteira_notificacoes", filter: `destino=eq.${userId}` },
        ({ new: n }: { new: { id: string; actor_id: string | null; card_title: string; type: "assigned" | "completed" } }) => {
          const userCache = (window as unknown as { _carflaxUserCache?: Record<string, { name: string; avatar?: string | null }> })
            ._carflaxUserCache;
          const actorInfo = n.actor_id ? userCache?.[n.actor_id] : undefined;
          const actor = actorInfo?.name || "Alguém";
          showNotification(
            "info",
            n.type === "assigned" ? "Nova tarefa atribuída" : "Tarefa concluída",
            n.type === "assigned"
              ? `${actor} te atribuiu a tarefa "${n.card_title}"`
              : `${actor} concluiu a tarefa "${n.card_title}"`,
            true, // persistente — só some quando a pessoa clicar no X
            undefined,
            undefined,
            actorInfo?.avatar || undefined,
          );
          supabase.from("esteira_notificacoes").update({ lida: true }).eq("id", n.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.id, showNotification]);

  const userAvatar = userProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'User'}`;

  const toggleMenu = (label: string) => {
    if (isCollapsed) {
      onToggle();
      setOpenMenus([label]);
      return;
    }
    setOpenMenus((prev) =>
      prev.includes(label) ? [] : [label]
    );
  };

  const isAllowed = (label: string) => {
    // Admin e Gerente vê tudo
    const role = userProfile?.role?.toUpperCase() || "";
    if (role === 'ADMIN' || role.includes('GERENTE')) return true;

    // Subquadros da Esteira: apenas membros do próprio subquadro (via departamento) ou admin/gerente/diretor
    if (label.startsWith(ESTEIRA_SUBQUADRO_PREFIX)) {
      const subquadroId = label.substring(ESTEIRA_SUBQUADRO_PREFIX.length);
      const sub = subquadros.find(s => s.id === subquadroId);
      if (!sub) return false;
      
      const isManager = role === 'ADMIN' || role.includes('GERENTE') || role.includes('DIRETOR') || userProfile?.is_admin;
      if (isManager) return true;

      const userDept = userProfile?.department?.trim().toLowerCase();
      return !!userDept && sub.name.trim().toLowerCase() === userDept;
    }

    // Itens padrão (que todos vêem) — configurações pessoais + módulos essenciais
    const alwaysAllowed = [
      "Meu Perfil", "Aparência", "Assinatura", "Notificações", "Segurança",
      "Dashboard", "Geral", "Produtos",
      "Calendário", "Agenda", "Férias",
      "Esteira", "Minha Esteira", "Sugestões"
    ];
    if (alwaysAllowed.includes(label)) return true;

    // Permissões específicas do departamento de MARKETING
    const isMarketingDept = userProfile?.department?.toUpperCase() === 'MARKETING';
    const marketingItems = ["Marketing", "Whatsapp API", "Leads", "Blog Marketing", "Blog Cards", "Cronograma", "Eventos Marketing", "Avaliações", "Relatórios Mkt"];
    if (isMarketingDept && marketingItems.includes(label)) return true;

    // Permissões específicas do departamento de VENDAS/COMERCIAL
    const dept = userProfile?.department?.toUpperCase();
    const isVendasOrComercialDept = dept === 'VENDAS' || dept === 'COMERCIAL';
    const comercialItems = ["Comercial", "Orçamentos", "Meus Pedidos", "Análise FRV", "Carteira", "Prospecções", "Campanhas", "Alugueis", "Relatórios"];
    if (isVendasOrComercialDept && comercialItems.includes(label)) return true;

    // Líderes têm acesso automático aos módulos de Gestão & Admin, sem precisar de toggle manual
    const leaderOnlyItems = ["Scrum", "Usuários", "DB Admin"];
    if (userProfile?.is_leader && leaderOnlyItems.includes(label)) return true;

    // Permissões manuais (Database) — vale para todos os roles
    const hasManualPermission = userProfile?.permissions?.includes(label);

    // Seções-pai (dropdowns) aparecem se o usuário tem permissão em pelo menos um sub-item
    // Isso é tratado pelo filter no render, não precisa de lógica extra aqui

    return hasManualPermission || false;
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col z-50 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isCollapsed ? "w-20" : "w-64",
        "lg:translate-x-0",
        isMobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
      )}
    >
      {/* Profile Section */}
      <div className="border-b border-border/50 p-4 overflow-hidden">
        <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
          <button
            onClick={isCollapsed ? onToggle : undefined}
            className={cn(
              "w-10 h-10 rounded-lg overflow-hidden border border-border bg-secondary/50 shrink-0 transition-all duration-300",
              isCollapsed && "hover:ring-2 hover:ring-primary/50 cursor-pointer mx-auto"
            )}
            title={isCollapsed ? (userProfile?.name || "Expandir") : undefined}
          >
            {(!userProfile || loading) ? (
              <div className="w-full h-full bg-secondary animate-pulse" />
            ) : (
              <img
                src={userAvatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            )}
          </button>

          <div className={cn(
            "flex items-center gap-3 min-w-0 transition-all duration-300 overflow-hidden",
            isCollapsed ? "w-0 opacity-0 pointer-events-none" : "flex-1 w-auto opacity-100"
          )}>
            {(!userProfile || loading) ? (
              <div className="flex flex-col gap-2 flex-1">
                <div className="h-2 w-20 bg-secondary animate-pulse rounded" />
                <div className="h-1.5 w-12 bg-secondary animate-pulse rounded" />
              </div>
            ) : (
              <div className="flex flex-col min-w-0 flex-1">
                <span className={cn(
                  "text-[10px] font-black truncate uppercase whitespace-nowrap",
                  theme === "dark" ? "text-white" : "text-black"
                )}>
                  {userProfile?.name}
                </span>
                <span className={cn(
                  "text-[9px] font-medium uppercase tracking-widest leading-none mt-1 whitespace-nowrap",
                  theme === "dark" ? "text-slate-400" : "text-slate-500"
                )}>
                  {userProfile?.role || "Membro"}
                </span>
              </div>
            )}
            <button
              onClick={onToggle}
              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-all shrink-0"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Navigation - More sober */}
      <div className="flex-1 overflow-y-auto pt-4 px-3 space-y-6 scrollbar-hide">
        <div>
          <div className="space-y-1">
            {(!userProfile || loading) ? (
              // Navigation Skeletons
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center rounded-lg overflow-hidden",
                    isCollapsed ? "justify-center h-11 px-0" : "gap-3 px-3 py-2"
                  )}
                >
                  <div className={cn("w-4.5 h-4.5 rounded bg-secondary animate-pulse shrink-0")} />
                  <div className={cn(
                    "h-2 bg-secondary animate-pulse rounded transition-all duration-300",
                    isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-24 opacity-100"
                  )} />
                </div>
              ))
            ) : (
              menuItems
                .filter(item => {
                  if (item.isDropdown && item.subItems) {
                    return item.subItems.some(sub => isAllowed(sub.value || sub.label));
                  }
                  return isAllowed(item.label);
                })
                .map((item, idx) => {
                  const filteredSubItems = item.subItems?.filter(sub => isAllowed(sub.value || sub.label));
                  
                  const isOpen = openMenus.includes(item.label);
                  const isActive = activeItem === item.label || filteredSubItems?.some(s => (s.value || s.label) === activeItem);

                return (
                  <div key={idx} className="space-y-1">
                    <div
                      onClick={() => {
                        if (item.isDropdown) {
                          toggleMenu(item.label);
                        } else {
                          onActiveItemChange(item.label);
                          if (onMobileClose) onMobileClose();
                        }
                      }}
                      className={cn(
                        "flex items-center transition-all duration-200 group cursor-pointer relative py-2 rounded-lg",
                        isActive && !item.isDropdown
                          ? "bg-primary/5 text-primary dark:bg-primary/10"
                          : "hover:bg-secondary/80 dark:hover:bg-slate-800/50 text-muted-foreground hover:text-foreground dark:hover:text-slate-200",
                        isCollapsed ? "justify-center h-11 px-0" : "gap-3 px-3",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-4.5 h-4.5 shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                      <div className={cn(
                        "flex items-center overflow-hidden transition-all duration-300",
                        isCollapsed ? "w-0 opacity-0 pointer-events-none" : "flex-1 w-auto opacity-100"
                      )}>
                          <span className={cn(
                            "text-xs font-bold flex-1 tracking-tight truncate whitespace-nowrap",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          )}>
                            {item.label}
                          </span>
                          {item.isDropdown && (
                            <ChevronDown
                              className={cn(
                                "w-3.5 h-3.5 opacity-40 transition-transform duration-300",
                                isOpen ? "rotate-180" : "rotate-0",
                              )}
                              strokeWidth={2}
                            />
                          )}
                      </div>
                    </div>

                    {/* Dropdown items */}
                    <div
                      className={cn(
                        "grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        isOpen && !isCollapsed
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0 overflow-hidden",
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="pl-4 space-y-0.5 mt-1">
                          {filteredSubItems?.map((sub, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                onActiveItemChange(sub.value || sub.label);
                                if (onMobileClose) onMobileClose();
                              }}
                              className={cn(
                                "text-[11px] font-bold py-2 px-3 rounded-md cursor-pointer transition-all flex items-center gap-3",
                                activeItem === (sub.value || sub.label)
                                  ? "bg-primary/5 text-primary dark:bg-primary/10"
                                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 dark:hover:bg-slate-800/50 dark:hover:text-slate-200",
                              )}
                            >
                              {(sub.value || sub.label) === "Whatsapp API" ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  className="w-3.5 h-3.5 shrink-0"
                                  aria-label="WhatsApp"
                                  fill="#25D366"
                                >
                                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.043zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                                </svg>
                              ) : (
                                <div className={cn(
                                  "w-1 h-1 rounded-full shrink-0",
                                  activeItem === (sub.value || sub.label) ? "bg-primary" : "bg-muted-foreground/30"
                                )} />
                              )}
                              <span>{sub.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="h-px bg-border/50 mx-1" />

        {/* Settings Section */}
        <div>
          <div className="space-y-1">
            {settingsItems
              .filter(item => {
                if (item.isDropdown && item.subItems) {
                  return item.subItems.some(sub => isAllowed(sub.label));
                }
                return isAllowed(item.label); 
              })
              .map((item, idx) => {
                const filteredSettingsSubItems = item.subItems?.filter(sub => isAllowed(sub.label));
                
                const isOpen = openMenus.includes(item.label);
                const isSubActive = filteredSettingsSubItems?.some(sub => activeItem === sub.label);
                const isActive = activeItem === item.label || isSubActive;

              return (
                <div key={idx} className="space-y-1">
                  <div
                    onClick={() => {
                      if (item.isDropdown) {
                        toggleMenu(item.label);
                      } else {
                        onActiveItemChange(item.label);
                        if (onMobileClose) onMobileClose();
                      }
                    }}
                    className={cn(
                      "flex items-center rounded-lg transition-all duration-200 group cursor-pointer",
                      isActive && !item.isDropdown 
                        ? "bg-primary/5 text-primary dark:bg-primary/10" 
                        : "hover:bg-secondary/80 dark:hover:bg-slate-800/50 text-muted-foreground hover:text-foreground dark:hover:text-slate-200",
                      isCollapsed
                        ? "justify-center h-11 px-0"
                        : "gap-3 px-3 py-2",
                    )}
                  >
                    <item.icon
                      className={cn(
                          "w-4.5 h-4.5 shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-muted-foreground"
                      )}
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                    <div className={cn(
                      "flex items-center overflow-hidden transition-all duration-300",
                      isCollapsed ? "w-0 opacity-0 pointer-events-none" : "flex-1 w-auto opacity-100"
                    )}>
                        <span className={cn(
                          "text-xs font-bold flex-1 tracking-tight truncate whitespace-nowrap",
                        )}>
                          {item.label}
                        </span>
                        {item.isDropdown && (
                          <ChevronDown
                            className={cn(
                              "w-3.5 h-3.5 opacity-40 transition-transform duration-300",
                              isOpen ? "rotate-180" : "rotate-0",
                            )}
                            strokeWidth={2}
                          />
                        )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      isOpen && !isCollapsed
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0 overflow-hidden",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="pl-4 space-y-0.5 mt-1">
                        {filteredSettingsSubItems?.map((sub, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              onActiveItemChange(sub.value || sub.label);
                              if (onMobileClose) onMobileClose();
                            }}
                            className={cn(
                              "text-[11px] font-bold py-2 px-3 rounded-md cursor-pointer transition-all flex items-center gap-3",
                              activeItem === (sub.value || sub.label)
                                ? "bg-primary/5 text-primary dark:bg-primary/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 dark:hover:bg-slate-800/50 dark:hover:text-slate-200",
                            )}
                          >
                             <div className={cn(
                              "w-1 h-1 rounded-full",
                              activeItem === (sub.value || sub.label) ? "bg-primary" : "bg-muted-foreground/30"
                            )} />
                            <span>{sub.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 mt-auto border-t border-border/50">
        {/* Chat Button */}
        <button
          onClick={onToggleChat}
          className={cn(
            "w-full mb-2 flex items-center rounded-xl p-3 transition-all duration-300 relative overflow-hidden group border active:scale-95",
            isChatOpen
              ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
              : "bg-secondary/30 hover:bg-secondary/70 text-muted-foreground hover:text-foreground dark:hover:text-slate-200 border-border",
            isCollapsed ? "justify-center px-2" : "gap-3"
          )}
          title={isCollapsed ? "Conversas" : undefined}
        >
          <div className="relative shrink-0">
            <MessageSquare
              className={cn(
                "w-5 h-5 transition-all duration-300",
                isChatOpen ? "text-blue-500" : "opacity-70 group-hover:opacity-100 group-hover:scale-110"
              )}
              strokeWidth={isChatOpen ? 2 : 1.5}
            />
            {chatUnreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 bg-blue-600 text-white text-[8px] font-black flex items-center justify-center rounded-full shadow-lg border-2 border-card">
                {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
              </span>
            )}
          </div>
          <div className={cn(
            "text-left overflow-hidden transition-all duration-300",
            isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
          )}>
            <p className={cn(
              "text-[10px] font-black uppercase tracking-[0.1em] leading-none mb-0.5 whitespace-nowrap",
              isChatOpen ? "text-blue-500" : "text-foreground/90"
            )}>Conversas</p>
            <p className="text-[8px] font-medium text-muted-foreground leading-tight whitespace-nowrap">
              {chatUnreadCount > 0 ? `${chatUnreadCount} não lida${chatUnreadCount > 1 ? "s" : ""}` : "Chat Center"}
            </p>
          </div>
        </button>

        {/* Organograma Card */}
        <button
          onClick={() => onActiveItemChange("Organograma")}
          className={cn(
            "w-full mb-4 flex items-center bg-secondary/30 hover:bg-secondary/70 text-muted-foreground hover:text-foreground dark:hover:text-slate-200 rounded-xl p-3 transition-all duration-300 relative overflow-hidden group border border-border active:scale-95",
            isCollapsed ? "justify-center px-2" : "gap-3"
          )}
          title={isCollapsed ? "Organograma" : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

          <img
            src="https://cdn-icons-png.flaticon.com/512/9152/9152339.png"
            alt="Organograma"
            className="w-5 h-5 transition-all duration-300 dark:invert opacity-70 group-hover:opacity-100 group-hover:scale-110 shrink-0"
          />

          <div className={cn(
            "text-left overflow-hidden transition-all duration-300",
            isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
          )}>
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/90 leading-none mb-0.5 whitespace-nowrap">Organograma</p>
            <p className="text-[8px] font-medium text-muted-foreground leading-tight whitespace-nowrap">Estrutura Corporativa</p>
          </div>
        </button>
        <div className={cn("flex items-center px-2 py-2", isCollapsed ? "justify-center" : "gap-3")}>
           <span className={cn(
             "text-[10px] font-bold text-muted-foreground uppercase whitespace-nowrap overflow-hidden transition-all duration-300",
             isCollapsed ? "w-0 opacity-0 pointer-events-none" : "flex-1 w-auto opacity-100"
           )}>
             v2.4.0
           </span>
           <button
              onClick={onLogout}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
              title="Sair"
           >
              <LogOut className="w-4 h-4" />
           </button>
        </div>
      </div>
    </aside>
  );
}
