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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/App";

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
    const { error } = await supabase.from("coletas").insert([{
      criado_por: userProfile?.id ?? null,
      criado_por_nome: userProfile?.name ?? null,
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
    }]);
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setForm({ ...FORM_VAZIO });
    setAberto(false);
    carregar();
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
    <div className="p-4 sm:p-6 space-y-5">
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
          onClick={() => setAberto((v) => !v)}
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
        <form onSubmit={salvar} className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
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

          <Campo label="O que coletar" obrigatorio>
            <textarea required rows={3} value={form.itens} onChange={(e) => setForm({ ...form, itens: e.target.value })} placeholder="itens e quantidades" className={INPUT} />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Tipo" obrigatorio>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Coleta["tipo"] })} className={INPUT}>
                <option value="reposicao">Reposição</option>
                <option value="venda_casada">Venda casada</option>
              </select>
            </Campo>
            <Campo label="Coletar até" obrigatorio>
              <input required type="date" min={hojeISO()} value={form.coletar_ate} onChange={(e) => setForm({ ...form, coletar_ate: e.target.value })} className={INPUT} />
            </Campo>
            <Campo label="Volumes">
              <input inputMode="numeric" value={form.volumes} onChange={(e) => setForm({ ...form, volumes: e.target.value.replace(/\D/g, "") })} className={INPUT} />
            </Campo>
            <Campo label="Peso (kg)">
              <input inputMode="decimal" value={form.peso_kg} onChange={(e) => setForm({ ...form, peso_kg: e.target.value })} className={INPUT} />
            </Campo>
          </div>

          <Campo label="Urgência" obrigatorio>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(URGENCIAS) as (keyof typeof URGENCIAS)[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm({ ...form, urgencia: u })}
                  className={cn(
                    "rounded-lg border px-4 py-1.5 text-xs font-bold uppercase tracking-wide",
                    form.urgencia === u ? URGENCIAS[u].cls : "border-border hover:bg-muted",
                  )}
                >
                  {URGENCIAS[u].label}
                </button>
              ))}
            </div>
          </Campo>

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
            <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className={INPUT} />
          </Campo>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Solicitar coleta
            </button>
          </div>
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
            <article key={c.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
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

              <p className="text-sm whitespace-pre-wrap">{c.itens}</p>

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
                <div className="flex gap-2 pt-1">
                  {c.status === "cancelada" ? (
                    <button onClick={() => reabrir(c)} className={BOTAO_SEC}>
                      <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                    </button>
                  ) : (
                    <button onClick={() => cancelar(c)} className={BOTAO_SEC}>
                      <Ban className="w-3.5 h-3.5" /> Cancelar
                    </button>
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
