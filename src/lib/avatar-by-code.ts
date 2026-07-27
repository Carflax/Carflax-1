// Resolve avatares de usuários por código de operador de forma resistente à
// colisão de zeros à esquerda.
//
// Contexto: no ERP convivem namespaces de código diferentes com o mesmo número.
// Ex.: o vendedor João é operador "050" e o motorista Rodrigo é "00050". Os dois
// existem na tabela `usuarios` com códigos distintos, mas quando o app normaliza
// tirando zeros à esquerda (replace(/^0+/, "")) ambos viram "50" — aí um mapa
// avatar[normCod] sobrescreve o outro e a foto sai trocada.
//
// Estratégia: casar SEMPRE pelo código exato primeiro. O código normalizado é só
// um fallback (para quando o padding da origem difere do cadastro) e é descartado
// quando é ambíguo — dois códigos exatos distintos que caem no mesmo número.

export interface UserAvatarRow {
  operator_code?: string | null;
  avatar?: string | null;
}

const stripZeros = (s: string) => s.replace(/^0+/, "") || s;

export type AvatarResolver = (code?: string | null) => string | undefined;

export function buildAvatarResolver(rows: UserAvatarRow[]): AvatarResolver {
  const exact = new Map<string, string>();
  const normAvatar = new Map<string, string>();
  const normCodes = new Map<string, Set<string>>(); // norm -> códigos exatos distintos

  for (const u of rows || []) {
    const code = String(u.operator_code ?? "").trim();
    if (!code || !u.avatar) continue;
    exact.set(code, u.avatar);
    const n = stripZeros(code);
    if (!normCodes.has(n)) normCodes.set(n, new Set());
    normCodes.get(n)!.add(code);
    normAvatar.set(n, u.avatar);
  }

  return (code) => {
    const c = String(code ?? "").trim();
    if (!c) return undefined;
    if (exact.has(c)) return exact.get(c);
    const n = stripZeros(c);
    // Fallback normalizado só quando não é ambíguo (um único código exato).
    if ((normCodes.get(n)?.size ?? 0) === 1) return normAvatar.get(n);
    return undefined;
  };
}
