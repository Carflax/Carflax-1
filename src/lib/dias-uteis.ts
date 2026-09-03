/**
 * Dias úteis e feriados — base de todo cálculo de ritmo do HUB.
 *
 * Vive aqui, e não dentro de uma tela, porque duas partes precisam da MESMA
 * conta: o card do vendedor no Dashboard Geral e o Ranking do Dia. Quando a
 * lógica estava só no RightPanelComponents, o Ranking calculava a meta diária
 * por conta própria (dias corridos úteis, sem feriado, contando hoje) e chegava
 * a R$ 7.898 onde o card mostrava R$ 8.776 — o mesmo vendedor com duas metas
 * diferentes em duas telas.
 */

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Domingo de Páscoa (algoritmo de Meeus/Butcher) — base p/ Sexta-feira Santa. */
const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mth = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mth + 114) / 31);
  const day = ((h + l - 7 * mth + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

// Feriados que fecham a loja e NÃO contam como dia útil: nacionais oficiais +
// Sexta-feira Santa (móvel) + 09/07 (Revolução Constitucionalista, estadual SP).
// Carnaval e Corpus Christi são pontos facultativos — adicione aqui se a loja fechar.
const feriadosCache: Record<number, Set<string>> = {};

export const getFeriados = (year: number): Set<string> => {
  if (feriadosCache[year]) return feriadosCache[year];
  const set = new Set<string>([
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-07-09`, // Revolução Constitucionalista (SP)
    `${year}-09-07`, // Independência
    `${year}-10-12`, // N. Sra. Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra
    `${year}-12-25`, // Natal
  ]);
  const goodFriday = getEasterSunday(year);
  goodFriday.setDate(goodFriday.getDate() - 2); // Sexta-feira Santa
  set.add(toISODate(goodFriday));
  feriadosCache[year] = set;
  return set;
};

export const isDiaUtil = (d: Date, feriados: Set<string>) => {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6 && !feriados.has(toISODate(d));
};

/** Total de dias úteis do mês de `ref`. */
export const getDiasUteisNoMes = (ref: Date = new Date()) => {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const feriados = getFeriados(y);
  const lastDay = new Date(y, m + 1, 0).getDate();
  let count = 0;
  for (let i = 1; i <= lastDay; i++) {
    if (isDiaUtil(new Date(y, m, i), feriados)) count++;
  }
  return count;
};

/**
 * Dias úteis restantes a partir do dia SEGUINTE ao de `ref`.
 *
 * O dia corrente não entra: ele já está sendo trabalhado, e o "diário" responde
 * "quanto preciso vender por dia daqui pra frente". Mês encerrado devolve 0.
 */
export const getDiasUteisRestantes = (ref: Date = new Date()) => {
  const y = ref.getFullYear();
  const feriados = getFeriados(y);
  const end = new Date(y, ref.getMonth() + 1, 0);
  const hoje = new Date();
  const mesEncerrado =
    y < hoje.getFullYear() || (y === hoje.getFullYear() && ref.getMonth() < hoje.getMonth());
  if (mesEncerrado) return 0;

  const start = new Date(y, ref.getMonth(), ref.getDate() + 1);
  let count = 0;
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    if (isDiaUtil(dt, feriados)) count++;
  }
  return count;
};

/**
 * Meta diária: o que falta dividido pelos dias úteis restantes.
 *
 * É a mesma conta do "Diário" no card do vendedor. Mês encerrado devolve 0 —
 * não existe "quanto preciso vender por dia" quando não há mais dia.
 */
export const calcMetaDiaria = (faltante: number, ref: Date = new Date()) => {
  const restantes = getDiasUteisRestantes(ref);
  if (restantes <= 0) return 0;
  return Math.max(0, faltante / restantes);
};
