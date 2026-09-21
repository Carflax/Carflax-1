import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from "react";
import { Plus, ArrowsClockwise, ArrowSquareOut, CalendarBlank } from "@phosphor-icons/react";
import {
  apiTrafegoCampanhas,
  apiTrafegoHistorico,
  apiTrafegoStatus,
  apiTrafegoOrcamento,
  apiTrafegoCriarGoogle,
  apiTrafegoCriarMeta,
  type TrafegoCampanha,
  type TrafegoListaResponse,
  type TrafegoAlteracao,
  type TrafegoPlataforma,
} from "@/lib/api";
import { FechamentoTrafego } from "./FechamentoTrafego";
import { GastoDiario, ProgramacaoModal } from "./Programacao";
import { ImpactoAjusteModal } from "./ImpactoAjuste";
import { RecomendacoesTrafego } from "./RecomendacoesTrafego";
import { resumoProgramacao, diasAtivos, DIAS } from "./programacao-util";
import "./gestao-trafego.css";

// ── Formatação ──────────────────────────────────────────────────────────────
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const DIAS_MES = 30.4;

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
function periodoDe(p: Periodo) {
  const fim = hojeSP();
  if (p === "mes") return { inicio: `${fim.slice(0, 7)}-01`, fim };
  const d = new Date(`${fim}T12:00:00`);
  d.setDate(d.getDate() - (Number(p) - 1));
  return { inicio: d.toISOString().slice(0, 10), fim };
}

type Periodo = "7" | "30" | "mes";

const TIPOS: Record<string, string> = {
  SEARCH: "Pesquisa",
  PERFORMANCE_MAX: "Performance Max",
  DISPLAY: "Display",
  VIDEO: "Vídeo",
  SMART: "Inteligente",
  LOCAL: "Local",
  DEMAND_GEN: "Demand Gen",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_LEADS: "Cadastros",
  OUTCOME_SALES: "Vendas",
  MESSAGES: "Mensagens",
  REACH: "Alcance",
  LINK_CLICKS: "Cliques",
  POST_ENGAGEMENT: "Engajamento",
};
const LANCES: Record<string, string> = {
  MAXIMIZE_CONVERSIONS: "Max. conversões",
  TARGET_CPA: "CPA desejado",
  TARGET_SPEND: "Max. cliques",
  TARGET_IMPRESSION_SHARE: "Parcela de impr.",
  MAXIMIZE_CONVERSION_VALUE: "Max. valor",
  TARGET_ROAS: "ROAS desejado",
  MANUAL_CPC: "CPC manual",
  CONVERSATIONS: "Conversas",
  REACH: "Alcance",
  LINK_CLICKS: "Cliques",
  THRUPLAY: "ThruPlay",
  IMPRESSIONS: "Impressões",
};
const ACOES: Record<string, string> = {
  ativar: "Ativou",
  pausar: "Pausou",
  orcamento: "Orçamento",
  "lance-conversoes": "Lance → conversões",
  presenca: "Local → presença",
  programacao: "Dias e horários",
  criar: "Criou",
};

interface Confirmacao {
  titulo: string;
  texto: string;
  linhas: [string, string][];
  botao: string;
  perigo?: boolean;
  executar: () => Promise<unknown>;
}

// Exemplo do curso (módulo 04): a campanha já vem preenchida para revisar.
const MODELO_GOOGLE = {
  nome: `[PESQ] Elétrica — Fios e Cabos | ${hojeSP().slice(5, 7)}-${hojeSP().slice(2, 4)}`,
  orcamentoDiario: "15",
  cidades: "Jundiaí",
  grupo: "Fios e cabos",
  palavras: ['"cabo flex 2,5mm"', '"fio 2,5mm preço"', '"cabo flexível 100 metros"', '"fio elétrico jundiaí"', '"onde comprar fio elétrico"', '"cabo pp"', '"cabo 6mm"', '"fio 4mm"', "[cabo flex 2,5mm 100m]", "[fio 10mm]"].join("\n"),
  negativas: ["emprego", "vaga", "curso", "grátis", "como fazer", "pdf", "usado", "campinas", "são paulo", "sorocaba"].join("\n"),
  urlFinal: "https://www.carflax.com.br/",
  caminho1: "fios-e-cabos",
  caminho2: "jundiai",
  titulos: ["Cabo Flex 2,5mm em Jundiaí", "Fios e Cabos Pronta Entrega", "Carflax Hidráulica e Elétrica", "Rolo 100m Cabo Flex 2,5mm", "Peça Pelo WhatsApp", "Cabos PP, Flex e Rígidos", "Fio 4mm, 6mm e 10mm", "Loja de Elétrica em Jundiaí", "Cabos Certificados Inmetro", "Fale com um Especialista", "Orçamento Rápido no WhatsApp", "Atendimento Técnico na Loja"].join("\n"),
  descricoes: ["Cabo flex 2,5mm, 4mm, 6mm e mais. Pronta entrega em Jundiaí. Peça seu orçamento agora.", "Loja especializada em hidráulica e elétrica. Atendimento técnico para obra e reforma.", "Chame no WhatsApp, mande sua lista de materiais e receba o orçamento rapidinho."].join("\n"),
  sufixoUrl: "utm_source=google&utm_medium=cpc&utm_campaign=eletrica-fios",
};

