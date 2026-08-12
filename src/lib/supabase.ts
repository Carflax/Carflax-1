import { createClient } from "@supabase/supabase-js";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_URL_DIRECT = import.meta.env.VITE_SUPABASE_URL;

// Usa sempre a URL direta para o cliente Supabase.
// O proxy do Vite (/supabase) era usado para contornar CORS em PATCH/DELETE,
// mas ele quebra o WebSocket do Realtime — o canal cai em loop porque o Vite
// não faz proxy de conexões WebSocket corretamente.
const SUPABASE_URL = SUPABASE_URL_DIRECT;

if (!SUPABASE_ANON_KEY || !SUPABASE_URL) {
  console.error("Missing Supabase environment variables!");
}

export const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "");

// Limpa automaticamente sessões com refresh token inválido/expirado.
// Sem isso, o Supabase fica tentando renovar o token em loop, gerando erros repetidos.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED" && !session) {
    supabase.auth.signOut();
  }
});

// Captura erros globais de token inválido e limpa a sessão
supabase.auth.getSession().then(({ error }) => {
  if (error?.message?.includes("Refresh Token Not Found") || error?.message?.includes("Invalid Refresh Token")) {
    console.warn("[Auth] Token de sessão inválido detectado. Limpando sessão...");
    supabase.auth.signOut();
  }
});

