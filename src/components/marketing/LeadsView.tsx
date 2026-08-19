import { useEffect, useState } from "react";
import { 
  Search, 
  User, 
  Phone, 
  CheckCircle2,
  Trash2,
  MessageSquare,
  LayoutGrid,
  Flame,
  Pencil,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { marketingService } from "@/lib/marketing-service";
import type { MarketingCliente } from "@/lib/marketing-service";
import { cn } from "@/lib/utils";
import { TinyDropdown } from "@/components/ui/TinyDropdown";

// Formata o texto digitado como moeda pt-BR (ex: "195646" -> "1.956,46"),
// tratando os dígitos como centavos.
function formatCurrencyInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TEMP_CONFIG = {
  Convertido: { color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
  Quente: { color: "text-rose-500 bg-rose-500/10 border-rose-500/20", dot: "bg-rose-500" },
  Morno:  { color: "text-amber-500 bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500" },
  Frio:   { color: "text-blue-500 bg-blue-500/10 border-blue-500/20", dot: "bg-blue-500" },
  Perdido: { color: "text-slate-400 bg-slate-500/10 border-slate-500/20", dot: "bg-slate-400" },
};

// Um lead com venda registrada é sempre "Convertido" no badge — tem prioridade
// sobre a temperatura salva, que pode estar defasada (ex.: marcado "Perdido" e a
// venda lançada depois).
const statusDoLead = (lead: { valor_venda?: number | null; temperatura?: string }) =>
  (lead.valor_venda ?? 0) > 0 ? "Convertido" : (lead.temperatura || "Frio");

export function LeadsView() {
  const [leads, setLeads] = useState<MarketingCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("Todas as Plataformas");
  const [filterTemperature, setFilterTemperature] = useState("Todas as Temperaturas");
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Estados para Edição de Leads / UTMs
  const [selectedLead, setSelectedLead] = useState<MarketingCliente | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editCampanha, setEditCampanha] = useState("");
  const [editValorVenda, setEditValorVenda] = useState("");
  const [editDataVenda, setEditDataVenda] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load leads on filters or page change
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const { data, count } = await marketingService.getLeadsPaginated(
        pageSize,
        offset,
        debouncedSearch,
        filterTemperature
      );
      if (isMounted) {
        setLeads(data);
        setTotalCount(count);
        setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [currentPage, pageSize, debouncedSearch, filterTemperature]);

  const refreshLeads = async () => {
    setLoading(true);
    const offset = (currentPage - 1) * pageSize;
    const { data, count } = await marketingService.getLeadsPaginated(
      pageSize,
      offset,
      debouncedSearch,
      filterTemperature
    );
    setLeads(data);
    setTotalCount(count);
    setLoading(false);
  };

  const handleDeleteLead = async (jid: string) => {
    if (confirm("Tem certeza que deseja excluir este lead permanentemente?")) {
      await marketingService.deleteCliente(jid);
      refreshLeads();
    }
  };

  const handleOpenChat = (jid: string) => {
    localStorage.setItem("carflax_pending_chat", jid);
    window.dispatchEvent(new CustomEvent("carflax-change-tab", { detail: "Whatsapp API" }));
    window.dispatchEvent(new CustomEvent("carflax-open-chat", { detail: jid }));
  };

  // Abrir modal de edição
  const handleOpenEdit = (lead: MarketingCliente) => {
    setSelectedLead(lead);
    setEditNome(lead.nome || lead.push_name || "");
    setEditOrigem(lead.origem || "WhatsApp");
    setEditCampanha(lead.campanha || "");
    setEditValorVenda(
      lead.valor_venda != null
        ? lead.valor_venda.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : ""
    );
    setEditDataVenda(lead.data_venda ? lead.data_venda.slice(0, 10) : "");
    setIsEditModalOpen(true);
  };

  // Salvar edições do lead
  const handleSaveLeadDetails = async () => {
    if (!selectedLead) return;
    setSavingLead(true);
    try {
      const valorParsed = editValorVenda.trim()
        ? Number(editValorVenda.replace(/\./g, "").replace(",", "."))
        : null;

      const updatedData = {
        ...selectedLead,
        nome: editNome.trim() || undefined,
        origem: editOrigem || undefined,
        campanha: editCampanha.trim() || undefined,
        valor_venda: valorParsed != null && !Number.isNaN(valorParsed) ? valorParsed : null,
        data_venda: editDataVenda ? new Date(`${editDataVenda}T00:00:00`).toISOString() : null,
      };

      await marketingService.upsertCliente(updatedData);
      setIsEditModalOpen(false);
      setSelectedLead(null);
      refreshLeads();
    } catch (err) {
      console.error("[LeadsView] Erro ao salvar detalhes do lead:", err);
      alert("Erro ao atualizar dados do lead.");
    } finally {
      setSavingLead(false);
    }
  };

  // Filtrar leads baseado no dropdown de Plataformas (origem)
  const filtered = filterPlatform === "Todas as Plataformas"
    ? leads
    : leads.filter(lead => {
        const leadOrigem = lead.origem || "WhatsApp";
        return leadOrigem.toLowerCase() === filterPlatform.toLowerCase();
      });

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden p-8">
      {/* Toolbar */}
      <div className="flex gap-4 mb-6 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border/50 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold outline-none focus:border-primary/50 transition-all shadow-sm"
          />
        </div>

        <div className="flex gap-2">
          <TinyDropdown 
            value={filterPlatform} 
            options={["Todas as Plataformas", "WhatsApp", "Instagram", "Facebook", "Google"]} 
            onChange={setFilterPlatform} 
            icon={LayoutGrid} 
            variant="slate" 
            placeholder="Plataforma" 
          />
          
          <TinyDropdown 
            value={filterTemperature} 
            options={["Todas as Temperaturas", "Convertido", "Quente", "Morno", "Frio", "Perdido"]}
            onChange={setFilterTemperature} 
            icon={Flame} 
            variant="amber" 
            placeholder="Temperatura" 
          />
        </div>
      </div>

      {/* Lista Estilo Tabela/Inbox */}
      <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground bg-card/30 border border-dashed border-border rounded-3xl">
            <CheckCircle2 className="w-12 h-12 opacity-20" />
            <p className="text-lg font-bold tracking-tight">Tudo em dia!</p>
            <p className="text-sm opacity-60">Nenhum lead novo para processar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1.2fr_1.1fr] gap-4 px-6 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>Lead / Contato</span>
              <span>Telefone</span>
              <span>Origem</span>
              <span>Valor Venda</span>
              <span>Orçamento</span>
              <span>Temperatura</span>
              <span className="text-right">Ações</span>
            </div>
            {filtered.map(lead => {
              const displayNome = lead.nome || lead.push_name || lead.remote_jid.split('@')[0];
              const phone = lead.remote_jid.split('@')[0];
              const temp = statusDoLead(lead);
              const tempCfg = TEMP_CONFIG[temp as keyof typeof TEMP_CONFIG] || TEMP_CONFIG.Frio;

              return (
                <div key={lead.remote_jid} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1.2fr_1.1fr] gap-4 items-center bg-card border border-border/50 rounded-2xl p-3 hover:border-primary/30 hover:bg-primary/[0.02] transition-all group">
                  {/* Lead / Contato */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-secondary overflow-hidden border border-border/50 shrink-0">
                      {lead.foto_url ? (
                        <img src={lead.foto_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/5">
                          <User className="w-5 h-5 text-primary/40" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm truncate" title={displayNome}>
                        {displayNome.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">WhatsApp</p>
                    </div>
                  </div>

                  {/* Telefone */}
                  <div className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 opacity-50" />
                    {phone}
                  </div>

                  {/* Origem (Tráfego) */}
                  <div className="text-xs font-bold text-muted-foreground uppercase">
                    {lead.origem || <span className="opacity-40 italic font-semibold">WhatsApp</span>}
                  </div>

                  {/* Valor Venda */}
                  <div className={cn(
                    "text-xs font-bold",
                    lead.valor_venda && lead.valor_venda > 0 
                      ? "text-emerald-600 dark:text-emerald-400" 
                      : "text-muted-foreground/50 font-semibold"
                  )}>
                    {(lead.valor_venda ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>

                  {/* Orçamento */}
                  <div className={cn(
                    "text-xs font-bold",
                    lead.valor_orcamento && lead.valor_orcamento > 0 
                      ? "text-blue-600 dark:text-blue-400" 
                      : "text-muted-foreground/50 font-semibold"
                  )}>
                    {(lead.valor_orcamento ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>

                  {/* Temperatura */}
                  <div>
                    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[10px] font-black uppercase tracking-widest", tempCfg.color)}>
                       <span className={cn("w-1.5 h-1.5 rounded-full", tempCfg.dot)} />
                       {temp}
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex items-center justify-end gap-1.5">
                    <button 
                      onClick={() => handleOpenEdit(lead)}
                      className="p-2 rounded-xl bg-secondary/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all border border-transparent hover:border-primary/20"
                      title="Editar Origem/Campanha"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={() => handleDeleteLead(lead.remote_jid)}
                      className="p-2 rounded-xl bg-secondary/50 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-all border border-transparent hover:border-rose-500/20"
                      title="Excluir Lead"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <button 
                      onClick={() => handleOpenChat(lead.remote_jid)}
                      className="w-10 h-10 rounded-xl bg-primary text-white hover:bg-primary/80 flex items-center justify-center transition-all shadow-lg shadow-primary/20 active:scale-95"
                      title="Ver Conversa"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginação */}
      {!loading && totalCount > 0 && (
        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between bg-card/10 text-xs text-muted-foreground font-bold mt-2 rounded-b-2xl shrink-0">
          <div>
            Exibindo {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, totalCount)} de {totalCount} leads
          </div>
          
          <div className="flex items-center gap-4">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5">
              <span>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-secondary/50 border border-border rounded-lg px-2 py-1 outline-none font-bold text-foreground text-xs"
              >
                {[25, 50, 100, 250].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-foreground disabled:opacity-40 disabled:hover:bg-secondary/30 transition-all font-black uppercase text-[10px] tracking-wider font-bold"
              >
                Anterior
              </button>
              
              <span className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-xs font-black">
                {currentPage} / {Math.ceil(totalCount / pageSize)}
              </span>

              <button
                disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(totalCount / pageSize)))}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-foreground disabled:opacity-40 disabled:hover:bg-secondary/30 transition-all font-black uppercase text-[10px] tracking-wider font-bold"
              >
                Próximo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Informações de Tráfego do Lead */}
      <AnimatePresence>
        {isEditModalOpen && selectedLead && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsEditModalOpen(false); setSelectedLead(null); }}
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
                    <Pencil className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-black uppercase tracking-tighter">
                      Editar Detalhes do Lead
                    </h3>
                  </div>
                  <button
                    onClick={() => { setIsEditModalOpen(false); setSelectedLead(null); }}
                    className="p-1.5 hover:bg-secondary rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Nome */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome de Exibição</label>
                    <input
                      type="text"
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      placeholder="Nome do cliente"
                    />
                  </div>

                  {/* Origem da Plataforma */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Plataforma / Origem</label>
                    <select
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none font-semibold"
                      value={editOrigem}
                      onChange={(e) => setEditOrigem(e.target.value)}
                    >
                      <option value="WhatsApp">WhatsApp Direto</option>
                      <option value="Google">Google Ads</option>
                      <option value="Instagram">Instagram Ads / Direct</option>
                      <option value="Facebook">Facebook Ads</option>
                      <option value="Organic">Tráfego Orgânico</option>
                      <option value="Outros">Outros Canais</option>
                    </select>
                  </div>

                  {/* Nome da Campanha */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome da Campanha (UTM Campaign)</label>
                    <input
                      type="text"
                      className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                      value={editCampanha}
                      onChange={(e) => setEditCampanha(e.target.value)}
                      placeholder="Ex: campanha_corolla_junho"
                    />
                  </div>

                  {/* Valor e Data da Venda */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor da Venda (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                        value={editValorVenda}
                        onChange={(e) => setEditValorVenda(formatCurrencyInput(e.target.value))}
                        placeholder="Ex: 1500,00"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Data da Venda</label>
                      <input
                        type="date"
                        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                        value={editDataVenda}
                        onChange={(e) => setEditDataVenda(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="mt-8 flex gap-3">
                  <button
                    onClick={() => { setIsEditModalOpen(false); setSelectedLead(null); }}
                    className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs rounded-2xl border border-border transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveLeadDetails}
                    disabled={savingLead}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-black text-xs rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {savingLead ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
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