const MODELO_META = {
  modelo: "whatsapp" as "whatsapp" | "marca",
  nome: `[WPP] Ofertas — Jundiaí | ${hojeSP().slice(5, 7)}-${hojeSP().slice(2, 4)}`,
  orcamentoDiario: "23",
  cidade: "Jundiaí",
  raioKm: "15",
  idadeMin: "25",
};

// ── Tela ────────────────────────────────────────────────────────────────────
export function GestaoTrafegoView() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [dados, setDados] = useState<TrafegoListaResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [aba, setAba] = useState<TrafegoPlataforma>("google");
  const [mostrarPausadas, setMostrarPausadas] = useState(false);
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [executando, setExecutando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "good" | "bad"; texto: string; link?: string } | null>(null);
  const [criar, setCriar] = useState<null | "google" | "meta">(null);
  const [historico, setHistorico] = useState<TrafegoAlteracao[]>([]);
  const [avisoHistorico, setAvisoHistorico] = useState<string | null>(null);
  const [visao, setVisao] = useState<"campanhas" | "recomendacoes" | "fechamento">("campanhas");
  const [programar, setProgramar] = useState<null | { inicial?: TrafegoCampanha }>(null);
  const [ajusteImpacto, setAjusteImpacto] = useState<null | { c: TrafegoCampanha; ajuste: "lance-conversoes" | "presenca" }>(null);
  const [recarregarDiario, setRecarregarDiario] = useState(0);
  const intervalo = useMemo(() => periodoDe(periodo), [periodo]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroGeral(null);
    setRecarregarDiario((n) => n + 1);
    try {
      const { inicio, fim } = periodoDe(periodo);
      const [lista, hist] = await Promise.all([
        apiTrafegoCampanhas(inicio, fim),
        apiTrafegoHistorico().catch(() => null),
      ]);
      setDados(lista);
      setEdicoes({});
      if (hist) {
        setHistorico(hist.itens);
        setAvisoHistorico(hist.aviso || null);
      }
    } catch (e) {
      setErroGeral((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const campanhas = useMemo(() => dados?.campanhas ?? [], [dados]);
  const daAba = useMemo(
    () =>
      campanhas
        .filter((c) => c.plataforma === aba)
        .filter((c) => mostrarPausadas || c.status === "ENABLED" || c.gasto > 0)
        .sort((a, b) => (a.status === b.status ? b.gasto - a.gasto : a.status === "ENABLED" ? -1 : 1)),
    [campanhas, aba, mostrarPausadas],
  );
  const ocultas = campanhas.filter((c) => c.plataforma === aba).length - daAba.length;

  const tot = useMemo(() => {
    const gasto = campanhas.reduce((s, c) => s + c.gasto, 0);
    const contatos = campanhas.reduce((s, c) => s + c.contatos, 0);
    const ativasG = campanhas.filter((c) => c.plataforma === "google" && c.status === "ENABLED").length;
    const ativasM = campanhas.filter((c) => c.plataforma === "meta" && c.status === "ENABLED").length;
    const gastoG = campanhas.filter((c) => c.plataforma === "google").reduce((s, c) => s + c.gasto, 0);
    const contatosG = campanhas.filter((c) => c.plataforma === "google").reduce((s, c) => s + c.contatos, 0);
    return { gasto, contatos, cpl: contatos ? gasto / contatos : 0, ativasG, ativasM, gastoG, contatosG };
  }, [campanhas]);

  const teto = dados?.teto;

  /** Impacto no comprometido mensal, calculado na tela para mostrar antes de confirmar. */
  function impacto(deltaDiario: number): [string, string][] {
    if (!teto) return [];
    const depois = (teto.diarioTotal + deltaDiario) * DIAS_MES;
    const passa = deltaDiario > 0 && depois > teto.limite;
    return [
      ["Comprometido/mês", `${brl0(teto.comprometidoMensal)} → ${brl0(depois)}`],
      ["Teto", `${brl0(teto.limite)}${passa ? " — vai passar, o servidor vai recusar" : ""}`],
    ];
  }

  async function executar() {
    if (!confirmar) return;
    setExecutando(true);
    try {
      await confirmar.executar();
      setAviso({ tipo: "good", texto: `${confirmar.titulo}: feito.` });
      setConfirmar(null);
      await carregar();
    } catch (e) {
      setAviso({ tipo: "bad", texto: (e as Error).message });
      setConfirmar(null);
    } finally {
      setExecutando(false);
    }
  }

  function pedirStatus(c: TrafegoCampanha) {
    const ativar = c.status !== "ENABLED";
    setConfirmar({
      titulo: ativar ? "Ativar campanha" : "Pausar campanha",
      texto: c.nome,
      linhas: [
        ["Plataforma", c.plataforma === "google" ? "Google Ads" : "Meta Ads"],
        ["Orçamento", `${brl(c.orcamentoDiario || 0)}/dia`],
        ...impacto(ativar ? c.orcamentoDiario || 0 : -(c.orcamentoDiario || 0)),
      ],
      botao: ativar ? "Ativar" : "Pausar",
      perigo: !ativar,
      executar: () => apiTrafegoStatus(c.plataforma, c.id, ativar),
    });
  }

  function pedirOrcamento(c: TrafegoCampanha) {
    const novo = Number(String(edicoes[c.id] ?? "").replace(",", "."));
    if (!(novo > 0)) return;
    const delta = c.status === "ENABLED" ? novo - (c.orcamentoDiario || 0) : 0;
    setConfirmar({
      titulo: "Alterar orçamento",
      texto: c.nome,
      linhas: [
        ["Por dia", `${brl(c.orcamentoDiario || 0)} → ${brl(novo)}`],
        ["Por mês (× 30,4)", `${brl0((c.orcamentoDiario || 0) * DIAS_MES)} → ${brl0(novo * DIAS_MES)}`],
        ...impacto(delta),
        ...(Math.abs(novo - (c.orcamentoDiario || 0)) / Math.max(1, c.orcamentoDiario || 0) > 0.2
          ? ([["Atenção", "Mudança acima de 20% — o algoritmo reaprende por alguns dias"]] as [string, string][])
          : []),
      ],
      botao: "Salvar orçamento",
      executar: () => apiTrafegoOrcamento(c.plataforma, c.id, novo),
    });
  }

  // A correção abre com a expectativa calculada para ESTA campanha: a mesma
  // mudança ganha contato numa e corta em outra (ver ImpactoAjusteModal).
  function pedirAjuste(c: TrafegoCampanha, ajuste: "lance-conversoes" | "presenca") {
    setAjusteImpacto({ c, ajuste });
  }

  const custoMedio = aba === "google" && tot.contatosG ? tot.gastoG / tot.contatosG : tot.cpl;

  return (
    <div className="gt">
      <div className="gt-wrap">
        <header className="gt-head">
          <div>
            <div className="gt-tags"><span className="gt-tag">Marketing</span><span className="gt-tag ok">Google Ads + Meta Ads</span></div>
            <h1>Gestão de <em>Tráfego</em></h1>
            <p className="gt-sub">Ative, pause, ajuste orçamento e crie campanhas direto nas plataformas. No fechamento, o investimento do mês contra o que os clientes vindos de anúncio compraram no ERP.</p>
          </div>
          {visao === "campanhas" && <div className="gt-actions">
            <div className="gt-seg" role="group" aria-label="Período">
              {(["7", "30", "mes"] as Periodo[]).map((p) => (
                <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}>
                  {p === "mes" ? "Este mês" : `${p} dias`}
                </button>
              ))}
            </div>
            <button type="button" className="gt-btn ghost" onClick={carregar} disabled={carregando}>
              <ArrowsClockwise size={15} weight="bold" /> Atualizar
            </button>
            <button type="button" className="gt-btn" onClick={() => setCriar(aba)}>
              <Plus size={15} weight="bold" /> Nova campanha
            </button>
          </div>}
        </header>

        <div className="gt-views" role="group" aria-label="Visão">
          <button type="button" aria-pressed={visao === "campanhas"} onClick={() => setVisao("campanhas")}>Campanhas</button>
          <button type="button" aria-pressed={visao === "recomendacoes"} onClick={() => setVisao("recomendacoes")}>Recomendações da IA</button>
          <button type="button" aria-pressed={visao === "fechamento"} onClick={() => setVisao("fechamento")}>Fechamento e relatório</button>
        </div>

        {visao === "fechamento" ? <FechamentoTrafego /> : visao === "recomendacoes" ? <RecomendacoesTrafego onMudancaNaConta={carregar} /> : <>

        {erroGeral && <div className="gt-banner bad"><b>Não carregou.</b> {erroGeral}</div>}
        {aviso && (
          <div className={`gt-banner ${aviso.tipo}`} role="status">
            <span><b>{aviso.tipo === "good" ? "Pronto." : "Não foi possível."}</b> {aviso.texto}
              {aviso.link && <> <a href={aviso.link} target="_blank" rel="noreferrer">Abrir no Gerenciador de Anúncios <ArrowSquareOut size={12} /></a></>}
            </span>
            <button type="button" className="x" aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button>
          </div>
        )}
        {dados?.erros.google && <div className="gt-banner bad"><b>Google Ads:</b> {dados.erros.google}</div>}
        {dados?.erros.meta && <div className="gt-banner bad"><b>Meta Ads:</b> {dados.erros.meta}</div>}

        {/* Teto mensal */}
        {teto && <TetoPainel teto={teto} />}

        {/* KPIs do período */}
        <div className="gt-grid4">
          <div className="gt-kpi"><div className="l">Investido no período</div><div className="v">{carregando && !dados ? "…" : brl0(tot.gasto)}</div><div className="d">{dados ? `${dados.periodo.inicio.split("-").reverse().join("/")} a ${dados.periodo.fim.split("-").reverse().join("/")}` : ""}</div></div>
          <div className="gt-kpi"><div className="l">Contatos</div><div className="v">{int(tot.contatos)}</div><div className="d">conversões Google + conversas Meta</div></div>
          <div className="gt-kpi"><div className="l">Custo por contato</div><div className="v">{tot.contatos ? brl(tot.cpl) : "—"}</div><div className="d">média das duas plataformas</div></div>
          <div className="gt-kpi"><div className="l">Campanhas ativas</div><div className="v">{tot.ativasG + tot.ativasM}</div><div className="d"><span className="gt-dot" style={{ background: "var(--google)" }} />Google {tot.ativasG} · <span className="gt-dot" style={{ background: "var(--meta)" }} />Meta {tot.ativasM}</div></div>
        </div>

        <GastoDiario inicio={intervalo.inicio} fim={intervalo.fim} recarregar={recarregarDiario} />

        {/* Abas */}
        <div className="gt-tabs">
          <div className="gt-tab-row" role="tablist">
            {(["google", "meta"] as TrafegoPlataforma[]).map((p) => (
              <button key={p} type="button" role="tab" className="gt-tab" aria-selected={aba === p} onClick={() => setAba(p)}>
                <span className="gt-dot" style={{ background: p === "google" ? "var(--google)" : "var(--meta)" }} />
                {p === "google" ? "Google Ads" : "Meta Ads"}
                <small>{campanhas.filter((c) => c.plataforma === p && c.status === "ENABLED").length} ativas</small>
              </button>
            ))}
          </div>
          <div className="gt-actions">
            {aba === "google" && (
              <button type="button" className="gt-btn ghost small" onClick={() => setProgramar({})}>
                <CalendarBlank size={14} weight="bold" /> Dias e horários
              </button>
            )}
            <label className="gt-check">
              <input type="checkbox" checked={mostrarPausadas} onChange={(e) => setMostrarPausadas(e.target.checked)} />
              Mostrar pausadas sem gasto{ocultas > 0 && !mostrarPausadas ? ` (${ocultas})` : ""}
            </label>
          </div>
        </div>

        <div className="gt-tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 54 }}>Ativa</th>
                <th>Campanha</th>
                <th>{aba === "google" ? "Lance" : "Otimização"}</th>
                <th className="num">Orçamento/dia</th>
                <th className="num">Gasto</th>
                <th className="num">Cliques</th>
                <th className="num">Contatos</th>
                <th className="num">Custo/contato</th>
                {aba === "google" ? <th className="num">Parcela impr.</th> : <th className="num">Frequência</th>}
              </tr>
            </thead>
            <tbody>
              {carregando && !dados && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={9}><div className="gt-skel" /></td></tr>)}
              {dados && daAba.length === 0 && (
                <tr><td colSpan={9} className="gt-empty">Nenhuma campanha ativa ou com gasto no período.</td></tr>
              )}
              {daAba.map((c) => (
                <LinhaCampanha
                  key={c.plataforma + c.id}
                  c={c}
                  valorEdicao={edicoes[c.id]}
                  custoMedio={custoMedio}
                  onEditar={(v) => setEdicoes((s) => ({ ...s, [c.id]: v }))}
                  onSalvar={() => pedirOrcamento(c)}
                  onStatus={() => pedirStatus(c)}
                  onAjuste={(a) => pedirAjuste(c, a)}
                  onProgramar={() => setProgramar({ inicial: c })}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Histórico */}
        <section className="gt-panel">
          <h4>Histórico de alterações</h4>
          {avisoHistorico ? (
            <p className="gt-hint" style={{ margin: 0 }}>{avisoHistorico}</p>
          ) : historico.length === 0 ? (
            <p className="gt-hint" style={{ margin: 0 }}>Nenhuma alteração feita pelo HUB ainda.</p>
          ) : (
            <div className="gt-log">
              {historico.map((h) => (
                <div className="gt-log-row" key={h.id}>
                  <time>{new Date(h.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                  <span><span className={`gt-pill ${h.plataforma === "google" ? "good" : "info"}`}>{h.plataforma === "google" ? "Google" : "Meta"}</span></span>
                  <span><b>{ACOES[h.acao] || h.acao}</b> · {h.campanha_nome || "—"} {descreverMudanca(h)} <span className="gt-hint">· {h.usuario_email || "?"}</span></span>
                </div>
              ))}
            </div>
          )}
        </section>
        </>}
      </div>

      {confirmar && (
        <div className="gt-overlay" role="dialog" aria-modal="true" aria-label={confirmar.titulo} onClick={() => !executando && setConfirmar(null)}>
          <div className="gt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmar.titulo}</h3>
            <p>{confirmar.texto}</p>
            <dl className="gt-diff">
              {confirmar.linhas.map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}
            </dl>
            <p className="gt-hint" style={{ marginTop: 10 }}>A alteração vai direto para a plataforma e fica registrada no histórico com o seu usuário.</p>
            <div className="gt-modal-foot">
              <button type="button" className="gt-btn ghost" onClick={() => setConfirmar(null)} disabled={executando}>Cancelar</button>
              <button type="button" className={`gt-btn${confirmar.perigo ? " danger" : ""}`} onClick={executar} disabled={executando}>
                {executando ? "Aplicando…" : confirmar.botao}
              </button>
            </div>
          </div>
        </div>
      )}

      {programar && (
        <ProgramacaoModal
          campanhas={campanhas.filter((c) => c.plataforma === "google" && (c.status === "ENABLED" || c.gasto > 0))}
          inicial={programar.inicial}
          onFechar={() => setProgramar(null)}
          onSalvo={async (texto) => {
            setProgramar(null);
            setAviso({ tipo: "good", texto });
            await carregar();
          }}
        />
      )}

      {ajusteImpacto && (
        <ImpactoAjusteModal
          campanha={ajusteImpacto.c}
          ajuste={ajusteImpacto.ajuste}
          onFechar={() => setAjusteImpacto(null)}
          onAplicado={async (texto) => {
            setAjusteImpacto(null);
            setAviso({ tipo: "good", texto });
            await carregar();
          }}
        />
      )}

      {criar && (
        <CriarCampanha
          plataforma={criar}
          folgaDiaria={teto ? Math.max(0, teto.limite / DIAS_MES - teto.diarioTotal) : null}
          onFechar={() => setCriar(null)}
          onCriada={async (texto, link) => {
            setCriar(null);
            setAviso({ tipo: "good", texto, link });
            setMostrarPausadas(true);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function descreverMudanca(h: TrafegoAlteracao) {
  const a = h.antes as Record<string, number> | null;
  const d = h.depois as Record<string, number> | null;
  if (h.acao === "orcamento" && a && d) return `(${brl(Number(a.diario) || 0)} → ${brl(Number(d.diario) || 0)}/dia)`;
  if (h.acao === "criar" && d?.orcamentoDiario) return `(${brl(Number(d.orcamentoDiario))}/dia, pausada)`;
  return "";
}

// ── Teto ────────────────────────────────────────────────────────────────────
function TetoPainel({ teto }: { teto: TrafegoListaResponse["teto"] }) {
  const escala = Math.max(teto.limite, teto.projecaoMes, teto.comprometidoMensal) * 1.05;
  const pos = (v: number) => `${Math.min(100, (v / escala) * 100)}%`;
  const acima = teto.projecaoMes > teto.limite;
  return (
    <section className="gt-panel gt-teto" aria-label="Teto mensal">
      <div>
        <div className="gt-teto-title">
          <h4 style={{ margin: 0 }}>Teto mensal</h4>
          <b>{brl0(teto.gastoMes)}</b>
          <span className="gt-hint">gastos de {brl0(teto.limite)} este mês</span>
        </div>
      </div>
      <span className={`gt-pill ${acima ? "bad" : teto.dentro ? "good" : "warn"}`}>
        {acima ? "Ritmo acima do teto" : teto.dentro ? "Dentro do teto" : "Orçamentos acima do teto"}
      </span>
      <div className="gt-bar" role="img" aria-label={`Gasto ${brl0(teto.gastoMes)}, projeção ${brl0(teto.projecaoMes)}, teto ${brl0(teto.limite)}`}>
        <i style={{ width: pos(teto.projecaoMes), background: acima ? "var(--bad-soft)" : "var(--destaque-soft)" }} />
        <i style={{ width: pos(teto.gastoMes), background: acima ? "var(--bad)" : "var(--destaque)" }} />
        <span className="cap" style={{ left: pos(teto.limite) }} />
      </div>
      <div className="gt-teto-nums">
        <span>Google <b>{teto.gastoMesGoogle == null ? "—" : brl0(teto.gastoMesGoogle)}</b></span>
        <span>Meta <b>{teto.gastoMesMeta == null ? "—" : brl0(teto.gastoMesMeta)}</b></span>
        <span>Projeção do mês <b>{brl0(teto.projecaoMes)}</b></span>
        <span>Orçamentos ativos <b>{brl(teto.diarioTotal)}/dia</b> (= {brl0(teto.comprometidoMensal)}/mês)</span>
        <span>Diário máximo até o fim do mês <b>{brl(teto.diarioMaximo)}</b> ({teto.diasRestantes} dias)</span>
      </div>
    </section>
  );
}

// ── Linha da tabela ─────────────────────────────────────────────────────────
function LinhaCampanha({ c, valorEdicao, custoMedio, onEditar, onSalvar, onStatus, onAjuste, onProgramar }: {
  c: TrafegoCampanha;
  valorEdicao: string | undefined;
  custoMedio: number;
  onEditar: (v: string) => void;
  onSalvar: () => void;
  onStatus: () => void;
  onAjuste: (a: "lance-conversoes" | "presenca") => void;
  onProgramar: () => void;
}) {
  const rodaEm = diasAtivos(c.programacao);
  const ativa = c.status === "ENABLED";
  const cpl = c.contatos > 0 ? c.gasto / c.contatos : null;
  const editavel = c.plataforma === "google" ? !!c.orcamentoId && !c.orcamentoCompartilhado : !!c.orcamento?.alvoId;
  const valor = valorEdicao ?? (c.orcamentoDiario ? String(c.orcamentoDiario) : "");
  const mudou = valorEdicao !== undefined && Number(valorEdicao.replace(",", ".")) !== c.orcamentoDiario && Number(valorEdicao.replace(",", ".")) > 0;

  const flags: ReactElement[] = [];
  if (c.plataforma === "google") {
    // "Maximizar cliques" só vira alerta quando está custando caro: com custo por
    // contato na média, trocar o lance não ganha nada e ainda força 1–2 semanas de
    // reaprendizado (caso de Vinhedo em set/2026: R$ 19,99 contra R$ 20,18).
    const lanceCaro = c.lance === "TARGET_SPEND" && c.gasto > 0 && (cpl == null || cpl > custoMedio * 1.15);
    if (lanceCaro) flags.push(<span key="l" className="gt-pill warn">Contato {cpl == null ? "sem conversão" : "acima da média"} com "max. cliques" · <button type="button" onClick={() => onAjuste("lance-conversoes")}>ver impacto</button></span>);
    if (c.localizacao === "PRESENCE_OR_INTEREST") flags.push(<span key="g" className="gt-pill info">Presença ou interesse · <button type="button" onClick={() => onAjuste("presenca")}>ver impacto</button></span>);
    if (ativa && (c.perdidaOrcamento ?? 0) > 0.3) flags.push(<span key="b" className="gt-pill info">Perde {pct(c.perdidaOrcamento)} das buscas por verba</span>);
    if (c.orcamentoCompartilhado) flags.push(<span key="s" className="gt-pill info">Orçamento compartilhado</span>);
  } else {
    if (c.tipo === "OUTCOME_AWARENESS" && c.gasto > 0) flags.push(<span key="a" className="gt-pill info">Marca — não gera contato direto</span>);
    if ((c.frequencia ?? 0) > 3) flags.push(<span key="f" className="gt-pill warn">Frequência alta: troque o criativo</span>);
    if (c.orcamento?.nivel === "varios") flags.push(<span key="v" className="gt-pill info">Orçamento em {c.orcamento.conjuntos} conjuntos</span>);
    if (c.statusEfetivo && !["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED"].includes(c.statusEfetivo)) flags.push(<span key="e" className="gt-pill bad">{c.statusEfetivo.replace(/_/g, " ").toLowerCase()}</span>);
  }

  return (
    <tr className={ativa ? "" : "off"}>
      <td>
        <button type="button" role="switch" aria-checked={ativa} aria-label={`${ativa ? "Pausar" : "Ativar"} ${c.nome}`} className="gt-switch" onClick={onStatus} />
      </td>
      <td>
        <div className="gt-name">
          {c.nome}
          <small>{TIPOS[c.tipo] || c.tipo}{c.plataforma === "meta" && c.conjuntosAtivos != null ? ` · ${c.conjuntosAtivos} conjunto(s) ativo(s)` : ""}</small>
        </div>
        <div className="gt-agenda">
          <span className="gt-semana-dots" aria-hidden="true">
            {DIAS.map((d) => <i key={d.id} className={c.plataforma === "meta" || rodaEm.has(d.id) ? "on" : ""}>{d.letra}</i>)}
          </span>
          {c.plataforma === "google" ? (
            <>
              <span>{resumoProgramacao(c.programacao)}</span>
              <button type="button" className="gt-link" onClick={onProgramar}>editar</button>
            </>
          ) : (
            <span>Todos os dias (a Meta não programa dias com orçamento diário)</span>
          )}
        </div>
        {flags.length > 0 && <div className="gt-flags">{flags}</div>}
      </td>
      <td>{LANCES[c.lance || ""] || c.lance || "—"}{c.cpaDesejado ? <div className="gt-hint">CPA {brl(c.cpaDesejado)}</div> : null}</td>
      <td className="num">
        {editavel ? (
          <div className="gt-budget">
            <span>R$</span>
            <input
              className="gt-input"
              inputMode="decimal"
              aria-label={`Orçamento diário de ${c.nome}`}
              value={valor}
              onChange={(e) => onEditar(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mudou) onSalvar(); }}
            />
            {mudou && <button type="button" className="gt-btn small" onClick={onSalvar}>Salvar</button>}
          </div>
        ) : (
          <span title="Ajuste pelo painel da plataforma">{c.orcamentoDiario ? brl(c.orcamentoDiario) : c.orcamento?.total ? `${brl(c.orcamento.total)} total` : "—"}</span>
        )}
      </td>
      <td className="num">{brl(c.gasto)}</td>
      <td className="num">{int(c.cliques)}</td>
      <td className="num">{c.contatos ? c.contatos.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
      <td className="num" style={{ color: cpl == null ? undefined : cpl <= custoMedio ? "var(--good)" : cpl > custoMedio * 1.4 ? "var(--bad)" : "var(--warn)" }}>
        {cpl == null ? "—" : brl(cpl)}
      </td>
      <td className="num">{c.plataforma === "google" ? pct(c.parcela) : c.frequencia ? c.frequencia.toFixed(2).replace(".", ",") : "—"}</td>
    </tr>
  );
}

// ── Criar campanha ──────────────────────────────────────────────────────────
function Contador({ texto, max }: { texto: string; max: number }) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const longas = linhas.filter((l) => l.length > max).length;
  return (
    <span className={`gt-count${longas ? " over" : ""}`}>
      {linhas.length} linha(s){longas ? ` · ${longas} passa(m) de ${max} caracteres` : ` · máx. ${max} caracteres cada`}
    </span>
  );
}

function CriarCampanha({ plataforma, folgaDiaria, onFechar, onCriada }: {
  plataforma: TrafegoPlataforma;
  folgaDiaria: number | null;
  onFechar: () => void;
  onCriada: (texto: string, link?: string) => void;
}) {
  const [qual, setQual] = useState<TrafegoPlataforma>(plataforma);
  const [g, setG] = useState(MODELO_GOOGLE);
  const [m, setM] = useState(MODELO_META);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campoG = (k: keyof typeof MODELO_GOOGLE) => ({
    value: g[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setG((s) => ({ ...s, [k]: e.target.value })),
  });
  const campoM = (k: keyof typeof MODELO_META) => ({
    value: m[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setM((s) => ({ ...s, [k]: e.target.value })),
  });

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      if (qual === "google") {
        const r = await apiTrafegoCriarGoogle({ ...g, orcamentoDiario: Number(g.orcamentoDiario.replace(",", ".")) });
        onCriada(`Campanha "${g.nome}" criada PAUSADA no Google Ads (${r.cidades.map((c) => c.nome.split(",")[0]).join(", ")}). Revise e ative na lista quando quiser.`);
      } else {
        const r = await apiTrafegoCriarMeta({ ...m, orcamentoDiario: Number(m.orcamentoDiario.replace(",", ".")) });
        onCriada(`Campanha "${m.nome}" e o conjunto criados PAUSADOS na Meta (${r.cidade.nome}). Falta adicionar o anúncio (imagem/vídeo e texto) no Gerenciador.`, r.gerenciador);
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const orcamento = Number((qual === "google" ? g.orcamentoDiario : m.orcamentoDiario).replace(",", ".")) || 0;
  const passaTeto = folgaDiaria != null && orcamento > folgaDiaria;

  return (
    <div className="gt-overlay" role="dialog" aria-modal="true" aria-label="Nova campanha" onClick={() => !enviando && onFechar()}>
      <div className="gt-modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Nova campanha</h3>
        <p>A campanha nasce <b>pausada</b>. Nada é gasto até você ativá-la na lista, e a ativação passa pela trava do teto.</p>
        <div className="gt-seg" role="group" aria-label="Plataforma">
          <button type="button" aria-pressed={qual === "google"} onClick={() => setQual("google")}>Google · Pesquisa</button>
          <button type="button" aria-pressed={qual === "meta" && m.modelo === "whatsapp"} onClick={() => { setQual("meta"); setM((s) => ({ ...s, modelo: "whatsapp", nome: s.nome.replace("[MARCA] Reels", "[WPP] Ofertas") })); }}>Meta · WhatsApp</button>
          <button type="button" aria-pressed={qual === "meta" && m.modelo === "marca"} onClick={() => { setQual("meta"); setM((s) => ({ ...s, modelo: "marca", nome: s.nome.replace("[WPP] Ofertas", "[MARCA] Reels"), orcamentoDiario: "15" })); }}>Meta · Marca</button>
        </div>

        {qual === "google" ? (
          <div className="gt-form">
            <label className="full" htmlFor="gt-g-nome">Nome da campanha<input id="gt-g-nome" className="gt-input" {...campoG("nome")} /></label>
            <label htmlFor="gt-g-orc">Orçamento diário (R$)<input id="gt-g-orc" className="gt-input" inputMode="decimal" {...campoG("orcamentoDiario")} /></label>
            <label htmlFor="gt-g-cid">Cidades (separe por vírgula)<input id="gt-g-cid" className="gt-input" {...campoG("cidades")} /></label>
            <label htmlFor="gt-g-grupo">Grupo de anúncios<input id="gt-g-grupo" className="gt-input" {...campoG("grupo")} /></label>
            <label htmlFor="gt-g-url">URL final (página da categoria)<input id="gt-g-url" className="gt-input" {...campoG("urlFinal")} /></label>
            <label htmlFor="gt-g-p1">Caminho 1<input id="gt-g-p1" className="gt-input" maxLength={15} {...campoG("caminho1")} /></label>
            <label htmlFor="gt-g-p2">Caminho 2<input id="gt-g-p2" className="gt-input" maxLength={15} {...campoG("caminho2")} /></label>
            <label htmlFor="gt-g-kw">Palavras-chave — "frase" ou [exata], uma por linha<textarea id="gt-g-kw" rows={7} {...campoG("palavras")} /></label>
            <label htmlFor="gt-g-neg">Palavras negativas, uma por linha<textarea id="gt-g-neg" rows={7} {...campoG("negativas")} /></label>
            <label className="full" htmlFor="gt-g-tit">Títulos (3 a 15) <Contador texto={g.titulos} max={30} /><textarea id="gt-g-tit" rows={6} {...campoG("titulos")} /></label>
            <label className="full" htmlFor="gt-g-desc">Descrições (2 a 4) <Contador texto={g.descricoes} max={90} /><textarea id="gt-g-desc" rows={4} {...campoG("descricoes")} /></label>
            <label className="full" htmlFor="gt-g-suf">Sufixo do URL (UTM)<input id="gt-g-suf" className="gt-input" {...campoG("sufixoUrl")} /></label>
            <p className="gt-hint full" style={{ margin: 0 }}>Já vem configurada como no curso: rede de Pesquisa apenas, localização por presença, lance "maximizar conversões", idioma português.</p>
          </div>
        ) : (
          <div className="gt-form">
            <label className="full" htmlFor="gt-m-nome">Nome da campanha<input id="gt-m-nome" className="gt-input" {...campoM("nome")} /></label>
            <label htmlFor="gt-m-orc">Orçamento diário (R$)<input id="gt-m-orc" className="gt-input" inputMode="decimal" {...campoM("orcamentoDiario")} /></label>
            <label htmlFor="gt-m-cid">Cidade<input id="gt-m-cid" className="gt-input" {...campoM("cidade")} /></label>
            <label htmlFor="gt-m-raio">Raio (km)<input id="gt-m-raio" className="gt-input" inputMode="numeric" {...campoM("raioKm")} /></label>
            <label htmlFor="gt-m-idade">Idade mínima<input id="gt-m-idade" className="gt-input" inputMode="numeric" {...campoM("idadeMin")} /></label>
            <p className="gt-hint full" style={{ margin: 0 }}>
              {m.modelo === "whatsapp"
                ? "Engajamento → conversas no WhatsApp, público Advantage+ na região. Depois de criar, adicione os anúncios (card de oferta com preço, reels de balcão) no Gerenciador de Anúncios."
                : "Reconhecimento → alcance, no máximo 2 exibições por pessoa a cada 7 dias, só Reels e Stories. Depois de criar, adicione os vídeos no Gerenciador de Anúncios."}
            </p>
          </div>
        )}

        {passaTeto && (
          <div className="gt-banner info" style={{ marginTop: 14 }}>
            <span><b>Teto:</b> hoje sobram {brl(folgaDiaria || 0)}/dia no teto. Dá para criar, mas para ativar será preciso reduzir outra campanha.</span>
          </div>
        )}
        {erro && <div className="gt-banner bad" style={{ marginTop: 14 }}><span><b>Não foi possível.</b> {erro}</span></div>}

        <div className="gt-modal-foot">
          <button type="button" className="gt-btn ghost" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button type="button" className="gt-btn" onClick={enviar} disabled={enviando}>{enviando ? "Criando…" : "Criar pausada"}</button>
        </div>
      </div>
    </div>
  );
}
