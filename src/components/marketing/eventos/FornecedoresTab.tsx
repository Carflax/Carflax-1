import { useState, useMemo } from "react";
import {
  Plus, Trash2, Lock, Star, X, Check, FileDown, Globe, Copy, ExternalLink, Phone,
  Inbox, Eye, CheckCircle2, XCircle, Search, Sparkles, Building2, User, Gift, Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  type Evento, type EventoFornecedor, type FornecedorStatus, type Segmento,
  FORNECEDOR_STATUS_LABEL, FORNECEDOR_STATUS_COLOR, formatBRL,
} from "./types";
import { gerarConviteFornecedor } from "./convite-pdf";

const STATUS_ORDER: FornecedorStatus[] = ["nao_contatado", "media_kit_enviado", "follow_up", "inscricao_recebida", "confirmado", "recusado"];

// Helper function to parse rich observacoes string saved from public 6-step landing page
function parseObservacoes(obsRaw?: string | null) {
  if (!obsRaw) return null;

  const parts = obsRaw.split(" | ");
  const parsed: Record<string, string> = {};

  parts.forEach((p) => {
    const idx = p.indexOf(":");
    if (idx !== -1) {
      const key = p.substring(0, idx).trim();
      const val = p.substring(idx + 1).trim();
      parsed[key] = val;
    } else {
      parsed["Geral"] = p;
    }
  });

  return parsed;
}

