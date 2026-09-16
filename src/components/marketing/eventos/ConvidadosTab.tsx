import { useMemo, useState } from "react";
import { Plus, Trash2, X, Check, Search, Ticket, UserCheck, FileDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  type Evento, type EventoConvidado, type ConvidadoStatus, type Carteira,
  CONVIDADO_STATUS_LABEL, CONVIDADO_STATUS_COLOR, confirmarConvidado, diasAte, mensagemErro,
} from "./types";
import { gerarConviteCliente } from "./convite-pdf";

type Filtro = "todos" | ConvidadoStatus | "presentes";

export function extrairProfissao(observacoes?: string | null): string {
  if (!observacoes) return "—";
  const match = observacoes.match(/Profiss[aã]o:\s*([^|]+)/i);
  return match ? match[1].trim() : "—";
}

export function ConvidadosTab({ evento, convidados, onChange }: {
  evento: Evento;
  convidados: EventoConvidado[];
  onChange: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novaCarteira, setNovaCarteira] = useState<Carteira>("B2B");
  const [novoVendedor, setNovoVendedor] = useState("");
  const [novaProfissao, setNovaProfissao] = useState("Eletricista");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const patch = async (id: string, campos: Partial<EventoConvidado>) => {
    setErro(null);
    const { error } = await supabase
      .from("evento_convidados")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { setErro(error.message); return; }
    onChange();
  };

  // Confirmar não é um update simples: gera o voucher nominal e o número da
  // sorte. Recusar/voltar a pendente preserva o número já emitido — reemitir
  // mudaria o número que o cliente já recebeu no WhatsApp.
  const mudarStatus = async (c: EventoConvidado, status: ConvidadoStatus) => {
    setErro(null);
    if (status === "confirmado") {
      try {
        await confirmarConvidado({ ...c, status });
        onChange();
      } catch (e) {
        setErro(mensagemErro(e));
      }
      return;
    }
    patch(c.id, { status });
  };

  const adicionar = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from("evento_convidados").insert([{
      evento_id: evento.id,
      nome,
      telefone: novoTelefone.trim() || null,
      carteira: novaCarteira,
      vendedor_nome: novoVendedor.trim() || null,
      status: "pendente",
      observacoes: `Profissão: ${novaProfissao} | Inscrição manual no HUB`,
    }]);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setNovoNome(""); setNovoTelefone(""); setNovoVendedor("");
    onChange();
  };

  const remover = async (c: EventoConvidado) => {
    if (!confirm(`Remover "${c.nome}" da lista de convidados?`)) return;
    const { error } = await supabase.from("evento_convidados").delete().eq("id", c.id);
    if (error) { setErro(error.message); return; }
    onChange();
  };

  const checkin = async (c: EventoConvidado) => {
    await patch(c.id, {
      presente: !c.presente,
      checkin_at: !c.presente ? new Date().toISOString() : null,
    });
  };

  const confirmados = convidados.filter(c => c.status === "confirmado");
  const presentes = convidados.filter(c => c.presente);
  const pendentes = convidados.filter(c => c.status === "pendente");
  const metaMin = evento.publico_meta_min || 0;
  const metaMax = evento.publico_meta_max || 0;
  const pctConfirmados = metaMax > 0 ? (confirmados.length / metaMax) * 100 : 0;
  const dias = diasAte(evento.data_evento);

  // No-show só faz sentido depois do evento; antes dele, todo confirmado ainda
  // pode aparecer. Mostrar "100% de no-show" na véspera seria ruído.
  const noShow = dias < 0 && confirmados.length > 0
    ? ((confirmados.length - presentes.length) / confirmados.length) * 100
    : null;

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return convidados.filter(c => {
      if (filtro === "presentes" && !c.presente) return false;
      if (filtro !== "todos" && filtro !== "presentes" && c.status !== filtro) return false;
      if (!q) return true;
      const prof = extrairProfissao(c.observacoes);
      return [c.nome, c.telefone, c.vendedor_nome, c.voucher_numero, prof, c.observacoes]
        .some(v => (v || "").toLowerCase().includes(q));
    });
  }, [convidados, busca, filtro]);

  const chips: { k: Filtro; label: string; n: number }[] = [
    { k: "todos", label: "Todos", n: convidados.length },
    { k: "confirmado", label: "Confirmados", n: confirmados.length },
    { k: "pendente", label: "Pendentes", n: pendentes.length },
    { k: "recusado", label: "Recusados", n: convidados.filter(c => c.status === "recusado").length },
    { k: "presentes", label: "Presentes", n: presentes.length },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Convidados</span>
          <p className="text-xl font-black text-foreground tracking-tighter mt-1">
            {convidados.length}<span className="text-sm text-muted-foreground"> / {evento.convidados_meta || "—"}</span>
          </p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">Meta de convites</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Confirmados</span>
          <p className="text-xl font-black text-emerald-600 tracking-tighter mt-1">{confirmados.length}</p>
          <div className="h-1.5 w-full bg-secondary dark:bg-slate-800 rounded-full overflow-hidden border border-border mt-2">
            <div className="h-full bg-emerald-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(pctConfirmados, 100)}%` }} />
          </div>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">
            Meta de presença: {metaMin}–{metaMax}
          </span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Presentes no dia</span>
          <p className="text-xl font-black text-blue-600 tracking-tighter mt-1">{presentes.length}</p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">Credenciamento</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">No-show</span>
          <p className={cn("text-xl font-black tracking-tighter mt-1", noShow !== null && noShow > 20 ? "text-rose-600" : "text-foreground")}>
            {noShow !== null ? `${noShow.toFixed(0)}%` : "—"}
          </p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1 block">
            {noShow !== null ? "Meta: abaixo de 20%" : `Calculado após o evento`}
          </span>
        </div>
      </div>

      {/* Adicionar convidado */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Nome</label>
          <input
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") adicionar(); }}
            placeholder="Nome do instalador"
            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Telefone</label>
          <input
            value={novoTelefone}
            onChange={e => setNovoTelefone(e.target.value)}
            placeholder="(11) 9...."
            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Vendedor</label>
          <input
            value={novoVendedor}
            onChange={e => setNovoVendedor(e.target.value)}
            placeholder="Quem convida"
            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Profissão</label>
          <select
            value={novaProfissao}
            onChange={e => setNovaProfissao(e.target.value)}
            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="Eletricista">Eletricista</option>
            <option value="Encanador">Encanador</option>
            <option value="Outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Carteira</label>
          <select
            value={novaCarteira}
            onChange={e => setNovaCarteira(e.target.value as Carteira)}
            className="px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
            <option value="Perdido">Perdido (RFV)</option>
          </select>
        </div>
        <button
          onClick={adicionar}
          disabled={salvando || !novoNome.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>

      {erro && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-rose-700 dark:text-rose-300">{erro}</span>
          <button onClick={() => setErro(null)}><X className="w-4 h-4 text-rose-500" /></button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {chips.map(c => (
          <button
            key={c.k}
            onClick={() => setFiltro(c.k)}
            className={cn(
              "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all",
              filtro === c.k
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground bg-secondary/30"
            )}
          >
            {c.label} ({c.n})
          </button>
        ))}

        <a
          href="/convite-cliente"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all flex items-center gap-1.5"
          title="Abrir página pública onde clientes e vendedores confirmam presença"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Link Convite Cliente
        </a>
        <div className="relative ml-auto min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar nome, telefone, voucher..."
            className="w-full pl-9 pr-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {["Convidado", "Profissão", "Vendedor", "Carteira", "Status", "Voucher", "Sorte", "D-7", "D-2", "Presente", "Convite", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {convidados.length === 0 ? "Nenhum convidado ainda — a meta é convidar ~100" : "Nenhum resultado para esse filtro"}
                    </span>
                  </td>
                </tr>
              ) : lista.map(c => {
                const prof = extrairProfissao(c.observacoes);
                const obsSemProfissao = c.observacoes
                  ? c.observacoes.replace(/Profiss[aã]o:\s*[^|]+(\s*\|\s*)?/i, "").trim()
                  : null;

                return (
                  <tr key={c.id} className={cn("border-b border-border/50 transition-colors", c.presente ? "bg-emerald-50/40 dark:bg-emerald-900/10" : "hover:bg-secondary/20")}>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-black text-foreground block whitespace-nowrap">{c.nome}</span>
                      {c.telefone && <span className="text-[10px] font-bold text-muted-foreground block">{c.telefone}</span>}
                      {obsSemProfissao && (
                        <span className="text-[9px] font-semibold text-blue-600/90 dark:text-blue-400 block max-w-xs truncate" title={obsSemProfissao}>
                          {obsSemProfissao}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {prof !== "—" ? (
                        <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap">
                          {prof}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">{c.vendedor_nome || "—"}</span>
                    </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap",
                      c.carteira === "Perdido"
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50"
                        : "bg-secondary text-muted-foreground border-border"
                    )}>
                      {c.carteira || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={c.status}
                      onChange={e => mudarStatus(c, e.target.value as ConvidadoStatus)}
                      className={cn(
                        "text-[10px] font-black uppercase tracking-wide border rounded-full px-2 py-1 focus:outline-none cursor-pointer",
                        CONVIDADO_STATUS_COLOR[c.status]
                      )}
                    >
                      {(["pendente", "confirmado", "recusado"] as ConvidadoStatus[]).map(s => (
                        <option key={s} value={s}>{CONVIDADO_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    {c.voucher_numero ? (
                      <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 flex items-center gap-1 whitespace-nowrap">
                        <Ticket className="w-3 h-3" /> {c.voucher_numero}
                      </span>
                    ) : <span className="text-[10px] font-bold text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-black text-foreground">{c.numero_sorteio ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => patch(c.id, { lembrete_d7: !c.lembrete_d7 })}
                      disabled={c.status !== "confirmado"}
                      title="Lembrete D-7 (15/10) enviado"
                      className={cn(
                        "w-5 h-5 rounded-md border flex items-center justify-center transition-all disabled:opacity-30",
                        c.lembrete_d7 ? "bg-blue-600 border-blue-600 text-white" : "border-border hover:border-blue-500 text-transparent"
                      )}
                    ><Check className="w-3 h-3" /></button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => patch(c.id, { lembrete_d2: !c.lembrete_d2 })}
                      disabled={c.status !== "confirmado"}
                      title="Lembrete D-2 (20/10) enviado pelo vendedor"
                      className={cn(
                        "w-5 h-5 rounded-md border flex items-center justify-center transition-all disabled:opacity-30",
                        c.lembrete_d2 ? "bg-blue-600 border-blue-600 text-white" : "border-border hover:border-blue-500 text-transparent"
                      )}
                    ><Check className="w-3 h-3" /></button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => checkin(c)}
                      disabled={c.status !== "confirmado"}
                      title={c.status !== "confirmado" ? "Só quem confirmou recebe kit e número da sorte" : "Credenciar na entrada"}
                      className={cn(
                        "px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 disabled:opacity-30",
                        c.presente
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600"
                      )}
                    >
                      <UserCheck className="w-3 h-3" /> {c.presente ? "Presente" : "Check-in"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => gerarConviteCliente(evento, c)}
                      title={c.status === "confirmado"
                        ? `Baixar convite de ${c.nome} (PDF) — com voucher e número da sorte`
                        : `Baixar convite de ${c.nome} (PDF) — sem voucher: só sai ao confirmar`}
                      className="p-1.5 rounded-md border border-border text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-all"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => remover(c)} className="p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Remover">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-500" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
        O voucher nominal e o número da sorte são gerados automaticamente ao confirmar — sem confirmação, o cliente não recebe kit nem número.
        Voltar o status para pendente não reemite o número: o cliente já recebeu aquele número no convite.
      </p>
    </div>
  );
}
