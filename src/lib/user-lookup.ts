// Resolve um usuário do HUB a partir do que o ERP fornece: um código de operador,
// um nome, ou os dois — e frequentemente nenhum dos dois no formato do cadastro.
//
// Dois desencontros motivam este módulo:
//
// 1. Zeros à esquerda. O ERP manda "021", o cadastro pode ter "21" (e vice-versa).
//    Casar por igualdade exata perde a pessoa; casar por número puro troca uma
//    pessoa pela outra — o vendedor "050" e o motorista "00050" existem os dois.
//    Regra: exato primeiro; normalizado só quando não é ambíguo.
//
// 2. Nome. O ERP guarda o nome completo de RH ("TATIANE MARIA N DA SILVA SOUZA"),
//    o HUB guarda o nome de uso ("Tatiane Souza"). Nenhum `ilike` casa os dois, e
//    acento derruba o resto ("JOAO PEDRO" x "João Pedro"). Casamos por primeiro +
//    último nome, sem acento.
import { supabase } from "./supabase";

export interface UsuarioResolvido {
  id: string;
  name: string;
  avatar: string;
  operator_code: string | null;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

const stripZeros = (s: string) => s.replace(/^0+/, "") || s;

// Conectivos e iniciais soltas não ajudam a identificar ninguém.
const tokensNome = (nome: string) =>
  semAcento(nome)
    .split(/\s+/)
    .filter((p) => p.length > 1 && !["DE", "DA", "DO", "DAS", "DOS", "E"].includes(p));

// A tabela tem poucas dezenas de linhas: buscamos todas uma vez e casamos em JS,
// onde dá para normalizar acento e zero à esquerda — o que o filtro do Postgres
// não faria sem esticar a query.
let cache: { rows: UsuarioResolvido[]; ts: number } | null = null;
let inflight: Promise<UsuarioResolvido[]> | null = null;
const TTL = 5 * 60 * 1000;

async function carregarUsuarios(): Promise<UsuarioResolvido[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.rows;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, name, avatar, operator_code");
      if (error || !data) return cache?.rows ?? [];
      const rows = data as UsuarioResolvido[];
      cache = { rows, ts: Date.now() };
      return rows;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Casamento puro (sem I/O), para ser testável e reutilizável sobre listas já carregadas. */
export function casarUsuario(
  usuarios: UsuarioResolvido[],
  codigo?: string | null,
  nome?: string | null
): UsuarioResolvido | null {
  const cod = String(codigo ?? "").trim();
  const nom = String(nome ?? "").trim();
  if (!cod && !nom) return null;
  if (usuarios.length === 0) return null;

  if (cod) {
    const exato = usuarios.find((u) => String(u.operator_code ?? "").trim() === cod);
    if (exato) return exato;

    // Normalizado só se um único usuário cai nesse número (ver 050 x 00050).
    const alvo = stripZeros(cod);
    const candidatos = usuarios.filter(
      (u) => u.operator_code && stripZeros(String(u.operator_code).trim()) === alvo
    );
    if (candidatos.length === 1) return candidatos[0];
  }

  if (nom) {
    // Pontua por quantidade de nomes em comum. "JOAO PEDRO COSME" divide o "JOAO"
    // com "Joao Paulo", mas divide dois nomes com "João Pedro" — quem tem mais
    // nomes em comum vence, e só vale quando não há empate no topo.
    const alvo = new Set(tokensNome(nom));
    if (alvo.size === 0) return null;

    let melhor: UsuarioResolvido | null = null;
    let melhorScore = 0;
    let empatados = 0;

    for (const u of usuarios) {
      const score = tokensNome(u.name || "").filter((t) => alvo.has(t)).length;
      if (score === 0) continue;
      if (score > melhorScore) {
        melhor = u;
        melhorScore = score;
        empatados = 1;
      } else if (score === melhorScore) {
        empatados += 1;
      }
    }

    if (melhor && empatados === 1) return melhor;
  }

  return null;
}

export async function resolverUsuario(
  codigo?: string | null,
  nome?: string | null
): Promise<UsuarioResolvido | null> {
  if (!String(codigo ?? "").trim() && !String(nome ?? "").trim()) return null;
  return casarUsuario(await carregarUsuarios(), codigo, nome);
}
