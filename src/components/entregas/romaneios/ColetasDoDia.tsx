// Coletas em fornecedor que a expedição precisa encaixar na rota.
//
// O comprador registra a solicitação em Compras › Coletas (tipo, prazo,
// urgência e cidade). Aqui, na montagem do romaneio, a expedição vê o que está
// no prazo, programa para hoje no motorista selecionado e marca como coletada —
// em vez de descobrir o pedido no grupo do WhatsApp com o romaneio já pronto.

import { useCallback, useEffect, useState } from "react";
import { PackageCheck, AlertTriangle, Loader2, MapPin, CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { TIPOS, URGENCIAS, type Coleta } from "@/components/compras/ColetasView";

const hojeISO = () => new Date().toISOString().split("T")[0];
const brData = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

interface RomaneioAberto {
  rom_code: string;
  driver_cod: string | null;
  driver_name: string | null;
  entregas: number;
}

// Coleta com prazo daqui a mais de uma semana ainda não atrapalha o romaneio de hoje.
const DIAS_A_FRENTE = 7;

export function ColetasDoDia({
  motoristaCod,
  motoristaNome,
  usuarioId,
  modoAba = false,
}: {
  motoristaCod?: string;
  motoristaNome?: string;
  usuarioId?: string;
  /** Na aba Coletas do Romaneio: ocupa a altura toda e avisa quando vazio. */
  modoAba?: boolean;
}) {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  // A seção fica acima dos romaneios: aberta por padrão, mas recolhível, e
  // cada coleta mostra os itens só quando pedido — senão uma coleta de 20
  // itens empurrava a montagem do romaneio para fora da tela.
  const [recolhida, setRecolhida] = useState(false);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    const limite = new Date();
    limite.setDate(limite.getDate() + DIAS_A_FRENTE);
    const { data } = await supabase
      .from("coletas")
      .select("*")
      .in("status", ["solicitada", "programada"])
      .lte("coletar_ate", limite.toISOString().split("T")[0])
      .order("coletar_ate", { ascending: true });
    setColetas((data || []) as Coleta[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Romaneios abertos de hoje, para o líder escolher onde encaixar a coleta.
  const [encaixandoId, setEncaixandoId] = useState<string | null>(null);
  const [romaneios, setRomaneios] = useState<RomaneioAberto[] | null>(null);

  async function abrirEncaixe(c: Coleta) {
    setEncaixandoId((atual) => (atual === c.id ? null : c.id));
    setRomaneios(null);
    const { data } = await supabase
      .from("entregas")
      .select("rom_code, driver_cod, driver_name")
      .eq("rom_date", hojeISO())
      .eq("rom_status", "em_andamento");
    const porCodigo = new Map<string, RomaneioAberto>();
    for (const e of data || []) {
      if (!e.rom_code) continue;
      const r = porCodigo.get(e.rom_code) ?? {
        rom_code: e.rom_code,
        driver_cod: e.driver_cod,
        driver_name: e.driver_name,
        entregas: 0,
      };
      r.entregas += 1;
      porCodigo.set(e.rom_code, r);
    }
    setRomaneios([...porCodigo.values()]);
  }

  async function encaixar(c: Coleta, r: RomaneioAberto) {
    setSalvandoId(c.id);
    await supabase.from("coletas").update({
      status: "programada",
      rom_code: r.rom_code,
      rom_date: hojeISO(),
      driver_cod: r.driver_cod || null,
      driver_name: r.driver_name?.trim() || null,
      programada_em: new Date().toISOString(),
      programada_por: usuarioId ?? null,
    }).eq("id", c.id);
    setSalvandoId(null);
    setEncaixandoId(null);
    carregar();
  }

  // Clique errado no encaixe: volta a coleta para a fila.
  async function desfazer(c: Coleta) {
    setSalvandoId(c.id);
    await supabase.from("coletas").update({
      status: "solicitada",
      rom_code: null,
      rom_date: null,
      driver_cod: null,
      driver_name: null,
      programada_em: null,
      programada_por: null,
    }).eq("id", c.id);
    setSalvandoId(null);
    carregar();
  }

  async function concluir(c: Coleta) {
    setSalvandoId(c.id);
    await supabase.from("coletas").update({
      status: "coletada",
      coletada_em: new Date().toISOString(),
      coletada_por: usuarioId ?? null,
    }).eq("id", c.id);
    setSalvandoId(null);
    carregar();
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando coletas…
      </div>
    );
  }
  if (!coletas.length) {
    if (!modoAba) return null;
    return (
      <div className="bg-card border border-border border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <PackageCheck className="w-6 h-6 text-muted-foreground mb-3" />
        <h3 className="text-[14px] font-black text-foreground uppercase">Nenhuma coleta pendente</h3>
        <p className="text-[11px] font-bold text-muted-foreground max-w-[260px] mt-1 uppercase">
          As coletas pedidas com prazo para os próximos {DIAS_A_FRENTE} dias aparecem aqui.
        </p>
      </div>
    );
  }

  const vencidas = coletas.filter((c) => c.coletar_ate < hojeISO()).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6">
      <button
        type="button"
        onClick={() => setRecolhida((r) => !r)}
        className={cn(
          "w-full px-4 py-2.5 bg-secondary/20 flex items-center justify-between gap-3 text-left",
          !recolhida && "border-b border-border",
        )}
      >
        <h4 className="text-[12px] font-black uppercase tracking-tight flex items-center gap-2">
          <PackageCheck className="w-4 h-4" /> Coletas em fornecedor
          <span className="px-2 py-0.5 rounded border border-blue-100 bg-blue-50 text-blue-600 text-[9px] font-black">
            {coletas.length}
          </span>
        </h4>
        <span className="flex items-center gap-3">
          {vencidas > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-500">
              <AlertTriangle className="w-3.5 h-3.5" /> {vencidas} fora do prazo
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", !recolhida && "rotate-180")} />
        </span>
      </button>

      {!recolhida && (
      <div className={cn("divide-y divide-border", !modoAba && "max-h-[340px] overflow-y-auto")}>
        {coletas.map((c) => {
          const itens = c.itens.split("\n").filter((l) => l.trim());
          const aberta = expandidas.has(c.id);
          return (
          <div key={c.id} className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-black uppercase tracking-tight">{c.fornecedor}</span>
                  <span className={cn("rounded border px-1.5 py-0.5 text-[8px] font-black uppercase", TIPOS[c.tipo].cls)}>
                    {TIPOS[c.tipo].label}
                  </span>
                  <span className={cn("rounded border px-1.5 py-0.5 text-[8px] font-black uppercase", URGENCIAS[c.urgencia].cls)}>
                    {URGENCIAS[c.urgencia].label}
                  </span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" · ")}
                  </span>
                  <span className={cn("flex items-center gap-1", c.coletar_ate < hojeISO() && "text-red-500")}>
                    <CalendarDays className="w-3 h-3" /> Até {brData(c.coletar_ate)}
                  </span>
                  {c.status === "programada" && (
                    <span className="text-blue-500">
                      Encaixada {brData(c.rom_date)}{c.driver_name ? ` · ${c.driver_name}` : ""}
                    </span>
                  )}
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
                    className="flex items-center gap-1 text-blue-500 hover:underline"
                  >
                    <ChevronDown className={cn("w-3 h-3 transition-transform", aberta && "rotate-180")} />
                    {itens.length} {itens.length === 1 ? "item" : "itens"}
                  </button>
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                {c.status === "programada" ? (
                  <button
                    onClick={() => desfazer(c)}
                    disabled={salvandoId === c.id}
                    className="h-7 px-3 rounded-lg border border-border hover:bg-muted disabled:opacity-50 text-[9px] font-black uppercase tracking-widest"
                  >
                    Desfazer
                  </button>
                ) : (
                  <button
                    onClick={() => abrirEncaixe(c)}
                    disabled={salvandoId === c.id}
                    className="h-7 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-widest"
                  >
                    Encaixar
                  </button>
                )}
                <button
                  onClick={() => concluir(c)}
                  disabled={salvandoId === c.id}
                  className="h-7 px-3 rounded-lg border border-border hover:bg-muted disabled:opacity-50 text-[9px] font-black uppercase tracking-widest"
                >
                  Coletada
                </button>
              </div>
            </div>

            {encaixandoId === c.id && (
              <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Encaixar em qual romaneio de hoje?
                </p>
                {romaneios === null ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                ) : romaneios.length === 0 ? (
                  <p className="text-[10px] font-bold text-slate-400">
                    Nenhum romaneio aberto hoje. Lance uma NF para o motorista e volte aqui.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {romaneios.map((r) => (
                      <button
                        key={r.rom_code}
                        onClick={() => encaixar(c, r)}
                        disabled={salvandoId === c.id}
                        className="px-3 py-1.5 rounded-lg border border-border bg-card hover:border-blue-500 disabled:opacity-50 text-left"
                      >
                        <span className="block text-[10px] font-black uppercase">{r.driver_name?.trim() || r.rom_code}</span>
                        <span className="block text-[9px] font-bold text-slate-400">
                          {r.rom_code} · {r.entregas} entrega{r.entregas === 1 ? "" : "s"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aberta && (
              <div className="mt-2 ml-1 pl-3 border-l-2 border-border space-y-1">
                <p className="text-xs whitespace-pre-wrap">{itens.join("\n")}</p>
                {c.urgencia === "alta" && c.justificativa && (
                  <p className="text-[10px] text-red-500"><strong>Urgente:</strong> {c.justificativa}</p>
                )}
                {c.criado_por_nome && (
                  <p className="text-[10px] text-slate-400">Pedida por {c.criado_por_nome}</p>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
