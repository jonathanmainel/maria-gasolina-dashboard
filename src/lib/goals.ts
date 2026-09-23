import { defaultManualData, useManualData } from "./manual-inputs";
import type { Goals } from "../types";

// As metas deixaram de viver só no localStorage deste navegador: agora são um
// escopo do bloco de dados manuais persistido no Supabase (ver `manual-inputs.ts`),
// com o localStorage apenas como fallback. A leitura continua sendo um hook
// simples, para não mexer nas telas que já dependiam dela.

export const defaultGoals: Goals = defaultManualData.goals;

export function useGoals(): Goals {
  return useManualData().data.goals;
}
