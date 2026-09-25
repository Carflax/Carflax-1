// Compras › Coletas — solicitação de coleta em fornecedor.
//
// Antes o comprador pedia a coleta no grupo do WhatsApp e a expedição só
// descobria depois do romaneio pronto. Aqui a solicitação fica registrada com
// tipo, prazo e urgência (alta exige justificativa), e a tela mostra em que dias
// já existe rota de entrega na cidade do fornecedor (Configurações › Dias de
// Entrega), para a coleta pegar carona numa viagem que já vai acontecer.
//
// A expedição vê e programa as coletas em Entregas › Romaneios.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Truck,
  Plus,
  Loader2,
  AlertTriangle,
  CalendarDays,
  MapPin,
  Package,
  X,
  Check,
  Ban,
  RotateCcw,
  Search,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/App";
import { apiComprasPedidosAbertos, type PedidoCompraAberto } from "@/lib/api";

export interface Coleta {
  id: string;
  criado_em: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  fornecedor: string;
  contato: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  tipo: "venda_casada" | "reposicao";
  referencia: string | null;
  itens: string;
  volumes: number | null;
  peso_kg: number | null;
  coletar_ate: string;
  urgencia: "baixa" | "media" | "alta";
  justificativa: string | null;
  observacao: string | null;
  status: "solicitada" | "programada" | "coletada" | "cancelada";
  rom_date: string | null;
  driver_name: string | null;
  motivo_cancelamento: string | null;
}

const DIAS_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX"] as const;
const DIAS_LABELS: Record<string, string> = {
  SEG: "segunda", TER: "terça", QUA: "quarta", QUI: "quinta", SEX: "sexta",
};
// Domingo = 0 no JS; a tabela de entrega só tem dias úteis.
const INDICE_DIA: Record<string, number> = { SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5 };

