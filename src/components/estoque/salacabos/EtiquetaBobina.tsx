import { useEffect } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Printer, X } from "lucide-react";
import { EMPRESAS, fmtMetros, numeroBobina, type Bobina } from "./sala-cabos-api";

/**
 * Etiqueta para colar na bobina: número grande (digitável no tablet) + QR com o
 * mesmo número, que um leitor de código de barras USB lê direto no campo.
 * Impressão via navegador: só a etiqueta vai para o papel.
 */
export function EtiquetaBobina({ bobinas, onClose }: { bobinas: Bobina[]; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add("imprimindo-etiqueta");
    return () => document.body.classList.remove("imprimindo-etiqueta");
  }, []);

  return createPortal(
    <div className="etiqueta-bobina-root fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 print:static print:bg-white print:p-0 print:block">
      <style>{`
        @media print {
          body.imprimindo-etiqueta > *:not(.etiqueta-bobina-root) { display: none !important; }
          .etiqueta-pagina { page-break-after: always; }
          @page { size: 100mm 60mm; margin: 0; }
        }
      `}</style>
      <div className="bg-card rounded-2xl shadow-2xl max-h-full overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:rounded-none print:bg-white">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border print:hidden">
          <p className="text-sm font-black">{bobinas.length > 1 ? `${bobinas.length} etiquetas` : "Etiqueta da bobina"}</p>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-4 space-y-4 print:p-0 print:space-y-0">
          {bobinas.map((b) => (
            <div key={b.id} className="etiqueta-pagina w-[100mm] h-[60mm] bg-white text-black border border-dashed border-gray-400 print:border-0 p-[4mm] flex gap-[4mm] items-center">
              <QRCodeSVG value={numeroBobina(b.numero)} size={150} className="w-[36mm] h-[36mm] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[26pt] leading-none font-black tracking-tight">{numeroBobina(b.numero)}</p>
                <p className="text-[9pt] font-bold leading-tight mt-[2mm] line-clamp-3">{b.descricao}</p>
                <p className="text-[8pt] mt-[1.5mm]">Cód. {b.cod_produto} · {EMPRESAS[b.empresa] ?? b.empresa}</p>
                <p className="text-[8pt]">Entrada: {fmtMetros(b.metragem_inicial)} · {new Date(b.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
