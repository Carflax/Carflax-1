import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Cable, Calendar, ChevronDown, ClipboardList, Download, Plus, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniCalendar } from "@/components/ui/MiniCalendar";
import { supabase } from "@/lib/supabase";
import { buildAvatarResolver, type UserAvatarRow } from "@/lib/avatar-by-code";
import {
  EMPRESAS,
  fmtMetros,
  fmtPedido,
  salaCabosApi,
  type CorteCabo,
} from "./sala-cabos-api";
import { AdicionarCorteModal } from "./AdicionarCorteModal";
import { BarraFiltros, Carregando, Filtro, Vazio } from "./ui";
import { InventarioTab } from "./InventarioTab";

// Estoque › Cabos: cortes lançados por quem está na sala (login da Citel) e o
// inventário do gestor (bobina x picado por cabo).

type Aba = "cortes" | "inventario";

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// "2026-09-16" → Date local (sem cair no dia anterior por fuso).
const dataDeIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function SalaCabosView() {
  const [aba, setAba] = useState<Aba>("cortes");
  const [barra, setBarra] = useState<HTMLDivElement | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-background text-foreground overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Cable className="w-5 h-5" /></div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-tight">Cabos</h1>
              <p className="text-[11px] text-muted-foreground">
                {aba === "cortes" ? "Cortes de cabo: pedido, cliente, quem cortou, quantos metros e a hora." : "Quanto tem de cada cabo na bobina e picado."}
              </p>
            </div>
            <div className="flex gap-1 ml-3">
              {([
                { id: "cortes", label: "Cortes", icon: Scissors },
                { id: "inventario", label: "Inventário", icon: ClipboardList },
              ] as const).map((a) => (
                <button key={a.id} onClick={() => setAba(a.id)} className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors", aba === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>
                  <a.icon className="w-3.5 h-3.5" /> {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div ref={setBarra} className="flex flex-wrap items-center gap-2" />
            {aba === "cortes" && (
              <button onClick={() => setAdicionando(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
                <Plus className="w-3.5 h-3.5" /> Adicionar corte
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {aba === "cortes"
          ? <CortesTab barraFiltros={barra} recarga={recarga} />
          : <InventarioTab barraFiltros={barra} />}
      </div>

      {adicionando && (
        <AdicionarCorteModal onClose={() => setAdicionando(false)} onRegistrado={() => setRecarga((n) => n + 1)} />
      )}
    </div>
  );
}

// ── Cortes ───────────────────────────────────────────────────────────────────
// Também é a aba "Cortes de Cabo" de Estoque › Relatórios.
export function CortesTab({ barraFiltros, recarga = 0 }: { barraFiltros?: HTMLElement | null; recarga?: number }) {
  const [inicio, setInicio] = useState(() => isoLocal(new Date(Date.now() - 7 * 86400000)));
  const [fim, setFim] = useState(() => isoLocal(new Date()));
  const [filtro, setFiltro] = useState("");
  const [cortes, setCortes] = useState<CorteCabo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Mesmo seletor de período da tela de Orçamentos. Enquanto só o início foi
  // clicado, a busca continua no período anterior.
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [inicioParcial, setInicioParcial] = useState<Date | null>(null);

  const selecionarPeriodo = (ini: Date, fimSel: Date | null) => {
    if (!fimSel) { setInicioParcial(ini); return; }
    setInicioParcial(null);
    setInicio(isoLocal(ini));
    setFim(isoLocal(fimSel));
    setCalendarioAberto(false);
  };

  const rotuloPeriodo = inicioParcial
    ? `${fmtDataCurta(inicioParcial)}...`
    : `${fmtDataCurta(dataDeIso(inicio))} até ${fmtDataCurta(dataDeIso(fim))}`;

  const carregar = useCallback(() => {
    salaCabosApi.cortes({ inicio, fim })
      .then((r) => { setErro(null); setCortes(r); })
      .catch((e: Error) => { setErro(e.message); setCortes([]); });
  }, [inicio, fim]);

  // `recarga` muda quando um corte é adicionado na tela: busca de novo.
  useEffect(() => { carregar(); }, [carregar, recarga]);

  const lista = useMemo(() => {
    const f = semAcento(filtro.trim());
    return (cortes || []).filter((c) => !f || semAcento(`${fmtPedido(c.pedido)} ${c.descricao} ${c.cod_produto} ${c.cortado_por_nome} ${c.cliente || ""}`).includes(f));
  }, [cortes, filtro]);

  // Foto de quem cortou: pelo código de operador da Citel (exato, ver
  // avatar-by-code) e, sem código no cadastro do HUB, pelo nome.
  const [usuarios, setUsuarios] = useState<(UserAvatarRow & { name: string | null })[]>([]);
  useEffect(() => {
    supabase.from("usuarios").select("name, operator_code, avatar")
      .then(({ data }) => setUsuarios((data as (UserAvatarRow & { name: string | null })[]) || []));
  }, []);
  const fotoDe = useMemo(() => {
    const porCodigo = buildAvatarResolver(usuarios);
    const porNome = new Map(usuarios.filter((u) => u.avatar && u.name).map((u) => [semAcento(String(u.name).trim()), u.avatar as string]));
    return (c: CorteCabo) =>
      porCodigo(c.cortado_por_codigo) ||
      porNome.get(semAcento(c.cortado_por_nome.trim())) ||
      `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(c.cortado_por_nome)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }, [usuarios]);

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(lista.map((c) => ({
      "Quem cortou": c.cortado_por_nome,
      Pedido: fmtPedido(c.pedido),
      Empresa: EMPRESAS[c.empresa] ?? c.empresa,
      Cliente: c.cliente || "",
      "Metros cortados": Number(c.metros),
      Origem: c.origem === "bobina" ? "Bobina" : c.origem === "picado" ? "Picado" : "",
      "Hora do corte": fmtDataHora(c.created_at),
      Código: c.cod_produto,
      Cabo: c.descricao,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cortes");
    XLSX.writeFile(wb, `Cortes de cabo ${inicio} a ${fim}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <BarraFiltros alvo={barraFiltros}>
        <div className="relative">
          <button
            onClick={() => setCalendarioAberto((v) => !v)}
            className={cn(
              "h-9 px-3 rounded-lg border text-[10px] font-black uppercase tracking-tight flex items-center gap-2 transition-all outline-none",
              "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20 text-blue-600 dark:text-blue-400",
              calendarioAberto && "ring-4 ring-blue-500/5 border-blue-500/50",
            )}
          >
            <Calendar className="w-3.5 h-3.5 opacity-60 shrink-0" />
            <span className="whitespace-nowrap">{rotuloPeriodo}</span>
            <ChevronDown className={cn("w-3 h-3 opacity-60 shrink-0 transition-transform", calendarioAberto && "rotate-180")} />
          </button>
          {calendarioAberto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setCalendarioAberto(false); setInicioParcial(null); }} />
              <div className="absolute top-full left-0 mt-2 z-50">
                <MiniCalendar
                  mode="range"
                  onSelectRange={selecionarPeriodo}
                  initialStartDate={dataDeIso(inicio)}
                  initialEndDate={dataDeIso(fim)}
                />
              </div>
            </>
          )}
        </div>
        <Filtro valor={filtro} onChange={setFiltro} placeholder="Pedido, cliente, cabo ou pessoa" />
        {lista.length > 0 && (
          <button onClick={exportar} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-xs font-bold">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        )}
      </BarraFiltros>
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {!cortes ? <Carregando /> : lista.length === 0 ? (
        <Vazio texto="Nenhum corte registrado no período." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Quem cortou</th>
                <th className="text-left px-3 py-2 font-bold">Pedido</th>
                <th className="text-left px-3 py-2 font-bold">Cliente</th>
                <th className="text-right px-3 py-2 font-bold whitespace-nowrap">Quanto cortou</th>
                <th className="text-left px-3 py-2 font-bold whitespace-nowrap">Hora do corte</th>
                <th className="text-left px-3 py-2 font-bold">Cabo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <img src={fotoDe(c)} alt="" className="w-8 h-8 rounded-full object-cover bg-secondary shrink-0" />
                      <span className="font-semibold">{c.cortado_por_nome}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <p className="font-mono font-bold">{fmtPedido(c.pedido)}</p>
                    <p className="text-[10px] text-muted-foreground">{EMPRESAS[c.empresa] ?? c.empresa}</p>
                  </td>
                  <td className="px-3 py-2 min-w-[180px]">{c.cliente || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <p className="tabular-nums font-bold">{fmtMetros(c.metros)}</p>
                    {c.origem && <p className="text-[10px] text-muted-foreground">{c.origem === "bobina" ? "da bobina" : "do picado"}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDataHora(c.created_at)}</td>
                  <td className="px-3 py-2 min-w-[240px]"><p className="font-semibold">{c.descricao}</p><p className="text-muted-foreground">Cód. {c.cod_produto}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
