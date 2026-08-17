import { useState } from "react";
import { X, Loader2, SlidersHorizontal } from "lucide-react";
import { apiRhSalvarVaga, type RhVaga, type RhCriterios } from "@/lib/api";

const CRITERIOS_PADRAO: RhCriterios = {
  peso_distancia: 35,
  peso_experiencia_funcao: 25,
  peso_segmento: 20,
  peso_tempo_experiencia: 10,
  peso_experiencia_recente: 10,
  anos_experiencia_ideal: 3,
  meses_recente: 6,
  faixa_excelente_km: 15,
  faixa_aceitavel_km: 25,
  faixa_baixa_km: 40,
  corte_km: 40,
};

const listaParaTexto = (arr?: string[]) => (arr || []).join(", ");
const textoParaLista = (t: string) =>
  t.split(",").map((s) => s.trim()).filter(Boolean);

// Fora do VagaModal de propósito: definido dentro, cada tecla digitada criaria
// um novo tipo de componente, o React remontaria o input e o foco se perderia.
function NumeroPeso({
  label,
  valor,
  onChange,
  sufixo,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
  sufixo?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={valor}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 bg-secondary border border-border rounded-lg px-2 py-1 text-sm font-bold text-right text-foreground outline-none focus:border-primary"
        />
        {sufixo && <span className="text-[10px] font-bold text-muted-foreground">{sufixo}</span>}
      </span>
    </label>
  );
}

interface VagaModalProps {
  vaga: RhVaga | null; // null = nova vaga
  criadoPor?: string;
  onClose: () => void;
  onSalvo: (vaga: RhVaga) => void;
}

export function VagaModal({ vaga, criadoPor, onClose, onSalvo }: VagaModalProps) {
  const [titulo, setTitulo] = useState(vaga?.titulo || "");
  const [descricao, setDescricao] = useState(vaga?.descricao || "");
  const [local, setLocal] = useState(vaga?.local_texto || "Av. Américo Bruno, 75 - Jundiaí/SP");
  const [funcao, setFuncao] = useState(listaParaTexto(vaga?.palavras_funcao));
  const [segmentos, setSegmentos] = useState(
    listaParaTexto(vaga?.segmentos) || "material de construção, hidráulica, elétrica",
  );
  const [obrigatorios, setObrigatorios] = useState(listaParaTexto(vaga?.requisitos_obrigatorios));
  const [criterios, setCriterios] = useState<RhCriterios>({
    ...CRITERIOS_PADRAO,
    ...(vaga?.criterios || {}),
  });
  const [pesosAbertos, setPesosAbertos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const totalPesos =
    criterios.peso_distancia +
    criterios.peso_experiencia_funcao +
    criterios.peso_segmento +
    criterios.peso_tempo_experiencia +
    criterios.peso_experiencia_recente;

  const setCriterio = (k: keyof RhCriterios, v: number) =>
    setCriterios((c) => ({ ...c, [k]: Number.isFinite(v) ? v : 0 }));

  const salvar = async () => {
    if (!titulo.trim()) {
      setErro("Informe o título da vaga.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await apiRhSalvarVaga({
        ...(vaga?.id ? { id: vaga.id } : {}),
        titulo: titulo.trim(),
        descricao,
        local_texto: local,
        palavras_funcao: textoParaLista(funcao),
        segmentos: textoParaLista(segmentos),
        requisitos_obrigatorios: textoParaLista(obrigatorios),
        criterios,
        criado_por: criadoPor,
      } as Partial<RhVaga> & { titulo: string });
      if (!r.success) throw new Error("Falha ao salvar a vaga.");
      onSalvo(r.vaga);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a vaga.");
    } finally {
      setSalvando(false);
    }
  };

  const campo =
    "w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary transition-colors";
  const rotulo = "text-[10px] font-black uppercase tracking-wider text-muted-foreground";

  const peso = (label: string, chave: keyof RhCriterios, sufixo?: string) => (
    <NumeroPeso
      label={label}
      valor={criterios[chave]}
      onChange={(v) => setCriterio(chave, v)}
      sufixo={sufixo}
    />
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide shadow-2xl">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-black uppercase tracking-tight text-foreground">
            {vaga ? "Editar vaga" : "Nova vaga"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className={rotulo}>Título da vaga</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Vendedor(a) de Balcão"
              className={`${campo} mt-1`}
            />
          </div>

          <div>
            <label className={rotulo}>Descrição (contexto para a IA)</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Atendimento no balcão, orçamentos, conhecimento em materiais de construção…"
              className={`${campo} mt-1 resize-none`}
            />
          </div>

          <div>
            <label className={rotulo}>Local de trabalho (origem da distância)</label>
            <input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className={`${campo} mt-1`}
            />
            <p className="text-[10px] font-medium text-muted-foreground mt-1">
              A distância é calculada da matriz (Jundiaí). Altere o texto só se a vaga for em outra unidade.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={rotulo}>Experiência na função (termos)</label>
              <input
                value={funcao}
                onChange={(e) => setFuncao(e.target.value)}
                placeholder="vendedor, balconista, atendimento"
                className={`${campo} mt-1`}
              />
            </div>
            <div>
              <label className={rotulo}>Segmentos que contam ponto</label>
              <input
                value={segmentos}
                onChange={(e) => setSegmentos(e.target.value)}
                className={`${campo} mt-1`}
              />
            </div>
          </div>

          <div>
            <label className={rotulo}>Requisitos obrigatórios (eliminam quem não tem)</label>
            <input
              value={obrigatorios}
              onChange={(e) => setObrigatorios(e.target.value)}
              placeholder="CNH B, ensino médio completo"
              className={`${campo} mt-1`}
            />
            <p className="text-[10px] font-medium text-muted-foreground mt-1">
              Separe por vírgula. Deixe vazio se não houver eliminatório.
            </p>
          </div>

          {/* Pesos */}
          <div className="border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setPesosAbertos((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Pesos e faixas de distância
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-wider ${
                  totalPesos === 100 ? "text-muted-foreground" : "text-amber-500"
                }`}
              >
                Total {totalPesos} pts
              </span>
            </button>

            {pesosAbertos && (
              <div className="px-4 pb-4 pt-1 grid md:grid-cols-2 gap-x-6 gap-y-2.5 border-t border-border">
                {peso("Distância", "peso_distancia", "pts")}
                {peso("Experiência na função", "peso_experiencia_funcao", "pts")}
                {peso("Segmento", "peso_segmento", "pts")}
                {peso("Tempo de experiência", "peso_tempo_experiencia", "pts")}
                {peso("Atividade recente", "peso_experiencia_recente", "pts")}
                <div className="md:col-span-2 h-px bg-border my-1" />
                {peso("Excelente até", "faixa_excelente_km", "km")}
                {peso("Aceitável até", "faixa_aceitavel_km", "km")}
                {peso("Baixa prioridade até", "faixa_baixa_km", "km")}
                {peso("Eliminar acima de", "corte_km", "km")}
                {peso("Experiência ideal", "anos_experiencia_ideal", "anos")}
                {peso("Considerar recente até", "meses_recente", "meses")}
                <p className="md:col-span-2 text-[10px] font-medium text-muted-foreground mt-1">
                  Alterou os pesos? Use "Reanalisar tudo" na tela para recalcular as notas já existentes.
                </p>
              </div>
            )}
          </div>

          {erro && <p className="text-xs font-bold text-rose-500">{erro}</p>}
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar vaga
          </button>
        </div>
      </div>
    </div>
  );
}
