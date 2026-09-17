import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Loader2, Minus, Plus, RotateCcw, ScanLine, Save } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import {
  CALIBRACAO_PADRAO,
  calibrarSensorEtiqueta,
  carregarCalibracao,
  imprimirTesteEtiqueta,
  salvarCalibracao,
  type CalibracaoEtiqueta,
} from "@/lib/impressao-local";

// Ajuste fino da posição e da escuridão da etiqueta, salvo no Supabase por
// impressora. Fluxo: imprime o teste (moldura em cada etiqueta), move em mm até a
// moldura ficar dentro da etiqueta e salva — as próximas impressões já usam.
// Se cada teste sai numa altura diferente, a impressora não está achando o
// espaço entre as etiquetas: primeiro "Calibrar sensor", depois a posição.

const PASSO_MM = 0.5;
const LIMITE_MM = 20;

const arredondar = (v: number) => Math.round(v * 10) / 10;
const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

interface Props {
  /** Impressora escolhida no modal ("" = automática). */
  impressora: string;
}

export function AjustesImpressoraEtiqueta({ impressora }: Props) {
  const { showNotification } = useNotification();
  const [cal, setCal] = useState<CalibracaoEtiqueta | null>(null);
  const [salvo, setSalvo] = useState<CalibracaoEtiqueta | null>(null);
  const [acao, setAcao] = useState<"teste" | "salvar" | "sensor" | null>(null);

  useEffect(() => {
    let ativo = true;
    carregarCalibracao(impressora)
      .catch(() => CALIBRACAO_PADRAO)
      .then((c) => { if (ativo) { setCal(c); setSalvo(c); } });
    return () => { ativo = false; };
  }, [impressora]);

  if (!cal) {
    return <div className="h-full min-h-[160px] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const mover = (eixo: "offsetX" | "offsetY", delta: number) =>
    setCal((c) => c && { ...c, [eixo]: limitar(arredondar(c[eixo] + delta), -LIMITE_MM, LIMITE_MM) });

  const alterado = !salvo || (Object.keys(cal) as (keyof CalibracaoEtiqueta)[]).some((k) => cal[k] !== salvo[k]);

  const testar = async () => {
    setAcao("teste");
    try {
      const r = await imprimirTesteEtiqueta(cal, impressora);
      showNotification("success", "Teste enviado", `Confira a moldura na ${r.impressora}.`);
    } catch (e) {
      showNotification("error", "Não foi possível imprimir o teste", (e as Error).message);
    } finally {
      setAcao(null);
    }
  };

  const calibrarSensor = async () => {
    setAcao("sensor");
    try {
      const r = await calibrarSensorEtiqueta(impressora);
      showNotification("success", "Calibrando o sensor", `A ${r.impressora} vai avançar algumas etiquetas em branco. Depois imprima o teste.`);
    } catch (e) {
      showNotification("error", "Não foi possível calibrar", (e as Error).message);
    } finally {
      setAcao(null);
    }
  };

  const salvar = async () => {
    setAcao("salvar");
    try {
      await salvarCalibracao(impressora, cal);
      setSalvo(cal);
      showNotification("success", "Ajustes salvos", "As próximas etiquetas já saem com essa posição.");
    } catch (e) {
      showNotification("error", "Erro ao salvar", (e as Error).message);
    } finally {
      setAcao(null);
    }
  };

  const botaoSeta = "w-10 h-10 rounded-xl border border-border bg-background hover:bg-secondary hover:border-primary/40 flex items-center justify-center transition-colors";
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR")} mm`;

  return (
    <div className="space-y-4 pb-4">
      <p className="text-[11px] text-muted-foreground leading-snug">
        Imprima o teste: a moldura tem que ficar inteira dentro de cada etiqueta. Mova e teste de novo até acertar, depois salve.
      </p>

      {/* Sensor: sem ele sincronizado, a altura muda a cada impressão e nenhum ajuste segura */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          <b className="text-foreground">Cada teste sai numa altura diferente?</b> Calibre o sensor antes de mexer na posição.
        </p>
        <button
          onClick={calibrarSensor}
          disabled={acao !== null}
          className="h-9 px-3 rounded-lg border border-border bg-background hover:bg-secondary text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
        >
          {acao === "sensor" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} Calibrar sensor
        </button>
      </div>

      {/* Posição: setas movem a impressão na direção da seta */}
      <div className="rounded-xl border border-border bg-background/40 p-3 flex items-center gap-4">
        <div className="grid grid-cols-3 gap-1.5 shrink-0">
          <span />
          <button onClick={() => mover("offsetY", -PASSO_MM)} className={botaoSeta} title="Mais para cima"><ArrowUp className="w-4 h-4" /></button>
          <span />
          <button onClick={() => mover("offsetX", -PASSO_MM)} className={botaoSeta} title="Mais para a esquerda"><ArrowLeft className="w-4 h-4" /></button>
          <button onClick={() => setCal(CALIBRACAO_PADRAO)} className={`${botaoSeta} text-muted-foreground`} title="Voltar ao padrão"><RotateCcw className="w-3.5 h-3.5" /></button>
          <button onClick={() => mover("offsetX", PASSO_MM)} className={botaoSeta} title="Mais para a direita"><ArrowRight className="w-4 h-4" /></button>
          <span />
          <button onClick={() => mover("offsetY", PASSO_MM)} className={botaoSeta} title="Mais para baixo"><ArrowDown className="w-4 h-4" /></button>
          <span />
        </div>
        <div className="space-y-2 text-xs min-w-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Horizontal</p>
            <p className="font-black tabular-nums">{fmt(cal.offsetX)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vertical</p>
            <p className="font-black tabular-nums">{fmt(cal.offsetY)}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Cada clique move {PASSO_MM.toLocaleString("pt-BR")} mm.</p>
        </div>
      </div>

      {/* Escuridão do preto (DENSITY 0–15) */}
      <div className="rounded-xl border border-border bg-background/40 p-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Escuridão</p>
          <p className="text-[11px] text-muted-foreground">Preto falhado: aumente. Borrado: diminua.</p>
        </div>
        <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
          <button onClick={() => setCal({ ...cal, densidade: limitar(cal.densidade - 1, 0, 15) })} className="w-8 h-8 hover:bg-secondary flex items-center justify-center" title="Mais claro"><Minus className="w-3 h-3" /></button>
          <span className="w-10 h-8 border-x border-border flex items-center justify-center text-xs font-black tabular-nums">{cal.densidade}</span>
          <button onClick={() => setCal({ ...cal, densidade: limitar(cal.densidade + 1, 0, 15) })} className="w-8 h-8 hover:bg-secondary flex items-center justify-center" title="Mais escuro"><Plus className="w-3 h-3" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={testar}
          disabled={acao !== null}
          className="h-10 rounded-xl border border-border bg-background hover:bg-secondary text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {acao === "teste" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} Imprimir teste
        </button>
        <button
          onClick={salvar}
          disabled={acao !== null || !alterado}
          className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {acao === "salvar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {alterado ? "Salvar" : "Salvo"}
        </button>
      </div>
    </div>
  );
}
