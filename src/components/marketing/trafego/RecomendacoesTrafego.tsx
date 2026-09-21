import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, Sparkle, Copy, Check, WarningCircle } from "@phosphor-icons/react";
import {
  apiTrafegoRecomendacoes,
  apiTrafegoGerarRecomendacoes,
  apiTrafegoDecidirRecomendacao,
  apiTrafegoOrcamento,
  apiTrafegoStatus,
  apiTrafegoProgramacao,
  apiTrafegoNegativas,
  apiTrafegoCriarGoogle,
  apiTrafegoCriarMeta,
  type TrafegoAnaliseIA,
  type TrafegoRecomendacao,
  type TrafegoCampanha,
  type TrafegoDia,
  type RecEstado,
} from "@/lib/api";
import { ImpactoAjusteModal } from "./ImpactoAjuste";
import { resumoProgramacao } from "./programacao-util";

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const PRIORIDADE: Record<string, { rotulo: string; classe: string }> = {
  alta: { rotulo: "Prioridade alta", classe: "bad" },
  media: { rotulo: "Prioridade média", classe: "warn" },
  baixa: { rotulo: "Prioridade baixa", classe: "info" },
};
const CATEGORIA: Record<string, string> = {
  orcamento: "Orçamento", pausar: "Pausar", nova_campanha: "Nova campanha", segmentacao: "Segmentação",
  lance: "Lance", palavras: "Palavras-chave", criativo: "Criativo", agenda: "Dias e horários", outro: "Outro",
};
const ESTADO: Record<RecEstado, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Pendente", classe: "info" },
  aplicada: { rotulo: "Aplicada pelo HUB", classe: "good" },
  feita: { rotulo: "Feita", classe: "good" },
  descartada: { rotulo: "Descartada", classe: "bad" },
};

/** O que o botão "Aplicar" vai fazer, em português, para a confirmação. */
function descreverExecucao(r: TrafegoRecomendacao): { botao: string; linhas: [string, string][] } | null {
  const p = r.execucao.parametros as Record<string, unknown>;
  const campanha = r.campanhaNome || String(p.campanhaId || "");
  switch (r.execucao.tipo) {
    case "orcamento":
      return { botao: "Aplicar orçamento", linhas: [["Campanha", campanha], ["Novo orçamento", `${brl(Number(p.diario))}/dia`], ["Teto", "O servidor recusa se passar de R$ 8.000/mês"]] };
    case "status":
      return { botao: p.ativo ? "Ativar campanha" : "Pausar campanha", linhas: [["Campanha", campanha], ["Ação", p.ativo ? "Ativar" : "Pausar"]] };
    case "programacao": {
      const dias = (p.dias as TrafegoDia[]) || [];
      return { botao: "Aplicar dias e horários", linhas: [["Campanhas", String((p.campanhaIds as string[] || []).length)], ["Programação", resumoProgramacao(dias.map((dia) => ({ dia, inicio: Number(p.inicio), fim: Number(p.fim) })))]] };
    }
    case "negativas":
      return { botao: "Negativar termos", linhas: [["Campanha", campanha], ["Termos", (p.termos as string[] || []).join(", ")]] };
    case "criar_google":
      return { botao: "Criar pausada no Google", linhas: [["Nome", String(p.nome || "")], ["Orçamento", `${brl(Number(p.orcamentoDiario || 0))}/dia`], ["Cidades", (p.cidades as string[] || []).join(", ")], ["Palavras", String((p.palavras as string[] || []).length)], ["Situação", "Nasce PAUSADA — ative na lista quando quiser"]] };
    case "criar_meta":
      return { botao: "Criar pausada na Meta", linhas: [["Nome", String(p.nome || "")], ["Modelo", p.modelo === "marca" ? "Marca (alcance)" : "WhatsApp (conversas)"], ["Orçamento", `${brl(Number(p.orcamentoDiario || 0))}/dia`], ["Local", `${p.cidade} + ${p.raioKm} km`], ["Situação", "Nasce PAUSADA, sem anúncio"]] };
    default:
      return null;
  }
}

