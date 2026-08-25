import { supabase } from "./supabase";
import { apiDashboardGeral } from "./api";

let isAutomationRunning = false;
const DAILY_KEY = "carflax-goal-automation-date";

export async function runAnnouncementAutomation() {
  if (isAutomationRunning) {
    return { birthdays: 0, workAnniversaries: 0, events: 0, goals: 0 };
  }

  const todayStr = new Date().toISOString().split("T")[0];
  try {
    if (localStorage.getItem(DAILY_KEY) === todayStr) {
      return { birthdays: 0, workAnniversaries: 0, events: 0, goals: 0 };
    }
  } catch {}

  isAutomationRunning = true;

  const results = {
    birthdays: 0,
    workAnniversaries: 0,
    events: 0,
    goals: 0
  };

  try {
    results.goals = await checkAndPostGoalAchievements();
    try { localStorage.setItem(DAILY_KEY, todayStr); } catch {}
    return results;
  } catch (error) {
    console.error("Error in announcement automation:", error);
    return results;
  } finally {
    isAutomationRunning = false;
  }
}

async function checkAndPostGoalAchievements() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dataStr = `${year}-${month}-${day}`;
  const mesAno = `${month}/${year}`;

  try {
    const metrics = await apiDashboardGeral(undefined, dataStr);
    if (!metrics || metrics.length === 0) return 0;

    let postsCreated = 0;
    const winners = metrics.filter(m => {
      const faturado = Number(m.FATURADO || 0);
      const meta = Number(m.META || 0);
      return meta > 0 && faturado >= meta;
    });

    for (const winner of winners) {
      const sellerName = winner.NOME_VENDEDOR.toUpperCase();
      const postTitle = `META BATIDA: ${sellerName} - ${mesAno} 🏆`;

      const { data: existing } = await supabase
        .from("comunicados")
        .select("id")
        .eq("titulo", postTitle)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Busca avatar E id do usuário pelo operator_code
      const { data: userData } = await supabase
        .from("usuarios")
        .select("id, avatar")
        .eq("operator_code", String(winner.COD_VENDEDOR))
        .maybeSingle();

      await supabase.from("comunicados").insert([{
        titulo: postTitle,
        descricao: `É com imenso orgulho que anunciamos: ${winner.NOME_VENDEDOR} ACABA DE BATER A META DE ${mesAno}! 🚀✨\n\nParabéns por todo o empenho, resiliência e foco nos resultados. Você é um exemplo de excellence para toda a equipe Carflax. Que essa conquista seja apenas o começo de um mês extraordinário! Vamos pra cima! 🥂👊`,
        filtro: "Empresa",
        image_url: userData?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${winner.NOME_VENDEDOR}`,
        tag: "Carflax",
        likes: 0,
        liked_by: [],
        // Vincula o vendedor homenageado para que ele receba notificações de likes e comentários
        tagged_user_id: userData?.id || null,
      }]);
      postsCreated++;
    }
    return postsCreated;
  } catch (error) {
    console.error("Error in goal automation:", error);
    return 0;
  }
}
