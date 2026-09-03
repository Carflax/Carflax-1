import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Play,
  Bell,
  BellOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Coach de Atendimento — onde o supervisor escreve as regras e lê o resultado.
 *
 * As regras são texto livre porque quem escreve é o supervisor: qualquer
 * gramática que a gente inventasse viraria um manual para ele decorar, e a
 * promessa é ele escrever como fala ("me avise quando o cliente mandar mensagem
 * e o atendente responder com áudio").
 *
 * Fala direto com o Supabase, como as outras telas do HUB. As rotas em
 * /api/coach-atendimento existem para o agendador e para integrações; a tela
 * não precisa passar por elas — exceto para rodar a análise sob demanda, que é
 * onde mora a chamada de IA.
 */

interface Regra {
  id: string;
  regra: string;
  ativa: boolean;
  vendedor_id: string | null;
  criado_em: string;
}

interface Alerta {
  id: string;
  regra: string;
  vendedor_nome: string | null;
  cliente: string | null;
  quando: string | null;
  trecho: string | null;
  explicacao: string | null;
  criado_em: string;
  enviado_em: string | null;
}

interface Analise {
  id: string;
  dia: string;
  vendedor_nome: string | null;
  conversas: number;
  mensagens: number;
  nota: number | null;
  resumo: string | null;
  acertos: string[];
  pontos_corrigir: string[];
  exemplos: { trecho: string; problema: string; melhor: string }[];
}

interface Usuario {
  id: string;
  name: string;
  permissions?: string[] | null;
}

export function CoachView() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [novaRegra, setNovaRegra] = useState("");
  const [novaRegraVendedor, setNovaRegraVendedor] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [aba, setAba] = useState<"regras" | "alertas" | "analises">("regras");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [r, a, an, u] = await Promise.all([
      supabase.from("coach_regras").select("*").order("criado_em", { ascending: false }),
      supabase.from("coach_alertas").select("*").order("criado_em", { ascending: false }).limit(80),
      supabase.from("coach_atendimento_diario").select("*").order("dia", { ascending: false }).limit(40),
      supabase.from("usuarios").select("id, name, permissions").order("name"),
    ]);
    if (r.error) setErro(`Tabelas do coach ainda não existem no banco (${r.error.message}).`);
    setRegras((r.data as Regra[]) || []);
    setAlertas((a.data as Alerta[]) || []);
    setAnalises((an.data as Analise[]) || []);
    setUsuarios((u.data as Usuario[]) || []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criarRegra = async () => {
    const texto = novaRegra.trim();
    if (texto.length < 10) {
      setErro("Descreva a regra com pelo menos 10 caracteres.");
      return;
    }
    const { error } = await supabase.from("coach_regras").insert({
      regra: texto,
      vendedor_id: novaRegraVendedor || null,
    });
    if (error) return setErro(error.message);
    setNovaRegra("");
    setNovaRegraVendedor("");
    setErro(null);
    carregar();
  };

  const alternarRegra = async (r: Regra) => {
    await supabase.from("coach_regras").update({ ativa: !r.ativa }).eq("id", r.id);
    carregar();
  };

  const excluirRegra = async (id: string) => {
    await supabase.from("coach_regras").delete().eq("id", id);
    carregar();
  };

  /**
   * Roda a análise agora. É o que permite testar uma regra recém-escrita sem
   * esperar as 20h — sem isso o supervisor só descobre no dia seguinte que
   * escreveu de um jeito que a IA não entendeu.
   */
  const rodarAgora = async () => {
    setRodando(true);
    setErro(null);
    try {
      await apiPost("/api/coach-atendimento/analises/rodar", {});
      await carregar();
    } catch (e) {
      setErro(`Falha ao rodar a análise: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRodando(false);
    }
  };

  /**
   * Quem pode receber os avisos: só quem tem acesso à ferramenta de WhatsApp.
   *
   * A lista crua de usuários trazia 35 nomes — RH, estoque, motorista —, e
   * escolher destinatário virava caça ao nome. Quem não abre a tela de
   * atendimento não tem o que fazer com um alerta de conduta em conversa.
   */
  const candidatos = usuarios.filter((u) =>
    (u.permissions || []).some((p) => /whatsapp/i.test(p)),
  );

  const nomeUsuario = (id: string | null) =>
    id ? usuarios.find((u) => u.id === id)?.name || "—" : "Todos os atendentes";

  const abas = [
    { id: "regras" as const, label: "Regras", n: regras.filter((r) => r.ativa).length },
    { id: "alertas" as const, label: "Alertas", n: alertas.length },
    { id: "analises" as const, label: "Análises do dia", n: analises.length },
  ];

  return (
    <div className="h-full flex flex-col pt-4 px-3 sm:px-6 pb-2 overflow-y-auto scrollbar-hide bg-background">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-1 h-8 bg-primary rounded-full" />
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Coach de Atendimento</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Regras que a IA verifica nas conversas · notificação na hora e resumo às 20h
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={rodarAgora}
            disabled={rodando}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
            title="Roda a análise agora, sem esperar as 20h"
          >
            <Play className={cn("w-3.5 h-3.5", rodando && "animate-pulse")} />
            {rodando ? "Analisando..." : "Rodar agora"}
          </button>
          <button
            onClick={carregar}
            className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-primary transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", carregando && "animate-spin")} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] font-bold text-rose-500">
          {erro}
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-border">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              "px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 -mb-px",
              aba === a.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.label} <span className="opacity-50">{a.n}</span>
          </button>
        ))}
      </div>

      {aba === "regras" && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl border border-border bg-card/40 space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Nova regra — escreva como você falaria
            </label>
            <textarea
              value={novaRegra}
              onChange={(e) => setNovaRegra(e.target.value)}
              rows={2}
              placeholder="Ex.: me avise quando o cliente mandar uma mensagem e em seguida o atendente responder com áudio"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs font-medium outline-none focus:border-primary/50 resize-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={novaRegraVendedor}
                onChange={(e) => setNovaRegraVendedor(e.target.value)}
                className="h-9 bg-background border border-border rounded-xl px-3 text-[11px] font-bold outline-none"
              >
                <option value="">Todos os atendentes</option>
                {candidatos.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                onClick={criarRegra}
                className="h-9 px-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {regras.length === 0 && !carregando && (
              <p className="text-[11px] text-muted-foreground py-8 text-center">
                Nenhuma regra cadastrada. A IA ainda gera o resumo diário, mas não vigia nada específico.
              </p>
            )}
            {regras.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border bg-card/40",
                  r.ativa ? "border-border" : "border-border/40 opacity-50",
                )}
              >
                <button onClick={() => alternarRegra(r)} title={r.ativa ? "Desativar" : "Ativar"}>
                  {r.ativa ? (
                    <Bell className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <BellOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">{r.regra}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    {nomeUsuario(r.vendedor_id)}
                  </p>
                </div>
                <button
                  onClick={() => excluirRegra(r.id)}
                  className="p-1.5 hover:bg-rose-500/10 rounded-lg text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

        </div>
      )}

      {aba === "alertas" && (
        <div className="space-y-2">
          {alertas.length === 0 && !carregando && (
            <p className="text-[11px] text-muted-foreground py-8 text-center">
              Nenhuma violação registrada.
            </p>
          )}
          {alertas.map((a) => (
            <div key={a.id} className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] font-black text-foreground">{a.vendedor_nome || "—"}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {a.cliente} {a.quando ? `· ${a.quando}` : ""}
                </span>
                <span className="ml-auto text-[9px] font-bold uppercase text-muted-foreground">
                  {a.enviado_em ? "avisado" : "não enviado"}
                </span>
              </div>
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{a.regra}</p>
              {a.explicacao && <p className="text-[11px] text-foreground">{a.explicacao}</p>}
              {a.trecho && (
                <p className="text-[10px] text-muted-foreground italic whitespace-pre-wrap">{a.trecho}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {aba === "analises" && (
        <div className="space-y-3">
          {analises.length === 0 && !carregando && (
            <p className="text-[11px] text-muted-foreground py-8 text-center">
              Nenhuma análise ainda. Use "Rodar agora" para gerar a de hoje.
            </p>
          )}
          {analises.map((an) => (
            <div key={an.id} className="p-4 rounded-2xl border border-border bg-card/40 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-foreground">{an.vendedor_nome || "—"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {an.dia.split("-").reverse().join("/")} · {an.conversas} conversas · {an.mensagens} mensagens
                </span>
                {an.nota != null && (
                  <span
                    className={cn(
                      "ml-auto text-lg font-black tabular-nums",
                      an.nota >= 8
                        ? "text-emerald-500"
                        : an.nota >= 6
                          ? "text-amber-500"
                          : "text-rose-500",
                    )}
                  >
                    {an.nota}
                  </span>
                )}
              </div>
              {an.resumo && <p className="text-[11px] text-foreground">{an.resumo}</p>}
              {(an.pontos_corrigir || []).length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">
                    Corrigir
                  </p>
                  <ul className="space-y-0.5">
                    {an.pontos_corrigir.map((p, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        • {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(an.exemplos || []).length > 0 && (
                <div className="space-y-1.5">
                  {an.exemplos.map((ex, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-secondary/30 border border-border/50">
                      <p className="text-[10px] text-muted-foreground italic">"{ex.trecho}"</p>
                      <p className="text-[10px] text-rose-400 mt-1">{ex.problema}</p>
                      <p className="text-[10px] text-emerald-500 mt-0.5">→ {ex.melhor}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
