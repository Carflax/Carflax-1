import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { salvarConfig } from "./posvenda-service";
import { inputCls, labelCls, type HubUser, type PosVendaConfig } from "./types";

interface Props {
  config: PosVendaConfig;
  usuarios: HubUser[];
  userId?: string;
  onClose: () => void;
  onSaved: (c: PosVendaConfig) => void;
}

export function ConfigModal({ config, usuarios, userId, onClose, onSaved }: Props) {
  const [c, setC] = useState<PosVendaConfig>(config);
  const [salvando, setSalvando] = useState(false);

  const set = <K extends keyof PosVendaConfig>(k: K, v: PosVendaConfig[K]) => setC((p) => ({ ...p, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfig(c, userId);
      onSaved(c);
    } catch (err) {
      console.error("[PosVenda] salvar config:", err);
      alert("Erro ao salvar as configurações.");
    } finally {
      setSalvando(false);
    }
  };

  // Funções de render (não componentes): componente declarado aqui dentro remontaria
  // a cada tecla e o campo perderia o foco.
  const pessoa = (k: "gestor_b2b" | "gestor_b2c" | "supervisor_b2b" | "supervisor_b2c", label: string) => (
    <div key={k} className="space-y-1">
      <p className={labelCls}>{label}</p>
      <select className={inputCls} value={c[k] || ""} onChange={(e) => set(k, e.target.value || null)}>
        <option value="">Não definido</option>
        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role ? ` · ${u.role}` : ""}</option>)}
      </select>
    </div>
  );

  const numero = (k: keyof PosVendaConfig, label: string, sufixo: string) => (
    <div key={k} className="space-y-1">
      <p className={labelCls}>{label}</p>
      <div className="flex items-center gap-2">
        <input type="number" min={0} className={inputCls} value={c[k] as number} onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0) as never)} />
        <span className="text-xs text-muted-foreground shrink-0">{sufixo}</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl max-h-[90vh] bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-black tracking-tight">Configurações do pós-venda</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section className="space-y-3">
            <p className="text-xs font-black">Quem aprova a lista diária</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {pessoa("gestor_b2b", "Gestor B2B")}
              {pessoa("gestor_b2c", "Gestor B2C")}
            </div>
          </section>
          <section className="space-y-3">
            <p className="text-xs font-black">Quem recebe os alertas de insatisfeito e crítico</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {pessoa("supervisor_b2b", "Supervisor B2B")}
              {pessoa("supervisor_b2c", "Supervisor B2C")}
            </div>
          </section>
          <section className="space-y-3">
            <p className="text-xs font-black">Quem entra na lista</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {numero("recorrencia_pedidos", "Recorrente a partir de", "pedidos")}
              {numero("recorrencia_dias", "…nos últimos", "dias")}
              {numero("pouco_historico_pedidos", "Pouco histórico: até", "pedidos em 12 meses")}
              {numero("dias_sem_recontato", "Não ligar de novo por", "dias")}
            </div>
            <p className="text-[11px] text-muted-foreground">Mudanças valem para as próximas listas geradas. Listas já geradas não são recalculadas.</p>
          </section>
          <section className="space-y-3">
            <p className="text-xs font-black">Ligações e prazos</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {numero("max_tentativas", "Máx. tentativas", "ligações")}
              {numero("prazo_critico_dias", "Prazo crítico", "dia(s)")}
              {numero("prazo_insatisfeito_dias", "Prazo insatisfeito", "dia(s)")}
            </div>
          </section>
        </div>
        <div className="p-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-secondary font-bold text-xs rounded-2xl border border-border">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-xs rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2">
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
