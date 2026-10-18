import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, firestore, functions } from "./firebase";
import {
  parseTodayWorkoutChoice,
  type TodayWorkoutChoice,
  type TodayWorkoutChoiceDiscipline,
  type TodayWorkoutChoiceType,
} from "./todayWorkoutChoiceContract";

export function subscribeTodayWorkoutChoice(
  uid: string,
  discipline: TodayWorkoutChoiceDiscipline,
  onChange: (choice: TodayWorkoutChoice | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(firestore, "users", uid, "today_choices", discipline),
    (snapshot) => onChange(snapshot.exists() ? parseTodayWorkoutChoice(snapshot.data(), discipline) : null),
    onError,
  );
}

/** null 이면 오늘 선택을 지운다. 날짜·부하는 서버가 정한다. */
export async function saveTodayWorkoutChoice(
  discipline: TodayWorkoutChoiceDiscipline,
  workoutType: TodayWorkoutChoiceType | null,
): Promise<TodayWorkoutChoice | null> {
  await ensureAppCheckReady();
  const call = httpsCallable<{ discipline: TodayWorkoutChoiceDiscipline; workoutType: TodayWorkoutChoiceType | null }, { choice: unknown }>(
    functions, "setTodayWorkoutChoice");
  const result = await call({ discipline, workoutType });
  return result.data.choice == null ? null : parseTodayWorkoutChoice(result.data.choice, discipline);
}
