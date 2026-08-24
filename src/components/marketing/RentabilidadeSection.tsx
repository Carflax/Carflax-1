import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Building2,
  Target,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RentabilidadeResponse } from "@/lib/api";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Um elo da cadeia faturado → margem → lucro → investido → retorno. */
function Elo({
  label,
  valor,
  hint,
  tom = "neutro",
  seta = true,
}: {
  label: string;
  valor: string;
  hint?: string;
  tom?: "neutro" | "bom" | "ruim" | "custo";
  seta?: boolean;
}) {
  const cor =
    tom === "bom"
      ? "text-emerald-500"
      : tom === "ruim"
        ? "text-rose-500"
        : tom === "custo"
          ? "text-amber-500"
          : "text-foreground";

  return (
    <>
      <div className="flex-1 min-w-[135px]">
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-black tracking-tight tabular-nums mt-0.5", cor)}>{valor}</p>
        {hint && <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {seta && <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0 hidden lg:block" />}
    </>
  );
}

export function RentabilidadeSection({ dados }: { dados: RentabilidadeResponse }) {
  const { empresa, investimento, atribuido, trafego } = dados;
  const positivo = trafego.retornoReal >= 0;

  // Abaixo de 80% de cobertura, o retorno do tráfego é chute com cara de número.
  const coberturaFraca = atribuido.cobertura < 80;

  return (
    <div className="space-y-5">
      {/* ── Empresa: números fechados, sem estimativa ───────────────────── */}
      <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Resultado da Empresa
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
            Faturamento e margem reais do ERP · sem estimativa
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Elo label="Faturado" valor={brl(empresa.faturado)} />
          <Elo label="Margem" valor={brl(empresa.margem)} hint={`${empresa.margemPct}% do faturado`} tom="bom" />
          <Elo
            label="Investido em marketing"
            valor={brl(investimento.total)}
            hint={`${brl(investimento.midia)} mídia + ${brl(investimento.fixos)} fixos`}
            tom="custo"
          />
          <Elo
            label="Peso no lucro"
            valor={`${dados.pesoNoLucro}%`}
            hint="do lucro da empresa"
            seta={false}
          />
        </div>
      </section>

      {/* ── Tráfego: depende da atribuição ──────────────────────────────── */}
      <section
        className={cn(
          "bg-card border rounded-3xl p-6 shadow-sm",
          coberturaFraca ? "border-amber-500/30" : "border-border",
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" /> Retorno do Marketing
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Vendas registradas no CRM de marketing no período
            </p>
          </div>
          <div
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider",
              coberturaFraca
                ? "bg-amber-500/15 text-amber-500"
                : "bg-emerald-500/15 text-emerald-500",
            )}
          >
            Cobertura da atribuição: {atribuido.cobertura}%
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-5">
          <Elo
            label="Faturado (marketing)"
            valor={brl(trafego.faturamento)}
            hint={`${atribuido.vendas} venda(s) no período`}
          />
          <Elo
            label="Lucro estimado"
            valor={brl(trafego.lucro)}
            hint={`margem de ${empresa.margemPct}%`}
            tom="bom"
          />
          <Elo label="Investido" valor={brl(investimento.total)} tom="custo" />
          <Elo
            label="Retorno real"
            valor={brl(trafego.retornoReal)}
            hint={`ROAS ${trafego.roas}x`}
            tom={positivo ? "bom" : "ruim"}
            seta={false}
          />
        </div>

        {/* O retorno acima já conta as vendas sem origem. O aviso existe para
            dizer o que ainda não dá para saber: de qual canal elas vieram. */}
        {coberturaFraca && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <p className="font-black uppercase tracking-wider text-amber-500 mb-1">
                Origem incompleta
              </p>
              <p className="text-muted-foreground">
                {brl(atribuido.semOrigem.faturamento)} em {atribuido.semOrigem.vendas} venda(s) não
                têm canal registrado. Elas já entram no retorno acima, mas não dá para dizer qual
                canal trouxe — a divisão por canal abaixo fica incompleta.
              </p>
              {!positivo && (
                <p className="text-muted-foreground mt-1.5">
                  Para empatar, o marketing precisaria faturar{" "}
                  <strong className="text-foreground">{brl(trafego.faturamentoParaEmpatar)}</strong>.
                </p>
              )}
              {atribuido.comAnuncio.vendas === 0 && (
                <p className="text-muted-foreground mt-1.5">
                  Nenhuma venda ainda tem o anúncio de origem carimbado. A captura só vale para
                  leads que chegarem a partir de agora.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Recorte de canal pago: o número que responde "o anúncio se paga?" */}
        {atribuido.faturamentoPago > 0 && (
          <div className="rounded-2xl border border-border bg-secondary/20 px-4 py-3 mb-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              Só canais pagos identificados
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground tabular-nums">
                {brl(trafego.somentePago.faturamento)}
              </strong>{" "}
              faturados com origem em canal pago · ROAS{" "}
              <strong className="text-foreground tabular-nums">
                {trafego.somentePago.roas}x
              </strong>
            </p>
          </div>
        )}

        {/* Por canal */}
        {atribuido.porCanal.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Canal</th>
                  <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Vendas</th>
                  <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Faturado</th>
                  <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Lucro estimado</th>
                </tr>
              </thead>
              <tbody>
                {atribuido.porCanal.map((c) => (
                  <tr key={c.canal} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5 px-2">
                      <span className="font-bold text-foreground">{c.canal}</span>
                      {c.pago && (
                        <span className="ml-2 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500">
                          pago
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-muted-foreground tabular-nums">{c.vendas}</td>
                    <td className="py-2.5 px-2 text-right font-black text-foreground tabular-nums">{brl(c.faturamento)}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-emerald-500 tabular-nums">
                      {brl(Math.round(c.faturamento * (empresa.margemPct / 100) * 100) / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] font-medium text-muted-foreground mt-4 flex items-start gap-1.5">
          {positivo ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-px" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-px" />
          )}
          {dados.aviso}
        </p>
      </section>
    </div>
  );
}
