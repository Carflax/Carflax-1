import { BriefcaseBusiness } from "lucide-react";
import { TriagemView } from "./triagem/TriagemView";

interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  role: string;
}

interface RhViewProps {
  activeTab: string;
  userProfile?: UserProfile | null;
}

export function RhView({ activeTab, userProfile }: RhViewProps) {
  if (activeTab === "Triagem") {
    return <TriagemView userProfile={userProfile} />;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-background h-full">
      <div className="text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <BriefcaseBusiness className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-3 uppercase tracking-tighter">
          RH · {activeTab}
        </h2>
        <p className="text-muted-foreground font-medium max-w-md mx-auto">
          Esta subcategoria de RH ainda está em desenvolvimento.
        </p>
      </div>
    </div>
  );
}
