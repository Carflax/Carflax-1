import { useEffect } from "react";
import { WhatsappView, type WhatsappApi } from "./WhatsappView";
import { evolutionGoApi, setGoRealtimeVendedor } from "@/lib/evolution-go";

interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  role: string;
  avatar?: string;
  operator_code?: string;
  operatorCode?: string;
}

// Vendedor associado à instância GO ("Danilo" / 5511949470039). As mensagens do
// 039 são gravadas no Supabase com este vendedor_id (via webhook do GO), então
// usamos ele para filtrar o realtime e a lista de conversas — sem misturar com o
// comercial (Evolution v2).
const GO_VENDEDOR_ID = "9f964cf4-23db-459b-bcfd-43063df685d7";

// WhatsApp GO — mesma tela do WhatsappView, injetando o cliente Evolution GO.
// O design é idêntico; muda só o provider (envio pelo GO, realtime via Supabase).
export function WhatsappGoView({ userProfile }: { userProfile?: UserProfile | null }) {
  useEffect(() => {
    setGoRealtimeVendedor(GO_VENDEDOR_ID);
    return () => setGoRealtimeVendedor(null);
  }, []);

  return (
    <WhatsappView
      api={evolutionGoApi as unknown as WhatsappApi}
      vendedorId={GO_VENDEDOR_ID}
      userProfile={userProfile}
    />
  );
}
