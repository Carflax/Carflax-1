import { useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardCheck, HeartHandshake, Loader2, Phone, Settings, ShieldAlert, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { carregarConfig, carregarUsuarios } from "./posvenda-service";
import { ValidacaoTab } from "./ValidacaoTab";
import { LigacoesTab } from "./LigacoesTab";
import { TratativasTab } from "./TratativasTab";
import { OportunidadesTab } from "./OportunidadesTab";
import { IndicadoresTab } from "./IndicadoresTab";
import { ConfigModal } from "./ConfigModal";
import {
  CONFIG_PADRAO,
  isGestorGeral,
  isSomenteVendedor,
  type HubUser,
  type PosVendaConfig,
  type PosVendaUserProfile,
} from "./types";

type Aba = "validacao" | "ligacoes" | "tratativas" | "oportunidades" | "indicadores";

const ABAS: { id: Aba; label: string; icon: typeof Phone }[] = [
  { id: "validacao", label: "Lista do dia", icon: ClipboardCheck },
  { id: "ligacoes", label: "Ligações", icon: Phone },
  { id: "tratativas", label: "Tratativas", icon: ShieldAlert },
  { id: "oportunidades", label: "Oportunidades", icon: ShoppingBag },
  { id: "indicadores", label: "Indicadores", icon: BarChart3 },
];

/** Aberto a partir de uma notificação do HUB: aba + card em destaque. */
export const POS_VENDA_DESTINO_KEY = "carflax_pos_venda_destino";

interface PosVendaViewProps {
  userProfile?: PosVendaUserProfile | null;
}

export function PosVendaView({ userProfile }: PosVendaViewProps) {
  const [config, setConfig] = useState<PosVendaConfig>(CONFIG_PADRAO);
  const [usuarios, setUsuarios] = useState<HubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("ligacoes");
  const [destaqueId, setDestaqueId] = useState<string | null>(null);
  const [configAberta, setConfigAberta] = useState(false);

  useEffect(() => {
    Promise.all([carregarConfig(), carregarUsuarios()])
      .then(([c, u]) => { setConfig(c); setUsuarios(u); })
      .catch((err) => console.error("[PosVenda] carregar:", err))
      .finally(() => setLoading(false));
  }, []);

  // Destino vindo de notificação (AppSidebar grava antes de trocar de tela).
  useEffect(() => {
    const ler = () => {
      try {
        const raw = localStorage.getItem(POS_VENDA_DESTINO_KEY);
        if (!raw) return;
        localStorage.removeItem(POS_VENDA_DESTINO_KEY);
        const { aba: a, contatoId } = JSON.parse(raw) as { aba: Aba; contatoId?: string };
        if (ABAS.some((x) => x.id === a)) setAba(a);
        setDestaqueId(contatoId || null);
      } catch { /* ignore */ }
    };
    ler();
    window.addEventListener("carflax-pos-venda-destino", ler);
    return () => window.removeEventListener("carflax-pos-venda-destino", ler);
  }, []);

  const somenteVendedor = !loading && isSomenteVendedor(userProfile, config);
  const podeConfigurar = isGestorGeral(userProfile) || !!userProfile?.is_leader;
  const abas = useMemo(() => (somenteVendedor ? ABAS.filter((a) => a.id === "oportunidades") : ABAS), [somenteVendedor]);
  const abaAtiva = abas.some((a) => a.id === aba) ? aba : abas[0].id;

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-background text-foreground overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-tight">Pós-venda preventivo</h1>
              <p className="text-[11px] text-muted-foreground">Ouvir o cliente depois da compra e agir antes da reclamação.</p>
            </div>
          </div>
          {podeConfigurar && (
            <button onClick={() => setConfigAberta(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-xs font-bold">
              <Settings className="w-3.5 h-3.5" /> Configurações
            </button>
          )}
        </div>
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => { setAba(a.id); setDestaqueId(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors",
                abaAtiva === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            {abaAtiva === "validacao" && <ValidacaoTab config={config} usuarios={usuarios} userProfile={userProfile} />}
            {abaAtiva === "ligacoes" && <LigacoesTab config={config} usuarios={usuarios} userProfile={userProfile} />}
            {abaAtiva === "tratativas" && <TratativasTab usuarios={usuarios} userProfile={userProfile} destaqueId={destaqueId} />}
            {abaAtiva === "oportunidades" && (
              <OportunidadesTab usuarios={usuarios} somenteDoUsuario={somenteVendedor ? userProfile?.id : undefined} destaqueId={destaqueId} />
            )}
            {abaAtiva === "indicadores" && <IndicadoresTab />}
          </>
        )}
      </div>

      {configAberta && (
        <ConfigModal
          config={config}
          usuarios={usuarios}
          userId={userProfile?.id}
          onClose={() => setConfigAberta(false)}
          onSaved={(c) => { setConfig(c); setConfigAberta(false); }}
        />
      )}
    </div>
  );
}
