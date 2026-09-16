import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Cable,
  Download,
  ExternalLink,
  History,
  Loader2,
  Printer,
  RefreshCw,
  Scale,
  Search,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { EtiquetaBobina } from "./EtiquetaBobina";
import {
  EMPRESAS,
  MOTIVO_LABEL,
  fmtMetros,
  fmtPedido,
  numeroBobina,
  salaCabosApi,
  type Bobina,
  type Divergencia,
  type Movimento,
  type Operador,
  type Pendencias,
} from "./sala-cabos-api";

type Aba = "bobinas" | "historico" | "pendencias" | "conferencia" | "operadores";

const ABAS: { id: Aba; label: string; icon: typeof Cable }[] = [
  { id: "bobinas", label: "Bobinas", icon: Cable },
  { id: "historico", label: "Histórico", icon: History },
  { id: "pendencias", label: "Pedidos sem corte", icon: AlertTriangle },
  { id: "conferencia", label: "Conferência ERP", icon: Scale },
  { id: "operadores", label: "Operadores", icon: Users },
];

const EMPRESA_KEY = "carflax-sala-cabos-empresa";

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const diasAtrasISO = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDataISO = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function Carregando() {
  return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{texto}</p>;
}

function Filtro({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );
}

export function SalaCabosView() {
  const [empresa, setEmpresa] = useState(() => {
    try { return localStorage.getItem(EMPRESA_KEY) || "001"; } catch { return "001"; }
  });
  const [aba, setAba] = useState<Aba>("bobinas");

  const trocarEmpresa = (e: string) => {
    setEmpresa(e);
    try { localStorage.setItem(EMPRESA_KEY, e); } catch { /* sem storage */ }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-background text-foreground overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Cable className="w-5 h-5" /></div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-tight">Sala de Cabos</h1>
              <p className="text-[11px] text-muted-foreground">Saldo por bobina e quem cortou cada metro.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={empresa} onChange={(e) => trocarEmpresa(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-card text-xs font-bold outline-none">
              {Object.entries(EMPRESAS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
            </select>
            <a href="/sala-cabos" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-xs font-bold">
              <ExternalLink className="w-3.5 h-3.5" /> Abrir tela do tablet
            </a>
          </div>
        </div>
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors", aba === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {aba === "bobinas" && <BobinasTab key={empresa} empresa={empresa} />}
        {aba === "historico" && <HistoricoTab key={empresa} empresa={empresa} />}
        {aba === "pendencias" && <PendenciasTab key={empresa} empresa={empresa} />}
        {aba === "conferencia" && <ConferenciaTab key={empresa} empresa={empresa} />}
        {aba === "operadores" && <OperadoresTab />}
      </div>
    </div>
  );
}

// ── Bobinas ──────────────────────────────────────────────────────────────────
function BobinasTab({ empresa }: { empresa: string }) {
  const [bobinas, setBobinas] = useState<Bobina[] | null>(null);
  const [status, setStatus] = useState<"ativa" | "todas">("ativa");
  const [filtro, setFiltro] = useState("");
  const [etiquetas, setEtiquetas] = useState<Bobina[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    salaCabosApi.bobinas({ empresa, status }).then((r) => { setErro(null); setBobinas(r); }).catch((e: Error) => { setErro(e.message); setBobinas([]); });
  }, [empresa, status]);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const f = semAcento(filtro.trim());
    return (bobinas || []).filter((b) => !f || semAcento(`${numeroBobina(b.numero)} ${b.cod_produto} ${b.descricao}`).includes(f));
  }, [bobinas, filtro]);

  const totais = useMemo(() => ({
    ativas: lista.filter((b) => b.status === "ativa").length,
    inteiras: lista.filter((b) => b.status === "ativa" && b.saldo === b.metragem_inicial).length,
    metros: lista.filter((b) => b.status === "ativa").reduce((s, b) => s + Number(b.saldo), 0),
  }), [lista]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Filtro valor={filtro} onChange={setFiltro} placeholder="Número, código ou cabo" />
          <select value={status} onChange={(e) => setStatus(e.target.value as "ativa" | "todas")} className="px-3 py-2 rounded-lg border border-border bg-background text-xs font-bold">
            <option value="ativa">Só ativas</option>
            <option value="todas">Todas (inclui finalizadas)</option>
          </select>
          <button onClick={() => { setBobinas(null); carregar(); }} className="p-2 rounded-lg border border-border hover:bg-secondary"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
        {lista.length > 0 && (
          <button onClick={() => setEtiquetas(lista.filter((b) => b.status === "ativa"))} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-xs font-bold">
            <Printer className="w-3.5 h-3.5" /> Imprimir etiquetas ({lista.filter((b) => b.status === "ativa").length})
          </button>
        )}
      </div>

      {bobinas && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span><b className="text-foreground">{totais.ativas}</b> bobinas ativas</span>
          <span><b className="text-foreground">{totais.inteiras}</b> inteiras</span>
          <span><b className="text-foreground">{fmtMetros(totais.metros)}</b> em saldo</span>
        </div>
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {!bobinas ? <Carregando /> : lista.length === 0 ? (
        <Vazio texto="Nenhuma bobina cadastrada. Faça a contagem inicial pela tela do tablet (Cadastrar bobina)." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Bobina</th>
                <th className="text-left px-3 py-2 font-bold">Cabo</th>
                <th className="text-right px-3 py-2 font-bold">Entrada</th>
                <th className="text-right px-3 py-2 font-bold">Saldo</th>
                <th className="text-left px-3 py-2 font-bold">Situação</th>
                <th className="text-left px-3 py-2 font-bold whitespace-nowrap">Cadastro</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((b) => {
                const usado = b.metragem_inicial > 0 ? 1 - b.saldo / b.metragem_inicial : 0;
                return (
                  <tr key={b.id} className="border-t border-border/40 hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono font-bold whitespace-nowrap">{numeroBobina(b.numero)}</td>
                    <td className="px-3 py-2 min-w-[240px]">
                      <p className="font-semibold">{b.descricao}</p>
                      <p className="text-muted-foreground">Cód. {b.cod_produto}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMetros(b.metragem_inicial)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      <p className="font-black">{fmtMetros(b.saldo)}</p>
                      <div className="h-1 w-20 ml-auto rounded-full bg-secondary mt-1 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, (1 - usado) * 100))}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.status === "finalizada" ? (
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">Finalizada</span>
                      ) : b.saldo === b.metragem_inicial ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold">Inteira</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold">Aberta</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDataHora(b.created_at)}<br />{b.criado_por_nome}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setEtiquetas([b])} title="Imprimir etiqueta" className="p-1.5 rounded-lg hover:bg-secondary"><Printer className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {etiquetas && <EtiquetaBobina bobinas={etiquetas} onClose={() => setEtiquetas(null)} />}
    </div>
  );
}

// ── Histórico ────────────────────────────────────────────────────────────────
function HistoricoTab({ empresa }: { empresa: string }) {
  const [inicio, setInicio] = useState(diasAtrasISO(7));
  const [fim, setFim] = useState(hojeISO());
  const [tipo, setTipo] = useState("");
  const [pedido, setPedido] = useState("");
  const [filtro, setFiltro] = useState("");
  const [movs, setMovs] = useState<Movimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [estornando, setEstornando] = useState<Movimento | null>(null);

  const carregar = useCallback(() => {
    salaCabosApi.movimentos({ empresa, inicio, fim, tipo: tipo || undefined, pedido: pedido || undefined, limite: "2000" })
      .then((r) => { setErro(null); setMovs(r); })
      .catch((e: Error) => { setErro(e.message); setMovs([]); });
  }, [empresa, inicio, fim, tipo, pedido]);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const f = semAcento(filtro.trim());
    return (movs || []).filter((m) => !f || semAcento(`${m.operador_nome} ${m.descricao} ${m.cod_produto} ${m.bobina_numero ? numeroBobina(m.bobina_numero) : ""}`).includes(f));
  }, [movs, filtro]);

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(lista.map((m) => ({
      "Data/hora": fmtDataHora(m.created_at),
      Tipo: m.tipo,
      Bobina: m.bobina_numero ? numeroBobina(m.bobina_numero) : "",
      Código: m.cod_produto,
      Cabo: m.descricao,
      Metros: Number(m.metros),
      "Saldo antes": Number(m.saldo_antes),
      "Saldo depois": Number(m.saldo_depois),
      Motivo: MOTIVO_LABEL[m.motivo] ?? m.motivo,
      Pedido: m.pedido ? fmtPedido(m.pedido) : "",
      "Quem cortou": m.operador_nome,
      Observação: m.observacao || "",
      Estornado: m.estornado_em ? `${fmtDataHora(m.estornado_em)} por ${m.estornado_por}: ${m.estorno_motivo}` : "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimentos");
    XLSX.writeFile(wb, `Sala de cabos ${EMPRESAS[empresa] ?? empresa} ${inicio} a ${fim}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-xs" />
        <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-xs" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-xs font-bold">
          <option value="">Todos os tipos</option>
          <option value="corte">Cortes</option>
          <option value="ajuste">Medições</option>
          <option value="entrada">Entradas</option>
        </select>
        <input value={pedido} onChange={(e) => setPedido(e.target.value.replace(/\D/g, ""))} placeholder="Pedido" className="w-28 px-3 py-2 rounded-lg border border-border bg-background text-xs" />
        <Filtro valor={filtro} onChange={setFiltro} placeholder="Operador, cabo ou bobina" />
        <button onClick={() => { setMovs(null); carregar(); }} className="p-2 rounded-lg border border-border hover:bg-secondary"><RefreshCw className="w-3.5 h-3.5" /></button>
        {lista.length > 0 && (
          <button onClick={exportar} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-xs font-bold">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {!movs ? <Carregando /> : lista.length === 0 ? <Vazio texto="Nenhum movimento no período." /> : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Quando</th>
                <th className="text-left px-3 py-2 font-bold">Bobina / cabo</th>
                <th className="text-left px-3 py-2 font-bold">Movimento</th>
                <th className="text-right px-3 py-2 font-bold">Metros</th>
                <th className="text-right px-3 py-2 font-bold">Saldo</th>
                <th className="text-left px-3 py-2 font-bold">Pedido / motivo</th>
                <th className="text-left px-3 py-2 font-bold">Quem</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className={cn("border-t border-border/40", m.estornado_em && "opacity-50")}>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDataHora(m.created_at)}</td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <p className="font-mono font-bold">{m.bobina_numero ? numeroBobina(m.bobina_numero) : ""}</p>
                    <p className="text-muted-foreground">{m.descricao}</p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={cn("px-2 py-0.5 rounded-full font-bold",
                      m.tipo === "corte" ? "bg-primary/10 text-primary" : m.tipo === "ajuste" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600")}>
                      {m.tipo === "corte" ? "Corte" : m.tipo === "ajuste" ? "Medição" : "Entrada"}
                    </span>
                    {m.estornado_em && <p className="text-destructive font-bold mt-1" title={m.estorno_motivo || ""}>Estornado por {m.estornado_por}</p>}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap", m.tipo === "ajuste" && Number(m.metros) < 0 && "text-destructive")}>
                    {m.tipo === "ajuste" && Number(m.metros) > 0 ? "+" : ""}{fmtMetros(m.metros)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtMetros(m.saldo_antes)} → {fmtMetros(m.saldo_depois)}</td>
                  <td className="px-3 py-2">
                    {m.pedido ? <span className="font-mono font-bold">PD {fmtPedido(m.pedido)}</span> : <span>{MOTIVO_LABEL[m.motivo] ?? m.motivo}</span>}
                    {m.observacao && <p className="text-muted-foreground">{m.observacao}</p>}
                  </td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{m.operador_nome}</td>
                  <td className="px-3 py-2 text-right">
                    {m.tipo === "corte" && !m.estornado_em && (
                      <button onClick={() => setEstornando(m)} title="Estornar corte lançado errado" className="p-1.5 rounded-lg hover:bg-secondary"><Undo2 className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {estornando && (
        <EstornoModal movimento={estornando} onClose={() => setEstornando(null)} onFeito={() => { setEstornando(null); carregar(); }} />
      )}
    </div>
  );
}

function EstornoModal({ movimento, onClose, onFeito }: { movimento: Movimento; onClose: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-black">Estornar corte</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          {fmtMetros(movimento.metros)} voltam para a {movimento.bobina_numero ? numeroBobina(movimento.bobina_numero) : "bobina"}. O registro continua no histórico, marcado como estornado.
        </p>
        <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ex.: lançado na bobina errada)" className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <button
          disabled={!motivo.trim() || salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            try { await salaCabosApi.estornar(movimento.id, motivo.trim()); onFeito(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
          }}
          className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold disabled:opacity-40"
        >
          {salvando ? "Estornando…" : "Confirmar estorno"}
        </button>
      </div>
    </div>
  );
}

// ── Pedidos sem corte ────────────────────────────────────────────────────────
function PendenciasTab({ empresa }: { empresa: string }) {
  const [dias, setDias] = useState(7);
  const [dados, setDados] = useState<Pendencias | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    salaCabosApi.pendencias(empresa, dias).then((r) => { setErro(null); setDados(r); }).catch((e: Error) => { setErro(e.message); setDados({ inicio_controle: null, pedidos: [] }); });
  }, [empresa, dias]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-border bg-background text-xs font-bold">
          {[1, 3, 7, 15, 30].map((d) => <option key={d} value={d}>Últimos {d} dia(s)</option>)}
        </select>
        <button onClick={() => { setDados(null); carregar(); }} className="p-2 rounded-lg border border-border hover:bg-secondary"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground max-w-3xl">
        Pedidos com cabo vendido a metro que ainda não têm o corte registrado (ou têm menos metros do que o pedido).
        Só entram cabos com bobina cadastrada e pedidos feitos depois do início do controle
        {dados?.inicio_controle ? ` (${fmtDataISO(dados.inicio_controle)})` : ""}. Pedido já faturado aqui é metro que saiu sem registro.
      </p>
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {!dados ? <Carregando /> : !dados.inicio_controle ? (
        <Vazio texto="O controle ainda não começou: nenhuma bobina cadastrada nesta empresa." />
      ) : dados.pedidos.length === 0 ? (
        <Vazio texto="Nenhum pedido pendente. Todos os cortes foram registrados." />
      ) : (
        <div className="space-y-3">
          {dados.pedidos.map((p) => (
            <div key={p.pedido} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black">PD {fmtPedido(p.pedido)} <span className="font-normal text-muted-foreground">· {p.cliente}</span></p>
                  <p className="text-[11px] text-muted-foreground">{fmtDataISO(p.data)} · {p.status}</p>
                </div>
                {/faturado/i.test(p.status || "") && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Já faturado sem registro</span>
                )}
              </div>
              <div className="mt-3 divide-y divide-border/40">
                {p.itens.map((i) => (
                  <div key={i.cod_produto} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <span className="font-semibold">{i.descricao}</span>
                    <span className="tabular-nums">
                      {fmtMetros(i.cortado)} de {fmtMetros(i.qtd)} · <b className="text-destructive">faltam {fmtMetros(i.falta)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Conferência com o ERP ────────────────────────────────────────────────────
function ConferenciaTab({ empresa }: { empresa: string }) {
  const [dados, setDados] = useState<Divergencia[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    salaCabosApi.divergencias(empresa).then((r) => { setErro(null); setDados(r); }).catch((e: Error) => { setErro(e.message); setDados([]); });
  }, [empresa]);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const f = semAcento(filtro.trim());
    return (dados || []).filter((d) => !f || semAcento(`${d.cod_produto} ${d.descricao}`).includes(f));
  }, [dados, filtro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Filtro valor={filtro} onChange={setFiltro} placeholder="Código ou cabo" />
        <button onClick={() => { setDados(null); carregar(); }} className="p-2 rounded-lg border border-border hover:bg-secondary"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground max-w-3xl">
        Soma do saldo das bobinas ativas comparada com o estoque do ERP. Diferença pequena e passageira é normal:
        cabo cortado para pedido ainda não faturado já saiu da bobina, mas o ERP só baixa na nota.
        Diferença que não some depois do faturamento é metro sem registro, bobina não cadastrada ou erro de estoque no ERP.
      </p>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {!dados ? <Carregando /> : lista.length === 0 ? <Vazio texto="Nenhuma bobina cadastrada para comparar." /> : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Cabo</th>
                <th className="text-right px-3 py-2 font-bold">Bobinas</th>
                <th className="text-right px-3 py-2 font-bold">Saldo nas bobinas</th>
                <th className="text-right px-3 py-2 font-bold">Saldo no ERP</th>
                <th className="text-right px-3 py-2 font-bold">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.cod_produto} className="border-t border-border/40">
                  <td className="px-3 py-2 min-w-[240px]"><p className="font-semibold">{d.descricao}</p><p className="text-muted-foreground">Cód. {d.cod_produto}</p></td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.bobinas}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMetros(d.saldo_bobinas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMetros(d.saldo_erp)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-black whitespace-nowrap", d.diferenca === 0 ? "text-emerald-600" : "text-destructive")}>
                    {d.diferenca > 0 ? "+" : ""}{fmtMetros(d.diferenca)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Operadores ───────────────────────────────────────────────────────────────
interface UsuarioHub { id: string; name: string; department: string | null }

function OperadoresTab() {
  const [ops, setOps] = useState<Operador[] | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioHub[]>([]);
  const [editando, setEditando] = useState<Partial<Operador> & { pin?: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    salaCabosApi.operadores(true).then(setOps).catch((e: Error) => { setErro(e.message); setOps([]); });
  }, []);

  useEffect(() => {
    carregar();
    supabase.from("usuarios").select("id, name, department").order("name")
      .then(({ data }) => setUsuarios((data as UsuarioHub[]) || []));
  }, [carregar]);

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    setErro(null);
    try {
      await salaCabosApi.salvarOperador({
        id: editando.id,
        nome: editando.nome,
        usuario_id: editando.usuario_id ?? null,
        pin: editando.pin || undefined,
        ativo: editando.ativo,
      });
      setEditando(null);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Quem pode registrar corte no tablet. Cada um entra com o próprio PIN, e é o nome dele que fica no registro.</p>
        <button onClick={() => { setErro(null); setEditando({ nome: "", pin: "", ativo: true, usuario_id: null }); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
          <UserPlus className="w-3.5 h-3.5" /> Novo operador
        </button>
      </div>
      {erro && !editando && <p className="text-xs text-destructive">{erro}</p>}

      {!ops ? <Carregando /> : ops.length === 0 ? <Vazio texto="Nenhum operador cadastrado." /> : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border/40">
          {ops.map((o) => (
            <div key={o.id} className={cn("flex items-center justify-between gap-3 px-4 py-3", !o.ativo && "opacity-50")}>
              <div>
                <p className="text-sm font-bold">{o.nome}</p>
                <p className="text-[11px] text-muted-foreground">{o.ativo ? "Ativo" : "Inativo"}{o.usuario_id ? " · vinculado ao HUB" : ""}</p>
              </div>
              <button onClick={() => { setErro(null); setEditando({ ...o, pin: "" }); }} className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-secondary">Editar</button>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditando(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-black">{editando.id ? "Editar operador" : "Novo operador"}</p>
              <button onClick={() => setEditando(null)} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
            </div>
            {!editando.id && (
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Usuário do HUB (opcional, traz a foto)</span>
                <select
                  value={editando.usuario_id || ""}
                  onChange={(e) => {
                    const u = usuarios.find((x) => x.id === e.target.value);
                    setEditando({ ...editando, usuario_id: e.target.value || null, nome: u ? u.name : editando.nome });
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                >
                  <option value="">— Sem vínculo —</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ""}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Nome no tablet</span>
              <input value={editando.nome || ""} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{editando.id ? "Novo PIN (deixe vazio para manter)" : "PIN (4 a 6 números)"}</span>
              <input type="password" inputMode="numeric" value={editando.pin || ""} onChange={(e) => setEditando({ ...editando, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm tracking-widest" />
            </label>
            {editando.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Ativo
              </label>
            )}
            {erro && <p className="text-xs text-destructive">{erro}</p>}
            <button
              disabled={salvando || !editando.nome?.trim() || (!editando.id && (editando.pin || "").length < 4)}
              onClick={salvar}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
