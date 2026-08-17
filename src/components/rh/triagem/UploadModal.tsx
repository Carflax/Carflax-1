import { useRef, useState } from "react";
import { X, UploadCloud, FileText, Loader2, Info, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadCurriculo } from "@/lib/uploadCurriculo";
import { apiRhImportar } from "@/lib/api";

interface UploadModalProps {
  vagaId: string;
  vagaTitulo: string;
  onClose: () => void;
  onImportado: () => void;
}

type Falha = { arquivo: string; erro: string };

export function UploadModal({ vagaId, vagaTitulo, onClose, onImportado }: UploadModalProps) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [texto, setTexto] = useState("");
  const [nomeTexto, setNomeTexto] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const pdfs = Array.from(lista).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const ignorados = lista.length - pdfs.length;
    if (ignorados > 0) {
      setErro(`${ignorados} arquivo(s) ignorado(s): só aceitamos PDF.`);
    }
    setArquivos((a) => {
      const nomes = new Set(a.map((f) => f.name + f.size));
      return [...a, ...pdfs.filter((f) => !nomes.has(f.name + f.size))];
    });
  };

  const enviar = async () => {
    if (!arquivos.length && texto.trim().length < 80) {
      setErro("Adicione ao menos um PDF ou cole o texto de um currículo.");
      return;
    }
    setEnviando(true);
    setErro(null);
    setFalhas([]);
    setProgresso(0);

    try {
      const enviados: { path: string; nome: string }[] = [];
      const falhasUpload: Falha[] = [];

      // Upload sequencial: 150 PDFs em paralelo estouram a conexão e o rate do
      // Storage. Sequencial mantém a barra de progresso honesta.
      for (let i = 0; i < arquivos.length; i++) {
        try {
          enviados.push(await uploadCurriculo(arquivos[i]));
        } catch (e) {
          falhasUpload.push({
            arquivo: arquivos[i].name,
            erro: e instanceof Error ? e.message : "Falha no upload",
          });
        }
        setProgresso(Math.round(((i + 1) / arquivos.length) * 100));
      }

      const r = await apiRhImportar({
        vaga_id: vagaId,
        arquivos: enviados,
        textos:
          texto.trim().length >= 80
            ? [{ nome: nomeTexto.trim() || "Currículo colado", texto: texto.trim() }]
            : [],
      });

      const todasFalhas = [...falhasUpload, ...(r.erros || [])];
      setFalhas(todasFalhas);

      if (r.importados > 0) {
        onImportado();
        if (todasFalhas.length === 0) onClose();
      } else if (todasFalhas.length === 0) {
        setErro("Nenhum currículo importado.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao importar currículos.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto scrollbar-hide shadow-2xl">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-foreground">
              Importar currículos
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {vagaTitulo}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={enviando}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              adicionar(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors",
              arrastando ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <UploadCloud className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="text-sm font-black text-foreground">
              Arraste os PDFs aqui ou clique para escolher
            </p>
            <p className="text-[11px] font-bold text-muted-foreground mt-1">
              Pode soltar os 150 de uma vez · somente PDF de texto
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                adicionar(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {arquivos.length > 0 && (
            <div className="border border-border rounded-2xl divide-y divide-border max-h-44 overflow-y-auto scrollbar-hide">
              {arquivos.map((f, i) => (
                <div key={f.name + i} className="flex items-center gap-2 px-3 py-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs font-bold text-foreground truncate flex-1">{f.name}</span>
                  <button
                    onClick={() => setArquivos((a) => a.filter((_, idx) => idx !== i))}
                    disabled={enviando}
                    className="p-1 rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Colar texto — saída para currículo que só existe na tela do Indeed */}
          <details className="border border-border rounded-2xl overflow-hidden">
            <summary className="px-4 py-3 cursor-pointer text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-primary" />
              Ou cole o texto de um currículo
            </summary>
            <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
              <input
                value={nomeTexto}
                onChange={(e) => setNomeTexto(e.target.value)}
                placeholder="Nome do candidato (opcional)"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary"
              />
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={6}
                placeholder="Cole aqui o currículo copiado do Indeed…"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary resize-none"
              />
            </div>
          </details>

          <div className="flex gap-2 items-start bg-secondary/50 border border-border rounded-2xl p-3">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
              PDF digitalizado (foto do currículo) não tem camada de texto e será recusado — nesses
              casos, cole o texto. Os arquivos ficam em um bucket privado e só são abertos por link
              temporário.
            </p>
          </div>

          {enviando && arquivos.length > 0 && (
            <div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mt-1.5">
                Enviando arquivos · {progresso}%
              </p>
            </div>
          )}

          {erro && <p className="text-xs font-bold text-rose-500">{erro}</p>}

          {falhas.length > 0 && (
            <div className="border border-rose-500/30 bg-rose-500/5 rounded-2xl p-3 space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                {falhas.length} arquivo(s) não importado(s)
              </p>
              {falhas.map((f, i) => (
                <p key={i} className="text-[11px] font-medium text-muted-foreground">
                  <span className="font-bold text-foreground">{f.arquivo}</span>: {f.erro}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={enviando}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            onClick={enviar}
            disabled={enviando}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Importar {arquivos.length > 0 ? `(${arquivos.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
