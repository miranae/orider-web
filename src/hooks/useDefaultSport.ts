import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { Discipline } from "../utils/disciplineFilter";

const VALID: Discipline[] = ["tri", "bike", "run", "swim"];
/**
 * 구버전 번들이 남긴 계정 비귀속 키. 현재 코드에는 **쓰기가 없어** 값은 항상 낡았는데,
 * localStorage 는 브라우저 단위라 계정 전환·관리자 위임 로그인 시 앞 사용자의 종목이
 * 다음 사용자에게 그대로 적용됐다(러닝 사용자에게 사이클 피드만 노출). 읽지 않고 지운다.
 */
const LEGACY_SPORT_KEY = "lastSport";

function dropLegacyStoredSport(): void {
  try {
    localStorage.removeItem(LEGACY_SPORT_KEY);
  } catch {
    // 스토리지가 막힌 환경 — 어차피 읽지 않으므로 그대로 진행한다.
  }
}

export function useDefaultSport(activities?: { type: string; startTime: number }[]): Discipline {
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  dropLegacyStoredSport();

  // 1. URL ?sport= (명시적)
  const urlSport = searchParams.get("sport") as Discipline | null;
  if (urlSport && VALID.includes(urlSport)) return urlSport;

  // 2. profile.primaryDiscipline — 계정에 귀속된 값이라 브라우저를 공유해도 섞이지 않는다.
  if (profile?.primaryDiscipline) return profile.primaryDiscipline;

  // 3. 최근 30일 활동 빈도
  if (activities && activities.length > 0) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = activities.filter(a => a.startTime > thirtyDaysAgo);
    const counts = { bike: 0, run: 0, swim: 0 };
    for (const a of recent) {
      const t = (a.type || '').toLowerCase();
      if (t.includes('run') || t.includes('walk') || t.includes('hike')) counts.run++;
      else if (t.includes('swim')) counts.swim++;
      else if (t.includes('ride') || t.includes('cycling') || t.includes('bike')) counts.bike++;
      // 미인식 타입 (yoga, weight 등)은 skip
    }
    const max = Math.max(counts.bike, counts.run, counts.swim);
    if (max > 0) {
      if (counts.bike === max) return "bike";
      if (counts.run === max) return "run";
      return "swim";
    }
  }

  // 4. fallback
  return "bike";
}
