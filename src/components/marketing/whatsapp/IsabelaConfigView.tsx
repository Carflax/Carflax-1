import { useEffect, useState } from "react";
import { Bot, Loader2, Plus, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/hooks/useNotification";
import { carregarConfigIsabela, salvarConfigIsabela, type IsabelaConfig, type IsabelaConversa } from "@/lib/isabela";
import { formatBrDate, formatBrTime } from "@/lib/utils";

// Configuração da Isabela (atendente virtual) e as últimas conversas dela.
// Lançamento em duas fases: "teste" responde só aos números cadastrados; "todos"
// atende todo lead novo sem vendedor.

type Edicao = Omit<IsabelaConfig, "atualizado_por" | "updated_at">;

const STATUS: Record<IsabelaConversa["status"], { rotulo: string; cor: string }> = {
  ativa: { rotulo: "Atendendo", cor: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  transferida: { rotulo: "Transferida", cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  assumida: { rotulo: "Vendedor assumiu", cor: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  pausada: { rotulo: "Pausada", cor: "bg-secondary text-muted-foreground" },
};

const formatarNumero = (n: string) => {
  const d = n.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
};

interface ConversaLista extends IsabelaConversa {
  nome: string | null;
  updated_at: string;
}

interface Props {
  autor: string | null;
  onAbrirConversa: (jid: string) => void;
}

export function IsabelaConfigView({ autor, onAbrirConversa }: Props) {
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<Edicao | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [atualizado, setAtualizado] = useState<{ por: string | null; em: string } | null>(null);
  const [novoNumero, setNovoNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [conversas, setConversas] = useState<ConversaLista[]>([]);

  useEffect(() => {
    carregarConfigIsabela()
      .then(({ atualizado_por, updated_at, ...resto }) => {
        setConfig(resto);
        setOriginal(JSON.stringify(resto));
        setAtualizado({ por: atualizado_por, em: updated_at });
      })
      .catch((e: Error) => showNotification("error", "Isabela", e.message));

    (async () => {
      const { data } = await supabase
        .from("isabela_conversas")
        .select("remote_jid, status, iniciada_em, transferida_em, motivo_transferencia, resumo, respostas, ultimo_erro, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);
      const lista = (data || []) as ConversaLista[];
      if (lista.length === 0) return;
      const { data: clientes } = await supabase
        .from("marketing_clientes")
        .select("remote_jid, nome, push_name")
        .in("remote_jid", lista.map((c) => c.remote_jid));
      const nomes = new Map((clientes || []).map((c) => [c.remote_jid, c.nome || c.push_name]));
      setConversas(lista.map((c) => ({ ...c, nome: nomes.get(c.remote_jid) ?? null })));
    })();
  }, [showNotification]);

  if (!config) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const alterado = JSON.stringify(config) !== original;

  const adicionarNumero = () => {
    const d = novoNumero.replace(/\D/g, "");
    if (d.length < 10) {
      showNotification("error", "Número inválido", "Informe DDD + número.");
      return;
    }
    const completo = d.startsWith("55") ? d : `55${d}`;
    if (!config.numeros_teste.includes(completo)) setConfig({ ...config, numeros_teste: [...config.numeros_teste, completo] });
    setNovoNumero("");
  };

  const salvar = async () => {
    if (config.ativo && config.modo === "teste" && config.numeros_teste.length === 0) {
      showNotification("error", "Cadastre um número de teste", "No modo teste a Isabela só responde aos números da lista.");
      return;
    }
    setSalvando(true);
    try {
      await salvarConfigIsabela(config, autor);
      setOriginal(JSON.stringify(config));
      setAtualizado({ por: autor, em: new Date().toISOString() });
      showNotification("success", "Isabela atualizada", config.ativo ? (config.modo === "todos" ? "Atendendo todos os leads novos." : "Respondendo só aos números de teste.") : "Desligada.");
    } catch (e) {
      showNotification("error", "Erro ao salvar", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const rotulo = "block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/15 text-violet-500 flex items-center justify-center"><Bot className="w-5 h-5" /></div>
            <div className="flex-1">
              <h2 className="text-base font-black tracking-tight">Isabela · atendente virtual</h2>
              <p className="text-xs text-muted-foreground">Atende o lead novo, consulta preço e estoque no ERP, monta o pré-orçamento e passa para o vendedor.</p>
            </div>
          </div>

          {/* Liga/desliga e modo */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-bold">{config.ativo ? "Ligada" : "Desligada"}</p>
                <p className="text-xs text-muted-foreground">Desligada, ela não responde ninguém.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.ativo}
                onClick={() => setConfig({ ...config, ativo: !config.ativo })}
                className={`relative w-11 h-6 rounded-full transition-colors ${config.ativo ? "bg-violet-500" : "bg-secondary border border-border"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${config.ativo ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {(["teste", "todos"] as const).map((modo) => (
                <button
                  key={modo}
                  onClick={() => setConfig({ ...config, modo })}
                  className={`text-left rounded-xl border p-3 transition-colors ${config.modo === modo ? "border-violet-500 bg-violet-500/10" : "border-border hover:bg-secondary"}`}
                >
                  <p className="text-xs font-black">{modo === "teste" ? "Só números de teste" : "Todos os leads novos"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {modo === "teste" ? "Responde apenas aos números cadastrados abaixo." : "Atende todo lead sem vendedor até alguém assumir."}
                  </p>
                </button>
              ))}
            </div>

            {config.modo === "teste" && (
              <div>
                <span className={rotulo}>Números de teste</span>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {config.numeros_teste.length === 0 && <span className="text-xs text-muted-foreground">Nenhum número cadastrado.</span>}
                  {config.numeros_teste.map((n) => (
                    <span key={n} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-secondary text-xs font-bold tabular-nums">
                      {formatarNumero(n)}
                      <button onClick={() => setConfig({ ...config, numeros_teste: config.numeros_teste.filter((x) => x !== n) })} className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-destructive" title="Remover">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={novoNumero}
                    onChange={(e) => setNovoNumero(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") adicionarNumero(); }}
                    inputMode="tel"
                    placeholder="(11) 99999-9999"
                    className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm outline-none focus:border-violet-500"
                  />
                  <button onClick={adicionarNumero} className="h-9 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Adicionar</button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <label className="block">
              <span className={rotulo}>O que ela precisa saber da loja</span>
              <textarea
                value={config.informacoes_loja}
                onChange={(e) => setConfig({ ...config, informacoes_loja: e.target.value })}
                rows={6}
                placeholder="Horário de funcionamento, endereço, se faz entrega e onde, formas de pagamento..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-violet-500 resize-y"
              />
              <span className="text-[11px] text-muted-foreground">O que não estiver aqui ela não responde: passa para o vendedor.</span>
            </label>
            <label className="block">
              <span className={rotulo}>Orientações extras</span>
              <textarea
                value={config.instrucoes_extras}
                onChange={(e) => setConfig({ ...config, instrucoes_extras: e.target.value })}
                rows={4}
                placeholder='Ex.: "Sempre ofereça a marca Amanco primeiro." "Pedidos acima de R$ 2.000 passe direto para o vendedor."'
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-violet-500 resize-y"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {atualizado?.por ? `Alterado por ${atualizado.por} em ${formatBrDate(new Date(atualizado.em))} ${formatBrTime(new Date(atualizado.em))}` : ""}
            </p>
            <button
              onClick={salvar}
              disabled={!alterado || salvando}
              className="h-10 px-5 rounded-xl bg-violet-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-40"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {alterado ? "Salvar" : "Salvo"}
            </button>
          </div>
        </section>

        {/* Últimas conversas */}
        <aside className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Últimas conversas dela</p>
          {conversas.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border p-4 text-center">Nenhuma conversa ainda.</p>
          ) : (
            conversas.map((c) => (
              <button
                key={c.remote_jid}
                onClick={() => onAbrirConversa(c.remote_jid)}
                className="w-full text-left rounded-xl border border-border bg-card hover:bg-secondary/60 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold truncate">{c.nome || formatarNumero(c.remote_jid.split("@")[0])}</p>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${STATUS[c.status].cor}`}>{STATUS[c.status].rotulo}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {c.ultimo_erro ? `Erro: ${c.ultimo_erro}` : c.motivo_transferencia || `${c.respostas} resposta${c.respostas === 1 ? "" : "s"}`}
                </p>
              </button>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
