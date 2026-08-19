import { WhatsappView, type WhatsappApi } from "./WhatsappView";
import { whatsappOfficialApi } from "@/lib/whatsapp-official-api";

interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  role: string;
  avatar?: string;
  operator_code?: string;
  operatorCode?: string;
}

// Whatsapp API — mesma tela (design) do WhatsappView, usando EXCLUSIVAMENTE a API
// Oficial do WhatsApp (Meta Cloud API), sem nenhuma dependência do Evolution/GO.
// Envio pelo backend `/api/whatsapp/send`, realtime/histórico pelo Supabase.
export function WhatsappApiView({ userProfile }: { userProfile?: UserProfile | null }) {
  return (
    <WhatsappView
      api={whatsappOfficialApi as unknown as WhatsappApi}
      vendedorId={userProfile?.id}
      userProfile={userProfile}
    />
  );
}
