import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  MessageSquare,
  FileText,
  Flame,
  Snowflake,
  Thermometer,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiCrmOrcamentos } from "@/lib/api";
import { getCrmStatusMap } from "@/lib/crm-service";
import { cn } from "@/lib/utils";

/**
 * Funil de vendas do WhatsApp — quadro estilo Trello.
 *
 * Arrastar um card grava `funil_etapa` no cliente. Enquanto ninguém arrastou,
 * a etapa é DERIVADA do que já existe (venda, orçamento, temperatura), então o
 * quadro nasce cheio em vez de despejar tudo na primeira coluna e obrigar o
 * time a arrumar 3.800 conversas na mão.
 */

export const ETAPAS = [
  { id: "NOVO", label: "Novo Lead", barra: "bg-slate-400" },
  { id: "ATENDIMENTO", label: "Em Atendimento", barra: "bg-blue-500" },
  { id: "ORCAMENTO", label: "Orçamento Enviado", barra: "bg-amber-500" },
  { id: "NEGOCIACAO", label: "Negociação", barra: "bg-violet-500" },
  { id: "GANHO", label: "Ganho", barra: "bg-emerald-500" },
  { id: "PERDIDO", label: "Perdido", barra: "bg-rose-500" },
] as const;

export type EtapaId = (typeof ETAPAS)[number]["id"];
const ETAPA_IDS = new Set<string>(ETAPAS.map((e) => e.id));

interface ClienteFunil {
  id: string;
  remote_jid: string;
  nome: string | null;
  push_name: string | null;
  foto_url: string | null;
  temperatura: string | null;
  vendedor_id: string | null;
  valor_orcamento: number | null;
  data_orcamento: string | null;
  orcamento_documento: string | null;
  valor_venda: number | null;
  ultima_conversa_em: string | null;
  funil_etapa: string | null;
}

/**
 * Etapa do card: o que foi arrastado vale; sem isso, deduz dos dados.
 *
 * A ordem dos testes é a do processo ao contrário — quem já comprou não volta
 * a ser "orçamento em aberto" só porque a coluna do orçamento continua
 * preenchida.
 *
 * "Em atendimento" = tem `vendedor_id`. Conferido contra as mensagens: das 571
 * conversas ativas, as 26 com vendedor_id são exatamente as 26 que têm resposta
 * nossa, sem uma divergência sequer — então dá para usar o campo do cliente em
 * vez de varrer a tabela de mensagens a cada carga do quadro.
 *
 * `temperatura` só entra para "Perdido". Quente/Morno é leitura de interesse
 * feita pela IA, não posição no processo: um lead recém-respondido costuma vir
 * "Quente" e ele pertence a Em Atendimento, não a Negociação. Negociação é
 * coluna de decisão humana — só chega lá quem for arrastado para lá.
 *
 * `statusErp` é a situação do orçamento vinculado no ERP e vence a leitura
 * local: orçamento baixado como perdido cai em Perdido mesmo que a temperatura
 * diga "Quente".
 */
export function etapaDoCliente(
  c: {
    funil_etapa?: string | null;
    valor_venda?: number | null;
    valor_orcamento?: number | null;
    temperatura?: string | null;
    vendedor_id?: string | null;
    orcamento_documento?: string | null;
  },
  statusErp?: Map<string, StatusErp>,
): EtapaId {
  if (c.funil_etapa && ETAPA_IDS.has(c.funil_etapa)) return c.funil_etapa as EtapaId;

  const doc = String(c.orcamento_documento || "").trim();
  const erp = doc ? statusErp?.get(doc) : undefined;

  if ((c.valor_venda ?? 0) > 0 || erp === "VENDA") return "GANHO";
  if (erp === "PERDIDO" || c.temperatura === "Perdido") return "PERDIDO";
  if (c.valor_orcamento != null) return "ORCAMENTO";
  if (c.vendedor_id) return "ATENDIMENTO";
  return "NOVO";
}

/** Situação do orçamento no ERP, por número de documento. */
export type StatusErp = "VENDA" | "PERDIDO" | "EMITIDO";

