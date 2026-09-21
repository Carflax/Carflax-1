// Dias da semana e resumo legível da programação (ad schedule) do Google Ads.
import type { TrafegoDia, TrafegoProgramacao } from "@/lib/api";

export const DIAS: { id: TrafegoDia; curto: string; letra: string }[] = [
  { id: "MONDAY", curto: "Seg", letra: "S" },
  { id: "TUESDAY", curto: "Ter", letra: "T" },
  { id: "WEDNESDAY", curto: "Qua", letra: "Q" },
  { id: "THURSDAY", curto: "Qui", letra: "Q" },
  { id: "FRIDAY", curto: "Sex", letra: "S" },
  { id: "SATURDAY", curto: "Sáb", letra: "S" },
  { id: "SUNDAY", curto: "Dom", letra: "D" },
];
const hora = (h: number) => (Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);

/** "Seg–Sex 9h–17h · Sáb 8h–11h" a partir da lista de faixas do Google. */
export function resumoProgramacao(p: TrafegoProgramacao[] | undefined) {
  if (!p || p.length === 0) return "Todos os dias, 24h";
  const porHorario = new Map<string, number[]>();
  for (const f of p) {
    const k = `${f.inicio}-${f.fim}`;
    const idx = DIAS.findIndex((d) => d.id === f.dia);
    porHorario.set(k, [...(porHorario.get(k) || []), idx]);
  }
  const partes: string[] = [];
  for (const [k, idxs] of porHorario) {
    const [ini, fim] = k.split("-").map(Number);
    const ord = [...new Set(idxs)].sort((a, b) => a - b);
    const grupos: string[] = [];
    let s = ord[0];
    for (let i = 1; i <= ord.length; i++) {
      if (ord[i] !== ord[i - 1] + 1) {
        const e = ord[i - 1];
        grupos.push(s === e ? DIAS[s].curto : `${DIAS[s].curto}–${DIAS[e].curto}`);
        s = ord[i];
      }
    }
    partes.push(`${grupos.join(", ")} ${ini === 0 && fim === 24 ? "24h" : `${hora(ini)}–${hora(fim)}`}`);
  }
  return partes.join(" · ");
}

/** Dias da semana em que a campanha roda (para as bolinhas S T Q Q S S D). */
export function diasAtivos(p: TrafegoProgramacao[] | undefined) {
  if (!p || p.length === 0) return new Set(DIAS.map((d) => d.id));
  return new Set(p.map((f) => f.dia));
}
