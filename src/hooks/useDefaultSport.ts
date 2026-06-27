import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { Discipline } from "../utils/disciplineFilter";

const VALID: Discipline[] = ["tri", "bike", "run", "swim"];

export function useDefaultSport(activities?: { type: string; startTime: number }[]): Discipline {
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  // 1. URL ?sport= (명시적)
  const urlSport = searchParams.get("sport") as Discipline | null;
  if (urlSport && VALID.includes(urlSport)) return urlSport;

  // 2. localStorage lastSport (세션 지속)
  const stored = localStorage.getItem("lastSport") as Discipline | null;
  if (stored && VALID.includes(stored)) return stored;

  // 3. profile.primaryDiscipline
  if (profile?.primaryDiscipline) return profile.primaryDiscipline;

  // 4. 최근 30일 활동 빈도
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

  // 5. fallback
  return "bike";
}
