import { Bar, BarChart, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GestorPaineis } from "@/lib/api";

/**
 * Telas de gráfico do Gestor (abas Compras, Estoque, Cobranças). Dados do
 * paineisHandler; desenho pensado para celular (uma coluna, gráficos baixos).
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCurto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mi`;
  if (a >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return brl(v);
};
const dec = (v: number, c = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const inteiro = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const rotuloMes = (mes: string) => {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [, m] = mes.split("-");
  return nomes[Number(m) - 1] || mes;
};

const COR = { faturamento: "#3b82f6", compras: "#f59e0b", custo: "#94a3b8", vencido: "#ef4444", aVencer: "#10b981", barra: "#3b82f6" };

function Card({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      {titulo && <h2 className="mb-3 text-sm font-bold">{titulo}</h2>}
      {children}
    </section>
  );
}

function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-black tabular-nums ${cor || ""}`}>{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Barras({ itens, cor }: { itens: { nome: string; valor: number; dias?: number }[]; cor: string }) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="space-y-2.5">
      {itens.map((i) => (
        <div key={i.nome}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate">{i.nome}</span>
            <span className="shrink-0 font-semibold tabular-nums">{brl(i.valor)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />
            </div>
            {i.dias != null && <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">{dec(i.dias, 0)}d</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const eixoX = { axisLine: false, tickLine: false, tick: { fill: "currentColor", fontSize: 11 }, dy: 6 } as const;
const tip = {
  contentStyle: { borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 },
  labelStyle: { color: "hsl(var(--foreground))" },
} as const;

export function PaineisTela({ aba, dados }: { aba: "compras" | "estoque" | "cobrancas"; dados: GestorPaineis | null }) {
  if (!dados) {
    return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}</div>;
  }

  if (aba === "compras") {
    const c = dados.compras;
    return (
      <div className="space-y-4 text-muted-foreground">
        <div className="grid grid-cols-2 gap-3">
          <Kpi rotulo="Entradas no mês" valor={brlCurto(c.entradas)} sub={`${inteiro(c.nfs)} notas`} cor="text-foreground" />
          <Kpi rotulo="Pedidos pendentes" valor={brlCurto(c.pendente)} cor="text-amber-600 dark:text-amber-400" />
          <Kpi rotulo="Prazo médio de compra" valor={`${dec(c.prazo_medio, 0)} dias`} cor="text-foreground" />
          <Kpi rotulo="Itens abaixo do mínimo" valor={inteiro(c.abaixo_minimo)} cor={c.abaixo_minimo > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"} />
        </div>
        <Card titulo="Faturamento × Compras (12 meses)">
          <div className="h-56 text-muted-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={c.serie} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2}>
                <XAxis dataKey="mes" tickFormatter={rotuloMes} interval={0} {...eixoX} />
                <YAxis hide />
                <Tooltip {...tip} formatter={(v, n) => [brl(Number(v)), n]} labelFormatter={(m) => rotuloMes(String(m))} />
                <Bar dataKey="faturamento" name="Faturamento" fill={COR.faturamento} radius={[3, 3, 0, 0]} />
                <Bar dataKey="compras" name="Compras" fill={COR.compras} radius={[3, 3, 0, 0]} />
                <Line dataKey="custo" name="Custo" stroke={COR.custo} strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <Legenda cor={COR.faturamento} texto="Faturamento" />
            <Legenda cor={COR.compras} texto="Compras recebidas" />
            <Legenda cor={COR.custo} texto="Custo das vendas" />
          </div>
        </Card>
      </div>
    );
  }

  if (aba === "estoque") {
    const e = dados.estoque;
    return (
      <div className="space-y-4 text-muted-foreground">
        <div className="grid grid-cols-3 gap-3">
          <Kpi rotulo="Valor do estoque" valor={brlCurto(e.total)} cor="text-foreground" />
          <Kpi rotulo="Duração" valor={`${dec(e.dias, 0)}d`} cor="text-foreground" />
          <Kpi rotulo="Abaixo do mín." valor={inteiro(e.abaixo_minimo)} cor={e.abaixo_minimo > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"} />
        </div>
        {e.por_empresa.length > 0 && (
          <Card titulo="Estoque por empresa">
            <div className="h-40 text-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={e.por_empresa} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="emp" tickFormatter={(v) => `Emp. ${v}`} {...eixoX} />
                  <YAxis hide />
                  <Tooltip {...tip} formatter={(v) => brl(Number(v))} labelFormatter={(v) => `Empresa ${v}`} />
                  <Bar dataKey="estoque" name="Estoque" radius={[4, 4, 0, 0]}>
                    {e.por_empresa.map((_, i) => <Cell key={i} fill={COR.barra} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card titulo="Maiores estoques por fornecedor"><Barras itens={e.fornecedores} cor={COR.barra} /></Card>
        <Card titulo="Estoque por linha"><Barras itens={e.linhas} cor="#8b5cf6" /></Card>
      </div>
    );
  }

  // cobranças
  const cb = dados.cobrancas;
  const rotuloFaixa = (f: number) => (f === 30 ? "Até 30d" : f === 60 ? "31-60d" : f === 120 ? "61-120d" : "+120d");
  const faixas = cb.faixas.map((f) => ({ ...f, rotulo: rotuloFaixa(f.faixa) }));
  return (
    <div className="space-y-4 text-muted-foreground">
      <div className="grid grid-cols-2 gap-3">
        <Kpi rotulo="A receber (a vencer)" valor={brlCurto(cb.a_vencer)} cor="text-emerald-600 dark:text-emerald-400" />
        <Kpi rotulo="Vencido" valor={brlCurto(cb.vencido)} cor={cb.vencido > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"} />
        <Kpi rotulo="Inadimplência" valor={`${dec(cb.inadimplencia, 2)}%`} cor="text-foreground" />
        <Kpi rotulo="Carteira" valor={brlCurto(cb.carteira)} sub={cb.qtd_boletos ? `${inteiro(cb.qtd_boletos)} boletos` : undefined} cor="text-foreground" />
      </div>
      <Card titulo="Por prazo (a vencer × vencido)">
        <div className="h-52 text-muted-foreground">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={faixas} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="rotulo" interval={0} {...eixoX} />
              <YAxis hide />
              <Tooltip {...tip} formatter={(v, n) => [brl(Number(v)), n === "a_vencer" ? "A vencer" : "Vencido"]} />
              <Bar dataKey="a_vencer" name="a_vencer" stackId="a" fill={COR.aVencer} radius={[0, 0, 0, 0]} />
              <Bar dataKey="vencido" name="vencido" stackId="a" fill={COR.vencido} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <Legenda cor={COR.aVencer} texto="A vencer" />
          <Legenda cor={COR.vencido} texto="Vencido" />
        </div>
      </Card>
      {cb.maiores_atrasos.length > 0 && (
        <Card titulo="Maiores atrasos por cliente"><Barras itens={cb.maiores_atrasos} cor={COR.vencido} /></Card>
      )}
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} /> {texto}
    </span>
  );
}
