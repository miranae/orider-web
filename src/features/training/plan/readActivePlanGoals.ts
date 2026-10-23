import { collection, getDocs, limit, query, where, type Firestore } from "firebase/firestore";
import type { Goal } from "@shared/types/goal";

type PlanSport = "bike" | "run" | "swim";

/** Preserve the plan page's existing legacy fallback; callers still check goal discipline. */
export async function readPreferredActiveGoal(store: Firestore, uid: string, sport: PlanSport): Promise<Goal | null> {
  let result = await getDocs(query(collection(store, "goals"), where("userId", "==", uid), where("status", "==", "active"), where("discipline", "==", sport), limit(1)));
  if (result.empty) result = await getDocs(query(collection(store, "goals"), where("userId", "==", uid), where("status", "==", "active"), limit(1)));
  const first = result.docs[0];
  return first ? { id: first.id, ...first.data() } as Goal : null;
}

/** The all-sport record calendar must not imply that an arbitrary first active goal is every plan. */
export async function readActivePlanGoals(store: Firestore, uid: string): Promise<Goal[]> {
  const result = await getDocs(query(collection(store, "goals"), where("userId", "==", uid), where("status", "==", "active")));
  return result.docs.map(document => ({ id: document.id, ...document.data() }) as Goal);
}
