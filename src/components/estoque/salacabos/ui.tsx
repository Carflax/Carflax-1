import { createPortal } from "react-dom";
import { Loader2, Search } from "lucide-react";

// Peças visuais compartilhadas pelas abas de Estoque › Cabos.

export function Carregando() {
  return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{texto}</p>;
}

export function Filtro({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-56">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );
}

// Os filtros de cada aba ficam na linha das abas, no cabeçalho da tela. Sem
// cabeçalho (aba reaproveitada em outra tela), aparecem no topo da própria aba.
export function BarraFiltros({ alvo, children }: { alvo?: HTMLElement | null; children: React.ReactNode }) {
  if (alvo) return createPortal(children, alvo);
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
