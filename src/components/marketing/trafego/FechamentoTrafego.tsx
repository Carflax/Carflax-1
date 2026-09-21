import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, ArrowsClockwise, FilePdf } from "@phosphor-icons/react";
import { apiTrafegoFechamento, type TrafegoFechamento } from "@/lib/api";

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v: number) => (v < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(v)).toLocaleString("pt-BR");
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const x1 = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ",") + "×");
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const nomeMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1); // "Agosto de 2026", não "Agosto De 2026"
};
const CANAL: Record<string, string> = { google: "Google Ads", meta: "Meta Ads", outro: "Anúncio (sem canal)", sem_origem: "Sem origem (número do tráfego)" };

function lerPremissa(chave: string, padrao: number) {
  try {
    const v = Number(localStorage.getItem(chave));
    return Number.isFinite(v) && v > 0 ? v : padrao;
  } catch {
    return padrao;
  }
}

/** Variação contra o mês anterior, já com a cor certa (custo subir é ruim). */
function Delta({ agora, antes, fmt, menorMelhor = false }: { agora: number | null; antes: number | null | undefined; fmt: (v: number) => string; menorMelhor?: boolean }) {
  if (agora == null || antes == null) return null;
  const d = agora - antes;
  if (Math.abs(d) < 0.005 * Math.max(1, Math.abs(antes))) return <span className="gt-hint"> · igual ao mês anterior</span>;
  const bom = menorMelhor ? d < 0 : d > 0;
  return <span style={{ color: bom ? "var(--good)" : "var(--bad)" }}> · {d > 0 ? "+" : "−"}{fmt(Math.abs(d))} vs mês anterior</span>;
}

