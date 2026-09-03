import { useState, useEffect, useRef, useCallback } from "react";
import { Crown, TrendingUp, TrendingDown, Minus, Flame, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  apiRankingDia,
  apiDashboardGeral,
  type RankingDiaRow,
  type VendedorResumo,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { buildAvatarResolver, type AvatarResolver } from "@/lib/avatar-by-code";
import { cn } from "@/lib/utils";
import { calcMetaDiaria } from "@/lib/dias-uteis";

/**
 * Ranking do dia — painel de parede.
 *
 * Feito para ficar aberto num telão, então NÃO mostra valor em real: só posição,
 * percentual da meta e evolução. O que a loja precisa enxergar de longe é quem
 * está na frente e quem está subindo, não quanto cada um faturou.
 *
 * "Meta diária" é o `DIARIO` do Dashboard Geral: o que falta da meta do mês
 * dividido pelos dias úteis restantes. Ela SOBE quando o vendedor atrasa e CAI
 * quando ele adianta — é o ritmo necessário hoje, a mesma conta do card
 * individual, para os dois números não se contradizerem.
 */

// 15s contra o endpoint enxuto (/ranking-dia), que tem cache de 15s no
// servidor. Cada ciclo cai numa entrada nova de cache, então a tela acompanha a
// venda quase ao vivo sem repetir consulta pesada no ERP.
const INTERVALO_MS = 15 * 1000;
const SOM_COMEMORACAO = "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3";

interface Linha {
  cod: string;
  nome: string;
  vendidoHoje: number;
  metaDiaria: number;
  percentual: number;
  variacao: number | null; // pontos percentuais vs ontem
  avatar?: string;
}

const num = (v: unknown) => (typeof v === "string" ? parseFloat(v) : Number(v)) || 0;

const diaIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** % da meta diária. Sem meta (já bateu o mês), quem vendeu conta como 100%. */
const percentualDaMeta = (vendido: number, meta: number) =>
  meta > 0 ? (vendido / meta) * 100 : vendido > 0 ? 100 : 0;

/** Percentual de cada vendedor num dia passado — base da variação. */
function percentuaisDoDia(resposta: VendedorResumo[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of resposta || []) {
    const cod = String(r.COD_VENDEDOR);
    if (cod === "MEDIA" || cod.startsWith("TEAM:")) continue;
    mapa.set(cod, percentualDaMeta(num(r.TOTAL_VENDIDO_HOJE), num(r.DIARIO)));
  }
  return mapa;
}

function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[10px] font-black text-white/30">—</span>;
  const zero = Math.abs(v) < 1;
  const Icone = zero ? Minus : v > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-black tabular-nums",
        zero ? "text-white/40" : v > 0 ? "text-emerald-400" : "text-rose-400",
      )}
    >
      <Icone className="w-3 h-3" />
      {zero ? "0%" : `${Math.abs(Math.round(v))}%`}
    </span>
  );
}

