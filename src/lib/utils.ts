import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fuso horário oficial do HUB — sempre Brasília, independente do relógio do computador. */
export const BR_TIMEZONE = "America/Sao_Paulo";

/** Formata a hora (HH:mm) no fuso de Brasília. */
export function formatBrTime(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BR_TIMEZONE });
}

/** Formata a data (dd/mm/aaaa) no fuso de Brasília. */
export function formatBrDate(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: BR_TIMEZONE });
}

/** Mapeia nomes de times de supervisores para nomes personalizados no HUB (ex: João -> Canal Mesa, Alan -> Canal Balcão). */
// Conectivos que não ajudam a identificar ninguém e só ocupam espaço.
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);
// Sufixos societários — irrelevantes para reconhecer a empresa num cabeçalho.
const SUFIXOS_EMPRESA = new Set(["ltda", "me", "epp", "eireli", "sa", "s/a", "s.a", "cia"]);

/**
 * Encurta um nome para caber em espaços apertados (cabeçalho de chat, chips).
 * Pessoa: primeiro nome + último sobrenome ("TATIANE MARIA N DA SILVA SOUZA" →
 * "TATIANE SOUZA"). Empresa: as duas primeiras palavras, sem o tipo societário
 * ("ARBORE ENGENHARIA LTDA" → "ARBORE ENGENHARIA").
 */
export function shortenName(nome?: string | null, maxPalavras = 2): string {
  const bruto = String(nome || "").trim();
  if (!bruto) return "";

  const palavras = bruto
    .split(/\s+/)
    .filter((p) => !SUFIXOS_EMPRESA.has(p.toLowerCase().replace(/[.]/g, "")));
  // Iniciais soltas ("N", "J.") não identificam ninguém.
  const uteis = palavras.filter((p) => !CONECTIVOS.has(p.toLowerCase()) && p.replace(/\W/g, "").length > 1);
  const base = uteis.length > 0 ? uteis : palavras;

  if (base.length <= maxPalavras) return base.join(" ");
  return [base[0], base[base.length - 1]].join(" ");
}

export function formatTeamName(supName?: string | null): string {
  if (!supName) return "Time";
  const norm = supName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (norm.includes("joao")) return "Canal Mesa";
  if (norm.includes("alan")) return "Canal Balcao";
  if (norm.startsWith("canal mesa")) return "Canal Mesa";
  if (norm.startsWith("canal balcao") || norm.startsWith("canal balcão")) return "Canal Balcao";
  const primeiroNome = supName.trim().split(/\s+/)[0];
  return `Time ${primeiroNome}`;
}