export function FechamentoTrafego() {
  // Por padrão abre o mês passado: é o que se leva fechado para a diretoria.
  const [mes, setMes] = useState(() => somarMes(hojeSP().slice(0, 7), -1));
  const [impostos, setImpostos] = useState(() => lerPremissa("gt-impostos", 7.2));
  const [taxas, setTaxas] = useState(() => lerPremissa("gt-taxas", 3));
  const [dados, setDados] = useState<TrafegoFechamento | null>(null);
  const [anterior, setAnterior] = useState<TrafegoFechamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  // Novos = o que o tráfego comprovadamente trouxe. "Todos" inclui cliente antigo
  // que chamou no número, cuja compra do mês inteira não dá para creditar ao anúncio.
  const [base, setBase] = useState<"novos" | "todos">("novos");
  const relatorio = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (atualizar = false) => {
    setCarregando(true);
    setErro(null);
    try {
      const [atual, ant] = await Promise.all([
        apiTrafegoFechamento(mes, impostos, taxas, atualizar),
        apiTrafegoFechamento(somarMes(mes, -1), impostos, taxas).catch(() => null),
      ]);
      setDados(atual);
      setAnterior(ant);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, impostos, taxas]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    try {
      localStorage.setItem("gt-impostos", String(impostos));
      localStorage.setItem("gt-taxas", String(taxas));
    } catch { /* navegador sem armazenamento: só não lembra */ }
  }, [impostos, taxas]);

  async function baixarPdf() {
    if (!relatorio.current || !dados) return;
    setGerandoPdf(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const fundo = getComputedStyle(relatorio.current).backgroundColor || "#ffffff";
      const canvas = await html2canvas(relatorio.current, { scale: 2, backgroundColor: fundo, useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const largura = 190;
      const alturaPagina = 277;
      const alturaTotal = (canvas.height * largura) / canvas.width;
      const img = canvas.toDataURL("image/jpeg", 0.92);
      // A imagem é uma só: em cada página ela é deslocada para cima.
      // O navegador devolve "rgb(r, g, b)"; o jsPDF quer os três números.
      const [cr, cg, cb] = (fundo.match(/\d+/g) || ["255", "255", "255"]).map(Number);
      for (let y = 0, pagina = 0; y < alturaTotal; y += alturaPagina, pagina++) {
        if (pagina > 0) pdf.addPage();
        pdf.setFillColor(cr, cg, cb);
        pdf.rect(0, 0, 210, 297, "F");
        pdf.addImage(img, "JPEG", 10, 10 - y, largura, alturaTotal);
      }
      pdf.save(`fechamento-trafego-${dados.mes}.pdf`);
    } catch (e) {
      setErro(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally {
      setGerandoPdf(false);
    }
  }

  const mesAtual = hojeSP().slice(0, 7);
  const soNovos = base === "novos";
  const r = dados ? (soNovos ? dados.resultado : dados.resultadoTodos) : undefined;
  const inv = dados?.investimento;
  const ant = anterior ? (soNovos ? anterior.resultado : anterior.resultadoTodos) : undefined;
  const listaClientes = dados ? dados.clientes.filter((c) => !soNovos || c.novo).sort((a, b) => b.venda - a.venda).slice(0, 15) : [];

  return (
    <div className="gt-wrap">
      <div className="gt-tabs">
        <div className="gt-actions">
          <button type="button" className="gt-btn ghost small" aria-label="Mês anterior" onClick={() => setMes((m) => somarMes(m, -1))}><CaretLeft size={14} weight="bold" /></button>
          <strong className="gt-mes">{nomeMes(mes)}</strong>
          <button type="button" className="gt-btn ghost small" aria-label="Próximo mês" disabled={mes >= mesAtual} onClick={() => setMes((m) => somarMes(m, 1))}><CaretRight size={14} weight="bold" /></button>
        </div>
        <div className="gt-actions">
          <div className="gt-seg" role="group" aria-label="Clientes considerados">
            <button type="button" aria-pressed={soNovos} onClick={() => setBase("novos")}>Clientes novos</button>
            <button type="button" aria-pressed={!soNovos} onClick={() => setBase("todos")}>Todos os clientes</button>
          </div>
          <label className="gt-premissa" htmlFor="gt-imp">Impostos %<input id="gt-imp" className="gt-input" inputMode="decimal" value={impostos} onChange={(e) => setImpostos(Number(e.target.value.replace(",", ".")) || 0)} /></label>
          <label className="gt-premissa" htmlFor="gt-tx">Cartão + comissão %<input id="gt-tx" className="gt-input" inputMode="decimal" value={taxas} onChange={(e) => setTaxas(Number(e.target.value.replace(",", ".")) || 0)} /></label>
          <button type="button" className="gt-btn ghost" onClick={() => carregar(true)} disabled={carregando}><ArrowsClockwise size={15} weight="bold" /> Recalcular</button>
          <button type="button" className="gt-btn" onClick={baixarPdf} disabled={!dados || carregando || gerandoPdf}><FilePdf size={15} weight="bold" /> {gerandoPdf ? "Gerando…" : "Baixar PDF"}</button>
        </div>
      </div>

      {erro && <div className="gt-banner bad"><span><b>Não foi possível.</b> {erro}</span></div>}
      {carregando && !dados && <div className="gt-panel"><div className="gt-skel" /><p className="gt-hint" style={{ margin: "10px 0 0" }}>Somando gasto das plataformas e vendas do ERP… leva alguns segundos.</p></div>}

      {dados && r && inv && (
        <div className="gt-report" ref={relatorio}>
          <header className="gt-report-head">
            <div>
              <div className="gt-tags"><span className="gt-tag">Fechamento do tráfego pago</span>{dados.periodo.parcial && <span className="gt-pill warn">Parcial até {dataBR(dados.periodo.fim)}</span>}</div>
              <h2>{nomeMes(dados.mes)}</h2>
            </div>
            <div className={`gt-resultado ${r.resultado >= 0 ? "pos" : "neg"}`}>
              <span className="l">Resultado depois de todos os custos</span>
              <b>{brl0(r.resultado)}</b>
              <Delta agora={r.resultado} antes={ant?.resultado} fmt={brl0} />
            </div>
          </header>

          <p className="gt-resumo">
            Investimos <b>{brl0(inv.total)}</b> ({brl0(inv.midia)} em anúncios{inv.fixos ? ` + ${brl0(inv.fixos)} de ${inv.fixosItens.map((i) => i.descricao.toLowerCase()).join(", ")}` : ""}).
            {soNovos
              ? <>{" "}O tráfego trouxe <b>{int(r.clientes)} clientes novos</b>, que compraram <b>{brl0(r.faturamento)}</b> no ERP ({int(r.pedidos)} pedidos).</>
              : <>{" "}Os <b>{int(r.clientes)} clientes</b> que chamaram no WhatsApp do tráfego compraram <b>{brl0(r.faturamento)}</b> no ERP — {dados.funil.novos} novos e {dados.funil.recorrentes} que já compravam.</>}
            {" "}Depois de mercadoria, impostos e taxas, sobraram <b>{brl0(r.contribuicao)}</b> de margem, que {r.resultado >= 0 ? <b>pagaram o investimento e deixaram {brl0(r.resultado)}</b> : <b>cobriram {pct(r.contribuicao / Math.max(1, inv.total))} do investimento</b>}.
          </p>

          <div className="gt-grid4">
            <div className="gt-kpi"><div className="l">Investimento total</div><div className="v">{brl0(inv.total)}</div><div className="d">mídia + {inv.fixos ? "agência" : "custos fixos"}<Delta agora={inv.total} antes={anterior?.investimento.total} fmt={brl0} menorMelhor /></div></div>
            <div className="gt-kpi"><div className="l">{soNovos ? "Faturamento de clientes novos" : "Faturamento de todos os clientes"}</div><div className="v">{brl0(r.faturamento)}</div><div className="d">{int(r.clientes)} clientes · ticket {r.ticketMedio ? brl0(r.ticketMedio) : "—"}<Delta agora={r.faturamento} antes={ant?.faturamento} fmt={brl0} /></div></div>
            <div className="gt-kpi"><div className="l">ROAS</div><div className="v" style={{ color: r.resultado >= 0 ? "var(--good)" : "var(--bad)" }}>{x1(r.roas)}</div><div className="d">só mídia: {x1(r.roasMidia)} · empate em {r.faturamentoParaEmpatar ? brl0(r.faturamentoParaEmpatar) : "—"}</div></div>
            {/* Custo por cliente divide TODO o investimento só pelos clientes que o
                vínculo lead→ERP achou — é um teto, não o custo real. Por isso vem
                rotulado assim e acompanhado de custo por contato e por lead, que
                não dependem desse vínculo. */}
            <div className="gt-kpi">
              <div className="l">Custo por contato</div>
              <div className="v">{dados.funil.contatosPlataforma ? brl0(inv.total / dados.funil.contatosPlataforma) : "—"}</div>
              <div className="d">
                por lead no HUB: {dados.funil.leadsHub ? brl0(inv.total / dados.funil.leadsHub) : "—"}
                {" · "}por cliente {soNovos ? "novo" : ""} identificado: {r.custoPorCliente ? brl0(r.custoPorCliente) : "—"} <span className="gt-hint">(teto)</span>
                {" · "}markup real: {r.markup == null ? "—" : `${r.markup.toFixed(1).replace(".", ",")}%`}
              </div>
            </div>
          </div>

          <div className="gt-report-grid">
            <section className="gt-panel">
              <h4>Do faturamento ao resultado</h4>
              <Cascata linhas={[
                ["Faturamento (ERP)", r.faturamento, "var(--google)", false],
                ["Mercadoria (custo real)", -r.custoMercadoria, "var(--ink-3)", false],
                [`Impostos (${dados.premissas.impostosPct.toString().replace(".", ",")}%)`, -r.impostos, "var(--warn)", false],
                [`Cartão e comissão (${dados.premissas.taxasPct.toString().replace(".", ",")}%)`, -r.taxas, "var(--warn)", false],
                ["Margem de contribuição", r.contribuicao, "var(--destaque)", true],
                ["Mídia Google", -inv.google, "var(--google)", false],
                ["Mídia Meta", -inv.meta, "var(--meta)", false],
                ...inv.fixosItens.map((i) => [i.descricao, -i.valor, "var(--ink-3)", false] as [string, number, string, boolean]),
                ["Resultado", r.resultado, r.resultado >= 0 ? "var(--good)" : "var(--bad)", true],
              ]} />
            </section>

            <section className="gt-panel">
              <h4>Do contato à venda</h4>
              <Funil etapas={[
                ["Contatos nas plataformas", dados.funil.contatosPlataforma, "conversões Google + conversas Meta"],
                ["Leads no WhatsApp do tráfego", dados.funil.leadsHub, "número exclusivo dos anúncios · descartados fora"],
                ["Com cadastro no ERP", dados.funil.identificadosErp, `dos ${int(dados.funil.leadsJanela)} leads dos últimos ${dados.premissas.janelaDias} dias`],
                ["Compraram no mês", dados.funil.clientes, `${dados.funil.novos} novos · ${dados.funil.recorrentes} já eram clientes · ${dados.funil.pedidos} pedidos`],
              ]} />
              <p className="gt-nota">
                <b>Leitura honesta:</b> o faturamento é um <b>piso</b>. Só entra o lead cujo cadastro foi achado no ERP
                ({pct(dados.cobertura.erpSobreLeads)} dos leads), pelo orçamento enviado na conversa ou pelo telefone. Quem comprou em outro
                cadastro (ex.: no CNPJ da empresa) ou sem cadastro não aparece.
                {soNovos ? " Clientes que já compravam ficam fora desta base: use \"Todos os clientes\" para vê-los." : ""}
              </p>
            </section>
          </div>

          <section>
            <h4 className="gt-h4">Por canal</h4>
            <div className="gt-tbl-wrap">
              <table className="gt-tbl-report">
                <thead><tr><th>Canal</th><th className="num">Investimento</th><th className="num">Contatos</th><th className="num">Leads no HUB</th><th className="num">Clientes</th><th className="num">Novos</th><th className="num">Faturamento {soNovos ? "(novos)" : "(todos)"}</th><th className="num">ROAS mídia</th></tr></thead>
                <tbody>
                  {dados.porCanal.map((c) => (
                    <tr key={c.canal}>
                      <td><span className="gt-dot" style={{ background: c.canal === "google" ? "var(--google)" : c.canal === "meta" ? "var(--meta)" : "var(--ink-3)" }} />{CANAL[c.canal]}</td>
                      <td className="num">{brl0(c.investimento)}</td>
                      <td className="num">{c.contatosPlataforma == null ? "—" : int(c.contatosPlataforma)}</td>
                      <td className="num">{int(c.leadsHub)}</td>
                      <td className="num">{int(c.clientes)}</td>
                      <td className="num">{int(c.novos)}</td>
                      <td className="num">{brl0(soNovos ? c.faturamentoNovos : c.faturamento)}</td>
                      <td className="num">{c.investimento > 0 ? x1(soNovos ? c.roas : c.roasTodos) : "—"}</td>
                    </tr>
                  ))}
                  {inv.fixos > 0 && (
                    <tr><td>Custos fixos ({inv.fixosItens.map((i) => i.descricao).join(", ")})</td><td className="num">{brl0(inv.fixos)}</td><td colSpan={6} className="gt-hint">rateado sobre o resultado total</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h4 className="gt-h4">Por campanha</h4>
            <div className="gt-tbl-wrap">
              <table className="gt-tbl-report">
                <thead><tr><th>Campanha</th><th className="num">Gasto</th><th className="num">Contatos</th><th className="num">Leads no HUB</th><th className="num">Clientes</th><th className="num">Faturamento</th><th className="num">ROAS</th></tr></thead>
                <tbody>
                  {dados.porCampanha.map((c) => {
                    const cli = soNovos ? c.clientes : c.clientesTodos;
                    const fat = soNovos ? c.faturamento : c.faturamentoTodos;
                    const roas = soNovos ? c.roas : c.roasTodos;
                    return (
                      <tr key={c.nome}>
                        <td className="gt-name">{c.nome}</td>
                        <td className="num">{brl0(c.gasto)}</td>
                        <td className="num">{c.contatos ? c.contatos.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
                        <td className="num">{c.leadsHub == null ? "—" : int(c.leadsHub)}</td>
                        <td className="num">{cli == null ? "—" : int(cli)}</td>
                        <td className="num">{fat == null ? "—" : brl0(fat)}</td>
                        <td className="num" style={{ color: roas == null ? undefined : roas >= 4 ? "var(--good)" : roas >= 2 ? "var(--warn)" : "var(--bad)" }}>{x1(roas)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="gt-hint">Leads e vendas por campanha só aparecem quando o lead guarda o nome da campanha (hoje, parte do Google). Os demais entram em "Sem origem" na tabela por canal.</p>
          </section>

          {listaClientes.length > 0 && (
            <section>
              <h4 className="gt-h4">{soNovos ? "Maiores clientes novos trazidos pelo tráfego" : "Maiores clientes que chamaram no WhatsApp do tráfego"}</h4>
              <div className="gt-tbl-wrap">
                <table className="gt-tbl-report">
                  <thead><tr><th>Cliente</th><th>Canal</th><th>1º contato</th><th>Situação</th><th className="num">Pedidos</th><th className="num">Faturamento</th><th className="num">Markup</th></tr></thead>
                  <tbody>
                    {listaClientes.map((c) => (
                      <tr key={c.cod}>
                        <td className="gt-name">{c.cliente}{c.campanha ? <small>{c.campanha}</small> : null}</td>
                        <td>{CANAL[c.canal] || c.canal}</td>
                        <td>{dataBR(c.primeiroContato)}</td>
                        <td><span className={`gt-pill ${c.novo ? "good" : "info"}`}>{c.novo ? "Cliente novo" : "Já comprava"}</span></td>
                        <td className="num">{c.pedidos}</td>
                        <td className="num">{brl(c.venda)}</td>
                        <td className="num">{c.custo > 0 ? `${((c.venda / c.custo - 1) * 100).toFixed(0)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="gt-metodo">
            <b>Como é calculado.</b> Investimento: gasto do Google Ads e do Meta Ads no mês, pelas APIs, mais custos fixos cadastrados no HUB
            {dados.periodo.parcial ? " (proporcionais aos dias do mês até hoje)" : ""}. Retorno: vendas faturadas no ERP (notas IF/NF) no mês, de clientes que
            chamaram no WhatsApp exclusivo do tráfego nos {dados.premissas.janelaDias} dias anteriores; só contam pedidos emitidos depois do primeiro contato.
            {soNovos ? " Base: clientes novos (sem compra nos 24 meses anteriores ao contato)." : " Base: todos os clientes, inclusive quem já comprava."} Custo da
            mercadoria real de cada venda (ERP, já com a ST, que é paga na compra); impostos sobre a venda pela alíquota efetiva do
            fechamento fiscal; cartão e comissão estimados.
            Aluguel, salários e demais custos fixos da loja não entram, porque existem com ou sem anúncio.
            {dados.cacheEm ? ` Calculado às ${new Date(dados.cacheEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : ""}
          </footer>

          {(dados.erros.google || dados.erros.meta || dados.erros.erp || dados.erros.leads) && (
            <div className="gt-banner bad"><span><b>Dados incompletos:</b> {[dados.erros.google && `Google: ${dados.erros.google}`, dados.erros.meta && `Meta: ${dados.erros.meta}`, dados.erros.erp && `ERP: ${dados.erros.erp}`, dados.erros.leads && `Leads: ${dados.erros.leads}`].filter(Boolean).join(" · ")}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

function Cascata({ linhas }: { linhas: [string, number, string, boolean][] }) {
  const max = Math.max(1, ...linhas.map(([, v]) => Math.abs(v)));
  // Cada barra começa onde a anterior terminou (as deduções descem a partir do
  // faturamento); as linhas de total recomeçam do zero.
  const segmentos: [number, number][] = [];
  let corrente = 0;
  linhas.forEach(([, valor, , total], i) => {
    if (total || i === 0) {
      segmentos.push([Math.min(0, valor), Math.max(0, valor)]);
      corrente = valor;
    } else {
      segmentos.push([corrente + valor, corrente]);
      corrente += valor;
    }
  });
  return (
    <div className="gt-wf">
      {linhas.map(([rotulo, valor, cor, total], i) => {
        const [a, b] = segmentos[i];
        const esq = (Math.max(0, Math.min(a, b)) / max) * 100;
        const larg = (Math.abs(b - a) / max) * 100;
        return (
          <div key={rotulo + i} className={`gt-wf-row${total ? " tot" : ""}`}>
            <span className="lab">{rotulo}</span>
            <span className="trk"><i style={{ left: `${esq}%`, width: `${Math.max(larg, valor ? 0.8 : 0)}%`, background: cor }} /></span>
            <span className="amt">{brl0(valor)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Funil({ etapas }: { etapas: [string, number, string][] }) {
  const max = Math.max(1, ...etapas.map(([, v]) => v));
  return (
    <div className="gt-funil">
      {etapas.map(([rotulo, valor, dica]) => (
        <div key={rotulo} className="gt-funil-row">
          <div className="top"><span>{rotulo}</span><b>{int(valor)}</b></div>
          <span className="trk"><i style={{ width: `${(valor / max) * 100}%` }} /></span>
          <small>{dica}</small>
        </div>
      ))}
    </div>
  );
}