async function executar(r: TrafegoRecomendacao) {
  const p = r.execucao.parametros as Record<string, unknown>;
  switch (r.execucao.tipo) {
    case "orcamento": return apiTrafegoOrcamento(p.plataforma as "google" | "meta", String(p.campanhaId), Number(p.diario));
    case "status": return apiTrafegoStatus(p.plataforma as "google" | "meta", String(p.campanhaId), !!p.ativo);
    case "programacao": return apiTrafegoProgramacao((p.campanhaIds as string[]) || [], (p.dias as TrafegoDia[]) || [], Number(p.inicio), Number(p.fim));
    case "negativas": return apiTrafegoNegativas(String(p.campanhaId), (p.termos as string[]) || []);
    case "criar_google": return apiTrafegoCriarGoogle(p);
    case "criar_meta": return apiTrafegoCriarMeta(p);
    default: throw new Error("Esta sugestão não tem ação automática.");
  }
}

export function RecomendacoesTrafego({ onMudancaNaConta }: { onMudancaNaConta: () => void }) {
  const [analise, setAnalise] = useState<TrafegoAnaliseIA | null>(null);
  const [anteriores, setAnteriores] = useState<{ id: string; data: string; criado_em: string; itens: number }[]>([]);
  const [gerandoDesde, setGerandoDesde] = useState<string | null>(null);
  const [erroRecente, setErroRecente] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"pendentes" | "todas">("pendentes");
  const [confirmar, setConfirmar] = useState<TrafegoRecomendacao | null>(null);
  const [impacto, setImpacto] = useState<TrafegoRecomendacao | null>(null);
  const [descartar, setDescartar] = useState<TrafegoRecomendacao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "good" | "bad"; texto: string } | null>(null);

  const carregar = useCallback(async (id?: string) => {
    try {
      const r = await apiTrafegoRecomendacoes(id);
      setAnalise(r.analise);
      setAnteriores(r.anteriores);
      setGerandoDesde(r.gerandoAgora);
      setErroRecente(r.erroRecente);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto a IA analisa (1–3 min), consulta a cada 10 s.
  useEffect(() => {
    if (!gerandoDesde) return;
    const t = setInterval(() => carregar(), 10000);
    return () => clearInterval(t);
  }, [gerandoDesde, carregar]);

  async function gerarAgora() {
    setAviso(null);
    try {
      await apiTrafegoGerarRecomendacoes();
      setGerandoDesde(new Date().toISOString());
    } catch (e) {
      setAviso({ tipo: "bad", texto: (e as Error).message });
    }
  }

  async function marcar(r: TrafegoRecomendacao, estado: RecEstado, texto?: string) {
    if (!analise) return;
    await apiTrafegoDecidirRecomendacao(analise.id, r.id, estado, texto);
    setAnalise((a) => a && { ...a, itens: a.itens.map((i) => (i.id === r.id ? { ...i, estado, motivo: texto || null } : i)) });
  }

  async function aplicar(r: TrafegoRecomendacao) {
    setOcupado(true);
    try {
      await executar(r);
      await marcar(r, "aplicada");
      setAviso({ tipo: "good", texto: `Aplicado: ${r.titulo}` });
      onMudancaNaConta();
    } catch (e) {
      setAviso({ tipo: "bad", texto: (e as Error).message });
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  }

  async function confirmarDescarte() {
    if (!descartar || !motivo.trim()) return;
    setOcupado(true);
    try {
      await marcar(descartar, "descartada", motivo.trim());
      setDescartar(null);
      setMotivo("");
    } catch (e) {
      setAviso({ tipo: "bad", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  const itens = useMemo(() => {
    const ordem = { alta: 0, media: 1, baixa: 2 };
    return (analise?.itens || [])
      .filter((i) => filtro === "todas" || i.estado === "pendente")
      .sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
  }, [analise, filtro]);
  const pendentes = (analise?.itens || []).filter((i) => i.estado === "pendente").length;
  const teto = analise?.contexto?.teto;

  return (
    <div className="gt-wrap">
      <div className="gt-tabs">
        <div>
          <h4 className="gt-h4" style={{ margin: 0 }}><Sparkle size={16} weight="fill" style={{ color: "var(--destaque)", verticalAlign: -2 }} /> Análise diária do gestor de tráfego (IA)</h4>
          <p className="gt-hint" style={{ margin: "2px 0 0" }}>
            Todo dia às 7h a IA lê as duas contas, o teto e as vendas do ERP e sugere o que fazer. Nada é aplicado sem você.
          </p>
        </div>
        <div className="gt-actions">
          {anteriores.length > 1 && (
            <select className="gt-input" style={{ width: "auto" }} value={analise?.id || ""} onChange={(e) => carregar(e.target.value)} aria-label="Análises anteriores">
              {anteriores.map((a) => <option key={a.id} value={a.id}>{dataHora(a.criado_em)} · {a.itens} sugestões</option>)}
            </select>
          )}
          <div className="gt-seg" role="group" aria-label="Filtro">
            <button type="button" aria-pressed={filtro === "pendentes"} onClick={() => setFiltro("pendentes")}>Pendentes ({pendentes})</button>
            <button type="button" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>Todas</button>
          </div>
          <button type="button" className="gt-btn" onClick={gerarAgora} disabled={!!gerandoDesde}>
            <ArrowsClockwise size={15} weight="bold" /> {gerandoDesde ? "Analisando…" : "Gerar nova análise"}
          </button>
        </div>
      </div>

      {gerandoDesde && (
        <div className="gt-banner info"><span><b>A IA está analisando a conta</b> (começou às {dataHora(gerandoDesde)}). Leva de 1 a 3 minutos; a tela atualiza sozinha.</span></div>
      )}
      {erroRecente && !gerandoDesde && <div className="gt-banner bad"><span><b>A última análise falhou:</b> {erroRecente}</span></div>}
      {erro && <div className="gt-banner bad"><span><b>Não carregou.</b> {erro}</span></div>}
      {aviso && (
        <div className={`gt-banner ${aviso.tipo}`} role="status">
          <span><b>{aviso.tipo === "good" ? "Pronto." : "Não foi possível."}</b> {aviso.texto}</span>
          <button type="button" className="x" aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button>
        </div>
      )}

      {carregando && <div className="gt-panel"><div className="gt-skel" /></div>}
      {!carregando && !analise && !gerandoDesde && (
        <div className="gt-panel gt-empty">Nenhuma análise ainda. A primeira roda amanhã às 7h — ou clique em <b>Gerar nova análise</b>.</div>
      )}

      {analise && (
        <>
          <section className="gt-panel gt-rec-resumo">
            <div>
              <div className="gt-tags"><span className="gt-tag">Leitura de {dataHora(analise.criado_em)}</span>{analise.origem === "manual" && <span className="gt-pill info">gerada manualmente</span>}</div>
              <p className="gt-resumo" style={{ marginTop: 10 }}>{analise.resumo}</p>
            </div>
            {teto && (
              <div className="gt-rec-teto">
                <span>Gasto no mês <b>{brl0(teto.gastoNoMes)}</b></span>
                <span>Projeção <b style={{ color: teto.projecaoFimDoMes > 8000 ? "var(--bad)" : "var(--good)" }}>{brl0(teto.projecaoFimDoMes)}</b></span>
                <span>Diário máximo <b>{brl(teto.diarioMaximoAteFimDoMes)}</b></span>
              </div>
            )}
            {(analise.contexto?.falhasDeLeitura?.length ?? 0) > 0 && (
              <p className="gt-hint" style={{ margin: 0 }}>Parte dos dados não foi lida nesta análise (ex.: ERP fora do ar); as sugestões não consideram vendas quando isso acontece.</p>
            )}
          </section>

          {itens.length === 0 && <div className="gt-panel gt-empty">Nenhuma sugestão pendente nesta análise.</div>}

          <div className="gt-recs">
            {itens.map((r) => {
              const exec = descreverExecucao(r);
              const ajusteComImpacto = r.execucao.tipo === "presenca" || r.execucao.tipo === "lance";
              return (
                <article key={r.id} className={`gt-rec ${r.estado !== "pendente" ? "decidida" : ""}`}>
                  <header>
                    <div className="gt-flags" style={{ marginTop: 0 }}>
                      <span className={`gt-pill ${PRIORIDADE[r.prioridade]?.classe}`}>{PRIORIDADE[r.prioridade]?.rotulo}</span>
                      <span className="gt-pill info">{CATEGORIA[r.categoria] || r.categoria}</span>
                      <span className="gt-hint"><span className="gt-dot" style={{ background: r.plataforma === "meta" ? "var(--meta)" : "var(--google)" }} />{r.plataforma === "meta" ? "Meta" : r.plataforma === "ambas" ? "Google + Meta" : "Google"}{r.campanhaNome ? ` · ${r.campanhaNome}` : ""}</span>
                    </div>
                    {r.estado !== "pendente" && <span className={`gt-pill ${ESTADO[r.estado].classe}`}>{ESTADO[r.estado].rotulo}</span>}
                  </header>
                  <h3>{r.titulo}</h3>
                  <p><b>Diagnóstico.</b> {r.diagnostico}</p>
                  <p><b>O que fazer.</b> {r.acao}</p>

                  {r.impacto && (r.impacto.contatosMes != null || r.impacto.economiaMes != null || r.impacto.texto) && (
                    <div className="gt-rec-impacto">
                      {r.impacto.contatosMes != null && r.impacto.contatosMes !== 0 && <b className={r.impacto.contatosMes > 0 ? "pos" : "neg"}>{r.impacto.contatosMes > 0 ? "+" : "−"}{Math.abs(r.impacto.contatosMes)} contatos/mês</b>}
                      {r.impacto.economiaMes != null && r.impacto.economiaMes > 0 && <b className="pos">−{brl0(r.impacto.economiaMes)}/mês no gasto</b>}
                      {r.impacto.texto && <span>{r.impacto.texto}</span>}
                      <span className="gt-hint">Confiança {r.confianca}</span>
                    </div>
                  )}

                  {r.criativo && <Criativo c={r.criativo} />}

                  {r.confirmarAntes && (
                    <div className="gt-banner bad" style={{ marginTop: 10 }}>
                      <WarningCircle size={18} weight="fill" style={{ color: "var(--bad)", flex: "none" }} />
                      <span><b>Confirme antes de publicar:</b> a IA prometeu algo que não está nos dados — {r.confirmarAntes.map((t) => `"${t}"`).join(", ")}. Só use se a loja realmente oferece.</span>
                    </div>
                  )}

                  {r.alerta && r.estado === "pendente" && <p className="gt-nota" style={{ marginTop: 8 }}><b>Atenção:</b> {r.alerta}</p>}

                  {r.estado === "descartada" && r.motivo && <p className="gt-hint">Motivo do descarte: {r.motivo}</p>}

                  {r.estado === "pendente" && (
                    <div className="gt-actions" style={{ marginTop: 12 }}>
                      {ajusteComImpacto ? (
                        <button type="button" className="gt-btn" onClick={() => setImpacto(r)}>Ver impacto e aplicar</button>
                      ) : exec ? (
                        <button type="button" className="gt-btn" onClick={() => setConfirmar(r)}>{exec.botao}</button>
                      ) : null}
                      <button type="button" className="gt-btn ghost" onClick={() => marcar(r, "feita")}>Marcar como feita</button>
                      <button type="button" className="gt-btn ghost" onClick={() => { setDescartar(r); setMotivo(""); }}>Descartar</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {(analise.contexto?.descartes?.length ?? 0) > 0 && (
            <details className="gt-panel">
              <summary className="gt-hint" style={{ cursor: "pointer" }}>{analise.contexto!.descartes!.length} sugestão(ões) da IA barradas pela conferência automática</summary>
              <ul className="gt-hint">{analise.contexto!.descartes!.map((d, i) => <li key={i}>{d.titulo} — {d.motivo}</li>)}</ul>
            </details>
          )}
        </>
      )}

      {confirmar && (() => {
        const exec = descreverExecucao(confirmar)!;
        return (
          <div className="gt-overlay" role="dialog" aria-modal="true" aria-label={exec.botao} onClick={() => !ocupado && setConfirmar(null)}>
            <div className="gt-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{exec.botao}</h3>
              <p>{confirmar.titulo}</p>
              <dl className="gt-diff">{exec.linhas.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              <p className="gt-hint" style={{ marginTop: 10 }}>A alteração vai direto para a plataforma, passa pela trava do teto e fica no histórico com o seu usuário.</p>
              <div className="gt-modal-foot">
                <button type="button" className="gt-btn ghost" onClick={() => setConfirmar(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="gt-btn" onClick={() => aplicar(confirmar)} disabled={ocupado}>{ocupado ? "Aplicando…" : exec.botao}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {impacto && (
        <ImpactoAjusteModal
          campanha={{ plataforma: "google", id: String(impacto.execucao.parametros.campanhaId), nome: impacto.campanhaNome || "" } as TrafegoCampanha}
          ajuste={impacto.execucao.tipo === "presenca" ? "presenca" : "lance-conversoes"}
          onFechar={() => setImpacto(null)}
          onAplicado={async (texto) => {
            const r = impacto;
            setImpacto(null);
            await marcar(r, "aplicada").catch(() => {});
            setAviso({ tipo: "good", texto });
            onMudancaNaConta();
          }}
        />
      )}

      {descartar && (
        <div className="gt-overlay" role="dialog" aria-modal="true" aria-label="Descartar sugestão" onClick={() => !ocupado && setDescartar(null)}>
          <div className="gt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Descartar sugestão</h3>
            <p>{descartar.titulo}</p>
            <label className="gt-form" htmlFor="gt-motivo" style={{ display: "block" }}>
              <span className="gt-hint">Por quê? A IA lê o motivo e não repete a sugestão.</span>
              <textarea id="gt-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: a loja não atende essa cidade; já testamos isso em julho; o comercial não quer essa oferta" />
            </label>
            <div className="gt-modal-foot">
              <button type="button" className="gt-btn ghost" onClick={() => setDescartar(null)} disabled={ocupado}>Voltar</button>
              <button type="button" className="gt-btn danger" onClick={confirmarDescarte} disabled={ocupado || !motivo.trim()}>Descartar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Criativo({ c }: { c: NonNullable<TrafegoRecomendacao["criativo"]> }) {
  const [copiado, setCopiado] = useState(false);
  const texto = [
    ...(c.titulos?.length ? ["Títulos:", ...c.titulos] : []),
    ...(c.descricoes?.length ? ["", "Descrições:", ...c.descricoes] : []),
    ...(c.textoPrincipal ? ["", `Texto principal: ${c.textoPrincipal}`] : []),
    ...(c.titulo ? [`Título: ${c.titulo}`] : []),
    ...(c.conceitoVisual ? ["", `Visual: ${c.conceitoVisual}`] : []),
  ].join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sem permissão de área de transferência */ }
  }

  return (
    <div className="gt-criativo">
      <div className="gt-criativo-head">
        <b>Criativo sugerido · {c.plataforma === "meta" ? "Meta" : "Google"}{c.formato ? ` · ${c.formato}` : ""}</b>
        <button type="button" className="gt-btn ghost small" onClick={copiar}>{copiado ? <><Check size={13} weight="bold" /> Copiado</> : <><Copy size={13} weight="bold" /> Copiar textos</>}</button>
      </div>
      {!!c.titulos?.length && (
        <ol className="gt-criativo-lista">{c.titulos.map((t, i) => <li key={i}>{t} <em>{t.length}/30</em></li>)}</ol>
      )}
      {!!c.descricoes?.length && (
        <ol className="gt-criativo-lista">{c.descricoes.map((t, i) => <li key={i}>{t} <em>{t.length}/90</em></li>)}</ol>
      )}
      {c.textoPrincipal && <p><span className="gt-hint">Texto principal</span><br />{c.textoPrincipal}</p>}
      {c.titulo && <p><span className="gt-hint">Título</span><br />{c.titulo}</p>}
      {c.conceitoVisual && <p><span className="gt-hint">Conceito visual</span><br />{c.conceitoVisual}</p>}
    </div>
  );
}