export function RankingView() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [comemorando, setComemorando] = useState<Linha | null>(null);

  const resolverRef = useRef<AvatarResolver | null>(null);
  // Quem já bateu a meta numa leitura anterior: sem isso a festa se repetiria a
  // cada atualização enquanto o vendedor seguisse acima de 100%.
  const jaBateuRef = useRef<Set<string>>(new Set());
  const ontemRef = useRef<Map<string, number>>(new Map());
  const primeiraCargaRef = useRef(true);

  const tocarSom = () => {
    try {
      const audio = new Audio(SOM_COMEMORACAO);
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch {
      /* navegador bloqueia áudio sem interação — a comemoração visual continua */
    }
  };

  const carregar = useCallback(async () => {
    try {
      if (!resolverRef.current) {
        const { data } = await supabase.from("usuarios").select("operator_code, avatar");
        resolverRef.current = buildAvatarResolver(data || []);
      }

      const linhasApi = await apiRankingDia();
      const ontem = ontemRef.current;

      const lista = (linhasApi || [])
        .map((r: RankingDiaRow) => {
          const cod = String(r.COD_VENDEDOR);
          const vendidoHoje = num(r.VENDIDO_HOJE);
          // Mesma função do card do vendedor: desconta feriado e não conta hoje.
          const metaDiaria = calcMetaDiaria(num(r.FALTANTE));
          const percentual = percentualDaMeta(vendidoHoje, metaDiaria);
          const base = ontem.get(cod);
          return {
            cod,
            nome: r.NOME_VENDEDOR,
            vendidoHoje,
            metaDiaria,
            percentual,
            variacao: base === undefined ? null : percentual - base,
            avatar: resolverRef.current?.(cod),
          } as Linha;
        })
        .filter((l) => l.vendidoHoje > 0 || l.metaDiaria > 0)
        .sort((a, b) => b.percentual - a.percentual)
        .slice(0, 10);

      const novos = lista.filter((l) => l.percentual >= 100 && !jaBateuRef.current.has(l.cod));
      lista.forEach((l) => {
        if (l.percentual >= 100) jaBateuRef.current.add(l.cod);
      });

      setLinhas(lista);

      // Na primeira carga metade do time já pode ter batido: comemorar tudo de
      // uma vez seria ruído. A festa é só para quem virar a chave com a tela aberta.
      if (!primeiraCargaRef.current && novos.length > 0) {
        setComemorando(novos[0]);
        tocarSom();
      }
      primeiraCargaRef.current = false;
    } catch {
      /* mantém a lista anterior em caso de falha de rede */
    }
  }, []);

  // Ontem é base fixa da variação: buscar a cada ciclo era desperdício, o dia já
  // fechou. Uma vez na montagem basta.
  useEffect(() => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    apiDashboardGeral(undefined, diaIso(ontem))
      .then((r) => {
        ontemRef.current = percentuaisDoDia(r);
      })
      .catch(() => {
        /* sem ontem, a coluna de variação fica em "—" */
      });
  }, []);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [carregar]);

  useEffect(() => {
    if (!comemorando) return;
    const id = setTimeout(() => setComemorando(null), 9000);
    return () => clearTimeout(id);
  }, [comemorando]);

  const podio = linhas.slice(0, 3);
  const resto = linhas.slice(3);
  // Ordem visual: 2º à esquerda, 1º ao centro (maior), 3º à direita.
  const ordemPodio = [podio[1], podio[0], podio[2]].filter(Boolean);

  return (
    <div className="h-screen w-full overflow-hidden bg-[#060b1a] text-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.25),transparent_55%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.18),transparent_50%)]" />

      {/* Sem cabeçalho: num telão o título ocupa altura e não informa nada que
          o pódio já não diga. A atualização segue automática a cada 30s. */}
      <div className="relative h-full flex flex-col p-6 gap-5">
        <div className="flex-1 min-h-0 flex flex-col gap-5">
            {/* Pódio */}
            <div className="grid grid-cols-3 gap-4 shrink-0 items-end">
              {ordemPodio.map((l) => {
                const pos = linhas.findIndex((x) => x.cod === l.cod) + 1;
                const primeiro = pos === 1;
                return (
                  <motion.div
                    key={l.cod}
                    layout
                    className={cn(
                      "relative rounded-2xl border p-4 text-center overflow-hidden",
                      primeiro
                        ? "bg-gradient-to-b from-amber-500/20 to-transparent border-amber-400/50 pb-6"
                        : pos === 2
                          ? "bg-gradient-to-b from-blue-500/15 to-transparent border-blue-400/40"
                          : "bg-gradient-to-b from-orange-600/15 to-transparent border-orange-500/40",
                    )}
                  >
                    {primeiro && (
                      <Crown className="w-7 h-7 text-amber-400 mx-auto mb-1 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
                    )}
                    <span
                      className={cn(
                        "absolute top-3 left-4 text-2xl font-black",
                        primeiro ? "text-amber-400" : pos === 2 ? "text-blue-300" : "text-orange-400",
                      )}
                    >
                      {pos}
                    </span>

                    {l.avatar ? (
                      <img
                        src={l.avatar}
                        alt=""
                        className={cn(
                          "rounded-full object-cover mx-auto border-2",
                          primeiro ? "w-24 h-24 border-amber-400/60" : "w-16 h-16 border-white/20",
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          "rounded-full bg-white/10 mx-auto flex items-center justify-center font-black",
                          primeiro ? "w-24 h-24 text-2xl" : "w-16 h-16 text-lg",
                        )}
                      >
                        {l.nome.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <p
                      className={cn(
                        "font-black uppercase leading-tight mt-3",
                        primeiro ? "text-base" : "text-[11px]",
                      )}
                    >
                      {l.nome}
                    </p>
                    <p
                      className={cn(
                        "font-black tabular-nums leading-none mt-2",
                        primeiro
                          ? "text-4xl text-amber-400"
                          : pos === 2
                            ? "text-2xl text-blue-300"
                            : "text-2xl text-orange-400",
                      )}
                    >
                      {l.percentual.toFixed(0)}%
                    </p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-0.5">
                      da meta
                    </p>

                    {primeiro && (
                      <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase tracking-widest">
                        <Crown className="w-3 h-3" /> Líder do dia
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Lista do 4º ao 10º */}
            <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
              {/* A barra leva 2,5x a fatia do nome: com 200px fixos ela ficava
                  curta e sobrava um vazio enorme no meio da linha. */}
              <div className="grid grid-cols-[70px_minmax(180px,1fr)_minmax(0,2.5fr)_90px_80px] gap-3 px-4 py-2 border-b border-white/10 text-[8px] font-black uppercase tracking-widest text-white/35 shrink-0">
                <span>Posição</span>
                <span>Colaborador</span>
                <span>Progresso da meta</span>
                <span className="text-right">% da meta</span>
                <span className="text-right">Variação</span>
              </div>
              {/* flex-col + linhas flex-1: as 7 linhas dividem a altura que
                  sobra, em vez de ficarem no topo com um vazio embaixo. Num
                  telão isso é o que faz o texto ser legível de longe. */}
              <div className="flex-1 min-h-0 flex flex-col">
                {resto.map((l) => {
                  const pos = linhas.findIndex((x) => x.cod === l.cod) + 1;
                  const bateu = l.percentual >= 100;
                  return (
                    <motion.div
                      layout
                      key={l.cod}
                      className={cn(
                        "grid grid-cols-[70px_minmax(180px,1fr)_minmax(0,2.5fr)_90px_80px] gap-3 items-center px-4 border-b border-white/5 transition-colors flex-1 min-h-0",
                        bateu && "bg-emerald-400/[0.06]",
                      )}
                    >
                      <span className="text-lg font-black text-white/70">{pos}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        {l.avatar ? (
                          <img
                            src={l.avatar}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black shrink-0">
                            {l.nome.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-[11px] font-black uppercase truncate">{l.nome}</span>
                        {bateu && <Flame className="w-3 h-3 text-amber-400 shrink-0" />}
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            bateu ? "bg-emerald-400" : "bg-blue-500",
                          )}
                          style={{ width: `${Math.min(l.percentual, 100)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-right text-sm font-black tabular-nums",
                          bateu ? "text-emerald-400" : "text-white/80",
                        )}
                      >
                        {l.percentual.toFixed(0)}%
                      </span>
                      <span className="text-right">
                        <Variacao v={l.variacao} />
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
        </div>
      </div>

      {/* Comemoração da meta diária */}
      <AnimatePresence>
        {comemorando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setComemorando(null)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="relative w-full max-w-md bg-[#0b1224] border border-emerald-400/40 rounded-3xl p-10 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setComemorando(null)}
                className="absolute top-4 right-4 p-1.5 text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-5xl mb-3">🎉</p>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-5">
                Meta diária batida
              </p>

              {comemorando.avatar ? (
                <img
                  src={comemorando.avatar}
                  alt=""
                  className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-emerald-400/50"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-white/10 mx-auto flex items-center justify-center text-3xl font-black">
                  {comemorando.nome.slice(0, 2).toUpperCase()}
                </div>
              )}

              <h2 className="text-2xl font-black uppercase tracking-tight mt-5">{comemorando.nome}</h2>
              <p className="text-5xl font-black text-emerald-400 tabular-nums mt-3">
                {comemorando.percentual.toFixed(0)}%
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">
                da meta do dia
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