export const URGENCIAS = {
  baixa: { label: "Baixa", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20" },
  media: { label: "Média", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  alta: { label: "Alta", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
} as const;

export const TIPOS = {
  venda_casada: { label: "Venda casada", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  reposicao: { label: "Reposição", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
} as const;

const STATUS = {
  solicitada: { label: "Solicitada", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  programada: { label: "Programada", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  coletada: { label: "Coletada", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  cancelada: { label: "Cancelada", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
} as const;

const hojeISO = () => new Date().toISOString().split("T")[0];
const brData = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

/** Próximas datas (até 3) em que já existe rota de entrega naquela cidade. */
export function proximasRotas(
  cidade: string,
  entregasPorDia: Record<string, string[]>,
  limite = 3,
): { data: string; dia: string }[] {
  const alvo = semAcento(cidade);
  if (!alvo) return [];
  const diasDaCidade = DIAS_SEMANA.filter((d) =>
    (entregasPorDia[d] || []).some((c) => semAcento(c) === alvo),
  );
  if (!diasDaCidade.length) return [];

  const achadas: { data: string; dia: string }[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  for (let i = 1; i <= 21 && achadas.length < limite; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const dia = diasDaCidade.find((d) => INDICE_DIA[d] === cursor.getDay());
    if (dia) achadas.push({ data: cursor.toISOString().split("T")[0], dia });
  }
  return achadas;
}

const FORM_VAZIO = {
  fornecedor: "",
  contato: "",
  endereco: "",
  bairro: "",
  cidade: "",
  uf: "SP",
  tipo: "reposicao" as Coleta["tipo"],
  referencia: "",
  itens: "",
  volumes: "",
  peso_kg: "",
  coletar_ate: "",
  urgencia: "baixa" as Coleta["urgencia"],
  justificativa: "",
  observacao: "",
};

export function ColetasView({ userProfile }: { userProfile?: UserProfile }) {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [entregasPorDia, setEntregasPorDia] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<"abertas" | "todas">("abertas");
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [pedidos, setPedidos] = useState<PedidoCompraAberto[] | null>(null);
  const [buscaPedido, setBuscaPedido] = useState("");
  const [pedidoSel, setPedidoSel] = useState<PedidoCompraAberto | null>(null);
  const [editarDados, setEditarDados] = useState(false);
  const [manual, setManual] = useState(false);
  // Coleta sendo editada: o mesmo formulário da "Nova coleta", já preenchido.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  // Cards com a lista de itens aberta. Fechado, o card mostra só os 3 primeiros
  // para todos terem a mesma altura.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!aberto || pedidos) return;
    apiComprasPedidosAbertos()
      .then((r) => setPedidos(r.data || []))
      .catch(() => setPedidos([]));
  }, [aberto, pedidos]);

  const pedidosFiltrados = useMemo(() => {
    const q = semAcento(buscaPedido);
    // Pedido que já virou coleta (não cancelada) sai da busca: pedir de novo
    // gerava coleta duplicada no mesmo fornecedor.
    const jaSolicitados = new Set(
      coletas
        .filter((c) => c.status !== "cancelada" && c.referencia)
        .map((c) => c.referencia!.match(/^Pedido (\d+) \(emp\. (\w+)\)/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => `${m[2]}-${Number(m[1])}`),
    );
    const lista = (pedidos || []).filter(
      (p) => !jaSolicitados.has(`${p.empresa}-${Number(p.pedido)}`),
    );
    if (!q) return lista;
    return lista.filter((p) =>
      semAcento(`${Number(p.pedido)} ${p.fornecedor} ${p.cliente ?? ""} ${p.cidade ?? ""} ${p.itens.map((i) => i.descricao).join(" ")}`).includes(q),
    );
  }, [pedidos, buscaPedido, coletas]);

  function escolherPedido(p: PedidoCompraAberto) {
    setPedidoSel(p);
    setManual(false);
    setEditarDados(false);
    setForm((f) => ({
      ...f,
      fornecedor: p.fornecedor,
      contato: p.contato || "",
      endereco: p.endereco || "",
      bairro: p.bairro || "",
      cidade: p.cidade || "",
      uf: p.uf || "SP",
      tipo: p.pedido_venda ? "venda_casada" : "reposicao",
      referencia: p.pedido_venda
        ? `Pedido ${Number(p.pedido)} (emp. ${p.empresa}) · venda ${Number(p.pedido_venda)}${p.cliente ? ` · ${p.cliente}` : ""}`
        : `Pedido ${Number(p.pedido)} (emp. ${p.empresa})`,
      itens: p.itens.map((i) => `${i.pendente} × ${i.descricao} (${i.cod})`).join("\n"),
    }));
  }

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("coletas")
      .select("*")
      .order("coletar_ate", { ascending: true })
      .limit(300);
    if (error) setErro(error.message);
    else setColetas((data || []) as Coleta[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
    supabase
      .from("crm_config")
      .select("key, value")
      .eq("key", "extensao_entregas")
      .maybeSingle()
      .then(({ data }) => {
        try {
          const parsed = JSON.parse(String(data?.value ?? "{}"));
          if (parsed && typeof parsed === "object") setEntregasPorDia(parsed);
        } catch {
          // configuração fora do formato: a tela só perde a sugestão de dia
        }
      });
  }, [carregar]);

  const rotas = useMemo(
    () => proximasRotas(form.cidade, entregasPorDia),
    [form.cidade, entregasPorDia],
  );

  const visiveis = useMemo(
    () =>
      filtro === "abertas"
        ? coletas.filter((c) => c.status === "solicitada" || c.status === "programada")
        : coletas,
    [coletas, filtro],
  );

  const atrasadas = useMemo(
    () =>
      coletas.filter(
        (c) => (c.status === "solicitada" || c.status === "programada") && c.coletar_ate < hojeISO(),
      ).length,
    [coletas],
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (form.urgencia === "alta" && !form.justificativa.trim()) {
      setErro("Urgência alta precisa de justificativa.");
      return;
    }
    setSalvando(true);
    const dados = {
      fornecedor: form.fornecedor.trim(),
      contato: form.contato.trim() || null,
      endereco: form.endereco.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim(),
      uf: form.uf.trim().toUpperCase() || "SP",
      tipo: form.tipo,
      referencia: form.referencia.trim() || null,
      itens: form.itens.trim(),
      volumes: form.volumes ? Number(form.volumes) : null,
      peso_kg: form.peso_kg ? Number(form.peso_kg.replace(",", ".")) : null,
      coletar_ate: form.coletar_ate,
      urgencia: form.urgencia,
      justificativa: form.justificativa.trim() || null,
      observacao: form.observacao.trim() || null,
    };
    const { error } = editandoId
      ? await supabase.from("coletas").update(dados).eq("id", editandoId)
      : await supabase.from("coletas").insert([{
          criado_por: userProfile?.id ?? null,
          criado_por_nome: userProfile?.name ?? null,
          ...dados,
        }]);
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setForm({ ...FORM_VAZIO });
    setEditandoId(null);
    setPedidoSel(null);
    setEditarDados(false);
    setManual(false);
    setBuscaPedido("");
    setPedidos(null);
    setAberto(false);
    carregar();
  }

  function editar(c: Coleta) {
    setForm({
      fornecedor: c.fornecedor,
      contato: c.contato ?? "",
      endereco: c.endereco ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade,
      uf: c.uf,
      tipo: c.tipo,
      referencia: c.referencia ?? "",
      itens: c.itens,
      volumes: c.volumes != null ? String(c.volumes) : "",
      peso_kg: c.peso_kg != null ? String(c.peso_kg) : "",
      coletar_ate: c.coletar_ate,
      urgencia: c.urgencia,
      justificativa: c.justificativa ?? "",
      observacao: c.observacao ?? "",
    });
    setEditandoId(c.id);
    setPedidoSel(null);
    setManual(true);
    setErro(null);
    setAberto(true);
    // O formulário fica no topo; sem rolar, o clique parecia não fazer nada.
    setTimeout(() => {
      document.getElementById("form-coleta")?.closest(".overflow-y-auto")?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  }

  function fecharFormulario() {
    setAberto(false);
    setEditandoId(null);
    setForm({ ...FORM_VAZIO });
    setManual(false);
  }

  async function cancelar(c: Coleta) {
    const motivo = prompt(`Por que a coleta em ${c.fornecedor} foi cancelada?`);
    if (motivo === null) return;
    const { error } = await supabase
      .from("coletas")
      .update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        cancelada_por: userProfile?.id ?? null,
        motivo_cancelamento: motivo.trim() || null,
      })
      .eq("id", c.id);
    if (error) setErro(error.message);
    else carregar();
  }

  async function reabrir(c: Coleta) {
    const { error } = await supabase
      .from("coletas")
      .update({ status: "solicitada", cancelada_em: null, cancelada_por: null, motivo_cancelamento: null })
      .eq("id", c.id);
    if (error) setErro(error.message);
    else carregar();
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5" /> Coletas
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitação de coleta em fornecedor. A expedição programa o dia em Entregas › Romaneios.
          </p>
        </div>
        <button
          onClick={() => (aberto ? fecharFormulario() : setAberto(true))}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          {aberto ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {aberto ? "Fechar" : "Nova coleta"}
        </button>
      </div>

      {atrasadas > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4" />
          {atrasadas} coleta{atrasadas > 1 ? "s" : ""} com prazo vencido.
        </div>
      )}

      {erro && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}

      {aberto && (
        <form id="form-coleta" onSubmit={salvar} className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          {editandoId ? (
            <p className="text-sm font-black uppercase tracking-wide">
              Editando coleta · {form.fornecedor}
            </p>
          ) : pedidoSel ? (
            <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b border-border">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Pedido {Number(pedidoSel.pedido)} · emp. {pedidoSel.empresa} · {brData(pedidoSel.data_pedido)}
                    </p>
                    <p className="text-lg font-black leading-tight">{pedidoSel.fornecedor}</p>
                    {pedidoSel.pedido_venda && (
                      <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-xs font-bold text-violet-600 dark:text-violet-400">
                        Venda casada · pedido de venda {Number(pedidoSel.pedido_venda)}
                        {pedidoSel.cliente && <span className="font-semibold">· {pedidoSel.cliente}</span>}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {[pedidoSel.endereco, pedidoSel.bairro, [pedidoSel.cidade, pedidoSel.uf].filter(Boolean).join("/")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                    {pedidoSel.contato && <p className="text-xs text-muted-foreground">{pedidoSel.contato}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditarDados((v) => !v)} className={BOTAO_SEC}>
                    {editarDados ? "Ocultar dados" : "Editar dados"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPedidoSel(null);
                      setEditarDados(false);
                      setForm({ ...FORM_VAZIO });
                    }}
                    className={BOTAO_SEC}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Trocar pedido
                  </button>
                </div>
              </div>
              {!editarDados && (
                <div className="p-4">
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    {pedidoSel.itens.length} ite{pedidoSel.itens.length > 1 ? "ns" : "m"} a coletar
                  </p>
                  <ul className="grid gap-1.5 md:grid-cols-2 max-h-72 overflow-y-auto">
                    {pedidoSel.itens.map((i) => (
                      <li key={i.cod} className="flex items-center gap-3 rounded-lg bg-background/60 border border-border px-3 py-2">
                        <span className="shrink-0 min-w-9 rounded-md bg-primary/10 px-2 py-0.5 text-center text-xs font-black text-primary">
                          {i.pendente}
                        </span>
                        <span className="text-sm leading-tight">{i.descricao}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
          <>
          <Campo label="Pedido de compra">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={buscaPedido}
                onChange={(e) => setBuscaPedido(e.target.value)}
                placeholder="buscar por nº do pedido, fornecedor, cidade ou item"
                className={cn(INPUT, "pl-9")}
              />
            </div>
          </Campo>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {pedidos === null ? (
              <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando pedidos em aberto…
              </p>
            ) : pedidosFiltrados.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Nenhum pedido em aberto encontrado.</p>
            ) : (
              pedidosFiltrados.map((p) => {
                const chave = `${p.empresa}-${p.pedido}`;
                return (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => escolherPedido(p)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        Pedido {Number(p.pedido)} · {p.fornecedor}
                        {p.pedido_venda && (
                          <span className="ml-2 rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-violet-600 dark:text-violet-400">
                            Venda casada{p.cliente ? ` · ${p.cliente}` : ""}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        emp. {p.empresa} · {brData(p.data_pedido)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.cidade, p.uf].filter(Boolean).join("/")} · {p.itens.length} ite{p.itens.length > 1 ? "ns" : "m"} pendente{p.itens.length > 1 ? "s" : ""}:{" "}
                      {p.itens.map((i) => i.descricao).join(", ")}
                    </p>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => setManual((v) => !v)}
            className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {manual ? "Ocultar preenchimento manual" : "Coleta sem pedido de compra? Preencher à mão"}
          </button>
          </>
          )}

          {(manual || editarDados) && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="Fornecedor" obrigatorio>
              <input required value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className={INPUT} />
            </Campo>
            <Campo label="Contato no fornecedor">
              <input value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} placeholder="nome e telefone" className={INPUT} />
            </Campo>
            <Campo label="Pedido / NF / cliente">
              <input value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} className={INPUT} />
            </Campo>
            <Campo label="Endereço">
              <input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className={INPUT} />
            </Campo>
            <Campo label="Bairro">
              <input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className={INPUT} />
            </Campo>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Campo label="Cidade" obrigatorio>
                <input required value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={INPUT} />
              </Campo>
              <Campo label="UF">
                <input value={form.uf} maxLength={2} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className={INPUT} />
              </Campo>
            </div>
          </div>
          )}

          {(pedidoSel || manual) && (
          <>
          {form.cidade.trim().length > 2 && (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
              {rotas.length ? (
                <>
                  <p className="font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" /> Já tem entrega em {form.cidade.trim()} nestes dias:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {rotas.map((r) => (
                      <button
                        key={r.data}
                        type="button"
                        onClick={() => setForm({ ...form, coletar_ate: r.data })}
                        className={cn(
                          "rounded-lg border px-3 py-1 text-xs font-bold uppercase tracking-wide",
                          form.coletar_ate === r.data
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {DIAS_LABELS[r.dia]} {brData(r.data)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Marcar a coleta num desses dias aproveita a viagem que já vai acontecer.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Não há dia de entrega cadastrado para {form.cidade.trim()}: a expedição vai
                  precisar de uma viagem só para essa coleta.
                </p>
              )}
            </div>
          )}

          {(manual || editarDados) && (
            <Campo label="O que coletar" obrigatorio>
              <textarea required rows={3} value={form.itens} onChange={(e) => setForm({ ...form, itens: e.target.value })} placeholder="itens e quantidades" className={INPUT} />
            </Campo>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Campo label="Tipo" obrigatorio>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
                {(Object.keys(TIPOS) as (keyof typeof TIPOS)[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, tipo: t })}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                      form.tipo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {TIPOS[t].label}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo label="Coletar até" obrigatorio>
              <input required type="date" min={hojeISO()} value={form.coletar_ate} onChange={(e) => setForm({ ...form, coletar_ate: e.target.value })} className={INPUT} />
            </Campo>
            <Campo label="Urgência" obrigatorio>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background p-1">
                {(Object.keys(URGENCIAS) as (keyof typeof URGENCIAS)[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setForm({ ...form, urgencia: u })}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                      form.urgencia === u ? URGENCIAS[u].cls : "border-transparent text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {URGENCIAS[u].label}
                  </button>
                ))}
              </div>
            </Campo>
          </div>

          {form.urgencia === "alta" && (
            <Campo label="Por que é urgente" obrigatorio>
              <textarea
                required
                rows={2}
                value={form.justificativa}
                onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                placeholder="ex.: cliente vem retirar amanhã e o item acabou"
                className={INPUT}
              />
            </Campo>
          )}

          <Campo label="Observação">
            <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="opcional" className={INPUT} />
          </Campo>

          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editandoId ? "Salvar alterações" : "Solicitar coleta"}
            </button>
          </div>
          </>
          )}
        </form>
      )}

      <div className="flex gap-2">
        {(["abertas", "todas"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-lg border px-4 py-1.5 text-xs font-bold uppercase tracking-wide",
              filtro === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
            )}
          >
            {f === "abertas" ? "Em aberto" : "Todas"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : visiveis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma coleta {filtro === "abertas" ? "em aberto" : "registrada"}.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => (
            <article key={c.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 h-full">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold leading-tight">{c.fornecedor}</h2>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={cn("rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase", STATUS[c.status].cls)}>
                  {STATUS[c.status].label}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className={cn("rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase", TIPOS[c.tipo].cls)}>
                  {TIPOS[c.tipo].label}
                </span>
                <span className={cn("rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase", URGENCIAS[c.urgencia].cls)}>
                  Urgência {URGENCIAS[c.urgencia].label}
                </span>
                <span
                  className={cn(
                    "rounded-lg border border-border px-2 py-0.5 text-[10px] font-black uppercase",
                    c.coletar_ate < hojeISO() && c.status !== "coletada" && "border-red-500/30 text-red-600 dark:text-red-400",
                  )}
                >
                  Até {brData(c.coletar_ate)}
                </span>
              </div>

              {(() => {
                const linhas = c.itens.split("\n").filter((l) => l.trim());
                const aberto = expandidas.has(c.id);
                const MAX = 3;
                return (
                  <div>
                    <p className="text-sm whitespace-pre-wrap">
                      {(aberto ? linhas : linhas.slice(0, MAX)).join("\n")}
                    </p>
                    {linhas.length > MAX && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandidas((prev) => {
                            const n = new Set(prev);
                            if (n.has(c.id)) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                        className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", aberto && "rotate-180")} />
                        {aberto ? "Ver menos" : `Ver todos os ${linhas.length} itens`}
                      </button>
                    )}
                  </div>
                );
              })()}

              {c.urgencia === "alta" && c.justificativa && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  <strong>Urgente:</strong> {c.justificativa}
                </p>
              )}

              <div className="text-xs text-muted-foreground space-y-0.5">
                {c.referencia && <p className="flex items-center gap-1"><Package className="w-3 h-3" /> {c.referencia}</p>}
                {(c.volumes || c.peso_kg) && (
                  <p>{[c.volumes ? `${c.volumes} vol.` : null, c.peso_kg ? `${c.peso_kg} kg` : null].filter(Boolean).join(" · ")}</p>
                )}
                {c.contato && <p>Contato: {c.contato}</p>}
                {c.status === "programada" && (
                  <p className="font-semibold text-blue-600 dark:text-blue-400">
                    Programada para {brData(c.rom_date)}{c.driver_name ? ` · ${c.driver_name}` : ""}
                  </p>
                )}
                {c.status === "cancelada" && c.motivo_cancelamento && <p>Cancelada: {c.motivo_cancelamento}</p>}
                <p>Pedida por {c.criado_por_nome || "—"}</p>
              </div>

              {c.status !== "coletada" && (
                <div className="flex gap-2 pt-1 mt-auto">
                  {c.status === "cancelada" ? (
                    <button onClick={() => reabrir(c)} className={BOTAO_SEC}>
                      <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                    </button>
                  ) : (
                    <>
                      <button onClick={() => editar(c)} className={BOTAO_SEC}>
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button onClick={() => cancelar(c)} className={BOTAO_SEC}>
                        <Ban className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

const BOTAO_SEC =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted";

function Campo({ label, obrigatorio, children }: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
        {obrigatorio && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