/**
 * Lê no ERP o que aconteceu com os orçamentos dos cards.
 *
 * Mesma regra da seção Comercial (ver buildPerdidoMap): orçamento com motivo de
 * cancelamento preenchido está PERDIDO; com pedido, nota ou data de baixa virou
 * VENDA; e o status que o vendedor marcou no CRM manda sobre os dois. Sem isso o
 * funil só sabia de "perdido" pela temperatura da IA, que não olha o ERP — um
 * orçamento baixado como perdido continuava parado em Orçamento Enviado.
 */
async function buscarStatusErp(documentos: string[]): Promise<Map<string, StatusErp>> {
  const mapa = new Map<string, StatusErp>();
  if (documentos.length === 0) return mapa;

  const [orcData, statusCrm] = await Promise.all([
    apiCrmOrcamentos({ documento: documentos.join(",") }).catch(() => null),
    getCrmStatusMap(documentos).catch(() => new Map()),
  ]);
  if (!orcData) return mapa;

  for (const r of orcData) {
    const doc = String(r.ORCAMENTO || "").trim();
    if (!doc) continue;
    let status: StatusErp = "EMITIDO";
    if (r.MOTIVO_CANCELAMENTO !== "SEM MOTIVO") status = "PERDIDO";
    else if (r.PEDIDO === "Sim" || r.NOTA_FISCAL || (r.DATA_BAIXA && r.DATA_BAIXA !== "SEM DATA"))
      status = "VENDA";

    const crm = statusCrm.get(doc)?.status_crm;
    if (crm === "PERDIDO") status = "PERDIDO";
    else if (crm === "VENDA") status = "VENDA";

    mapa.set(doc, status);
  }
  return mapa;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const diasAtras = (iso: string | null): number | null => {
  if (!iso) return null;
  const dias = (Date.now() - new Date(iso).getTime()) / 86400000;
  return dias < 0 ? 0 : Math.floor(dias);
};

const IconeTemp = ({ t }: { t: string | null }) => {
  if (t === "Quente") return <Flame className="w-3 h-3 text-rose-500" />;
  if (t === "Morno") return <Thermometer className="w-3 h-3 text-amber-500" />;
  if (t === "Frio") return <Snowflake className="w-3 h-3 text-sky-400" />;
  return null;
};

// Sem filtro por atendente de propósito: o quadro mostra exatamente o mesmo
// universo da lista de conversas do WhatsApp, que também é do time todo. (O
// `vendedorId` do WhatsappView NÃO serve para isso — ele é o id de quem está
// logado, usado só para carimbar quem enviou a mensagem. Filtrar o quadro por
// ele deixava o funil vazio para todo mundo que não fosse o atendente.)
export function FunilView({
  onVoltar,
  onAbrirConversa,
  tituloVoltar = "Voltar para as mensagens",
}: {
  onVoltar: () => void;
  /** Abre a conversa do card na tela de Mensagens. */
  onAbrirConversa: (remoteJid: string) => void;
  /** Dica da seta — muda conforme haja ou não conversa aberta ao lado. */
  tituloVoltar?: string;
}) {
  const [clientes, setClientes] = useState<ClienteFunil[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<EtapaId | null>(null);
  const [statusErp, setStatusErp] = useState<Map<string, StatusErp>>(new Map());
  // Fotos de perfil do WhatsApp expiram, e o <img> quebrado vira aquele ícone
  // cinza de imagem faltando. Guardamos quais falharam para cair nas iniciais,
  // o mesmo que o ContactAvatar faz na tela de Mensagens (não dá para importá-lo
  // aqui: o WhatsappView já importa este arquivo, seria ciclo).
  const [fotosQuebradas, setFotosQuebradas] = useState<Set<string>>(new Set());
  // Documentos de pedido por conversa. O número da venda NÃO fica no cliente —
  // `marketing_clientes.valor_venda` é só a soma; cada pedido do ERP é uma linha
  // em `marketing_vendas`. Sem esta busca o card mostrava valor de venda sem
  // nenhum número ao lado, parecendo que não tinha vínculo com a Citel.
  const [docsVenda, setDocsVenda] = useState<Map<string, string[]>>(new Map());

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    // Mesmos filtros de getActiveClientes(), que monta a lista de conversas ao
    // lado — o quadro TEM que mostrar o mesmo conjunto, senão vira uma segunda
    // verdade. Só `arquivado = false` não basta: dos 569 não arquivados, 513
    // nunca tiveram conversa (`ultima_conversa_em` nula) e 32 não são contato
    // individual (grupo/broadcast). Sem estes dois filtros o Novo Lead enchia
    // com 545 cards que não existem na tela do WhatsApp.
    const { data, error } = await supabase
      .from("marketing_clientes")
      .select(
        "id, remote_jid, nome, push_name, foto_url, temperatura, vendedor_id, valor_orcamento, data_orcamento, orcamento_documento, valor_venda, ultima_conversa_em, funil_etapa",
      )
      .or("arquivado.eq.false,arquivado.is.null")
      .eq("descartado", false)
      .not("ultima_conversa_em", "is", null)
      .like("remote_jid", "%@s.whatsapp.net")
      .order("ultima_conversa_em", { ascending: false })
      .limit(1000);
    if (error) {
      // Antes da migration a coluna não existe e o select inteiro falha — sem
      // essa mensagem a tela ficaria vazia sem explicar o motivo.
      setErro(
        error.message.includes("funil_etapa")
          ? "A coluna funil_etapa ainda não existe no banco. Rode a migration 20260902160000_marketing_funil_etapa.sql."
          : error.message,
      );
      setClientes([]);
    } else {
      const lista = (data || []) as ClienteFunil[];
      setClientes(lista);

      // O ERP é consultado depois e em separado: se ele estiver fora do ar, o
      // quadro já apareceu com a derivação local em vez de ficar preso no
      // "carregando".
      const docs = [
        ...new Set(
          lista.map((c) => String(c.orcamento_documento || "").trim()).filter(Boolean),
        ),
      ];
      buscarStatusErp(docs).then(setStatusErp).catch(() => setStatusErp(new Map()));

      const jids = lista.filter((c) => (c.valor_venda ?? 0) > 0).map((c) => c.remote_jid);
      if (jids.length > 0) {
        supabase
          .from("marketing_vendas")
          .select("remote_jid, documento")
          .in("remote_jid", jids)
          .not("documento", "is", null)
          .then(({ data: vendas }) => {
            const mapa = new Map<string, string[]>();
            for (const v of vendas || []) {
              const doc = String(v.documento || "").trim();
              if (!doc) continue;
              const atual = mapa.get(v.remote_jid) || [];
              if (!atual.includes(doc)) atual.push(doc);
              mapa.set(v.remote_jid, atual);
            }
            setDocsVenda(mapa);
          });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const porEtapa = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const mapa = new Map<EtapaId, ClienteFunil[]>(ETAPAS.map((e) => [e.id, []]));
    for (const c of clientes) {
      if (termo) {
        const alvo = `${c.nome || ""} ${c.push_name || ""} ${c.remote_jid}`.toLowerCase();
        if (!alvo.includes(termo)) continue;
      }
      mapa.get(etapaDoCliente(c, statusErp))!.push(c);
    }
    return mapa;
  }, [clientes, busca, statusErp]);

  const mover = async (clienteId: string, destino: EtapaId) => {
    const atual = clientes.find((c) => c.id === clienteId);
    if (!atual || etapaDoCliente(atual, statusErp) === destino) return;

    // Otimista: o card salta na hora e volta sozinho se o banco recusar.
    const anterior = atual.funil_etapa;
    setClientes((prev) =>
      prev.map((c) => (c.id === clienteId ? { ...c, funil_etapa: destino } : c)),
    );

    const { error } = await supabase
      .from("marketing_clientes")
      .update({ funil_etapa: destino, updated_at: new Date().toISOString() })
      .eq("id", clienteId);

    if (error) {
      setClientes((prev) =>
        prev.map((c) => (c.id === clienteId ? { ...c, funil_etapa: anterior } : c)),
      );
      setErro(`Não foi possível mover o card: ${error.message}`);
    }
  };

  // flex-1 + min-h-0 em vez de h-full: o quadro vive dentro de uma linha flex
  // ao lado da conversa, e h-full somado à margem estourava a altura do pai.
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-background overflow-hidden border border-border/50 rounded-2xl shadow-2xl m-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border shrink-0">
        <button
          onClick={onVoltar}
          className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-primary transition-colors"
          title={tituloVoltar}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-black text-base tracking-tighter uppercase leading-none">
            Funil de Vendas
          </h2>
          <span className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">
            {clientes.length} conversas ativas · arraste para mudar a etapa
          </span>
        </div>

        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none focus:border-primary/50 transition-all"
          />
        </div>
        <button
          onClick={carregar}
          className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-primary transition-colors"
          title="Recarregar"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {erro && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[10px] font-bold text-rose-500">
          {erro}
        </div>
      )}

      {/* Colunas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-4 h-full min-w-max">
          {ETAPAS.map((etapa) => {
            const lista = porEtapa.get(etapa.id) || [];
            return (
              <div
                key={etapa.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setColunaAlvo(etapa.id);
                }}
                onDragLeave={() => setColunaAlvo((c) => (c === etapa.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setColunaAlvo(null);
                  const id = e.dataTransfer.getData("text/plain") || arrastando;
                  if (id) mover(id, etapa.id);
                  setArrastando(null);
                }}
                className={cn(
                  "w-72 flex flex-col rounded-2xl border bg-card/40 transition-colors",
                  colunaAlvo === etapa.id
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/60",
                )}
              >
                <div className="px-4 pt-4 pb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", etapa.barra)} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                      {etapa.label}
                    </span>
                    <span className="ml-auto text-[9px] font-black text-muted-foreground">
                      {lista.length}
                    </span>
                  </div>
                  <div className={cn("h-0.5 rounded-full mt-2", etapa.barra, "opacity-40")} />
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                  {loading ? (
                    <div className="flex justify-center py-8 opacity-40">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : lista.length === 0 ? (
                    <div className="py-8 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                      Vazio
                    </div>
                  ) : (
                    lista.map((c) => {
                      const dias = diasAtras(c.ultima_conversa_em);
                      const nome = c.nome || c.push_name || c.remote_jid.split("@")[0];
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", c.id);
                            e.dataTransfer.effectAllowed = "move";
                            setArrastando(c.id);
                          }}
                          onDragEnd={() => {
                            setArrastando(null);
                            setColunaAlvo(null);
                          }}
                          className={cn(
                            "bg-card border border-border/60 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-all space-y-2",
                            arrastando === c.id && "opacity-40",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {c.foto_url && !fotosQuebradas.has(c.id) ? (
                              <img
                                src={c.foto_url}
                                alt=""
                                onError={() =>
                                  setFotosQuebradas((prev) => new Set(prev).add(c.id))
                                }
                                className="w-7 h-7 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[9px] font-black text-muted-foreground shrink-0">
                                {nome.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-[11px] font-black text-foreground truncate flex-1">
                              {nome}
                            </span>
                            <IconeTemp t={c.temperatura} />
                          </div>

                          {c.valor_orcamento != null && (
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="text-[10px] font-black text-amber-500 tabular-nums">
                                {brl(Number(c.valor_orcamento))}
                              </span>
                              {c.orcamento_documento && (
                                <span className="text-[8px] font-bold text-muted-foreground truncate">
                                  #{c.orcamento_documento}
                                </span>
                              )}
                            </div>
                          )}

                          {(c.valor_venda ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-emerald-500 tabular-nums">
                                Venda: {brl(Number(c.valor_venda))}
                              </span>
                              {(() => {
                                const pedidos = docsVenda.get(c.remote_jid) || [];
                                if (pedidos.length === 0) return null;
                                return (
                                  <span className="text-[8px] font-bold text-muted-foreground truncate">
                                    #{pedidos[0]}
                                    {pedidos.length > 1 ? ` +${pedidos.length - 1}` : ""}
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="text-[9px] font-bold uppercase tracking-wider">
                              {dias === null
                                ? "sem conversa"
                                : dias === 0
                                  ? "hoje"
                                  : `há ${dias}d`}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAbrirConversa(c.remote_jid);
                              }}
                              // O card é draggable; sem isto o mousedown no botão
                              // inicia o arrasto e o clique nunca chega.
                              draggable={false}
                              onDragStart={(e) => e.preventDefault()}
                              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/60 hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-500 transition-colors"
                              title="Abrir conversa"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span className="text-[8px] font-black uppercase tracking-widest">
                                Chat
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