export function FornecedoresTab({ evento, fornecedores, onChange }: {
  evento: Evento;
  fornecedores: EventoFornecedor[];
  onChange: () => void;
}) {
  const [novaMarca, setNovaMarca] = useState("");
  const [novoSegmento, setNovoSegmento] = useState<Segmento>("hidraulico");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Filters & Search
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendentes" | "confirmados" | "recusados">("todos");
  const [busca, setBusca] = useState("");

  // Modal State for viewing full registration details
  const [fornecedorDetalhe, setFornecedorDetalhe] = useState<EventoFornecedor | null>(null);

  // Quick Approval Modal State
  const [fornecedorParaAprovar, setFornecedorParaAprovar] = useState<EventoFornecedor | null>(null);
  const [cotaInput, setCotaInput] = useState("1000");

  const urlConvite = `${window.location.origin}/convite-fornecedor`;

  const copiarLink = () => {
    navigator.clipboard.writeText(urlConvite);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const patch = async (id: string, campos: Partial<EventoFornecedor>) => {
    setErro(null);
    const { error } = await supabase
      .from("evento_fornecedores")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { setErro(error.message); return; }
    onChange();
  };

  const aprovarInscricao = async (f: EventoFornecedor, cotaValor: number) => {
    await patch(f.id, {
      status: "confirmado",
      cota_valor: cotaValor,
      data_confirmacao: new Date().toISOString().slice(0, 10),
    });
    setFornecedorParaAprovar(null);
    if (fornecedorDetalhe?.id === f.id) setFornecedorDetalhe(null);
  };

  const recusarInscricao = async (f: EventoFornecedor) => {
    if (!confirm(`Recusar a inscrição da marca "${f.marca}"?`)) return;
    await patch(f.id, { status: "recusado" });
    if (fornecedorDetalhe?.id === f.id) setFornecedorDetalhe(null);
  };

  const adicionar = async () => {
    const marca = novaMarca.trim();
    if (!marca) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from("evento_fornecedores").insert([{
      evento_id: evento.id, marca, segmento: novoSegmento, status: "nao_contatado",
    }]);
    setSalvando(false);
    if (error) {
      setErro(error.code === "23505" ? `"${marca}" já está na lista.` : error.message);
      return;
    }
    setNovaMarca("");
    onChange();
  };

  const remover = async (f: EventoFornecedor) => {
    if (!confirm(`Remover "${f.marca}" da lista de fornecedores?`)) return;
    const { error } = await supabase.from("evento_fornecedores").delete().eq("id", f.id);
    if (error) { setErro(error.message); return; }
    onChange();
  };

  // Metrics
  const confirmados = fornecedores.filter(f => f.status === "confirmado");
  const pendentesInscricao = fornecedores.filter(f => f.status === "inscricao_recebida");
  const recusados = fornecedores.filter(f => f.status === "recusado");

  const verbaConfirmada = confirmados.reduce((a, f) => a + Number(f.cota_valor || 0), 0);
  const verbaPaga = confirmados.filter(f => f.cota_paga).reduce((a, f) => a + Number(f.cota_valor || 0), 0);
  const premiosTotal = confirmados.filter(f => f.premio_descricao || f.premio_valor).length;
  const premiosValor = confirmados.reduce((a, f) => a + Number(f.premio_valor || 0), 0);
  const pctVerba = evento.verba_meta > 0 ? (verbaConfirmada / evento.verba_meta) * 100 : 0;

  const hidraulicas = fornecedores.filter(f => f.segmento === "hidraulico").length;
  const eletricas = fornecedores.filter(f => f.segmento === "eletrico").length;

  // Filtered List
  const fornecedoresFiltrados = useMemo(() => {
    return fornecedores.filter((f) => {
      if (filtroStatus === "pendentes" && f.status !== "inscricao_recebida") return false;
      if (filtroStatus === "confirmados" && f.status !== "confirmado") return false;
      if (filtroStatus === "recusados" && f.status !== "recusado") return false;

      if (busca.trim()) {
        const q = busca.toLowerCase();
        const m = f.marca.toLowerCase().includes(q);
        const c = f.contato_nome?.toLowerCase().includes(q) || false;
        const p = f.contato_telefone?.includes(q) || false;
        return m || c || p;
      }
      return true;
    });
  }, [fornecedores, filtroStatus, busca]);

  return (
    <div className="space-y-5">
      {/* ── 1. Inbox de Inscrições Pendentes ── */}
      {pendentesInscricao.length > 0 && (
        <div className="bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-500 flex items-center justify-center font-bold">
                <Inbox className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
                  Novas Inscrições para Aprovação
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                    {pendentesInscricao.length} pendente{pendentesInscricao.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Fornecedores que preencheram o formulário e aguardam confirmação.
                </p>
              </div>
            </div>
            <button onClick={() => setFiltroStatus("pendentes")} className="text-xs font-bold text-amber-500 hover:underline">
              Ver na tabela →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendentesInscricao.map((f) => (
              <div key={f.id} className="bg-card border border-amber-500/30 rounded-xl p-4 space-y-3 shadow-xs hover:border-amber-500 transition-all flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-foreground block">{f.marca}</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        {f.segmento === "hidraulico" ? "Hidráulico" : f.segmento === "eletrico" ? "Elétrico" : "—"}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[9px] font-bold border border-amber-500/20 shrink-0">
                      Inscrição Recebida
                    </span>
                  </div>

                  {(f.contato_nome || f.contato_telefone) && (
                    <div className="p-2 rounded-lg bg-secondary/50 border border-border text-xs space-y-1">
                      {f.contato_nome && (
                        <div className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                          <User className="w-3 h-3 text-blue-500" />
                          <span>{f.contato_nome}</span>
                        </div>
                      )}
                      {f.contato_telefone && (
                        <a href={`https://wa.me/55${f.contato_telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />
                          <span>{f.contato_telefone}</span>
                        </a>
                      )}
                    </div>
                  )}

                  {f.premio_descricao && (
                    <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">Prêmio: <strong>{f.premio_descricao}</strong></span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                  <button onClick={() => setFornecedorDetalhe(f)} className="px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-secondary text-xs font-bold text-foreground flex items-center gap-1 transition-colors" title="Ver Ficha Completa">
                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                    <span>Ficha</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => recusarInscricao(f)} className="p-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors" title="Recusar Inscrição">
                      <XCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setCotaInput(f.cota_valor ? String(f.cota_valor) : "1000"); setFornecedorParaAprovar(f); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black tracking-wide flex items-center gap-1 shadow-xs transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Aprovar</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2. Métricas compactas ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Verba confirmada</span>
          <p className="text-xl font-black text-foreground tracking-tighter mt-1">{formatBRL(verbaConfirmada)}</p>
          <div className="h-1.5 w-full bg-secondary dark:bg-slate-800 rounded-full overflow-hidden border border-border mt-2">
            <div className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(pctVerba, 100)}%` }} />
          </div>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">
            {pctVerba.toFixed(0)}% da meta de {formatBRL(evento.verba_meta)}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Já recebida</span>
          <p className="text-xl font-black text-emerald-600 tracking-tighter mt-1">{formatBRL(verbaPaga)}</p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">
            Prazo: 30/08/2026
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Marcas confirmadas</span>
          <p className="text-xl font-black text-foreground tracking-tighter mt-1">{confirmados.length}<span className="text-sm text-muted-foreground"> / 12</span></p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">
            {hidraulicas} hidráulicas · {eletricas} elétricas
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Prêmios para sorteio</span>
          <p className="text-xl font-black text-foreground tracking-tighter mt-1">{premiosTotal}<span className="text-sm text-muted-foreground"> / 12</span></p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">
            {formatBRL(premiosValor)} em prêmios
          </span>
        </div>
      </div>

      {/* ── 3. Barra de ações: Página pública + Filtros + Busca + Adicionar ── */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        {/* Linha 1: Página pública compacta */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Globe className="w-4 h-4 text-blue-500" />
            <span>Página Pública de Convite</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 text-[8px] font-bold">Ativa</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={copiarLink} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5">
              {copiado ? (<><Check className="w-3.5 h-3.5 text-emerald-300" /><span>Copiado!</span></>) : (<><Copy className="w-3.5 h-3.5" /><span>Copiar Link</span></>)}
            </button>
            <a href="/convite-fornecedor" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-secondary text-foreground text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1">
              <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              <span>Abrir</span>
            </a>
          </div>
        </div>

        {/* Linha 2: Filtros + Busca */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/50 border border-border text-xs font-bold">
            <button onClick={() => setFiltroStatus("todos")} className={cn("px-3 py-1.5 rounded-lg transition-all", filtroStatus === "todos" ? "bg-blue-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              Todos ({fornecedores.length})
            </button>
            <button onClick={() => setFiltroStatus("pendentes")} className={cn("px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5", filtroStatus === "pendentes" ? "bg-amber-500 text-slate-950 shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              <span>Pendentes</span>
              {pendentesInscricao.length > 0 && <span className="px-1.5 rounded-full bg-amber-600 text-white text-[9px] font-black">{pendentesInscricao.length}</span>}
            </button>
            <button onClick={() => setFiltroStatus("confirmados")} className={cn("px-3 py-1.5 rounded-lg transition-all", filtroStatus === "confirmados" ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              Confirmados ({confirmados.length})
            </button>
            <button onClick={() => setFiltroStatus("recusados")} className={cn("px-3 py-1.5 rounded-lg transition-all", filtroStatus === "recusados" ? "bg-rose-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              Recusados ({recusados.length})
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca ou contato..." className="w-full pl-8 pr-3 py-1.5 text-xs font-medium bg-background border border-border rounded-xl focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* Linha 3: Adicionar marca */}
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/50">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Adicionar marca</label>
            <input value={novaMarca} onChange={e => setNovaMarca(e.target.value)} onKeyDown={e => { if (e.key === "Enter") adicionar(); }} placeholder="Nome da marca" className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500" />
          </div>
          <select value={novoSegmento} onChange={e => setNovoSegmento(e.target.value as Segmento)} className="px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500">
            <option value="hidraulico">Hidráulico</option>
            <option value="eletrico">Elétrico</option>
          </select>
          <button onClick={adicionar} disabled={salvando || !novaMarca.trim()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-rose-700 dark:text-rose-300">{erro}</span>
          <button onClick={() => setErro(null)}><X className="w-4 h-4 text-rose-500" /></button>
        </div>
      )}

      {/* ── 4. Tabela Simplificada (6 colunas) ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                {["Marca / Contato", "Segmento", "Status", "Prêmio Sorteio", "Ações", ""].map(h => (
                  <th key={h} className="px-3 py-3 text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Nenhum fornecedor encontrado no filtro atual.
                    </span>
                  </td>
                </tr>
              ) : fornecedoresFiltrados.map(f => (
                <tr key={f.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  {/* Marca / Contato */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-foreground whitespace-nowrap">{f.marca}</span>
                        {f.apoio_master && <span title="Patrocinador Master"><Star className="w-3 h-3 text-amber-500 fill-current shrink-0" /></span>}
                      </div>
                      {(f.contato_nome || f.contato_telefone) && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          {f.contato_nome && <span className="font-semibold">{f.contato_nome}</span>}
                          {f.contato_telefone && (
                            <a href={`https://wa.me/55${f.contato_telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 font-bold" title="Abrir no WhatsApp">
                              <Phone className="w-2.5 h-2.5" />
                              <span>{f.contato_telefone}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Segmento (badge) */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border",
                      f.segmento === "hidraulico" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50"
                        : f.segmento === "eletrico" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50"
                          : "bg-secondary text-muted-foreground border-border"
                    )}>
                      {f.segmento === "hidraulico" ? "Hidráulico" : f.segmento === "eletrico" ? "Elétrico" : "—"}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <select
                      value={f.status}
                      onChange={e => patch(f.id, {
                        status: e.target.value as FornecedorStatus,
                        data_confirmacao: e.target.value === "confirmado" && !f.data_confirmacao
                          ? new Date().toISOString().slice(0, 10) : f.data_confirmacao,
                      })}
                      className={cn("text-[10px] font-black uppercase tracking-wide border rounded-full px-2.5 py-1 focus:outline-none cursor-pointer", FORNECEDOR_STATUS_COLOR[f.status])}
                    >
                      {STATUS_ORDER.map(s => <option key={s} value={s}>{FORNECEDOR_STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>

                  {/* Prêmio Sorteio */}
                  <td className="px-3 py-3">
                    <span className="text-[11px] font-bold text-foreground">
                      {f.premio_descricao || <span className="text-muted-foreground">—</span>}
                    </span>
                  </td>

                  {/* Ações */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setFornecedorDetalhe(f)} className="p-1.5 rounded-md border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-blue-500 transition-colors" title="Ver Ficha Completa">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => gerarConviteFornecedor(evento, f)} title="Baixar convite em PDF" className="p-1.5 rounded-md border border-border text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-all">
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                      {(f.status === "follow_up" || f.status === "media_kit_enviado") && (
                        <button onClick={() => { setCotaInput(f.cota_valor ? String(f.cota_valor) : "1000"); setFornecedorParaAprovar(f); }} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black flex items-center gap-1 shadow-xs transition-colors">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Aprovar</span>
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Remover */}
                  <td className="px-3 py-3">
                    <button onClick={() => remover(f)} className="p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Remover">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal de Ficha Completa do Fornecedor ── */}
      {fornecedorDetalhe && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-card border border-border rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
            <button onClick={() => setFornecedorDetalhe(null)} className="absolute top-5 right-5 p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-500 flex items-center justify-center font-bold text-xl">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground">{fornecedorDetalhe.marca}</h3>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Ficha de Inscrição · Segmento: {fornecedorDetalhe.segmento || "Não informado"}
                </span>
              </div>
            </div>

            {/* Status & Quick Actions */}
            <div className="p-4 rounded-2xl bg-secondary/50 border border-border flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Status:</span>
                <span className={cn("text-xs font-black uppercase tracking-wider border rounded-full px-3 py-1", FORNECEDOR_STATUS_COLOR[fornecedorDetalhe.status])}>
                  {FORNECEDOR_STATUS_LABEL[fornecedorDetalhe.status]}
                </span>
              </div>
              {fornecedorDetalhe.status !== "confirmado" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => recusarInscricao(fornecedorDetalhe)} className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition-colors">
                    Recusar
                  </button>
                  <button onClick={() => { setCotaInput(fornecedorDetalhe.cota_valor ? String(fornecedorDetalhe.cota_valor) : "1000"); setFornecedorParaAprovar(fornecedorDetalhe); }} className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-sm flex items-center gap-1.5 transition-colors">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar & Confirmar</span>
                  </button>
                </div>
              )}
            </div>

            {/* Etapas */}
            {(() => {
              const obs = parseObservacoes(fornecedorDetalhe.observacoes);
              return (
                <div className="space-y-4 text-xs">
                  {/* Etapa 1: Contato */}
                  <div className="p-4 rounded-2xl border border-border bg-background space-y-2">
                    <h4 className="font-extrabold text-blue-500 uppercase tracking-wider text-[11px] flex items-center gap-2">
                      <User className="w-4 h-4" /> 1. Empresa & Contato
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-foreground font-medium pt-1">
                      <div><span className="text-muted-foreground">Empresa:</span> <strong>{obs?.["Empresa"] || fornecedorDetalhe.marca}</strong></div>
                      <div><span className="text-muted-foreground">Responsável:</span> <strong>{fornecedorDetalhe.contato_nome || "—"}</strong></div>
                      <div><span className="text-muted-foreground">Cargo:</span> <strong>{obs?.["Cargo"] || "—"}</strong></div>
                      <div>
                        <span className="text-muted-foreground">WhatsApp:</span>{" "}
                        {fornecedorDetalhe.contato_telefone ? (
                          <a href={`https://wa.me/55${fornecedorDetalhe.contato_telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500 font-bold hover:underline">
                            {fornecedorDetalhe.contato_telefone}
                          </a>
                        ) : "—"}
                      </div>
                      <div><span className="text-muted-foreground">E-mail:</span> <strong>{obs?.["E-mail"] || "—"}</strong></div>
                    </div>
                  </div>

                  {/* Etapa 2 & 3: Estrutura & Montagem */}
                  <div className="p-4 rounded-2xl border border-border bg-background space-y-2">
                    <h4 className="font-extrabold text-amber-500 uppercase tracking-wider text-[11px] flex items-center gap-2">
                      <Wrench className="w-4 h-4" /> 2 & 3. Estrutura & Montagem
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-foreground font-medium pt-1">
                      <div><span className="text-muted-foreground">Itens:</span> <strong>{obs?.["Estrutura"] || "Estande Padrão"}</strong></div>
                      <div><span className="text-muted-foreground">Horário:</span> <strong>{obs?.["Montagem"] || "14:00"}</strong></div>
                      <div><span className="text-muted-foreground">Energia:</span> <strong>{obs?.["Energia"] || "Não informada"}</strong></div>
                      <div><span className="text-muted-foreground">Apoio Carflax:</span> <strong>{obs?.["Apoio"] || "Não"}</strong></div>
                    </div>
                    {obs?.["Obs Estrutura"] && (
                      <div className="pt-2 text-muted-foreground border-t border-border mt-2">
                        <span>Obs: {obs["Obs Estrutura"]}</span>
                      </div>
                    )}
                  </div>

                  {/* Etapa 4 & 5: Representantes & Brindes */}
                  <div className="p-4 rounded-2xl border border-border bg-background space-y-2">
                    <h4 className="font-extrabold text-[#0085FF] uppercase tracking-wider text-[11px] flex items-center gap-2">
                      <Gift className="w-4 h-4" /> 4 & 5. Representantes & Brindes
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-foreground font-medium pt-1">
                      <div><span className="text-muted-foreground">Representantes:</span> <strong>{obs?.["Representantes (1)"] || obs?.["Representantes"] || fornecedorDetalhe.promotor_nome || "—"}</strong></div>
                      <div><span className="text-muted-foreground">Brindes Kit:</span> <strong>{obs?.["Brindes Kit"] || "—"}</strong></div>
                    </div>
                  </div>

                  {/* Etapa 6: Prêmio */}
                  <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                    <h4 className="font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> 6. Prêmio para Sorteio
                    </h4>
                    <p className="text-foreground font-bold text-sm">
                      {fornecedorDetalhe.premio_descricao || obs?.["Prêmio principal"] || "Nenhum prêmio cadastrado"}
                    </p>
                    {fornecedorDetalhe.premio_valor && (
                      <span className="text-muted-foreground font-semibold block">
                        Valor Estimado: {formatBRL(fornecedorDetalhe.premio_valor)}
                      </span>
                    )}
                  </div>

                  {/* Financeiro */}
                  <div className="p-4 rounded-2xl border border-border bg-background space-y-2">
                    <h4 className="font-extrabold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-2">
                      <Lock className="w-4 h-4" /> Financeiro
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-foreground font-medium pt-1">
                      <div><span className="text-muted-foreground">Cota:</span> <strong>{formatBRL(fornecedorDetalhe.cota_valor)}</strong></div>
                      <div><span className="text-muted-foreground">Pagamento:</span> <strong className={fornecedorDetalhe.cota_paga ? "text-emerald-500" : "text-amber-500"}>{fornecedorDetalhe.cota_paga ? "Paga ✓" : "Pendente"}</strong></div>
                      <div><span className="text-muted-foreground">Confirmação:</span> <strong>{fornecedorDetalhe.data_confirmacao || "—"}</strong></div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="pt-4 border-t border-border flex justify-end">
              <button onClick={() => setFornecedorDetalhe(null)} className="px-6 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors">
                Fechar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Aprovação ── */}
      {fornecedorParaAprovar && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-card border border-border rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl relative">
            <button onClick={() => setFornecedorParaAprovar(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-secondary text-muted-foreground">
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-2">
              <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">Aprovar Inscrição</span>
              <h3 className="text-lg font-black text-foreground">Confirmar marca {fornecedorParaAprovar.marca}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ao aprovar, a marca será alterada para <strong className="text-emerald-500">CONFIRMADO</strong>.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-foreground">Valor da Cota (R$)</label>
              <input type="number" value={cotaInput} onChange={(e) => setCotaInput(e.target.value)} placeholder="1000" className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-black text-sm focus:outline-none focus:border-emerald-500" />
              <span className="text-[10px] text-muted-foreground block">Valor negociado. Pode ser alterado depois.</span>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
              <button onClick={() => setFornecedorParaAprovar(null)} className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-secondary">Cancelar</button>
              <button onClick={() => aprovarInscricao(fornecedorParaAprovar, parseFloat(cotaInput) || 0)} className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md">
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Marca</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
