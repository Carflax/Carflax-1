import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Copy, Loader2, Phone, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { atualizarContato, notificar } from "./posvenda-service";
import {
  CLASSIFICACOES,
  DIFICULDADES,
  fmtData,
  fmtDuracao,
  fmtMoeda,
  INTERESSE_BADGE,
  inputCls,
  isoLocal,
  labelCls,
  RESULTADOS,
  somarDias,
  sugerirClassificacao,
  type Classificacao,
  type HubUser,
  type PosVendaConfig,
  type PosVendaContato,
  type PosVendaUserProfile,
  type ResultadoTentativa,
} from "./types";

interface Props {
  contato: PosVendaContato | null;
  config: PosVendaConfig;
  usuarios: HubUser[];
  userProfile?: PosVendaUserProfile | null;
  onClose: () => void;
  onSaved: (c: PosVendaContato) => void;
}

type Form = Pick<
  PosVendaContato,
  | "experiencia_esperada" | "dificuldades" | "dificuldade_detalhe" | "melhoria" | "nota"
  | "voltaria_comprar" | "classificacao" | "observacoes" | "interesse_comercial" | "interesse_produto" | "vendedor_user_id"
>;

export function RegistroLigacaoModal({ contato, config, usuarios, userProfile, onClose, onSaved }: Props) {
  const [resultado, setResultado] = useState<ResultadoTentativa | null>(null);
  const [retornarEm, setRetornarEm] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [classifManual, setClassifManual] = useState(false);
  const [inicio] = useState(() => Date.now());
  const [agora, setAgora] = useState(Date.now());
  const [duracaoManual, setDuracaoManual] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [roteiroAberto, setRoteiroAberto] = useState(true);

  useEffect(() => {
    if (!contato) return;
    setResultado(contato.status === "contatado" ? "atendeu" : null);
    setRetornarEm(`${somarDias(isoLocal(new Date()), 1)}T10:00`);
    setForm({
      experiencia_esperada: contato.experiencia_esperada,
      dificuldades: contato.dificuldades || [],
      dificuldade_detalhe: contato.dificuldade_detalhe,
      melhoria: contato.melhoria,
      nota: contato.nota,
      voltaria_comprar: contato.voltaria_comprar,
      classificacao: contato.classificacao,
      observacoes: contato.observacoes,
      interesse_comercial: contato.interesse_comercial,
      interesse_produto: contato.interesse_produto,
      vendedor_user_id: contato.vendedor_user_id,
    });
    setClassifManual(!!contato.classificacao);
    setDuracaoManual(contato.duracao_segundos ? String(Math.round(contato.duracao_segundos / 60)) : "");
  }, [contato]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sugestao = useMemo(() => (form ? sugerirClassificacao(form) : null), [form]);
  const classificacao: Classificacao | null = classifManual ? form?.classificacao ?? null : sugestao;

  if (!contato || !form) return null;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const primeiroNome = contato.cliente_nome.split(" ")[0];
  const decorrido = Math.round((agora - inicio) / 1000);
  const ehEdicao = contato.status === "contatado";
  const telefones = [contato.celular, contato.telefone].filter(Boolean) as string[];

  const salvar = async () => {
    if (!resultado) return;
    setSalvando(true);
    try {
      const agoraIso = new Date().toISOString();

      if (resultado !== "atendeu") {
        const tentativas = contato.tentativas + 1;
        const esgotou = resultado === "numero_errado" || (resultado !== "pediu_retorno" && tentativas >= config.max_tentativas);
        const salvo = await atualizarContato(contato.id, {
          tentativas,
          ultima_tentativa_em: agoraIso,
          ultimo_resultado: resultado,
          ligado_por: userProfile?.id || null,
          status: esgotou ? "nao_contatado" : "retornar",
          retornar_em: esgotou ? null : new Date(retornarEm).toISOString(),
        });
        onSaved(salvo);
        return;
      }

      if (!classificacao) {
        alert("Preencha as respostas ou escolha a classificação.");
        setSalvando(false);
        return;
      }

      const duracao = duracaoManual ? Math.round(Number(duracaoManual) * 60) : ehEdicao ? contato.duracao_segundos : decorrido;
      const escala = classificacao === "critico" || classificacao === "insatisfeito";
      const supervisorId = contato.segmento === "B2B" ? config.supervisor_b2b : config.supervisor_b2c;

      const patch: Partial<PosVendaContato> = {
        ...form,
        classificacao,
        interesse_produto: form.interesse_comercial ? form.interesse_produto : null,
        status: "contatado",
        duracao_segundos: duracao,
        ligado_por: contato.ligado_por || userProfile?.id || null,
        contatado_em: contato.contatado_em || agoraIso,
      };
      if (!ehEdicao) {
        patch.tentativas = contato.tentativas + 1;
        patch.ultima_tentativa_em = agoraIso;
        patch.ultimo_resultado = "atendeu";
        patch.retornar_em = null;
      }

      // Abre tratativa só na primeira vez que o caso vira insatisfeito/crítico.
      const abrirTratativa = escala && !contato.tratativa_status;
      if (abrirTratativa) {
        const prazoDias = classificacao === "critico" ? config.prazo_critico_dias : config.prazo_insatisfeito_dias;
        patch.tratativa_status = "aberta";
        patch.tratativa_prazo = somarDias(isoLocal(new Date()), prazoDias);
        patch.tratativa_responsavel = supervisorId;
        patch.supervisor_id = supervisorId;
      }
      const avisarVendedor = form.interesse_comercial && !contato.vendedor_notificado_em && !!form.vendedor_user_id;

      let salvo = await atualizarContato(contato.id, patch);

      const extras: Partial<PosVendaContato> = {};
      if (abrirTratativa) {
        const c = CLASSIFICACOES[classificacao];
        const ok = await notificar(
          supervisorId,
          classificacao === "critico" ? "pos_venda_critico" : "pos_venda_insatisfeito",
          `${c.emoji} Pós-venda ${c.label.toLowerCase()}: ${contato.cliente_nome}`,
          [form.dificuldade_detalhe, form.melhoria, form.observacoes].filter(Boolean).join(" · ") ||
            `Nota ${form.nota ?? "—"}. Prazo de tratativa: ${fmtData(patch.tratativa_prazo)}.`,
          contato.id,
        );
        if (ok) extras.supervisor_notificado_em = new Date().toISOString();
      }
      if (avisarVendedor) {
        const ok = await notificar(
          form.vendedor_user_id,
          "pos_venda_interesse",
          `🔵 ${contato.cliente_nome} quer comprar de novo`,
          form.interesse_produto || "O cliente manifestou interesse em nova compra na ligação de pós-venda. Faça o retorno.",
          contato.id,
        );
        if (ok) extras.vendedor_notificado_em = new Date().toISOString();
      }
      if (Object.keys(extras).length) salvo = await atualizarContato(contato.id, extras);

      onSaved(salvo);
    } catch (err) {
      console.error("[PosVenda] salvar ligação:", err);
      alert("Erro ao salvar o registro da ligação.");
    } finally {
      setSalvando(false);
    }
  };

  const vendedores = usuarios.filter((u) => u.operator_code || u.id === form.vendedor_user_id);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-2xl max-h-[92vh] bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Cabeçalho */}
          <div className="p-5 border-b border-border flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={labelCls}>{ehEdicao ? "Editar registro" : "Registrar ligação"} · {contato.segmento}</p>
              <h3 className="text-lg font-black tracking-tight truncate">{contato.cliente_nome}</h3>
              <p className="text-xs text-muted-foreground">
                Compra em {fmtData(contato.data_venda)} · {fmtMoeda(contato.valor_total)} · Vendedor {contato.nome_vendedor?.split(" ")[0] || "—"}
                {contato.tentativas > 0 && ` · ${contato.tentativas} tentativa(s)`}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {telefones.length === 0 && <span className="text-xs text-rose-500 font-semibold">Sem telefone no cadastro</span>}
                {telefones.map((t) => (
                  <button
                    key={t}
                    onClick={() => navigator.clipboard?.writeText(t.replace(/\D/g, ""))}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border text-xs font-bold hover:border-primary/40"
                    title="Copiar número"
                  >
                    <Phone className="w-3 h-3" /> {t} <Copy className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!ehEdicao && (
                <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground tabular-nums" title="Tempo desde que abriu o registro">
                  <Timer className="w-3.5 h-3.5" /> {fmtDuracao(decorrido)}
                </span>
              )}
              <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Roteiro */}
            {!ehEdicao && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5">
                <button onClick={() => setRoteiroAberto((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-primary">Roteiro · não é ligação de venda</span>
                  <ChevronDown className={cn("w-4 h-4 text-primary transition-transform", roteiroAberto && "rotate-180")} />
                </button>
                {roteiroAberto && (
                  <div className="px-4 pb-4 text-[13px] leading-relaxed space-y-2 text-foreground/90">
                    <p>
                      “Olá, {primeiroNome}, tudo bem? Aqui é o {userProfile?.name?.split(" ")[0] || "…"} da Carflax. Estou entrando em contato rapidamente porque você fez
                      {contato.categoria === "primeira_compra" ? " sua primeira compra" : " uma compra"} conosco recentemente. Não é uma ligação de venda. Queremos apenas entender como foi sua experiência e se ocorreu tudo como você esperava.”
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Encerramento: “Obrigado pelo retorno. Nosso objetivo é ouvir nossos clientes e corrigir rapidamente qualquer ponto que possa melhorar sua experiência.”
                    </p>
                    <p className="text-xs text-muted-foreground">Não prometa solução, prazo ou condição comercial. Interesse de compra: registre e passe ao vendedor.</p>
                  </div>
                )}
              </div>
            )}

            {/* Resultado da tentativa */}
            <div className="space-y-2">
              <p className={labelCls}>Resultado da ligação</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RESULTADOS) as ResultadoTentativa[])
                  .filter((r) => !ehEdicao || r === "atendeu")
                  .map((r) => (
                    <Chip key={r} ativo={resultado === r} onClick={() => setResultado(r)}>{RESULTADOS[r]}</Chip>
                  ))}
              </div>
              {resultado && resultado !== "atendeu" && resultado !== "numero_errado" && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tentar de novo em</label>
                  <input type="datetime-local" value={retornarEm} onChange={(e) => setRetornarEm(e.target.value)} className={cn(inputCls, "w-auto py-1.5")} />
                  {resultado !== "pediu_retorno" && contato.tentativas + 1 >= config.max_tentativas && (
                    <span className="text-xs font-semibold text-rose-500">
                      {config.max_tentativas}ª tentativa: o contato será encerrado sem sucesso.
                    </span>
                  )}
                </div>
              )}
            </div>

            {resultado === "atendeu" && (
              <>
                <Pergunta n={1} texto="A experiência de compra aconteceu como você esperava?">
                  <Opcoes
                    valor={form.experiencia_esperada}
                    opcoes={[["sim", "Sim"], ["parcial", "Em parte"], ["nao", "Não"]]}
                    onChange={(v) => set("experiencia_esperada", v)}
                  />
                </Pergunta>

                <Pergunta n={2} texto="Teve alguma dificuldade no atendimento, pagamento, separação ou entrega/retirada?">
                  <div className="flex flex-wrap gap-2">
                    {DIFICULDADES.map((d) => {
                      const ativo = form.dificuldades.includes(d.id);
                      return (
                        <Chip key={d.id} ativo={ativo} onClick={() => set("dificuldades", ativo ? form.dificuldades.filter((x) => x !== d.id) : [...form.dificuldades, d.id])}>
                          {d.label}
                        </Chip>
                      );
                    })}
                    <Chip ativo={form.dificuldades.length === 0} onClick={() => set("dificuldades", [])}>Nenhuma</Chip>
                  </div>
                  {form.dificuldades.length > 0 && (
                    <textarea rows={2} placeholder="O que aconteceu?" className={cn(inputCls, "resize-none mt-2")} value={form.dificuldade_detalhe || ""} onChange={(e) => set("dificuldade_detalhe", e.target.value)} />
                  )}
                </Pergunta>

                <Pergunta n={3} texto="Existe algo que poderíamos ter feito melhor?">
                  <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.melhoria || ""} onChange={(e) => set("melhoria", e.target.value)} />
                </Pergunta>

                <Pergunta n={4} texto="De 0 a 10, qual nota você daria para sua experiência conosco?">
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: 11 }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => set("nota", form.nota === i ? null : i)}
                        className={cn(
                          "w-9 h-9 rounded-lg text-xs font-black border transition-all",
                          form.nota === i
                            ? i >= 9 ? "bg-emerald-500 text-white border-emerald-500" : i >= 7 ? "bg-amber-500 text-white border-amber-500" : "bg-rose-500 text-white border-rose-500"
                            : "bg-secondary border-border text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </Pergunta>

                <Pergunta n={5} texto="Você voltaria a comprar conosco?">
                  <Opcoes
                    valor={form.voltaria_comprar}
                    opcoes={[["sim", "Sim"], ["talvez", "Talvez"], ["nao", "Não"]]}
                    onChange={(v) => set("voltaria_comprar", v)}
                  />
                </Pergunta>

                {/* Classificação */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <p className={labelCls}>Classificação</p>
                    {classifManual && sugestao && (
                      <button onClick={() => setClassifManual(false)} className="text-[11px] font-semibold text-primary">Usar sugestão ({CLASSIFICACOES[sugestao].label})</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.keys(CLASSIFICACOES) as Classificacao[]).map((k) => {
                      const c = CLASSIFICACOES[k];
                      const ativo = classificacao === k;
                      return (
                        <button
                          key={k}
                          onClick={() => { setClassifManual(true); set("classificacao", k); }}
                          className={cn("text-left p-2.5 rounded-xl border transition-all", ativo ? c.cor + " ring-2 ring-current/20" : "border-border bg-secondary/40 hover:bg-secondary")}
                        >
                          <p className="text-xs font-black">{c.emoji} {c.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{c.descricao}</p>
                        </button>
                      );
                    })}
                  </div>
                  {classificacao && !classifManual && <p className="text-[11px] text-muted-foreground">Sugerido pelas respostas. Clique para trocar.</p>}
                  {(classificacao === "critico" || classificacao === "insatisfeito") && !contato.tratativa_status && (
                    <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                      Ao salvar, o supervisor {contato.segmento} recebe o aviso e a tratativa é aberta com prazo de{" "}
                      {classificacao === "critico" ? config.prazo_critico_dias : config.prazo_insatisfeito_dias} dia(s).
                      {!(contato.segmento === "B2B" ? config.supervisor_b2b : config.supervisor_b2c) && " (Supervisor não definido nas configurações!)"}
                    </p>
                  )}
                </div>

                {/* Interesse comercial */}
                <div className={cn("rounded-2xl border p-3 space-y-2", form.interesse_comercial ? INTERESSE_BADGE.cor : "border-border")}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.interesse_comercial} onChange={(e) => set("interesse_comercial", e.target.checked)} className="w-4 h-4 accent-sky-500" />
                    <span className="text-xs font-black text-foreground">{INTERESSE_BADGE.emoji} O cliente falou, por conta própria, que quer comprar de novo</span>
                  </label>
                  {form.interesse_comercial && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input placeholder="Produto / necessidade mencionada" className={inputCls} value={form.interesse_produto || ""} onChange={(e) => set("interesse_produto", e.target.value)} />
                      <select className={inputCls} value={form.vendedor_user_id || ""} onChange={(e) => set("vendedor_user_id", e.target.value || null)}>
                        <option value="">Vendedor que fará o retorno…</option>
                        {vendedores.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-1">
                    <p className={labelCls}>Observações</p>
                    <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.observacoes || ""} onChange={(e) => set("observacoes", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <p className={labelCls}>Duração (min)</p>
                    <input
                      type="number" min={0} step={0.5}
                      placeholder={ehEdicao ? "" : String(Math.max(1, Math.round(decorrido / 60)))}
                      className={cn(inputCls, "w-28")}
                      value={duracaoManual}
                      onChange={(e) => setDuracaoManual(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-4 border-t border-border flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 bg-secondary hover:bg-secondary/80 font-bold text-xs rounded-2xl border border-border">Cancelar</button>
            <button
              onClick={salvar}
              disabled={!resultado || salvando}
              className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-xs rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {resultado === "atendeu" ? "Salvar registro" : "Registrar tentativa"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function Pergunta({ n, texto, children }: { n: number; texto: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-bold"><span className="text-primary mr-1.5">{n}.</span>“{texto}”</p>
      {children}
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
        ativo ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border text-muted-foreground hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function Opcoes<T extends string>({ valor, opcoes, onChange }: { valor: T | null; opcoes: [T, string][]; onChange: (v: T | null) => void }) {
  return (
    <div className="flex gap-2">
      {opcoes.map(([v, l]) => (
        <Chip key={v} ativo={valor === v} onClick={() => onChange(valor === v ? null : v)}>{l}</Chip>
      ))}
    </div>
  );
}
