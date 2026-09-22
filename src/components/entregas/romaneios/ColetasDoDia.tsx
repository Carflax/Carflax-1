// Coletas em fornecedor que a expedição precisa encaixar na rota.
//
// O comprador registra a solicitação em Compras › Coletas (tipo, prazo,
// urgência e cidade). Aqui, na montagem do romaneio, a expedição vê o que está
// no prazo, programa para hoje no motorista selecionado e marca como coletada —
// em vez de descobrir o pedido no grupo do WhatsApp com o romaneio já pronto.

import { useCallback, useEffect, useState } from "react";
import { PackageCheck, AlertTriangle, Loader2, MapPin, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { TIPOS, URGENCIAS, type Coleta } from "@/components/compras/ColetasView";

const hojeISO = () => new Date().toISOString().split("T")[0];
const brData = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

// Coleta com prazo daqui a mais de uma semana ainda não atrapalha o romaneio de hoje.
const DIAS_A_FRENTE = 7;

export function ColetasDoDia({
  motoristaCod,
  motoristaNome,
  usuarioId,
}: {
  motoristaCod?: string;
  motoristaNome?: string;
  usuarioId?: string;
}) {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

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

  async function programar(c: Coleta) {
    setSalvandoId(c.id);
    await supabase.from("coletas").update({
      status: "programada",
      rom_date: hojeISO(),
      driver_cod: motoristaCod || null,
      driver_name: motoristaNome || null,
      programada_em: new Date().toISOString(),
      programada_por: usuarioId ?? null,
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
  if (!coletas.length) return null;

  const vencidas = coletas.filter((c) => c.coletar_ate < hojeISO()).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6">
      <div className="p-4 border-b border-border bg-secondary/20 flex items-center justify-between gap-3">
        <h4 className="text-[12px] font-black uppercase tracking-tight flex items-center gap-2">
          <PackageCheck className="w-4 h-4" /> Coletas em fornecedor
          <span className="px-2 py-0.5 rounded border border-blue-100 bg-blue-50 text-blue-600 text-[9px] font-black">
            {coletas.length}
          </span>
        </h4>
        {vencidas > 0 && (
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-500">
            <AlertTriangle className="w-3.5 h-3.5" /> {vencidas} fora do prazo
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {coletas.map((c) => (
          <div key={c.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[14rem] flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-tight">{c.fornecedor}</span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[8px] font-black uppercase", TIPOS[c.tipo].cls)}>
                  {TIPOS[c.tipo].label}
                </span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[8px] font-black uppercase", URGENCIAS[c.urgencia].cls)}>
                  {URGENCIAS[c.urgencia].label}
                </span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs whitespace-pre-wrap">{c.itens}</p>
              {c.urgencia === "alta" && c.justificativa && (
                <p className="text-[10px] text-red-500"><strong>Urgente:</strong> {c.justificativa}</p>
              )}
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                Coletar até {brData(c.coletar_ate)}
                {c.status === "programada" && ` · programada ${brData(c.rom_date)}${c.driver_name ? ` com ${c.driver_name}` : ""}`}
                {c.criado_por_nome && ` · pedida por ${c.criado_por_nome}`}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => programar(c)}
                disabled={salvandoId === c.id}
                className="h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest"
              >
                {c.status === "programada" ? "Reprogramar hoje" : "Programar hoje"}
              </button>
              <button
                onClick={() => concluir(c)}
                disabled={salvandoId === c.id}
                className="h-8 px-4 rounded-lg border border-border hover:bg-muted disabled:opacity-50 text-[10px] font-black uppercase tracking-widest"
              >
                Coletada
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
