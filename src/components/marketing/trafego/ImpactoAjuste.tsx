import { useEffect, useState } from "react";
import { apiTrafegoAjusteGoogle, apiTrafegoImpacto, type TrafegoCampanha, type TrafegoImpacto } from "@/lib/api";

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

type Ajuste = "presenca" | "lance-conversoes";

/**
 * Confirmação de uma correção do Google com a expectativa de resultado ANTES de
 * aplicar. A mesma correção pode ganhar contatos numa campanha e cortar em outra;
 * por isso o número é calculado com os 30 dias da própria campanha.
 */
export function ImpactoAjusteModal({ campanha, ajuste, onFechar, onAplicado }: {
  campanha: TrafegoCampanha;
  ajuste: Ajuste;
  onFechar: () => void;
  onAplicado: (texto: string) => void;
}) {
  const [impacto, setImpacto] = useState<TrafegoImpacto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiTrafegoImpacto(campanha.id, ajuste)
      .then((r) => { if (vivo) setImpacto(r); })
      .catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [campanha.id, ajuste]);

  const titulo = ajuste === "presenca" ? "Localização por presença" : "Lance: maximizar conversões";
  const delta = impacto?.deltaContatos ?? 0;
  const perde = impacto != null && delta < -0.5;
  const ganha = impacto != null && delta > 0.5;

  async function aplicar() {
    setAplicando(true);
    try {
      await apiTrafegoAjusteGoogle(campanha.id, ajuste);
      onAplicado(`${titulo} aplicado em "${campanha.nome}". Expectativa: ${delta >= 0 ? "+" : ""}${num(delta)} contatos/mês.`);
    } catch (e) {
      setErro((e as Error).message);
      setAplicando(false);
    }
  }

  return (
    <div className="gt-overlay" role="dialog" aria-modal="true" aria-label={titulo} onClick={() => !aplicando && onFechar()}>
      <div className="gt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{titulo}</h3>
        <p>{campanha.nome}</p>

        <dl className="gt-diff">
          {ajuste === "presenca" ? (
            <>
              <dt>Antes</dt><dd>Presença ou interesse — inclui quem está fora e pesquisa sobre a região</dd>
              <dt>Depois</dt><dd>Presença — só quem está na área segmentada</dd>
            </>
          ) : (
            <>
              <dt>Antes</dt><dd>Maximizar cliques — busca o clique mais barato</dd>
              <dt>Depois</dt><dd>Maximizar conversões — busca quem chama no WhatsApp/liga</dd>
            </>
          )}
        </dl>

        {!impacto && !erro && (
          <div className="gt-impacto carregando"><div className="gt-skel" /><span className="gt-hint">Calculando a expectativa com os últimos 30 dias da campanha…</span></div>
        )}

        {impacto && (
          <div className={`gt-impacto ${perde ? "neg" : ganha ? "pos" : "neutro"}`}>
            <div className="gt-impacto-num">
              <span className="l">Expectativa por mês</span>
              <b>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{num(Math.abs(delta))} contatos</b>
              <span className="d">
                {num(impacto.antes.contatos)} → {num(impacto.depois.contatos)} contatos
                {impacto.antes.cpa != null && impacto.depois.cpa != null ? ` · custo por contato ${brl(impacto.antes.cpa)} → ${brl(impacto.depois.cpa)}` : ""}
                {impacto.economia > 1 ? ` · deixa de gastar ${brl0(impacto.economia)}` : ""}
              </span>
            </div>

            {ajuste === "presenca" && impacto.dentro && impacto.fora && (
              <div className="gt-impacto-split">
                <div><span>Quem está <b>dentro</b> da área</span><strong>{num(impacto.dentro.contatos)} contatos · {brl0(impacto.dentro.gasto)}</strong></div>
                <div><span>Quem está <b>fora</b> (para de ver o anúncio)</span><strong>{num(impacto.fora.contatos)} contatos · {brl0(impacto.fora.gasto)}</strong></div>
              </div>
            )}
            {ajuste === "presenca" && (impacto.cidadesFora?.length ?? 0) > 0 && (
              <p className="gt-hint" style={{ margin: "8px 0 0" }}>
                De onde vem quem está fora: {impacto.cidadesFora!.map((c) => `${c.cidade} (${num(c.contatos)})`).join(", ")}.
              </p>
            )}
            {ajuste === "lance-conversoes" && impacto.referencia?.cpa != null && (
              <p className="gt-hint" style={{ margin: "8px 0 0" }}>
                Referência: as {impacto.referencia.campanhas} campanhas de Pesquisa que já usam "maximizar conversões" custam {brl(impacto.referencia.cpa)} por contato.
              </p>
            )}

            <p className="gt-veredito">
              {perde
                ? <><b>Não recomendado.</b> A maior parte dos contatos desta campanha vem de quem está fora da área — {impacto.cidadesFora?.[0] ? `principalmente ${impacto.cidadesFora[0].cidade}, ` : ""}que é cliente da loja. Aplicar corta esses contatos.</>
                : ganha
                  ? <><b>Recomendado.</b> Mais contatos com a mesma verba.</>
                  : <><b>Efeito pequeno.</b> A mudança quase não altera o número de contatos desta campanha.</>}
            </p>
            <p className="gt-hint" style={{ margin: 0 }}>Base {dataBR(impacto.periodo.inicio)} a {dataBR(impacto.periodo.fim)}. {impacto.premissa} É estimativa, não garantia.</p>
          </div>
        )}

        {erro && <div className="gt-banner bad" style={{ marginTop: 12 }}><span><b>Não foi possível.</b> {erro}</span></div>}

        <div className="gt-modal-foot">
          <button type="button" className="gt-btn ghost" onClick={onFechar} disabled={aplicando}>{perde ? "Manter como está" : "Cancelar"}</button>
          <button type="button" className={`gt-btn${perde ? " danger" : ""}`} onClick={aplicar} disabled={aplicando || (!impacto && !erro)}>
            {aplicando ? "Aplicando…" : perde ? "Aplicar mesmo assim" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
