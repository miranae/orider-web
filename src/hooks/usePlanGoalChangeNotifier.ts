import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { notifyPlanGoalChanged } from "../embedded/planGoalChanges";

/** 목표 생성·포기·재계획 성공 직후 호출한다 — 계획 캐시를 버리고 열린 계획 화면을 다시 읽게 한다. */
export function usePlanGoalChangeNotifier() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  return useCallback((sport: string) => {
    if (!user || user.isAnonymous) return;
    notifyPlanGoalChanged(user.uid, sport, i18n.resolvedLanguage ?? i18n.language);
  }, [user, i18n]);
}
